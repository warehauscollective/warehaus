import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  hookEvent,
  idleDelayMs,
  isMilestoneBranch,
  parseArgs,
  parsePlan,
  planPrompt,
  pullRequestBody,
  readEnv,
  repoFromRemote,
  taskOutcome,
  taskPrompt,
  worktreeName,
} from './lib.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('arguments', () => {
  it('reads start with an id and defaults to interactive', () => {
    assert.deepEqual(parseArgs(['start', '--id', 'peter-mbp', '--repo', 'WarehausCollective/warehaus']), {
      ok: true,
      options: { id: 'peter-mbp', mode: 'interactive', once: false, dir: '', repos: ['warehauscollective/warehaus'] },
    });
    const full = parseArgs([
      'start', '--id', 'peter-mbp', '--mode', 'headless', '--once', '--dir', '/tmp/x',
      '--repo', 'a/b,c/d', '--repo', 'a/b',
    ]);
    assert.deepEqual(full.options, { id: 'peter-mbp', mode: 'headless', once: true, dir: '/tmp/x', repos: ['a/b', 'c/d'] });
  });

  it('refuses a missing id, a bad mode and an unknown flag', () => {
    assert.equal(parseArgs(['start']).ok, false);
    assert.equal(parseArgs(['start', '--id', 'Peter MBP', '--repo', 'a/b']).ok, false);
    assert.equal(parseArgs(['start', '--id', 'peter-mbp', '--repo', 'a/b', '--mode', 'fast']).ok, false);
    assert.equal(parseArgs(['start', '--id', 'peter-mbp', '--repo', 'a/b', '--force']).ok, false);
    // No repository named: the runner does not start.
    assert.equal(parseArgs(['start', '--id', 'peter-mbp']).ok, false);
    assert.equal(parseArgs(['start', '--id', 'peter-mbp', '--repo', '/tmp/x']).ok, false);
    assert.equal(parseArgs(['stop']).ok, false);
  });
});

describe('environment', () => {
  const token = 'a'.repeat(32);

  it('needs an https Convex site URL and a token', () => {
    assert.deepEqual(readEnv({ PORTAL_AGENT_URL: 'https://graceful-mastiff-960.convex.site/', RUNNER_TOKEN: token }), {
      ok: true,
      url: 'https://graceful-mastiff-960.convex.site',
      token,
    });
    assert.equal(readEnv({ RUNNER_TOKEN: token }).ok, false);
    assert.equal(readEnv({ PORTAL_AGENT_URL: 'https://graceful-mastiff-960.convex.site' }).ok, false);
    assert.equal(readEnv({ PORTAL_AGENT_URL: 'http://graceful-mastiff-960.convex.site', RUNNER_TOKEN: token }).ok, false);
    assert.equal(readEnv({ PORTAL_AGENT_URL: 'https://example.com', RUNNER_TOKEN: token }).ok, false);
  });

  it('refuses production unless it is asked for', () => {
    const production = { PORTAL_AGENT_URL: 'https://unique-turtle-383.convex.site', RUNNER_TOKEN: token };
    assert.equal(readEnv(production).ok, false);
    assert.equal(readEnv({ ...production, RUNNER_ALLOW_PRODUCTION: '1' }).ok, true);
  });
});

describe('branches', () => {
  it('only accepts milestone branches', () => {
    assert.equal(isMilestoneBranch('milestone/client-experience-launch'), true);
    assert.equal(isMilestoneBranch('main'), false);
    assert.equal(isMilestoneBranch('milestone/'), false);
    assert.equal(isMilestoneBranch('milestone/../main'), false);
    assert.equal(isMilestoneBranch('feature/x'), false);
    assert.equal(worktreeName('milestone/client-experience-launch'), 'milestone-client-experience-launch');
  });
});

describe('prompts', () => {
  const work = {
    milestone: { name: 'Launch', objective: 'Ship the page.', goals: ['Hero matches'], branch: 'milestone/launch' },
    task: { order: 5, title: 'Apply review feedback', detail: '' },
  };

  it('fills the task prompt', () => {
    const prompt = taskPrompt(read('../prompts/task.md'), work);
    assert.match(prompt, /Task 05: \*\*Apply review feedback\*\*/);
    assert.match(prompt, /branch `milestone\/launch`/);
    assert.match(prompt, /- Hero matches/);
    assert.equal(prompt.includes('{{'), false);
  });

  it('fills the planning prompt and keeps it read only', () => {
    const prompt = planPrompt(read('../prompts/plan-milestone.md'), work);
    assert.match(prompt, /\*\*Launch\*\*/);
    assert.match(prompt, /Read only/);
    assert.match(prompt, /3 to 10 tasks/);
    assert.equal(prompt.includes('{{'), false);
  });
});

describe('repository', () => {
  it('reads owner/name from a remote and only claims for the checkout it is in', () => {
    assert.equal(repoFromRemote('https://github.com/WarehausCollective/warehaus.git'), 'warehauscollective/warehaus');
    assert.equal(repoFromRemote('git@github.com:warehauscollective/warehaus.git'), 'warehauscollective/warehaus');
    assert.equal(repoFromRemote('https://gitlab.com/a/b.git'), null);
    assert.equal(repoFromRemote(''), null);
    const cli = read('./cli.mjs');
    assert.match(cli, /!parsed\.options\.repos\.includes\(origin\)/);
    assert.match(cli, /repos: \[origin\]/);
    assert.match(cli, /repos: config\.repos/);
  });
});

describe('pull request', () => {
  it('names the Portal milestone and says merging does not deploy', () => {
    const body = pullRequestBody({
      milestone: { name: 'Launch', objective: 'Ship the page.', goals: ['Hero matches'], branch: 'milestone/launch' },
    });
    assert.match(body, /Portal milestone: \*\*Launch\*\*/);
    assert.match(body, /- Hero matches/);
    assert.match(body, /Merging does not deploy/);
    const cli = read('./cli.mjs');
    // Opened against main, never merged or closed by the runner.
    assert.match(cli, /'pr', 'create', '--base', 'main', '--head', branch/);
    assert.equal(/'pr', 'merge'|'pr', 'close'|--admin|--force/.test(cli), false);
  });
});

describe('plan file', () => {
  it('reads 3 to 10 tasks', () => {
    const plan = parsePlan(JSON.stringify({ tasks: [{ title: ' One ', detail: 'a' }, 'Two', { title: 'Three' }] }));
    assert.deepEqual(plan, { ok: true, tasks: [{ title: 'One', detail: 'a' }, { title: 'Two' }, { title: 'Three' }] });
    assert.equal(parsePlan('not json').ok, false);
    assert.equal(parsePlan('null').ok, false);
    assert.equal(parsePlan(JSON.stringify({ tasks: ['a', 'b'] })).ok, false);
    assert.equal(parsePlan(JSON.stringify({ tasks: ['a', 'b', ''] })).ok, false);
  });
});

describe('task outcome', () => {
  it('is done only with a new commit', () => {
    assert.deepEqual(taskOutcome({ before: 'aaa', after: 'bbb', blockedReason: '' }), { status: 'done', commitSha: 'bbb' });
    assert.equal(taskOutcome({ before: 'aaa', after: 'aaa', blockedReason: '' }).status, 'failed');
    assert.deepEqual(taskOutcome({ before: 'aaa', after: 'aaa', blockedReason: ' needs a Figma frame \n' }), {
      status: 'blocked',
      reason: 'needs a Figma frame',
    });
  });

  it('waits one minute, then longer, up to five', () => {
    assert.equal(idleDelayMs(1), 60_000);
    assert.equal(idleDelayMs(2), 120_000);
    assert.equal(idleDelayMs(9), 300_000);
  });
});

describe('hook events', () => {
  it('keeps the tool and a file name, never the contents', () => {
    const event = hookEvent('PostToolUse', {
      tool_name: 'Edit',
      tool_input: { file_path: '/Users/x/repo/src/MilestoneReview.tsx', new_string: 'SECRET CONTENT' },
      tool_response: { output: 'lots of output' },
    });
    assert.deepEqual(event, { type: 'tool', summary: 'Edited MilestoneReview.tsx' });
    assert.equal(JSON.stringify(event).includes('SECRET'), false);
    assert.equal(JSON.stringify(event).includes('/Users/'), false);
  });

  it('masks a credential in a command and skips reads', () => {
    const event = hookEvent('PostToolUse', {
      tool_name: 'Bash',
      tool_input: { command: 'curl -H "Authorization: Bearer abcdefghijklmnop1234" https://example.com' },
    });
    assert.equal(event.summary.includes('abcdefghijklmnop1234'), false);
    assert.match(event.summary, /\[redacted\]/);
    assert.equal(hookEvent('PostToolUse', { tool_name: 'Read', tool_input: { file_path: '/x' } }), null);
    assert.deepEqual(hookEvent('Stop', {}), { type: 'stop', summary: 'Claude Code stopped' });
    assert.equal(hookEvent('Notification', {}), null);
  });
});

describe('no model credentials', () => {
  it('starts only the claude binary and holds no model key', () => {
    const cli = read('./cli.mjs');
    const hook = read('./hook.mjs');
    for (const source of [cli, hook, read('./lib.mjs')]) {
      assert.equal(/ANTHROPIC_API_KEY|CLAUDE_CODE_OAUTH|api\.anthropic\.com|@anthropic-ai\/sdk/.test(source), false);
    }
    assert.match(cli, /spawn\('claude'/);
    assert.equal((cli.match(/spawn\('/g) ?? []).length, 1);
    // The raw hook payload is never posted.
    assert.match(hook, /summary: event\.summary/);
    assert.equal(hook.includes('payload,'), false);
  });
});
