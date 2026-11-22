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

const SECRET = 'webhook-secret-for-tests';
const SHA = 'a'.repeat(40);
const BRANCH = 'milestone/client-experience-launch';

type Row = Record<string, unknown> & { _id: string };

/** A small in-memory stand-in for the tables the webhook mutation touches. */
function fakeDb(seed: { milestones: Row[]; projects?: Row[] }) {
  const tables: Record<string, Row[]> = {
    milestones: seed.milestones,
    projects: seed.projects ?? [],
    syncEvents: [],
    syncMeta: [],
    activity: [],
    agentEvents: [],
    tasks: [],
    taskLinks: [],
  };
  let next = 1;
  const db = {
    get: async (id: string) => {
      for (const rows of Object.values(tables)) {
        const row = rows.find((item) => item._id === id);
        if (row) return row;
      }
      return null;
    },
    query: (table: string) => ({
      withIndex: (_index: string, range: (q: { eq: (field: string, value: unknown) => unknown }) => unknown) => {
        const wanted: Array<[string, unknown]> = [];
        const q = {
          eq: (field: string, value: unknown) => {
            wanted.push([field, value]);
            return q;
          },
        };
        range(q);
        const rows = () => (tables[table] ?? []).filter((row) => wanted.every(([field, value]) => row[field] === value));
        return { first: async () => rows()[0] ?? null, take: async (count: number) => rows().slice(0, count) };
      },
    }),
    insert: async (table: string, value: Record<string, unknown>) => {
      const row = { ...value, _id: `${table}:${next}` };
      next += 1;
      (tables[table] ??= []).push(row);
      return row._id;
    },
    patch: async (id: string, value: Record<string, unknown>) => {
      for (const rows of Object.values(tables)) {
        const row = rows.find((item) => item._id === id);
        if (row) Object.assign(row, value);
      }
    },
  };
  return { db, tables };
}

type Applied = { ok: true; wrote: boolean; duplicate?: boolean; milestone?: boolean; shipped?: boolean };

function apply(ctx: unknown, plan: Extract<InboundPlan, { action: 'apply' }>): Promise<Applied> {
  const handler = (applyInbound as unknown as { _handler: (ctx: unknown, args: unknown) => Promise<Applied> })._handler;
  return handler(ctx, {
    source: plan.source,
    ...(plan.deliveryId ? { deliveryId: plan.deliveryId } : {}),
    ...(plan.contentKey ? { contentKey: plan.contentKey } : {}),
    ...(plan.milestone ? { milestone: plan.milestone } : {}),
    items: plan.items,
  });
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

function milestoneRow(over: Record<string, unknown> = {}): Row {
  return {
    _id: 'milestones:1',
    orgId: 'org',
    projectId: 'project',
    name: 'Client experience launch',
    status: 'Ready to Ship',
    approval: 'approved',
    branch: BRANCH,
    ...over,
  };
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
    const { db, tables } = fakeDb({ milestones: [milestoneRow()] });
    const plan = await githubPlan(pullBody({ action: 'closed', merged: true }));
    assert.equal(plan.action, 'apply');
    if (plan.action !== 'apply') return;

    const first = await apply({ db }, plan);
    assert.equal(first.wrote, true);
    assert.equal(first.shipped, true);
    const milestone = tables.milestones?.[0];
    assert.equal(milestone?.status, 'Shipped');
    assert.equal(milestone?.prUrl, 'https://github.com/warehauscollective/warehaus/pull/140');
    assert.equal(tables.activity?.length, 1);
    assert.equal(tables.agentEvents?.length, 1);

    // GitHub redelivers the same delivery id.
    const retry = await apply({ db }, plan);
    assert.equal(retry.duplicate, true);
    assert.equal(retry.wrote, false);
    // A new delivery id with the same content is the same snapshot.
    const replay = await apply({ db }, { ...plan, deliveryId: 'delivery-milestone-2' });
    assert.equal(replay.duplicate, true);
    assert.equal(tables.activity?.length, 1);
    assert.equal(tables.agentEvents?.length, 1);
  });

  it('writes nothing a second time even with no claim to stop it', async () => {
    const { db, tables } = fakeDb({ milestones: [milestoneRow()] });
    const plan = await githubPlan(pullBody({ action: 'closed', merged: true }));
    if (plan.action !== 'apply') throw new Error('expected apply');
    await apply({ db }, plan);
    // Drop both keys so only the stored values can stop a second write.
    const bare = { ...plan, deliveryId: undefined, contentKey: undefined };
    const again = await apply({ db }, bare);
    assert.equal(again.wrote, false);
    assert.equal(tables.activity?.length, 1);
  });

  it('changes nothing for a merge on a branch no milestone owns', async () => {
    const { db, tables } = fakeDb({ milestones: [milestoneRow()] });
    const plan = await githubPlan(pullBody({ action: 'closed', merged: true, head: 'milestone/some-other-work' }));
    if (plan.action !== 'apply') throw new Error('expected apply');
    const result = await apply({ db }, plan);
    assert.equal(result.wrote, false);
    assert.equal(tables.milestones?.[0]?.status, 'Ready to Ship');
    assert.equal(tables.milestones?.[0]?.prUrl, undefined);
    assert.equal(tables.activity?.length, 0);
    assert.equal(tables.syncEvents?.length, 0);
  });

  it('stores the pull request on open and does not ship', async () => {
    const { db, tables } = fakeDb({ milestones: [milestoneRow({ status: 'Building', approval: 'unreviewed' })] });
    const plan = await githubPlan(pullBody({ action: 'opened' }));
    if (plan.action !== 'apply') throw new Error('expected apply');
    const result = await apply({ db }, plan);
    assert.equal(result.wrote, true);
    assert.equal(result.shipped, undefined);
    const milestone = tables.milestones?.[0];
    assert.equal(milestone?.status, 'Building');
    assert.equal(milestone?.previewPrNumber, 140);
    assert.equal(milestone?.previewCommit, SHA);
    assert.equal(tables.activity?.length, 0);
  });
});

describe('the repository has to match', () => {
  const project = (agentRepo?: string): Row => ({ _id: 'project', ...(agentRepo ? { agentRepo } : {}) });

  it('does not ship a milestone for a merge of the same branch name in another repository', async () => {
    const { db, tables } = fakeDb({ milestones: [milestoneRow()], projects: [project('someone/other-repo')] });
    const plan = await githubPlan(pullBody({ action: 'closed', merged: true }));
    if (plan.action !== 'apply') throw new Error('expected apply');
    const result = await apply({ db }, plan);
    assert.equal(result.wrote, false);
    assert.equal(tables.milestones?.[0]?.status, 'Ready to Ship');
    assert.equal(tables.milestones?.[0]?.prUrl, undefined);
    assert.equal(tables.activity?.length, 0);
    assert.equal(tables.syncEvents?.length, 0);
  });

  it('ships when the repository matches, whatever the letter case', async () => {
    const { db, tables } = fakeDb({ milestones: [milestoneRow()], projects: [project('WarehausCollective/Warehaus')] });
    const plan = await githubPlan(pullBody({ action: 'closed', merged: true }));
    if (plan.action !== 'apply') throw new Error('expected apply');
    const result = await apply({ db }, plan);
    assert.equal(result.shipped, true);
    assert.equal(tables.milestones?.[0]?.status, 'Shipped');
  });

  it('keeps matching by branch alone for a project with no repository set', async () => {
    const { db, tables } = fakeDb({ milestones: [milestoneRow()], projects: [project()] });
    const plan = await githubPlan(pullBody({ action: 'closed', merged: true }));
    if (plan.action !== 'apply') throw new Error('expected apply');
    const result = await apply({ db }, plan);
    assert.equal(result.shipped, true);
    assert.equal(tables.milestones?.[0]?.status, 'Shipped');
  });

  it('compares the two names and nothing else', () => {
    assert.equal(inboundRepoMatches('a/b', 'A/B'), true);
    assert.equal(inboundRepoMatches('a/b', 'a/c'), false);
    assert.equal(inboundRepoMatches('a/b', undefined), false);
    assert.equal(inboundRepoMatches(null, 'a/c'), true);
    assert.equal(inboundRepoMatches('', undefined), true);
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
          meta: { githubCommitSha: SHA, githubCommitRef: branch },
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
    const { db, tables } = fakeDb({ milestones: [milestoneRow({ status: 'Building', approval: 'unreviewed' })] });
    const plan = await vercelPlan(vercelBody('deployment.succeeded', BRANCH));
    assert.equal(plan.action, 'apply');
    if (plan.action !== 'apply') return;
    assert.equal(plan.milestone?.kind, 'deploy');
    const first = await apply({ db }, plan);
    assert.equal(first.wrote, true);
    // This branch name is too long for a stable host, so the build's own URL is stored.
    assert.equal(tables.milestones?.[0]?.previewUrl, 'https://warehaus-portal-abc123-warehaus-collective.vercel.app');
    assert.equal(tables.milestones?.[0]?.previewCommit, SHA);
    const retry = await apply({ db }, plan);
    assert.equal(retry.duplicate, true);
    assert.equal(tables.agentEvents?.length, 1);
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
    const { db, tables } = fakeDb({ milestones: [milestoneRow()] });
    const plan = await vercelPlan(vercelBody('deployment.succeeded', BRANCH));
    if (plan.action !== 'apply') throw new Error('expected apply');
    const result = await apply({ db }, plan);
    assert.equal(result.wrote, false);
    assert.equal(tables.milestones?.[0]?.previewUrl, undefined);
  });
});

describe('branch names', () => {
  it('gives a second milestone with the same name its own branch', async () => {
    const taken = new Set(['milestone/launch', 'milestone/launch-2']);
    const ctx = {
      db: {
        query: () => ({
          withIndex: (_index: string, range: (q: { eq: (field: string, value: string) => unknown }) => unknown) => {
            let wanted = '';
            range({
              eq: (_field, value) => {
                wanted = value;
                return null;
              },
            });
            return { first: async () => (taken.has(wanted) ? { _id: 'x' } : null) };
          },
        }),
      },
    };
    assert.equal(await uniqueMilestoneBranch(ctx, 'Launch'), 'milestone/launch-3');
    assert.equal(await uniqueMilestoneBranch(ctx, 'Something new'), 'milestone/something-new');
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
