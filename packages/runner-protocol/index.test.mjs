import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RUNNER_PATHS, isMilestoneBranch, runnerClient } from './index.mjs';

function recorder(status = 200, body = { ok: true }) {
  const seen = [];
  const fetch = async (url, init) => {
    seen.push({ url, init, body: JSON.parse(init.body) });
    return new Response(JSON.stringify(body), { status });
  };
  return { seen, fetch };
}

describe('runner client', () => {
  it('posts with the runner token and id to the right path', async () => {
    const { seen, fetch } = recorder();
    const client = runnerClient({ url: 'https://portal.test///', token: 'tok', runnerId: 'mac', fetch });
    await client.failPlanning({ runId: 'r1', reason: 'No JSON' });
    assert.equal(seen[0].url, `https://portal.test${RUNNER_PATHS.complete}`);
    assert.equal(seen[0].init.headers.authorization, 'Bearer tok');
    assert.equal(seen[0].init.headers['x-runner-id'], 'mac');
    assert.deepEqual(seen[0].body, { runId: 'r1', kind: 'planning', reason: 'No JSON' });
  });

  it('leaves empty optional fields off a task completion', async () => {
    const { seen, fetch } = recorder();
    await runnerClient({ url: 'u', token: 't', runnerId: 'r', fetch }).completeTask({ runId: 'r1', status: 'failed', reason: 'x' });
    assert.deepEqual(seen[0].body, { runId: 'r1', status: 'failed', reason: 'x' });
  });

  it('throws "<path>: <error>" on a refusal', async () => {
    const { fetch } = recorder(409, { error: 'Run is not yours' });
    await assert.rejects(runnerClient({ url: 'u', token: 't', runnerId: 'r', fetch }).claim({ mode: 'headless', repos: [] }), {
      message: '/agent/claim: Run is not yours',
      status: 409,
    });
  });

  it('sends a paused flag, run slots and an unpair call when asked', async () => {
    const { seen, fetch } = recorder();
    const api = runnerClient({ url: 'u', token: 't', runnerId: 'r', fetch });
    await api.claim({ mode: 'headless', repos: [], paused: true });
    await api.claim({ mode: 'headless', repos: [], slots: 3, held: ['run1'] });
    await api.ping({ paused: false });
    await api.unpair();
    assert.deepEqual(seen.map((call) => [call.url, call.body]), [
      [`u${RUNNER_PATHS.claim}`, { mode: 'headless', repos: [], paused: true }],
      [`u${RUNNER_PATHS.claim}`, { mode: 'headless', repos: [], slots: 3, held: ['run1'] }],
      ['u/agent/ping', { paused: false }],
      [`u${RUNNER_PATHS.unpair}`, {}],
    ]);
  });
});

describe('milestone branch', () => {
  it('accepts milestone/<slug> only', () => {
    assert.equal(isMilestoneBranch('milestone/launch-site'), true);
    assert.equal(isMilestoneBranch('main'), false);
    assert.equal(isMilestoneBranch('milestone/Bad'), false);
    assert.equal(isMilestoneBranch(null), false);
  });
});
