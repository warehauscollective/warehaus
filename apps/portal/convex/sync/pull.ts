import {
  INCREMENTAL_OVERLAP_MS,
  capStoredRetries,
  decidePullWatermark,
  dueRetryIds,
  mapNotionClient,
  mapNotionClientDoc,
  mapNotionContact,
  mapNotionProject,
  mapNotionSharedResource,
  mapNotionTask,
  decideSyncedRowVisibility,
  pageEditedAtMs,
  parsePullRetries,
  recordPageFailure,
  refreshUnseenRetries,
  shouldDeferPageRetry,
  type FailedPageRetry,
  type PageProcessOutcome,
  type VisibilityDecision,
} from '@warehaus/portal-sync';
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { internalAction } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { copyNotionFileToBlob } from './blob';
import { fetchSafeDocBody } from './docBody';
import {
  fetchNotionPage,
  queryAllDataSourcePages,
  SYNC_SOURCES,
  writeSharedResourceUrl,
  type NotionPageRow,
} from './notionApi';

export type PullStats = {
  upserted: Record<string, number>;
  skipped: number;
  quarantined: number;
  blobCopied: number;
  blobSkipped: number;
  urlWritebacks: number;
  deferred: number;
  failed: number;
  concealed: number;
  mode: 'full' | 'incremental';
  editedSinceIso: string | null;
  errors: string[];
};

type IdMaps = {
  clientByNotion: Record<string, Id<'clients'>>;
  clientEnabledByNotion: Record<string, boolean>;
  projectByNotion: Record<string, Id<'projects'>>;
  projectOrgByNotion: Record<string, Id<'clients'>>;
  projectVisibleByNotion: Record<string, boolean>;
};

type SyncedTable = 'clients' | 'contacts' | 'projects' | 'tasks' | 'sharedResources' | 'clientDocs';

function mergePages(live: NotionPageRow[], archived: NotionPageRow[]): NotionPageRow[] {
  const byId = new Map<string, NotionPageRow>();
  for (const page of live) byId.set(page.id, page);
  for (const page of archived) {
    const prev = byId.get(page.id);
    if (!prev) byId.set(page.id, page);
    else byId.set(page.id, { ...prev, archived: true, inTrash: prev.inTrash || page.inTrash });
  }
  return [...byId.values()];
}

async function concatDueRetries(
  database: string,
  pages: NotionPageRow[],
  priorRetries: FailedPageRetry[],
  nowMs: number,
): Promise<{ pages: NotionPageRow[]; missingIds: string[] }> {
  const present = new Set(pages.map((page) => page.id));
  const ids = dueRetryIds({
    prior: priorRetries,
    database,
    alreadyPresent: present,
    nowMs,
  });
  if (ids.length === 0) return { pages, missingIds: [] };
  const extra: NotionPageRow[] = [];
  const missingIds: string[] = [];
  for (const id of ids) {
    const page = await fetchNotionPage(id);
    if (page) extra.push(page);
    else missingIds.push(id);
  }
  return { pages: extra.length ? [...pages, ...extra] : pages, missingIds };
}

async function loadSourcePages(
  database: string,
  sourceId: string,
  pageOpts: { editedSinceIso: string | null },
  priorRetries: FailedPageRetry[],
  nowMs: number,
  onError: (message: string) => void,
): Promise<{ pages: NotionPageRow[]; missingIds: string[]; archivedOk: boolean }> {
  const live = await queryAllDataSourcePages(sourceId, pageOpts);
  let archivedOk = true;
  let archived: NotionPageRow[] = [];
  try {
    archived = await queryAllDataSourcePages(sourceId, { ...pageOpts, archived: true });
  } catch (err) {
    archivedOk = false;
    onError(
      `archived query ${database}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const merged = mergePages(live, archived);
  const loaded = await concatDueRetries(database, merged, priorRetries, nowMs);
  return { ...loaded, archivedOk };
}

/**
 * Allowlisted pull: Notion → Convex.
 * Incremental when `notion-pull` syncMeta exists (last_edited_time filter);
 * pass `forceFull: true` or unset meta for a full scan.
 * A page that fails to process does not advance the cursor past that edit.
 * Order: clients → contacts → projects → tasks → sharedResources → clientDocs.
 */
export const pullAll = internalAction({
  args: {
    forceFull: v.optional(v.boolean()),
    /** Set by the Notion webhook so the syncEvents row can be closed. */
    eventId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<PullStats> => {
    const stats: PullStats = {
      upserted: {
        clients: 0,
        contacts: 0,
        projects: 0,
        tasks: 0,
        sharedResources: 0,
        clientDocs: 0,
      },
      skipped: 0,
      quarantined: 0,
      blobCopied: 0,
      blobSkipped: 0,
      urlWritebacks: 0,
      deferred: 0,
      failed: 0,
      concealed: 0,
      mode: 'full',
      editedSinceIso: null,
      errors: [],
    };

    const now = Date.now();
    let metaDetails: string | undefined;
    let previousWatermark: number | null = null;
    let terminalError: string | undefined;
    const outcomes: PageProcessOutcome[] = [];
    const nextRetries: FailedPageRetry[] = [];
    const seen = new Set<string>();
    let priorRetries: FailedPageRetry[] = [];
    const priorById = new Map<string, FailedPageRetry>();

    const refreshIds = async (): Promise<IdMaps> =>
      ctx.runMutation(internal.sync.upsert.resolveIds, {});

    const conceal = async (
      table: SyncedTable,
      notionPageId: string,
      decision: Extract<VisibilityDecision, { action: 'hide' }>,
    ) => {
      const hidden = await ctx.runMutation(internal.sync.hide.hideSyncedPage, {
        table,
        notionPageId,
        reason: decision.reason,
        detail: decision.detail,
      });
      if (hidden.hidden) stats.concealed += 1;
      const authIds = decision.revokeSessions ? [...hidden.authUserIds] : [];
      if (hidden.orgId && decision.cascade === 'client-children') {
        const child = await ctx.runMutation(internal.sync.hide.hideClientChildren, {
          orgId: hidden.orgId,
        });
        authIds.push(...child.authUserIds);
      }
      if (hidden.projectId && decision.cascade === 'project-tasks') {
        await ctx.runMutation(internal.sync.hide.hideProjectTasks, { projectId: hidden.projectId });
      }
      for (const authUserId of authIds) {
        await ctx.runAction(internal.sync.revokeSessions.revokeUserSessions, { authUserId });
      }
    };

    const noteMissing = async (table: SyncedTable, missingIds: string[]) => {
      for (const id of missingIds) {
        await track(
          { id, lastEdited: '', properties: {}, archived: false, inTrash: true },
          table,
          async () => {
            await conceal(table, id, {
              action: 'hide',
              reason: 'trashed',
              detail: 'Notion page is gone',
              revokeSessions: table === 'contacts',
              cascade: table === 'clients' ? 'client-children' : table === 'projects' ? 'project-tasks' : 'none',
            });
          },
        );
      }
    };

    const hideMissingOnFullPull = async (
      table: SyncedTable,
      pages: NotionPageRow[],
      archivedOk: boolean,
    ) => {
      if (stats.mode !== 'full' || !archivedOk) return;
      const unseen = await ctx.runMutation(internal.sync.hide.hideUnseen, {
        table,
        seenNotionPageIds: pages.map((page) => page.id),
      });
      stats.concealed += unseen.concealed;
      for (const orgId of unseen.clientIds) {
        const child = await ctx.runMutation(internal.sync.hide.hideClientChildren, { orgId });
        for (const authUserId of child.authUserIds) {
          await ctx.runAction(internal.sync.revokeSessions.revokeUserSessions, { authUserId });
        }
      }
      for (const projectId of unseen.projectIds) {
        await ctx.runMutation(internal.sync.hide.hideProjectTasks, { projectId });
      }
      for (const authUserId of unseen.authUserIds) {
        await ctx.runAction(internal.sync.revokeSessions.revokeUserSessions, { authUserId });
      }
    };

    const track = async (
      page: NotionPageRow,
      database: string,
      fn: () => Promise<void>,
    ) => {
      const editedAtMs = pageEditedAtMs(page.lastEdited);
      seen.add(page.id);
      const prior = priorById.get(page.id);
      if (prior && shouldDeferPageRetry(prior, now)) {
        outcomes.push({ id: page.id, editedAtMs, ok: false });
        nextRetries.push(prior);
        stats.deferred += 1;
        return;
      }
      try {
        await fn();
        outcomes.push({ id: page.id, editedAtMs, ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        stats.errors.push(`${database} ${page.id}: ${message}`);
        stats.failed += 1;
        outcomes.push({ id: page.id, editedAtMs, ok: false });
        nextRetries.push(
          recordPageFailure(prior, {
            id: page.id,
            database,
            editedAtMs,
            error: message,
            nowMs: now,
          }),
        );
      }
    };

    try {
      const meta = await ctx.runQuery(internal.sync.upsert.getSyncMeta, {
        key: 'notion-pull',
      });
      metaDetails = meta?.details;
      previousWatermark = typeof meta?.lastSyncedAt === 'number' ? meta.lastSyncedAt : null;
      priorRetries = parsePullRetries(meta?.details);
      for (const retry of priorRetries) priorById.set(retry.id, retry);

      const forceFull = Boolean(args.forceFull) || previousWatermark == null;
      const editedSinceIso = forceFull
        ? null
        : new Date(Math.max(0, previousWatermark! - INCREMENTAL_OVERLAP_MS)).toISOString();
      stats.mode = forceFull ? 'full' : 'incremental';
      stats.editedSinceIso = editedSinceIso;
      const pageOpts = { editedSinceIso };

      // --- Clients ---
      const clientLoaded = await loadSourcePages(
        'clients',
        SYNC_SOURCES.clients,
        pageOpts,
        priorRetries,
        now,
        (message) => stats.errors.push(message),
      );
      await noteMissing('clients', clientLoaded.missingIds);
      for (const page of clientLoaded.pages) {
        await track(page, 'clients', async () => {
        const mapped = mapNotionClient(page.id, page.properties);
        const decision = decideSyncedRowVisibility({
          table: 'clients',
          disposition: mapped.disposition,
          dispositionReason: mapped.disposition === 'upsert' ? undefined : mapped.reason,
          archived: page.archived,
          inTrash: page.inTrash,
        });
        if (decision.action === 'hide') {
          stats.skipped += 1;
          await conceal('clients', page.id, decision);
          return;
        }
        if (decision.action === 'quarantine' || !mapped.row || mapped.row.database !== 'clients') {
          stats.quarantined += 1;
          await ctx.runMutation(internal.sync.upsert.writeQuarantine, {
            notionPageId: page.id,
            database: 'clients',
            reason: mapped.disposition === 'quarantine' ? mapped.reason : 'invalid client map',
          });
          await conceal('clients', page.id, {
            action: 'hide',
            reason: 'gate',
            detail: mapped.disposition === 'quarantine' ? mapped.reason : 'invalid client map',
            revokeSessions: false,
            cascade: 'client-children',
          });
          return;
        }
        const orgId = await ctx.runMutation(internal.sync.upsert.upsertClient, {
          notionPageId: mapped.row.notionPageId,
          companyName: mapped.row.companyName,
          slug: mapped.row.slug,
          status: mapped.row.status,
          portalAccess: mapped.row.portalAccess,
          primaryEmail: mapped.row.primaryEmail,
          phone: mapped.row.phone,
          externalId: mapped.row.externalId,
          source: mapped.row.source,
        });
        await ctx.runMutation(internal.sync.hide.clearAncestorHides, { orgId });
        stats.upserted.clients += 1;
        });
      }
      await hideMissingOnFullPull('clients', clientLoaded.pages, clientLoaded.archivedOk);

      let ids = await refreshIds();

      // --- Contacts ---
      const contactLoaded = await loadSourcePages(
        'contacts',
        SYNC_SOURCES.contacts,
        pageOpts,
        priorRetries,
        now,
        (message) => stats.errors.push(message),
      );
      await noteMissing('contacts', contactLoaded.missingIds);
      for (const page of contactLoaded.pages) {
        await track(page, 'contacts', async () => {
        const mapped = mapNotionContact(page.id, page.properties);
        const clientNotionId = mapped.row?.database === 'contacts' ? mapped.row.clientNotionIds[0] : undefined;
        const decision = decideSyncedRowVisibility({
          table: 'contacts',
          disposition: mapped.disposition,
          dispositionReason: mapped.disposition === 'upsert' ? undefined : mapped.reason,
          archived: page.archived,
          inTrash: page.inTrash,
          parentClientEnabled: clientNotionId ? ids.clientEnabledByNotion[clientNotionId] === true : undefined,
          contactRole: mapped.row?.database === 'contacts' ? mapped.row.role : undefined,
        });
        if (decision.action === 'hide') {
          stats.skipped += 1;
          await conceal('contacts', page.id, decision);
          return;
        }
        if (decision.action === 'quarantine' || !mapped.row || mapped.row.database !== 'contacts') {
          stats.quarantined += 1;
          await ctx.runMutation(internal.sync.upsert.writeQuarantine, {
            notionPageId: page.id,
            database: 'contacts',
            reason: mapped.disposition === 'quarantine' ? mapped.reason : 'invalid contact map',
          });
          await conceal('contacts', page.id, {
            action: 'hide',
            reason: 'gate',
            detail: mapped.disposition === 'quarantine' ? mapped.reason : 'invalid contact map',
            revokeSessions: true,
            cascade: 'none',
          });
          return;
        }
        const orgId = mapped.row.clientNotionIds
          .map((nid) => ids.clientByNotion[nid])
          .find(Boolean);
        if (!orgId) {
          stats.quarantined += 1;
          await ctx.runMutation(internal.sync.upsert.writeQuarantine, {
            notionPageId: page.id,
            database: 'contacts',
            reason: 'Client Company not resolved to a synced client',
          });
          await conceal('contacts', page.id, {
            action: 'hide',
            reason: 'gate',
            detail: 'Client Company not resolved to a synced client',
            revokeSessions: true,
            cascade: 'none',
          });
          return;
        }
        await ctx.runMutation(internal.sync.upsert.upsertContact, {
          notionPageId: mapped.row.notionPageId,
          orgId,
          name: mapped.row.name,
          email: mapped.row.email,
          authUserId: mapped.row.authUserId,
          role: mapped.row.role,
          portalAccess: mapped.row.portalAccess,
          phone: mapped.row.phone,
          externalId: mapped.row.externalId,
          source: mapped.row.source,
          hiddenReason: decision.action === 'store-hidden' ? 'ancestor' : undefined,
        });
        if (decision.action === 'store-hidden') {
          stats.concealed += 1;
          if (decision.revokeSessions) {
            const authUserId = await ctx.runQuery(internal.sync.hide.contactAuthUserId, {
              notionPageId: page.id,
            });
            if (authUserId) {
              await ctx.runAction(internal.sync.revokeSessions.revokeUserSessions, { authUserId });
            }
          }
          return;
        }
        stats.upserted.contacts += 1;
        });
      }
      await hideMissingOnFullPull('contacts', contactLoaded.pages, contactLoaded.archivedOk);

      // --- Projects ---
      const projectLoaded = await loadSourcePages(
        'projects',
        SYNC_SOURCES.projects,
        pageOpts,
        priorRetries,
        now,
        (message) => stats.errors.push(message),
      );
      const projectPass = new Set<string>();
      const projectClientNotion = new Map<string, string>();
      await noteMissing('projects', projectLoaded.missingIds);

      for (const page of projectLoaded.pages) {
        await track(page, 'projects', async () => {
        const mapped = mapNotionProject(page.id, page.properties);
        const clientNotionId = mapped.row?.database === 'projects' ? mapped.row.clientNotionIds[0] : undefined;
        const decision = decideSyncedRowVisibility({
          table: 'projects',
          disposition: mapped.disposition,
          dispositionReason: mapped.disposition === 'upsert' ? undefined : mapped.reason,
          archived: page.archived,
          inTrash: page.inTrash,
          parentClientEnabled: clientNotionId ? ids.clientEnabledByNotion[clientNotionId] === true : undefined,
        });
        if (decision.action === 'hide') {
          stats.skipped += 1;
          await conceal('projects', page.id, decision);
          return;
        }
        if (decision.action === 'quarantine' || !mapped.row || mapped.row.database !== 'projects') {
          stats.quarantined += 1;
          await ctx.runMutation(internal.sync.upsert.writeQuarantine, {
            notionPageId: page.id,
            database: 'projects',
            reason: mapped.disposition === 'quarantine' ? mapped.reason : 'invalid project map',
          });
          await conceal('projects', page.id, {
            action: 'hide',
            reason: 'gate',
            detail: mapped.disposition === 'quarantine' ? mapped.reason : 'invalid project map',
            revokeSessions: false,
            cascade: 'project-tasks',
          });
          return;
        }
        const orgId = clientNotionId ? ids.clientByNotion[clientNotionId] : undefined;
        if (!orgId || !clientNotionId) {
          stats.quarantined += 1;
          await ctx.runMutation(internal.sync.upsert.writeQuarantine, {
            notionPageId: page.id,
            database: 'projects',
            reason: 'Client relation not resolved',
          });
          await conceal('projects', page.id, {
            action: 'hide',
            reason: 'gate',
            detail: 'Client relation not resolved',
            revokeSessions: false,
            cascade: 'project-tasks',
          });
          return;
        }
        const projectId = await ctx.runMutation(internal.sync.upsert.upsertProject, {
          notionPageId: mapped.row.notionPageId,
          orgId,
          name: mapped.row.name,
          description: mapped.row.description,
          status: mapped.row.status,
          progress: mapped.row.progress,
          startDate: mapped.row.startDate,
          endDate: mapped.row.endDate,
          liveUrl: mapped.row.liveUrl,
          figmaLink: mapped.row.figmaLink,
          docsUrl: mapped.row.docsUrl,
          stack: mapped.row.stack,
          type: mapped.row.type,
          archive: mapped.row.archive,
          publishToWarehaus: mapped.row.publishToWarehaus,
          priority: mapped.row.priority,
          externalId: mapped.row.externalId,
          source: mapped.row.source,
          hiddenReason: decision.action === 'store-hidden' ? 'ancestor' : undefined,
        });
        projectClientNotion.set(page.id, clientNotionId);
        if (decision.action === 'store-hidden') {
          stats.concealed += 1;
          if (decision.cascade === 'project-tasks') {
            await ctx.runMutation(internal.sync.hide.hideProjectTasks, { projectId });
          }
          return;
        }
        await ctx.runMutation(internal.sync.hide.clearProjectTaskAncestors, { projectId });
        projectPass.add(page.id);
        stats.upserted.projects += 1;
        });
      }
      await hideMissingOnFullPull('projects', projectLoaded.pages, projectLoaded.archivedOk);

      ids = await refreshIds();
      for (const [notionId, visible] of Object.entries(ids.projectVisibleByNotion)) {
        if (visible) projectPass.add(notionId);
      }

      // --- Tasks ---
      const taskLoaded = await loadSourcePages(
        'tasks',
        SYNC_SOURCES.tasks,
        pageOpts,
        priorRetries,
        now,
        (message) => stats.errors.push(message),
      );
      await noteMissing('tasks', taskLoaded.missingIds);
      for (const page of taskLoaded.pages) {
        await track(page, 'tasks', async () => {
        const projectIds = (() => {
          const rel = page.properties.Projects as { relation?: Array<{ id?: string }> } | undefined;
          return (rel?.relation ?? []).map((r) => r.id ?? '').filter(Boolean);
        })();
        const parentOk = projectIds.some((id) => projectPass.has(id));
        const mapped = mapNotionTask(page.id, page.properties, parentOk);
        const parentClientEnabled = projectIds.length === 0
          ? undefined
          : projectIds.some((id) => {
              const orgId = ids.projectOrgByNotion[id];
              if (!orgId) return false;
              const clientNotionId = Object.entries(ids.clientByNotion).find(([, clientId]) => clientId === orgId)?.[0];
              return clientNotionId ? ids.clientEnabledByNotion[clientNotionId] === true : false;
            });
        const decision = decideSyncedRowVisibility({
          table: 'tasks',
          disposition: mapped.disposition,
          dispositionReason: mapped.disposition === 'upsert' ? undefined : mapped.reason,
          archived: page.archived,
          inTrash: page.inTrash,
          parentClientEnabled: typeof parentClientEnabled === 'boolean' ? parentClientEnabled : undefined,
          parentProjectVisible: parentOk,
        });
        if (decision.action === 'hide') {
          stats.skipped += 1;
          await conceal('tasks', page.id, decision);
          return;
        }
        if (decision.action === 'quarantine' || !mapped.row || mapped.row.database !== 'tasks') {
          stats.quarantined += 1;
          await ctx.runMutation(internal.sync.upsert.writeQuarantine, {
            notionPageId: page.id,
            database: 'tasks',
            reason: mapped.disposition === 'quarantine' ? mapped.reason : 'invalid task map',
          });
          await conceal('tasks', page.id, {
            action: 'hide',
            reason: 'gate',
            detail: mapped.disposition === 'quarantine' ? mapped.reason : 'invalid task map',
            revokeSessions: false,
            cascade: 'none',
          });
          return;
        }
        const projectNotionId = mapped.row.projectNotionIds.find(
          (id) => ids.projectByNotion[id],
        );
        const projectId = projectNotionId ? ids.projectByNotion[projectNotionId] : undefined;
        const orgId = projectNotionId ? ids.projectOrgByNotion[projectNotionId] : undefined;
        if (!projectId || !orgId) {
          stats.quarantined += 1;
          await ctx.runMutation(internal.sync.upsert.writeQuarantine, {
            notionPageId: page.id,
            database: 'tasks',
            reason: 'Parent project not resolved',
          });
          await conceal('tasks', page.id, {
            action: 'hide',
            reason: 'gate',
            detail: 'Parent project not resolved',
            revokeSessions: false,
            cascade: 'none',
          });
          return;
        }
        await ctx.runMutation(internal.sync.upsert.upsertTask, {
          notionPageId: mapped.row.notionPageId,
          orgId,
          projectId,
          name: mapped.row.name,
          status: mapped.row.status,
          isDone: mapped.row.isDone,
          date: mapped.row.date,
          publishToWarehaus: mapped.row.publishToWarehaus,
          estimate: mapped.row.estimate,
          priority: mapped.row.priority,
          externalId: mapped.row.externalId,
          source: mapped.row.source,
          hiddenReason: decision.action === 'store-hidden' ? 'ancestor' : undefined,
        });
        if (decision.action === 'store-hidden') {
          stats.concealed += 1;
          return;
        }
        stats.upserted.tasks += 1;
        });
      }
      await hideMissingOnFullPull('tasks', taskLoaded.pages, taskLoaded.archivedOk);

      // --- Shared Resources (+ optional Blob copy) ---
      const resourceLoaded = await loadSourcePages(
        'sharedResources',
        SYNC_SOURCES.sharedResources,
        pageOpts,
        priorRetries,
        now,
        (message) => stats.errors.push(message),
      );
      await noteMissing('sharedResources', resourceLoaded.missingIds);
      for (const page of resourceLoaded.pages) {
        await track(page, 'sharedResources', async () => {
        const projectNotionId = (() => {
          const rel = page.properties.Project as { relation?: Array<{ id?: string }> } | undefined;
          return rel?.relation?.[0]?.id ?? null;
        })();
        const mapped = mapNotionSharedResource(
          page.id,
          page.properties,
          projectNotionId ? projectClientNotion.get(projectNotionId) ?? null : null,
        );
        const resourceClientId = mapped.row?.database === 'sharedResources' ? mapped.row.clientNotionIds[0] : undefined;
        const projectOrgId = projectNotionId ? ids.projectOrgByNotion[projectNotionId] : undefined;
        const projectClientId = projectOrgId
          ? Object.entries(ids.clientByNotion).find(([, clientId]) => clientId === projectOrgId)?.[0]
          : undefined;
        const parentClientEnabled = resourceClientId
          ? ids.clientEnabledByNotion[resourceClientId] === true
          : projectClientId
            ? ids.clientEnabledByNotion[projectClientId] === true
            : undefined;
        const decision = decideSyncedRowVisibility({
          table: 'sharedResources',
          disposition: mapped.disposition,
          dispositionReason: mapped.disposition === 'upsert' ? undefined : mapped.reason,
          archived: page.archived,
          inTrash: page.inTrash,
          parentClientEnabled,
        });
        if (decision.action === 'hide') {
          stats.skipped += 1;
          await conceal('sharedResources', page.id, decision);
          return;
        }
        if (
          decision.action === 'quarantine' ||
          !mapped.row ||
          mapped.row.database !== 'sharedResources'
        ) {
          stats.quarantined += 1;
          await ctx.runMutation(internal.sync.upsert.writeQuarantine, {
            notionPageId: page.id,
            database: 'sharedResources',
            reason: mapped.disposition === 'quarantine' ? mapped.reason : 'invalid resource map',
          });
          await conceal('sharedResources', page.id, {
            action: 'hide',
            reason: 'gate',
            detail: mapped.disposition === 'quarantine' ? mapped.reason : 'invalid resource map',
            revokeSessions: false,
            cascade: 'none',
          });
          return;
        }
        const orgId =
          mapped.row.clientNotionIds.map((id) => ids.clientByNotion[id]).find(Boolean) ??
          (projectNotionId ? ids.projectOrgByNotion[projectNotionId] : undefined);
        if (!orgId) {
          stats.quarantined += 1;
          await ctx.runMutation(internal.sync.upsert.writeQuarantine, {
            notionPageId: page.id,
            database: 'sharedResources',
            reason: 'No resolvable Client/Project org',
          });
          await conceal('sharedResources', page.id, {
            action: 'hide',
            reason: 'gate',
            detail: 'No resolvable Client/Project org',
            revokeSessions: false,
            cascade: 'none',
          });
          return;
        }
        const projectId = projectNotionId ? ids.projectByNotion[projectNotionId] : undefined;
        const firstFile = mapped.row.files[0];
        let blobUrl: string | undefined;
        let blobPath: string | undefined;
        let mimeType: string | undefined;
        let byteSize: number | undefined;
        let checksum: string | undefined;

        if (firstFile?.url) {
          const blob = await copyNotionFileToBlob({
            notionUrl: firstFile.url,
            orgId: String(orgId),
            kind: 'shared',
            notionPageId: page.id,
            safeName: firstFile.name || mapped.row.title || 'file',
          });
          if (blob.ok) {
            if (blob.skipped && !blob.blobUrl) {
              stats.blobSkipped += 1;
            } else if (blob.blobUrl) {
              blobUrl = blob.blobUrl;
              blobPath = blob.blobPathname;
              mimeType = blob.mimeType;
              byteSize = blob.byteSize;
              checksum = blob.checksum;
              stats.blobCopied += 1;
            } else {
              stats.blobSkipped += 1;
            }
          }
        }

        // Prefer Blob URL as the durable client link; fall back to curated URL.
        const durableUrl = blobUrl ?? mapped.row.url;
        if (blobUrl) {
          try {
            const wrote = await writeSharedResourceUrl({
              notionPageId: page.id,
              url: blobUrl,
              currentUrl: mapped.row.url,
            });
            if (wrote === 'written') stats.urlWritebacks += 1;
          } catch (err) {
            stats.errors.push(
              `url writeback ${page.id}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }

        await ctx.runMutation(internal.sync.upsert.upsertSharedResource, {
          notionPageId: mapped.row.notionPageId,
          orgId,
          projectId,
          title: mapped.row.title,
          description: mapped.row.description,
          type: mapped.row.type,
          url: durableUrl,
          mimeType,
          byteSize,
          checksum,
          blobPathname: blobPath,
          blobUrl,
          sourceNotionUrl: firstFile?.url,
          publishToWarehaus: mapped.row.publishToWarehaus,
          archive: mapped.row.archive,
          externalId: mapped.row.externalId,
          source: mapped.row.source,
          hiddenReason: decision.action === 'store-hidden' ? 'ancestor' : undefined,
        });
        if (decision.action === 'store-hidden') {
          stats.concealed += 1;
          return;
        }
        stats.upserted.sharedResources += 1;
        });
      }
      await hideMissingOnFullPull('sharedResources', resourceLoaded.pages, resourceLoaded.archivedOk);

      // --- Client Docs (properties + allowlisted body) ---
      const docLoaded = await loadSourcePages(
        'clientDocs',
        SYNC_SOURCES.clientDocs,
        pageOpts,
        priorRetries,
        now,
        (message) => stats.errors.push(message),
      );
      await noteMissing('clientDocs', docLoaded.missingIds);
      for (const page of docLoaded.pages) {
        await track(page, 'clientDocs', async () => {
        const mapped = mapNotionClientDoc(page.id, page.properties);
        const docClientId = mapped.row?.database === 'clientDocs' ? mapped.row.clientNotionIds[0] : undefined;
        const decision = decideSyncedRowVisibility({
          table: 'clientDocs',
          disposition: mapped.disposition,
          dispositionReason: mapped.disposition === 'upsert' ? undefined : mapped.reason,
          archived: page.archived,
          inTrash: page.inTrash,
          parentClientEnabled: docClientId ? ids.clientEnabledByNotion[docClientId] === true : undefined,
        });
        if (decision.action === 'hide') {
          stats.skipped += 1;
          await conceal('clientDocs', page.id, decision);
          return;
        }
        if (decision.action === 'quarantine' || !mapped.row || mapped.row.database !== 'clientDocs') {
          stats.quarantined += 1;
          await ctx.runMutation(internal.sync.upsert.writeQuarantine, {
            notionPageId: page.id,
            database: 'clientDocs',
            reason: mapped.disposition === 'quarantine' ? mapped.reason : 'invalid doc map',
          });
          await conceal('clientDocs', page.id, {
            action: 'hide',
            reason: 'gate',
            detail: mapped.disposition === 'quarantine' ? mapped.reason : 'invalid doc map',
            revokeSessions: false,
            cascade: 'none',
          });
          return;
        }
        const orgId = mapped.row.clientNotionIds
          .map((id) => ids.clientByNotion[id])
          .find(Boolean);
        if (!orgId) {
          stats.quarantined += 1;
          await ctx.runMutation(internal.sync.upsert.writeQuarantine, {
            notionPageId: page.id,
            database: 'clientDocs',
            reason: 'Client relation not resolved',
          });
          await conceal('clientDocs', page.id, {
            action: 'hide',
            reason: 'gate',
            detail: 'Client relation not resolved',
            revokeSessions: false,
            cascade: 'none',
          });
          return;
        }
        const projectNotionId = mapped.row.projectNotionIds.find((id) => ids.projectByNotion[id]);
        const docBody = await fetchSafeDocBody(page.id, String(orgId));
        const body = docBody.body;
        const docImages = docBody.images;
        stats.blobCopied += docBody.blobCopied;
        const docId = await ctx.runMutation(internal.sync.upsert.upsertClientDoc, {
          notionPageId: mapped.row.notionPageId,
          orgId,
          projectId: projectNotionId ? ids.projectByNotion[projectNotionId] : undefined,
          title: mapped.row.title,
          summary: mapped.row.summary,
          docType: mapped.row.docType,
          order: mapped.row.order,
          body,
          status: mapped.row.status,
          publishToWarehaus: mapped.row.publishToWarehaus,
          externalId: mapped.row.externalId,
          source: mapped.row.source,
          hiddenReason: decision.action === 'store-hidden' ? 'ancestor' : undefined,
        });
        await ctx.runMutation(internal.sync.upsert.replaceClientDocImages, {
          orgId,
          docId,
          images: docImages,
        });
        if (decision.action === 'store-hidden') {
          stats.concealed += 1;
          return;
        }
        stats.upserted.clientDocs += 1;
        });
      }
      await hideMissingOnFullPull('clientDocs', docLoaded.pages, docLoaded.archivedOk);

      const outstanding = refreshUnseenRetries(priorRetries, seen, now);
      const lastSyncedAtMs = decidePullWatermark({
        previousWatermarkMs: previousWatermark,
        nowMs: now,
        outcomes,
        outstanding,
      });
      const retries = capStoredRetries([...nextRetries, ...outstanding]);
      const pageError =
        retries.length > 0
          ? `${retries.length} Notion page(s) failed; cursor held for retry`
          : undefined;
      await ctx.runMutation(internal.sync.upsert.writeSyncMeta, {
        key: 'notion-pull',
        setLastSyncedAt: lastSyncedAtMs != null,
        lastSyncedAt: lastSyncedAtMs ?? undefined,
        lastError: pageError,
        clearLastError: !pageError,
        details: JSON.stringify({ stats, retries }),
      });
    } catch (err) {
      terminalError = err instanceof Error ? err.message : String(err);
      stats.errors.push(terminalError);
      try {
        await ctx.runMutation(internal.sync.upsert.writeSyncMeta, {
          key: 'notion-pull',
          lastError: terminalError,
          details: metaDetails,
        });
      } catch (metaErr) {
        stats.errors.push(
          metaErr instanceof Error ? metaErr.message : String(metaErr),
        );
      }
    }

    if (args.eventId) {
      await ctx.runMutation(internal.sync.queue.markWebhookProcessed, {
        eventId: args.eventId,
        status: terminalError ? 'error' : 'done',
        error: terminalError,
      });
    }

    return stats;
  },
});
