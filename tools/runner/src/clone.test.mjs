// The runner's own clones: one per repository under ~/warehaus-runner/repos,
// used only when its origin is that repository. Real git runs against a
// throwaway folder; the network clone is stood in for.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { cloneFailedReason, clonePath, cloneRepoName, cloneWorktreePath } from './lib.mjs';
import { repoTools } from './repo.mjs';

const home = mkdtempSync(join(tmpdir(), 'runner-home-'));
after(() => rmSync(home, { recursive: true, force: true }));

function gitInit(dir, origin) {
  mkdirSync(dir, { recursive: true });
  spawnSync('git', ['init', '--quiet'], { cwd: dir });
  if (origin) spawnSync('git', ['remote', 'add', 'origin', origin], { cwd: dir });
}

describe('runner clones', () => {
  it('puts each repository and its worktrees in the runner folder', () => {
    assert.equal(cloneRepoName('WarehausCollective/Warehaus'), 'warehauscollective/warehaus');
    for (const bad of ['', null, 'a', 'a/b/c', '../x', 'a/..', '/etc/passwd']) assert.equal(cloneRepoName(bad), null, String(bad));
    assert.equal(clonePath('/h', 'A/B'), '/h/repos/a/b');
    assert.equal(cloneWorktreePath('/h', 'a/b', 'milestone/runner-on-production'), '/h/worktrees/a/b/milestone-runner-on-production');
    assert.throws(() => clonePath('/h', '../x'));
    assert.equal(cloneFailedReason('A/B'), 'The runner could not clone a/b');
    assert.equal(cloneFailedReason(null), 'The project has no repository the runner can clone');
  });

  it('clones a repository it does not have yet from GitHub', () => {
    const calls = [];
    const exec = (program, args, options) => {
      calls.push([program, ...args]);
      if (args[0] === 'clone') {
        gitInit(args[3], `https://github.com/${'owner/new'}.git`);
        return { status: 0, stdout: '', stderr: '' };
      }
      return spawnSync(program, args, options);
    };
    const dir = repoTools({ exec }).ensureClone('Owner/New', home);
    assert.equal(dir, join(home, 'repos/owner/new'));
    assert.deepEqual(calls[0], ['git', 'clone', '--quiet', 'https://github.com/owner/new.git', dir]);
  });

  it('reuses a clone whose origin matches, and refuses one that points elsewhere', () => {
    const tools = repoTools();
    gitInit(join(home, 'repos/owner/same'), 'git@github.com:Owner/Same.git');
    assert.equal(tools.ensureClone('owner/same', home), join(home, 'repos/owner/same'));
    gitInit(join(home, 'repos/owner/other'), 'https://github.com/someone/else.git');
    assert.throws(() => tools.ensureClone('owner/other', home), (error) => error.reason === "The runner's clone of owner/other points somewhere else");
  });

  it('blocks with a reason Peter can act on when the clone fails or there is no repository', () => {
    const exec = (program, args) =>
      args[0] === 'clone' ? { status: 128, stdout: '', stderr: 'fatal: repository not found\nmore' } : { status: 1, stdout: '', stderr: '' };
    const tools = repoTools({ exec });
    assert.throws(() => tools.ensureClone('owner/missing', home), (error) => error.reason === 'The runner could not clone owner/missing' && /repository not found/.test(error.message));
    assert.throws(() => tools.ensureClone(undefined, home), (error) => error.reason === 'The project has no repository the runner can clone');
  });

  it('makes milestone worktrees for its own clone under worktrees/', () => {
    const calls = [];
    const exec = (program, args, options) => {
      calls.push(args);
      return args[0] === 'worktree' ? { status: 0, stdout: '', stderr: '' } : { status: 1, stdout: '', stderr: '' };
    };
    const dir = repoTools({ exec }).ensureWorktree(join(home, 'repos/owner/same'), 'milestone/some-work');
    assert.equal(dir, join(home, 'worktrees/owner/same/milestone-some-work'));
  });
});
