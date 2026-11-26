import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { RUNNER_APP_RELEASE_PATH, RUNNER_PATHS } from '@warehaus/runner-protocol';
import {
  parseRunnerAppRelease,
  RUNNER_APP_KEEP,
  RUNNER_APP_MAX_BYTES,
  RUNNER_APP_PRUNE_SCAN,
  RUNNER_APP_PUBLISH_PATHS,
  runnerAppNeedsUpdate,
  runnerAppPublishDecision,
} from './runnerApp';
import { runnerPausePatch, RUNNER_PAUSED } from './runnerRegistry';
import { runnerHealthCopy, runnerHealthState, RUNNER_PAUSED_HELPER, type RunnerHealthView } from './runnerHealth';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const SHA = 'a'.repeat(64);
const NOW = 1_800_000_000_000;
const good = { version: '1.4.0', build: 12, sha256: SHA, size: 30_000_000, minMacOS: '14.0' };

describe('publishing a runner app release', () => {
  it('takes a well-formed release and lowercases the hash', () => {
    const parsed = parseRunnerAppRelease({ ...good, sha256: SHA.toUpperCase() });
    assert.deepEqual(parsed, { ok: true, release: good });
  });

  it('refuses a bad version, build, hash or size with one reason', () => {
    for (const patch of [
      { version: 'v1' },
      { build: 0 },
      { build: 1.5 },
      { sha256: 'abc' },
      { size: 0 },
      { size: RUNNER_APP_MAX_BYTES + 1 },
    ]) {
      const parsed = parseRunnerAppRelease({ ...good, ...patch });
      assert.equal(parsed.ok, false, JSON.stringify(patch));
    }
  });

  it('defaults the minimum macOS to 14.0', () => {
    const parsed = parseRunnerAppRelease({ ...good, minMacOS: undefined });
    assert.equal(parsed.ok && parsed.release.minMacOS, '14.0');
  });

  it('inserts a higher build, repeats nothing on a retry, and refuses an older build', () => {
    assert.equal(runnerAppPublishDecision(null, good), 'insert');
    assert.equal(runnerAppPublishDecision({ build: 11, sha256: SHA }, good), 'insert');
    assert.equal(runnerAppPublishDecision({ build: 12, sha256: SHA }, good), 'same');
    assert.equal(runnerAppPublishDecision({ build: 12, sha256: 'b'.repeat(64) }, good), 'stale');
    assert.equal(runnerAppPublishDecision({ build: 13, sha256: SHA }, good), 'stale');
  });

  it('keeps three releases and prunes with a bounded read', () => {
    assert.equal(RUNNER_APP_KEEP, 3);
    assert.ok(RUNNER_APP_PRUNE_SCAN > RUNNER_APP_KEEP);
    const source = read('../runnerApp.ts');
    assert.match(source, /\.take\(RUNNER_APP_PRUNE_SCAN\)/);
    assert.doesNotMatch(source, /\.collect\(\)/);
  });

  it('guards the publish routes with a separate token, compared in constant time', () => {
    const source = read('../runnerApp.ts');
    assert.match(source, /process\.env\.RUNNER_APP_PUBLISH_TOKEN/);
    assert.match(source, /timingSafeEqualUtf8/);
    const http = read('../http.ts');
    assert.match(http, /RUNNER_APP_PUBLISH_PATHS/);
    assert.deepEqual(Object.values(RUNNER_APP_PUBLISH_PATHS), ['/runner-app/upload-url', '/runner-app/release']);
  });
});

describe('publish token check', async () => {
  const { publishAuthorized } = await import('../runnerApp');
  const token = 't'.repeat(40);
  it('lets in only the configured token', () => {
    assert.equal(publishAuthorized(`Bearer ${token}`, token), true);
    assert.equal(publishAuthorized(`Bearer ${'x'.repeat(40)}`, token), false);
    assert.equal(publishAuthorized(null, token), false);
  });
  it('refuses everything when the token is unset or short', () => {
    assert.equal(publishAuthorized('Bearer unset-runner-app-token', undefined), false);
    assert.equal(publishAuthorized('Bearer short', 'short'), false);
  });
});

describe('the app checking for an update', () => {
  it('updates only to a higher build', () => {
    assert.equal(runnerAppNeedsUpdate(12, null), false);
    assert.equal(runnerAppNeedsUpdate(12, { build: 12 }), false);
    assert.equal(runnerAppNeedsUpdate(12, { build: 13 }), true);
    assert.equal(runnerAppNeedsUpdate(undefined, { build: 1 }), true);
  });

  it('asks through the runner routes, with its runner secret', () => {
    assert.equal(RUNNER_APP_RELEASE_PATH, '/agent/app-release');
    const agentHttp = read('../agentHttp.ts');
    assert.match(agentHttp, /AGENT_ROUTES = \[[^\]]*RUNNER_APP_RELEASE_PATH,?\s*\] as const/);
    // The release check sits after the secret check, like every runner route.
    assert.ok(agentHttp.indexOf('internal.agent.touchRunner') < agentHttp.indexOf('internal.runnerApp.latestForRunner'));
  });

  it('has a ping path in the shared protocol', () => {
    assert.equal(RUNNER_PATHS.ping, '/agent/ping');
  });
});

describe('pausing a runner', () => {
  it('writes only when the paused state changes', () => {
    assert.equal(runnerPausePatch(undefined, undefined, NOW), null);
    assert.deepEqual(runnerPausePatch(undefined, true, NOW), { pausedAt: NOW });
    assert.equal(runnerPausePatch(NOW - 1, true, NOW), null);
    assert.deepEqual(runnerPausePatch(NOW - 1, false, NOW), { pausedAt: undefined });
    assert.equal(runnerPausePatch(undefined, false, NOW), null);
  });

  it('gives a paused runner no work', () => {
    const agentHttp = read('../agentHttp.ts');
    assert.match(agentHttp, /reason: RUNNER_PAUSED/);
    assert.match(RUNNER_PAUSED, /Resume it there/);
  });

  const view = (runners: RunnerHealthView['runners']): RunnerHealthView => ({
    repoSet: true,
    repo: 'warehauscollective/warehaus',
    production: true,
    runnerAllowed: true,
    runners,
    working: null,
    building: null,
  });

  it('reads Paused only when every runner seen is paused', () => {
    const paused = { id: 'studio-mac', lastSeenAt: NOW - 60_000, paused: true };
    const ready = { id: 'peter-mbp', lastSeenAt: NOW - 120_000 };
    assert.equal(runnerHealthState(view([paused]), NOW), 'paused');
    assert.equal(runnerHealthState(view([paused, ready]), NOW), 'ready');
    assert.equal(runnerHealthState(view([{ ...paused, lastSeenAt: NOW - 3_600_000 }]), NOW), 'offline');
  });

  it('shows the paused copy with no command', () => {
    const copy = runnerHealthCopy(view([{ id: 'studio-mac', lastSeenAt: NOW - 60_000, paused: true }]), NOW);
    assert.equal(copy.label, 'Runner paused');
    assert.equal(copy.compactLabel, 'Paused');
    assert.equal(copy.dot, 'warning');
    assert.equal(copy.meta, 'studio-mac · paused');
    assert.equal(copy.helper, RUNNER_PAUSED_HELPER);
    assert.equal(copy.onTheMac, null);
  });
});
