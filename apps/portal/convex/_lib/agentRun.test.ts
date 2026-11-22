import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  BLOCKED_NEEDS_REASON,
  COMMIT_SHA_INVALID,
  EVENT_PAYLOAD_LIMIT,
  EVENT_SUMMARY_LIMIT,
  FEED_MAX,
  FEED_PAGE,
  RUNNER_RATE_LIMIT,
  RUNNER_RATE_WINDOW_MS,
  RUNNER_UNAUTHORIZED,
  allTasksDone,
  authorizeRunner,
  completeDecision,
  eventSummary,
  eventType,
  feedLimit,
  milestoneBranch,
  nextClaimableTask,
  parseRunnerTokens,
  redactSecrets,
  runnerOnline,
  runnerRateDecision,
  trimEventPayload,
} from './agentRun';
import { checklistDetailText, checklistState, checklistSummary } from './milestoneTasks';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const TOKEN_A = 'a'.repeat(32);
const TOKEN_B = 'b'.repeat(32);
const configured = `peter-mbp=${TOKEN_A},studio-mini=${TOKEN_B}`;

describe('runner tokens', () => {
  it('reads one token per runner and drops short or malformed entries', () => {
    const tokens = parseRunnerTokens(`${configured}\nshort=abc, Bad Id=${TOKEN_A},=x`);
    assert.deepEqual([...tokens.keys()], ['peter-mbp', 'studio-mini']);
    assert.equal(parseRunnerTokens(undefined).size, 0);
  });

  it('accepts only the named runner with its own token', () => {
    const ok = authorizeRunner({ configured, authorizationHeader: `Bearer ${TOKEN_A}`, runnerId: 'peter-mbp' });
    assert.deepEqual(ok, { ok: true, runnerId: 'peter-mbp' });
    // Another runner's token, an unknown id, and a missing header are all refused the same way.
    for (const [header, id] of [
      [`Bearer ${TOKEN_B}`, 'peter-mbp'],
      [`Bearer ${TOKEN_A}`, 'someone-else'],
      [null, 'peter-mbp'],
      [`Basic ${TOKEN_A}`, 'peter-mbp'],
    ] as const) {
      const refused = authorizeRunner({ configured, authorizationHeader: header, runnerId: id });
      assert.deepEqual(refused, { ok: false, status: 401, reason: RUNNER_UNAUTHORIZED });
    }
    assert.equal(authorizeRunner({ configured: '', authorizationHeader: `Bearer ${TOKEN_A}`, runnerId: 'peter-mbp' }).ok, false);
    const bad = authorizeRunner({ configured, authorizationHeader: `Bearer ${TOKEN_A}`, runnerId: 'Peter MBP' });
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.equal(bad.status, 400);
  });

  it('compares the token in constant time', () => {
    assert.match(read('./agentRun.ts'), /timingSafeEqualUtf8\(given, reference\)/);
  });
});

describe('rate limit and liveness', () => {
  it('allows 120 calls a minute and then waits for the next window', () => {
    let state = { windowStart: 0, count: 0 };
    const now = 1_000_000;
    for (let call = 0; call < RUNNER_RATE_LIMIT; call += 1) {
      const next = runnerRateDecision({ ...state, now });
      assert.equal(next.ok, true);
      if (next.ok) state = { windowStart: next.windowStart, count: next.count };
    }
    assert.equal(runnerRateDecision({ ...state, now }).ok, false);
    assert.equal(runnerRateDecision({ ...state, now: now + RUNNER_RATE_WINDOW_MS }).ok, true);
  });

  it('reads a quiet runner as offline', () => {
    assert.equal(runnerOnline(1000, 1000 + 60_000), true);
    assert.equal(runnerOnline(1000, 1000 + 11 * 60_000), false);
    assert.equal(runnerOnline(null, 5), false);
  });
});

describe('claiming', () => {
  const task = (over: Record<string, unknown>) => ({
    id: 't',
    status: 'To Do',
    isDone: false,
    milestoneOrder: 0,
    source: 'portal-milestone',
    ...over,
  });

  it('takes the lowest-order To do task the portal owns', () => {
    const next = nextClaimableTask([
      task({ id: 'c', milestoneOrder: 2 }),
      task({ id: 'a', milestoneOrder: 0, status: 'Done', isDone: true }),
      task({ id: 'b', milestoneOrder: 1 }),
    ]);
    assert.equal(next?.id, 'b');
  });

  it('skips a claimed task, a subtask, an archived task and a task that syncs from Notion', () => {
    assert.equal(nextClaimableTask([task({ claimedBy: 'studio-mini' })]), null);
    assert.equal(nextClaimableTask([task({ parentTaskId: 'p' })]), null);
    assert.equal(nextClaimableTask([task({ archivedAt: 5 })]), null);
    assert.equal(nextClaimableTask([task({ status: 'In Progress' })]), null);
    assert.equal(nextClaimableTask([task({ source: 'Client', notionPageId: 'abc123' })]), null);
  });

  it('claims in one mutation, and a second runner cannot take the same task', () => {
    const agent = read('../agent.ts');
    const claim = agent.slice(agent.indexOf('export const claimNext'), agent.indexOf('async function ownedRun'));
    // The read, the claim patch and the run insert are in the same internalMutation, so Convex serializes them.
    assert.match(claim, /internalMutation/);
    assert.match(claim, /claimedBy: args\.runnerId/);
    assert.match(claim, /ctx\.db\.insert\('agentRuns'/);
    assert.doesNotMatch(claim, /ctx\.scheduler|runAction/);
    // The second runner reads the task after the first commit and sees it claimed.
    const afterFirstClaim = [task({ id: 'a', status: 'In Progress', claimedBy: 'peter-mbp' }), task({ id: 'b', milestoneOrder: 1 })];
    assert.equal(nextClaimableTask(afterFirstClaim)?.id, 'b');
    // A runner with a run still open gets that run back.
    assert.match(claim, /const open = await runningRunFor\(ctx, args\.runnerId\);/);
    assert.match(claim, /resumed: true/);
  });

  it('knows when every task is done', () => {
    assert.equal(allTasksDone([{ isDone: true }, { isDone: true }]), true);
    assert.equal(allTasksDone([{ isDone: true }, { isDone: false }]), false);
    assert.equal(allTasksDone([{ isDone: true }, { isDone: false, archivedAt: 1 }]), true);
    assert.equal(allTasksDone([]), false);
  });
});

describe('finishing a task', () => {
  it('closes the task with its commit', () => {
    const done = completeDecision({ status: 'done', commitSha: '4C1E9AA0FF' });
    assert.equal(done.ok, true);
    if (done.ok) {
      assert.deepEqual(done.task, { status: 'Done', isDone: true });
      assert.equal(done.commitSha, '4c1e9aa0ff');
      assert.equal(done.run, 'succeeded');
    }
  });

  it('needs a reason to block and hands a failed task back', () => {
    assert.deepEqual(completeDecision({ status: 'blocked' }), { ok: false, reason: BLOCKED_NEEDS_REASON });
    const blocked = completeDecision({ status: 'blocked', reason: 'needs Figma frame' });
    assert.equal(blocked.ok && blocked.task.status, 'Blocked');
    const failed = completeDecision({ status: 'failed' });
    assert.equal(failed.ok && failed.task.status, 'To Do');
    assert.equal(completeDecision({ status: 'shipped' }).ok, false);
    assert.deepEqual(completeDecision({ status: 'done', commitSha: 'not a sha' }), { ok: false, reason: COMMIT_SHA_INVALID });
  });

  it('moves the milestone through the shared status decision and is idempotent', () => {
    const agent = read('../agent.ts');
    const complete = agent.slice(agent.indexOf('export const completeTask'), agent.indexOf('export const writePlannedTasks'));
    assert.match(complete, /if \(run\.status !== 'running'\)/);
    assert.match(complete, /duplicate: true/);
    assert.match(complete, /allTasksDone\(tasks\)/);
    assert.match(complete, /moveMilestone\(ctx, milestone, 'Ready to Ship'/);
    assert.match(agent, /transitionMilestone\(\{ from: milestone\.status, cause: 'set', to \}\)/);
    assert.doesNotMatch(agent, /status: 'Shipped'/);
  });
});

describe('event payloads', () => {
  it('masks credentials in any string', () => {
    const fakeKey = `sk-${'x'.repeat(24)}`;
    const text = redactSecrets(`curl -H "Authorization: Bearer abcdefghijklmnop1234" ${fakeKey} ghp_abcdefghijklmnopqrstuvwx`);
    assert.equal(text.includes('abcdefghijklmnop1234'), false);
    assert.equal(text.includes(fakeKey), false);
    assert.equal(text.includes('ghp_'), false);
  });

  it('cuts the summary to one short line', () => {
    const summary = eventSummary(`  Edited\n  a file ${'x'.repeat(400)}`);
    assert.equal(summary.ok, true);
    if (summary.ok) {
      assert.equal(summary.summary.length, EVENT_SUMMARY_LIMIT);
      assert.equal(summary.summary.includes('\n'), false);
    }
    assert.equal(eventSummary('   ').ok, false);
    assert.equal(eventSummary(42).ok, false);
  });

  it('strips the environment and credential-named keys, and caps the size', () => {
    const stored = trimEventPayload({
      tool_name: 'Bash',
      env: { RUNNER_TOKEN: 'super-secret-value' },
      tool_input: { command: 'npm test', apiKey: 'k-123456', nested: { password: 'hunter2', note: 'fine' } },
      authorization: 'Bearer abcdefghijklmnop1234',
    });
    assert.ok(stored);
    assert.equal(stored.includes('super-secret-value'), false);
    assert.equal(stored.includes('k-123456'), false);
    assert.equal(stored.includes('hunter2'), false);
    assert.equal(stored.includes('abcdefghijklmnop1234'), false);
    assert.match(stored, /npm test/);
    assert.match(stored, /fine/);
    const big = trimEventPayload({ output: Array.from({ length: 10 }, () => 'y'.repeat(290)), more: 'z'.repeat(290) });
    assert.ok(big && big.length <= EVENT_PAYLOAD_LIMIT);
    assert.equal(trimEventPayload(null), null);
    assert.equal(trimEventPayload({}), null);
  });

  it('stores an unknown event type as a note', () => {
    assert.equal(eventType('commit'), 'commit');
    assert.equal(eventType('rm -rf'), 'note');
    assert.equal(eventType(undefined), 'note');
  });
});

describe('branch and feed', () => {
  it('names the branch from the milestone', () => {
    assert.equal(milestoneBranch('Client experience launch'), 'milestone/client-experience-launch');
    assert.equal(milestoneBranch('  Visitor Check-In!! '), 'milestone/visitor-check-in');
    assert.equal(milestoneBranch('Café ☕ menu'), 'milestone/cafe-menu');
    assert.equal(milestoneBranch('***'), 'milestone/untitled');
    assert.ok(milestoneBranch('x'.repeat(200)).length <= 'milestone/'.length + 48);
  });

  it('pages the feed by 20 up to 200', () => {
    assert.equal(feedLimit(undefined), FEED_PAGE);
    assert.equal(feedLimit(5), FEED_PAGE);
    assert.equal(feedLimit(40), 40);
    assert.equal(feedLimit(5000), FEED_MAX);
  });
});

describe('checklist with runner fields', () => {
  it('shows the commit, the runner and the blocked reason', () => {
    assert.equal(checklistDetailText({ status: 'Done', isDone: true, commit: '4c1e9aa' }), 'Done · 4c1e9aa');
    assert.equal(checklistDetailText({ status: 'In Progress', isDone: false, runner: 'peter-mbp' }), 'In progress · peter-mbp');
    assert.equal(
      checklistDetailText({ status: 'Blocked', isDone: false, blockedReason: 'needs Figma frame' }),
      'Blocked · needs Figma frame',
    );
    assert.equal(checklistDetailText({ status: 'To Do', isDone: false }), 'To do');
    assert.equal(checklistState({ status: 'Blocked', isDone: false }), 'blocked');
    assert.equal(
      checklistSummary([
        { status: 'Done', isDone: true },
        { status: 'In Progress', isDone: false },
        { status: 'Blocked', isDone: false },
      ]),
      '1 done · 1 in progress · 1 blocked',
    );
  });
});

describe('who can read agent tables', () => {
  it('gives a client session nothing', () => {
    for (const file of ['../portalData.ts', '../tasks.ts', '../milestones.ts', '../clients.ts', '../projects.ts', '../search.ts']) {
      const source = read(file);
      for (const table of ['agentRuns', 'agentEvents', 'agentRunners']) {
        assert.equal(source.includes(table), false, `${file} reads ${table}`);
      }
    }
    const agent = read('../agent.ts');
    assert.equal(agent.includes('clientQuery'), false);
    assert.equal(agent.includes('clientMutation'), false);
    assert.match(agent, /export const feedForMilestone = adminQuery/);
    // Every other export is internal, so only the runner routes reach it.
    const exported = agent.match(/export const \w+ = (\w+)/g) ?? [];
    assert.deepEqual(
      exported.filter((line) => !line.endsWith('internalMutation')),
      ['export const feedForMilestone = adminQuery'],
    );
  });

  it('holds no model key in Convex', () => {
    for (const file of ['../agent.ts', '../agentHttp.ts', './agentRun.ts']) {
      assert.equal(/ANTHROPIC|OPENAI|api\.anthropic\.com|CLAUDE_CODE_OAUTH/.test(read(file)), false, file);
    }
    assert.match(read('../agentHttp.ts'), /process\.env\.RUNNER_TOKENS/);
  });
});

describe('queue rules', () => {
  it('plans any milestone created with no tasks, whatever made it', async () => {
    const { planningForNewMilestone } = await import('./agentRun');
    assert.equal(planningForNewMilestone({ taskCount: 0, status: 'Planning' }), true);
    assert.equal(planningForNewMilestone({ taskCount: 3, status: 'Awaiting Go' }), false);
    assert.equal(planningForNewMilestone({ taskCount: 0, status: 'Parked' }), false);
    // Neither create path looks at createdVia to decide.
    assert.doesNotMatch(read('../milestones.ts'), /createdVia === 'portal' &&/);
    assert.match(read('../portalApi.ts'), /planningForNewMilestone\(\{ taskCount: proposed\.tasks\.length/);
  });

  it('keeps one task run per milestone and releases a run whose runner went quiet', async () => {
    const { runIsStuck, STUCK_RUN_AFTER_MS, tasksWaitingOnPerson } = await import('./agentRun');
    const agent = read('../agent.ts');
    assert.match(agent, /withIndex\('by_milestone_status', \(q\) => q\.eq\('milestoneId', milestone\._id\)\.eq\('status', 'running'\)\)/);
    assert.match(agent, /if \(busy\) continue;/);
    assert.equal(runIsStuck({ lastSeenAt: 0, startedAt: 0, now: STUCK_RUN_AFTER_MS }), true);
    assert.equal(runIsStuck({ lastSeenAt: 1000, startedAt: 0, now: 1000 + STUCK_RUN_AFTER_MS - 1 }), false);
    assert.equal(runIsStuck({ lastSeenAt: null, startedAt: 5000, now: 6000 }), false);
    const sweep = agent.slice(agent.indexOf('export const releaseStuckRuns'), agent.indexOf('export const feedForMilestone'));
    // Indexed and capped. No whole-table read.
    assert.match(sweep, /withIndex\('by_status', \(q\) => q\.eq\('status', 'running'\)\)\s*\.take\(STUCK_RUN_SCAN\)/);
    assert.doesNotMatch(sweep, /\.collect\(\)/);
    assert.match(read('../crons.ts'), /internal\.agent\.releaseStuckRuns/);
    const waiting = tasksWaitingOnPerson([
      { name: 'Synced', isDone: false, source: 'Client', notionPageId: 'abc' },
      { name: 'Owned', isDone: false, source: 'portal-milestone' },
      { name: 'Synced done', isDone: true, source: 'Client', notionPageId: 'def' },
    ]);
    assert.deepEqual(waiting.map((task) => task.name), ['Synced']);
  });
});
