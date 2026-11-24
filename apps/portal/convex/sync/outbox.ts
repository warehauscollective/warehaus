/**
 * Notion outbox rows. This file does not call Notion.
 * The worker in `outboxWork.ts` is the only sender.
 */

import {
  auditEventForOutcome,
  clientCreateEnqueueError,
  isMissingPropertyRejection,
  isNewerEditedTime,
  outboxLeaseUnexpired,
  planIdempotentEnqueue,
  takeOutboxLease,
  taskLiveFieldsWriteError,
  validatePropertyPatch,
  validateTaskStatusUpdate,
  validateWriteback,
  type OutboxKind,
  type OutboxStatus,
  type WriteProperties,
  type WritebackDatabase,
} from '@warehaus/portal-sync';
import { v } from 'convex/values';
import { notionWriteAllowedForTask } from '../_lib/milestoneReview';
import { internal } from '../_generated/api';
import { internalMutation, internalQuery } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { linkTaskToCreateMilestone, milestoneIdFromPayload } from '../_lib/taskMilestoneLink';
import { outboxKind } from '../_lib/outboxKind';
import { writebackAllowed } from './notion';

const actor = v.union(v.literal('staff'), v.literal('clientAdmin'), v.literal('system'));

type EnqueueResult =
  | { ok: false; error: string }
  | {
      ok: true;
      outboxId: Id<'notionOutbox'>;
      duplicate: boolean;
      status: 'queued' | 'inflight' | 'done' | 'failed' | 'dead' | 'conflict';
      resultJson: string | null;
    };

function writebackOn(): boolean {
  return writebackAllowed();
}

function parsePayload(payload: string): { properties: WriteProperties } | { error: string } {
  try {
    const parsed = JSON.parse(payload) as { properties?: WriteProperties };
    if (!parsed.properties || typeof parsed.properties !== 'object' || Array.isArray(parsed.properties)) {
      return { error: 'Outbox payload is missing properties' };
    }
    return { properties: parsed.properties };
  } catch {
    return { error: 'Outbox payload is not valid JSON' };
  }
}

function asDatabase(value: string): WritebackDatabase | null {
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
  return null;
}

/** A row to queue. The caller has already planned and checked it. */
export type OutboxRowInput = {
  idempotencyKey: string;
  kind: OutboxKind;
  orgId: Id<'clients'>;
  database: WritebackDatabase;
  notionPageId?: string;
  expectedLastEditedTime?: string;
  properties: WriteProperties;
  /** Extra payload fields, such as a task create's milestone. */
  payloadExtra?: Record<string, unknown>;
  actor: 'staff' | 'system';
  actorId?: string;
};

export type OutboxRowLookup =
  | { found: false }
  | { found: true; outboxId: Id<'notionOutbox'>; status: OutboxStatus; resultJson: string | null };

/** The row already queued under this key, if any. A read only, so a caller can check before writing. */
export async function findOutboxRow(ctx: MutationCtx, idempotencyKey: string): Promise<OutboxRowLookup> {
  const existing = await ctx.db
    .query('notionOutbox')
    .withIndex('by_idempotencyKey', (q) => q.eq('idempotencyKey', idempotencyKey))
    .unique();
  if (!existing) return { found: false };
  return { found: true, outboxId: existing._id, status: existing.status, resultJson: existing.resultJson ?? null };
}

/**
 * Queue one outbox row in the caller's mutation: dedupe by key, insert,
 * schedule the worker. It checks nothing else; the write policy and the
 * planning are the caller's. An existing key is returned, not written again.
 */
export async function insertOutboxRow(
  ctx: MutationCtx,
  row: OutboxRowInput,
): Promise<{ outboxId: Id<'notionOutbox'>; duplicate: boolean; status: OutboxStatus; resultJson: string | null }> {
  const existing = await findOutboxRow(ctx, row.idempotencyKey);
  if (existing.found) {
    return { outboxId: existing.outboxId, duplicate: true, status: existing.status, resultJson: existing.resultJson };
  }
  const now = Date.now();
  const outboxId = await ctx.db.insert('notionOutbox', {
    idempotencyKey: row.idempotencyKey,
    kind: row.kind,
    orgId: row.orgId,
    database: row.database,
    payload: JSON.stringify({ properties: row.properties, ...(row.payloadExtra ?? {}) }),
    actor: row.actor,
    status: 'queued',
    attempts: 0,
    nextAttemptAt: now,
    createdAt: now,
    ...(row.notionPageId ? { notionPageId: row.notionPageId } : {}),
    ...(row.expectedLastEditedTime ? { expectedLastEditedTime: row.expectedLastEditedTime } : {}),
    ...(row.actorId ? { actorId: row.actorId } : {}),
  });
  await ctx.scheduler.runAfter(0, internal.sync.outboxWork.processOne, { id: outboxId });
  return { outboxId, duplicate: false, status: 'queued', resultJson: null };
}

export const enqueue = internalMutation({
  args: {
    idempotencyKey: v.string(),
    kind: outboxKind,
    orgId: v.id('clients'),
    database: v.string(),
    notionPageId: v.optional(v.string()),
    expectedLastEditedTime: v.optional(v.string()),
    payload: v.string(),
    actor,
    actorId: v.optional(v.string()),
    schedule: v.boolean(),
  },
  handler: async (ctx, args): Promise<EnqueueResult> => {
    if (!notionWriteAllowedForTask({ notionPageId: args.notionPageId })) {
      return { ok: false, error: 'Portal review tasks stay in Convex' };
    }
    const existing = await ctx.db
      .query('notionOutbox')
      .withIndex('by_idempotencyKey', (q) => q.eq('idempotencyKey', args.idempotencyKey))
      .unique();
    const plan = planIdempotentEnqueue(
      existing ? { status: existing.status, notionPageId: existing.notionPageId } : null,
      writebackOn(),
    );
    if (plan.action === 'noop') return { ok: false, error: plan.error };
    if (plan.action === 'reuse') {
      if (!existing) return { ok: false, error: 'Outbox row was missing' };
      return {
        ok: true,
        outboxId: existing._id,
        duplicate: true,
        status: existing.status,
        resultJson: existing.resultJson ?? null,
      };
    }

    const systemInvite =
      args.actor === 'system' && (args.kind === 'setInviteState' || args.kind === 'revert');
    if (args.actor !== 'staff' && !systemInvite) {
      return { ok: false, error: 'Only Warehaus Staff can write to Notion' };
    }

    const parsed = parsePayload(args.payload);
    if ('error' in parsed) return { ok: false, error: parsed.error };
    const database = asDatabase(args.database);
    if (!database) return { ok: false, error: 'Unknown database' };

    const invalid = validateEnqueueKind({
      kind: args.kind,
      database,
      properties: parsed.properties,
      notionPageId: args.notionPageId,
      expectedLastEditedTime: args.expectedLastEditedTime,
    });
    if (invalid) return { ok: false, error: invalid };

    const now = Date.now();
    const outboxId = await ctx.db.insert('notionOutbox', {
      idempotencyKey: args.idempotencyKey,
      kind: args.kind,
      orgId: args.orgId,
      database: args.database,
      payload: args.payload,
      actor: systemInvite ? 'system' : 'staff',
      status: 'queued',
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      ...(args.notionPageId ? { notionPageId: args.notionPageId } : {}),
      ...(args.expectedLastEditedTime ? { expectedLastEditedTime: args.expectedLastEditedTime } : {}),
      ...(args.actorId ? { actorId: args.actorId } : {}),
    });
    if (args.schedule) {
      await ctx.scheduler.runAfter(0, internal.sync.outboxWork.processOne, { id: outboxId });
    }
    return { ok: true, outboxId, duplicate: false, status: 'queued', resultJson: null };
  },
});

function validateEnqueueKind(input: {
  kind: OutboxKind;
  database: WritebackDatabase;
  properties: WriteProperties;
  notionPageId?: string;
  expectedLastEditedTime?: string;
}): string | null {
  if (input.kind === 'task-status') {
    const status = input.properties.Status;
    if (typeof status !== 'string') return 'Status is required';
    const validated = validateTaskStatusUpdate(status);
    if (!validated.ok) return validated.errors.join('; ');
    if (Object.keys(input.properties).some((name) => name !== 'Status')) {
      return 'Task status updates can only set Status';
    }
    if (!input.notionPageId) return 'Updates require a Notion page';
    if (!input.expectedLastEditedTime) return 'Updates require the last read time';
    return null;
  }
  if (input.kind === 'task-stage') {
    const validated = validatePropertyPatch({ database: 'tasks', properties: input.properties });
    if (!validated.ok) return validated.errors.join('; ');
    const allowed = new Set(['Stage', 'GitHub Issue/PR']);
    for (const name of Object.keys(input.properties)) {
      if (!allowed.has(name)) return 'Stage moves cannot change Status';
    }
    if (typeof input.properties.Stage !== 'string') return 'Stage is required';
    if (!input.notionPageId) return 'Updates require a Notion page';
    if (!input.expectedLastEditedTime) return 'Updates require the last read time';
    return null;
  }
  if (input.kind === 'task-description') {
    const validated = validatePropertyPatch({ database: 'tasks', properties: input.properties });
    if (!validated.ok) return validated.errors.join('; ');
    const names = Object.keys(input.properties);
    if (names.length !== 1 || names[0] !== 'Description') {
      return 'Task description updates can only set Description';
    }
    if (typeof input.properties.Description !== 'string') return 'Description is required';
    if (!input.notionPageId) return 'Updates require a Notion page';
    if (!input.expectedLastEditedTime) return 'Updates require the last read time';
    return null;
  }
  if (input.kind === 'task-archive') {
    if (input.database !== 'tasks') return 'Task archive only writes the Tasks database';
    if (!input.notionPageId) return 'Archive requires a Notion page';
    return null;
  }
  if (input.kind === 'task-fields') {
    if (input.database !== 'tasks') return 'Task field updates only write the Tasks database';
    const fieldError = taskLiveFieldsWriteError(input.properties);
    if (fieldError) return fieldError;
    const validated = validatePropertyPatch({ database: 'tasks', properties: input.properties });
    if (!validated.ok) return validated.errors.join('; ');
    if (!input.notionPageId) return 'Updates require a Notion page';
    if (!input.expectedLastEditedTime) return 'Updates require the last read time';
    return null;
  }
  if (input.kind === 'task-date' || input.kind === 'task-resources' || input.kind === 'task-link') {
    if (input.database !== 'tasks') return 'Task changes only write the Tasks database';
    const validated = validatePropertyPatch({ database: 'tasks', properties: input.properties });
    if (!validated.ok) return validated.errors.join('; ');
    if (!input.notionPageId) return 'Updates require a Notion page';
    if (!input.expectedLastEditedTime) return 'Updates require the last read time';
    return null;
  }
  if (input.kind === 'update') {
    const validated = validatePropertyPatch({ database: input.database, properties: input.properties });
    if (!validated.ok) return validated.errors.join('; ');
    if (!input.notionPageId) return 'Updates require a Notion page';
    if (!input.expectedLastEditedTime) return 'Updates require the last read time';
    return null;
  }
  if (input.kind === 'project-create') {
    if (input.database !== 'projects') return 'Project create only writes the Projects database';
    const validated = validatePropertyPatch({ database: 'projects', properties: input.properties });
    if (!validated.ok) return validated.errors.join('; ');
    const client = input.properties.Client;
    if (typeof input.properties.Name !== 'string' || input.properties.Name.length === 0) {
      return 'Name is required';
    }
    if (!Array.isArray(client) || client.length !== 1 || typeof client[0] !== 'string') {
      return 'Client is required';
    }
    if (typeof input.properties['Publish to Warehaus'] !== 'boolean') {
      return 'Publish to Warehaus must be true or false';
    }
    if (input.properties.Archive !== false) return 'Archive must be off';
    if (input.properties.Source !== 'portal') return 'Source must be portal';
    if (typeof input.properties['External ID'] !== 'string') return 'External ID is required';
    const allowed = new Set([
      'Name',
      'Client',
      'Publish to Warehaus',
      'Archive',
      'Source',
      'External ID',
    ]);
    for (const name of Object.keys(input.properties)) {
      if (!allowed.has(name)) return `${name} is not part of project create`;
    }
    return null;
  }
  if (input.kind === 'client-create') {
    if (input.database !== 'clients') return 'Client create only writes the Clients database';
    return clientCreateEnqueueError(input.properties);
  }
  if (input.kind === 'createInvite') {
    if (input.database !== 'contacts') return 'Invites only write the Contacts database';
    const validated = validateWriteback({
      database: 'contacts',
      properties: input.properties,
      actor: 'staff',
    });
    if (!validated.ok) return validated.errors.join('; ');
    if (input.properties['Invite Status'] !== 'Pending') return 'Invite Status must be Pending';
    if (input.properties['Portal Access'] !== 'Disabled') return 'Portal Access must be Disabled';
    return null;
  }
  if (input.kind === 'setInviteState' || input.kind === 'revert') {
    if (input.database !== 'contacts') return 'Invites only write the Contacts database';
    const validated = validatePropertyPatch({ database: 'contacts', properties: input.properties });
    if (!validated.ok) return validated.errors.join('; ');
    if (!input.notionPageId) return 'State changes need an existing Notion page';
    return null;
  }
  if (input.kind === 'create') {
    const validated = validateWriteback({
      database: input.database,
      properties: input.properties,
      actor: 'staff',
    });
    if (!validated.ok) return validated.errors.join('; ');
    return null;
  }
  return 'Unknown outbox kind';
}

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
    // A crash after the PATCH and before applyOutcome comes back as conflict.
    const inflight = await ctx.db
      .query('notionOutbox')
      .withIndex('by_status_nextAttemptAt', (q) =>
        q.eq('status', 'inflight').lte('nextAttemptAt', now),
      )
      .take(10);
    const reclaimable = inflight.filter(
      (row) => !outboxLeaseUnexpired(row.claimedAt, now) && row.nextAttemptAt <= now,
    );
    return [...reclaimable, ...queued, ...failed].slice(0, 10);
  },
});

export const get = internalQuery({
  args: { id: v.id('notionOutbox') },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

export const clientNotionId = internalQuery({
  args: { orgId: v.id('clients') },
  handler: async (ctx, { orgId }) => {
    const client = await ctx.db.get(orgId);
    return client?.notionPageId ?? null;
  },
});

export const claim = internalMutation({
  args: { id: v.id('notionOutbox') },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (!row) return { claimed: false as const, reason: 'missing' as const };
    const now = Date.now();
    if (row.status === 'done') {
      return { claimed: false as const, reason: 'done' as const, resultJson: row.resultJson ?? null };
    }
    const decision = takeOutboxLease(row, now);
    if (!decision.claimed) {
      if (decision.reason === 'dead' || decision.reason === 'conflict') {
        return { claimed: false as const, reason: decision.reason, lastError: row.lastError ?? null };
      }
      return { claimed: false as const, reason: decision.reason };
    }
    await ctx.db.patch(id, { status: 'inflight', claimedAt: decision.item.claimedAt });
    return { claimed: true as const };
  },
});

export const release = internalMutation({
  args: { id: v.id('notionOutbox') },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (!row || row.status !== 'inflight') return;
    await ctx.db.patch(id, { status: 'queued', claimedAt: undefined });
  },
});

/** Task name for a staff notice. Never falls back to the idempotency key. */
async function noticeSubject(
  ctx: MutationCtx,
  row: { notionPageId?: string; payload: string; database: string },
): Promise<string> {
  if (row.notionPageId) {
    const found = await ctx.db
      .query('tasks')
      .withIndex('by_notionPageId', (q) => q.eq('notionPageId', row.notionPageId!))
      .take(1);
    const name = found[0]?.name?.trim();
    if (name) return name;
  }
  try {
    const parsed = JSON.parse(row.payload) as { properties?: { Name?: unknown } };
    const name = parsed.properties?.Name;
    if (typeof name === 'string' && name.trim() && !name.includes(':')) return name.trim();
  } catch {
    // Payload is not a task name.
  }
  return row.database === 'tasks' ? 'This task' : 'A task';
}

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
        kind: v.literal('conflict'),
        reason: v.string(),
        expectedLastEditedTime: v.string(),
        observedLastEditedTime: v.union(v.string(), v.null()),
      }),
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
    const notify = async (message: string, edgeCase: string) => {
      if (row.staffNotifiedAt != null) return;
      await ctx.runMutation(internal.invitesSync.recordStaffNotice, {
        orgId: row.orgId,
        message,
        edgeCase,
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
    // ADR-0003: a task change is already saved in the portal and is not rolled
    // back, so every failed task write tells staff.
    const savedTaskChange = row.database === 'tasks' && row.kind !== 'create';

    const releaseHeldInvite = async () => {
      if (row.kind !== 'setInviteState') return;
      await ctx.runMutation(internal.invites.releaseHeldToken, { outboxId: row._id });
    };

    if (args.outcome.kind === 'dead') {
      await ctx.db.patch(row._id, { status: 'dead', lastError: args.outcome.error, claimedAt: undefined });
      if (args.outcome.notifyStaff || savedTaskChange) {
        await notify(`${await noticeSubject(ctx, row)} could not be saved to Notion`, 'sync');
      }
      await releaseHeldInvite();
      return;
    }

    if (args.outcome.kind === 'retry') {
      await ctx.db.patch(row._id, {
        status: 'failed',
        attempts: args.outcome.attempts,
        nextAttemptAt: args.outcome.nextAttemptAt,
        lastError: args.outcome.lastError,
        claimedAt: undefined,
      });
      if (args.outcome.notifyStaff) {
        await notify(`${await noticeSubject(ctx, row)} needs staff attention`, 'sync');
      }
      return;
    }

    if (args.outcome.kind === 'rejected') {
      await ctx.db.patch(row._id, { status: 'dead', lastError: args.outcome.reason, claimedAt: undefined });
      await ctx.db.insert('auditEvents', {
        orgId: row.orgId,
        actorKind: 'system',
        action: 'outbox.rejected',
        notionPageId: row.notionPageId,
        after: args.outcome.reason,
        createdAt: now,
      });
      if (isMissingPropertyRejection(args.outcome.reason)) {
        await notify(`${await noticeSubject(ctx, row)}: ${args.outcome.reason}`, 'missing-property');
      } else if (savedTaskChange) {
        await notify(`${await noticeSubject(ctx, row)} was saved in the portal but Notion refused it`, 'sync');
      }
      await releaseHeldInvite();
      return;
    }

    if (args.outcome.kind === 'conflict') {
      const after = auditEventForOutcome({
        outcome: 'conflict',
        reason: args.outcome.reason,
        expectedLastEditedTime: args.outcome.expectedLastEditedTime,
        observedLastEditedTime: args.outcome.observedLastEditedTime,
      });
      await ctx.db.patch(row._id, {
        status: 'conflict',
        lastError: args.outcome.reason,
        claimedAt: undefined,
      });
      await ctx.db.insert('auditEvents', {
        orgId: row.orgId,
        actorKind: 'system',
        actorId: row.actorId,
        action: after?.action ?? 'outbox.conflict',
        notionPageId: row.notionPageId,
        before: args.outcome.expectedLastEditedTime,
        after: after?.after ?? args.outcome.reason,
        createdAt: now,
      });
      await notify(`${await noticeSubject(ctx, row)} conflicted with a newer edit`, 'conflict');
      await releaseHeldInvite();
      return;
    }

    const propertiesJson = args.outcome.propertiesJson;
    const properties = JSON.parse(propertiesJson) as WriteProperties;
    const audit = auditEventForOutcome({
      outcome: 'confirmed',
      reused: args.outcome.reused,
      write: {
        notionPageId: args.outcome.notionPageId,
        lastEditedTime: args.outcome.lastEditedTime,
        properties,
      },
    });
    if (row.kind === 'task-stage') {
      const fromPayload = (() => {
        try {
          const parsed = JSON.parse(row.payload) as { properties?: { Stage?: unknown } };
          return typeof parsed.properties?.Stage === 'string' ? parsed.properties.Stage : null;
        } catch {
          return null;
        }
      })();
      const written = typeof properties.Stage === 'string' ? properties.Stage : fromPayload;
      if (written && row.notionPageId) {
        const task = await ctx.db
          .query('tasks')
          .withIndex('by_notionPageId', (q) => q.eq('notionPageId', row.notionPageId!))
          .unique();
        if (task) {
          if (task.stage === written) {
            const responseTime = args.outcome.lastEditedTime;
            const pr = properties['GitHub Issue/PR'];
            await ctx.db.patch(task._id, {
              stageSynced: written,
              stagePendingAt: undefined,
              stagePendingBaseEditedTime: undefined,
              stagePendingPullRequest: undefined,
              stagePendingBy: undefined,
              ...(isNewerEditedTime(responseTime, task.lastEditedTime ?? null) && responseTime
                ? { lastEditedTime: responseTime }
                : {}),
              ...(typeof pr === 'string' ? { pullRequestUrl: pr } : {}),
            });
          } else if (args.outcome.lastEditedTime) {
            await ctx.db.patch(task._id, {
              stagePendingBaseEditedTime: args.outcome.lastEditedTime,
            });
          }
        }
      }
    }
    // ADR-0003: every confirmed task write moves the task's last edit time
    // forward, so the next portal change is checked against Notion's newest edit.
    if (row.database === 'tasks' && row.kind !== 'create' && row.notionPageId && args.outcome.lastEditedTime) {
      const responseTime = args.outcome.lastEditedTime;
      const task = await ctx.db
        .query('tasks')
        .withIndex('by_notionPageId', (q) => q.eq('notionPageId', row.notionPageId!))
        .unique();
      if (task && isNewerEditedTime(responseTime, task.lastEditedTime ?? null)) {
        await ctx.db.patch(task._id, { lastEditedTime: responseTime });
      }
    }
    if (row.kind === 'create' && row.database === 'tasks') {
      const milestoneId = milestoneIdFromPayload(row.payload);
      const createdPageId = args.outcome.notionPageId;
      if (milestoneId) {
        const task = await ctx.db
          .query('tasks')
          .withIndex('by_notionPageId', (q) => q.eq('notionPageId', createdPageId))
          .unique();
        if (task) await linkTaskToCreateMilestone(ctx, task, milestoneId);
      }
    }
    await ctx.db.patch(row._id, {
      status: 'done',
      notionPageId: args.outcome.notionPageId,
      claimedAt: undefined,
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
      lastValues: propertiesJson,
      updatedAt: now,
      ...(args.outcome.lastEditedTime ? { lastEditedTime: args.outcome.lastEditedTime } : {}),
    };
    if (existing) await ctx.db.patch(existing._id, state);
    else await ctx.db.insert('notionWriteState', state);
    await ctx.db.insert('auditEvents', {
      orgId: row.orgId,
      actorKind: row.actor === 'clientAdmin' ? 'clientAdmin' : row.actor === 'staff' ? 'staff' : 'system',
      actorId: row.actorId,
      action: audit?.action ?? 'outbox.confirmed',
      notionPageId: args.outcome.notionPageId,
      after: audit?.after ?? propertiesJson,
      createdAt: now,
    });
  },
});

export const attachProjectId = internalMutation({
  args: { id: v.id('notionOutbox'), projectId: v.id('projects') },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row?.resultJson) return;
    const parsed = JSON.parse(row.resultJson) as Record<string, unknown>;
    await ctx.db.patch(args.id, {
      resultJson: JSON.stringify({ ...parsed, projectId: args.projectId }),
    });
  },
});

export const attachClientId = internalMutation({
  args: { id: v.id('notionOutbox'), clientId: v.id('clients') },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row?.resultJson) return;
    const parsed = JSON.parse(row.resultJson) as Record<string, unknown>;
    await ctx.db.patch(args.id, {
      orgId: args.clientId,
      resultJson: JSON.stringify({ ...parsed, clientId: args.clientId }),
    });
  },
});
