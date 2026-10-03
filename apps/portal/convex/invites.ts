/**
 * Invite writes. Notion is first. A token and email exist only after confirm.
 * NOTION_WRITEBACK_ENABLED must be exactly "true" or these mutations refuse.
 */

import { inviteIdempotencyKey, stateIdempotencyKey } from '@warehaus/portal-sync';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { internalAction, internalMutation, mutation, type MutationCtx } from './_generated/server';
import { authComponent } from './auth';
import { inviteEmail, sendPortalEmail } from './_lib/email';
import { normalizeEmail } from './_lib/contactJoin';
import { PortalAuthError } from './_lib/identity';
import {
  INVITE_CLIENT_FAILURE,
  hashInviteToken,
  inviteStateProperties,
  planInviteAccept,
  planInviteCreate,
  tokenFromConfirmation,
} from './_lib/inviteFlow';
import { isNotionWritebackEnabled, requireClientAdmin } from './_lib/writeAuthz';
import { clientMutation } from './_lib/wrappers';

function requireWriteback() {
  if (!isNotionWritebackEnabled()) {
    throw new PortalAuthError('Invites are not enabled', 'FORBIDDEN');
  }
}

async function enqueueInvite(
  ctx: MutationCtx,
  args: {
    idempotencyKey: string;
    kind: string;
    orgId: Id<'clients'>;
    notionPageId?: string;
    payload: string;
    actor: 'staff' | 'clientAdmin' | 'system';
  },
) {
  const existing = await ctx.db
    .query('notionOutbox')
    .withIndex('by_idempotencyKey', (q) => q.eq('idempotencyKey', args.idempotencyKey))
    .unique();
  if (existing) return;
  const now = Date.now();
  await ctx.db.insert('notionOutbox', {
    idempotencyKey: args.idempotencyKey,
    kind: args.kind,
    orgId: args.orgId,
    database: 'contacts',
    payload: args.payload,
    actor: args.actor,
    status: 'queued',
    attempts: 0,
    nextAttemptAt: now,
    createdAt: now,
    ...(args.notionPageId ? { notionPageId: args.notionPageId } : {}),
  });
}

export const create = clientMutation({
  args: {
    name: v.string(),
    email: v.string(),
    requestId: v.string(),
    inviteRole: v.optional(v.union(v.literal('Client Member'), v.literal('Client Admin'))),
  },
  handler: async (ctx, args) => {
    requireWriteback();
    if (ctx.identity.role === 'Client Admin') requireClientAdmin(ctx.identity);
    else if (ctx.identity.role !== 'Warehaus Staff') {
      throw new PortalAuthError('You cannot send invites', 'FORBIDDEN');
    }
    const client = await ctx.db.get(ctx.orgId);
    if (!client) throw new PortalAuthError('Client missing', 'NO_CONTACT');
    const emailNormalized = normalizeEmail(args.email);
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const tokens = await ctx.db
      .query('inviteTokens')
      .withIndex('by_orgId', (q) => q.eq('orgId', ctx.orgId))
      .collect();
    const sentToday = tokens.filter(
      (token) => token.createdByContactId === ctx.identity.contactId && token.createdAt >= since,
    ).length;
    const contacts = await ctx.db.query('contacts').withIndex('by_email', (q) => q.eq('email', emailNormalized)).collect();
    const pending = await ctx.db
      .query('pendingInvites')
      .withIndex('by_email', (q) => q.eq('email', emailNormalized))
      .collect();
    const emailOwnedByOtherOrg = [...contacts, ...pending].some((row) => row.orgId !== ctx.orgId);
    const plan = planInviteCreate({
      role: ctx.identity.role,
      identityOrgId: ctx.orgId,
      inviteRole: args.inviteRole ?? 'Client Member',
      email: args.email,
      name: args.name,
      clientNotionPageId: client.notionPageId,
      sentToday,
      emailOwnedByOtherOrg,
    });
    if (!plan.ok) {
      if (plan.staffMessage) {
        await ctx.db.insert('notices', {
          orgId: ctx.orgId,
          audience: 'staff',
          message: plan.staffMessage,
          createdAt: Date.now(),
        });
      }
      return { ok: false as const, message: plan.clientMessage };
    }
    const key = inviteIdempotencyKey(ctx.orgId, plan.emailNormalized, args.requestId);
    await enqueueInvite(ctx, {
      idempotencyKey: key,
      kind: 'createInvite',
      orgId: ctx.orgId,
      payload: JSON.stringify({
        properties: plan.properties,
        invite: {
          name: args.name.trim(),
          emailNormalized: plan.emailNormalized,
          role: args.inviteRole ?? 'Client Member',
          createdByContactId: ctx.identity.contactId,
          clientNotionPageId: client.notionPageId,
        },
      }),
      actor: ctx.identity.role === 'Warehaus Staff' ? 'staff' : 'clientAdmin',
    });
    return { ok: true as const, status: 'pending' as const, message: 'Invite pending' };
  },
});

export const accept = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    requireWriteback();
    const user = await authComponent.getAuthUser(ctx);
    if (!user?.email) throw new PortalAuthError('Sign in to accept', 'UNAUTHENTICATED');
    const row = await ctx.db
      .query('inviteTokens')
      .withIndex('by_tokenHash', (q) => q.eq('tokenHash', hashInviteToken(token)))
      .unique();
    const plan = planInviteAccept({
      tokenStatus: row?.status ?? 'missing',
      expiresAt: row?.expiresAt ?? 0,
      now: Date.now(),
      tokenEmail: row?.emailNormalized ?? '',
      signedInEmail: user.email,
      emailVerified: user.emailVerified === true,
    });
    if (!plan.ok) {
      if (plan.reason === 'mismatch') {
        return { ok: false as const, status: 'different-email' as const, signedInEmail: plan.signedInEmail };
      }
      return { ok: false as const, status: plan.reason };
    }
    if (!row) return { ok: false as const, status: 'unusable' as const };
    const key = stateIdempotencyKey(row.contactNotionPageId, 'Accepted', row._id);
    const authUserId = 'id' in user && typeof user.id === 'string' ? user.id : '';
    await enqueueInvite(ctx, {
      idempotencyKey: key,
      kind: 'setInviteState',
      orgId: row.orgId,
      notionPageId: row.contactNotionPageId,
      payload: JSON.stringify({
        properties: inviteStateProperties('Accepted'),
        tokenId: row._id,
        authUserId,
      }),
      actor: 'system',
    });
    return { ok: true as const, status: 'pending' as const };
  },
});

export const decline = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    requireWriteback();
    const row = await ctx.db
      .query('inviteTokens')
      .withIndex('by_tokenHash', (q) => q.eq('tokenHash', hashInviteToken(token)))
      .unique();
    if (!row || row.status !== 'live' || row.expiresAt <= Date.now()) {
      return { ok: false as const, status: 'unusable' as const };
    }
    await enqueueInvite(ctx, {
      idempotencyKey: stateIdempotencyKey(row.contactNotionPageId, 'Declined', row._id),
      kind: 'setInviteState',
      orgId: row.orgId,
      notionPageId: row.contactNotionPageId,
      payload: JSON.stringify({ properties: inviteStateProperties('Declined'), tokenId: row._id }),
      actor: 'system',
    });
    return { ok: true as const, status: 'pending' as const };
  },
});

export const revoke = clientMutation({
  args: { contactNotionPageId: v.string() },
  handler: async (ctx, { contactNotionPageId }) => {
    requireWriteback();
    if (ctx.identity.role === 'Client Admin') requireClientAdmin(ctx.identity);
    else if (ctx.identity.role !== 'Warehaus Staff') {
      throw new PortalAuthError('You cannot revoke invites', 'FORBIDDEN');
    }
    const tokens = await ctx.db
      .query('inviteTokens')
      .withIndex('by_contactNotionPageId', (q) => q.eq('contactNotionPageId', contactNotionPageId))
      .collect();
    const token = tokens.find((row) => row.orgId === ctx.orgId);
    if (!token) return { ok: false as const, message: INVITE_CLIENT_FAILURE };
    if (token.orgId !== ctx.orgId) return { ok: false as const, message: INVITE_CLIENT_FAILURE };
    await enqueueInvite(ctx, {
      idempotencyKey: stateIdempotencyKey(contactNotionPageId, 'Revoked', token._id),
      kind: 'setInviteState',
      orgId: ctx.orgId,
      notionPageId: contactNotionPageId,
      payload: JSON.stringify({ properties: inviteStateProperties('Revoked'), tokenId: token._id }),
      actor: ctx.identity.role === 'Warehaus Staff' ? 'staff' : 'clientAdmin',
    });
    return { ok: true as const, status: 'pending' as const };
  },
});

export const issueTokenAfterConfirm = internalMutation({
  args: { outboxId: v.id('notionOutbox'), notionPageId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.outboxId);
    if (!row || row.status !== 'done') return { issued: false as const };
    const parsed = JSON.parse(row.payload) as {
      invite?: {
        name: string;
        emailNormalized: string;
        role: 'Client Member' | 'Client Admin' | 'Warehaus Staff';
        createdByContactId?: string;
        clientNotionPageId: string;
      };
      tokenId?: string;
      properties?: { 'Invite Status'?: string };
    };
    if (row.resultJson?.includes('"issued":true')) return { issued: false as const };
    const now = Date.now();
    if (row.kind === 'createInvite' && parsed.invite) {
      const issued = tokenFromConfirmation({ confirmed: true, now });
      if (!issued) return { issued: false as const };
      const existing = await ctx.db
        .query('inviteTokens')
        .withIndex('by_contactNotionPageId', (q) => q.eq('contactNotionPageId', args.notionPageId))
        .collect();
      for (const token of existing) {
        if (token.status === 'live') await ctx.db.patch(token._id, { status: 'killed' });
      }
      await ctx.db.insert('inviteTokens', {
        orgId: row.orgId,
        contactNotionPageId: args.notionPageId,
        clientNotionPageId: parsed.invite.clientNotionPageId,
        emailNormalized: parsed.invite.emailNormalized,
        tokenHash: issued.tokenHash,
        status: 'live',
        expiresAt: issued.expiresAt,
        createdAt: now,
        ...(parsed.invite.createdByContactId
          ? { createdByContactId: parsed.invite.createdByContactId as Id<'contacts'> }
          : {}),
      });
      const pending = await ctx.db
        .query('pendingInvites')
        .withIndex('by_notionPageId', (q) => q.eq('notionPageId', args.notionPageId))
        .unique();
      const pendingRow = {
        orgId: row.orgId,
        notionPageId: args.notionPageId,
        name: parsed.invite.name,
        email: parsed.invite.emailNormalized,
        role: parsed.invite.role,
        inviteStatus: 'Pending' as const,
        source: 'portal',
        lastSyncedAt: now,
      };
      if (pending) await ctx.db.patch(pending._id, pendingRow);
      else await ctx.db.insert('pendingInvites', pendingRow);
      await ctx.db.patch(row._id, { resultJson: JSON.stringify({ issued: true, notionPageId: args.notionPageId }) });
      return { issued: true as const, raw: issued.raw, to: parsed.invite.emailNormalized, name: parsed.invite.name };
    }
    if (row.kind === 'setInviteState' && parsed.tokenId) {
      const token = await ctx.db.get(parsed.tokenId as Id<'inviteTokens'>);
      const status = parsed.properties?.['Invite Status'];
      if (token && status === 'Accepted') await ctx.db.patch(token._id, { status: 'used', usedAt: now });
      if (token && (status === 'Declined' || status === 'Revoked' || status === 'Expired')) {
        await ctx.db.patch(token._id, { status: status === 'Expired' ? 'expired' : 'killed' });
      }
      const pending = await ctx.db
        .query('pendingInvites')
        .withIndex('by_notionPageId', (q) => q.eq('notionPageId', args.notionPageId))
        .unique();
      if (pending && status !== 'Pending') await ctx.db.delete(pending._id);
      await ctx.db.patch(row._id, { resultJson: JSON.stringify({ issued: true, notionPageId: args.notionPageId }) });
    }
    return { issued: false as const };
  },
});

export const sendIssuedInvite = internalAction({
  args: { to: v.string(), rawToken: v.string(), name: v.string() },
  handler: async (_ctx, args) => {
    const origin = process.env.PORTAL_PUBLIC_URL?.replace(/\/$/, '') ?? '';
    if (!origin) throw new Error('PORTAL_PUBLIC_URL is not set');
    const mail = inviteEmail({ name: args.name, acceptUrl: `${origin}/accept?token=${args.rawToken}` });
    await sendPortalEmail({ to: args.to, ...mail });
  },
});
