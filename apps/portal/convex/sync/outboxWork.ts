/**
 * Sends due outbox rows to Notion.
 * When NOTION_WRITEBACK_ENABLED is not exactly "true", this returns without calling Notion.
 * Project create uses this same sender. It does not keep its own HTTP client.
 */

import {
  PORTAL_COLLECTIONS,
  WRITEBACK_OFF_ERROR,
  asClientCreateProperties,
  clientCreateConvexFields,
  clientCreateInsertAllowed,
  clientCreateHitFromNotion,
  clientFieldsFromNotionPage,
  isNotionWritebackEnabled,
  missingWritebackProperty,
  missingWritebackReason,
  outboxKindSendsInvite,
  projectCreateConvexFields,
  readNotionPlain,
  runClientCreateAttempt,
  runOutboxAttempt,
  runProjectCreateAttempt,
  type AttemptOutcome,
  type ClientCreateAttempt,
  type ClientUpsertFields,
  type OutboxItem,
  type ProjectCreateProperties,
  type WriteProperties,
  type WritebackDatabase,
} from '@warehaus/portal-sync';
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import { internalAction, type ActionCtx } from '../_generated/server';
import { listDataSourcePropertyNames } from './notionApi';
import {
  createNotionClientPage,
  createNotionProjectPage,
  readNotionLastEdited,
  searchClientCreateHits,
  searchNotionPages,
  searchProjectCreateHits,
  writeNotionPage,
} from './notionWrite';

type ProcessResult =
  | { ok: true; notionPageId: string; reused: boolean; projectId?: string; clientId?: string }
  | { ok: false; error: string };

function writebackOn(): boolean {
  return isNotionWritebackEnabled(process.env.NOTION_WRITEBACK_ENABLED);
}

function asDatabase(value: string): WritebackDatabase {
  if (
    value === 'clients' ||
    value === 'projects' ||
    value === 'tasks' ||
    value === 'contacts' ||
    value === 'sharedResources' ||
    value === 'clientDocs' ||
    value === 'activity'
  ) {
    return value;
  }
  return 'activity';
}

function parseProperties(payload: string): WriteProperties {
  const parsed = JSON.parse(payload) as { properties?: WriteProperties };
  return parsed.properties ?? {};
}

function toItem(row: Doc<'notionOutbox'>): OutboxItem {
  return {
    idempotencyKey: row.idempotencyKey,
    kind: row.kind,
    database: asDatabase(row.database),
    orgId: row.orgId,
    notionPageId: row.notionPageId,
    expectedLastEditedTime: row.expectedLastEditedTime,
    properties: parseProperties(row.payload),
    status: row.status,
    attempts: row.attempts,
    nextAttemptAt: row.nextAttemptAt,
    createdAt: row.createdAt,
    claimedAt: row.claimedAt,
    lastError: row.lastError,
    staffNotifiedAt: row.staffNotifiedAt,
  };
}

function asProjectProperties(properties: WriteProperties): ProjectCreateProperties | null {
  const client = properties.Client;
  if (typeof properties.Name !== 'string') return null;
  if (!Array.isArray(client) || client.length !== 1 || typeof client[0] !== 'string') return null;
  const publish = properties['Publish to Warehaus'];
  if (typeof publish !== 'boolean') return null;
  if (properties.Archive !== false) return null;
  if (properties.Source !== 'portal') return null;
  if (typeof properties['External ID'] !== 'string') return null;
  return {
    Name: properties.Name,
    Client: [client[0]],
    'Publish to Warehaus': publish,
    Archive: false,
    Source: 'portal',
    'External ID': properties['External ID'],
  };
}

function storedPage(resultJson: string | null | undefined): {
  notionPageId: string;
  projectId?: string;
  clientId?: string;
  reused: boolean;
} | null {
  if (!resultJson) return null;
  try {
    const parsed = JSON.parse(resultJson) as {
      notionPageId?: string;
      projectId?: string;
      clientId?: string;
      reused?: boolean;
    };
    if (!parsed.notionPageId) return null;
    return {
      notionPageId: parsed.notionPageId,
      projectId: parsed.projectId,
      clientId: parsed.clientId,
      reused: parsed.reused ?? true,
    };
  } catch {
    return null;
  }
}

async function convexClientForCreate(
  ctx: ActionCtx,
  notionPageId: string,
  properties: WriteProperties,
  attempt: ClientCreateAttempt | null,
): Promise<Id<'clients'>> {
  const existing = await ctx.runQuery(internal.clientCreate.findByNotionPage, { notionPageId });
  if (existing && !clientCreateInsertAllowed(existing.id)) return existing.id;

  const externalId = typeof properties['External ID'] === 'string' ? properties['External ID'] : '';
  if (externalId) {
    const byExternal = await ctx.runQuery(internal.clientCreate.findByExternalId, { externalId });
    if (byExternal && !clientCreateInsertAllowed(byExternal.id)) return byExternal.id;
  }

  const reuse = attempt?.outcome === 'confirmed' ? attempt : null;
  let fields: ClientUpsertFields | null = null;
  if (reuse?.reuseKind && reuse.existingNotionProperties) {
    fields = clientFieldsFromNotionPage(notionPageId, reuse.existingNotionProperties);
    if (!fields) throw new Error('That client already exists in Notion, but the page could not be read.');
  } else if (reuse?.reuseKind === 'slug') {
    throw new Error('That client already exists in Notion, but the page could not be read.');
  } else {
    const shaped = asClientCreateProperties(properties);
    fields = shaped ? clientCreateConvexFields(shaped) : null;
  }
  if (!fields) throw new Error('Client create payload is incomplete');
  return ctx.runMutation(internal.sync.upsert.upsertClient, {
    notionPageId,
    companyName: fields.companyName,
    slug: fields.slug,
    status: fields.status,
    portalAccess: fields.portalAccess,
    ...(fields.primaryEmail ? { primaryEmail: fields.primaryEmail } : {}),
    ...(fields.phone ? { phone: fields.phone } : {}),
    ...(fields.externalId ? { externalId: fields.externalId } : {}),
    ...(fields.source ? { source: fields.source } : {}),
  });
}

function sameOrg(
  database: WritebackDatabase,
  properties: Record<string, unknown>,
  clientNotionPageId: string | null,
): boolean {
  if (database === 'clients') return true;
  if (database !== 'contacts') return true;
  if (!clientNotionPageId) return false;
  const ids = readNotionPlain(properties['Client Company']);
  return Array.isArray(ids) && ids.includes(clientNotionPageId);
}

function failureMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : 'Notion write failed';
  if (message.includes('NOTION_WAREHAUS_TOKEN')) return 'Notion is not configured for write-back.';
  if (message.includes('NOTION_WRITEBACK_ENABLED')) return WRITEBACK_OFF_ERROR;
  return message.slice(0, 200);
}

type SchemaCache = Map<string, Promise<string[] | null>>;

/** One schema read per data source for this processDue pass. The next pass reads again. */
async function propertyNamesFor(
  cache: SchemaCache,
  database: WritebackDatabase,
): Promise<string[] | null> {
  if (database === 'activity') return null;
  const id = PORTAL_COLLECTIONS[database];
  const existing = cache.get(id);
  if (existing) return existing;
  const pending = listDataSourcePropertyNames(id);
  cache.set(id, pending);
  return pending;
}

async function execute(
  ctx: ActionCtx,
  id: Id<'notionOutbox'>,
  schemaCache: SchemaCache,
): Promise<ProcessResult> {
  if (!writebackOn()) return { ok: false, error: WRITEBACK_OFF_ERROR };

  const claim = await ctx.runMutation(internal.sync.outbox.claim, { id });
  if (!claim.claimed) {
    if (claim.reason === 'done') {
      const stored = storedPage(claim.resultJson);
      if (!stored) return { ok: false, error: 'This write already finished without a page id.' };
      if (stored.clientId) {
        return {
          ok: true,
          notionPageId: stored.notionPageId,
          reused: true,
          projectId: stored.projectId,
          clientId: stored.clientId,
        };
      }
      const doneRow = await ctx.runQuery(internal.sync.outbox.get, { id });
      if (doneRow?.kind === 'client-create') {
        try {
          const clientId = await convexClientForCreate(
            ctx,
            stored.notionPageId,
            parseProperties(doneRow.payload),
            null,
          );
          await ctx.runMutation(internal.sync.outbox.attachClientId, { id, clientId });
          return { ok: true, notionPageId: stored.notionPageId, reused: true, clientId };
        } catch (err) {
          return { ok: false, error: failureMessage(err) };
        }
      }
      return {
        ok: true,
        notionPageId: stored.notionPageId,
        reused: true,
        projectId: stored.projectId,
        clientId: stored.clientId,
      };
    }
    if (claim.reason === 'missing') return { ok: false, error: 'Outbox row was missing' };
    if (claim.reason === 'inflight') return { ok: false, error: 'This write is already in progress.' };
    if (claim.reason === 'backoff') return { ok: false, error: 'This write is not due.' };
    return { ok: false, error: claim.lastError ?? 'This write is not queued.' };
  }

  const row = await ctx.runQuery(internal.sync.outbox.get, { id });
  if (!row) return { ok: false, error: 'Outbox row was missing' };

  const item = toItem(row);
  const database = item.database;
  let outcome: AttemptOutcome;
  let clientAttempt: ClientCreateAttempt | null = null;
  try {
    const livePropertyNames = await propertyNamesFor(schemaCache, database);
    if (row.kind === 'client-create') {
      const externalId =
        typeof item.properties['External ID'] === 'string' ? item.properties['External ID'] : '';
      const slug = typeof item.properties.Slug === 'string' ? item.properties.Slug : '';
      const attempt = await runClientCreateAttempt({
        item,
        nowMs: Date.now(),
        writebackEnabled: true,
        owned: true,
        livePropertyNames: livePropertyNames ?? undefined,
        search: async () => {
          if (!externalId || !slug) return [];
          const pages = await searchClientCreateHits(externalId, slug);
          return pages.map(clientCreateHitFromNotion);
        },
        create: async (properties) => createNotionClientPage(properties),
      });
      clientAttempt = attempt;
      outcome = attempt;
    } else if (row.kind === 'project-create') {
      outcome = await runProjectCreateAttempt({
        item,
        nowMs: Date.now(),
        writebackEnabled: true,
        owned: true,
        livePropertyNames: livePropertyNames ?? undefined,
        search: (externalId) => searchProjectCreateHits(externalId),
        create: async (properties) => {
          const shaped = asProjectProperties(properties);
          if (!shaped) return { ok: false, status: 400, error: 'Project create payload is incomplete' };
          return createNotionProjectPage(shaped);
        },
      });
    } else {
      const clientNotionId = await ctx.runQuery(internal.sync.outbox.clientNotionId, { orgId: row.orgId });
      outcome = await runOutboxAttempt({
        item,
        nowMs: Date.now(),
        writebackEnabled: true,
        owned: true,
        actor: 'staff',
        livePropertyNames: livePropertyNames ?? undefined,
        readPage: async (notionPageId) => {
          const read = await readNotionLastEdited(notionPageId);
          if (!read.ok) {
            return { ok: false, status: read.status, retryAfterMs: read.retryAfterMs, error: read.error ?? 'Notion read failed' };
          }
          return { ok: true, lastEditedTime: read.lastEditedTime ?? null };
        },
        search: async (plan) => {
          if (database === 'activity') return [];
          const property = plan.property;
          if (property !== 'Slug' && property !== 'Email' && property !== 'External ID') return [];
          const hits = await searchNotionPages(database, { property, value: plan.value });
          return hits.map((hit) => ({
            notionPageId: hit.notionPageId,
            sameOrg: sameOrg(database, hit.properties, clientNotionId),
          }));
        },
        write: async (request) => {
          if (database === 'activity') {
            return { ok: false, status: 400, error: 'Activity has no portal create path' };
          }
          return writeNotionPage(database, request);
        },
      });
    }
  } catch (err) {
    const message = failureMessage(err);
    const missing = missingWritebackProperty(message);
    outcome = missing
      ? { outcome: 'rejected', reason: missingWritebackReason([missing]) }
      : {
          outcome: 'retry',
          attempts: row.attempts + 1,
          nextAttemptAt: Date.now() + 30_000,
          lastError: message,
          notifyStaff: false,
        };
  }

  if (outcome.outcome === 'held') {
    await ctx.runMutation(internal.sync.outbox.release, { id });
    return {
      ok: false,
      error: WRITEBACK_OFF_ERROR,
    };
  }
  if (outcome.outcome === 'wait') {
    await ctx.runMutation(internal.sync.outbox.release, { id });
    return { ok: false, error: 'This write is not due.' };
  }

  if (outcome.outcome === 'dead') {
    await ctx.runMutation(internal.sync.outbox.applyOutcome, {
      id,
      outcome: { kind: 'dead', notifyStaff: outcome.notifyStaff, error: outcome.error },
    });
    return { ok: false, error: outcome.error };
  }
  if (outcome.outcome === 'retry') {
    await ctx.runMutation(internal.sync.outbox.applyOutcome, {
      id,
      outcome: {
        kind: 'retry',
        attempts: outcome.attempts,
        nextAttemptAt: outcome.nextAttemptAt,
        lastError: outcome.lastError,
        notifyStaff: outcome.notifyStaff,
      },
    });
    return { ok: false, error: outcome.lastError };
  }
  if (outcome.outcome === 'rejected') {
    await ctx.runMutation(internal.sync.outbox.applyOutcome, {
      id,
      outcome: { kind: 'rejected', reason: outcome.reason },
    });
    return { ok: false, error: outcome.reason };
  }
  if (outcome.outcome === 'conflict') {
    await ctx.runMutation(internal.sync.outbox.applyOutcome, {
      id,
      outcome: {
        kind: 'conflict',
        reason: outcome.reason,
        expectedLastEditedTime: outcome.expectedLastEditedTime,
        observedLastEditedTime: outcome.observedLastEditedTime,
      },
    });
    return { ok: false, error: 'Notion changed since the last read. Nothing was written.' };
  }

  if (row.kind === 'client-create') {
    const pageId = outcome.write.notionPageId;
    let clientId: Id<'clients'>;
    try {
      clientId = await convexClientForCreate(ctx, pageId, outcome.write.properties, clientAttempt);
    } catch (err) {
      const message = failureMessage(err);
      await ctx.runMutation(internal.sync.outbox.applyOutcome, {
        id,
        outcome: {
          kind: 'retry',
          attempts: row.attempts + 1,
          nextAttemptAt: Date.now() + 30_000,
          lastError: message,
          notifyStaff: false,
        },
      });
      return { ok: false, error: message };
    }
    await ctx.runMutation(internal.sync.outbox.applyOutcome, {
      id,
      outcome: {
        kind: 'confirmed',
        notionPageId: pageId,
        lastEditedTime: outcome.write.lastEditedTime,
        propertiesJson: JSON.stringify(outcome.write.properties),
        reused: outcome.reused,
      },
    });
    await ctx.runMutation(internal.sync.outbox.attachClientId, { id, clientId });
    return { ok: true, notionPageId: pageId, reused: outcome.reused, clientId };
  }

  await ctx.runMutation(internal.sync.outbox.applyOutcome, {
    id,
    outcome: {
      kind: 'confirmed',
      notionPageId: outcome.write.notionPageId,
      lastEditedTime: outcome.write.lastEditedTime,
      propertiesJson: JSON.stringify(outcome.write.properties),
      reused: outcome.reused,
    },
  });

  if (outboxKindSendsInvite(row.kind)) {
    const issued = await ctx.runMutation(internal.invites.issueTokenAfterConfirm, {
      outboxId: row._id,
      notionPageId: outcome.write.notionPageId,
    });
    if (issued.issued && issued.raw && issued.to && issued.name) {
      await ctx.runAction(internal.invites.sendIssuedInvite, {
        to: issued.to,
        rawToken: issued.raw,
        name: issued.name,
        alreadyHasLogin: issued.alreadyHasLogin === true,
        ...(issued.inviterName ? { inviterName: issued.inviterName } : {}),
        ...(issued.expiresOn ? { expiresOn: issued.expiresOn } : {}),
      });
    }
  }

  if (row.kind !== 'project-create') {
    return { ok: true, notionPageId: outcome.write.notionPageId, reused: outcome.reused };
  }

  const shaped = asProjectProperties(outcome.write.properties);
  if (!shaped) return { ok: true, notionPageId: outcome.write.notionPageId, reused: outcome.reused };
  const fields = projectCreateConvexFields(shaped);
  const projectId = await ctx.runMutation(internal.sync.upsert.upsertProject, {
    notionPageId: outcome.write.notionPageId,
    orgId: row.orgId,
    name: fields.name,
    status: fields.status,
    type: fields.type,
    archive: fields.archive,
    publishToWarehaus: fields.publishToWarehaus,
    externalId: fields.externalId,
    source: fields.source,
  });
  await ctx.runMutation(internal.sync.outbox.attachProjectId, { id, projectId });
  return { ok: true, notionPageId: outcome.write.notionPageId, reused: outcome.reused, projectId };
}

export const processOne = internalAction({
  args: { id: v.id('notionOutbox') },
  handler: async (ctx, { id }): Promise<ProcessResult> => execute(ctx, id, new Map()),
});

export const processDue = internalAction({
  args: {},
  handler: async (ctx): Promise<{ processed: number; held: boolean }> => {
    if (!writebackOn()) return { processed: 0, held: true };
    await ctx.runMutation(internal.sync.taskWrite.drainPendingStages, {});
    const now = Date.now();
    const due = await ctx.runQuery(internal.sync.outbox.listDue, { now });
    const schemaCache: SchemaCache = new Map();
    let processed = 0;
    for (const row of due) {
      await execute(ctx, row._id, schemaCache);
      processed += 1;
    }
    return { processed, held: false };
  },
});
