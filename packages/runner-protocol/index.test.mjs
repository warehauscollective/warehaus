import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BLOCKED_CAUSES,
  FAILURE_OUTPUT_BYTES,
  RUNNER_PATHS,
  RUNNER_PROTOCOL_HEADER,
  RUNNER_PROTOCOL_VERSION,
  RUN_CAUSES,
  STOP_RUN_PROTOCOL,
  isMilestoneBranch,
  outputTail,
  runnerClient,
  stopRequests,
} from './index.mjs';

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

  it('releases a run with its reason and reset time', async () => {
    const { seen, fetch } = recorder();
    const api = runnerClient({ url: 'u', token: 't', runnerId: 'r', fetch });
    await api.release({ runId: 'r1', reason: 'Claude usage limit', until: 1_800_000_000_000 });
    await api.release({ runId: 'r2' });
    assert.deepEqual(seen.map((call) => [call.url, call.body]), [
      [`u${RUNNER_PATHS.release}`, { runId: 'r1', reason: 'Claude usage limit', until: 1_800_000_000_000 }],
      ['u/agent/release', { runId: 'r2' }],
    ]);
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
    await api.ping({ held: ['run1', 'run2'] });
    await api.ping({ held: [] });
    await api.unpair();
    assert.deepEqual(seen.map((call) => [call.url, call.body]), [
      [`u${RUNNER_PATHS.claim}`, { mode: 'headless', repos: [], paused: true }],
      [`u${RUNNER_PATHS.claim}`, { mode: 'headless', repos: [], slots: 3, held: ['run1'] }],
      ['u/agent/ping', { paused: false }],
      // Protocol 4: the runs it holds, each getting a sign of life.
      ['u/agent/ping', { held: ['run1', 'run2'] }],
      ['u/agent/ping', {}],
      [`u${RUNNER_PATHS.unpair}`, {}],
    ]);
  });
});

// The contract for run troubleshooting (protocol 5): what the runner sends
// with a result, and what the Portal's answer to a sign of life may ask.
describe('run troubleshooting contract', () => {
  const api = (fetch) => runnerClient({ url: 'u', token: 't', runnerId: 'r', fetch });

  it('speaks a version that honours stop', async () => {
    const { seen, fetch } = recorder();
    await api(fetch).ping({ held: ['run1'] });
    assert.equal(seen[0].init.headers[RUNNER_PROTOCOL_HEADER], String(RUNNER_PROTOCOL_VERSION));
    assert.ok(RUNNER_PROTOCOL_VERSION >= STOP_RUN_PROTOCOL);
  });

  it('names the causes: the runner reports two, the Portal adds stalled', () => {
    assert.deepEqual([...RUN_CAUSES], ['needs_input', 'failed']);
    assert.deepEqual([...BLOCKED_CAUSES], ['needs_input', 'failed', 'stalled']);
  });

  it('sends the cause with a blocked or failed result, and never with done', async () => {
    const { seen, fetch } = recorder();
    await api(fetch).completeTask({ runId: 'r1', status: 'blocked', reason: 'Which font?', cause: 'needs_input' });
    await api(fetch).completeTask({ runId: 'r2', status: 'failed', reason: 'No commit', cause: 'failed' });
    await api(fetch).completeTask({ runId: 'r3', status: 'done', commitSha: 'abc', cause: 'failed' });
    assert.deepEqual(seen.map((call) => call.body), [
      { runId: 'r1', status: 'blocked', reason: 'Which font?', cause: 'needs_input' },
      { runId: 'r2', status: 'failed', reason: 'No commit', cause: 'failed' },
      { runId: 'r3', status: 'done', commitSha: 'abc' },
    ]);
  });

  it('sends agent output on a failed result only, cut to the last 4 KB', async () => {
    const { seen, fetch } = recorder();
    const long = `${'a'.repeat(6000)}the end`;
    await api(fetch).completeTask({ runId: 'r1', status: 'failed', reason: 'x', cause: 'failed', output: long });
    await api(fetch).completeTask({ runId: 'r2', status: 'blocked', reason: 'x', cause: 'needs_input', output: long });
    await api(fetch).completeTask({ runId: 'r3', status: 'done', commitSha: 'abc', output: long });
    await api(fetch).completeTask({ runId: 'r4', status: 'failed', reason: 'x', cause: 'failed', output: '' });
    assert.equal(seen[0].body.output.length, FAILURE_OUTPUT_BYTES);
    assert.ok(seen[0].body.output.endsWith('the end'));
    for (const call of seen.slice(1)) assert.equal('output' in call.body, false);
  });

  it('cuts output by bytes without splitting a character', () => {
    assert.equal(outputTail('short'), 'short');
    assert.equal(outputTail(null), '');
    // Each é is two bytes: 5 bytes fit two whole ones, and the half character goes.
    assert.equal(outputTail('ééééé', 5), 'éé');
    const tail = outputTail(`${'✓'.repeat(3000)}`);
    assert.ok(new TextEncoder().encode(tail).length <= FAILURE_OUTPUT_BYTES);
    assert.equal(tail.includes('\uFFFD'), false);
  });

  it('reads the runs to stop from the answer to a ping or a claim', async () => {
    const { fetch } = recorder(200, { ok: true, stop: ['run1', 'run1', '', 7, 'run2'] });
    assert.deepEqual(stopRequests(await api(fetch).ping({ held: ['run1', 'run2'] })), ['run1', 'run2']);
    assert.deepEqual(stopRequests(await api(fetch).claim({ mode: 'headless', repos: [], held: ['run1'] })), ['run1', 'run2']);
    // A Portal that predates stop, or has nothing to stop, asks nothing.
    for (const reply of [{ ok: true }, { stop: 'run1' }, { stop: null }, null, undefined, 'stop']) {
      assert.deepEqual(stopRequests(reply), []);
    }
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
