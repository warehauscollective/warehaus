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
  RUNNER_RATE_LIMITED,
  RUNNER_RATE_WINDOW_MS,
  RUNNER_UNAUTHORIZED,
  authorizeRunner,
  completeDecision,
  eventSummary,
  eventType,
  feedLimit,
  milestoneBranch,
  parseRunnerTokens,
  redactSecrets,
  reposForRunner,
  runnerOnline,
  runnerRateDecision,
  runnerTouchDecision,
  trimEventPayload,
  RETRY_RUN_ACTIVE,
  RETRY_RUN_WINDING_DOWN,
  RUN_LEASE_GRACE_MS,
  cursorAgentToResume,
  retryLeaseDecision,
  runLease,
} from './agentRun';
import { checklistDetailText, checklistState, checklistSummary } from './milestoneTasks';
import { classifyClaimable } from './milestoneTaskSet';

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
    assert.deepEqual(ok, { ok: true, runnerId: 'peter-mbp', repos: [] });
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

  it('hands a runner only the repositories named on its token', () => {
    const raw = `peter-mbp=${TOKEN_A} WarehausCollective/Warehaus other/repo\nstudio-mini=${TOKEN_B}`;
    const tokens = parseRunnerTokens(raw);
    assert.deepEqual(tokens.get('peter-mbp')?.repos, ['warehauscollective/warehaus', 'other/repo']);
    assert.deepEqual(tokens.get('studio-mini')?.repos, []);
    const ok = authorizeRunner({ configured: raw, authorizationHeader: `Bearer ${TOKEN_A}`, runnerId: 'peter-mbp' });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.deepEqual(reposForRunner(ok.repos, ['warehauscollective/warehaus', 'secret/other']), ['warehauscollective/warehaus']);
      assert.deepEqual(reposForRunner(ok.repos, []), []);
    }
    const bare = authorizeRunner({ configured, authorizationHeader: `Bearer ${TOKEN_A}`, runnerId: 'peter-mbp' });
    if (bare.ok) assert.deepEqual(reposForRunner(bare.repos, ['warehauscollective/warehaus']), []);
    const http = read('../agentHttp.ts');
    assert.match(http, /reposForRunner\(auth\.repos, body\.repos\)/);
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

  it('patches a runner at most once a minute', () => {
    const now = 1_000_000;
    const first = runnerTouchDecision({ lastSeenAt: null, windowStart: null, count: null, now });
    assert.deepEqual(first, { ok: true, write: true, windowStart: now, count: 1, lastSeenAt: now });
    const again = runnerTouchDecision({ lastSeenAt: now, windowStart: now, count: 1, now: now + 30_000 });
    assert.deepEqual(again, { ok: true, write: false });
    const held = runnerTouchDecision({ lastSeenAt: now, windowStart: now, count: RUNNER_RATE_LIMIT, now: now + 30_000 });
    assert.deepEqual(held, { ok: false, reason: RUNNER_RATE_LIMITED });
    const later = runnerTouchDecision({ lastSeenAt: now, windowStart: now, count: 1, now: now + 60_000 });
    assert.deepEqual(later, { ok: true, write: true, windowStart: now + 60_000, count: 1, lastSeenAt: now + 60_000 });
    const agent = read('../agent.ts');
    assert.match(agent, /if \(!decision\.write\) return \{ ok: true as const \}/);
    assert.match(agent, /CLAIM_PER_PROJECT = 5/);
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
    milestoneId: 'm',
    status: 'To Do',
    isDone: false,
    milestoneOrder: 0,
    source: 'portal-milestone',
    ...over,
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
    assert.equal(classifyClaimable(afterFirstClaim).nextClaimable?.id, 'b');
    // A runner with a run still open gets that run back.
    assert.match(claim, /const open = await runningRunFor\(ctx, args\.runnerId\);/);
    assert.match(claim, /resumed: true/);
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
    assert.equal(failed.ok && failed.task.status, 'Blocked');
    assert.equal(failed.ok && failed.reason, 'The run failed');
    assert.equal(completeDecision({ status: 'shipped' }).ok, false);
    assert.deepEqual(completeDecision({ status: 'done', commitSha: 'not a sha' }), { ok: false, reason: COMMIT_SHA_INVALID });
  });

  it('moves the milestone through the shared status decision and is idempotent', () => {
    const agent = read('../agent.ts');
    const complete = agent.slice(agent.indexOf('export const completeTask'), agent.indexOf('export const writePlannedTasks'));
    assert.match(complete, /if \(run\.status !== 'running'\)/);
    assert.match(complete, /duplicate: true/);
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
      exported.filter((line) => !line.endsWith('internalMutation')).sort(),
      [
        'export const buildingProgress = adminQuery',
        'export const feedForMilestone = adminQuery',
        'export const regeneratePlan = adminMutation',
        'export const retryBlocked = adminMutation',
      ],
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
    const { runIsStuck, STUCK_RUN_AFTER_MS } = await import('./agentRun');
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
  });
});

describe('repository fail-safe', () => {
  it('hands a runner nothing for a project with no repository, or one it does not serve', async () => {
    const { agentRepo, projectServedBy, runnerRepos } = await import('./agentRun');
    assert.equal(agentRepo('WarehausCollective/warehaus'), 'warehauscollective/warehaus');
    assert.equal(agentRepo('https://github.com/warehauscollective/warehaus.git'), 'warehauscollective/warehaus');
    for (const bad of ['warehaus', 'a/b/c', '../etc', '', null, 5]) assert.equal(agentRepo(bad), null, String(bad));
    assert.deepEqual(runnerRepos(['A/b', 'a/b', 'nope', 'c/d']), ['a/b', 'c/d']);
    assert.deepEqual(runnerRepos('a/b, c/d'), ['a/b', 'c/d']);
    assert.deepEqual(runnerRepos(undefined), []);
    assert.equal(projectServedBy({ agentRepo: 'a/b' }, ['a/b']), true);
    assert.equal(projectServedBy({ agentRepo: 'a/b' }, ['c/d']), false);
    assert.equal(projectServedBy({ agentRepo: null }, ['a/b']), false);
    assert.equal(projectServedBy({}, ['a/b']), false);
    assert.equal(projectServedBy(null, ['a/b']), false);
  });

  it('checks the repository before planning and before tasks, and a runner with none gets nothing', () => {
    const agent = read('../agent.ts');
    const claim = agent.slice(agent.indexOf('export const claimNext'), agent.indexOf('async function ownedRun'));
    assert.match(claim, /if \(repos\.length === 0\) return \{ ok: true as const, resumed: false, kind: 'none' as const/);
    assert.match(claim, /if \(!\(await served\(planning\.projectId\)\)\) continue;/);
    assert.match(claim, /if \(!\(await served\(milestone\.projectId\)\)\) continue;/);
    // The repo setting and the agent are written only by staff.
    const projects = read('../projects.ts');
    assert.match(projects, /export const setAgentRepo = adminMutation/);
    assert.match(projects, /export const setAgentDriver = adminMutation/);
    // The route ignores any tool a runner sends. The project setting decides.
    assert.doesNotMatch(read('../agentHttp.ts'), /tool: field\(body, 'tool'\)/);
    assert.match(claim, /buildAgent\(project\?\.agentDriver\)/);
    assert.match(claim, /tool: 'claude_code'/);
  });
});

describe('needs Peter notes', () => {
  it('asks for approval from the local preview and never names the Vercel one', async () => {
    const { approvalNote, blockedNote, localPreviewCommand } = await import('./agentRun');
    const note = approvalNote({
      milestoneName: 'Client experience launch',
      iteration: 2,
      branch: 'milestone/client-experience-launch',
      prUrl: 'https://github.com/warehauscollective/warehaus/pull/140',
      localPreviewUrl: 'http://localhost:3100/',
    });
    assert.match(note, /Iteration 2 is Ready to Ship and needs your review/);
    assert.match(note, /pull\/140/);
    assert.match(note, /npm run preview:pr -- milestone\/client-experience-launch/);
    assert.match(note, /http:\/\/localhost:3100\//);
    assert.match(note, /Merge and deploy stay separate steps/);
    assert.equal(/vercel/i.test(note), false);
    assert.equal(localPreviewCommand('milestone/x'), 'npm run preview:pr -- milestone/x');
    const blocked = blockedNote({
      milestoneName: 'Launch',
      taskOrder: '06',
      taskName: 'Adjust mobile summary',
      reason: 'needs Figma frame',
      runnerId: 'peter-mbp',
    });
    assert.match(blocked, /Task 06 is blocked and needs you/);
    assert.match(blocked, /Blocked on: needs Figma frame/);
  });

  it('lists open notes with one indexed, capped read and no new outbound call', () => {
    const api = read('../portalApi.ts');
    const list = api.slice(api.indexOf('export const listNeedsPeter'), api.indexOf('export const addMilestoneNote'));
    assert.match(list, /withIndex\('by_needsPeter', \(q\) => q\.eq\('needsPeter', 'open'\)\)\s*\.order\('desc'\)\s*\.take\(NEEDS_PETER_LIMIT\)/);
    assert.doesNotMatch(list, /\.collect\(\)/);
    const agent = read('../agent.ts');
    assert.doesNotMatch(agent, /fetch\(|runAction|scheduler/);
    assert.match(agent, /needsPeter: 'open'/);
    assert.match(agent, /answerNotes\(ctx, milestone\._id, \{ reason: 'blocked', taskId: task\._id \}\)/);
  });
});

describe('auto-planning and agent choice', () => {
  it('queues one planning run per iteration and skips when tasks exist', async () => {
    const { planningEnqueueDecision, planningForNewMilestone, PLANNING_RATE_LIMIT } = await import('./agentRun');
    assert.equal(planningForNewMilestone({ taskCount: 0, status: 'Planning' }), true);
    assert.equal(planningForNewMilestone({ taskCount: 0, status: 'Awaiting Go' }), false);
    assert.equal(planningForNewMilestone({ taskCount: 0, status: 'Idea' }), false);
    const first = planningEnqueueDecision({
      status: 'Planning',
      taskCount: 0,
      planning: null,
      planningIteration: null,
      iteration: 1,
      recentRuns: 0,
    });
    assert.deepEqual(first, { enqueue: true, replace: false });
    const again = planningEnqueueDecision({
      status: 'Planning',
      taskCount: 0,
      planning: 'queued',
      planningIteration: 1,
      iteration: 1,
      recentRuns: 1,
    });
    assert.deepEqual(again, { enqueue: false, replace: false });
    const withTasks = planningEnqueueDecision({
      status: 'Planning',
      taskCount: 4,
      planning: null,
      iteration: 1,
      recentRuns: 0,
    });
    assert.equal(withTasks.enqueue, false);
    const regenerate = planningEnqueueDecision({
      status: 'Planning',
      taskCount: 4,
      planning: null,
      iteration: 1,
      regenerate: true,
      recentRuns: 0,
    });
    assert.deepEqual(regenerate, { enqueue: true, replace: true });
    const running = planningEnqueueDecision({
      status: 'Planning',
      taskCount: 0,
      planning: 'running',
      iteration: 1,
      regenerate: true,
      recentRuns: 1,
    });
    assert.equal(running.enqueue, false);
    const capped = planningEnqueueDecision({
      status: 'Planning',
      taskCount: 0,
      planning: null,
      iteration: 1,
      recentRuns: PLANNING_RATE_LIMIT,
    });
    assert.equal(capped.enqueue, false);
    const milestones = read('../milestones.ts');
    const portal = read('../portalApi.ts');
    assert.match(milestones, /queuePlanning\(ctx, current\)/);
    assert.match(portal, /queuePlanning\(ctx, current\)/);
    assert.match(read('../agent.ts'), /origin: 'planner'/);
    assert.doesNotMatch(read('../agent.ts').slice(read('../agent.ts').indexOf('export const writePlannedTasks')), /Awaiting Go/);
  });

  it('picks the project agent and maps Cursor commits onto tasks', async () => {
    const { buildAgent, cursorAgentUrl, mapCursorCommits } = await import('./agentRun');
    const { statusForBotCreate, BOT_STATUS_BUILDING } = await import('./milestoneBot');
    assert.equal(buildAgent(undefined), 'claude_code');
    assert.equal(buildAgent('claude_code'), 'claude_code');
    assert.equal(buildAgent('cursor'), 'cursor');
    assert.equal(buildAgent('something else'), 'claude_code');
    assert.deepEqual(statusForBotCreate('Building'), { ok: false, reason: BOT_STATUS_BUILDING });
    const tasks = [{ id: 'tasks:1' }, { id: 'tasks:2' }];
    const mapped = mapCursorCommits(
      [
        { sha: 'a'.repeat(40), message: 'First\n\nPortal-Task: tasks:1' },
        { sha: 'b'.repeat(40), message: 'Again\n\nPortal-Task: tasks:1' },
        { sha: 'not-a-sha', message: 'Portal-Task: tasks:2' },
        { sha: 'c'.repeat(40), message: 'Second\n\nPortal-Task: tasks:2' },
        { sha: 'd'.repeat(40), message: 'Portal-Task: tasks:nope' },
      ],
      tasks,
    );
    assert.deepEqual(mapped, [
      { taskId: 'tasks:1', commitSha: 'a'.repeat(40) },
      { taskId: 'tasks:2', commitSha: 'c'.repeat(40) },
    ]);
    assert.equal(cursorAgentUrl('https://cursor.com/agents/bc-20ed844d'), 'https://cursor.com/agents/bc-20ed844d');
    assert.equal(cursorAgentUrl('https://example.com/agents/bc-20ed844d'), null);
    assert.match(read('../agent.ts'), /kind: 'agent'/);
    assert.doesNotMatch(read('../agent.ts'), /CURSOR_API_KEY|unique-turtle-383/);
  });
});

describe('run lease', () => {
  const NOW = 1_800_000_000_000;

  it('holds a running run, and a run the Portal closed until it settles or the grace window passes', () => {
    assert.deepEqual(runLease({ status: 'running', kind: 'task' }, NOW), { held: true, why: 'active', until: null });
    assert.deepEqual(runLease({ status: 'succeeded', kind: 'task', endedAt: NOW }, NOW), { held: false });
    assert.deepEqual(runLease({ status: 'failed', kind: 'task', endedAt: NOW, settledAt: NOW }, NOW), { held: false });
    assert.deepEqual(runLease({ status: 'cancelled', kind: 'task', endedAt: NOW - 60_000 }, NOW), {
      held: true,
      why: 'winding_down',
      until: NOW - 60_000 + RUN_LEASE_GRACE_MS,
    });
    assert.deepEqual(runLease({ status: 'cancelled', kind: 'task', endedAt: NOW - RUN_LEASE_GRACE_MS }, NOW), { held: false });
    assert.deepEqual(runLease({ status: 'cancelled', kind: 'planning' }, NOW), { held: false });
    // A closed build with an agent id is followed, not replaced, so it holds nothing.
    assert.deepEqual(runLease({ status: 'failed', kind: 'build', endedAt: NOW, externalId: 'bc_1' }, NOW), { held: false });
    assert.equal(runLease({ status: 'failed', kind: 'build', endedAt: NOW }, NOW).held, true);
  });

  it('refuses a milestone retry over any held run, and a task retry only over that task or a build', () => {
    const running = { status: 'running', kind: 'task', taskId: 't2' };
    const released = { status: 'cancelled', kind: 'task', taskId: 't1', endedAt: NOW - 1000 };
    assert.deepEqual(retryLeaseDecision({ runs: [running], now: NOW }), { ok: false, reason: RETRY_RUN_ACTIVE, until: null });
    assert.deepEqual(retryLeaseDecision({ runs: [running], taskId: 't1', now: NOW }), { ok: true });
    assert.deepEqual(retryLeaseDecision({ runs: [running], taskId: 't2', now: NOW }), { ok: false, reason: RETRY_RUN_ACTIVE, until: null });
    assert.deepEqual(retryLeaseDecision({ runs: [released], taskId: 't1', now: NOW }), {
      ok: false,
      reason: RETRY_RUN_WINDING_DOWN,
      until: NOW - 1000 + RUN_LEASE_GRACE_MS,
    });
    assert.deepEqual(retryLeaseDecision({ runs: [released], taskId: 't3', now: NOW }), { ok: true });
    assert.equal(retryLeaseDecision({ runs: [{ status: 'running', kind: 'build' }], taskId: 't1', now: NOW }).ok, false);
    // Active wins over winding down, and an empty history is free.
    assert.equal((retryLeaseDecision({ runs: [released, running], now: NOW }) as { reason: string }).reason, RETRY_RUN_ACTIVE);
    assert.deepEqual(retryLeaseDecision({ runs: [], now: NOW }), { ok: true });
    assert.deepEqual(retryLeaseDecision({ runs: [{ ...released, settledAt: NOW }], taskId: 't1', now: NOW }), { ok: true });
  });

  it('follows only an unsettled, retried build that has an agent id', () => {
    const base = { kind: 'build', status: 'cancelled', externalId: 'bc_1', externalUrl: 'https://cursor.com/agents/bc_abc12345' };
    assert.deepEqual(cursorAgentToResume([base]), { externalId: 'bc_1', externalUrl: 'https://cursor.com/agents/bc_abc12345' });
    assert.equal(cursorAgentToResume([{ ...base, settledAt: NOW }]), null);
    assert.equal(cursorAgentToResume([{ ...base, externalId: null }]), null);
    assert.equal(cursorAgentToResume([{ ...base, status: 'succeeded' }]), null);
    // Only the newest build counts.
    assert.equal(cursorAgentToResume([{ kind: 'build', status: 'cancelled', settledAt: NOW }, base]), null);
    assert.equal(cursorAgentToResume([{ kind: 'task', status: 'cancelled' }]), null);
  });
});
