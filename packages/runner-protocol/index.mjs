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
  build: '/agent/build',
});

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
 * token and id. A non-2xx answer throws `Error("<path>: <reason>")`.
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
        throw new Error(`${path}: ${reason}`);
      }
      return data ?? {};
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return {
    post,
    claim: ({ mode, repos }) => post(RUNNER_PATHS.claim, { mode, repos }),
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
    reportBuild: (body) => post(RUNNER_PATHS.build, body),
  };
}
