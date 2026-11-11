/**
 * Staff invites. Notion is first, through the shared outbox.
 * A token exists only after Notion confirms the create.
 * Accept and decline hold that token in the same mutation.
 * When NOTION_WRITEBACK_ENABLED is not exactly "true", enqueue is a no-op
 * and these mutations return that result. Nothing is sent.
 * Invite email also requires INVITE_EMAIL_ENABLED to be exactly "true".
 */

import {
  WAREHAUS_INTERNAL_CLIENT_EXTERNAL_ID,
  WAREHAUS_INTERNAL_CLIENT_SLUG,
  inviteIdempotencyKey,
  isNotionWritebackEnabled,
  stateIdempotencyKey,
  WRITEBACK_OFF_ERROR,
} from '@warehaus/portal-sync';
import { ConvexError, v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { components, internal } from './_generated/api';
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server';
import { adminMutation, adminQuery } from './_lib/wrappers';
import { authComponent } from './auth';
import { isInviteEmailEnabled, renewRequestEmail, sendIssuedInviteMail, sendPortalEmail } from './_lib/email';
import { ensureContactExternalId, normalizeEmail } from './_lib/contactJoin';
import { PortalAuthError } from './_lib/identity';
import {
  INVITE_CLIENT_FAILURE,
  INVITE_CLIENT_ROLE_MESSAGE,
  INVITE_DAILY_LIMIT,
  WAREHAUS_INTERNAL_CLIENT_ID_ENV,
  asInviteRole,
  inviteCreatePayloadError,
  resolveWarehausInviteClient,
  staffInviteOrgAllowed,
  warehausHolderOrgIds,
  type WarehausPageCandidate,
  claimInviteToken,
  describeInvitePreview,
  finishInviteToken,
  hashInviteToken,
  inviteSendGate,
  inviteStateProperties,
  inviteStatusMessage,
  liveTokenIsExpired,
  memberRemoveProperties,
  planInviteAccept,
  planInviteCreate,
  planInviteSignup,
  planMemberRemove,
  planStaffInviteLink,
  renewRequestMessage,
  signupPermitExpiry,
  signupPermitOpen,
  staffAcceptOrgOk,
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

const inviteRoleArg = v.union(
  v.literal('Client Member'),
  v.literal('Client Admin'),
  v.literal('Warehaus Staff'),
);

type ClientRow = Doc<'clients'>;

function toInviteCandidate(row: ClientRow): WarehausPageCandidate {
  return {
    id: row._id,
    slug: row.slug,
    externalId: row.externalId,
    notionPageId: row.notionPageId,
    portalAccess: row.portalAccess,
    syncHiddenAt: row.syncHiddenAt,
  };
}

/**
 * Warehaus rows that can hold the invite. The env value is a client id, looked
 * up with get, so a duplicate page id cannot throw from `.unique()`.
 */
async function loadWarehausInviteRows(
  ctx: QueryCtx | MutationCtx,
): Promise<{ ok: true; clients: WarehausPageCandidate[] } | { ok: false; message: string }> {
  const slugRows = await ctx.db
    .query('clients')
    .withIndex('by_slug', (q) => q.eq('slug', WAREHAUS_INTERNAL_CLIENT_SLUG))
    .take(2);
  if (slugRows.length > 1) {
    return {
      ok: false,
      message: 'More than one client uses the warehaus-internal slug. Nothing was queued.',
    };
  }
  const alternate = await ctx.db
    .query('clients')
    .withIndex('by_slug', (q) => q.eq('slug', 'warehaus'))
    .take(8);
  const external = await ctx.db
    .query('clients')
    .withIndex('by_externalId', (q) => q.eq('externalId', WAREHAUS_INTERNAL_CLIENT_EXTERNAL_ID))
    .take(8);
  const configuredId = process.env[WAREHAUS_INTERNAL_CLIENT_ID_ENV]?.trim() ?? '';
  let configured: ClientRow | null = null;
  if (configuredId) {
    try {
      configured = await ctx.db.get(configuredId as Id<'clients'>);
    } catch {
      configured = null;
    }
  }
  const rows = [slugRows[0], ...alternate, ...external, configured].filter((row) => row != null);
  const seen = new Set<string>();
  const clients = rows
    .filter((row) => {
      if (seen.has(row._id)) return false;
      seen.add(row._id);
      return true;
    })
    .map(toInviteCandidate);
  return { ok: true, clients };
}

async function staffOrgChoice(ctx: QueryCtx | MutationCtx) {
  const loaded = await loadWarehausInviteRows(ctx);
  if (!loaded.ok) throw new ConvexError<string>(loaded.message);
  const legacy = loaded.clients.find((client) => client.slug === WAREHAUS_INTERNAL_CLIENT_SLUG);
  return {
    legacyId: legacy?.id as Id<'clients'> | undefined,
    holderOrgIds: warehausHolderOrgIds(loaded.clients),
  };
}

export const create = adminMutation({
  args: {
    name: v.string(),
    email: v.string(),
    requestId: v.string(),
    inviteRole: v.optional(inviteRoleArg),
  },
  handler: async (ctx, args) => {
    if (ctx.identity.role !== 'Warehaus Staff') {
      return { ok: false as const, message: 'You cannot send invites' };
    }
    if ((args.inviteRole ?? 'Warehaus Staff') !== 'Warehaus Staff') {
      return { ok: false as const, message: INVITE_CLIENT_ROLE_MESSAGE };
    }
    const loaded = await loadWarehausInviteRows(ctx);
    if (!loaded.ok) return { ok: false as const, message: loaded.message };
    const page = resolveWarehausInviteClient({
      clients: loaded.clients,
      configuredClientId: process.env[WAREHAUS_INTERNAL_CLIENT_ID_ENV],
    });
    if (!page.ok) {
      console.error(`[invites] ${page.message}`);
      const noticeOrg =
        loaded.clients.find((client) => client.slug === WAREHAUS_INTERNAL_CLIENT_SLUG) ?? loaded.clients[0];
      if (noticeOrg) {
        await ctx.db.insert('notices', {
          orgId: noticeOrg.id as Id<'clients'>,
          audience: 'staff',
          message: page.message,
          edgeCase: 'invite-state',
          createdAt: Date.now(),
        });
      }
      return { ok: false as const, message: page.message };
    }
    const orgId = page.orgId as Id<'clients'>;
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
    const staffOrgIds = new Set<string>([
      ...loaded.clients
        .filter((client) => client.slug === WAREHAUS_INTERNAL_CLIENT_SLUG)
        .map((client) => client.id),
      ...warehausHolderOrgIds(loaded.clients),
    ]);
    const emailOwnedByOtherOrg = [...contacts, ...pending].some((row) => !staffOrgIds.has(String(row.orgId)));
    const gate = inviteSendGate({
      writebackEnabled: isNotionWritebackEnabled(process.env.NOTION_WRITEBACK_ENABLED),
      emailEnabled: isInviteEmailEnabled(process.env.INVITE_EMAIL_ENABLED),
      publicUrl: process.env.PORTAL_PUBLIC_URL ?? '',
    });
    if (!gate.ok) return { ok: false as const, message: gate.message };
    const plan = planInviteCreate({
      role: ctx.identity.role,
      inviteRole: args.inviteRole ?? 'Warehaus Staff',
      email: args.email,
      name: args.name,
      internalOrgId: page.orgId,
      internalNotionPageId: page.notionPageId,
      resolved: page,
      sentToday,
      emailOwnedByOtherOrg,
      emailAlreadyMember: contacts.length > 0,
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
    const payload = {
      properties: plan.properties,
      invite: {
        name: args.name.trim(),
        emailNormalized: plan.emailNormalized,
        role: 'Warehaus Staff' as const,
        createdByContactId: ctx.identity.contactId,
        clientNotionPageId: page.notionPageId,
      },
    };
    const payloadError = inviteCreatePayloadError({
      properties: payload.properties,
      clientNotionPageId: payload.invite.clientNotionPageId,
    });
    if (payloadError) return { ok: false as const, message: payloadError };
    const queued = await enqueueInvite(ctx, {
      idempotencyKey: inviteIdempotencyKey(orgId, plan.emailNormalized, args.requestId),
      kind: 'createInvite',
      orgId,
      payload: JSON.stringify(payload),
      actor: 'staff',
      actorId: ctx.identity.contactId,
    });
    if (!queued.ok) return { ok: false as const, message: offOrError(queued.error) };
    return { ok: true as const, status: 'pending' as const, message: 'Invite pending' };
  },
});

async function authUserByEmail(ctx: { runQuery: QueryCtx['runQuery'] }, email: string) {
  return (await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: 'user',
    where: [{ field: 'email', operator: 'eq', value: normalizeEmail(email) }],
  })) as { _id?: string; email?: string; emailVerified?: boolean } | null;
}

async function pendingForToken(
  ctx: QueryCtx | MutationCtx,
  notionPageId: string | undefined,
) {
  if (!notionPageId) return null;
  return ctx.db
    .query('pendingInvites')
    .withIndex('by_notionPageId', (q) => q.eq('notionPageId', notionPageId))
    .unique();
}

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
    const pending = usable ? await pendingForToken(ctx, row.contactNotionPageId) : null;
    const staffInvite = pending?.role === 'Warehaus Staff';
    const account = usable ? await authUserByEmail(ctx, row.emailNormalized) : null;
    const contacts = usable
      ? await ctx.db.query('contacts').withIndex('by_email', (q) => q.eq('email', row.emailNormalized)).collect()
      : [];
    const sessionContact = user
      ? await ctx.db
          .query('contacts')
          .withIndex('by_authUserId', (q) =>
            q.eq('authUserId', user && '_id' in user && typeof user._id === 'string' ? user._id : ''),
          )
          .unique()
      : null;
    const link = usable
      ? planStaffInviteLink({
          authUserId:
            user && '_id' in user && typeof user._id === 'string' ? user._id : '',
          authEmail: user?.email ?? row.emailNormalized,
          emailVerified: user?.emailVerified === true,
          tokenEmail: row.emailNormalized,
          sessionAlreadyLinked: sessionContact != null,
          contacts,
        })
      : null;
    const preview = describeInvitePreview({
      tokenStatus: row?.status ?? 'missing',
      expiresAt: row?.expiresAt ?? 0,
      now,
      companyName: client?.companyName ?? null,
      signedInEmail: user?.email ?? null,
      emailVerified: user?.emailVerified === true,
      tokenEmail: row?.emailNormalized ?? '',
      accountExists: Boolean(account?._id || account?.email),
      staffInvite,
      alreadyMember: staffInvite && link != null && !link.ok && link.reason === 'already',
    });
    const inviter = row?.createdByContactId ? await ctx.db.get(row.createdByContactId) : null;
    return {
      ...preview,
      inviterName: inviter?.name ?? null,
      expiresAt: row?.expiresAt ?? null,
    };
  },
});

/** Token-gated. Does not reveal why a token failed. */
export const signupAllowed = internalQuery({
  args: { token: v.string(), email: v.string() },
  handler: async (ctx, { token, email }) => {
    const tokenHash = await hashInviteToken(token);
    const row = await ctx.db
      .query('inviteTokens')
      .withIndex('by_tokenHash', (q) => q.eq('tokenHash', tokenHash))
      .unique();
    const pending = await pendingForToken(ctx, row?.contactNotionPageId);
    const account = row ? await authUserByEmail(ctx, row.emailNormalized) : null;
    const plan = planInviteSignup({
      tokenStatus: row?.status ?? 'missing',
      expiresAt: row?.expiresAt ?? 0,
      now: Date.now(),
      tokenEmail: row?.emailNormalized ?? '',
      accountExists: Boolean(account?._id || account?.email),
      staffInvite: pending?.role === 'Warehaus Staff' && inviteEmailsMatchSafe(email, row?.emailNormalized ?? ''),
    });
    if (!plan.ok) return { ok: false as const };
    return { ok: true as const, email: plan.emailNormalized };
  },
});

/** Durable, single-use permit so the auth create hook can mark the email verified. */
export const grantSignupPermit = internalMutation({
  args: { token: v.string(), email: v.string() },
  handler: async (ctx, { token, email }) => {
    const tokenHash = await hashInviteToken(token);
    const row = await ctx.db
      .query('inviteTokens')
      .withIndex('by_tokenHash', (q) => q.eq('tokenHash', tokenHash))
      .unique();
    const pending = await pendingForToken(ctx, row?.contactNotionPageId);
    const account = row ? await authUserByEmail(ctx, row.emailNormalized) : null;
    const plan = planInviteSignup({
      tokenStatus: row?.status ?? 'missing',
      expiresAt: row?.expiresAt ?? 0,
      now: Date.now(),
      tokenEmail: row?.emailNormalized ?? '',
      accountExists: Boolean(account?._id || account?.email),
      staffInvite: pending?.role === 'Warehaus Staff' && inviteEmailsMatchSafe(email, row?.emailNormalized ?? ''),
    });
    if (!plan.ok) return { ok: false as const };
    const expiresAt = signupPermitExpiry();
    const existing = await ctx.db
      .query('inviteSignupPermits')
      .withIndex('by_tokenHash', (q) => q.eq('tokenHash', tokenHash))
      .unique();
    if (existing) await ctx.db.patch(existing._id, { email: plan.emailNormalized, expiresAt });
    else await ctx.db.insert('inviteSignupPermits', { tokenHash, email: plan.emailNormalized, expiresAt });
    return { ok: true as const };
  },
});

/** Consumes the permit once. A second call, or an expired row, does not verify. */
export const takeSignupPermit = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const normalized = normalizeEmail(email);
    const rows = await ctx.db
      .query('inviteSignupPermits')
      .withIndex('by_email', (q) => q.eq('email', normalized))
      .collect();
    const now = Date.now();
    let opened = false;
    for (const permit of rows) {
      if (!opened && signupPermitOpen(permit, normalized, now)) {
        opened = true;
        await ctx.db.delete(permit._id);
      } else if (permit.expiresAt <= now) {
        await ctx.db.delete(permit._id);
      }
    }
    return { ok: opened };
  },
});

function inviteEmailsMatchSafe(left: string, right: string) {
  return normalizeEmail(left) === normalizeEmail(right) && normalizeEmail(left).includes('@');
}

export const listTeam = adminQuery({
  args: {},
  handler: async (ctx) => {
    const staffOrg = await staffOrgChoice(ctx);
    const orgIds = [
      ...new Set([staffOrg.legacyId, ...staffOrg.holderOrgIds].filter((id) => id != null)),
    ] as Id<'clients'>[];
    if (orgIds.length === 0) {
      return { canInvite: true, members: [], invites: [] };
    }
    const contacts = (
      await Promise.all(
        orgIds.map((orgId) =>
          ctx.db
            .query('contacts')
            .withIndex('by_orgId', (q) => q.eq('orgId', orgId))
            .collect(),
        ),
      )
    ).flat();
    const invites = (
      await Promise.all(
        orgIds.map((orgId) =>
          ctx.db
            .query('pendingInvites')
            .withIndex('by_orgId', (q) => q.eq('orgId', orgId))
            .collect(),
        ),
      )
    ).flat();
    return {
      canInvite: true,
      members: contacts
        .filter((contact) => !contact.syncHiddenAt && contact.role === 'Warehaus Staff')
        .map((contact) => ({
          notionPageId: contact.notionPageId,
          name: contact.name,
          email: contact.email,
          role: contact.role,
          portalAccess: contact.portalAccess,
        })),
      invites: await Promise.all(
        invites
          .filter((invite) => invite.inviteStatus === 'Pending' || invite.inviteStatus === 'Expired')
          .map(async (invite) => {
            const tokens = await ctx.db
              .query('inviteTokens')
              .withIndex('by_contactNotionPageId', (q) => q.eq('contactNotionPageId', invite.notionPageId))
              .collect();
            const latest = tokens.sort((a, b) => b.createdAt - a.createdAt)[0];
            return {
              notionPageId: invite.notionPageId,
              name: invite.name,
              email: invite.email,
              role: invite.role,
              inviteStatus: invite.inviteStatus,
              invitedAt: latest?.createdAt ?? invite.lastSyncedAt,
              expiresAt: latest?.expiresAt ?? null,
            };
          }),
      ),
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
        return {
          ok: false as const,
          status: 'different-email' as const,
          signedInEmail: plan.signedInEmail,
          message: inviteStatusMessage('different-email', plan.signedInEmail),
        };
      }
      return { ok: false as const, status: plan.reason, message: inviteStatusMessage(plan.reason) };
    }
    if (!row) return { ok: false as const, status: 'unusable' as const, message: inviteStatusMessage('unusable') };
    const identity = await ctx.auth.getUserIdentity();
    const authUserId = identity?.subject ?? '';
    if (!authUserId) return { ok: false as const, status: 'unusable' as const, message: inviteStatusMessage('unusable') };
    const pending = await pendingForToken(ctx, row.contactNotionPageId);
    const staffOrg = await staffOrgChoice(ctx);
    if (
      !staffAcceptOrgOk({
        pendingRole: pending?.role,
        pendingOrgId: pending?.orgId,
        tokenOrgId: row.orgId,
        internalOrgId: staffOrg.legacyId,
        holderOrgIds: staffOrg.holderOrgIds,
      })
    ) {
      return { ok: false as const, status: 'unusable' as const, message: inviteStatusMessage('unusable') };
    }
    let staffLink: { email: string; name: string; role: 'Warehaus Staff' } | undefined;
    if (pending?.role === 'Warehaus Staff') {
      const contacts = await ctx.db
        .query('contacts')
        .withIndex('by_email', (q) => q.eq('email', plan.emailNormalized))
        .collect();
      const session = authUserId
        ? await ctx.db
            .query('contacts')
            .withIndex('by_authUserId', (q) => q.eq('authUserId', authUserId))
            .unique()
        : null;
      const link = planStaffInviteLink({
        authUserId,
        authEmail: user.email,
        emailVerified: true,
        tokenEmail: row.emailNormalized,
        sessionAlreadyLinked: session != null,
        contacts,
      });
      if (!link.ok) {
        const status = link.reason === 'already' ? 'already' : link.reason === 'unverified' ? 'unverified' : 'different-email';
        return {
          ok: false as const,
          status,
          message: status === 'different-email' ? inviteStatusMessage(status, normalizeEmail(user.email)) : inviteStatusMessage(status),
          ...(status === 'different-email' ? { signedInEmail: normalizeEmail(user.email) } : {}),
        };
      }
      staffLink = { email: plan.emailNormalized, name: pending.name, role: 'Warehaus Staff' };
    }
    const claimed = claimInviteToken(tokenState(row), 'accept');
    if (!claimed.ok) return { ok: false as const, status: 'unusable' as const, message: inviteStatusMessage('unusable') };
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
        ...(staffLink ? { staffLink } : {}),
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
    const tokens = await ctx.db
      .query('inviteTokens')
      .withIndex('by_contactNotionPageId', (q) => q.eq('contactNotionPageId', contactNotionPageId))
      .collect();
    const token = tokens
      .filter((row) => row.status === 'live')
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!token) return { ok: false as const, message: INVITE_CLIENT_FAILURE };
    const claimed = claimInviteToken(tokenState(token), 'revoke');
    if (!claimed.ok) return { ok: false as const, message: INVITE_CLIENT_FAILURE };
    const queued = await enqueueInvite(ctx, {
      idempotencyKey: stateIdempotencyKey(contactNotionPageId, 'Revoked', holdKey(token)),
      kind: 'setInviteState',
      orgId: token.orgId,
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

/**
 * Disables portal access on the contact's Notion page.
 * Enqueue is a no-op while write-back is off, and this returns that error.
 * The row stays until a later pull sees Portal Access Disabled.
 */
export const remove = adminMutation({
  args: { contactNotionPageId: v.string(), requestId: v.string() },
  handler: async (ctx, { contactNotionPageId, requestId }) => {
    const orgId = ctx.identity.orgId as Id<'clients'>;
    const contact = await ctx.db
      .query('contacts')
      .withIndex('by_notionPageId', (q) => q.eq('notionPageId', contactNotionPageId))
      .unique();
    if (!contact) return { ok: false as const, message: INVITE_CLIENT_FAILURE };
    const plan = planMemberRemove({
      role: ctx.identity.role,
      contactOrgId: contact.orgId,
      identityOrgId: orgId,
      contactRole: contact.role,
      contactId: contact._id,
      actorContactId: ctx.identity.contactId,
      hidden: contact.syncHiddenAt != null,
    });
    if (!plan.ok) return { ok: false as const, message: plan.clientMessage };
    const queued = await enqueueInvite(ctx, {
      idempotencyKey: stateIdempotencyKey(contactNotionPageId, 'Disabled', requestId),
      kind: 'setInviteState',
      orgId,
      notionPageId: contactNotionPageId,
      expectedLastEditedTime: await lastEditedFor(ctx, contactNotionPageId),
      payload: JSON.stringify({ properties: memberRemoveProperties() }),
      actor: 'staff',
      actorId: ctx.identity.contactId,
    });
    if (!queued.ok) return { ok: false as const, message: offOrError(queued.error) };
    return { ok: true as const, status: 'pending' as const, message: 'Removal pending' };
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
        role: 'Client Member' | 'Client Admin' | 'Warehaus Staff';
        createdByContactId?: string;
        clientNotionPageId: string;
      };
      tokenId?: string;
      authUserId?: string;
      staffLink?: { email: string; name: string; role: 'Warehaus Staff' };
      properties?: { 'Invite Status'?: string };
    };
    if (row.resultJson?.includes('"issued":true')) return empty;
    const now = Date.now();
    const inviteRole = parsed.invite ? asInviteRole(parsed.invite.role) : null;
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
      const account = await authUserByEmail(ctx, invite.emailNormalized);
      const inviter = invite.createdByContactId
        ? await ctx.db.get(invite.createdByContactId as Id<'contacts'>)
        : null;
      return {
        issued: true as const,
        raw: issued.raw,
        to: invite.emailNormalized,
        name: invite.name,
        alreadyHasLogin: Boolean(account?._id || account?.email) || logins.some((contact) => Boolean(contact.authUserId)),
        inviterName: inviter?.name,
        expiresOn: new Intl.DateTimeFormat('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(issued.expiresAt),
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
      if (status === 'Accepted' && parsed.staffLink && parsed.authUserId) {
        await linkConfirmedStaff(ctx, {
          orgId: row.orgId,
          notionPageId: args.notionPageId,
          email: parsed.staffLink.email,
          name: parsed.staffLink.name,
          authUserId: parsed.authUserId,
        });
      }
      const pending = await ctx.db
        .query('pendingInvites')
        .withIndex('by_notionPageId', (q) => q.eq('notionPageId', args.notionPageId))
        .unique();
      if (pending && status === 'Expired') {
        await ctx.db.patch(pending._id, { inviteStatus: 'Expired' });
      } else if (pending && (status === 'Accepted' || status === 'Declined' || status === 'Revoked')) {
        await ctx.db.delete(pending._id);
      }
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

async function linkConfirmedStaff(
  ctx: MutationCtx,
  input: { orgId: Id<'clients'>; notionPageId: string; email: string; name: string; authUserId: string },
) {
  const staffOrg = await staffOrgChoice(ctx);
  if (
    !staffInviteOrgAllowed({
      orgId: input.orgId,
      legacyOrgId: staffOrg.legacyId,
      holderOrgIds: staffOrg.holderOrgIds,
    })
  ) {
    return;
  }
  const email = normalizeEmail(input.email);
  const contacts = await ctx.db.query('contacts').withIndex('by_email', (q) => q.eq('email', email)).collect();
  const session = await ctx.db
    .query('contacts')
    .withIndex('by_authUserId', (q) => q.eq('authUserId', input.authUserId))
    .unique();
  const link = planStaffInviteLink({
    authUserId: input.authUserId,
    authEmail: email,
    emailVerified: true,
    tokenEmail: email,
    sessionAlreadyLinked: session != null && normalizeEmail(session.email) !== email,
    contacts,
  });
  if (!link.ok) return;
  if (link.mode === 'link') {
    const staff = contacts.find((contact) => contact.role === 'Warehaus Staff' && !contact.authUserId);
    if (!staff) return;
    await ctx.db.patch(staff._id, {
      authUserId: input.authUserId,
      portalAccess: 'Enabled',
      email,
      role: 'Warehaus Staff',
      externalId: ensureContactExternalId(staff.externalId, staff._id),
    });
    return;
  }
  const contactId = await ctx.db.insert('contacts', {
    orgId: input.orgId,
    notionPageId: input.notionPageId,
    name: input.name,
    email,
    role: 'Warehaus Staff',
    portalAccess: 'Enabled',
    authUserId: input.authUserId,
    source: 'portal',
    lastSyncedAt: Date.now(),
  });
  await ctx.db.patch(contactId, { externalId: ensureContactExternalId(null, contactId) });
}

/** True when this address has a live Warehaus Staff invite. Used to send verification mail. */
export const emailHasLiveStaffInvite = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const normalized = normalizeEmail(email);
    const pending = await ctx.db
      .query('pendingInvites')
      .withIndex('by_email', (q) => q.eq('email', normalized))
      .collect();
    const staff = pending.find((row) => row.role === 'Warehaus Staff' && row.inviteStatus === 'Pending');
    if (!staff) return { ok: false as const };
    const tokens = await ctx.db
      .query('inviteTokens')
      .withIndex('by_contactNotionPageId', (q) => q.eq('contactNotionPageId', staff.notionPageId))
      .collect();
    const now = Date.now();
    const live = tokens.some(
      (token) => token.status === 'live' && token.expiresAt > now && token.emailNormalized === normalized,
    );
    return { ok: live };
  },
});

/** Marks live tokens past expiresAt and queues Invite Status Expired for Notion. */
export const expireDue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db
      .query('inviteTokens')
      .withIndex('by_status_expiresAt', (q) => q.eq('status', 'live').lt('expiresAt', now))
      .take(50);
    let expired = 0;
    for (const token of due) {
      if (!liveTokenIsExpired(token.status, token.expiresAt, now)) continue;
      await ctx.db.patch(token._id, { status: 'expired' });
      const pending = await ctx.db
        .query('pendingInvites')
        .withIndex('by_notionPageId', (q) => q.eq('notionPageId', token.contactNotionPageId))
        .unique();
      if (pending?.inviteStatus === 'Pending') {
        await ctx.db.patch(pending._id, { inviteStatus: 'Expired' });
      }
      await enqueueInvite(ctx, {
        idempotencyKey: stateIdempotencyKey(token.contactNotionPageId, 'Expired', token._id),
        kind: 'setInviteState',
        orgId: token.orgId,
        notionPageId: token.contactNotionPageId,
        expectedLastEditedTime: await lastEditedFor(ctx, token.contactNotionPageId),
        payload: JSON.stringify({
          properties: inviteStateProperties('Expired'),
          tokenId: token._id,
        }),
        actor: 'system',
      });
      expired += 1;
    }
    return { expired };
  },
});

/** Always the same sentence. Emails the original sender when the link is expired. */
export const requestRenew = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const message = renewRequestMessage();
    const tokenHash = await hashInviteToken(token);
    const row = await ctx.db
      .query('inviteTokens')
      .withIndex('by_tokenHash', (q) => q.eq('tokenHash', tokenHash))
      .unique();
    const now = Date.now();
    const expired = row != null && (row.status === 'expired' || (row.status === 'live' && row.expiresAt <= now));
    if (!expired) return { ok: true as const, message };
    const since = now - 24 * 60 * 60 * 1000;
    const events = await ctx.db
      .query('auditEvents')
      .withIndex('by_notionPageId', (q) => q.eq('notionPageId', row.contactNotionPageId))
      .collect();
    const hits = events.filter(
      (event) => event.action === 'invite.renewRequest' && event.after === row.tokenHash && event.createdAt >= since,
    );
    if (hits.length >= 3) return { ok: true as const, message };
    const inviter = row.createdByContactId ? await ctx.db.get(row.createdByContactId) : null;
    await ctx.db.insert('auditEvents', {
      orgId: row.orgId,
      actorKind: 'system',
      action: 'invite.renewRequest',
      notionPageId: row.contactNotionPageId,
      after: row.tokenHash,
      createdAt: now,
    });
    if (inviter?.email) {
      await ctx.scheduler.runAfter(0, internal.invites.sendRenewNotice, {
        to: inviter.email,
        inviteeEmail: row.emailNormalized,
      });
    }
    return { ok: true as const, message };
  },
});

export const sendRenewNotice = internalAction({
  args: { to: v.string(), inviteeEmail: v.string() },
  handler: async (_ctx, args) => {
    const from = process.env.EMAIL_FROM?.trim();
    if (!from || !isInviteEmailEnabled(process.env.INVITE_EMAIL_ENABLED)) return { sent: false as const };
    const mail = renewRequestEmail({ inviteeEmail: args.inviteeEmail });
    await sendPortalEmail({ to: args.to, ...mail, from });
    return { sent: true as const };
  },
});

export const sendIssuedInvite = internalAction({
  args: {
    to: v.string(),
    rawToken: v.string(),
    name: v.string(),
    alreadyHasLogin: v.optional(v.boolean()),
    inviterName: v.optional(v.string()),
    expiresOn: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const from = process.env.EMAIL_FROM?.trim();
    return sendIssuedInviteMail(
      {
        to: args.to,
        name: args.name,
        rawToken: args.rawToken,
        alreadyHasLogin: args.alreadyHasLogin === true,
        inviterName: args.inviterName,
        expiresOn: args.expiresOn,
      },
      {
        INVITE_EMAIL_ENABLED: process.env.INVITE_EMAIL_ENABLED,
        PORTAL_PUBLIC_URL: process.env.PORTAL_PUBLIC_URL,
        EMAIL_FROM: from,
      },
      {
        send: (message) => sendPortalEmail({ ...message, from }),
      },
    );
  },
});
