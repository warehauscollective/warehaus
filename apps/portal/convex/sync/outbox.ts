/**
 * Notion outbox. The worker does not insert contacts, tokens, or any other
 * row that grants access. A confirmed result is stored for a later handler.
 */

import {
  isPortalSelfWrite,
  observedFromNotionPage,
  readNotionPlain,
  runOutboxAttempt,
  type OutboxItem,
  type WritebackDatabase,
  type WriteProperties,
} from '@warehaus/portal-sync';
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { internalAction, internalMutation, internalQuery } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { isNotionWritebackEnabled } from '../_lib/writeAuthz';
import { searchNotionPages, writeNotionPage } from './notionWrite';

const actor = v.union(v.literal('staff'), v.literal('clientAdmin'), v.literal('system'));

export const enqueue = internalMutation({
  args: {
    idempotencyKey: v.string(),
    kind: v.string(),
    orgId: v.id('clients'),
    database: v.string(),
    notionPageId: v.optional(v.string()),
    payload: v.string(),
    actor,
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('notionOutbox')
      .withIndex('by_idempotencyKey', (q) => q.eq('idempotencyKey', args.idempotencyKey))
      .unique();
    if (existing) return existing._id;
    const now = Date.now();
    return ctx.db.insert('notionOutbox', {
      idempotencyKey: args.idempotencyKey,
      kind: args.kind,
      orgId: args.orgId,
      database: args.database,
      payload: args.payload,
      actor: args.actor,
      status: 'queued',
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      ...(args.notionPageId ? { notionPageId: args.notionPageId } : {}),
    });
  },
});

export const listDue = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const queued = await ctx.db
      .query('notionOutbox')
      .withIndex('by_status_nextAttemptAt', (q) => q.eq('status', 'queued').lte('nextAttemptAt', now))
      .take(10);
    const failed = await ctx.db
      .query('notionOutbox')
      .withIndex('by_status_nextAttemptAt', (q) => q.eq('status', 'failed').lte('nextAttemptAt', now))
      .take(10);
    return [...queued, ...failed];
  },
});

export const getWriteState = internalQuery({
  args: { notionPageId: v.string() },
  handler: async (ctx, { notionPageId }) => {
    return ctx.db
      .query('notionWriteState')
      .withIndex('by_notionPageId', (q) => q.eq('notionPageId', notionPageId))
      .unique();
  },
});

export const applyOutcome = internalMutation({
  args: {
    id: v.id('notionOutbox'),
    outcome: v.union(
      v.object({ kind: v.literal('wait') }),
      v.object({ kind: v.literal('dead'), notifyStaff: v.boolean(), error: v.string() }),
      v.object({
        kind: v.literal('retry'),
        attempts: v.number(),
        nextAttemptAt: v.number(),
        lastError: v.string(),
        notifyStaff: v.boolean(),
      }),
      v.object({ kind: v.literal('rejected'), reason: v.string() }),
      v.object({
        kind: v.literal('confirmed'),
        notionPageId: v.string(),
        lastEditedTime: v.union(v.string(), v.null()),
        propertiesJson: v.string(),
        reused: v.boolean(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) return;
    const now = Date.now();
    const notify = async (message: string) => {
      if (row.staffNotifiedAt != null) return;
      await ctx.db.insert('notices', {
        orgId: row.orgId,
        audience: 'staff',
        message,
        createdAt: now,
      });
      await ctx.db.insert('auditEvents', {
        orgId: row.orgId,
        actorKind: 'system',
        action: 'outbox.staffNotice',
        notionPageId: row.notionPageId,
        after: message,
        createdAt: now,
      });
      await ctx.db.patch(row._id, { staffNotifiedAt: now });
    };

    if (args.outcome.kind === 'wait') return;

    if (args.outcome.kind === 'dead') {
      await ctx.db.patch(row._id, { status: 'dead', lastError: args.outcome.error });
      if (args.outcome.notifyStaff) await notify(`Notion write ${row.idempotencyKey} was marked dead after 24h`);
      return;
    }

    if (args.outcome.kind === 'retry') {
      await ctx.db.patch(row._id, {
        status: 'failed',
        attempts: args.outcome.attempts,
        nextAttemptAt: args.outcome.nextAttemptAt,
        lastError: args.outcome.lastError,
      });
      if (args.outcome.notifyStaff) {
        await notify(`Notion write ${row.idempotencyKey} needs staff attention`);
      }
      return;
    }

    if (args.outcome.kind === 'rejected') {
      await ctx.db.patch(row._id, { status: 'dead', lastError: args.outcome.reason });
      await ctx.db.insert('auditEvents', {
        orgId: row.orgId,
        actorKind: 'system',
        action: 'outbox.rejected',
        notionPageId: row.notionPageId,
        after: args.outcome.reason,
        createdAt: now,
      });
      return;
    }

    await ctx.db.patch(row._id, {
      status: 'done',
      notionPageId: args.outcome.notionPageId,
      resultJson: JSON.stringify({
        notionPageId: args.outcome.notionPageId,
        lastEditedTime: args.outcome.lastEditedTime,
        reused: args.outcome.reused,
      }),
    });
    const pageId = args.outcome.notionPageId;
    const existing = await ctx.db
      .query('notionWriteState')
      .withIndex('by_notionPageId', (q) => q.eq('notionPageId', pageId))
      .unique();
    const state = {
      notionPageId: pageId,
      orgId: row.orgId,
      database: row.database,
      lastValues: args.outcome.propertiesJson,
      updatedAt: now,
      ...(args.outcome.lastEditedTime ? { lastEditedTime: args.outcome.lastEditedTime } : {}),
    };
    if (existing) await ctx.db.patch(existing._id, state);
    else await ctx.db.insert('notionWriteState', state);
    await ctx.db.insert('auditEvents', {
      orgId: row.orgId,
      actorKind: row.actor === 'clientAdmin' ? 'clientAdmin' : row.actor === 'staff' ? 'staff' : 'system',
      action: 'outbox.confirmed',
      notionPageId: args.outcome.notionPageId,
      after: args.outcome.propertiesJson,
      createdAt: now,
    });
  },
});

function parseProperties(payload: string): WriteProperties {
  const parsed = JSON.parse(payload) as { properties?: WriteProperties };
  return parsed.properties ?? {};
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

/**
 * Sends due outbox rows. Returns immediately when write-back is off,
 * without calling Notion.
 */
export const processDue = internalAction({
  args: {},
  handler: async (ctx) => {
    if (!isNotionWritebackEnabled()) {
      return { processed: 0, held: true as const };
    }
    const now = Date.now();
    const due = await ctx.runQuery(internal.sync.outbox.listDue, { now });
    let processed = 0;
    for (const row of due) {
      const database = asDatabase(row.database);
      const properties = parseProperties(row.payload);
      const item: OutboxItem = {
        idempotencyKey: row.idempotencyKey,
        kind: row.kind,
        database,
        orgId: row.orgId,
        notionPageId: row.notionPageId,
        properties,
        status: row.status,
        attempts: row.attempts,
        nextAttemptAt: row.nextAttemptAt,
        createdAt: row.createdAt,
        lastError: row.lastError,
        staffNotifiedAt: row.staffNotifiedAt,
      };
      const client = await ctx.runQuery(internal.sync.outbox.clientNotionId, { orgId: row.orgId });
      const outcome = await runOutboxAttempt({
        item,
        nowMs: now,
        writebackEnabled: true,
        actor: row.actor,
        search: async (plan) => {
          if (database === 'activity') return [];
          const property = plan.property;
          if (property !== 'Slug' && property !== 'Email' && property !== 'External ID') {
            return [];
          }
          const hits = await searchNotionPages(database, { property, value: plan.value });
          return hits.map((hit) => ({
            notionPageId: hit.notionPageId,
            sameOrg: sameOrg(database, hit.properties, client),
          }));
        },
        write: async (request) => {
          if (database === 'activity') {
            return { ok: false, status: 400, error: 'Activity has no portal create path' };
          }
          return writeNotionPage(database, request);
        },
      });
      if (outcome.outcome === 'held' || outcome.outcome === 'wait') {
        await ctx.runMutation(internal.sync.outbox.applyOutcome, { id: row._id, outcome: { kind: 'wait' } });
      } else if (outcome.outcome === 'dead') {
        await ctx.runMutation(internal.sync.outbox.applyOutcome, {
          id: row._id,
          outcome: { kind: 'dead', notifyStaff: outcome.notifyStaff, error: outcome.error },
        });
      } else if (outcome.outcome === 'retry') {
        await ctx.runMutation(internal.sync.outbox.applyOutcome, {
          id: row._id,
          outcome: {
            kind: 'retry',
            attempts: outcome.attempts,
            nextAttemptAt: outcome.nextAttemptAt,
            lastError: outcome.lastError,
            notifyStaff: outcome.notifyStaff,
          },
        });
      } else if (outcome.outcome === 'rejected') {
        await ctx.runMutation(internal.sync.outbox.applyOutcome, {
          id: row._id,
          outcome: { kind: 'rejected', reason: outcome.reason },
        });
      } else {
        await ctx.runMutation(internal.sync.outbox.applyOutcome, {
          id: row._id,
          outcome: {
            kind: 'confirmed',
            notionPageId: outcome.write.notionPageId,
            lastEditedTime: outcome.write.lastEditedTime,
            propertiesJson: JSON.stringify(outcome.write.properties),
            reused: outcome.reused,
          },
        });
        if (row.kind === 'createInvite' || row.kind === 'setInviteState') {
          const issued = await ctx.runMutation(internal.invites.issueTokenAfterConfirm, {
            outboxId: row._id,
            notionPageId: outcome.write.notionPageId,
          });
          if (issued.issued && issued.raw && issued.to && issued.name) {
            await ctx.runAction(internal.invites.sendIssuedInvite, {
              to: issued.to,
              rawToken: issued.raw,
              name: issued.name,
            });
          }
        }
      }
      processed += 1;
    }
    return { processed, held: false as const };
  },
});

export const clientNotionId = internalQuery({
  args: { orgId: v.id('clients') },
  handler: async (ctx, { orgId }) => {
    const client = await ctx.db.get(orgId);
    return client?.notionPageId ?? null;
  },
});

function sameOrg(
  database: WritebackDatabase,
  properties: Record<string, unknown>,
  clientNotionPageId: string | null,
): boolean {
  if (database === 'clients') return true;
  // External IDs are global (`wh_prj_`, `wh_tsk_`, `wh_res_`, `wh_doc_`). A hit is the same page.
  if (database !== 'contacts') return true;
  if (!clientNotionPageId) return false;
  const ids = readNotionPlain(properties['Client Company']);
  return Array.isArray(ids) && ids.includes(clientNotionPageId);
}

export function pageIsSelfWrite(
  pageProperties: Record<string, unknown>,
  lastValuesJson: string,
): boolean {
  let lastWritten: WriteProperties;
  try {
    lastWritten = JSON.parse(lastValuesJson) as WriteProperties;
  } catch {
    return false;
  }
  const fields = Object.keys(lastWritten);
  return isPortalSelfWrite({
    observed: observedFromNotionPage(pageProperties, fields),
    lastWritten,
    fields,
  });
}

export type OutboxId = Id<'notionOutbox'>;
