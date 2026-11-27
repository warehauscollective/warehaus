/**
 * Deploy to main through the real handlers on the in-memory ctx: who may
 * start a run, what a run records, and what each workflow report leaves
 * behind.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { check, deployRunHttp, expire, report, retry, start, storePending, summary } from '../deploys';
import {
  DEPLOY_GITHUB_TOKEN_ENV,
  DEPLOY_NOT_SET_UP,
  DEPLOY_ONLY_PETER,
  DEPLOY_REPORT_SECRET_ENV,
  DEPLOY_RUNNING,
  DEPLOY_STALE,
  DEPLOY_TARGETS,
  type DeploySummary,
} from './deploy';
import { memoryCtx, type MemoryCtx } from './memoryCtx.testkit';
import { seedMilestone, seedMilestoneWorld } from './seedRows.testkit';

const REPO = 'warehauscollective/warehaus';
const BASE = DEPLOY_TARGETS[0]!.baselineCommit;
const HEAD = 'b'.repeat(40);
const NEXT = 'c'.repeat(40);

type Row = Record<string, unknown>;

function world(options: { pending?: boolean } = {}) {
  const t = memoryCtx();
  const seeded = seedMilestoneWorld(
    t,
    { name: 'Add filters', status: 'Shipped', previewPrNumber: 212, mergedAt: 1000 },
    {
      agentRepo: REPO,
      ...(options.pending === false
        ? {}
        : {
            deployPending: {
              sha: HEAD,
              total: 2,
              commits: [
                { sha: 'a'.repeat(40), title: 'Add filters (#212)', pr: 212 },
                { sha: HEAD, title: 'Docs: a loose commit' },
              ],
              checkedAt: Date.now(),
            },
          }),
    },
  );
  return { t, ...seeded };
}

const runOf = (t: MemoryCtx) => t.rows('deployRuns')[0] as Row | undefined;

async function startRun(t: MemoryCtx, projectId: string) {
  const result = await t.call<{ ok: true; runId: string } | { ok: false; error: string }>(start, { projectId, sha: HEAD }, { as: 'peter' });
  assert.equal(result.ok, true);
  return (result as { runId: string }).runId;
}

describe('deploy to main', () => {
  beforeEach(() => {
    process.env[DEPLOY_GITHUB_TOKEN_ENV] = 'test-token';
    process.env[DEPLOY_REPORT_SECRET_ENV] = 'test-secret';
  });
  afterEach(() => {
    delete process.env[DEPLOY_GITHUB_TOKEN_ENV];
    delete process.env[DEPLOY_REPORT_SECRET_ENV];
  });

  it('counts the waiting milestone and lists what goes out', async () => {
    const { t, projectId, milestoneId } = world();
    const view = await t.call<DeploySummary | null>(summary, { projectId }, { as: 'peter' });
    assert.equal(view?.waiting, 1);
    assert.equal(view?.ahead, true);
    assert.equal(view?.isPeter, true);
    assert.equal(view?.setUp, true);
    assert.equal(view?.sha, HEAD);
    assert.equal(view?.deployed, BASE.slice(0, 7));
    assert.deepEqual(view?.milestones, [{ id: milestoneId, name: 'Add filters', mergedAt: 1000 }]);
    assert.deepEqual(view?.loose, [{ sha: HEAD.slice(0, 7), title: 'Docs: a loose commit' }]);
    assert.equal(view?.run, null);
    assert.deepEqual(t.reads.unindexed(), []);
  });

  it('tells other staff they are not Peter, and gives a project with no deploy nothing', async () => {
    const { t, projectId } = world();
    const view = await t.call<DeploySummary | null>(summary, { projectId }, { as: 'staff' });
    assert.equal(view?.isPeter, false);
    const other = memoryCtx();
    const plain = seedMilestoneWorld(other);
    assert.equal(await other.call(summary, { projectId: plain.projectId }, { as: 'staff' }), null);
  });

  it('counts a merged milestone even before main has been compared', async () => {
    const { t, projectId } = world({ pending: false });
    const view = await t.call<DeploySummary | null>(summary, { projectId }, { as: 'staff' });
    assert.equal(view?.waiting, 1);
    assert.equal(view?.ahead, false);
    assert.equal(view?.sha, null);
  });

  it('only Peter starts a run', async () => {
    const { t, projectId } = world();
    const refused = await t.call(start, { projectId, sha: HEAD }, { as: 'staff' });
    assert.deepEqual(refused, { ok: false, error: DEPLOY_ONLY_PETER });
    assert.equal(t.rows('deployRuns').length, 0);
    assert.equal(t.scheduled.length, 0);
  });

  it('refuses a run until both secrets are set', async () => {
    const { t, projectId } = world();
    delete process.env[DEPLOY_REPORT_SECRET_ENV];
    assert.deepEqual(await t.call(start, { projectId, sha: HEAD }, { as: 'peter' }), { ok: false, error: DEPLOY_NOT_SET_UP });
  });

  it('refuses a run when main moved after the list was made', async () => {
    const { t, projectId } = world();
    assert.deepEqual(await t.call(start, { projectId, sha: NEXT }, { as: 'peter' }), { ok: false, error: DEPLOY_STALE });
    assert.equal(t.rows('deployRuns').length, 0);
  });

  it('starts one run, dispatches the workflow and refuses a second', async () => {
    const { t, projectId, milestoneId } = world();
    const runId = await startRun(t, projectId);
    const run = t.row(runId) as Row;
    assert.equal(run.status, 'starting');
    assert.equal(run.sha, HEAD);
    assert.deepEqual(run.milestoneIds, [milestoneId]);
    assert.equal(run.looseCount, 1);
    assert.deepEqual(t.scheduled.map((call) => call.name), ['deploys:dispatch', 'deploys:expire']);
    assert.deepEqual(await t.call(start, { projectId, sha: HEAD }, { as: 'peter' }), { ok: false, error: DEPLOY_RUNNING });
    assert.equal(t.rows('deployRuns').length, 1);
  });

  it('a finished run records the deployed commit and marks its milestones deployed', async () => {
    const { t, projectId, milestoneId } = world();
    const runId = await startRun(t, projectId);
    for (const event of ['started', 'convex_ok', 'vercel_ok'] as const) {
      const result = await t.call<{ ok: boolean; wrote: boolean }>(report, { runId, sha: HEAD, event });
      assert.deepEqual(result, { ok: true, wrote: true });
    }
    assert.equal((t.row(runId) as Row).status, 'done');
    const project = t.row(projectId) as Row;
    assert.equal(project.deployedCommit, HEAD);
    assert.equal(typeof project.deployedAt, 'number');
    assert.equal(project.deployPending, undefined);
    assert.equal(typeof (t.row(milestoneId) as Row).deployFinishedAt, 'number');
    assert.deepEqual(t.rows('agentEvents').map((row) => (row as Row).summary), [`Deployed to production · ${HEAD.slice(0, 7)}`]);
    const view = await t.call<DeploySummary | null>(summary, { projectId }, { as: 'peter' });
    assert.equal(view?.waiting, 0);
    assert.equal(view?.run, null);
    assert.equal(view?.deployed, HEAD.slice(0, 7));
  });

  it('a repeated report writes nothing, and a report for another commit is refused', async () => {
    const { t, projectId } = world();
    const runId = await startRun(t, projectId);
    await t.call(report, { runId, sha: HEAD, event: 'started' });
    assert.deepEqual(await t.call(report, { runId, sha: HEAD, event: 'started' }), { ok: true, wrote: false });
    assert.deepEqual(await t.call(report, { runId, sha: NEXT, event: 'vercel_ok' }), { ok: false, wrote: false });
    assert.deepEqual(await t.call(report, { runId: 'not-a-run', sha: HEAD, event: 'started' }), { ok: false, wrote: false });
    assert.equal((t.row(runId) as Row).status, 'running');
  });

  it('a failure after Convex opens an Ask, and a retry that succeeds closes it', async () => {
    const { t, projectId, milestoneId } = world();
    const runId = await startRun(t, projectId);
    await t.call(report, { runId, sha: HEAD, event: 'started' });
    await t.call(report, { runId, sha: HEAD, event: 'convex_ok' });
    await t.call(report, { runId, sha: HEAD, event: 'failed', step: 'vercel', url: 'https://github.com/warehauscollective/warehaus/actions/runs/9' });
    const failed = t.row(runId) as Row;
    assert.equal(failed.status, 'failed');
    assert.equal(failed.step, 'vercel');
    const asks = t.rows('milestoneNotes') as Row[];
    assert.equal(asks.length, 1);
    assert.equal(asks[0]?.milestoneId, milestoneId);
    assert.equal(asks[0]?.open, true);
    assert.match(String(asks[0]?.body), /Convex deployed, then Vercel failed/);
    assert.equal((t.row(projectId) as Row).deployedCommit, undefined);

    const view = await t.call<DeploySummary | null>(summary, { projectId }, { as: 'peter' });
    assert.equal(view?.run?.status, 'failed');
    assert.equal(view?.run?.workflowUrl, 'https://github.com/warehauscollective/warehaus/actions/runs/9');

    assert.deepEqual(await t.call(retry, { runId }, { as: 'staff' }), { ok: false, error: DEPLOY_ONLY_PETER });
    assert.deepEqual(await t.call(retry, { runId }, { as: 'peter' }), { ok: true });
    const again = t.row(runId) as Row;
    assert.equal(again.status, 'starting');
    assert.equal(again.attempt, 2);
    for (const event of ['started', 'convex_ok', 'vercel_ok'] as const) await t.call(report, { runId, sha: HEAD, event });
    assert.equal((t.row(runId) as Row).status, 'done');
    assert.equal((t.rows('milestoneNotes') as Row[])[0]?.open, undefined);
    assert.equal(t.rows('milestoneNotes').length, 1);
  });

  it('a run with no report is failed, but only for the attempt that timed out', async () => {
    const { t, projectId } = world();
    const runId = await startRun(t, projectId);
    assert.deepEqual(await t.call(expire, { runId, attempt: 2 }), { wrote: false });
    assert.deepEqual(await t.call(expire, { runId, attempt: 1 }), { wrote: true });
    assert.equal(runOf(t)?.status, 'failed');
    assert.equal(runOf(t)?.step, 'dispatch');
  });

  it('a compare made against an older deployed commit is dropped', async () => {
    const { t, projectId } = world();
    const result = await t.call(storePending, { projectId, deployed: NEXT, sha: NEXT, total: 0, commits: [], askedAt: Date.now() });
    assert.deepEqual(result, { wrote: false });
    assert.equal(((t.row(projectId) as Row).deployPending as Row).sha, HEAD);
  });

  it('after a deploy, a merged milestone the compare no longer lists is marked deployed', async () => {
    const { t, orgId, projectId } = world();
    const runId = await startRun(t, projectId);
    for (const event of ['started', 'convex_ok', 'vercel_ok'] as const) await t.call(report, { runId, sha: HEAD, event });
    const byHand = seedMilestone(t, orgId, projectId, { name: 'Merged by hand', status: 'Shipped', mergedAt: 500 });
    const fresh = seedMilestone(t, orgId, projectId, { name: 'Just merged', status: 'Shipped', mergedAt: Date.now() });
    await t.call(storePending, { projectId, deployed: HEAD, sha: HEAD, total: 0, commits: [], askedAt: Date.now() });
    assert.equal(typeof (t.row(byHand) as Row).deployFinishedAt, 'number');
    assert.equal((t.row(fresh) as Row).deployFinishedAt, undefined);
  });

  it('asks GitHub at most once a minute', async () => {
    const { t, projectId } = world();
    assert.deepEqual(await t.call(check, { projectId }, { as: 'staff' }), { ok: true, started: false });
    const stale = world({ pending: false });
    assert.deepEqual(await stale.t.call(check, { projectId: stale.projectId }, { as: 'staff' }), { ok: true, started: true });
    assert.deepEqual(stale.t.scheduled.map((call) => call.name), ['deploys:refreshMain']);
  });

  it('the report route refuses a caller without the secret', async () => {
    const { t } = world();
    const body = JSON.stringify({ runId: 'x', sha: HEAD, event: 'started' });
    const none = await t.callHttp(deployRunHttp, new Request('https://example.test/deploy-run', { method: 'POST', body }));
    assert.equal(none.status, 401);
    const wrong = await t.callHttp(
      deployRunHttp,
      new Request('https://example.test/deploy-run', { method: 'POST', body, headers: { Authorization: 'Bearer nope' } }),
    );
    assert.equal(wrong.status, 401);
    assert.equal(t.runs.length, 0);
    delete process.env[DEPLOY_REPORT_SECRET_ENV];
    const unset = await t.callHttp(deployRunHttp, new Request('https://example.test/deploy-run', { method: 'POST', body }));
    assert.equal(unset.status, 503);
  });

  it('the report route passes a signed report to the mutation', async () => {
    const { t } = world();
    const response = await t.callHttp(
      deployRunHttp,
      new Request('https://example.test/deploy-run', {
        method: 'POST',
        body: JSON.stringify({ runId: 'deployRuns:1', sha: HEAD, event: 'failed', step: 'vercel', url: 'https://github.com/x/y/actions/runs/1' }),
        headers: { Authorization: 'Bearer test-secret' },
      }),
      { respond: () => ({ ok: true, wrote: true }) },
    );
    assert.equal(response.status, 200);
    assert.deepEqual(t.runs.map((call) => [call.name, call.args]), [
      ['deploys:report', { runId: 'deployRuns:1', sha: HEAD, event: 'failed', step: 'vercel', url: 'https://github.com/x/y/actions/runs/1' }],
    ]);
  });
});
