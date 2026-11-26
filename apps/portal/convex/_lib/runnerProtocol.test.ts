import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMPLETE_STATUSES, PLAN_TASKS_MAX, PLAN_TASKS_MIN, isMilestoneBranch, runnerClient } from '@warehaus/runner-protocol';
import { touchRunner } from '../agent';
import { agentHttp } from '../agentHttp';
import { completeDecision, milestoneBranch } from './agentRun';
import { proposedTasksDecision } from './milestoneBot';
import { memoryCtx, type RunCall } from './memoryCtx.testkit';

/**
 * Contract test across the runner seam: the runner's own client posts to the
 * real agentHttp handler, and each call must land on the mutation and
 * arguments the portal expects.
 */
const TOKEN = 'runner-token-0123456789abcdef';

function wired() {
  const t = memoryCtx();
  const calls: RunCall[] = [];
  const respond = (call: RunCall) => {
    calls.push(call);
    if (call.name.endsWith('touchRunner')) return { ok: true };
    return { ok: true, echoed: call.name };
  };
  const client = runnerClient({
    url: 'https://portal.test/',
    token: TOKEN,
    runnerId: 'mac-mini',
    fetch: ((url: string, init: RequestInit) => t.callHttp(agentHttp, new Request(url, init), { respond })) as typeof fetch,
  });
  const landed = () => calls.filter((call) => !call.name.endsWith('touchRunner')).map((call) => [call.name, call.args]);
  return { client, landed };
}

describe('runner protocol', () => {
  it('lands each client call on the mutation the portal expects', async () => {
    const { client, landed } = wired();
    await client.claim({ mode: 'headless', repos: ['warehauscollective/warehaus'] });
    await client.event({ runId: 'run1', type: 'tool', summary: 'Edited a file' });
    await client.writeTasks({ runId: 'run1', tasks: [{ title: 'A' }, { title: 'B' }, { title: 'C' }] });
    await client.completeTask({ runId: 'run1', status: 'done', commitSha: 'abc1234' });
    await client.failPlanning({ runId: 'run2', reason: 'No JSON' });
    await client.reportBuild({ runId: 'run3', status: 'failed', reason: 'Broke' });
    await client.release({ runId: 'run4', reason: 'Claude usage limit', until: 1 });
    const names = landed().map(([name]) => String(name).split(/[:.]/).pop());
    assert.deepEqual(names, ['claimNext', 'recordEvent', 'writePlannedTasks', 'completeTask', 'failPlanning', 'reportBuild', 'releaseRun']);
    assert.deepEqual(landed()[6]![1], { runnerId: 'mac-mini', runId: 'run4', reason: 'Claude usage limit' });
    const complete = landed()[3]![1] as Record<string, unknown>;
    assert.equal(complete.status, 'done');
    assert.equal(complete.commitSha, 'abc1234');
    assert.deepEqual((landed()[0]![1] as { repos: string[] }).repos, ['warehauscollective/warehaus']);
  });

  it('throws the portal error text on a refused call', async () => {
    const client = runnerClient({
      url: 'https://portal.test',
      token: 'wrong-token-0123456789abcdef',
      runnerId: 'mac-mini',
      fetch: ((url: string, init: RequestInit) => {
        const t = memoryCtx();
        // The real touchRunner decides: no registration for this runner, so it refuses.
        const respond = (call: RunCall) => (call.name.endsWith('touchRunner') ? t.call(touchRunner, call.args) : { ok: true });
        return t.callHttp(agentHttp, new Request(url, init), { respond });
      }) as typeof fetch,
    });
    await assert.rejects(client.claim({ mode: 'headless', repos: [] }), /^Error: \/agent\/claim: /);
  });

  it('agrees on every status, plan size and branch shape', () => {
    for (const status of COMPLETE_STATUSES) {
      const decision = completeDecision({ status, reason: 'why', commitSha: 'abc1234' });
      assert.equal(decision.ok, true, status);
    }
    const plan = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `Task ${i}` }));
    assert.equal(proposedTasksDecision(plan(PLAN_TASKS_MIN)).ok, true);
    assert.equal(proposedTasksDecision(plan(PLAN_TASKS_MAX)).ok, true);
    assert.equal(proposedTasksDecision(plan(PLAN_TASKS_MIN - 1)).ok, false);
    assert.equal(proposedTasksDecision(plan(PLAN_TASKS_MAX + 1)).ok, false);
    for (const name of ['Launch the site', 'Ünïcode — name', '', 'x'.repeat(80)]) {
      assert.equal(isMilestoneBranch(milestoneBranch(name)), true, name);
    }
  });
});
