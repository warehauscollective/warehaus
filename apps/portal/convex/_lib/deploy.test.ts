import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  DEPLOY_COMMIT_LIMIT,
  DEPLOY_RUN_PATH,
  DEPLOY_TARGETS,
  applyDeployReport,
  cleanCommitSha,
  deployChipCopy,
  deployDialogCopy,
  deployFailureLine,
  deployFixture,
  deployFixtureState,
  deployMark,
  deployReportUrl,
  deployRunActive,
  deployTargetFor,
  mainIsAhead,
  mergedDayLabel,
  pullNumberFromTitle,
  readCompare,
  shortSha,
} from './deploy';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('deploy target', () => {
  it('only the Warehaus Portal repository has a deploy set up', () => {
    assert.equal(deployTargetFor('warehauscollective/warehaus')?.workflow, 'portal-deploy.yml');
    assert.equal(deployTargetFor(' WarehausCollective/Warehaus ')?.repo, 'warehauscollective/warehaus');
    assert.equal(deployTargetFor('warehauscollective/other'), null);
    assert.equal(deployTargetFor(undefined), null);
    assert.equal(deployTargetFor(''), null);
  });

  it('every baseline is a full commit sha', () => {
    for (const target of DEPLOY_TARGETS) assert.equal(cleanCommitSha(target.baselineCommit), target.baselineCommit);
  });

  it('the workflow file the target names exists and reports to the deploy route', () => {
    for (const target of DEPLOY_TARGETS) {
      const workflow = read(`../../../../.github/workflows/${target.workflow}`);
      assert.match(workflow, /workflow_dispatch/);
      assert.ok(workflow.includes(DEPLOY_RUN_PATH));
    }
  });
});

describe('commit reading', () => {
  it('reads the pull request from a squash title or a merge commit', () => {
    assert.equal(pullNumberFromTitle('Add filters in the project list (Portal milestone: Add filters) (#212)'), 212);
    assert.equal(pullNumberFromTitle('Merge pull request #220 from warehauscollective/milestone/building-indicator'), 220);
    assert.equal(pullNumberFromTitle('Docs: fix a typo'), null);
    assert.equal(pullNumberFromTitle('Mentions (#12) in the middle'), null);
  });

  it('accepts only a full lower-case sha', () => {
    assert.equal(cleanCommitSha(A.toUpperCase()), A);
    assert.equal(cleanCommitSha('abc123'), null);
    assert.equal(cleanCommitSha(null), null);
    assert.equal(shortSha(A), 'aaaaaaa');
  });

  it('reads a compare into commits with their pull requests', () => {
    const compare = readCompare({
      total_commits: 2,
      commits: [
        { sha: A, commit: { message: 'Milestone tasks as a board (#181)\n\nbody' } },
        { sha: B, commit: { message: 'Docs: a loose commit' } },
        { sha: 'nope', commit: { message: 'ignored' } },
      ],
    });
    assert.deepEqual(compare, {
      total: 2,
      commits: [
        { sha: A, title: 'Milestone tasks as a board (#181)', pr: 181 },
        { sha: B, title: 'Docs: a loose commit' },
      ],
    });
  });

  it('keeps the newest commits and the real total when the list is long', () => {
    const commits = Array.from({ length: DEPLOY_COMMIT_LIMIT + 5 }, (_, index) => ({
      sha: index.toString(16).padStart(40, '0'),
      commit: { message: `Commit ${index}` },
    }));
    const compare = readCompare({ total_commits: 300, commits });
    assert.equal(compare?.total, 300);
    assert.equal(compare?.commits.length, DEPLOY_COMMIT_LIMIT);
    assert.equal(compare?.commits[compare.commits.length - 1]?.title, `Commit ${DEPLOY_COMMIT_LIMIT + 4}`);
  });

  it('refuses a body that is not a compare', () => {
    assert.equal(readCompare(null), null);
    assert.equal(readCompare({ message: 'Not Found' }), null);
  });

  it('main is ahead only when it holds commits past the deployed one', () => {
    assert.equal(mainIsAhead(null, A), false);
    assert.equal(mainIsAhead({ sha: A, total: 0, commits: [], checkedAt: 1 }, A), false);
    assert.equal(mainIsAhead({ sha: B, total: 1, commits: [{ sha: B, title: 't' }], checkedAt: 1 }, A), true);
  });
});

describe('deploy mark', () => {
  it('marks only a Shipped milestone with a recorded merge', () => {
    assert.equal(deployMark({ status: 'Shipped', mergedAt: 1 }), 'not-deployed');
    assert.equal(deployMark({ status: 'Shipped', mergedAt: 1, deployFinishedAt: 2 }), 'deployed');
    assert.equal(deployMark({ status: 'Shipped' }), 'none');
    assert.equal(deployMark({ status: 'Ready to Ship', mergedAt: 1 }), 'none');
  });
});

describe('deploy reports', () => {
  it('moves a run forward one step at a time', () => {
    const started = applyDeployReport({ status: 'starting', step: 'dispatch' }, { event: 'started' });
    assert.deepEqual(started, { changed: true, next: { status: 'running', step: 'convex' } });
    const convex = applyDeployReport({ status: 'running', step: 'convex' }, { event: 'convex_ok' });
    assert.deepEqual(convex, { changed: true, next: { status: 'running', step: 'vercel', convexDone: true } });
    const done = applyDeployReport({ status: 'running', step: 'vercel', convexDone: true }, { event: 'vercel_ok' });
    assert.deepEqual(done, { changed: true, next: { status: 'done', convexDone: true } });
  });

  it('a repeated or late report changes nothing', () => {
    assert.deepEqual(applyDeployReport({ status: 'running', step: 'vercel', convexDone: true }, { event: 'started' }), { changed: false });
    assert.deepEqual(applyDeployReport({ status: 'running', step: 'vercel', convexDone: true }, { event: 'convex_ok' }), { changed: false });
    assert.deepEqual(applyDeployReport({ status: 'done' }, { event: 'failed', step: 'vercel' }), { changed: false });
    assert.deepEqual(applyDeployReport({ status: 'failed', step: 'convex' }, { event: 'vercel_ok' }), { changed: false });
  });

  it('a failure keeps the step it named and whether Convex already deployed', () => {
    assert.deepEqual(applyDeployReport({ status: 'running', step: 'vercel', convexDone: true }, { event: 'failed', step: 'vercel' }), {
      changed: true,
      next: { status: 'failed', step: 'vercel', convexDone: true },
    });
    assert.deepEqual(applyDeployReport({ status: 'running', step: 'convex' }, { event: 'failed' }), {
      changed: true,
      next: { status: 'failed', step: 'convex' },
    });
  });

  it('says what each failure left in production', () => {
    assert.match(deployFailureLine('vercel', true), /Convex deployed, then Vercel failed/);
    assert.match(deployFailureLine('convex', false), /Nothing changed in production/);
    assert.match(deployFailureLine('dispatch', false), /did not start/);
    assert.match(deployFailureLine(undefined, false), /did not start/);
  });

  it('only starting and running runs block another deploy', () => {
    assert.equal(deployRunActive('starting'), true);
    assert.equal(deployRunActive('running'), true);
    assert.equal(deployRunActive('failed'), false);
    assert.equal(deployRunActive('done'), false);
  });

  it('builds the report address from the Convex site url', () => {
    assert.equal(deployReportUrl('https://unique-turtle-383.convex.site/'), `https://unique-turtle-383.convex.site${DEPLOY_RUN_PATH}`);
  });
});

describe('deploys module', () => {
  const source = read('../deploys.ts');

  it('only Peter starts or retries a deploy', () => {
    for (const name of ['start', 'retry']) {
      const body = source.slice(source.indexOf(`export const ${name} = adminMutation`));
      assert.match(body.slice(0, 400), /if \(!isPeter\(ctx\.identity\)\) return \{ ok: false, error: DEPLOY_ONLY_PETER \}/);
    }
  });

  it('never runs a deploy command itself', () => {
    assert.doesNotMatch(source, /convex deploy|vercel deploy|--prod/);
  });

  it('refuses a run when main moved after the confirm list was made', () => {
    assert.match(source, /if \(pending\.sha !== cleanCommitSha\(args\.sha\)\) return \{ ok: false, error: DEPLOY_STALE \}/);
  });
});


describe('counter and button', () => {
  it('shows the count and the button to Peter', () => {
    assert.deepEqual(deployChipCopy(deployFixture('ready')), {
      state: 'ready',
      label: '2 to deploy',
      button: { label: 'Deploy to main', disabled: false },
    });
  });

  it('shows other staff the counter only', () => {
    assert.deepEqual(deployChipCopy(deployFixture('ready-staff')), { state: 'ready', label: '2 to deploy', button: null });
  });

  it('reads 0 to deploy and keeps the button when only loose commits wait', () => {
    assert.deepEqual(deployChipCopy(deployFixture('loose')), {
      state: 'ready',
      label: '0 to deploy',
      button: { label: 'Deploy to main', disabled: false },
    });
  });

  it('hides when nothing waits, and on a project with no deploy set up', () => {
    const idle = { ...deployFixture('ready')!, waiting: 0, ahead: false, sha: null, milestones: [], loose: [], commitTotal: 0 };
    assert.equal(deployChipCopy(idle), null);
    assert.equal(deployChipCopy(null), null);
    assert.equal(deployChipCopy(deployFixture('none')), null);
  });

  it('hides the button until the secrets are set, and until main has been compared', () => {
    assert.equal(deployChipCopy({ ...deployFixture('ready')!, setUp: false })?.button, null);
    assert.equal(deployChipCopy({ ...deployFixture('ready')!, sha: null })?.button, null);
  });

  it('shows a run in hand, then a failure with Retry', () => {
    assert.deepEqual(deployChipCopy(deployFixture('deploying')), {
      state: 'deploying',
      label: 'Deploying…',
      button: { label: 'Deploying…', disabled: true },
    });
    assert.deepEqual(deployChipCopy(deployFixture('failed')), {
      state: 'failed',
      label: 'Deploy failed',
      button: { label: 'Retry', disabled: false },
    });
  });

  it('falls back to the ready fixture for an unknown state', () => {
    assert.equal(deployFixtureState('nope'), 'ready');
    assert.equal(deployFixtureState('failed'), 'failed');
  });
});

describe('dialog copy', () => {
  it('lists each milestone, the loose commits and what deploys', () => {
    const copy = deployDialogCopy(deployFixture('ready')!, false);
    assert.equal(copy.state, 'confirm');
    assert.equal(copy.title, 'Deploy to main?');
    assert.equal(copy.lead, '2 milestones go to production. This deploys everything merged to main since the last deploy.');
    assert.deepEqual(copy.rows, [
      { label: 'MILESTONE', value: 'Add filters in the project list · merged Nov 27' },
      { label: 'MILESTONE', value: 'Iconsax icons across the Portal · merged Nov 27' },
      { label: 'ALSO GOES OUT', value: '2 commits on main with no milestone, since 37c0fcf' },
      { label: 'DEPLOYS', value: 'Convex, then Vercel, from one main commit' },
    ]);
    assert.equal(copy.note, 'Deploys main as it is now. Anything merged during the run waits for the next deploy.');
    assert.deepEqual([copy.cancel, copy.primary], ['Cancel', { label: 'Deploy to main', disabled: false }]);
  });

  it('uses the shorter lines on the 390 sheet', () => {
    const copy = deployDialogCopy(deployFixture('ready')!, true);
    assert.equal(copy.lead, '2 milestones go to production.');
    assert.deepEqual(copy.rows.map((row) => row.value), [
      'Add filters in the project list',
      'Iconsax icons across the Portal',
      '2 commits since 37c0fcf',
      'Convex, then Vercel, one commit',
    ]);
  });

  it('says so when no milestone waits', () => {
    const copy = deployDialogCopy(deployFixture('loose')!, false);
    assert.equal(copy.lead, 'No milestone is waiting. This deploys the commits on main since the last deploy.');
    assert.deepEqual(copy.rows.map((row) => row.label), ['ALSO GOES OUT', 'DEPLOYS']);
  });

  it('uses the singular for one milestone and one commit', () => {
    const one = { ...deployFixture('ready')!, milestones: deployFixture('ready')!.milestones.slice(0, 1), commitTotal: 2 };
    const copy = deployDialogCopy(one, false);
    assert.match(copy.lead, /^1 milestone goes to production/);
    assert.equal(copy.rows[1]?.value, '1 commit on main with no milestone, since 37c0fcf');
  });

  it('shows the steps while a run is going', () => {
    const copy = deployDialogCopy(deployFixture('deploying')!, false);
    assert.equal(copy.title, 'Deploying to main');
    assert.deepEqual(copy.rows, [
      { label: 'CONVEX', value: 'Deployed' },
      { label: 'VERCEL', value: 'Building…' },
    ]);
    assert.deepEqual([copy.cancel, copy.primary], ['Close', { label: 'Deploying…', disabled: true }]);
  });

  it('links the workflow log on the step that failed and offers Retry', () => {
    const copy = deployDialogCopy(deployFixture('failed')!, false);
    assert.equal(copy.title, 'Deploy failed');
    assert.match(copy.lead, /Convex deployed, then Vercel failed/);
    assert.deepEqual(copy.rows, [
      { label: 'CONVEX', value: 'Deployed' },
      { label: 'VERCEL', value: 'Failed · open the workflow log', href: 'https://github.com/warehauscollective/warehaus/actions/runs/1' },
    ]);
    assert.equal(copy.note, 'Retry runs the deploy again from the same commit, 37c0fcf.');
    assert.equal(copy.primary.label, 'Retry');
  });

  it('formats the merge day in UTC', () => {
    assert.equal(mergedDayLabel(Date.UTC(2026, 10, 27, 23, 59)), 'Nov 27');
  });
});

describe('project page wiring', () => {
  it('sits between the runner chip and New milestone', () => {
    const roadmap = read('../../src/components/projects/ProjectRoadmap.tsx');
    const runner = roadmap.indexOf('<RunnerHealth');
    const deploy = roadmap.indexOf('<DeployToMain');
    const create = roadmap.indexOf('New milestone</MilestoneListButton>', runner);
    assert.ok(runner > 0 && runner < deploy && deploy < create);
  });

  it('opens the dialog for Peter only and never queries for a client', () => {
    const component = read('../../src/components/projects/DeployToMain.tsx');
    assert.match(component, /open && view\.isPeter \?/);
    assert.match(component, /const querying = staff && live && !fixtures;/);
    assert.match(component, /if \(!staff\) return null;/);
  });

  it('the staff roadmap carries the mark and clients do not', () => {
    const milestones = read('../milestones.ts');
    assert.match(milestones, /\.\.\.\(audience === 'staff' \? roadmapDeployMark\(milestone\) : \{\}\)/);
  });
});
