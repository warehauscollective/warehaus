/**
 * Read-side invite placement. Records notices and kills tokens in Convex.
 * Does not write to Notion. Revert execution waits for a later batch.
 */

import type { ContactSyncAction, InviteStatus } from '@warehaus/portal-sync';
import { isPortalSelfWrite } from '@warehaus/portal-sync';
import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';

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

    if (!selfWrite && args.orgId) {
      for (const action of actions) {
        if (action.type === 'notice') {
          await ctx.db.insert('notices', {
            orgId: args.orgId,
            audience: 'staff',
            message: action.message,
            contactNotionPageId: args.notionPageId,
            edgeCase: String(action.caseId),
            createdAt: now,
          });
        }
        await ctx.db.insert('auditEvents', {
          orgId: args.orgId,
          actorKind: 'notionEdit',
          action: `invite.case${'caseId' in action ? action.caseId : ''}.${action.type}`,
          notionPageId: args.notionPageId,
          after: JSON.stringify(action),
          createdAt: now,
        });
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

    if (args.placement === 'UPSERT_PENDING_INVITE' && args.orgId && args.inviteStatus) {
      const row = {
        orgId: args.orgId,
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
