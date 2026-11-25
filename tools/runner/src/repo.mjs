// Git and GitHub steps for a milestone branch: create it from the default
// branch, push it, and keep its one pull request. Every program is started
// through `exec`, so a test can run real git against a throwaway repository
// and stand in for `gh`. Nothing here talks to the Portal or to a model.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { cloneFailedReason, clonePath, cloneRepoName, cloneWorktreePath, defaultBranchName, isMilestoneBranch, pullRequestBody, repoFromRemote, worktreeName } from './lib.mjs';

/**
 * @param {{ exec?: typeof spawnSync, say?: (message: string) => void }} [options]
 *   `exec` has the shape of `spawnSync(program, args, options)`.
 */
export function repoTools({ exec = spawnSync, say = () => {} } = {}) {
  function git(cwd, args) {
    const result = exec('git', args, { cwd, encoding: 'utf8' });
    return { ok: result.status === 0, out: (result.stdout ?? '').trim(), err: (result.stderr ?? '').trim() };
  }

  function gh(cwd, args) {
    const result = exec('gh', args, { cwd, encoding: 'utf8' });
    return { ok: result.status === 0, out: (result.stdout ?? '').trim(), err: (result.stderr ?? '').trim() };
  }

  /** The repository's default branch: origin/HEAD, else what GitHub says, else main. */
  function defaultBranch(repo) {
    const ref = git(repo, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
    let fromGh = '';
    if (!ref.ok) {
      const viewed = gh(repo, ['repo', 'view', '--json', 'defaultBranchRef', '--jq', '.defaultBranchRef.name']);
      if (viewed.ok) fromGh = viewed.out;
    }
    return defaultBranchName(ref.ok ? ref.out : '', fromGh);
  }

  /**
   * The runner's own clone of `owner/name` under <home>/repos. An existing
   * clone is used only when its origin is that repository. Throws an error
   * carrying `reason` when the repository cannot be cloned or the folder holds
   * another one, so the run is blocked for Peter instead of retried.
   */
  function ensureClone(repo, home) {
    const name = cloneRepoName(repo);
    const fail = (detail) => Object.assign(new Error(detail ? `${cloneFailedReason(repo)}: ${detail}` : cloneFailedReason(repo)), { reason: cloneFailedReason(repo) });
    if (!name) throw fail('');
    const dir = clonePath(home, name);
    if (existsSync(join(dir, '.git'))) {
      const origin = repoFromRemote(git(dir, ['remote', 'get-url', 'origin']).out);
      if (origin !== name) throw Object.assign(new Error(`${dir} is ${origin ?? 'not a GitHub clone'}, not ${name}.`), { reason: `The runner's clone of ${name} points somewhere else` });
      git(dir, ['fetch', 'origin', '--quiet']);
      return dir;
    }
    mkdirSync(dirname(dir), { recursive: true });
    const cloned = git(dirname(dir), ['clone', '--quiet', `https://github.com/${name}.git`, dir]);
    if (!cloned.ok) throw fail(cloned.err.split('\n')[0] ?? '');
    return dir;
  }

  /**
   * A worktree for the milestone branch, created from the default branch when
   * the branch is new. For the runner's own clone (<home>/repos/<owner>/<name>)
   * it goes in <home>/worktrees/<owner>/<name>; for any other checkout, beside it.
   */
  function ensureWorktree(repo, branch) {
    if (!isMilestoneBranch(branch)) throw new Error(`Refusing branch ${branch}. Only milestone/<slug> is used.`);
    const owner = dirname(repo);
    const dir =
      basename(dirname(owner)) === 'repos'
        ? cloneWorktreePath(dirname(dirname(owner)), `${basename(owner)}/${basename(repo)}`, branch)
        : resolve(repo, '..', 'warehaus-runner', worktreeName(branch));
    if (existsSync(join(dir, '.git'))) {
      const current = git(dir, ['branch', '--show-current']);
      if (current.out !== branch) throw new Error(`${dir} is on ${current.out || 'no branch'}, not ${branch}.`);
      return dir;
    }
    mkdirSync(dirname(dir), { recursive: true });
    git(repo, ['fetch', 'origin', '--quiet']);
    const remote = git(repo, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`]);
    const local = git(repo, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]);
    const added = local.ok
      ? git(repo, ['worktree', 'add', dir, branch])
      : remote.ok
        ? git(repo, ['worktree', 'add', '-b', branch, dir, `origin/${branch}`])
        : git(repo, ['worktree', 'add', '-b', branch, dir, `origin/${defaultBranch(repo)}`]);
    if (!added.ok) throw new Error(`Could not create the worktree: ${added.err}`);
    return dir;
  }

  /**
   * One pull request per milestone, from the milestone branch into the default
   * branch. Finds the open one, or opens it. Returns its URL, or null when
   * `gh` is missing or the call fails: the task still completes, and the
   * GitHub webhook stores the link when the pull request appears.
   */
  function ensurePullRequest(dir, work) {
    const branch = work.milestone.branch;
    const found = gh(dir, ['pr', 'view', branch, '--json', 'url,state']);
    if (found.ok) {
      try {
        const parsed = JSON.parse(found.out);
        if (parsed.state === 'OPEN' && typeof parsed.url === 'string') return parsed.url;
      } catch {
        // Fall through and open one.
      }
    }
    const created = gh(dir, ['pr', 'create', '--base', defaultBranch(dir), '--head', branch, '--title', work.milestone.name, '--body', pullRequestBody(work)]);
    if (!created.ok) {
      say(`No pull request yet: ${created.err.split('\n')[0] || 'gh failed'}`);
      return null;
    }
    const url = created.out.split('\n').pop() ?? '';
    return /^https:\/\/github\.com\//.test(url) ? url : null;
  }

  function markReadyForReview(dir, branch) {
    const labeled = gh(dir, ['pr', 'edit', branch, '--add-label', 'ready-for-review']);
    if (!labeled.ok) say(`Review label not added: ${labeled.err.split('\n')[0] || 'gh failed'}`);
  }

  function milestoneBranchOnOrigin(repo, branch) {
    git(repo, ['fetch', 'origin', branch, '--quiet']);
    return git(repo, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`]).ok;
  }

  /** Creates milestone/<slug> from the default branch and pushes it, when origin does not have it yet. */
  function publishMilestoneBranch(repo, branch) {
    if (!isMilestoneBranch(branch)) return { ok: false, error: 'The milestone branch is not a milestone branch' };
    if (milestoneBranchOnOrigin(repo, branch)) return { ok: true };
    let dir;
    try {
      dir = ensureWorktree(repo, branch);
    } catch {
      return { ok: false, error: 'The milestone branch could not be created' };
    }
    const pushed = git(dir, ['push', '-u', 'origin', branch]);
    if (!pushed.ok || !milestoneBranchOnOrigin(repo, branch)) return { ok: false, error: 'The push to origin failed' };
    return { ok: true };
  }

  return { git, gh, defaultBranch, ensureClone, ensureWorktree, ensurePullRequest, markReadyForReview, milestoneBranchOnOrigin, publishMilestoneBranch };
}
