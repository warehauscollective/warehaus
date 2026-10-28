/**
 * Read-side invite placement. Records notices and kills tokens in Convex.
 * Notion reverts go through the shared outbox and are a no-op while
 * NOTION_WRITEBACK_ENABLED is not exactly "true".
 */

import type { ContactSyncAction, InviteStatus } from '@warehaus/portal-sync';
import { isPortalSelfWrite, revertIdempotencyKey } from '@warehaus/portal-sync';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from './_generated/server';
import { adminMutation, adminQuery } from './_lib/wrappers';
import { asClientInviteRole } from './_lib/inviteFlow';
import { revertAllowed, REVERT_WINDOW_MS } from './_lib/revertLimit';
import { isDuplicateNotice } from './_lib/noticeDedupe';
import { isNotionWritebackEnabled } from './_lib/writeAuthz';

const inviteStatus = v.union(
  v.literal('Pending'),
  v.literal('Accepted'),
  v.literal('Declined'),
  v.literal('Expired'),
  v.literal('Revoked'),
);

const role = v.union(
  v.literal('Client Admin'),
  v.literal('Client Member'),
  v.literal('Warehaus Staff'),
);

function asInviteStatus(value: unknown): InviteStatus | undefined {
  if (
    value === 'Pending' ||
    value === 'Accepted' ||
    value === 'Declined' ||
    value === 'Expired' ||
    value === 'Revoked'
  ) {
    return value;
  }
  return undefined;
}

export const contactSyncContext = internalQuery({
  args: { notionPageId: v.string() },
  handler: async (ctx, { notionPageId }) => {
    const state = await ctx.db
      .query('notionWriteState')
      .withIndex('by_notionPageId', (q) => q.eq('notionPageId', notionPageId))
      .unique();
    let lastWritten: Record<string, unknown> = {};
    if (state) {
      try {
        lastWritten = JSON.parse(state.lastValues) as Record<string, unknown>;
      } catch {
        lastWritten = {};
      }
    }
    const tokens = await ctx.db
      .query('inviteTokens')
      .withIndex('by_contactNotionPageId', (q) => q.eq('contactNotionPageId', notionPageId))
      .collect();
    const now = Date.now();
    const live = tokens.find((token) => token.status === 'live' && token.expiresAt > now);
    const used = tokens.some((token) => token.status === 'used');
    return {
      prevInviteStatus: asInviteStatus(lastWritten['Invite Status']) ?? null,
      liveToken: live ? { clientNotionPageId: live.clientNotionPageId } : null,
      verifiedAcceptance: used,
      lastWritten,
    };
  },
});

async function noticeReadAt(ctx: QueryCtx, noticeId: Id<'notices'>, contactId: Id<'contacts'>) {
  const read = await ctx.db
    .query('noticeReads')
    .withIndex('by_noticeId_contactId', (q) => q.eq('noticeId', noticeId).eq('contactId', contactId))
    .unique();
  return read?.readAt ?? null;
}

async function markNoticeReadForContact(
  ctx: MutationCtx,
  noticeId: Id<'notices'>,
  contactId: Id<'contacts'>,
  readAt: number,
) {
  const existing = await noticeReadAt(ctx, noticeId, contactId);
  if (existing != null) return;
  await ctx.db.insert('noticeReads', { noticeId, contactId, readAt });
}

export const listStaffNotices = adminQuery({
  args: {},
  handler: async (ctx) => {
    const contactId = ctx.identity.contactId as Id<'contacts'>;
    const rows = await ctx.db
      .query('notices')
      .withIndex('by_audience_createdAt', (q) => q.eq('audience', 'staff'))
      .order('desc')
      .take(50);
    const listed = [];
    for (const row of rows) {
      const readAt = await noticeReadAt(ctx, row._id, contactId);
      listed.push({
        id: row._id,
        message: row.message,
        createdAt: row.createdAt,
        readAt,
        edgeCase: row.edgeCase ?? null,
        unread: readAt == null,
      });
    }
    return listed;
  },
});

export const markNoticeRead = adminMutation({
  args: { noticeId: v.id('notices') },
  handler: async (ctx, { noticeId }) => {
    const row = await ctx.db.get(noticeId);
    if (!row || row.audience !== 'staff') return { ok: false as const };
    await markNoticeReadForContact(ctx, noticeId, ctx.identity.contactId as Id<'contacts'>, Date.now());
    return { ok: true as const };
  },
});

export const markAllNoticesRead = adminMutation({
  args: {},
  handler: async (ctx) => {
    const contactId = ctx.identity.contactId as Id<'contacts'>;
    const rows = await ctx.db
      .query('notices')
      .withIndex('by_audience_createdAt', (q) => q.eq('audience', 'staff'))
      .order('desc')
      .take(50);
    const now = Date.now();
    for (const row of rows) {
      await markNoticeReadForContact(ctx, row._id, contactId, now);
    }
    return { ok: true as const };
  },
});

type StaffNoticeInput = {
  orgId: Id<'clients'>;
  message: string;
  edgeCase?: string;
  contactNotionPageId?: string;
};

/** Insert only when this audience, edge, contact, and message are new. Read state is ignored. */
export async function insertStaffNotice(ctx: MutationCtx, args: StaffNoticeInput): Promise<boolean> {
  const existing = await ctx.db
    .query('notices')
    .withIndex('by_orgId', (q) => q.eq('orgId', args.orgId))
    .collect();
  if (
    isDuplicateNotice(existing, {
      audience: 'staff',
      orgId: args.orgId,
      message: args.message,
      edgeCase: args.edgeCase ?? null,
      contactNotionPageId: args.contactNotionPageId ?? null,
    })
  ) {
    return false;
  }
  await ctx.db.insert('notices', {
    orgId: args.orgId,
    audience: 'staff',
    message: args.message,
    createdAt: Date.now(),
    ...(args.edgeCase ? { edgeCase: args.edgeCase } : {}),
    ...(args.contactNotionPageId ? { contactNotionPageId: args.contactNotionPageId } : {}),
  });
  return true;
}

/** Staff inbox row. Sync, conflict, unknown Stage, and invite state share one rule. */
export const recordStaffNotice = internalMutation({
  args: {
    orgId: v.id('clients'),
    message: v.string(),
    edgeCase: v.optional(v.string()),
    contactNotionPageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const inserted = await insertStaffNotice(ctx, args);
    return { inserted };
  },
});

export const applyContactRead = internalMutation({
  args: {
    notionPageId: v.string(),
    orgId: v.optional(v.id('clients')),
    name: v.string(),
    email: v.string(),
    role,
    source: v.optional(v.string()),
    notionLastEditedTime: v.optional(v.string()),
    placement: v.union(
      v.literal('UPSERT_CONTACT'),
      v.literal('UPSERT_PENDING_INVITE'),
      v.literal('SKIP_AND_DROP_PENDING'),
    ),
    inviteStatus: v.optional(inviteStatus),
    actionsJson: v.string(),
    observedJson: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const actions = JSON.parse(args.actionsJson) as ContactSyncAction[];
    const observed = JSON.parse(args.observedJson) as Record<string, unknown>;
    const state = await ctx.db
      .query('notionWriteState')
      .withIndex('by_notionPageId', (q) => q.eq('notionPageId', args.notionPageId))
      .unique();
    let selfWrite = false;
    if (state) {
      try {
        const lastWritten = JSON.parse(state.lastValues) as Record<string, unknown>;
        const fields = Object.keys(lastWritten);
        selfWrite = isPortalSelfWrite({
          observed: observed as Record<string, string | number | boolean | string[] | null>,
          lastWritten: lastWritten as Record<string, string | number | boolean | string[] | null>,
          fields,
        });
      } catch {
        selfWrite = false;
      }
    }

    const orgId = args.orgId;
    if (!selfWrite && orgId) {
      for (const action of actions) {
        if (action.type === 'notice') {
          await insertStaffNotice(ctx, {
            orgId,
            message: action.message,
            contactNotionPageId: args.notionPageId,
            edgeCase: String(action.caseId),
          });
        }
        await ctx.db.insert('auditEvents', {
          orgId,
          actorKind: 'notionEdit',
          action: `invite.case${'caseId' in action ? action.caseId : ''}.${action.type}`,
          notionPageId: args.notionPageId,
          after: JSON.stringify(action),
          createdAt: now,
        });
        if (action.type === 'revert' && isNotionWritebackEnabled()) {
          const since = now - REVERT_WINDOW_MS;
          const prior = await ctx.db
            .query('auditEvents')
            .withIndex('by_notionPageId', (q) => q.eq('notionPageId', args.notionPageId))
            .collect();
          const attempts = prior.filter(
            (event) => event.action === `invite.revert.${action.field}` && event.createdAt >= since,
          ).length;
          if (!revertAllowed(attempts)) {
            const edgeCase = `revert-limit:${action.field}`;
            const notices = await ctx.db
              .query('notices')
              .withIndex('by_orgId', (q) => q.eq('orgId', orgId))
              .collect();
            const alerted = notices.some(
              (notice) =>
                notice.edgeCase === edgeCase &&
                notice.contactNotionPageId === args.notionPageId &&
                notice.createdAt >= since,
            );
            if (!alerted) {
              await ctx.db.insert('notices', {
                orgId,
                audience: 'staff',
                message: `Stopped reverting ${action.field} on ${args.notionPageId} after 3 attempts in an hour.`,
                contactNotionPageId: args.notionPageId,
                edgeCase,
                createdAt: now,
              });
            }
          } else {
            const key = revertIdempotencyKey(
              args.notionPageId,
              action.field,
              args.notionLastEditedTime ?? 'unknown',
            );
            const properties =
              action.field === 'Client Company' && action.value
                ? { 'Client Company': [action.value] }
                : { [action.field]: action.value ?? '' };
            await ctx.runMutation(internal.sync.outbox.enqueue, {
              idempotencyKey: key,
              kind: 'revert',
              orgId,
              database: 'contacts',
              notionPageId: args.notionPageId,
              payload: JSON.stringify({ properties }),
              actor: 'system' as const,
              schedule: true,
              ...(args.notionLastEditedTime ? { expectedLastEditedTime: args.notionLastEditedTime } : {}),
            });
            await ctx.db.insert('auditEvents', {
              orgId,
              actorKind: 'system',
              action: `invite.revert.${action.field}`,
              notionPageId: args.notionPageId,
              after: JSON.stringify(action),
              createdAt: now,
            });
          }
        }
        if (action.type === 'killToken') {
          const tokens = await ctx.db
            .query('inviteTokens')
            .withIndex('by_contactNotionPageId', (q) => q.eq('contactNotionPageId', args.notionPageId))
            .collect();
          for (const token of tokens) {
            if (token.status === 'live') await ctx.db.patch(token._id, { status: 'killed' });
          }
        }
      }
    }

    const existing = await ctx.db
      .query('pendingInvites')
      .withIndex('by_notionPageId', (q) => q.eq('notionPageId', args.notionPageId))
      .unique();

    const clientRole = asClientInviteRole(args.role);
    if (args.placement === 'UPSERT_PENDING_INVITE' && orgId && args.inviteStatus && clientRole) {
      const row = {
        orgId,
        notionPageId: args.notionPageId,
        name: args.name,
        email: args.email,
        role: clientRole,
        inviteStatus: args.inviteStatus,
        lastSyncedAt: now,
        ...(args.source ? { source: args.source } : {}),
        ...(args.notionLastEditedTime ? { notionLastEditedTime: args.notionLastEditedTime } : {}),
      };
      if (existing) await ctx.db.patch(existing._id, row);
      else await ctx.db.insert('pendingInvites', row);
      return { selfWrite };
    }

    if (existing) await ctx.db.delete(existing._id);
    return { selfWrite };
  },
});
