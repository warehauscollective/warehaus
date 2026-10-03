/**
 * Read-side invite placement. Records notices and kills tokens in Convex.
 * Does not write to Notion. Revert execution waits for a later batch.
 */

import type { ContactSyncAction, InviteStatus } from '@warehaus/portal-sync';
import { isPortalSelfWrite } from '@warehaus/portal-sync';
import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';
import { adminQuery } from './_lib/wrappers';
import { revertAllowed, revertIdempotencyKey, REVERT_WINDOW_MS } from './_lib/revertLimit';
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
    const clientIds = Array.isArray(lastWritten['Client Company'])
      ? lastWritten['Client Company'].filter((id): id is string => typeof id === 'string')
      : [];
    return {
      prevInviteStatus: asInviteStatus(lastWritten['Invite Status']) ?? null,
      liveToken: live ? { clientNotionPageId: live.clientNotionPageId } : null,
      verifiedAcceptance: used,
      lastWritten,
    };
  },
});

export const listStaffNotices = adminQuery({
  args: {},
  handler: async (ctx) => {
    return ctx.db
      .query('notices')
      .withIndex('by_audience_createdAt', (q) => q.eq('audience', 'staff'))
      .order('desc')
      .take(50);
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
          await ctx.db.insert('notices', {
            orgId: orgId,
            audience: 'staff',
            message: action.message,
            contactNotionPageId: args.notionPageId,
            edgeCase: String(action.caseId),
            createdAt: now,
          });
        }
        await ctx.db.insert('auditEvents', {
          orgId: orgId,
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
                orgId: orgId,
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
            const existing = await ctx.db
              .query('notionOutbox')
              .withIndex('by_idempotencyKey', (q) => q.eq('idempotencyKey', key))
              .unique();
            if (!existing) {
              await ctx.db.insert('notionOutbox', {
                idempotencyKey: key,
                kind: 'revert',
                orgId: orgId,
                database: 'contacts',
                notionPageId: args.notionPageId,
                payload: JSON.stringify({
                  properties:
                    action.field === 'Client Company' && action.value
                      ? { 'Client Company': [action.value] }
                      : { [action.field]: action.value ?? '' },
                }),
                actor: 'system',
                status: 'queued',
                attempts: 0,
                nextAttemptAt: now,
                createdAt: now,
              });
            }
            await ctx.db.insert('auditEvents', {
              orgId: orgId,
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

    if (args.placement === 'UPSERT_PENDING_INVITE' && orgId && args.inviteStatus) {
      const row = {
        orgId: orgId,
        notionPageId: args.notionPageId,
        name: args.name,
        email: args.email,
        role: args.role,
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
