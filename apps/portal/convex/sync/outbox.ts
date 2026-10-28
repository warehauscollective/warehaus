/**
 * Notion outbox rows. This file does not call Notion.
 * The worker in `outboxWork.ts` is the only sender.
 */

import {
  auditEventForOutcome,
  isNotionProjectCreateEnabled,
  isNotionWritebackEnabled,
  planIdempotentEnqueue,
  validatePropertyPatch,
  validateTaskStatusUpdate,
  validateWriteback,
  PROJECT_CREATE_OFF_ERROR,
  type WriteProperties,
  type WritebackDatabase,
} from '@warehaus/portal-sync';
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { internalMutation, internalQuery } from '../_generated/server';
import type { Id } from '../_generated/dataModel';

const INFLIGHT_MS = 120_000;

const actor = v.union(v.literal('staff'), v.literal('clientAdmin'), v.literal('system'));

type EnqueueResult =
  | { ok: false; error: string }
  | { ok: true; outboxId: Id<'notionOutbox'>; duplicate: boolean };

function writebackOn(): boolean {
  return isNotionWritebackEnabled(process.env.NOTION_WRITEBACK_ENABLED);
}

function projectCreateOn(): boolean {
  return isNotionProjectCreateEnabled(process.env.NOTION_PROJECT_CREATE_ENABLED);
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

export const enqueue = internalMutation({
  args: {
    idempotencyKey: v.string(),
    kind: v.string(),
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
      return { ok: true, outboxId: existing._id, duplicate: true };
    }

    const systemInvite =
      args.actor === 'system' && (args.kind === 'setInviteState' || args.kind === 'revert');
    if (args.actor !== 'staff' && !systemInvite) {
      return { ok: false, error: 'Only Warehaus Staff can write to Notion' };
    }

    if (args.kind === 'project-create' && !projectCreateOn()) {
      return { ok: false, error: PROJECT_CREATE_OFF_ERROR };
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
    return { ok: true, outboxId, duplicate: false };
  },
});

function validateEnqueueKind(input: {
  kind: string;
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
    if (input.properties['Publish to Warehaus'] !== true) return 'Publish to Warehaus must be on';
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
    return [...queued, ...failed];
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
    if (row.status === 'dead' || row.status === 'conflict') {
      return { claimed: false as const, reason: row.status, lastError: row.lastError ?? null };
    }
    if (row.status === 'inflight' && row.claimedAt != null && now - row.claimedAt < INFLIGHT_MS) {
      return { claimed: false as const, reason: 'inflight' as const };
    }
    await ctx.db.patch(id, { status: 'inflight', claimedAt: now });
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
      await ctx.db.patch(row._id, { status: 'dead', lastError: args.outcome.error, claimedAt: undefined });
      if (args.outcome.notifyStaff) await notify(`Notion write ${row.idempotencyKey} was marked dead after 24h`);
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
      if (args.outcome.notifyStaff) await notify(`Notion write ${row.idempotencyKey} needs staff attention`);
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
      return;
    }

    const propertiesJson = args.outcome.propertiesJson;
    const audit = auditEventForOutcome({
      outcome: 'confirmed',
      reused: args.outcome.reused,
      write: {
        notionPageId: args.outcome.notionPageId,
        lastEditedTime: args.outcome.lastEditedTime,
        properties: JSON.parse(propertiesJson) as WriteProperties,
      },
    });
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
