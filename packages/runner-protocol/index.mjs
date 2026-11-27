/**
 * Runner protocol: the one place the build runner (tools/runner) and the
 * portal's /agent routes (apps/portal/convex/agentHttp.ts) agree on the wire.
 * ADR-0001 decisions are unchanged; this only stops each rule being written
 * twice. Plain ESM with no imports, so the runner loads it with no build.
 */

/** Every /agent route the runner calls. */
export const RUNNER_PATHS = Object.freeze({
  claim: '/agent/claim',
  events: '/agent/events',
  tasks: '/agent/tasks',
  complete: '/agent/complete',
  // Hands a task or planning run back untouched: Claude hit the account usage limit.
  release: '/agent/release',
  build: '/agent/build',
  ping: '/agent/ping',
  unpair: '/agent/unpair',
});

/** The latest runner app build. The app asks between runs, with its runner secret. */
export const RUNNER_APP_RELEASE_PATH = '/agent/app-release';

/**
 * The Portal page the runner app opens to pair: any Portal page with
 * `?runnerPair=<code>` opens Confirm pairing with the code filled in, for a
 * signed-in staff member. The code is not a secret: confirming it is.
 */
export const RUNNER_PAIR_QUERY = 'runnerPair';

/** `https://portal.example/?runnerPair=K7QM-4XPA` from a Portal origin and a code. */
export function runnerPairUrl(portalOrigin, code) {
  const url = new URL('/', portalOrigin);
  url.searchParams.set(RUNNER_PAIR_QUERY, String(code).trim().toUpperCase());
  return url.toString();
}

/** Pairing a new runner. These two routes take no runner token. */
export const RUNNER_PAIR_PATHS = Object.freeze({
  start: '/agent/pair/start',
  poll: '/agent/pair/poll',
});

/**
 * The wire version this runner speaks, sent on every call as
 * `X-Runner-Protocol`. The Portal refuses claims from a registered runner
 * below `RUNNER_PROTOCOL_MIN` and shows "Runner out of date". A runner that
 * sends no header is version 1. Version 3 adds parallel runs: a claim sends
 * `slots` and the run ids it `held`s. Version 4 adds signs of life: pings send
 * `held` too, and the Portal stamps each held run so a run whose runner stops
 * answering shows Stalled after 5 minutes. Version 2 still works, one run at a time.
 */
export const RUNNER_PROTOCOL_VERSION = 4;
export const RUNNER_PROTOCOL_MIN = 2;
export const RUNNER_PROTOCOL_HEADER = 'x-runner-protocol';

/** A planning run writes this many tasks. */
export const PLAN_TASKS_MIN = 3;
export const PLAN_TASKS_MAX = 10;

/** How a task run ends. */
export const COMPLETE_STATUSES = Object.freeze(['done', 'blocked', 'failed']);

/** Only `milestone/<slug>` branches are ever created or pushed. */
export const MILESTONE_BRANCH = /^milestone\/[a-z0-9][a-z0-9-]{0,47}$/;

export function isMilestoneBranch(value) {
  return typeof value === 'string' && MILESTONE_BRANCH.test(value);
}

/**
 * The runner's HTTP client for /agent. Every call is a POST with the runner
 * token and id. A non-2xx answer throws `Error("<path>: <reason>")` with the
 * HTTP status on `error.status`.
 * Planning failure still travels as `/agent/complete` with `kind: 'planning'`
 * so a runner built from main keeps working against an older deployment.
 */
export function runnerClient({ url, token, runnerId, fetch: fetchImpl = globalThis.fetch, timeoutMs }) {
  const base = String(url ?? '').replace(/\/+$/, '');

  async function post(path, body) {
    const controller = timeoutMs ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const response = await fetchImpl(`${base}${path}`, {
        method: 'POST',
        ...(controller ? { signal: controller.signal } : {}),
        headers: {
          authorization: `Bearer ${token}`,
          'x-runner-id': runnerId,
          [RUNNER_PROTOCOL_HEADER]: String(RUNNER_PROTOCOL_VERSION),
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }
      if (!response.ok) {
        const reason = data && typeof data.error === 'string' ? data.error : `HTTP ${response.status}`;
        const error = new Error(`${path}: ${reason}`);
        error.status = response.status;
        throw error;
      }
      return data ?? {};
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return {
    post,
    claim: ({ mode, repos, paused, slots, held }) =>
      post(RUNNER_PATHS.claim, {
        mode,
        repos,
        ...(paused != null ? { paused } : {}),
        ...(slots != null ? { slots } : {}),
        ...(held != null ? { held } : {}),
      }),
    // The runner app sends `paused` on every call so the Portal can show Paused.
    // `held` is every run in progress: each one gets a sign of life (protocol 4).
    ping: ({ paused, held } = {}) =>
      post(RUNNER_PATHS.ping, {
        ...(paused != null ? { paused } : {}),
        ...(held?.length ? { held } : {}),
      }),
    appRelease: () => post(RUNNER_APP_RELEASE_PATH, {}),
    // The runner revoking its own registration, for Remove this runner in the app.
    unpair: () => post(RUNNER_PATHS.unpair, {}),
    event: ({ runId, type, summary }) => post(RUNNER_PATHS.events, { runId, type, summary }),
    writeTasks: ({ runId, tasks }) => post(RUNNER_PATHS.tasks, { runId, tasks }),
    completeTask: ({ runId, status, commitSha, reason, prUrl }) =>
      post(RUNNER_PATHS.complete, {
        runId,
        status,
        ...(commitSha ? { commitSha } : {}),
        ...(reason ? { reason } : {}),
        ...(prUrl ? { prUrl } : {}),
      }),
    failPlanning: ({ runId, reason }) => post(RUNNER_PATHS.complete, { runId, kind: 'planning', reason }),
    // The task goes back to To do (a plan back to the queue) with no Ask.
    // A Portal that predates it answers 404, and the run stays open until the next claim hands it back.
    release: ({ runId, reason, until }) =>
      post(RUNNER_PATHS.release, { runId, ...(reason ? { reason } : {}), ...(until != null ? { until } : {}) }),
    reportBuild: (body) => post(RUNNER_PATHS.build, body),
  };
}
