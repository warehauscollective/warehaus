/**
 * Runner HTTP routes. The runner on a staff Mac calls these with its secret
 * as the bearer token and its id in `X-Runner-Id`. Only a registered runner
 * is let in: its secret is checked against the stored hash (ADR-0005).
 *
 *   POST /agent/claim     next planning job, task, or Cursor build
 *   POST /agent/events    one short line for the run feed
 *   POST /agent/tasks     the task list from a planning run
 *   POST /agent/complete  end a task run, or a planning run that failed
 *   POST /agent/build     progress from the one Cursor agent on a milestone
 *   POST /agent/ping      an idle runner saying it is alive. Reads and hands out nothing
 *   POST /agent/app-release  the latest runner app build, for the app to update itself between runs
 *   POST /agent/unpair    a registered runner revoking itself (Remove this runner in the Mac app)
 *
 * Pairing takes no runner token:
 *
 *   POST /agent/pair/start  the CLI sends hashes of its secret and poll key, gets a code
 *   POST /agent/pair/poll   the CLI asks whether staff confirmed the code. A read only
 *
 * Each call is rate limited per runner. Claim and complete are idempotent on
 * the run: a retry returns the same run or the stored outcome.
 */

import { RUNNER_APP_RELEASE_PATH, RUNNER_PAIR_PATHS, RUNNER_PROTOCOL_HEADER } from '@warehaus/runner-protocol';
import { internal } from './_generated/api';
import { httpAction } from './_generated/server';
import { heldRunIds, RUNNER_ID_INVALID, RUNNER_ID_PATTERN, RUNNER_UNAUTHORIZED, runnerRepos, runnerSlots } from './_lib/agentRun';
import {
  PAIRING_BAD_REQUEST,
  pairingCodeFrom,
  RUNNER_PAUSED,
  runnerOutOfDate,
  runnerProtocolVersion,
  RUNNER_OUT_OF_DATE,
} from './_lib/runnerRegistry';
import { sha256Hex } from './_lib/tokenCrypto';

export const AGENT_ROUTES = [
  '/agent/claim',
  '/agent/events',
  '/agent/tasks',
  '/agent/complete',
  '/agent/build',
  '/agent/ping',
  '/agent/unpair',
  RUNNER_APP_RELEASE_PATH,
] as const;
export const AGENT_PAIR_ROUTES = [RUNNER_PAIR_PATHS.start, RUNNER_PAIR_PATHS.poll] as const;

const BODY_LIMIT = 60_000;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function field(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === 'string' ? value : '';
}

async function readBody(request: Request): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: Response }> {
  const raw = await request.text();
  if (raw.length > BODY_LIMIT) return { ok: false, response: json({ error: 'Request is too large' }, 400) };
  if (!raw.trim()) return { ok: true, body: {} };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, response: json({ error: 'Request body must be a JSON object' }, 400) };
    }
    return { ok: true, body: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, response: json({ error: 'Request body must be a JSON object' }, 400) };
  }
}

export const agentHttp = httpAction(async (ctx, request) => {
  const runnerId = (request.headers.get('x-runner-id') ?? '').trim().toLowerCase();
  if (!RUNNER_ID_PATTERN.test(runnerId)) return json({ error: RUNNER_ID_INVALID }, 400);
  const bearer = /^Bearer\s+(\S+)\s*$/.exec(request.headers.get('authorization') ?? '')?.[1] ?? '';
  if (!bearer) return json({ error: RUNNER_UNAUTHORIZED }, 401);
  const protocolVersion = runnerProtocolVersion(request.headers.get(RUNNER_PROTOCOL_HEADER));

  const read = await readBody(request);
  if (!read.ok) return read.response;
  const body = read.body;

  // The runner app sends `paused` on every call; an older runner sends nothing.
  const paused = typeof body.paused === 'boolean' ? body.paused : undefined;
  const alive = await ctx.runMutation(internal.agent.touchRunner, {
    runnerId,
    tokenHash: await sha256Hex(bearer),
    protocolVersion,
    ...(paused !== undefined ? { paused } : {}),
  });
  if (!alive.ok) return json({ error: alive.error }, alive.status);

  const path = new URL(request.url).pathname;
  // The touch above is the whole heartbeat: at most one write a minute.
  if (path === '/agent/ping') return json({ ok: true }, 200);
  if (path === '/agent/unpair') {
    // Only a registered runner, proven by its own secret, removes itself. A RUNNER_TOKENS runner has nothing to revoke.
    if (!alive.registered) return json({ error: RUNNER_UNAUTHORIZED }, 401);
    const result = await ctx.runMutation(internal.runners.unpairRunner, { runnerId });
    return result.ok ? json(result, 200) : json({ error: result.error }, 404);
  }
  if (path === RUNNER_APP_RELEASE_PATH) {
    const release = await ctx.runQuery(internal.runnerApp.latestForRunner, {});
    return json(release ?? { ok: true, release: null }, 200);
  }
  if (path === '/agent/claim') {
    // A registered runner below the minimum protocol gets no work until it is updated.
    if (runnerOutOfDate(protocolVersion)) return json({ error: RUNNER_OUT_OF_DATE }, 426);
    // A paused runner app takes no new work. It still finishes the run it holds.
    if (paused === true) return json({ ok: true, resumed: false, kind: 'none', reason: RUNNER_PAUSED }, 200);
    const result = await ctx.runMutation(internal.agent.claimNext, {
      runnerId,
      mode: field(body, 'mode') || undefined,
      // The project setting picks the agent. A tool on the request is ignored.
      repos: runnerRepos(body.repos),
      anyRepo: true,
      // Parallel runs (protocol 3). A runner that sends neither works one run at a time.
      ...(typeof body.slots === 'number' ? { slots: runnerSlots(body.slots) } : {}),
      ...(Array.isArray(body.held) ? { held: heldRunIds(body.held) } : {}),
    });
    return json(result, 200);
  }
  if (path === '/agent/events') {
    const result = await ctx.runMutation(internal.agent.recordEvent, {
      runnerId,
      runId: field(body, 'runId'),
      type: field(body, 'type') || undefined,
      summary: body.summary ?? '',
      ...(body.payload !== undefined ? { payload: body.payload } : {}),
      key: field(body, 'key') || undefined,
    });
    return result.ok ? json(result, 200) : json({ error: result.error }, result.status);
  }
  if (path === '/agent/tasks') {
    const result = await ctx.runMutation(internal.agent.writePlannedTasks, {
      runnerId,
      runId: field(body, 'runId'),
      tasks: body.tasks ?? null,
    });
    return result.ok ? json(result, 200) : json({ error: result.error }, result.status);
  }
  if (path === '/agent/complete') {
    if (body.kind === 'planning') {
      const result = await ctx.runMutation(internal.agent.failPlanning, {
        runnerId,
        runId: field(body, 'runId'),
        ...(body.reason !== undefined ? { reason: body.reason } : {}),
      });
      return result.ok ? json(result, 200) : json({ error: result.error }, result.status);
    }
    const result = await ctx.runMutation(internal.agent.completeTask, {
      runnerId,
      runId: field(body, 'runId'),
      status: body.status ?? '',
      ...(body.commitSha !== undefined ? { commitSha: body.commitSha } : {}),
      ...(body.reason !== undefined ? { reason: body.reason } : {}),
      ...(body.prUrl !== undefined ? { prUrl: body.prUrl } : {}),
    });
    return result.ok ? json(result, 200) : json({ error: result.error }, result.status);
  }
  if (path === '/agent/build') {
    const result = await ctx.runMutation(internal.agent.reportBuild, {
      runnerId,
      runId: field(body, 'runId'),
      status: field(body, 'status'),
      ...(body.agentId !== undefined ? { agentId: field(body, 'agentId') } : {}),
      ...(body.agentUrl !== undefined ? { agentUrl: field(body, 'agentUrl') } : {}),
      ...(body.tasks !== undefined ? { tasks: body.tasks } : {}),
      ...(body.prUrl !== undefined ? { prUrl: body.prUrl } : {}),
      ...(body.reason !== undefined ? { reason: body.reason } : {}),
    });
    return result.ok ? json(result, 200) : json({ error: result.error }, result.status);
  }
  return json({ error: 'Not found' }, 404);
});

/** Random bytes for a pairing code. Mutations have no real randomness, so the code is made here. */
function newCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return pairingCodeFrom(bytes);
}

/**
 * Pairing routes for `npm run runner -- setup`. No runner token: the CLI has
 * none yet. Start sends only hashes; poll is a read, so waiting writes nothing.
 */
export const agentPairHttp = httpAction(async (ctx, request) => {
  const read = await readBody(request);
  if (!read.ok) return read.response;
  const body = read.body;
  const path = new URL(request.url).pathname;
  if (path === RUNNER_PAIR_PATHS.start) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await ctx.runMutation(internal.runners.startPairing, {
        code: newCode(),
        proposedRunnerId: field(body, 'proposedRunnerId'),
        tokenHash: field(body, 'tokenHash'),
        pollKeyHash: field(body, 'pollKeyHash'),
      });
      if (result.ok) return json(result, 200);
      if (result.error !== 'retry') return json({ error: result.error }, result.status);
    }
    return json({ error: 'Could not make a pairing code. Try again.' }, 503);
  }
  if (path === RUNNER_PAIR_PATHS.poll) {
    const code = field(body, 'code');
    const pollKey = field(body, 'pollKey');
    if (!code || pollKey.length < 32) return json({ error: PAIRING_BAD_REQUEST }, 400);
    const result = await ctx.runQuery(internal.runners.pairingStatus, { code, pollKeyHash: await sha256Hex(pollKey) });
    return json(result, 200);
  }
  return json({ error: 'Not found' }, 404);
});
