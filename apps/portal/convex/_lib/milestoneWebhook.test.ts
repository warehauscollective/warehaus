import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyInbound } from '../sync/inbound';
import { pullRequestUrl } from './agentRun';
import {
  decideGitHubWebhook,
  decideVercelWebhook,
  githubSignatureHeader,
  inboundRepoMatches,
  isMilestoneBranch,
  vercelBranchUrl,
  vercelSignatureHeader,
  type InboundPlan,
} from './inboundWebhook';
import { branchCandidate, uniqueMilestoneBranch } from './milestoneBranchStore';
import { memoryCtx, type MemoryCtx } from './memoryCtx.testkit';
import { seedMilestone, seedMilestoneWorld } from './seedRows.testkit';

const SECRET = 'webhook-secret-for-tests';
const SHA = 'a'.repeat(40);
const BRANCH = 'milestone/client-experience-launch';

type Applied = { ok: true; wrote: boolean; duplicate?: boolean; milestone?: boolean; shipped?: boolean };

function apply(t: MemoryCtx, plan: Extract<InboundPlan, { action: 'apply' }>): Promise<Applied> {
  return t.call<Applied>(applyInbound, {
    source: plan.source,
    ...(plan.deliveryId ? { deliveryId: plan.deliveryId } : {}),
    ...(plan.contentKey ? { contentKey: plan.contentKey } : {}),
    ...(plan.milestone ? { milestone: plan.milestone } : {}),
    items: plan.items,
  });
}

/**
 * A project and the milestone on BRANCH, Ready to Ship and approved unless
 * overridden. `agentRepo: null` leaves the project with no repository.
 */
function world(input: { milestone?: Record<string, unknown>; agentRepo?: string | null; doneTask?: boolean } = {}) {
  const t = memoryCtx();
  const agentRepo = input.agentRepo === undefined ? 'warehauscollective/warehaus' : input.agentRepo;
  const ids = seedMilestoneWorld(
    t,
    { name: 'Client experience launch', status: 'Ready to Ship', approval: 'approved', branch: BRANCH, ...input.milestone },
    agentRepo ? { agentRepo } : {},
  );
  const taskId = input.doneTask ? ids.task({ status: 'Done', isDone: true }) : null;
  const milestone = () => t.row(ids.milestoneId);
  return { t, ...ids, taskId, milestone };
}

function pullBody(input: { action: string; merged?: boolean; head?: string; base?: string; body?: string }) {
  return JSON.stringify({
    action: input.action,
    pull_request: {
      number: 140,
      title: 'Client experience launch',
      body: input.body ?? 'One pull request for the whole milestone.',
      merged: input.merged === true,
      head: { sha: SHA, ref: input.head ?? BRANCH },
      base: { ref: input.base ?? 'main' },
    },
    repository: { full_name: 'warehauscollective/warehaus', default_branch: 'main' },
  });
}

async function githubPlan(rawBody: string, delivery = 'delivery-milestone-1') {
  const decision = await decideGitHubWebhook({
    rawBody,
    signatureHeader: await githubSignatureHeader(rawBody, SECRET),
    eventHeader: 'pull_request',
    deliveryHeader: delivery,
    secret: SECRET,
  });
  assert.equal(decision.ok, true);
  if (!decision.ok) throw new Error('unsigned');
  return decision.plan;
}

describe('milestone branch on a pull request', () => {
  it('needs no Portal-Task line and carries the pull request', async () => {
    const plan = await githubPlan(pullBody({ action: 'opened' }));
    assert.equal(plan.action, 'apply');
    if (plan.action !== 'apply') return;
    assert.deepEqual(plan.items, []);
    assert.deepEqual(plan.milestone, {
      kind: 'pull',
      branch: BRANCH,
      repo: 'warehauscollective/warehaus',
      prUrl: 'https://github.com/warehauscollective/warehaus/pull/140',
      prNumber: 140,
      prTitle: 'Client experience launch',
      sha: SHA,
      merged: false,
    });
  });

  it('still ignores an ordinary branch with no Portal-Task line', async () => {
    const plan = await githubPlan(pullBody({ action: 'closed', merged: true, head: 'fix/typo' }));
    assert.deepEqual(plan, { action: 'ignore', reason: 'no_portal_task' });
  });

  it('counts a merge only when it lands on the default branch', async () => {
    const intoMain = await githubPlan(pullBody({ action: 'closed', merged: true }));
    const intoOther = await githubPlan(pullBody({ action: 'closed', merged: true, base: 'staging' }));
    const closed = await githubPlan(pullBody({ action: 'closed', merged: false }));
    assert.equal(intoMain.action === 'apply' && intoMain.milestone?.kind === 'pull' && intoMain.milestone.merged, true);
    assert.equal(intoOther.action === 'apply' && intoOther.milestone?.kind === 'pull' && intoOther.milestone.merged, false);
    assert.equal(closed.action === 'apply' && closed.milestone?.kind === 'pull' && closed.milestone.merged, false);
  });

  it('refuses a branch that only looks like a milestone branch', () => {
    assert.equal(isMilestoneBranch(BRANCH), true);
    for (const branch of ['milestone/', 'milestone/../main', 'Milestone/x', 'feature/milestone/x', 'milestone/x y', null]) {
      assert.equal(isMilestoneBranch(branch), false, String(branch));
    }
  });
});

describe('merge sets Shipped', () => {
  it('moves the milestone to Shipped once, and a retry changes nothing', async () => {
    const { t, milestone } = world({ doneTask: true });
    const plan = await githubPlan(pullBody({ action: 'closed', merged: true }));
    assert.equal(plan.action, 'apply');
    if (plan.action !== 'apply') return;

    const first = await apply(t, plan);
    assert.equal(first.wrote, true);
    assert.equal(first.shipped, true);
    assert.equal(milestone()?.status, 'Shipped');
    assert.equal(milestone()?.prUrl, 'https://github.com/warehauscollective/warehaus/pull/140');
    assert.equal(t.rows('activity').length, 1);
    assert.equal(t.rows('agentEvents').length, 1);

    // GitHub redelivers the same delivery id.
    const retry = await apply(t, plan);
    assert.equal(retry.duplicate, true);
    assert.equal(retry.wrote, false);
    // A new delivery id with the same content is the same snapshot.
    const replay = await apply(t, { ...plan, deliveryId: 'delivery-milestone-2' });
    assert.equal(replay.duplicate, true);
    assert.equal(t.rows('activity').length, 1);
    assert.equal(t.rows('agentEvents').length, 1);
  });

  it('writes nothing a second time even with no claim to stop it', async () => {
    const { t } = world({ doneTask: true });
    const plan = await githubPlan(pullBody({ action: 'closed', merged: true }));
    if (plan.action !== 'apply') throw new Error('expected apply');
    await apply(t, plan);
    // Drop both keys so only the stored values can stop a second write.
    const bare = { ...plan, deliveryId: undefined, contentKey: undefined };
    const again = await apply(t, bare);
    assert.equal(again.wrote, false);
    assert.equal(t.rows('activity').length, 1);
  });

  it('changes nothing for a merge on a branch no milestone owns', async () => {
    const { t, milestone } = world({ doneTask: true });
    const plan = await githubPlan(pullBody({ action: 'closed', merged: true, head: 'milestone/some-other-work' }));
    if (plan.action !== 'apply') throw new Error('expected apply');
    const result = await apply(t, plan);
    assert.equal(result.wrote, false);
    assert.equal(milestone()?.status, 'Ready to Ship');
    assert.equal(milestone()?.prUrl, undefined);
    assert.equal(t.rows('activity').length, 0);
    assert.equal(t.rows('syncEvents').length, 0);
  });

  it('stores the pull request on open and does not ship', async () => {
    const { t, milestone } = world({ milestone: { status: 'Building', approval: 'unreviewed' } });
    const plan = await githubPlan(pullBody({ action: 'opened' }));
    if (plan.action !== 'apply') throw new Error('expected apply');
    const result = await apply(t, plan);
    assert.equal(result.wrote, true);
    assert.equal(result.shipped, undefined);
    assert.equal(milestone()?.status, 'Building');
    assert.equal(milestone()?.previewPrNumber, 140);
    assert.equal(milestone()?.previewCommit, SHA);
    assert.equal(t.rows('activity').length, 0);
  });
});

describe('the repository has to match', () => {
  it('does not ship a milestone for a merge of the same branch name in another repository', async () => {
    const { t, milestone } = world({ agentRepo: 'someone/other-repo' });
    const plan = await githubPlan(pullBody({ action: 'closed', merged: true }));
    if (plan.action !== 'apply') throw new Error('expected apply');
    const result = await apply(t, plan);
    assert.equal(result.wrote, false);
    assert.equal(milestone()?.status, 'Ready to Ship');
    assert.equal(milestone()?.prUrl, undefined);
    assert.equal(t.rows('activity').length, 0);
    assert.equal(t.rows('syncEvents').length, 0);
  });

  it('ships when the repository matches, whatever the letter case', async () => {
    const { t, milestone } = world({ agentRepo: 'WarehausCollective/Warehaus', doneTask: true });
    const plan = await githubPlan(pullBody({ action: 'closed', merged: true }));
    if (plan.action !== 'apply') throw new Error('expected apply');
    const result = await apply(t, plan);
    assert.equal(result.shipped, true);
    assert.equal(milestone()?.status, 'Shipped');
  });

  it('does not write when the project has no repository set', async () => {
    const { t, milestone } = world({ agentRepo: null, doneTask: true });
    const plan = await githubPlan(pullBody({ action: 'closed', merged: true }));
    if (plan.action !== 'apply') throw new Error('expected apply');
    const result = await apply(t, plan);
    assert.equal(result.wrote, false);
    assert.equal(result.shipped, undefined);
    assert.equal(milestone()?.status, 'Ready to Ship');
    assert.equal(milestone()?.prUrl, undefined);
  });

  it('stores the pull request and does not ship when a subtask is still open', async () => {
    const { t, milestone, task, taskId } = world({ doneTask: true });
    task({ parentTaskId: taskId, status: 'To do', isDone: false });
    const plan = await githubPlan(pullBody({ action: 'closed', merged: true }));
    if (plan.action !== 'apply') throw new Error('expected apply');
    const result = await apply(t, plan);
    assert.equal(result.wrote, true);
    assert.equal(result.shipped, undefined);
    assert.equal(milestone()?.status, 'Ready to Ship');
    assert.equal(milestone()?.prUrl, 'https://github.com/warehauscollective/warehaus/pull/140');
    assert.equal(t.rows('activity').length, 0);
    assert.equal(t.rows('agentEvents').length, 0);
  });

  it('compares the two names and nothing else', () => {
    assert.equal(inboundRepoMatches('a/b', 'A/B'), true);
    assert.equal(inboundRepoMatches('a/b', 'a/c'), false);
    assert.equal(inboundRepoMatches('a/b', undefined), false);
    assert.equal(inboundRepoMatches(null, 'a/c'), false);
    assert.equal(inboundRepoMatches('', undefined), false);
  });
});

describe('Vercel preview on a milestone branch', () => {
  function vercelBody(type: string, branch: string) {
    return JSON.stringify({
      id: 'evt_milestone_1',
      type,
      payload: {
        project: { name: 'warehaus-portal' },
        deployment: {
          id: 'dpl_milestone_1',
          name: 'warehaus-portal',
          url: 'warehaus-portal-abc123-warehaus-collective.vercel.app',
          meta: { githubCommitSha: SHA, githubCommitRef: branch, githubOrg: 'warehauscollective', githubRepo: 'warehaus' },
        },
      },
    });
  }

  async function vercelPlan(rawBody: string) {
    const decision = await decideVercelWebhook({
      rawBody,
      signatureHeader: await vercelSignatureHeader(rawBody, SECRET),
      secret: SECRET,
    });
    if (!decision.ok) throw new Error('unsigned');
    return decision.plan;
  }

  it('uses the stable branch URL', () => {
    assert.equal(
      vercelBranchUrl('milestone/launch'),
      'https://warehaus-portal-git-milestone-launch-warehaus-collective.vercel.app',
    );
    // A host label holds 63 characters. Past that Vercel shortens the name with a hash,
    // so there is no URL to work out and the build's own URL is stored instead.
    assert.equal(vercelBranchUrl(BRANCH), null);
    assert.equal(vercelBranchUrl('main'), null);
  });

  it('stores the preview when a build of the branch succeeds, once', async () => {
    const { t, milestone } = world({ milestone: { status: 'Building', approval: 'unreviewed' } });
    const plan = await vercelPlan(vercelBody('deployment.succeeded', BRANCH));
    assert.equal(plan.action, 'apply');
    if (plan.action !== 'apply') return;
    assert.equal(plan.milestone?.kind, 'deploy');
    const first = await apply(t, plan);
    assert.equal(first.wrote, true);
    // This branch name is too long for a stable host, so the build's own URL is stored.
    assert.equal(milestone()?.previewUrl, 'https://warehaus-portal-abc123-warehaus-collective.vercel.app');
    assert.equal(milestone()?.previewCommit, SHA);
    const retry = await apply(t, plan);
    assert.equal(retry.duplicate, true);
    assert.equal(t.rows('agentEvents').length, 1);
  });

  it('ignores a build that is still running, and a build of another branch', async () => {
    assert.deepEqual(await vercelPlan(vercelBody('deployment.created', BRANCH)), {
      action: 'ignore',
      reason: 'no_portal_task',
    });
    assert.deepEqual(await vercelPlan(vercelBody('deployment.succeeded', 'fix/typo')), {
      action: 'ignore',
      reason: 'no_portal_task',
    });
  });

  it('adds no preview to an approved milestone', async () => {
    const { t, milestone } = world();
    const plan = await vercelPlan(vercelBody('deployment.succeeded', BRANCH));
    if (plan.action !== 'apply') throw new Error('expected apply');
    const result = await apply(t, plan);
    assert.equal(result.wrote, false);
    assert.equal(milestone()?.previewUrl, undefined);
    assert.equal(t.rows('agentEvents').length, 0);
  });
});

describe('branch names', () => {
  it('gives a second milestone with the same name its own branch', async () => {
    const t = memoryCtx();
    const { orgId, projectId } = seedMilestoneWorld(t, { name: 'Launch', branch: 'milestone/launch' });
    seedMilestone(t, orgId, projectId, { name: 'Launch', branch: 'milestone/launch-2' });
    assert.equal(await uniqueMilestoneBranch({ db: t.db }, 'Launch'), 'milestone/launch-3');
    assert.equal(await uniqueMilestoneBranch({ db: t.db }, 'Something new'), 'milestone/something-new');
  });

  it('keeps a suffixed name inside the length limit', () => {
    const base = `milestone/${'x'.repeat(48)}`;
    const second = branchCandidate(base, 2);
    assert.equal(second.length, base.length);
    assert.equal(second.endsWith('-2'), true);
    assert.equal(isMilestoneBranch(second), true);
  });

  it('stores only a GitHub pull request link', () => {
    assert.equal(
      pullRequestUrl(' https://github.com/warehauscollective/warehaus/pull/140 '),
      'https://github.com/warehauscollective/warehaus/pull/140',
    );
    for (const value of ['https://example.com/pull/1', 'https://github.com/a/b/issues/1', 'javascript:alert(1)', 140, null]) {
      assert.equal(pullRequestUrl(value), null, String(value));
    }
  });
});
