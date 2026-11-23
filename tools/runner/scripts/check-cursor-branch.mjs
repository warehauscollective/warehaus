#!/usr/bin/env node
// Manual check of the Cursor build's branch step against the real repository.
// Run by a person, on purpose. CI never runs this: the same steps are covered
// there by src/cursorFlow.test.mjs with the Cursor API mocked.
//
// It uses a throwaway branch, milestone/zz-cursor-check-<stamp>, and the same
// code the runner uses:
//
//   1. create the branch from the default branch and push it
//   2. with --launch: start one real Cursor agent on it, wait, and check that
//      its commit carries the Portal-Task trailer
//   3. open a draft pull request into the default branch
//   4. with --cleanup: close that pull request and delete the branch
//
// It never merges, never deploys, never touches the Portal or Convex, and
// never prints the Cursor key. See README.md, "Check the Cursor branch step".

import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { cursorBuildPrompt, cursorCreateBody, cursorRequest } from '../src/drivers/cursor.mjs';
import { mapCursorCommits, parseGitLog, repoFromRemote } from '../src/lib.mjs';
import { repoTools } from '../src/repo.mjs';

export const CHECK_PREFIX = 'milestone/zz-cursor-check-';
export const CHECK_TASK_ID = 'check:1';

export const CHECK_USAGE = `Usage: node tools/runner/scripts/check-cursor-branch.mjs [options]

  --dir <path>      Checkout of the repository. Defaults to the current directory.
  --branch <name>   Reuse a throwaway branch from an earlier run. Must start with
                    ${CHECK_PREFIX}
  --launch          Start one real Cursor agent on the branch. Needs CURSOR_API_KEY
                    in this shell. Costs one agent run. Without it, no Cursor call is made.
  --no-pr           Skip the draft pull request.
  --cleanup         Afterwards, close the pull request and delete the throwaway
                    branch on origin and its local worktree.
  --wait <minutes>  How long to wait for the agent with --launch. Default 15.
  --help            Print this.`;

/** `zz-cursor-check-20261122-2301` from a date, in UTC. */
export function checkBranchName(now) {
  const iso = new Date(now).toISOString();
  return `${CHECK_PREFIX}${iso.slice(0, 10).replaceAll('-', '')}-${iso.slice(11, 16).replace(':', '')}`;
}

/** Only a throwaway check branch is ever created, pushed or deleted here. */
export function isCheckBranch(branch) {
  return typeof branch === 'string' && /^milestone\/zz-cursor-check-[a-z0-9][a-z0-9-]{0,30}$/.test(branch);
}

export function parseCheckArgs(argv) {
  const options = { dir: '', branch: '', launch: false, pr: true, cleanup: false, waitMinutes: 15, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--help' || flag === '-h') options.help = true;
    else if (flag === '--launch') options.launch = true;
    else if (flag === '--no-pr') options.pr = false;
    else if (flag === '--cleanup') options.cleanup = true;
    else if (flag === '--dir' || flag === '--branch' || flag === '--wait') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) return { ok: false, error: `${flag} needs a value.\n\n${CHECK_USAGE}` };
      if (flag === '--dir') options.dir = value;
      if (flag === '--branch') options.branch = value;
      if (flag === '--wait') options.waitMinutes = Number(value);
      index += 1;
    } else return { ok: false, error: `Unknown option ${flag}.\n\n${CHECK_USAGE}` };
  }
  if (options.branch && !isCheckBranch(options.branch)) {
    return { ok: false, error: `--branch must start with ${CHECK_PREFIX}. This script only touches throwaway branches.` };
  }
  if (!Number.isFinite(options.waitMinutes) || options.waitMinutes < 1 || options.waitMinutes > 120) {
    return { ok: false, error: '--wait must be 1 to 120 minutes.' };
  }
  return { ok: true, options };
}

function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

/**
 * The check itself. Everything it reaches is passed in, so the test runs it
 * against a throwaway local repository with `gh` and Cursor stood in.
 * Returns the lines it would print and whether every step passed.
 */
export async function runCheck({ options, repo, tools, key = '', fetchImpl, repoName, now = Date.now(), wait = sleep, say = () => {} }) {
  const steps = [];
  const note = (ok, text) => {
    steps.push({ ok, text });
    say(`${ok ? 'ok  ' : 'FAIL'} ${text}`);
    return ok;
  };
  const finish = () => ({ ok: steps.every((step) => step.ok), steps, branch });
  const branch = options.branch || checkBranchName(now);
  if (!isCheckBranch(branch)) {
    note(false, `Refusing ${branch}: not a throwaway check branch`);
    return finish();
  }
  // `repoName` is for the test, whose origin is a local folder.
  const origin = repoName ?? repoFromRemote(tools.git(repo, ['remote', 'get-url', 'origin']).out);
  const base = tools.defaultBranch(repo);
  say(`Repository ${origin ?? '(not a GitHub remote)'} · base ${base} · branch ${branch}`);

  // 1. Branch from the default branch, pushed.
  const baseSha = tools.git(repo, ['rev-parse', `origin/${base}`]).out;
  const existed = tools.milestoneBranchOnOrigin(repo, branch);
  const published = tools.publishMilestoneBranch(repo, branch);
  if (!note(published.ok, published.ok ? `Branch is on origin${existed ? ' (already there)' : ''}` : `Publish failed: ${published.error}`)) return finish();
  const tip = tools.git(repo, ['rev-parse', `origin/${branch}`]).out;
  if (!existed) note(tip === baseSha, `Branch starts at ${base} (${baseSha.slice(0, 7)})`);

  // 2. One real Cursor agent, only when asked.
  if (options.launch) {
    if (!key) {
      note(false, 'CURSOR_API_KEY is not set in this shell');
    } else if (!origin) {
      note(false, 'origin is not a GitHub repository, so Cursor cannot work in it');
    } else {
      const work = {
        repo: origin,
        milestone: { branch },
        tasks: [
          {
            id: CHECK_TASK_ID,
            title: 'Throwaway check',
            detail: `Add the file .runner-check/${branch.slice(CHECK_PREFIX.length)}.txt containing the single word ok. Change nothing else.`,
          },
        ],
      };
      const created = await cursorRequest({
        key,
        path: '',
        method: 'POST',
        body: cursorCreateBody({ repo: origin, branch, prompt: cursorBuildPrompt('', work) }),
        fetchImpl,
      });
      if (note(created.ok, created.ok ? `Cursor agent launched${created.agent.url ? ` · ${created.agent.url}` : ''}` : `Launch failed: ${created.error}`)) {
        let agent = created.agent;
        const deadline = now + options.waitMinutes * 60_000;
        let clock = now;
        while (agent.state === 'running' && clock < deadline) {
          await wait(30_000);
          clock += 30_000;
          const looked = await cursorRequest({ key, path: `/${encodeURIComponent(created.agent.id)}`, method: 'GET', fetchImpl });
          if (!looked.ok) {
            note(false, `Status read failed: ${looked.error}`);
            break;
          }
          agent = looked.agent;
        }
        if (note(agent.state === 'finished', `Agent ${agent.state === 'running' ? `still running after ${options.waitMinutes} minutes` : agent.state}`)) {
          tools.git(repo, ['fetch', 'origin', branch, '--quiet']);
          const log = tools.git(repo, ['log', `origin/${branch}`, '--format=%H%x1f%B%x1e']);
          const done = mapCursorCommits(parseGitLog(log.out), work.tasks);
          note(done.length === 1, done.length === 1 ? `Commit ${done[0].commitSha.slice(0, 7)} carries Portal-Task: ${CHECK_TASK_ID}` : 'No commit on the branch carries the Portal-Task trailer');
          note(!agent.prUrl, agent.prUrl ? 'Cursor opened its own pull request, which the runner does not want' : 'Cursor opened no pull request');
        }
      }
    }
  } else {
    say('skip Cursor agent (no --launch). No Cursor call was made.');
  }

  // 3. A draft pull request into the default branch. GitHub refuses one with no commits ahead.
  let prUrl = null;
  if (options.pr) {
    const ahead = Number(tools.git(repo, ['rev-list', '--count', `origin/${base}..origin/${branch}`]).out || '0');
    if (ahead === 0) {
      say('skip pull request: the branch has no commit ahead of the base. Run with --launch, or push a commit to it.');
    } else {
      const dir = tools.ensureWorktree(repo, branch);
      const opened = tools.gh(dir, [
        'pr', 'create', '--draft', '--base', base, '--head', branch,
        '--title', `[throwaway] Cursor branch check ${branch.slice(CHECK_PREFIX.length)}`,
        '--body', 'Throwaway pull request from tools/runner/scripts/check-cursor-branch.mjs. Do not merge. Safe to close.',
      ]);
      prUrl = opened.ok ? (opened.out.split('\n').pop() ?? null) : null;
      note(opened.ok, opened.ok ? `Draft pull request into ${base} · ${prUrl}` : `Pull request failed: ${opened.err.split('\n')[0] || 'gh failed'}`);
    }
  }

  // 4. Clean up, only when asked, and only this throwaway branch.
  if (options.cleanup) {
    if (prUrl) {
      const closed = tools.gh(repo, ['pr', 'close', branch, '--comment', 'Throwaway check finished.']);
      note(closed.ok, closed.ok ? 'Pull request closed' : `Close failed: ${closed.err.split('\n')[0] || 'gh failed'}`);
    }
    const dir = resolve(repo, '..', 'warehaus-runner', branch.replace(/[^a-zA-Z0-9._-]+/g, '-'));
    tools.git(repo, ['worktree', 'remove', '--force', dir]);
    rmSync(dir, { recursive: true, force: true });
    tools.git(repo, ['worktree', 'prune']);
    tools.git(repo, ['branch', '-D', branch]);
    const deleted = tools.git(repo, ['push', 'origin', '--delete', branch]);
    note(deleted.ok, deleted.ok ? 'Throwaway branch deleted on origin' : `Branch delete failed: ${deleted.err.split('\n')[0]}`);
  } else {
    say(`Left in place. Clean up later with: node tools/runner/scripts/check-cursor-branch.mjs --branch ${branch} --no-pr --cleanup`);
  }
  return finish();
}

async function main() {
  const parsed = parseCheckArgs(process.argv.slice(2));
  if (!parsed.ok) {
    process.stderr.write(`${parsed.error}\n`);
    process.exit(2);
  }
  if (parsed.options.help) {
    process.stdout.write(`${CHECK_USAGE}\n`);
    return;
  }
  const say = (message) => process.stdout.write(`[check] ${message}\n`);
  const tools = repoTools({ say });
  const repo = resolve(parsed.options.dir || process.cwd());
  if (!tools.git(repo, ['rev-parse', '--show-toplevel']).ok) {
    process.stderr.write(`${repo} is not a git repository.\n`);
    process.exit(2);
  }
  const result = await runCheck({
    options: parsed.options,
    repo,
    tools,
    key: parsed.options.launch ? (process.env.CURSOR_API_KEY ?? '').trim() : '',
    say,
  });
  say(result.ok ? 'All steps passed.' : 'A step failed. See above.');
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}
