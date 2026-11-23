// The Cursor build's branch step, run for real against a throwaway
// repository: create milestone/<slug> from main, push it, launch the agent,
// read its commits, open the pull request, and report to the Portal.
//
// git is real. The Cursor API, the Portal and `gh` are stand-ins. No test
// here can reach api.cursor.com: the global fetch throws, and the driver is
// handed a mock.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { CURSOR_AGENTS_URL } from './drivers/cursor.mjs';
import { cursorBuild } from './drivers/cursorBuild.mjs';
import { repoTools } from './repo.mjs';
import { CHECK_PREFIX, CHECK_TASK_ID, checkBranchName, isCheckBranch, parseCheckArgs, runCheck } from '../scripts/check-cursor-branch.mjs';

const KEY = 'test-cursor-key-not-a-real-credential';
const REPO = 'warehauscollective/throwaway';
const BRANCH = 'milestone/zz-cursor-check';
const AGENT_ID = 'bc_test12345';
const AGENT_URL = `https://cursor.com/agents/${AGENT_ID}`;
const PR_URL = 'https://github.com/warehauscollective/throwaway/pull/7';
const IDENTITY = ['-c', 'user.name=Runner Test', '-c', 'user.email=runner@example.invalid', '-c', 'commit.gpgsign=false'];

function sh(cwd, args) {
  const result = spawnSync('git', [...IDENTITY, ...args], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

/** A bare origin with one commit on main, a runner checkout, and a second clone that plays the cloud agent. */
function sandbox() {
  const root = mkdtempSync(join(tmpdir(), 'runner-cursor-'));
  const origin = join(root, 'origin.git');
  const checkout = join(root, 'checkout');
  const agent = join(root, 'agent');
  sh(root, ['init', '--bare', '--initial-branch=main', origin]);
  sh(root, ['clone', origin, checkout]);
  writeFileSync(join(checkout, 'README.md'), 'throwaway\n');
  sh(checkout, ['add', '.']);
  sh(checkout, ['commit', '-m', 'Start']);
  sh(checkout, ['push', '-u', 'origin', 'HEAD:main']);
  sh(checkout, ['remote', 'set-head', 'origin', 'main']);
  sh(root, ['clone', origin, agent]);
  return { root, origin, checkout, agent, mainSha: sh(checkout, ['rev-parse', 'origin/main']) };
}

/** What the cloud agent does: commit on the milestone branch and push it. */
function agentCommits(box, message) {
  sh(box.agent, ['fetch', 'origin']);
  sh(box.agent, ['checkout', '-B', BRANCH, `origin/${BRANCH}`]);
  writeFileSync(join(box.agent, `work-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`), 'done\n');
  sh(box.agent, ['add', '.']);
  sh(box.agent, ['commit', '-m', message]);
  sh(box.agent, ['push', 'origin', BRANCH]);
  return sh(box.agent, ['rev-parse', 'HEAD']);
}

/** Real git, and a `gh` that records what it was asked and answers like GitHub. */
function fakeExec(state) {
  return (program, args, options) => {
    if (program === 'git') return spawnSync('git', [...IDENTITY, ...args], options);
    assert.equal(program, 'gh', `unexpected program ${program}`);
    state.gh.push(args);
    if (args[0] === 'pr' && args[1] === 'view') {
      return state.prOpen
        ? { status: 0, stdout: JSON.stringify({ url: PR_URL, state: 'OPEN' }), stderr: '' }
        : { status: 1, stdout: '', stderr: 'no pull requests found' };
    }
    if (args[0] === 'pr' && args[1] === 'create') {
      state.prOpen = true;
      return { status: 0, stdout: `${PR_URL}\n`, stderr: '' };
    }
    if (args[0] === 'pr' && (args[1] === 'edit' || args[1] === 'close')) return { status: 0, stdout: '', stderr: '' };
    return { status: 1, stdout: '', stderr: 'not available in tests' };
  };
}

/** The Cursor API. Answers the launch and the status read, and records every request. */
function fakeCursor(state) {
  return async (url, init) => {
    state.cursor.push({ url, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : null });
    assert.equal(String(url).startsWith(CURSOR_AGENTS_URL), true);
    if (state.cursorStatus >= 400) return { ok: false, status: state.cursorStatus, json: async () => ({}) };
    const status = init.method === 'POST' ? 'CREATING' : state.agentStatus;
    return { ok: true, status: 200, json: async () => ({ id: AGENT_ID, status, target: { url: AGENT_URL } }) };
  };
}

const TASKS = [
  { id: 'tasks:1', order: 1, title: 'Build the overview', detail: 'Use the Figma frame.' },
  { id: 'tasks:2', order: 2, title: 'Wire the review card', detail: '' },
];

function job(extra = {}) {
  return {
    kind: 'build',
    driver: 'cursor',
    runId: 'agentRuns:1',
    externalId: null,
    externalUrl: null,
    milestone: { id: 'milestones:1', name: 'Cursor branch check', objective: 'Prove the branch flow.', goals: ['Branch, push, PR'], branch: BRANCH },
    tasks: TASKS,
    ...extra,
  };
}

describe('cursor build against a real repository', () => {
  let box;
  let state;
  let realFetch;

  before(() => {
    realFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      throw new Error(`A test tried to reach the network: ${url}`);
    };
  });
  after(() => {
    globalThis.fetch = realFetch;
  });
  beforeEach(() => {
    if (box) rmSync(box.root, { recursive: true, force: true });
    box = sandbox();
    state = { gh: [], cursor: [], portal: [], said: [], prOpen: false, agentStatus: 'RUNNING', cursorStatus: 200, portalReply: {} };
  });
  after(() => {
    if (box) rmSync(box.root, { recursive: true, force: true });
  });

  function step(work, key = KEY) {
    return cursorBuild({
      config: { repo: box.checkout },
      repoName: REPO,
      work,
      key,
      tools: repoTools({ exec: fakeExec(state), say: (message) => state.said.push(message) }),
      call: async (path, body) => {
        state.portal.push({ path, body });
        return state.portalReply;
      },
      fetchImpl: fakeCursor(state),
      say: (message) => state.said.push(message),
    });
  }

  const originSha = (ref) => sh(box.origin, ['rev-parse', '--verify', `refs/heads/${ref}`]);
  const originHas = (ref) => spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${ref}`], { cwd: box.origin }).status === 0;

  it('creates the milestone branch from main, pushes it, then launches one agent on it', async () => {
    assert.equal(originHas(BRANCH), false);
    const outcome = await step(job());
    assert.equal(outcome, 'running');
    // The branch is on origin, and it starts at main.
    assert.equal(originSha(BRANCH), box.mainSha);
    // One launch, on that branch, with no pull request from Cursor.
    assert.equal(state.cursor.length, 1);
    const launch = state.cursor[0];
    assert.equal(launch.method, 'POST');
    assert.equal(launch.url, CURSOR_AGENTS_URL);
    assert.deepEqual(launch.body.source, { repository: `https://github.com/${REPO}`, ref: BRANCH });
    assert.deepEqual(launch.body.target, { autoCreatePr: false, branchName: BRANCH });
    assert.match(launch.body.prompt.text, /Portal-Task: <id>/);
    assert.match(launch.body.prompt.text, /id tasks:1/);
    assert.match(launch.body.prompt.text, /Open no pull request\. Do not merge\. Do not deploy\./);
    // The Portal hears the agent started, with its id and link.
    assert.deepEqual(state.portal, [
      { path: '/agent/build', body: { runId: 'agentRuns:1', status: 'running', agentId: AGENT_ID, agentUrl: AGENT_URL } },
    ]);
    // No pull request yet: there is no commit to review.
    assert.equal(state.gh.some((args) => args[0] === 'pr'), false);
  });

  it('sends the key to Cursor only, never to the Portal, a prompt or the log', async () => {
    await step(job());
    assert.equal(state.cursor[0].headers.authorization, `Bearer ${KEY}`);
    assert.equal(JSON.stringify(state.cursor.map((request) => request.body)).includes(KEY), false);
    assert.equal(JSON.stringify(state.portal).includes(KEY), false);
    assert.equal(state.said.join('\n').includes(KEY), false);
    assert.equal(state.gh.flat().join(' ').includes(KEY), false);
  });

  it('follows the agent, maps its commits by trailer, opens the one pull request into main and reports', async () => {
    await step(job());
    const first = agentCommits(box, 'Build the overview\n\nPortal-Task: tasks:1');
    agentCommits(box, 'Tidy up, no task');
    const second = agentCommits(box, 'Wire the review card\n\nPortal-Task: tasks:2');
    state.agentStatus = 'FINISHED';
    state.portalReply = { milestoneStatus: 'Ready to Ship' };
    const outcome = await step(job({ externalId: AGENT_ID, externalUrl: AGENT_URL }));
    assert.equal(outcome, 'settled');
    // The second step only reads the agent. It does not launch another.
    assert.deepEqual(state.cursor.map((request) => request.method), ['POST', 'GET']);
    assert.equal(state.cursor[1].url, `${CURSOR_AGENTS_URL}/${AGENT_ID}`);
    // One pull request, from the milestone branch into the default branch.
    const created = state.gh.filter((args) => args[0] === 'pr' && args[1] === 'create');
    assert.equal(created.length, 1);
    assert.equal(created[0][created[0].indexOf('--base') + 1], 'main');
    assert.equal(created[0][created[0].indexOf('--head') + 1], BRANCH);
    assert.equal(created[0][created[0].indexOf('--title') + 1], 'Cursor branch check');
    assert.match(created[0][created[0].indexOf('--body') + 1], /Milestone-Id: milestones:1/);
    const report = state.portal.at(-1);
    assert.equal(report.path, '/agent/build');
    assert.equal(report.body.status, 'finished');
    assert.equal(report.body.prUrl, PR_URL);
    assert.equal(report.body.agentUrl, AGENT_URL);
    assert.deepEqual(
      [...report.body.tasks].sort((a, b) => a.taskId.localeCompare(b.taskId)),
      [
        { taskId: 'tasks:1', commitSha: first },
        { taskId: 'tasks:2', commitSha: second },
      ],
    );
    // Ready to Ship adds the review label. Nothing merges and nothing is closed.
    assert.deepEqual(state.gh.at(-1), ['pr', 'edit', BRANCH, '--add-label', 'ready-for-review']);
    assert.equal(state.gh.some((args) => args.includes('merge') || args.includes('close')), false);
    // main did not move.
    assert.equal(originSha('main'), box.mainSha);
  });

  it('reuses the open pull request and a branch that already exists', async () => {
    await step(job());
    const tip = agentCommits(box, 'Build the overview\n\nPortal-Task: tasks:1');
    state.agentStatus = 'FINISHED';
    state.prOpen = true;
    await step(job({ externalId: AGENT_ID, externalUrl: AGENT_URL }));
    assert.equal(state.gh.some((args) => args[1] === 'create'), false);
    assert.equal(state.portal.at(-1).body.prUrl, PR_URL);
    // A later build for the same milestone starts from the branch tip, not from main.
    state.cursor.length = 0;
    await step(job({ runId: 'agentRuns:2' }));
    assert.equal(originSha(BRANCH), tip);
    assert.equal(state.cursor[0].body.source.ref, BRANCH);
  });

  it('waits while the agent is still running, and writes nothing', async () => {
    await step(job());
    state.portal.length = 0;
    assert.equal(await step(job({ externalId: AGENT_ID, externalUrl: AGENT_URL })), 'running');
    assert.deepEqual(state.portal, []);
    assert.equal(state.gh.some((args) => args[0] === 'pr'), false);
  });

  it('blocks a finished agent that left no Portal-Task trailer, with no pull request', async () => {
    await step(job());
    agentCommits(box, 'Did the work but named no task');
    state.agentStatus = 'FINISHED';
    assert.equal(await step(job({ externalId: AGENT_ID, externalUrl: AGENT_URL })), 'settled');
    assert.deepEqual(state.portal.at(-1).body, {
      runId: 'agentRuns:1',
      status: 'failed',
      reason: 'The Cursor agent finished without a Portal-Task trailer',
      agentUrl: AGENT_URL,
    });
    assert.equal(state.gh.some((args) => args[0] === 'pr'), false);
  });

  it('reports a failed agent, a refused key and a missing key without launching twice', async () => {
    await step(job());
    state.agentStatus = 'ERROR';
    await step(job({ externalId: AGENT_ID, externalUrl: AGENT_URL }));
    assert.deepEqual(state.portal.at(-1).body, { runId: 'agentRuns:1', status: 'failed', reason: 'The Cursor agent stopped', agentUrl: AGENT_URL });

    state.cursor.length = 0;
    state.cursorStatus = 401;
    await step(job({ runId: 'agentRuns:3' }));
    assert.deepEqual(state.portal.at(-1).body, { runId: 'agentRuns:3', status: 'failed', reason: 'Cursor refused the API key' });
    assert.equal(state.cursor.length, 1);

    state.cursor.length = 0;
    await step(job({ runId: 'agentRuns:4' }), '');
    assert.deepEqual(state.portal.at(-1).body, { runId: 'agentRuns:4', status: 'failed', reason: 'The Cursor API key is not set on this runner' });
    assert.equal(state.cursor.length, 0);
  });

  it('refuses any branch that is not milestone/<slug>, before any push or launch', async () => {
    const outcome = await step(job({ milestone: { ...job().milestone, branch: 'main' } }));
    assert.equal(outcome, 'settled');
    assert.equal(state.portal.at(-1).body.reason, 'The milestone branch is not a milestone branch');
    assert.equal(state.cursor.length, 0);
    assert.equal(originSha('main'), box.mainSha);
  });
});

describe('manual check script, against a throwaway repository', () => {
  const NOW = Date.UTC(2026, 10, 22, 23, 1, 0);
  let box;
  let state;

  beforeEach(() => {
    if (box) rmSync(box.root, { recursive: true, force: true });
    box = sandbox();
    state = { gh: [], cursor: [], said: [], prOpen: false, agentStatus: 'RUNNING', cursorStatus: 200 };
  });
  after(() => {
    if (box) rmSync(box.root, { recursive: true, force: true });
  });

  const options = (argv) => {
    const parsed = parseCheckArgs(argv);
    assert.equal(parsed.ok, true, parsed.error);
    return parsed.options;
  };
  const run = (argv, extra = {}) =>
    runCheck({
      options: options(argv),
      repo: box.checkout,
      tools: repoTools({ exec: fakeExec(state) }),
      now: NOW,
      wait: async () => {},
      say: (message) => state.said.push(message),
      ...extra,
    });
  const onOrigin = (branch) => spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], { cwd: box.origin }).status === 0;

  it('only ever names a throwaway branch', () => {
    assert.equal(checkBranchName(NOW), 'milestone/zz-cursor-check-20261122-2301');
    assert.equal(isCheckBranch(checkBranchName(NOW)), true);
    for (const branch of ['main', 'milestone/client-experience-launch', 'milestone/zz-cursor-check-', `${CHECK_PREFIX}../x`]) {
      assert.equal(isCheckBranch(branch), false);
    }
    assert.equal(parseCheckArgs(['--branch', 'milestone/client-experience-launch']).ok, false);
    assert.equal(parseCheckArgs(['--wait', '0']).ok, false);
    assert.equal(parseCheckArgs(['--prod']).ok, false);
    assert.equal(options([]).launch, false);
  });

  it('without --launch: branches from main, pushes, makes no Cursor call, and cleans up', async () => {
    const result = await run(['--cleanup'], {
      fetchImpl: async () => {
        throw new Error('no Cursor call without --launch');
      },
    });
    assert.equal(result.ok, true, JSON.stringify(result.steps));
    assert.equal(result.branch, 'milestone/zz-cursor-check-20261122-2301');
    assert.match(state.said.join('\n'), /Branch starts at main/);
    assert.match(state.said.join('\n'), /No Cursor call was made/);
    // Nothing ahead of main, so no pull request was opened.
    assert.equal(state.gh.some((args) => args[0] === 'pr'), false);
    assert.equal(onOrigin(result.branch), false);
    assert.equal(sh(box.origin, ['rev-parse', 'refs/heads/main']), box.mainSha);
  });

  it('with --launch: one agent, its trailer checked, a draft pull request, then cleanup', async () => {
    const branch = checkBranchName(NOW);
    const cursor = fakeCursor(state);
    const fetchImpl = async (url, init) => {
      if (init.method === 'GET' && state.agentStatus === 'RUNNING') {
        // The cloud agent finishes between two status reads.
        sh(box.agent, ['fetch', 'origin']);
        sh(box.agent, ['checkout', '-B', branch, `origin/${branch}`]);
        writeFileSync(join(box.agent, 'check.txt'), 'ok\n');
        sh(box.agent, ['add', '.']);
        sh(box.agent, ['commit', '-m', `Throwaway check\n\nPortal-Task: ${CHECK_TASK_ID}`]);
        sh(box.agent, ['push', 'origin', branch]);
        state.agentStatus = 'FINISHED';
      }
      return cursor(url, init);
    };
    const result = await run(['--launch', '--cleanup'], { key: KEY, fetchImpl, repoName: REPO });
    assert.equal(result.ok, true, JSON.stringify(result.steps));
    assert.deepEqual(state.cursor.map((request) => request.method), ['POST', 'GET']);
    assert.equal(state.cursor[0].body.target.branchName, branch);
    const created = state.gh.find((args) => args[0] === 'pr' && args[1] === 'create');
    assert.equal(created.includes('--draft'), true);
    assert.equal(created[created.indexOf('--base') + 1], 'main');
    assert.equal(created[created.indexOf('--head') + 1], branch);
    assert.equal(state.gh.some((args) => args[1] === 'close'), true);
    assert.equal(state.gh.some((args) => args.includes('merge')), false);
    assert.equal(onOrigin(branch), false);
    assert.equal(state.said.join('\n').includes(KEY), false);
  });

  it('fails clearly when --launch has no key, and still makes no Cursor call', async () => {
    const result = await run(['--launch', '--no-pr'], { key: '' });
    assert.equal(result.ok, false);
    assert.match(state.said.join('\n'), /CURSOR_API_KEY is not set/);
    assert.equal(state.cursor.length, 0);
  });
});
