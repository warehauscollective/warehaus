/**
 * Staff invites. Notion is first, through the shared outbox.
 * A token exists only after Notion confirms the create.
 * Accept and decline hold that token in the same mutation.
 * When NOTION_WRITEBACK_ENABLED is not exactly "true", enqueue is a no-op
 * and these mutations return that result. Nothing is sent.
 * Invite email also requires INVITE_EMAIL_ENABLED to be exactly "true".
 */

import { inviteIdempotencyKey, stateIdempotencyKey, WRITEBACK_OFF_ERROR } from '@warehaus/portal-sync';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { internalAction, internalMutation, mutation, query, type MutationCtx } from './_generated/server';
import { adminMutation, adminQuery } from './_lib/wrappers';
import { authComponent } from './auth';
import { sendIssuedInviteMail, sendPortalEmail } from './_lib/email';
import { normalizeEmail } from './_lib/contactJoin';
import { PortalAuthError } from './_lib/identity';
import {
  INVITE_CLIENT_FAILURE,
  INVITE_DAILY_LIMIT,
  asClientInviteRole,
  claimInviteToken,
  describeInvitePreview,
  finishInviteToken,
  hashInviteToken,
  inviteStateProperties,
  planInviteAccept,
  planInviteCreate,
  tokenFromConfirmation,
  type InviteTokenState,
} from './_lib/inviteFlow';

type EnqueueResult =
  | { ok: false; error: string }
  | { ok: true; outboxId: Id<'notionOutbox'>; duplicate: boolean };

type EnqueueArgs = {
  idempotencyKey: string;
  kind: 'createInvite' | 'setInviteState' | 'revert';
  orgId: Id<'clients'>;
  notionPageId?: string;
  expectedLastEditedTime?: string;
  payload: string;
  actor: 'staff' | 'system';
  actorId?: string;
};

async function enqueueInvite(ctx: MutationCtx, args: EnqueueArgs): Promise<EnqueueResult> {
  return ctx.runMutation(internal.sync.outbox.enqueue, {
    idempotencyKey: args.idempotencyKey,
    kind: args.kind,
    orgId: args.orgId,
    database: 'contacts',
    payload: args.payload,
    actor: args.actor,
    actorId: args.actorId,
    schedule: true,
    ...(args.notionPageId ? { notionPageId: args.notionPageId } : {}),
    ...(args.expectedLastEditedTime ? { expectedLastEditedTime: args.expectedLastEditedTime } : {}),
  });
}

function offOrError(error: string) {
  return error === WRITEBACK_OFF_ERROR ? WRITEBACK_OFF_ERROR : error;
}

export const create = adminMutation({
  args: {
    name: v.string(),
    email: v.string(),
    requestId: v.string(),
    inviteRole: v.optional(v.union(v.literal('Client Member'), v.literal('Client Admin'))),
  },
  handler: async (ctx, args) => {
    const orgId = ctx.identity.orgId as Id<'clients'>;
    const client = await ctx.db.get(orgId);
    if (!client) throw new PortalAuthError('Client missing', 'NO_CONTACT');
    const emailNormalized = normalizeEmail(args.email);
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const recent = await ctx.db
      .query('inviteTokens')
      .withIndex('by_orgId_createdBy_createdAt', (q) =>
        q
          .eq('orgId', orgId)
          .eq('createdByContactId', ctx.identity.contactId as Id<'contacts'>)
          .gte('createdAt', since),
      )
      .take(INVITE_DAILY_LIMIT);
    const sentToday = recent.length;
    const contacts = await ctx.db.query('contacts').withIndex('by_email', (q) => q.eq('email', emailNormalized)).collect();
    const pending = await ctx.db
      .query('pendingInvites')
      .withIndex('by_email', (q) => q.eq('email', emailNormalized))
      .collect();
    const emailOwnedByOtherOrg = [...contacts, ...pending].some((row) => row.orgId !== orgId);
    const plan = planInviteCreate({
      role: ctx.identity.role,
      identityOrgId: orgId,
      inviteRole: args.inviteRole ?? 'Client Member',
      email: args.email,
      name: args.name,
      clientNotionPageId: client.notionPageId,
      sentToday,
      emailOwnedByOtherOrg,
    });
    if (!plan.ok) {
      if (plan.staffMessage) {
        await ctx.runMutation(internal.invitesSync.recordStaffNotice, {
          orgId,
          message: plan.staffMessage,
          edgeCase: 'invite-state',
        });
      }
      return { ok: false as const, message: plan.clientMessage };
    }
    const queued = await enqueueInvite(ctx, {
      idempotencyKey: inviteIdempotencyKey(orgId, plan.emailNormalized, args.requestId),
      kind: 'createInvite',
      orgId,
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
      actor: 'staff',
      actorId: ctx.identity.contactId,
    });
    if (!queued.ok) return { ok: false as const, message: offOrError(queued.error) };
    return { ok: true as const, status: 'pending' as const, message: 'Invite pending' };
  },
});

export const previewAccept = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await authComponent.getAuthUser(ctx).catch(() => null);
    const tokenHash = await hashInviteToken(token);
    const row = await ctx.db
      .query('inviteTokens')
      .withIndex('by_tokenHash', (q) => q.eq('tokenHash', tokenHash))
      .unique();
    const now = Date.now();
    const usable = row != null && row.status === 'live' && row.expiresAt > now;
    const client = usable ? await ctx.db.get(row.orgId) : null;
    return describeInvitePreview({
      tokenStatus: row?.status ?? 'missing',
      expiresAt: row?.expiresAt ?? 0,
      now,
      companyName: client?.companyName ?? null,
      signedInEmail: user?.email ?? null,
      emailVerified: user?.emailVerified === true,
      tokenEmail: row?.emailNormalized ?? '',
    });
  },
});

export const listTeam = adminQuery({
  args: {},
  handler: async (ctx) => {
    const orgId = ctx.identity.orgId as Id<'clients'>;
    const contacts = await ctx.db
      .query('contacts')
      .withIndex('by_orgId', (q) => q.eq('orgId', orgId))
      .collect();
    const invites = await ctx.db
      .query('pendingInvites')
      .withIndex('by_orgId', (q) => q.eq('orgId', orgId))
      .collect();
    return {
      canInvite: true,
      members: contacts
        .filter((contact) => !contact.syncHiddenAt && contact.role !== 'Warehaus Staff')
        .map((contact) => ({
          notionPageId: contact.notionPageId,
          name: contact.name,
          email: contact.email,
          role: contact.role,
          portalAccess: contact.portalAccess,
        })),
      invites: invites.map((invite) => ({
        notionPageId: invite.notionPageId,
        name: invite.name,
        email: invite.email,
        role: invite.role,
        inviteStatus: invite.inviteStatus,
      })),
    };
  },
});

function tokenState(row: { status: InviteTokenState['status']; attempt?: number }): InviteTokenState {
  return { status: row.status, attempt: row.attempt ?? 0 };
}

function holdKey(row: { _id: Id<'inviteTokens'>; attempt?: number }): string {
  return `${row._id}:${row.attempt ?? 0}`;
}

async function lastEditedFor(ctx: MutationCtx, notionPageId: string): Promise<string | undefined> {
  const state = await ctx.db
    .query('notionWriteState')
    .withIndex('by_notionPageId', (q) => q.eq('notionPageId', notionPageId))
    .unique();
  return state?.lastEditedTime;
}

export const accept = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user?.email) throw new PortalAuthError('Sign in to accept', 'UNAUTHENTICATED');
    const tokenHash = await hashInviteToken(token);
    const row = await ctx.db
      .query('inviteTokens')
      .withIndex('by_tokenHash', (q) => q.eq('tokenHash', tokenHash))
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
    const claimed = claimInviteToken(tokenState(row), 'accept');
    if (!claimed.ok) return { ok: false as const, status: 'unusable' as const };
    const authUserId = 'id' in user && typeof user.id === 'string' ? user.id : '';
    const queued = await enqueueInvite(ctx, {
      idempotencyKey: stateIdempotencyKey(row.contactNotionPageId, 'Accepted', holdKey(row)),
      kind: 'setInviteState',
      orgId: row.orgId,
      notionPageId: row.contactNotionPageId,
      expectedLastEditedTime: await lastEditedFor(ctx, row.contactNotionPageId),
      payload: JSON.stringify({
        properties: inviteStateProperties('Accepted'),
        tokenId: row._id,
        authUserId,
      }),
      actor: 'system',
    });
    if (!queued.ok) return { ok: false as const, status: 'off' as const, message: offOrError(queued.error) };
    await ctx.db.patch(row._id, { status: 'pending' });
    return { ok: true as const, status: 'pending' as const };
  },
});

export const decline = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user?.email) throw new PortalAuthError('Sign in to decline', 'UNAUTHENTICATED');
    const tokenHash = await hashInviteToken(token);
    const row = await ctx.db
      .query('inviteTokens')
      .withIndex('by_tokenHash', (q) => q.eq('tokenHash', tokenHash))
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
    const claimed = claimInviteToken(tokenState(row), 'decline');
    if (!claimed.ok) return { ok: false as const, status: 'unusable' as const };
    const queued = await enqueueInvite(ctx, {
      idempotencyKey: stateIdempotencyKey(row.contactNotionPageId, 'Declined', holdKey(row)),
      kind: 'setInviteState',
      orgId: row.orgId,
      notionPageId: row.contactNotionPageId,
      expectedLastEditedTime: await lastEditedFor(ctx, row.contactNotionPageId),
      payload: JSON.stringify({ properties: inviteStateProperties('Declined'), tokenId: row._id }),
      actor: 'system',
    });
    if (!queued.ok) return { ok: false as const, status: 'off' as const, message: offOrError(queued.error) };
    await ctx.db.patch(row._id, { status: 'pending' });
    return { ok: true as const, status: 'pending' as const };
  },
});

export const revoke = adminMutation({
  args: { contactNotionPageId: v.string() },
  handler: async (ctx, { contactNotionPageId }) => {
    const orgId = ctx.identity.orgId as Id<'clients'>;
    const tokens = await ctx.db
      .query('inviteTokens')
      .withIndex('by_contactNotionPageId', (q) => q.eq('contactNotionPageId', contactNotionPageId))
      .collect();
    const token = tokens
      .filter((row) => row.orgId === orgId && row.status === 'live')
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!token) return { ok: false as const, message: INVITE_CLIENT_FAILURE };
    const claimed = claimInviteToken(tokenState(token), 'revoke');
    if (!claimed.ok) return { ok: false as const, message: INVITE_CLIENT_FAILURE };
    const queued = await enqueueInvite(ctx, {
      idempotencyKey: stateIdempotencyKey(contactNotionPageId, 'Revoked', holdKey(token)),
      kind: 'setInviteState',
      orgId,
      notionPageId: contactNotionPageId,
      expectedLastEditedTime: await lastEditedFor(ctx, contactNotionPageId),
      payload: JSON.stringify({ properties: inviteStateProperties('Revoked'), tokenId: token._id }),
      actor: 'staff',
      actorId: ctx.identity.contactId,
    });
    if (!queued.ok) return { ok: false as const, message: offOrError(queued.error) };
    await ctx.db.patch(token._id, { status: 'pending' });
    return { ok: true as const, status: 'pending' as const };
  },
});

export const issueTokenAfterConfirm = internalMutation({
  args: { outboxId: v.id('notionOutbox'), notionPageId: v.string() },
  handler: async (ctx, args) => {
    const empty = { issued: false as const };
    const row = await ctx.db.get(args.outboxId);
    if (!row || row.status !== 'done') return empty;
    const parsed = JSON.parse(row.payload) as {
      invite?: {
        name: string;
        emailNormalized: string;
        role: 'Client Member' | 'Client Admin';
        createdByContactId?: string;
        clientNotionPageId: string;
      };
      tokenId?: string;
      properties?: { 'Invite Status'?: string };
    };
    if (row.resultJson?.includes('"issued":true')) return empty;
    const now = Date.now();
    const inviteRole = parsed.invite ? asClientInviteRole(parsed.invite.role) : null;
    if (row.kind === 'createInvite' && parsed.invite && inviteRole) {
      const invite = parsed.invite;
      const issued = await tokenFromConfirmation({ confirmed: true, now });
      if (!issued) return empty;
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
        clientNotionPageId: invite.clientNotionPageId,
        emailNormalized: invite.emailNormalized,
        tokenHash: issued.tokenHash,
        status: 'live',
        expiresAt: issued.expiresAt,
        createdAt: now,
        ...(invite.createdByContactId
          ? { createdByContactId: invite.createdByContactId as Id<'contacts'> }
          : {}),
      });
      const pending = await ctx.db
        .query('pendingInvites')
        .withIndex('by_notionPageId', (q) => q.eq('notionPageId', args.notionPageId))
        .unique();
      const pendingRow = {
        orgId: row.orgId,
        notionPageId: args.notionPageId,
        name: invite.name,
        email: invite.emailNormalized,
        role: inviteRole,
        inviteStatus: 'Pending' as const,
        source: 'portal',
        lastSyncedAt: now,
      };
      if (pending) await ctx.db.patch(pending._id, pendingRow);
      else await ctx.db.insert('pendingInvites', pendingRow);
      await ctx.db.patch(row._id, {
        resultJson: JSON.stringify({ issued: true, notionPageId: args.notionPageId }),
      });
      const logins = await ctx.db
        .query('contacts')
        .withIndex('by_email', (q) => q.eq('email', invite.emailNormalized))
        .collect();
      return {
        issued: true as const,
        raw: issued.raw,
        to: invite.emailNormalized,
        name: invite.name,
        alreadyHasLogin: logins.some((contact) => Boolean(contact.authUserId)),
      };
    }
    if (row.kind === 'setInviteState' && parsed.tokenId) {
      const token = await ctx.db.get(parsed.tokenId as Id<'inviteTokens'>);
      const status = parsed.properties?.['Invite Status'];
      if (
        token &&
        (status === 'Accepted' || status === 'Declined' || status === 'Revoked' || status === 'Expired')
      ) {
        const next = finishInviteToken(tokenState(token), 'confirmed', status);
        if (next.status === 'used') await ctx.db.patch(token._id, { status: 'used', usedAt: now });
        else if (next.status !== token.status) await ctx.db.patch(token._id, { status: next.status });
      }
      const pending = await ctx.db
        .query('pendingInvites')
        .withIndex('by_notionPageId', (q) => q.eq('notionPageId', args.notionPageId))
        .unique();
      if (pending && status !== 'Pending') await ctx.db.delete(pending._id);
      await ctx.db.patch(row._id, {
        resultJson: JSON.stringify({ issued: true, notionPageId: args.notionPageId }),
      });
    }
    return empty;
  },
});

export const releaseHeldToken = internalMutation({
  args: { outboxId: v.id('notionOutbox') },
  handler: async (ctx, { outboxId }) => {
    const row = await ctx.db.get(outboxId);
    if (!row || row.kind !== 'setInviteState') return;
    let tokenId: string | undefined;
    try {
      tokenId = (JSON.parse(row.payload) as { tokenId?: string }).tokenId;
    } catch {
      return;
    }
    if (!tokenId) return;
    const token = await ctx.db.get(tokenId as Id<'inviteTokens'>);
    if (!token) return;
    const next = finishInviteToken(tokenState(token), 'dead', 'Accepted');
    if (next.status !== 'live' || next.attempt === (token.attempt ?? 0)) return;
    await ctx.db.patch(token._id, { status: 'live', attempt: next.attempt });
  },
});

export const sendIssuedInvite = internalAction({
  args: {
    to: v.string(),
    rawToken: v.string(),
    name: v.string(),
    alreadyHasLogin: v.optional(v.boolean()),
  },
  handler: async (_ctx, args) => {
    return sendIssuedInviteMail(
      {
        to: args.to,
        name: args.name,
        rawToken: args.rawToken,
        alreadyHasLogin: args.alreadyHasLogin === true,
      },
      {
        INVITE_EMAIL_ENABLED: process.env.INVITE_EMAIL_ENABLED,
        PORTAL_PUBLIC_URL: process.env.PORTAL_PUBLIC_URL,
      },
      { send: sendPortalEmail },
    );
  },
});
