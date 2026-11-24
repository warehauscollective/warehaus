import assert from 'node:assert/strict';
import { ConvexError } from 'convex/values';
import { describe, it } from 'node:test';
import schema from '../schema';
import { applyContactRead, recordStaffNotice } from '../invitesSync';
import { enqueue } from '../sync/outbox';
import { grantInviteSignupFromHook, takeInviteSignupFromHook } from '../auth';
import {
  accept,
  create,
  decline,
  expireDue,
  grantSignupPermit,
  issueTokenAfterConfirm,
  listTeam,
  releaseHeldToken,
  remove,
  revoke,
  takeSignupPermit,
} from '../invites';
import { decideContactSync, isOrgVisibleToClients } from '@warehaus/portal-sync';
import { pendingInviteSyncConceal } from '../sync/pull';
import { selectContactForJoin } from './contactJoin';
import { INVITE_CLIENT_FAILURE, hashInviteToken, teamInviteActions } from './inviteFlow';
import { memoryCtx, type MemoryCtx, type Respond } from './memoryCtx.testkit';
import { seedContact, seedOrg } from './seedRows.testkit';

const REAL_WAREHAUS_PAGE = '3b1ffd60-316b-813f-987b-f9912477dbc0';
const DAY = 86_400_000;

/**
 * accept, decline, grantSignupPermit and the createInvite branch of
 * issueTokenAfterConfirm read the Better Auth user through
 * `ctx.runQuery(components.betterAuth.adapter.findOne, ...)`. memoryCtx names
 * every runQuery with `getFunctionName`, which throws on a child component
 * reference, so those handlers cannot run here yet.
 */
type Row = Record<string, unknown> & { _id: string };
type Result = Record<string, unknown> & { ok?: boolean; status?: string; message?: string };
type Account = { _id: string; email: string; emailVerified: boolean };
type Env = Record<string, string | undefined>;

const ADA: Account = { _id: 'user-1', email: 'ada@northwind.test', emailVerified: true };
const NEW_STAFF: Account = { _id: 'user-new', email: 'new.staff@warehaus.co', emailVerified: true };
const STAFF_AUTH = 'auth-staff';

const WRITEBACK_ON: Env = { NOTION_WRITEBACK_ENABLED: 'true' };
const WRITEBACK_OFF: Env = { NOTION_WRITEBACK_ENABLED: undefined };
const SEND_ON: Env = {
  NOTION_WRITEBACK_ENABLED: 'true',
  INVITE_EMAIL_ENABLED: 'true',
  PORTAL_PUBLIC_URL: 'http://localhost:3100',
};

async function withEnv(vars: Env, fn: () => Promise<void>) {
  const previous: Env = {};
  for (const [key, value] of Object.entries(vars)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

/** Every row of every table, to prove a refused call wrote nothing. */
const everything = (t: MemoryCtx) =>
  Object.keys((schema as unknown as { tables: Record<string, unknown> }).tables).map((table) => t.rows(table));

/** The map `resolveIds` stores and `pullAll` passes to `decideContactSync`. */
function clientEnabledForPull(clients: Row[]): (id: string | undefined) => boolean {
  const enabled: Record<string, boolean> = {};
  for (const client of clients) {
    if (typeof client.notionPageId !== 'string') continue;
    const portalAccess = client.portalAccess === 'Enabled' ? 'Enabled' : 'Disabled';
    enabled[client.notionPageId] = isOrgVisibleToClients({
      portalAccess,
      syncHiddenAt: typeof client.syncHiddenAt === 'number' ? client.syncHiddenAt : null,
    });
  }
  return (id) => (id ? enabled[id] === true : false);
}

/**
 * Answers the nested calls an invite handler makes. Outbox enqueue and staff
 * notices really run. The Better Auth component, which memoryCtx cannot hold,
 * is answered from `accounts`: one live session, users by id or email.
 */
function inviteRespond(t: MemoryCtx, accounts: Account[]): Respond {
  return (call) => {
    if (call.kind === 'query' && typeof call.args.model === 'string') {
      if (call.args.model === 'session') return { _id: 'sess-1', expiresAt: Date.now() + 60_000 };
      if (call.args.model === 'user') {
        const where = (call.args.where ?? []) as Array<{ field?: string; value?: unknown }>;
        const id = where.find((item) => item.field === '_id')?.value;
        if (id != null) return accounts.find((row) => row._id === id) ?? null;
        const email = where.find((item) => item.field === 'email')?.value;
        if (email != null) return accounts.find((row) => row.email === email) ?? null;
      }
      return null;
    }
    if (call.name === 'sync/outbox:enqueue') return t.call(enqueue, call.args);
    if (call.name === 'invitesSync:recordStaffNotice') return t.call(recordStaffNotice, call.args);
    return undefined;
  };
}

type WorldOptions = {
  /** A Warehaus Staff invite on the warehaus-internal org, with its pending row. */
  staffInvite?: boolean;
  token?: Record<string, unknown>;
};

/**
 * Northwind with a client contact (Ada, user-1) and a staff contact (Alex,
 * auth-staff), plus one live invite token for `raw`.
 */
async function world(raw: string, options: WorldOptions = {}) {
  const t = memoryCtx();
  const northId = seedOrg(t, { slug: 'northwind', companyName: 'Northwind', notionPageId: 'north-notion' });
  seedContact(t, northId, {
    name: 'Ada Client',
    email: ADA.email,
    authUserId: ADA._id,
    role: 'Client Member',
    notionPageId: 'ada-notion',
  });
  const staffContactId = seedContact(t, northId, {
    name: 'Alex Staff',
    email: 'alex@warehaus.co',
    authUserId: STAFF_AUTH,
    role: 'Warehaus Staff',
    notionPageId: 'staff-notion',
  });
  let tokenOrgId = northId;
  let tokenEmail = ADA.email;
  let whId: string | undefined;
  if (options.staffInvite) {
    whId = seedOrg(t, { slug: 'warehaus-internal', notionPageId: 'wh-notion', companyName: 'Warehaus' });
    tokenOrgId = whId;
    tokenEmail = NEW_STAFF.email;
    t.seed('pendingInvites', {
      orgId: whId,
      notionPageId: 'contact-notion',
      name: 'New Staff',
      email: NEW_STAFF.email,
      role: 'Warehaus Staff',
      inviteStatus: 'Pending',
      source: 'portal',
      lastSyncedAt: 1,
    });
  }
  const tokenId = t.seed('inviteTokens', {
    orgId: tokenOrgId,
    contactNotionPageId: 'contact-notion',
    clientNotionPageId: 'client-notion',
    emailNormalized: tokenEmail,
    tokenHash: await hashInviteToken(raw),
    status: 'live',
    expiresAt: Date.now() + DAY,
    createdAt: 1,
    attempt: 0,
    ...options.token,
  });
  const accounts: Account[] = [ADA];
  const respond = inviteRespond(t, accounts);
  return {
    t,
    northId,
    whId,
    staffContactId,
    tokenId,
    accounts,
    respond,
    /** Run a handler signed in as `authUserId`, or signed out when it is omitted. */
    call: (fn: unknown, args: Record<string, unknown> = {}, authUserId?: string) =>
      t.call<Result>(fn, args, authUserId ? { as: { authUserId }, respond } : { respond }),
    outbox: () => t.rows('notionOutbox'),
    /** Marks an outbox row as confirmed by Notion. */
    confirm: (outboxId: string, fields: Record<string, unknown> = {}) =>
      t.db.patch(outboxId, { status: 'done', kind: 'setInviteState', ...fields }),
  };
}

function payloadOf(row: Row | undefined): Record<string, unknown> & {
  properties?: Record<string, unknown>;
  authUserId?: string;
  staffLink?: { role?: string };
  invite?: { clientNotionPageId?: string };
} {
  return JSON.parse(String(row?.payload)) as ReturnType<typeof payloadOf>;
}

/** Sets the Invite Status a confirmed setInviteState row carries. */
function withInviteStatus(row: Row | undefined, status: string) {
  const payload = payloadOf(row);
  payload.properties = { ...(payload.properties ?? {}), 'Invite Status': status };
  return JSON.stringify(payload);
}

function legacyRead(overrides: Partial<Parameters<typeof decideContactSync>[0]> = {}) {
  return decideContactSync({
    portalAccess: 'Disabled',
    inviteStatus: undefined,
    prevInviteStatus: null,
    source: 'portal',
    clientNotionId: REAL_WAREHAUS_PAGE,
    clientEnabled: () => true,
    liveToken: { clientNotionPageId: REAL_WAREHAUS_PAGE },
    verifiedAcceptance: false,
    ...overrides,
  });
}

/** The real Warehaus holder org and a live token for a legacy staff page. */
function legacyWorld() {
  const t = memoryCtx();
  const realId = seedOrg(t, { slug: 'warehaus', notionPageId: REAL_WAREHAUS_PAGE, companyName: 'Warehaus' });
  const tokenId = t.seed('inviteTokens', {
    orgId: realId,
    contactNotionPageId: 'page-legacy',
    clientNotionPageId: REAL_WAREHAUS_PAGE,
    emailNormalized: 'legacy@warehaus.co',
    tokenHash: 'hash-legacy',
    status: 'live',
    expiresAt: Date.now() + DAY,
    createdAt: 1,
  });
  return { t, realId, tokenId, respond: inviteRespond(t, []) };
}

function legacyArgs(orgId: string, decision: ReturnType<typeof decideContactSync>, extra: Record<string, unknown> = {}) {
  return {
    notionPageId: 'page-legacy',
    orgId,
    name: 'Legacy Staff',
    email: 'legacy@warehaus.co',
    role: 'Warehaus Staff',
    source: 'portal',
    placement: decision.placement,
    inviteStatus: decision.effective.inviteStatus,
    actionsJson: JSON.stringify(decision.actions),
    observedJson: '{}',
    ...extra,
  };
}

describe('invite accept, decline, and revoke', () => {
  it('holds the token in the same mutation and refuses a second accept', async () => {
    await withEnv(WRITEBACK_ON, async () => {
      const w = await world('raw-accept', { staffInvite: true });
      w.accounts.push(NEW_STAFF);
      assert.equal('id' in NEW_STAFF, false);

      const first = await w.call(accept, { token: 'raw-accept' }, NEW_STAFF._id);
      assert.deepEqual(first, { ok: true, status: 'pending' });
      assert.equal(w.t.row(w.tokenId)?.status, 'pending');
      assert.equal(w.outbox().length, 1);
      const payload = payloadOf(w.outbox()[0]);
      assert.equal(payload.authUserId, NEW_STAFF._id);
      assert.equal(payload.staffLink?.role, 'Warehaus Staff');

      const before = everything(w.t);
      const second = await w.call(accept, { token: 'raw-accept' }, NEW_STAFF._id);
      assert.equal(second.ok, false);
      assert.equal(second.status, 'unusable');
      assert.equal(w.t.row(w.tokenId)?.status, 'pending');
      assert.equal(w.outbox().length, 1);
      assert.deepEqual(everything(w.t), before);
    });
  });

  it(
    'puts the token back when the write dies, then marks it used when Notion confirms',
    async () => {
      await withEnv(WRITEBACK_ON, async () => {
        const w = await world('raw-accept', { staffInvite: true });
        w.accounts.push(NEW_STAFF);
        await w.call(accept, { token: 'raw-accept' }, NEW_STAFF._id);
        const outboxId = w.outbox()[0]?._id as string;

        await w.t.call(releaseHeldToken, { outboxId });
        assert.equal(w.t.row(w.tokenId)?.status, 'live');
        assert.equal(w.t.row(w.tokenId)?.attempt, 1);

        const again = await w.call(accept, { token: 'raw-accept' }, NEW_STAFF._id);
        assert.deepEqual(again, { ok: true, status: 'pending' });

        const held = w.outbox()[1];
        assert.ok(held);
        await w.confirm(held._id);
        await w.call(issueTokenAfterConfirm, { outboxId: held._id, notionPageId: 'contact-notion' });
        assert.equal(w.t.row(w.tokenId)?.status, 'used');

        const after = await w.call(accept, { token: 'raw-accept' }, NEW_STAFF._id);
        assert.equal(after.ok, false);
        assert.equal(after.status, 'used');
        assert.match(String(after.message), /already used/);
        assert.equal(w.t.row(w.tokenId)?.status, 'used');
      });
    },
  );

  it('refuses a second decline and kills the token when Notion confirms', async () => {
    await withEnv(WRITEBACK_ON, async () => {
      const w = await world('raw-decline');

      assert.deepEqual(await w.call(decline, { token: 'raw-decline' }, ADA._id), { ok: true, status: 'pending' });
      const before = everything(w.t);
      assert.deepEqual(await w.call(decline, { token: 'raw-decline' }, ADA._id), { ok: false, status: 'unusable' });
      assert.equal(w.outbox().length, 1);
      assert.deepEqual(everything(w.t), before);

      const held = w.outbox()[0];
      assert.ok(held);
      await w.confirm(held._id, { payload: withInviteStatus(held, 'Declined') });
      await w.call(issueTokenAfterConfirm, { outboxId: held._id, notionPageId: 'contact-notion' });
      assert.equal(w.t.row(w.tokenId)?.status, 'killed');
      assert.deepEqual(await w.call(accept, { token: 'raw-decline' }, ADA._id), {
        ok: false,
        status: 'revoked',
        message: 'This invite was revoked.',
      });
    });
  });

  it('refuses a second revoke and kills the token when Notion confirms', async () => {
    await withEnv(WRITEBACK_ON, async () => {
      const w = await world('raw-revoke');

      const first = await w.call(revoke, { contactNotionPageId: 'contact-notion' }, STAFF_AUTH);
      assert.deepEqual(first, { ok: true, status: 'pending' });
      assert.equal(w.t.row(w.tokenId)?.status, 'pending');

      const before = everything(w.t);
      const second = await w.call(revoke, { contactNotionPageId: 'contact-notion' }, STAFF_AUTH);
      assert.deepEqual(second, { ok: false, message: INVITE_CLIENT_FAILURE });
      assert.equal(w.outbox().length, 1);
      assert.deepEqual(everything(w.t), before);

      const held = w.outbox()[0];
      assert.ok(held);
      await w.confirm(held._id, { payload: withInviteStatus(held, 'Revoked') });
      await w.call(issueTokenAfterConfirm, { outboxId: held._id, notionPageId: 'contact-notion' });
      assert.equal(w.t.row(w.tokenId)?.status, 'killed');
    });
  });

  it('enqueues a portal-access disable for a client person and refuses staff', async () => {
    await withEnv(WRITEBACK_ON, async () => {
      const w = await world('raw-remove');
      seedContact(w.t, w.northId, {
        notionPageId: 'member-notion',
        name: 'Bea North',
        email: 'bea@northwind.test',
        role: 'Client Admin',
        portalAccess: 'Enabled',
      });

      const before = everything(w.t);
      const refused = await w.call(remove, { contactNotionPageId: 'staff-notion', requestId: 'req-staff' }, STAFF_AUTH);
      assert.deepEqual(refused, { ok: false, message: 'You cannot remove this person' });
      assert.equal(w.outbox().length, 0);
      assert.deepEqual(everything(w.t), before);

      const queued = await w.call(remove, { contactNotionPageId: 'member-notion', requestId: 'req-1' }, STAFF_AUTH);
      assert.deepEqual(queued, { ok: true, status: 'pending', message: 'Removal pending' });
      const rows = w.outbox();
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.kind, 'setInviteState');
      assert.equal(rows[0]?.database, 'contacts');
      assert.equal(rows[0]?.notionPageId, 'member-notion');
      assert.equal(rows[0]?.idempotencyKey, 'state:member-notion:Disabled:req-1');
      assert.equal(payloadOf(rows[0]).properties?.['Portal Access'], 'Disabled');
      assert.equal(w.t.row(w.tokenId)?.status, 'live');
    });
  });

  it('does not enqueue a removal when write-back is off', async () => {
    await withEnv(WRITEBACK_OFF, async () => {
      const w = await world('raw-remove-off');
      seedContact(w.t, w.northId, {
        notionPageId: 'member-notion',
        name: 'Bea North',
        email: 'bea@northwind.test',
        role: 'Client Member',
        portalAccess: 'Enabled',
      });
      const before = everything(w.t);
      const result = await w.call(remove, { contactNotionPageId: 'member-notion', requestId: 'req-off' }, STAFF_AUTH);
      assert.deepEqual(result, { ok: false, message: 'Write-back is off. Nothing was sent to Notion.' });
      assert.equal(w.outbox().length, 0);
      assert.deepEqual(everything(w.t), before);
    });
  });

  it(
    'refuses accept unless the invite is Warehaus Staff on the internal org',
    async () => {
      await withEnv(WRITEBACK_ON, async () => {
        const w = await world('raw-client');
        w.t.seed('pendingInvites', {
          orgId: w.northId,
          notionPageId: 'contact-notion',
          name: 'Ada Client',
          email: ADA.email,
          role: 'Client Member',
          inviteStatus: 'Pending',
          source: 'portal',
          lastSyncedAt: 1,
        });
        const before = everything(w.t);
        const refused = await w.call(accept, { token: 'raw-client' }, ADA._id);
        assert.equal(refused.ok, false);
        assert.equal(refused.status, 'unusable');
        assert.equal(w.t.row(w.tokenId)?.status, 'live');
        assert.equal(w.outbox().length, 0);
        assert.deepEqual(everything(w.t), before);
      });
    },
  );

  it('does not enqueue a staff invite when the Warehaus page id is a seed id', async () => {
    await withEnv(SEND_ON, async () => {
      const w = await world('raw-seed');
      seedOrg(w.t, { slug: 'warehaus-internal', notionPageId: 'seed-warehaus-org', companyName: 'Warehaus' });
      const tokensBefore = w.t.rows('inviteTokens').length;
      const contactsBefore = w.t.rows('contacts').length;
      const created = await w.call(
        create,
        { name: 'New Staff', email: 'new.staff@warehaus.co', requestId: 'req-seed' },
        STAFF_AUTH,
      );
      assert.equal(created.ok, false);
      assert.match(created.message ?? '', /seed-warehaus-org/);
      assert.match(created.message ?? '', /Nothing was queued/);
      assert.equal(w.outbox().length, 0);
      assert.equal(w.t.rows('inviteTokens').length, tokensBefore);
      assert.equal(w.t.rows('contacts').length, contactsBefore);
      assert.equal(w.t.rows('pendingInvites').length, 0);
      assert.equal(
        w.t.rows('contacts').some((row) => row.email === 'new.staff@warehaus.co'),
        false,
      );
      const notices = w.t.rows('notices');
      assert.equal(notices.length, 1);
      assert.match(String(notices[0]?.message), /Nothing was queued/);
    });
  });

  it('does not queue an invite when the holder row is portal-disabled', async () => {
    await withEnv(SEND_ON, async () => {
      const w = await world('raw-disabled');
      seedOrg(w.t, { slug: 'warehaus-internal', notionPageId: 'seed-warehaus-org', companyName: 'Warehaus (Internal)' });
      seedOrg(w.t, { slug: 'warehaus', notionPageId: REAL_WAREHAUS_PAGE, portalAccess: 'Disabled', companyName: 'Warehaus' });
      const tokensBefore = w.t.rows('inviteTokens').length;
      const created = await w.call(
        create,
        { name: 'New Staff', email: 'disabled.holder@warehaus.co', requestId: 'req-disabled' },
        STAFF_AUTH,
      );
      assert.equal(created.ok, false);
      assert.match(created.message ?? '', /portal access is disabled/);
      assert.match(created.message ?? '', /Nothing was queued/);
      assert.equal(w.outbox().length, 0);
      assert.equal(w.t.rows('inviteTokens').length, tokensBefore);
      assert.equal(
        w.t.rows('pendingInvites').some((row) => row.email === 'disabled.holder@warehaus.co'),
        false,
      );
      const notices = w.t.rows('notices');
      assert.equal(notices.length, 1);
      assert.match(String(notices[0]?.message), /Nothing was queued/);
    });
  });

  it('does not queue an invite when the holder row is hidden from sync', async () => {
    await withEnv(SEND_ON, async () => {
      const w = await world('raw-hidden');
      seedOrg(w.t, { slug: 'warehaus', notionPageId: REAL_WAREHAUS_PAGE, syncHiddenAt: 1, companyName: 'Warehaus' });
      const created = await w.call(
        create,
        { name: 'New Staff', email: 'hidden.holder@warehaus.co', requestId: 'req-hidden' },
        STAFF_AUTH,
      );
      assert.equal(created.ok, false);
      assert.match(created.message ?? '', /hidden from sync/);
      assert.match(created.message ?? '', /Nothing was queued/);
      assert.equal(w.outbox().length, 0);
      assert.equal(
        w.t.rows('pendingInvites').some((row) => row.email === 'hidden.holder@warehaus.co'),
        false,
      );
      assert.equal(
        w.t.rows('contacts').some((row) => row.email === 'hidden.holder@warehaus.co'),
        false,
      );
      assert.equal(w.t.rows('notices').length, 1);
    });
  });

  it('keeps a legacy pending invite whose Notion Invite Status is empty and backfills it', async () => {
    await withEnv(WRITEBACK_ON, async () => {
      const decision = legacyRead();
      assert.equal(decision.placement, 'UPSERT_PENDING_INVITE');
      assert.equal(decision.effective.inviteStatus, 'Pending');
      const conceal = pendingInviteSyncConceal(decision.placement);
      assert.equal(conceal?.revokeSessions, false);

      const w = legacyWorld();
      await w.t.call(
        applyContactRead,
        legacyArgs(w.realId, decision, { placement: 'UPSERT_PENDING_INVITE', inviteStatus: 'Pending' }),
        { respond: w.respond },
      );
      const kept = w.t.rows('pendingInvites').find((row) => row.notionPageId === 'page-legacy');
      assert.equal(kept?.inviteStatus, 'Pending');
      assert.equal(w.t.row(w.tokenId)?.status, 'live');
      const queued = w.t.rows('notionOutbox')[0];
      assert.equal(queued?.kind, 'revert');
      assert.equal(payloadOf(queued).properties?.['Invite Status'], 'Pending');
      assert.equal(String(queued?.idempotencyKey).includes('legacy-pending'), true);
    });
  });

  it('keeps a legacy pending invite when write-back is off and enqueues nothing', async () => {
    await withEnv(WRITEBACK_OFF, async () => {
      const decision = legacyRead();
      const w = legacyWorld();
      await w.t.call(applyContactRead, legacyArgs(w.realId, decision), { respond: w.respond });
      assert.equal(w.t.rows('notionOutbox').length, 0);
      assert.equal(
        w.t.rows('pendingInvites').find((row) => row.notionPageId === 'page-legacy')?.inviteStatus,
        'Pending',
      );
      assert.equal(w.t.row(w.tokenId)?.status, 'live');
      assert.equal(
        w.t.rows('auditEvents').some((row) => row.action === 'invite.backfill.Invite Status'),
        false,
      );
    });
  });

  it('enqueues one backfill per observed edit through the real enqueue', async () => {
    await withEnv(WRITEBACK_ON, async () => {
      const decision = legacyRead();
      const w = legacyWorld();
      const args = legacyArgs(w.realId, decision);
      const options = { respond: w.respond };
      await w.t.call(applyContactRead, args, options);
      await w.t.call(applyContactRead, args, options);
      const backfills = () =>
        w.t.rows('auditEvents').filter((row) => row.action === 'invite.backfill.Invite Status').length;
      assert.equal(w.t.rows('notionOutbox').length, 1);
      assert.equal(String(w.t.rows('notionOutbox')[0]?.idempotencyKey).includes('legacy-pending'), true);
      assert.equal(w.t.rows('pendingInvites')[0]?.inviteStatus, 'Pending');
      assert.equal(w.t.row(w.tokenId)?.status, 'live');
      assert.equal(backfills(), 1);

      const edited = '2026-11-01T00:00:00.000Z';
      await w.t.call(applyContactRead, { ...args, notionLastEditedTime: edited }, options);
      await w.t.call(applyContactRead, { ...args, notionLastEditedTime: edited }, options);
      assert.equal(w.t.rows('notionOutbox').length, 2);
      assert.equal(
        w.t.rows('notionOutbox').filter((row) => String(row.idempotencyKey).endsWith(edited)).length,
        1,
      );
      assert.equal(backfills(), 2);
    });
  });

  it('hides a pending invite without revoking sessions, and revokes when the invite is dropped', () => {
    const kept = pendingInviteSyncConceal('UPSERT_PENDING_INVITE');
    assert.equal(kept?.action, 'hide');
    assert.equal(kept?.revokeSessions, false);
    const dropped = pendingInviteSyncConceal('SKIP_AND_DROP_PENDING');
    assert.equal(dropped?.revokeSessions, true);
  });

  it('treats the slug row and the holder row as one staff org', async () => {
    await withEnv(SEND_ON, async () => {
      const w = await world('raw-same-org');
      const seedId = seedOrg(w.t, {
        slug: 'warehaus-internal',
        notionPageId: 'seed-warehaus-org',
        companyName: 'Warehaus (Internal)',
      });
      const realId = seedOrg(w.t, { slug: 'warehaus', notionPageId: REAL_WAREHAUS_PAGE, companyName: 'Warehaus' });
      w.t.seed('pendingInvites', {
        orgId: seedId,
        notionPageId: 'page-seed-email',
        name: 'Moved Staff',
        email: 'moved.staff@warehaus.co',
        role: 'Warehaus Staff',
        inviteStatus: 'Pending',
        source: 'portal',
        lastSyncedAt: 1,
      });
      const created = await w.call(
        create,
        { name: 'Moved Staff', email: 'moved.staff@warehaus.co', requestId: 'req-same-org' },
        STAFF_AUTH,
      );
      assert.equal(created.ok, true);
      assert.equal(w.outbox()[0]?.orgId, realId);
    });
  });

  it('names a duplicate warehaus-internal slug instead of a unique-index error', async () => {
    await withEnv(WRITEBACK_ON, async () => {
      const w = await world('raw-dup', { staffInvite: true });
      w.accounts.push(NEW_STAFF);
      seedOrg(w.t, { slug: 'warehaus-internal', notionPageId: 'seed-warehaus-org-2', companyName: 'Warehaus other' });
      const before = everything(w.t);
      await assert.rejects(
        () => w.call(accept, { token: 'raw-dup' }, NEW_STAFF._id),
        (err: unknown) => {
          assert.ok(err instanceof ConvexError);
          assert.equal(err.data, 'More than one client uses the warehaus-internal slug. Nothing was queued.');
          return true;
        },
      );
      assert.deepEqual(everything(w.t), before);
    });
  });

  it(
    'keeps an invite on the row that holds the Notion page through the next sync',
    async () => {
      const w = await world('raw-real');
      seedOrg(w.t, { slug: 'warehaus-internal', notionPageId: 'seed-warehaus-org', companyName: 'Warehaus (Internal)' });
      const seedOrgId = w.t.rows('clients').find((row) => row.notionPageId === 'seed-warehaus-org')?._id as string;
      const realId = seedOrg(w.t, { slug: 'warehaus', notionPageId: REAL_WAREHAUS_PAGE, companyName: 'Warehaus' });
      const seedStaffId = seedContact(w.t, seedOrgId, {
        name: 'Seed Staff',
        email: 'seed.staff@warehaus.co',
        authUserId: 'user-seed',
        role: 'Warehaus Staff',
        portalAccess: 'Enabled',
      });
      await withEnv({ ...SEND_ON, WAREHAUS_INTERNAL_CLIENT_ID: realId }, async () => {
        const created = await w.call(
          create,
          { name: 'New Staff', email: 'new.staff@warehaus.co', requestId: 'req-real' },
          STAFF_AUTH,
        );
        assert.deepEqual(created, { ok: true, status: 'pending', message: 'Invite pending' });
        const queued = w.outbox()[0];
        assert.equal(queued?.orgId, realId);
        const payload = payloadOf(queued);
        assert.deepEqual(payload.properties?.['Client Company'], [REAL_WAREHAUS_PAGE]);
        assert.equal(payload.invite?.clientNotionPageId, REAL_WAREHAUS_PAGE);
        assert.equal(queued?.orgId === seedOrgId, false);

        assert.ok(queued);
        await w.confirm(queued._id, { kind: 'createInvite' });
        const issued = await w.call(issueTokenAfterConfirm, { outboxId: queued._id, notionPageId: 'contact-new' });
        assert.equal(issued.issued, true);
        const pending = w.t.rows('pendingInvites').find((row) => row.email === 'new.staff@warehaus.co');
        assert.ok(pending);
        assert.equal(pending.orgId, realId);
        const live = w.t.rows('inviteTokens').find((row) => row.emailNormalized === 'new.staff@warehaus.co');
        assert.equal(live?.clientNotionPageId, REAL_WAREHAUS_PAGE);
        assert.equal(live?.orgId, realId);

        const clientEnabled = clientEnabledForPull(w.t.rows('clients'));
        assert.equal(clientEnabled(REAL_WAREHAUS_PAGE), true);
        const decision = decideContactSync({
          portalAccess: 'Disabled',
          inviteStatus: 'Pending',
          source: 'portal',
          clientNotionId: REAL_WAREHAUS_PAGE,
          clientEnabled,
          liveToken: { clientNotionPageId: REAL_WAREHAUS_PAGE },
          verifiedAcceptance: false,
        });
        const placement: string = decision.placement;
        assert.equal(placement === 'SKIP_AND_DROP_PENDING', false);
        assert.equal(placement, 'UPSERT_PENDING_INVITE');
        const conceal = pendingInviteSyncConceal(placement);
        assert.ok(conceal);
        assert.equal(conceal.revokeSessions, false);
        await w.call(applyContactRead, {
          notionPageId: 'contact-new',
          orgId: realId,
          name: 'New Staff',
          email: 'new.staff@warehaus.co',
          role: 'Warehaus Staff',
          source: 'portal',
          placement: decision.placement,
          inviteStatus: 'Pending',
          actionsJson: '[]',
          observedJson: '{}',
        });
        const kept = w.t.rows('pendingInvites').find((row) => row.notionPageId === 'contact-new');
        assert.ok(kept);
        assert.equal(kept.orgId, realId);
        assert.equal(kept.inviteStatus, 'Pending');
        assert.ok(w.t.row(seedStaffId));
        assert.equal(w.t.row(String(live?._id))?.status, 'live');

        const team = (await w.call(listTeam, {}, STAFF_AUTH)) as unknown as {
          invites: Array<{ email?: string }>;
          members: Array<{ email?: string }>;
        };
        assert.equal(
          team.invites.some((invite) => invite.email === 'new.staff@warehaus.co'),
          true,
        );
        assert.equal(
          team.members.some((member) => member.email === 'seed.staff@warehaus.co'),
          true,
        );

        w.accounts.push(NEW_STAFF);
        const accepted = await w.call(accept, { token: issued.raw }, NEW_STAFF._id);
        assert.deepEqual(accepted, { ok: true, status: 'pending' });
        const held = w.outbox().slice(-1)[0];
        assert.ok(held);
        await w.confirm(held._id);
        await w.call(issueTokenAfterConfirm, { outboxId: held._id, notionPageId: 'contact-new' });
        const linked = w.t.rows('contacts').find((row) => row.email === 'new.staff@warehaus.co');
        assert.ok(linked);
        assert.equal(linked.orgId, realId);
        assert.equal(linked.role, 'Warehaus Staff');
        assert.equal(linked.authUserId, NEW_STAFF._id);
      });
    },
  );

  it(
    'links a new user and an existing account, then sign-in finds the staff contact',
    async () => {
      await withEnv(SEND_ON, async () => {
        for (const existing of [false, true]) {
          const email = existing ? 'sam.existing@warehaus.co' : 'new.staff@warehaus.co';
          const authId = existing ? 'user-existing' : 'user-new';
          const account: Account = { _id: authId, email, emailVerified: true };
          const w = await world(`raw-${authId}`);
          seedOrg(w.t, {
            slug: 'warehaus-internal',
            notionPageId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            companyName: 'Warehaus',
          });
          if (existing) w.accounts.push(account);
          const created = await w.call(
            create,
            { name: existing ? 'Sam Existing' : 'New Staff', email, requestId: `req-${authId}` },
            STAFF_AUTH,
          );
          assert.deepEqual(created, { ok: true, status: 'pending', message: 'Invite pending' });
          const queued = w.outbox()[0];
          assert.ok(queued);
          await w.confirm(queued._id, { kind: 'createInvite' });
          const issued = await w.call(issueTokenAfterConfirm, { outboxId: queued._id, notionPageId: `page-${authId}` });
          assert.equal(issued.issued, true);
          assert.equal(issued.alreadyHasLogin, existing);
          assert.equal(issued.inviterName, 'Alex Staff');
          assert.match(String(issued.expiresOn ?? ''), /[A-Z][a-z]+ \d+, \d{4}/);
          assert.equal(String(issued.expiresOn ?? '').includes('7 days from now'), false);

          // A new user signs up between the invite email and accept.
          if (!existing) w.accounts.push(account);
          const accepted = await w.call(accept, { token: issued.raw }, authId);
          assert.deepEqual(accepted, { ok: true, status: 'pending' });
          const held = w.outbox().slice(-1)[0];
          assert.ok(held);
          await w.confirm(held._id);
          await w.call(issueTokenAfterConfirm, { outboxId: held._id, notionPageId: `page-${authId}` }, authId);
          const linked = w.t.rows('contacts').find((row) => row.email === email && row.role === 'Warehaus Staff');
          assert.ok(linked);
          assert.equal(linked.authUserId, authId);
          assert.equal(linked.portalAccess, 'Enabled');
          const joined = selectContactForJoin({
            email,
            authUserId: authId,
            emailVerified: true,
            contacts: [
              {
                _id: String(linked._id),
                orgId: String(linked.orgId),
                email: String(linked.email),
                name: String(linked.name),
                role: 'Warehaus Staff',
                portalAccess: 'Enabled',
                authUserId: String(linked.authUserId),
                notionPageId: String(linked.notionPageId),
              },
            ],
          });
          assert.equal(joined.authUserId, authId);
        }
      });
    },
  );

  it('queues Expired for Notion and keeps that status when sync sends Pending again', async () => {
    await withEnv(WRITEBACK_ON, async () => {
      const w = await world('raw-expire', { staffInvite: true, token: { expiresAt: Date.now() - 1_000, status: 'live' } });
      const whId = w.whId as string;
      const pendingId = w.t.rows('pendingInvites')[0]?._id as string;
      assert.equal(w.t.row(pendingId)?.inviteStatus, 'Pending');

      const result = await w.call(expireDue);
      assert.equal(result.ok, undefined);
      assert.equal(w.t.row(w.tokenId)?.status, 'expired');
      assert.equal(w.t.row(pendingId)?.inviteStatus, 'Expired');
      const queued = w.outbox()[0];
      assert.equal(payloadOf(queued).properties?.['Invite Status'], 'Expired');

      assert.ok(queued);
      await w.confirm(queued._id);
      await w.call(issueTokenAfterConfirm, { outboxId: queued._id, notionPageId: 'contact-notion' });
      assert.equal(w.t.rows('pendingInvites').length, 1);
      assert.equal(w.t.row(pendingId)?.inviteStatus, 'Expired');

      const read = {
        notionPageId: 'contact-notion',
        orgId: whId,
        name: 'New Staff',
        email: NEW_STAFF.email,
        role: 'Warehaus Staff',
        source: 'portal',
        actionsJson: '[]',
        observedJson: '{}',
      };
      await w.call(applyContactRead, { ...read, placement: 'UPSERT_PENDING_INVITE', inviteStatus: 'Pending' });
      assert.equal(w.t.row(pendingId)?.inviteStatus, 'Expired');

      await w.call(applyContactRead, { ...read, placement: 'SKIP_AND_DROP_PENDING', inviteStatus: 'Expired' });
      assert.equal(w.t.rows('pendingInvites').length, 1);
      assert.equal(w.t.row(pendingId)?.inviteStatus, 'Expired');

      const team = await w.call(listTeam, {}, STAFF_AUTH);
      const listed = (team as { invites?: Array<{ email?: string; inviteStatus?: string }> }).invites ?? [];
      const row = listed.find((invite) => invite.email === NEW_STAFF.email);
      assert.ok(row);
      assert.equal(row.inviteStatus, 'Expired');
      assert.deepEqual(teamInviteActions(String(row.inviteStatus)), { resend: true, revoke: false });

      const before = w.t.rows('pendingInvites').length;
      await w.call(applyContactRead, {
        ...read,
        notionPageId: 'never-issued',
        name: 'Ghost',
        email: 'ghost@warehaus.co',
        placement: 'SKIP_AND_DROP_PENDING',
        inviteStatus: 'Expired',
      });
      assert.equal(
        w.t.rows('pendingInvites').some((invite) => invite.notionPageId === 'never-issued'),
        false,
      );
      assert.equal(w.t.rows('pendingInvites').length, before);
    });
  });

  it('consumes a signup permit once and ignores an expired one', async () => {
    const w = await world('raw-permit', { staffInvite: true });
    const granted = await w.call(grantSignupPermit, { token: 'raw-permit', email: NEW_STAFF.email });
    assert.deepEqual(granted, { ok: true });
    assert.equal(w.t.rows('inviteSignupPermits').length, 1);
    const first = await w.call(takeSignupPermit, { email: 'New.Staff@warehaus.co' });
    assert.deepEqual(first, { ok: true });
    assert.equal(w.t.rows('inviteSignupPermits').length, 0);
    const second = await w.call(takeSignupPermit, { email: NEW_STAFF.email });
    assert.deepEqual(second, { ok: false });

    w.t.seed('inviteSignupPermits', { tokenHash: 'dead', email: NEW_STAFF.email, expiresAt: Date.now() - 1 });
    const expired = await w.call(takeSignupPermit, { email: NEW_STAFF.email });
    assert.deepEqual(expired, { ok: false });
    assert.equal(w.t.rows('inviteSignupPermits').length, 0);
  });

  it('verifies a new invite user through the auth signup permit hooks', async () => {
    const w = await world('raw-hook', { staffInvite: true });
    const runMutation = async (_ref: unknown, args: Record<string, unknown>) => {
      const email = String(args.email ?? '');
      if (typeof args.token === 'string') return w.call(grantSignupPermit, { token: args.token, email });
      return w.call(takeSignupPermit, { email });
    };
    const granted = await grantInviteSignupFromHook(runMutation, { token: 'raw-hook', email: NEW_STAFF.email });
    assert.equal(granted, true);
    assert.equal(w.t.rows('inviteSignupPermits').length, 1);
    const created = await takeInviteSignupFromHook(runMutation, { email: 'New.Staff@warehaus.co', name: 'New Staff' });
    assert.equal(created?.data.emailVerified, true);
    assert.equal(created?.data.name, 'New Staff');
    assert.equal(w.t.rows('inviteSignupPermits').length, 0);
    const again = await takeInviteSignupFromHook(runMutation, { email: NEW_STAFF.email, name: 'New Staff' });
    assert.equal(again, null);
  });
});
