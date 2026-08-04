import {
  mapNotionClient,
  mapNotionClientDoc,
  mapNotionContact,
  mapNotionProject,
  mapNotionSharedResource,
  mapNotionTask,
} from '@warehaus/portal-sync';
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { internalAction } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { copyNotionFileToBlob } from './blob';
import { fetchSafeDocBody } from './docBody';
import {
  queryAllDataSourcePages,
  SYNC_SOURCES,
  writeSharedResourceUrl,
} from './notionApi';

export type PullStats = {
  upserted: Record<string, number>;
  skipped: number;
  quarantined: number;
  blobCopied: number;
  blobSkipped: number;
  urlWritebacks: number;
  mode: 'full' | 'incremental';
  editedSinceIso: string | null;
  errors: string[];
};

type IdMaps = {
  clientByNotion: Record<string, Id<'clients'>>;
  projectByNotion: Record<string, Id<'projects'>>;
  projectOrgByNotion: Record<string, Id<'clients'>>;
};

/** Overlap so edits at the cursor boundary are not missed. */
const INCREMENTAL_OVERLAP_MS = 2 * 60 * 1000;

/**
 * Allowlisted pull: Notion → Convex.
 * Incremental when `notion-pull` syncMeta exists (last_edited_time filter);
 * pass `forceFull: true` or unset meta for a full scan.
 * Order: clients → contacts → projects → tasks → sharedResources → clientDocs.
 */
export const pullAll = internalAction({
  args: {
    forceFull: v.optional(v.boolean()),
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
      mode: 'full',
      editedSinceIso: null,
      errors: [],
    };

    const refreshIds = async (): Promise<IdMaps> =>
      ctx.runMutation(internal.sync.upsert.resolveIds, {});

    try {
      const meta = await ctx.runQuery(internal.sync.upsert.getSyncMeta, {
        key: 'notion-pull',
      });
      const forceFull = Boolean(args.forceFull) || !meta?.lastSyncedAt;
      const editedSinceIso = forceFull
        ? null
        : new Date(Math.max(0, (meta!.lastSyncedAt as number) - INCREMENTAL_OVERLAP_MS)).toISOString();
      stats.mode = forceFull ? 'full' : 'incremental';
      stats.editedSinceIso = editedSinceIso;
      const pageOpts = { editedSinceIso };

      // --- Clients ---
      const clientPages = await queryAllDataSourcePages(SYNC_SOURCES.clients, pageOpts);
      for (const page of clientPages) {
        const mapped = mapNotionClient(page.id, page.properties);
        if (mapped.disposition === 'skip') {
          stats.skipped += 1;
          continue;
        }
        if (mapped.disposition === 'quarantine' || !mapped.row || mapped.row.database !== 'clients') {
          stats.quarantined += 1;
          await ctx.runMutation(internal.sync.upsert.writeQuarantine, {
            notionPageId: page.id,
            database: 'clients',
            reason: mapped.disposition === 'quarantine' ? mapped.reason : 'invalid client map',
          });
          continue;
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
      }

      let ids = await refreshIds();

      // --- Contacts ---
      const contactPages = await queryAllDataSourcePages(SYNC_SOURCES.contacts, pageOpts);
      for (const page of contactPages) {
        const mapped = mapNotionContact(page.id, page.properties);
        if (mapped.disposition === 'skip') {
          stats.skipped += 1;
          continue;
        }
        if (mapped.disposition === 'quarantine' || !mapped.row || mapped.row.database !== 'contacts') {
          stats.quarantined += 1;
          await ctx.runMutation(internal.sync.upsert.writeQuarantine, {
            notionPageId: page.id,
            database: 'contacts',
            reason: mapped.disposition === 'quarantine' ? mapped.reason : 'invalid contact map',
          });
          continue;
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
          continue;
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
      }

      // --- Projects ---
      const projectPages = await queryAllDataSourcePages(SYNC_SOURCES.projects, pageOpts);
      const projectPass = new Set<string>();
      const projectClientNotion = new Map<string, string>();

      for (const page of projectPages) {
        const mapped = mapNotionProject(page.id, page.properties);
        if (mapped.disposition === 'skip') {
          stats.skipped += 1;
          continue;
        }
        if (mapped.disposition === 'quarantine' || !mapped.row || mapped.row.database !== 'projects') {
          stats.quarantined += 1;
          await ctx.runMutation(internal.sync.upsert.writeQuarantine, {
            notionPageId: page.id,
            database: 'projects',
            reason: mapped.disposition === 'quarantine' ? mapped.reason : 'invalid project map',
          });
          continue;
        }
        const clientNotionId = mapped.row.clientNotionIds[0];
        const orgId = clientNotionId ? ids.clientByNotion[clientNotionId] : undefined;
        if (!orgId || !clientNotionId) {
          stats.quarantined += 1;
          await ctx.runMutation(internal.sync.upsert.writeQuarantine, {
            notionPageId: page.id,
            database: 'projects',
            reason: 'Client relation not resolved',
          });
          continue;
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
      }

      ids = await refreshIds();
      for (const notionId of Object.keys(ids.projectByNotion)) {
        projectPass.add(notionId);
      }

      // --- Tasks ---
      const taskPages = await queryAllDataSourcePages(SYNC_SOURCES.tasks, pageOpts);
      for (const page of taskPages) {
        const projectIds = (() => {
          const rel = page.properties.Projects as { relation?: Array<{ id?: string }> } | undefined;
          return (rel?.relation ?? []).map((r) => r.id ?? '').filter(Boolean);
        })();
        const parentOk = projectIds.some((id) => projectPass.has(id));
        const mapped = mapNotionTask(page.id, page.properties, parentOk);
        if (mapped.disposition === 'skip') {
          stats.skipped += 1;
          continue;
        }
        if (mapped.disposition === 'quarantine' || !mapped.row || mapped.row.database !== 'tasks') {
          stats.quarantined += 1;
          await ctx.runMutation(internal.sync.upsert.writeQuarantine, {
            notionPageId: page.id,
            database: 'tasks',
            reason: mapped.disposition === 'quarantine' ? mapped.reason : 'invalid task map',
          });
          continue;
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
          continue;
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
      }

      // --- Shared Resources (+ optional Blob copy) ---
      const resourcePages = await queryAllDataSourcePages(
        SYNC_SOURCES.sharedResources,
        pageOpts,
      );
      for (const page of resourcePages) {
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
          continue;
        }
        if (
          mapped.disposition === 'quarantine' ||
          !mapped.row ||
          mapped.row.database !== 'sharedResources'
        ) {
          stats.quarantined += 1;
          await ctx.runMutation(internal.sync.upsert.writeQuarantine, {
            notionPageId: page.id,
            database: 'sharedResources',
            reason: mapped.disposition === 'quarantine' ? mapped.reason : 'invalid resource map',
          });
          continue;
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
          continue;
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
      }

      // --- Client Docs (properties + allowlisted body) ---
      const docPages = await queryAllDataSourcePages(SYNC_SOURCES.clientDocs, pageOpts);
      for (const page of docPages) {
        const mapped = mapNotionClientDoc(page.id, page.properties);
        if (mapped.disposition === 'skip') {
          stats.skipped += 1;
          continue;
        }
        if (mapped.disposition === 'quarantine' || !mapped.row || mapped.row.database !== 'clientDocs') {
          stats.quarantined += 1;
          await ctx.runMutation(internal.sync.upsert.writeQuarantine, {
            notionPageId: page.id,
            database: 'clientDocs',
            reason: mapped.disposition === 'quarantine' ? mapped.reason : 'invalid doc map',
          });
          continue;
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
          continue;
        }
        const projectNotionId = mapped.row.projectNotionIds.find((id) => ids.projectByNotion[id]);
        let body: string | undefined;
        let docImages: Array<{
          blobPathname: string;
          blobUrl: string;
          alt?: string;
          checksum?: string;
        }> = [];
        try {
          const docBody = await fetchSafeDocBody(page.id, String(orgId));
          body = docBody.body;
          docImages = docBody.images;
          stats.blobCopied += docBody.blobCopied;
        } catch (err) {
          stats.errors.push(
            `doc body ${page.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
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
      }

      await ctx.runMutation(internal.sync.upsert.writeSyncMeta, {
        key: 'notion-pull',
        lastSyncedAt: Date.now(),
        lastError: undefined,
        details: JSON.stringify(stats),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      stats.errors.push(message);
      await ctx.runMutation(internal.sync.upsert.writeSyncMeta, {
        key: 'notion-pull',
        lastSyncedAt: Date.now(),
        lastError: message,
        details: JSON.stringify(stats),
      });
    }

    return stats;
  },
});
