import {
  INCREMENTAL_OVERLAP_MS,
  capStoredRetries,
  decidePullWatermark,
  dueRetryIds,
  isExhaustedRetry,
  mapNotionClient,
  mapNotionClientDoc,
  mapNotionContact,
  mapNotionProject,
  mapNotionSharedResource,
  mapNotionTask,
  mergeReleasedPages,
  pageEditedAtMs,
  parsePullCursorState,
  refreshUnseenRetries,
  settleRecordedFailures,
  shouldDeferPageRetry,
  shouldSkipReleased,
  type FailedPageRetry,
  type PageProcessOutcome,
  type RecordedPageFailure,
  type ReleasedPage,
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
  mode: 'full' | 'incremental';
  editedSinceIso: string | null;
  errors: string[];
};

type IdMaps = {
  clientByNotion: Record<string, Id<'clients'>>;
  projectByNotion: Record<string, Id<'projects'>>;
  projectOrgByNotion: Record<string, Id<'clients'>>;
};

async function concatDueRetries(
  database: string,
  pages: NotionPageRow[],
  priorRetries: FailedPageRetry[],
  nowMs: number,
): Promise<NotionPageRow[]> {
  const present = new Set(pages.map((page) => page.id));
  const ids = dueRetryIds({
    prior: priorRetries,
    database,
    alreadyPresent: present,
    nowMs,
  });
  if (ids.length === 0) return pages;
  const extra: NotionPageRow[] = [];
  for (const id of ids) {
    const page = await fetchNotionPage(id);
    if (page) extra.push(page);
  }
  return extra.length ? [...pages, ...extra] : pages;
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
    const pageFailures: RecordedPageFailure[] = [];
    const seen = new Set<string>();
    let attempted = 0;
    let priorRetries: FailedPageRetry[] = [];
    let priorReleased: ReleasedPage[] = [];
    const priorById = new Map<string, FailedPageRetry>();

    const refreshIds = async (): Promise<IdMaps> =>
      ctx.runMutation(internal.sync.upsert.resolveIds, {});

    const track = async (
      page: NotionPageRow,
      database: string,
      fn: () => Promise<void>,
    ) => {
      const editedAtMs = pageEditedAtMs(page.lastEdited);
      seen.add(page.id);
      const prior = priorById.get(page.id);
      if (shouldSkipReleased({ id: page.id, editedAtMs }, priorReleased)) {
        outcomes.push({ id: page.id, editedAtMs, ok: true });
        return;
      }
      if (prior && shouldDeferPageRetry(prior, now)) {
        outcomes.push({ id: page.id, editedAtMs, ok: false });
        nextRetries.push(prior);
        stats.deferred += 1;
        return;
      }
      try {
        await fn();
        attempted += 1;
        outcomes.push({ id: page.id, editedAtMs, ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        attempted += 1;
        stats.errors.push(`${database} ${page.id}: ${message}`);
        stats.failed += 1;
        outcomes.push({ id: page.id, editedAtMs, ok: false });
        pageFailures.push({
          id: page.id,
          database,
          editedAtMs,
          error: message,
          prior,
        });
      }
    };

    try {
      const meta = await ctx.runQuery(internal.sync.upsert.getSyncMeta, {
        key: 'notion-pull',
      });
      metaDetails = meta?.details;
      previousWatermark = typeof meta?.lastSyncedAt === 'number' ? meta.lastSyncedAt : null;
      const cursor = parsePullCursorState(meta?.details);
      priorRetries = cursor.retries;
      priorReleased = cursor.released;
      for (const retry of priorRetries) priorById.set(retry.id, retry);

      const forceFull = Boolean(args.forceFull) || previousWatermark == null;
      if (forceFull) priorReleased = [];
      const editedSinceIso = forceFull
        ? null
        : new Date(Math.max(0, previousWatermark! - INCREMENTAL_OVERLAP_MS)).toISOString();
      stats.mode = forceFull ? 'full' : 'incremental';
      stats.editedSinceIso = editedSinceIso;
      const pageOpts = { editedSinceIso };

      // --- Clients ---
      const clientPages = await concatDueRetries(
        'clients',
        await queryAllDataSourcePages(SYNC_SOURCES.clients, pageOpts),
        priorRetries,
        now,
      );
      for (const page of clientPages) {
        await track(page, 'clients', async () => {
        const mapped = mapNotionClient(page.id, page.properties);
        if (mapped.disposition === 'skip') {
          stats.skipped += 1;
          return;
        }
        if (mapped.disposition === 'quarantine' || !mapped.row || mapped.row.database !== 'clients') {
          stats.quarantined += 1;
          await ctx.runMutation(internal.sync.upsert.writeQuarantine, {
            notionPageId: page.id,
            editedAtMs: pageEditedAtMs(page.lastEdited) ?? undefined,
            database: 'clients',
            reason: mapped.disposition === 'quarantine' ? mapped.reason : 'invalid client map',
          });
          return;
        }
        await ctx.runMutation(internal.sync.upsert.upsertClient, {
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
        stats.upserted.clients += 1;
        });
      }

      let ids = await refreshIds();

      // --- Contacts ---
      const contactPages = await concatDueRetries(
        'contacts',
        await queryAllDataSourcePages(SYNC_SOURCES.contacts, pageOpts),
        priorRetries,
        now,
      );
      for (const page of contactPages) {
        await track(page, 'contacts', async () => {
        const mapped = mapNotionContact(page.id, page.properties);
        if (mapped.disposition === 'skip') {
          stats.skipped += 1;
          return;
        }
        if (mapped.disposition === 'quarantine' || !mapped.row || mapped.row.database !== 'contacts') {
          stats.quarantined += 1;
          await ctx.runMutation(internal.sync.upsert.writeQuarantine, {
            notionPageId: page.id,
            editedAtMs: pageEditedAtMs(page.lastEdited) ?? undefined,
            database: 'contacts',
            reason: mapped.disposition === 'quarantine' ? mapped.reason : 'invalid contact map',
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
            editedAtMs: pageEditedAtMs(page.lastEdited) ?? undefined,
            database: 'contacts',
            reason: 'Client Company not resolved to a synced client',
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
        });
        stats.upserted.contacts += 1;
        });
      }

      // --- Projects ---
      const projectPages = await concatDueRetries(
        'projects',
        await queryAllDataSourcePages(SYNC_SOURCES.projects, pageOpts),
        priorRetries,
        now,
      );
      const projectPass = new Set<string>();
      const projectClientNotion = new Map<string, string>();

      for (const page of projectPages) {
        await track(page, 'projects', async () => {
        const mapped = mapNotionProject(page.id, page.properties);
        if (mapped.disposition === 'skip') {
          stats.skipped += 1;
          return;
        }
        if (mapped.disposition === 'quarantine' || !mapped.row || mapped.row.database !== 'projects') {
          stats.quarantined += 1;
          await ctx.runMutation(internal.sync.upsert.writeQuarantine, {
            notionPageId: page.id,
            editedAtMs: pageEditedAtMs(page.lastEdited) ?? undefined,
            database: 'projects',
            reason: mapped.disposition === 'quarantine' ? mapped.reason : 'invalid project map',
          });
          return;
        }
        const clientNotionId = mapped.row.clientNotionIds[0];
        const orgId = clientNotionId ? ids.clientByNotion[clientNotionId] : undefined;
        if (!orgId || !clientNotionId) {
          stats.quarantined += 1;
          await ctx.runMutation(internal.sync.upsert.writeQuarantine, {
            notionPageId: page.id,
            editedAtMs: pageEditedAtMs(page.lastEdited) ?? undefined,
            database: 'projects',
            reason: 'Client relation not resolved',
          });
          return;
        }
        await ctx.runMutation(internal.sync.upsert.upsertProject, {
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
        });
        projectPass.add(page.id);
        projectClientNotion.set(page.id, clientNotionId);
        stats.upserted.projects += 1;
        });
      }

      ids = await refreshIds();
      for (const notionId of Object.keys(ids.projectByNotion)) {
        projectPass.add(notionId);
      }

      // --- Tasks ---
      const taskPages = await concatDueRetries(
        'tasks',
        await queryAllDataSourcePages(SYNC_SOURCES.tasks, pageOpts),
        priorRetries,
        now,
      );
      for (const page of taskPages) {
        await track(page, 'tasks', async () => {
        const projectIds = (() => {
          const rel = page.properties.Projects as { relation?: Array<{ id?: string }> } | undefined;
          return (rel?.relation ?? []).map((r) => r.id ?? '').filter(Boolean);
        })();
        const parentOk = projectIds.some((id) => projectPass.has(id));
        const mapped = mapNotionTask(page.id, page.properties, parentOk);
        if (mapped.disposition === 'skip') {
          stats.skipped += 1;
          return;
        }
        if (mapped.disposition === 'quarantine' || !mapped.row || mapped.row.database !== 'tasks') {
          stats.quarantined += 1;
          await ctx.runMutation(internal.sync.upsert.writeQuarantine, {
            notionPageId: page.id,
            editedAtMs: pageEditedAtMs(page.lastEdited) ?? undefined,
            database: 'tasks',
            reason: mapped.disposition === 'quarantine' ? mapped.reason : 'invalid task map',
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
            editedAtMs: pageEditedAtMs(page.lastEdited) ?? undefined,
            database: 'tasks',
            reason: 'Parent project not resolved',
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
        });
        stats.upserted.tasks += 1;
        });
      }

      // --- Shared Resources (+ optional Blob copy) ---
      const resourcePages = await concatDueRetries(
        'sharedResources',
        await queryAllDataSourcePages(SYNC_SOURCES.sharedResources, pageOpts),
        priorRetries,
        now,
      );
      for (const page of resourcePages) {
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
        if (mapped.disposition === 'skip') {
          stats.skipped += 1;
          return;
        }
        if (
          mapped.disposition === 'quarantine' ||
          !mapped.row ||
          mapped.row.database !== 'sharedResources'
        ) {
          stats.quarantined += 1;
          await ctx.runMutation(internal.sync.upsert.writeQuarantine, {
            notionPageId: page.id,
            editedAtMs: pageEditedAtMs(page.lastEdited) ?? undefined,
            database: 'sharedResources',
            reason: mapped.disposition === 'quarantine' ? mapped.reason : 'invalid resource map',
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
            editedAtMs: pageEditedAtMs(page.lastEdited) ?? undefined,
            database: 'sharedResources',
            reason: 'No resolvable Client/Project org',
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
        });
        stats.upserted.sharedResources += 1;
        });
      }

      // --- Client Docs (properties + allowlisted body) ---
      const docPages = await concatDueRetries(
        'clientDocs',
        await queryAllDataSourcePages(SYNC_SOURCES.clientDocs, pageOpts),
        priorRetries,
        now,
      );
      for (const page of docPages) {
        await track(page, 'clientDocs', async () => {
        const mapped = mapNotionClientDoc(page.id, page.properties);
        if (mapped.disposition === 'skip') {
          stats.skipped += 1;
          return;
        }
        if (mapped.disposition === 'quarantine' || !mapped.row || mapped.row.database !== 'clientDocs') {
          stats.quarantined += 1;
          await ctx.runMutation(internal.sync.upsert.writeQuarantine, {
            notionPageId: page.id,
            editedAtMs: pageEditedAtMs(page.lastEdited) ?? undefined,
            database: 'clientDocs',
            reason: mapped.disposition === 'quarantine' ? mapped.reason : 'invalid doc map',
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
            editedAtMs: pageEditedAtMs(page.lastEdited) ?? undefined,
            database: 'clientDocs',
            reason: 'Client relation not resolved',
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
        });
        await ctx.runMutation(internal.sync.upsert.replaceClientDocImages, {
          orgId,
          docId,
          images: docImages,
        });
        stats.upserted.clientDocs += 1;
        });
      }

      const outstanding = refreshUnseenRetries(priorRetries, seen, now);
      nextRetries.push(
        ...settleRecordedFailures({
          failures: pageFailures,
          attempted,
          nowMs: now,
        }),
      );
      const combined = [...nextRetries, ...outstanding];
      const quarantined = combined.filter(isExhaustedRetry);
      const exhaustedIds = new Set(quarantined.map((retry) => retry.id));
      const retries = capStoredRetries(
        combined.filter((retry) => !exhaustedIds.has(retry.id)),
      );
      const lastSyncedAtMs = decidePullWatermark({
        previousWatermarkMs: previousWatermark,
        nowMs: now,
        outcomes: outcomes.map((outcome) =>
          exhaustedIds.has(outcome.id) ? { ...outcome, ok: true } : outcome,
        ),
        outstanding: outstanding.filter((retry) => !exhaustedIds.has(retry.id)),
      });
      for (const row of quarantined) {
        await ctx.runMutation(internal.sync.upsert.writeQuarantine, {
          notionPageId: row.id,
          editedAtMs: row.editedAtMs ?? undefined,
          database: row.database,
          reason: `Stopped after ${row.attempts} failed attempts: ${row.error}`,
        });
        stats.quarantined += 1;
      }
      const released = mergeReleasedPages(
        priorReleased,
        quarantined,
        outcomes.map((outcome) => ({ id: outcome.id, editedAtMs: outcome.editedAtMs })),
        now,
      );
      const notes = [
        retries.length > 0
          ? `${retries.length} Notion page(s) failed; cursor held for retry`
          : null,
        quarantined.length > 0
          ? `${quarantined.length} Notion page(s) quarantined after repeated failures`
          : null,
      ].filter((note): note is string => Boolean(note));
      const pageError = notes.length > 0 ? notes.join('. ') : undefined;
      await ctx.runMutation(internal.sync.upsert.writeSyncMeta, {
        key: 'notion-pull',
        setLastSyncedAt: lastSyncedAtMs != null,
        lastSyncedAt: lastSyncedAtMs ?? undefined,
        lastError: pageError,
        clearLastError: !pageError,
        details: JSON.stringify({ stats, retries, released }),
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
