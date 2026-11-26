import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { RUNNER_PAIR_PATHS, RUNNER_PROTOCOL_HEADER, RUNNER_PROTOCOL_MIN, RUNNER_PROTOCOL_VERSION } from '@warehaus/runner-protocol';
import { claimNext, releaseStuckRuns, runnerHealth, touchRunner } from '../agent';
import { agentPairHttp } from '../agentHttp';
import * as runnersModule from '../runners';
import { clearQueuedPlanning, confirmPairing, findPairing, pairingStatus, revokeRunner, startPairing } from '../runners';
import { PortalAuthError } from './identity';
import { memoryCtx, type MemoryCtx, type RunCall } from './memoryCtx.testkit';
import {
  PAIRING_CODE_ALPHABET,
  PAIRING_MAX_OPEN,
  PAIRING_TTL_MS,
  NO_REGISTERED_RUNNER_NOTE,
  NO_RUNNER_AFTER_MS,
  NO_RUNNER_ONLINE_NOTE,
  RUNNER_ID_TAKEN,
  noRunnerNoteFor,
  formatPairingCode,
  normalizePairingCode,
  pairingCodeFrom,
  pairingPoll,
  proposedRunnerIdFrom,
  runnerAccess,
  runnerOutOfDate,
  runnerProtocolVersion,
} from './runnerRegistry';
import { seedMilestoneWorld } from './seedRows.testkit';
import { sha256Hex } from './tokenCrypto';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const SECRET = 's'.repeat(43);
const POLL_KEY = 'p'.repeat(43);
const REPO = 'warehauscollective/warehaus';

function respondWith(t: MemoryCtx) {
  return (call: RunCall) => {
    if (call.name.endsWith('startPairing')) return t.call(startPairing, call.args);
    if (call.name.endsWith('pairingStatus')) return t.call(pairingStatus, call.args);
    throw new Error(`unexpected call ${call.name}`);
  };
}

async function post(t: MemoryCtx, path: string, body: Record<string, unknown>) {
  const request = new Request(`https://dev.convex.site${path}`, { method: 'POST', body: JSON.stringify(body) });
  const response = await t.callHttp(agentPairHttp, request, { respond: respondWith(t) });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function startOne(t: MemoryCtx, proposedRunnerId = 'Peter-MBP.local') {
  return post(t, RUNNER_PAIR_PATHS.start, {
    proposedRunnerId,
    tokenHash: await sha256Hex(SECRET),
    pollKeyHash: await sha256Hex(POLL_KEY),
  });
}

describe('pairing codes', () => {
  it('makes 8-character codes from an alphabet with no look-alike letters', () => {
    const code = pairingCodeFrom(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 255]));
    assert.equal(code.length, 8);
    for (const char of code) assert.equal(PAIRING_CODE_ALPHABET.includes(char), true);
    for (const confusable of ['0', 'O', '1', 'I', 'L']) assert.equal(PAIRING_CODE_ALPHABET.includes(confusable), false);
    assert.equal(formatPairingCode('K7QM4XPA'), 'K7QM-4XPA');
  });

  it('reads a code as staff type it, and refuses anything else', () => {
    assert.equal(normalizePairingCode('k7qm-4xpa'), 'K7QM4XPA');
    assert.equal(normalizePairingCode(' K7QM 4XPA '), 'K7QM4XPA');
    for (const bad of ['K7QM-4XP', 'K7QM-4XPA0', 'K7QM-4XPO', '', null, 12345678]) assert.equal(normalizePairingCode(bad), null, String(bad));
  });

  it('proposes an id from the hostname', () => {
    assert.equal(proposedRunnerIdFrom('Peter-MBP.local'), 'peter-mbp-local');
    assert.equal(proposedRunnerIdFrom('peter-mbp-prod'), 'peter-mbp-prod');
    assert.equal(proposedRunnerIdFrom('!!'), 'runner');
  });

  it('tells the CLI only open, confirmed or expired, never a secret', () => {
    assert.deepEqual(pairingPoll(null, 1), { status: 'expired' });
    assert.deepEqual(pairingPoll({ status: 'open', expiresAt: 10 }, 5), { status: 'open', expiresAt: 10 });
    assert.deepEqual(pairingPoll({ status: 'open', expiresAt: 10 }, 10), { status: 'expired' });
    assert.deepEqual(pairingPoll({ status: 'confirmed', expiresAt: 10, runnerId: 'peter-mbp' }, 50), { status: 'confirmed', runnerId: 'peter-mbp' });
  });
});

describe('runner access', () => {
  it('lets in a registered runner by the hash of its secret, or the fallback, and nothing else', async () => {
    const tokenHash = await sha256Hex(SECRET);
    const row = { tokenHash, registeredAt: 1 };
    assert.equal(runnerAccess({ row, tokenHash, envAuthorized: false }), 'registered');
    assert.equal(runnerAccess({ row, tokenHash: await sha256Hex('wrong'), envAuthorized: false }), null);
    assert.equal(runnerAccess({ row: { tokenHash, registeredAt: null }, tokenHash, envAuthorized: false }), null);
    assert.equal(runnerAccess({ row: null, tokenHash, envAuthorized: true }), 'env');
    assert.equal(runnerAccess({ row: null, tokenHash: null, envAuthorized: false }), null);
  });

  it('compares the hash in constant time', () => {
    const source = read('./runnerRegistry.ts');
    const body = source.slice(source.indexOf('export function runnerAccess'), source.indexOf('/** `X-Runner-Protocol`'));
    assert.match(body, /timingSafeEqualUtf8/);
    assert.doesNotMatch(body, /tokenHash\s*===|===\s*input\.tokenHash/);
  });

  it('reads the protocol header, and a runner that sends none is version 1', () => {
    assert.equal(runnerProtocolVersion(null), 1);
    assert.equal(runnerProtocolVersion('abc'), 1);
    assert.equal(runnerProtocolVersion(String(RUNNER_PROTOCOL_VERSION)), RUNNER_PROTOCOL_VERSION);
    assert.equal(runnerOutOfDate(RUNNER_PROTOCOL_MIN - 1), true);
    assert.equal(runnerOutOfDate(RUNNER_PROTOCOL_VERSION), false);
    assert.equal(RUNNER_PROTOCOL_HEADER, 'x-runner-protocol');
  });
});

describe('pairing from the CLI to the Portal', () => {
  it('pairs: start sends hashes, staff confirm, the poll says confirmed, and the secret is never stored', async () => {
    const t = memoryCtx();
    const started = await startOne(t);
    assert.equal(started.status, 200);
    const code = String(started.body.code);
    assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.equal(started.body.proposedRunnerId, 'peter-mbp-local');

    const waiting = await post(t, RUNNER_PAIR_PATHS.poll, { code, pollKey: POLL_KEY });
    assert.equal(waiting.body.status, 'open');

    const found = await t.call<{ code: string; proposedRunnerId: string } | null>(findPairing, { code: code.toLowerCase() }, { as: 'staff' });
    assert.equal(found?.code, code);
    const confirmed = await t.call(confirmPairing, { code, runnerId: 'peter-mbp' }, { as: 'staff' });
    assert.deepEqual(confirmed, { ok: true, runnerId: 'peter-mbp' });

    const done = await post(t, RUNNER_PAIR_PATHS.poll, { code, pollKey: POLL_KEY });
    assert.deepEqual(done.body, { status: 'confirmed', runnerId: 'peter-mbp' });
    // Someone with the code but not the poll key learns nothing.
    const stranger = await post(t, RUNNER_PAIR_PATHS.poll, { code, pollKey: 'x'.repeat(43) });
    assert.deepEqual(stranger.body, { status: 'expired' });

    const stored = JSON.stringify([...t.rows('agentRunners'), ...t.rows('agentRunnerPairings')]);
    assert.equal(stored.includes(SECRET), false);
    assert.equal(stored.includes(POLL_KEY), false);
    assert.equal(t.rows('agentRunners')[0]?.tokenHash, await sha256Hex(SECRET));
  });

  it('lets the registered runner in, and serves every project that names a repository', async () => {
    const t = memoryCtx();
    const { code } = (await startOne(t)).body as { code: string };
    await t.call(confirmPairing, { code, runnerId: 'peter-mbp-prod' }, { as: 'staff' });
    const tokenHash = await sha256Hex(SECRET);
    assert.deepEqual(await t.call(touchRunner, { runnerId: 'peter-mbp-prod', tokenHash, protocolVersion: 2 }), { ok: true, registered: true });
    assert.equal(t.rows('agentRunners')[0]?.protocolVersion, 2);
    const wrong = await t.call<{ ok: boolean; status?: number }>(touchRunner, { runnerId: 'peter-mbp-prod', tokenHash: await sha256Hex('guess') });
    assert.equal(wrong.ok, false);
    assert.equal(wrong.status, 401);

    const world = seedMilestoneWorld(t, { status: 'Building', branch: 'milestone/launch' }, { agentRepo: REPO });
    world.task({ name: 'First', source: 'portal-milestone', milestoneOrder: 0 });
    const claimed = await t.call<{ kind: string }>(claimNext, { runnerId: 'peter-mbp-prod', mode: 'headless', repos: [], anyRepo: true });
    assert.equal(claimed.kind, 'task');
    // Without a registration, naming no repository still gets nothing.
    const bare = await t.call<{ kind: string }>(claimNext, { runnerId: 'studio-mini', mode: 'headless', repos: [] });
    assert.equal(bare.kind, 'none');
  });

  it('refuses a taken id, a wrong code, and a sixth open pairing', async () => {
    const t = memoryCtx();
    const first = (await startOne(t)).body as { code: string };
    await t.call(confirmPairing, { code: first.code, runnerId: 'peter-mbp' }, { as: 'staff' });
    const second = (await startOne(t)).body as { code: string };
    assert.deepEqual(await t.call(confirmPairing, { code: second.code, runnerId: 'peter-mbp' }, { as: 'staff' }), { ok: false, error: RUNNER_ID_TAKEN });
    const nope = await t.call<{ ok: boolean }>(confirmPairing, { code: 'ZZZZ-ZZZZ', runnerId: 'other' }, { as: 'staff' });
    assert.equal(nope.ok, false);
    for (let i = 1; i < PAIRING_MAX_OPEN; i += 1) assert.equal((await startOne(t)).status, 200);
    assert.equal((await startOne(t)).status, 429);
    assert.equal((await post(t, RUNNER_PAIR_PATHS.start, { proposedRunnerId: 'x', tokenHash: 'short', pollKeyHash: 'short' })).status, 400);
  });

  it('sweeps expired pairings from the stuck-run cron with one indexed, capped read', async () => {
    const t = memoryCtx();
    t.seed('agentRunnerPairings', {
      code: 'K7QM4XPA',
      pollKeyHash: 'a'.repeat(64),
      tokenHash: 'b'.repeat(64),
      proposedRunnerId: 'old',
      status: 'open',
      createdAt: 0,
      expiresAt: Date.now() - PAIRING_TTL_MS,
    });
    t.reads.reset();
    const result = await t.call<{ pairingsSwept: number }>(releaseStuckRuns, {});
    assert.equal(result.pairingsSwept, 1);
    assert.equal(t.rows('agentRunnerPairings').length, 0);
    assert.deepEqual(t.reads.unbounded(), []);
    assert.deepEqual(t.reads.unindexed(), []);
  });
});

describe('revoking a runner', () => {
  it('stops the runner at once and puts its task back in the queue', async () => {
    const t = memoryCtx();
    const { code } = (await startOne(t)).body as { code: string };
    await t.call(confirmPairing, { code, runnerId: 'peter-mbp' }, { as: 'staff' });
    const world = seedMilestoneWorld(t, { status: 'Building', branch: 'milestone/launch' }, { agentRepo: REPO });
    const taskId = world.task({ name: 'First', source: 'portal-milestone', milestoneOrder: 0 });
    const claimed = await t.call<{ runId: string }>(claimNext, { runnerId: 'peter-mbp', mode: 'headless', repos: [], anyRepo: true });

    const revoked = await t.call(revokeRunner, { runnerId: 'peter-mbp' }, { as: 'staff' });
    assert.deepEqual(revoked, { ok: true, released: 1 });
    assert.equal(t.row(claimed.runId)?.status, 'cancelled');
    assert.equal(t.row(taskId)?.status, 'To Do');
    assert.equal(t.row(taskId)?.claimedBy, undefined);
    const after = await t.call<{ ok: boolean; status?: number }>(touchRunner, { runnerId: 'peter-mbp', tokenHash: await sha256Hex(SECRET) });
    assert.equal(after.status, 401);
    assert.equal(t.rows('agentRunners')[0]?.tokenHash, undefined);
  });
});

describe('runner health with registrations', () => {
  it('lists registered runners for any project with a repository, with their protocol version', async () => {
    const t = memoryCtx();
    const { code } = (await startOne(t)).body as { code: string };
    await t.call(confirmPairing, { code, runnerId: 'peter-mbp-prod' }, { as: 'staff' });
    const world = seedMilestoneWorld(t, { status: 'Planning' }, { agentRepo: 'someone/else' });
    const view = await t.call<{ runnerAllowed: boolean; registeredCount: number; runners: Array<{ id: string; registered?: boolean }> }>(
      runnerHealth,
      { projectId: world.projectId },
      { as: 'staff' },
    );
    assert.equal(view.runnerAllowed, true);
    assert.equal(view.registeredCount, 1);
    assert.deepEqual(view.runners.map((runner) => [runner.id, runner.registered]), [['peter-mbp-prod', true]]);
  });
});

describe('who can pair and revoke', () => {
  it('exposes three staff functions and keeps the rest internal', async () => {
    type Registered = { _handler?: unknown; isPublic?: boolean; isInternal?: boolean };
    const functions = Object.entries(runnersModule as Record<string, unknown>).filter(
      ([, value]) => typeof (value as Registered | null)?._handler === 'function',
    ) as Array<[string, Registered]>;
    const publicNames = functions.filter(([, fn]) => fn.isPublic).map(([name]) => name).sort();
    assert.deepEqual(publicNames, ['confirmPairing', 'findPairing', 'revokeRunner']);
    for (const [name, fn] of functions) assert.equal(fn.isPublic === true || fn.isInternal === true, true, name);
    const t = memoryCtx();
    const args: Record<string, Record<string, string>> = {
      confirmPairing: { code: 'K7QM-4XPA', runnerId: 'x1' },
      findPairing: { code: 'K7QM-4XPA' },
      revokeRunner: { runnerId: 'x1' },
    };
    for (const name of publicNames) {
      const fn = (runnersModule as Record<string, unknown>)[name];
      await assert.rejects(t.call(fn, args[name], { as: 'client' }), PortalAuthError, `${name} as client`);
      await assert.rejects(t.call(fn, args[name]), PortalAuthError, `${name} signed out`);
    }
  });
});

describe('no runner alerts', () => {
  type Sweep = { noRunnerOpened: number; noRunnerClosed: number };
  const openNotes = (t: MemoryCtx, milestoneId: string) =>
    t.rows('milestoneNotes').filter((note) => note.milestoneId === milestoneId && note.needsPeter === 'open');

  it('picks the note from whether any runner is set up, and waits 30 minutes', () => {
    const base = { online: false, registeredCount: 0, hasRepo: true, buildingSince: 0, now: NO_RUNNER_AFTER_MS };
    assert.equal(noRunnerNoteFor(base), NO_REGISTERED_RUNNER_NOTE);
    assert.equal(noRunnerNoteFor({ ...base, registeredCount: 1 }), NO_RUNNER_ONLINE_NOTE);
    assert.equal(noRunnerNoteFor({ ...base, now: NO_RUNNER_AFTER_MS - 1 }), null);
    assert.equal(noRunnerNoteFor({ ...base, online: true }), null);
    assert.equal(noRunnerNoteFor({ ...base, hasRepo: false }), null);
  });

  it('leaves one note on a milestone Building 30 minutes with no runner, and closes it when a runner is online', async () => {
    const t = memoryCtx();
    const now = Date.now();
    const { milestoneId } = seedMilestoneWorld(t, { status: 'Building', statusChangedAt: now - NO_RUNNER_AFTER_MS - 1 }, { agentRepo: REPO });
    const fresh = seedMilestoneWorld(t, { status: 'Building', statusChangedAt: now }, { agentRepo: REPO });
    const noRepo = seedMilestoneWorld(t, { status: 'Building', statusChangedAt: 1 }, {});
    const first = await t.call<Sweep>(releaseStuckRuns, {});
    assert.equal(first.noRunnerOpened, 1);
    assert.deepEqual(openNotes(t, milestoneId).map((note) => note.body), [NO_REGISTERED_RUNNER_NOTE]);
    assert.deepEqual(openNotes(t, fresh.milestoneId), []);
    assert.deepEqual(openNotes(t, noRepo.milestoneId), []);
    // One open note per milestone: a second sweep adds none.
    t.reads.reset();
    assert.equal((await t.call<Sweep>(releaseStuckRuns, {})).noRunnerOpened, 0);
    assert.equal(openNotes(t, milestoneId).length, 1);
    assert.deepEqual(t.reads.unbounded(), []);
    assert.deepEqual(t.reads.unindexed(), []);
    // A registered runner comes online: the note closes.
    t.seed('agentRunners', { runnerId: 'peter-mbp-prod', windowStart: now, count: 0, lastSeenAt: Date.now(), registeredAt: now, tokenHash: 'h'.repeat(64) });
    assert.equal((await t.call<Sweep>(releaseStuckRuns, {})).noRunnerClosed, 1);
    assert.deepEqual(openNotes(t, milestoneId), []);
  });

  it('says no runner is online when one is registered but quiet, and closes the note when the milestone leaves Building', async () => {
    const t = memoryCtx();
    const now = Date.now();
    t.seed('agentRunners', { runnerId: 'peter-mbp-prod', windowStart: 0, count: 0, lastSeenAt: now - 60 * 60_000, registeredAt: 1, tokenHash: 'h'.repeat(64) });
    const { milestoneId } = seedMilestoneWorld(t, { status: 'Building', statusChangedAt: 1 }, { agentRepo: REPO });
    await t.call(releaseStuckRuns, {});
    assert.deepEqual(openNotes(t, milestoneId).map((note) => note.body), [NO_RUNNER_ONLINE_NOTE]);
    await t.db.patch(milestoneId, { status: 'Parked' });
    assert.equal((await t.call<Sweep>(releaseStuckRuns, {})).noRunnerClosed, 1);
    assert.deepEqual(openNotes(t, milestoneId), []);
  });
});

describe('production queue clear', () => {
  it('clears queued planning once, by hand, with an indexed bounded read, and leaves other states alone', async () => {
    const t = memoryCtx();
    const queued = seedMilestoneWorld(t, { status: 'Planning', planning: 'queued', name: 'Double Booking Awareness' }, {});
    const blocked = seedMilestoneWorld(t, { status: 'Planning', planning: 'blocked' }, { agentRepo: REPO });
    await assert.rejects(t.call(clearQueuedPlanning, { confirm: 'yes' }));
    t.reads.reset();
    const result = await t.call<{ cleared: number; names: string[] }>(clearQueuedPlanning, { confirm: 'clear the planning queue' });
    assert.deepEqual(result, { cleared: 1, names: ['Double Booking Awareness'] });
    assert.equal(t.row(queued.milestoneId)?.planning, undefined);
    assert.equal(t.row(blocked.milestoneId)?.planning, 'blocked');
    assert.deepEqual(t.reads.unbounded(), []);
    assert.deepEqual(t.reads.unindexed(), []);
    assert.equal((await t.call<{ cleared: number }>(clearQueuedPlanning, { confirm: 'clear the planning queue' })).cleared, 0);
    // Internal only.
    assert.match(read('../runners.ts'), /export const clearQueuedPlanning = internalMutation/);
  });
});

