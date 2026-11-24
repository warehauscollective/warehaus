/**
 * Runner HTTP routes. The runner on a staff Mac calls these with its own
 * bearer token from `RUNNER_TOKENS` and its id in `X-Runner-Id`.
 *
 *   POST /agent/claim     next planning job, task, or Cursor build
 *   POST /agent/events    one short line for the run feed
 *   POST /agent/tasks     the task list from a planning run
 *   POST /agent/complete  end a task run, or a planning run that failed
 *   POST /agent/build     progress from the one Cursor agent on a milestone
 *   POST /agent/ping      an idle runner saying it is alive. Reads and hands out nothing
 *
 * Each call is rate limited per runner. Claim and complete are idempotent on
 * the run: a retry returns the same run or the stored outcome.
 */

import { internal } from './_generated/api';
import { httpAction } from './_generated/server';
import { authorizeRunner, reposForRunner } from './_lib/agentRun';

export const AGENT_ROUTES = ['/agent/claim', '/agent/events', '/agent/tasks', '/agent/complete', '/agent/build', '/agent/ping'] as const;

const BODY_LIMIT = 60_000;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function field(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === 'string' ? value : '';
}

export const agentHttp = httpAction(async (ctx, request) => {
  const auth = authorizeRunner({
    configured: process.env.RUNNER_TOKENS,
    authorizationHeader: request.headers.get('authorization'),
    runnerId: request.headers.get('x-runner-id'),
  });
  if (!auth.ok) return json({ error: auth.reason }, auth.status);
  const runnerId = auth.runnerId;

  const raw = await request.text();
  if (raw.length > BODY_LIMIT) return json({ error: 'Request is too large' }, 400);
  let body: Record<string, unknown> = {};
  if (raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return json({ error: 'Request body must be a JSON object' }, 400);
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return json({ error: 'Request body must be a JSON object' }, 400);
    }
  }

  const alive = await ctx.runMutation(internal.agent.touchRunner, { runnerId });
  if (!alive.ok) return json({ error: alive.error }, alive.status);

  const path = new URL(request.url).pathname;
  // The touch above is the whole heartbeat: at most one write a minute.
  if (path === '/agent/ping') return json({ ok: true }, 200);
  if (path === '/agent/claim') {
    const result = await ctx.runMutation(internal.agent.claimNext, {
      runnerId,
      mode: field(body, 'mode') || undefined,
      // The project setting picks the agent. A tool on the request is ignored.
      repos: reposForRunner(auth.repos, body.repos),
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
