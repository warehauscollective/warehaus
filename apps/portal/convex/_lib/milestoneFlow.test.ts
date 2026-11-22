/**
 * The whole milestone loop, run through the real mutation handlers against an
 * in-memory database: a bot creates a milestone with its tasks, a runner
 * claims and completes them, Peter requests changes and then approves, and
 * the merged pull request ships it.
 *
 * This is not the Convex runtime. It checks the handlers and the rules they
 * share. Validators, indexes and transactions are Convex's own.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { claimNext, completeTask, recordEvent, writePlannedTasks } from '../agent';
import { reviewForApi } from '../milestones';
import { createMilestone } from '../portalApi';
import { applyInbound } from '../sync/inbound';
import { buildRoadmap, roadmapViewForAudience } from './milestones';
import { transitionMilestone } from './milestoneStatus';
import { taskOrigin } from './milestoneTasks';

type Row = Record<string, unknown> & { _id: string; _creationTime: number };

function memoryDb() {
  const tables = new Map<string, Row[]>();
  let next = 1;
  const rowsOf = (table: string) => {
    if (!tables.has(table)) tables.set(table, []);
    return tables.get(table) as Row[];
  };
  const find = (id: string) => {
    for (const rows of tables.values()) {
      const row = rows.find((item) => item._id === id);
      if (row) return row;
    }
    return null;
  };
  const db = {
    get: async (id: string) => find(id),
    normalizeId: (table: string, id: string) => (rowsOf(table).some((row) => row._id === id) ? id : null),
    insert: async (table: string, value: Record<string, unknown>) => {
      const row = { ...value, _id: `${table}:${next}`, _creationTime: next } as Row;
      next += 1;
      rowsOf(table).push(row);
      return row._id;
    },
    patch: async (id: string, value: Record<string, unknown>) => {
      const row = find(id);
      if (!row) throw new Error(`patch: ${id} not found`);
      for (const [key, item] of Object.entries(value)) {
        if (item === undefined) delete row[key];
        else row[key] = item;
      }
    },
    delete: async (id: string) => {
      for (const rows of tables.values()) {
        const at = rows.findIndex((item) => item._id === id);
        if (at >= 0) rows.splice(at, 1);
      }
    },
    query: (table: string) => {
      const wanted: Array<[string, unknown]> = [];
      let descending = false;
      const matched = () => {
        const rows = rowsOf(table).filter((row) => wanted.every(([field, value]) => (row[field] ?? undefined) === value));
        return descending ? [...rows].reverse() : rows;
      };
      const chain = {
        withIndex: (_name: string, range?: (q: { eq: (field: string, value: unknown) => unknown }) => unknown) => {
          const q = {
            eq: (field: string, value: unknown) => {
              wanted.push([field, value]);
              return q;
            },
          };
          range?.(q);
          return chain;
        },
        order: (direction: 'asc' | 'desc') => {
          descending = direction === 'desc';
          return chain;
        },
        first: async () => matched()[0] ?? null,
        unique: async () => matched()[0] ?? null,
        take: async (count: number) => matched().slice(0, count),
        collect: async () => matched(),
      };
      return chain;
    },
  };
  return { db, rowsOf };
}

type Handler<T> = (ctx: unknown, args: Record<string, unknown>) => Promise<T>;

function handler<T>(fn: unknown): Handler<T> {
  return (fn as { _handler: Handler<T> })._handler;
}

const RUNNER = 'peter-mbp';
const REPO = 'warehauscollective/warehaus';
const SHA = 'c'.repeat(40);

describe('milestone loop, bot to Shipped', () => {
  it('creates, builds, reviews twice and ships', async () => {
    const { db, rowsOf } = memoryDb();
    const scheduled: unknown[] = [];
    const ctx = { db, scheduler: { runAfter: async (...args: unknown[]) => scheduled.push(args) } };

    const orgId = await db.insert('clients', { name: 'Warehaus', portalAccess: 'Enabled' });
    const projectId = await db.insert('projects', {
      orgId,
      name: 'Warehaus Portal',
      notionPageId: 'project-page',
      agentRepo: REPO,
    });
    await db.insert('contacts', { orgId, email: 'peter@warehaus.co', role: 'Warehaus Staff', name: 'Peter' });

    // 1. Grok Bot creates the milestone with its task list in one call.
    const created = await handler<{ status: number; body: { id: string; status: string; taskIds: string[]; createdVia: string } }>(
      createMilestone,
    )(ctx, {
      tokenId: 'apiTokens:1',
      key: 'create-1',
      requestHash: 'hash-1',
      tokenName: 'grok-bot',
      projectId,
      name: 'Client experience launch',
      objective: 'Clients can see their project and approve work.',
      goals: ['Review card is live'],
      proposedTasks: [{ title: 'Design the overview' }, { title: 'Build the overview' }, { title: 'Wire the review card' }],
    });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const milestoneId = created.body.id;
    assert.equal(created.body.status, 'Awaiting Go');
    assert.equal(created.body.createdVia, 'grok');
    assert.equal(created.body.taskIds.length, 3);
    const milestone = () => rowsOf('milestones').find((row) => row._id === milestoneId) as Row;
    const tasks = () => rowsOf('tasks').filter((row) => row.milestoneId === milestoneId);
    assert.equal(milestone().branch, 'milestone/client-experience-launch');
    assert.deepEqual(tasks().map((task) => task.origin), ['brief', 'brief', 'brief']);
    // The tasks never went to Notion.
    assert.equal(rowsOf('notionOutbox').length, 0);

    // The same call again replays the stored result and creates nothing.
    const replay = await handler<{ status: number; body: { id: string } }>(createMilestone)(ctx, {
      tokenId: 'apiTokens:1',
      key: 'create-1',
      requestHash: 'hash-1',
      tokenName: 'grok-bot',
      projectId,
      name: 'Client experience launch',
      objective: 'Clients can see their project and approve work.',
      goals: ['Review card is live'],
      proposedTasks: [{ title: 'Design the overview' }, { title: 'Build the overview' }, { title: 'Wire the review card' }],
    });
    assert.equal(replay.body.id, milestoneId);
    assert.equal(rowsOf('milestones').length, 1);
    assert.equal(tasks().length, 3);

    // Nothing is claimable until Peter says go.
    const early = await handler<{ kind: string }>(claimNext)(ctx, { runnerId: RUNNER, repos: [REPO] });
    assert.equal(early.kind, 'none');

    // 2. Peter presses play: Awaiting Go to Building.
    const go = transitionMilestone({ from: 'Awaiting Go', cause: 'advance', expected: 'Awaiting Go' });
    assert.equal(go.ok && go.status, 'Building');
    await db.patch(milestoneId, { status: 'Building' });

    // 3. The runner works the tasks top to bottom.
    const worked: string[] = [];
    for (let round = 0; round < 3; round += 1) {
      const claim = await handler<{ kind: string; runId: string; task: { title: string }; milestone: { branch: string } }>(claimNext)(
        ctx,
        { runnerId: RUNNER, mode: 'interactive', repos: [REPO] },
      );
      assert.equal(claim.kind, 'task');
      assert.equal(claim.milestone.branch, 'milestone/client-experience-launch');
      worked.push(claim.task.title);
      // A second runner cannot take the task this runner holds.
      const other = await handler<{ kind: string; task?: { title: string } }>(claimNext)(ctx, { runnerId: 'studio-mini', repos: [REPO] });
      if (other.kind === 'task') {
        assert.notEqual(other.task?.title, claim.task.title);
        // Hand the other runner's task back so the first runner works in order.
        const otherRun = rowsOf('agentRuns').find((run) => run.runnerId === 'studio-mini' && run.status === 'running') as Row;
        await handler(completeTask)(ctx, { runnerId: 'studio-mini', runId: otherRun._id, status: 'failed' });
      }
      const event = await handler<{ ok: boolean }>(recordEvent)(ctx, {
        runnerId: RUNNER,
        runId: claim.runId,
        type: 'tool',
        summary: 'Edited MilestoneReview.tsx',
        payload: { env: { RUNNER_TOKEN: 'secret-value' }, tool_name: 'Edit' },
      });
      assert.equal(event.ok, true);
      const done = await handler<{ ok: boolean; milestoneStatus: string; duplicate: boolean }>(completeTask)(ctx, {
        runnerId: RUNNER,
        runId: claim.runId,
        status: 'done',
        commitSha: SHA,
        prUrl: 'https://github.com/warehauscollective/warehaus/pull/140',
      });
      assert.equal(done.ok, true);
      // A retry of the same completion writes nothing.
      const again = await handler<{ duplicate: boolean }>(completeTask)(ctx, {
        runnerId: RUNNER,
        runId: claim.runId,
        status: 'done',
        commitSha: SHA,
      });
      assert.equal(again.duplicate, true);
    }
    assert.deepEqual(worked, ['Design the overview', 'Build the overview', 'Wire the review card']);
    assert.equal(tasks().every((task) => task.isDone === true && task.lastCommitSha === SHA), true);
    // No stored event carries the environment.
    assert.equal(JSON.stringify(rowsOf('agentEvents')).includes('secret-value'), false);

    // 4. The last task done moves the milestone to Ready to Ship.
    assert.equal(milestone().status, 'Ready to Ship');
    // Hand-off: the local preview is stored and one open note waits on Peter.
    assert.equal(milestone().localPreviewUrl, 'http://localhost:3100/');
    const openNotes = () => rowsOf('milestoneNotes').filter((note) => note.needsPeter === 'open');
    assert.equal(openNotes().length, 1);
    assert.equal(openNotes()[0]?.reason, 'approval');
    assert.match(String(openNotes()[0]?.body), /npm run preview:pr -- milestone\/client-experience-launch/);
    assert.match(String(openNotes()[0]?.body), /pull\/140/);
    assert.equal(String(openNotes()[0]?.body).includes('vercel'), false);
    assert.equal(milestone().prUrl, 'https://github.com/warehauscollective/warehaus/pull/140');
    assert.equal(rowsOf('agentEvents').some((event) => event.type === 'ready'), true);

    // 5. Peter requests changes in Grok Bot, with two task lines.
    const changes = await handler<{ ok: boolean; status: number; error?: string; iteration?: number; milestoneStatus?: string; createdTaskIds?: string[] }>(
      reviewForApi,
    )(ctx, {
      milestoneId,
      iteration: 1,
      decision: 'request_changes',
      notes: 'The review card needs more space on mobile.',
      taskIds: [],
      newTasks: ['Give the review card more space at 390', 'Make the preview link a full-width tap target'],
      tokenName: 'grok-bot',
    });
    assert.equal(changes.ok, true, changes.error ?? '');
    assert.equal(changes.iteration, 2);
    assert.equal(changes.createdTaskIds?.length, 2);
    assert.equal(milestone().status, 'Building');
    assert.equal(milestone().approval, 'changes_requested');
    // Peter answered, so nothing waits on him.
    assert.equal(openNotes().length, 0);
    const review = tasks().filter((task) => taskOrigin({ origin: task.origin as string, source: task.source as string }) === 'review');
    assert.deepEqual(review.map((task) => [task.name, task.round]), [
      ['Give the review card more space at 390', 2],
      ['Make the preview link a full-width tap target', 2],
    ]);

    // Another token cannot decide.
    const refused = await handler<{ ok: boolean; error?: string }>(reviewForApi)(ctx, {
      milestoneId,
      iteration: 2,
      decision: 'approve',
      notes: '',
      taskIds: [],
      tokenName: 'claude',
    });
    assert.equal(refused.ok, false);
    assert.match(refused.error ?? '', /Only Peter/);

    // 6. The runner works the round 2 tasks.
    for (let round = 0; round < 2; round += 1) {
      const claim = await handler<{ kind: string; runId: string; task: { round: number } }>(claimNext)(ctx, { runnerId: RUNNER, repos: [REPO] });
      assert.equal(claim.kind, 'task');
      assert.equal(claim.task.round, 2);
      await handler(completeTask)(ctx, { runnerId: RUNNER, runId: claim.runId, status: 'done', commitSha: SHA });
    }
    assert.equal(milestone().status, 'Ready to Ship');

    assert.equal(openNotes().length, 1);

    // 7. Peter approves. The decision is recorded. Nothing ships yet.
    const approved = await handler<{ ok: boolean; error?: string; approval?: string; milestoneStatus?: string }>(reviewForApi)(ctx, {
      milestoneId,
      iteration: 2,
      decision: 'approve',
      notes: '',
      taskIds: [],
      tokenName: 'grok-bot',
    });
    assert.equal(approved.ok, true, approved.error ?? '');
    assert.equal(milestone().approval, 'approved');
    assert.equal(milestone().status, 'Ready to Ship');
    assert.equal(openNotes().length, 0);

    // 8. The pull request merges into main. The webhook ships the milestone.
    const merge = await handler<{ wrote: boolean; shipped?: boolean }>(applyInbound)(ctx, {
      source: 'github',
      deliveryId: 'delivery-merge-1',
      contentKey: `warehauscollective/warehaus#140#${SHA}#merged`,
      milestone: {
        kind: 'pull',
        branch: 'milestone/client-experience-launch',
        prUrl: 'https://github.com/warehauscollective/warehaus/pull/140',
        prNumber: 140,
        sha: SHA,
        merged: true,
      },
      items: [],
    });
    assert.equal(merge.shipped, true);
    assert.equal(milestone().status, 'Shipped');

    // Shipped is the end. A person cannot set it, and nothing more is claimable.
    assert.equal(transitionMilestone({ from: 'Building', cause: 'set', to: 'Shipped' }).ok, false);
    const after = await handler<{ kind: string }>(claimNext)(ctx, { runnerId: RUNNER, repos: [REPO] });
    assert.equal(after.kind, 'none');
  });

  it('plans a portal milestone from the brief', async () => {
    const { db, rowsOf } = memoryDb();
    const ctx = { db };
    const orgId = await db.insert('clients', { name: 'Warehaus', portalAccess: 'Enabled' });
    const projectId = await db.insert('projects', { orgId, name: 'Warehaus Portal', agentRepo: REPO });
    const milestoneId = await db.insert('milestones', {
      orgId,
      projectId,
      name: 'Linear task source',
      objective: 'Read-only task visibility for the pilot client.',
      goals: [],
      status: 'Planning',
      approval: 'unreviewed',
      publishToWarehaus: false,
      createdVia: 'portal',
      planning: 'queued',
    });
    const claim = await handler<{ kind: string; runId: string }>(claimNext)(ctx, { runnerId: RUNNER, repos: [REPO] });
    assert.equal(claim.kind, 'planning');
    const milestone = () => rowsOf('milestones').find((row) => row._id === milestoneId) as Row;
    assert.equal(milestone().planning, 'running');

    const short = await handler<{ ok: boolean }>(writePlannedTasks)(ctx, { runnerId: RUNNER, runId: claim.runId, tasks: ['Only one'] });
    assert.equal(short.ok, false);

    const wrote = await handler<{ ok: boolean; taskIds: string[]; milestoneStatus: string }>(writePlannedTasks)(ctx, {
      runnerId: RUNNER,
      runId: claim.runId,
      tasks: [{ title: 'Map Linear fields' }, { title: 'Read tasks for the pilot client' }, { title: 'Show the source on the task' }],
    });
    assert.equal(wrote.ok, true);
    assert.equal(wrote.taskIds.length, 3);
    assert.equal(wrote.milestoneStatus, 'Awaiting Go');
    assert.equal(milestone().planning, undefined);
    // A retry after the run ended writes no second list.
    const again = await handler<{ duplicate: boolean }>(writePlannedTasks)(ctx, {
      runnerId: RUNNER,
      runId: claim.runId,
      tasks: [{ title: 'a' }, { title: 'b' }, { title: 'c' }],
    });
    assert.equal(again.duplicate, true);
    assert.equal(rowsOf('tasks').length, 3);
  });
});

describe('client host', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

  it('reads no agent table and no staff notes', () => {
    const files = [
      '../portalData.ts',
      '../tasks.ts',
      '../clients.ts',
      '../projects.ts',
      '../search.ts',
      '../taskResponses.ts',
      '../clientDocs.ts',
      '../sharedResources.ts',
    ];
    for (const file of files) {
      const source = read(file);
      for (const table of ['agentRuns', 'agentEvents', 'agentRunners', 'milestoneNotes']) {
        assert.equal(source.includes(table), false, `${file} reads ${table}`);
      }
    }
    // The only client milestone queries go through the audience filter.
    const milestones = read('../milestones.ts');
    const clientList = milestones.slice(milestones.indexOf('export const listForClientProject'), milestones.indexOf('async function personName'));
    assert.match(clientList, /listOnProject\(ctx, project, 'client'/);
    for (const table of ['agentRuns', 'agentEvents', 'agentRunners']) {
      assert.equal(milestones.includes(table), false, table);
    }
    // Notes are read only where a review decision closes the open request. No read path, staff or client, lists them here.
    const reads = milestones.slice(0, milestones.indexOf('async function applyMilestoneReview'));
    assert.equal(reads.includes('milestoneNotes'), false);
    assert.equal(clientList.includes('milestoneNotes'), false);
    // A project's repo setting is staff only.
    for (const file of ['../portalData.ts', '../search.ts']) {
      assert.equal(read(file).includes('agentRepo'), false, file);
    }
  });

  it('receives no staff field on a milestone or its tasks', () => {
    const view = roadmapViewForAudience(
      {
        id: 'm1',
        name: 'Launch',
        approval: 'approved',
        note: 'Internal',
        approverName: 'Peter',
        decidedAt: 5,
        localPreviewUrl: 'http://localhost:3100/',
        figmaUrl: 'https://figma.com/file/x',
        createdVia: 'grok',
        planning: 'queued',
        branch: 'milestone/launch',
        prUrl: 'https://github.com/warehauscollective/warehaus/pull/140',
        review: { previewUrl: 'https://x.vercel.app' },
      },
      'client',
    );
    assert.deepEqual(Object.keys(view).sort(), ['id', 'name']);
    const rows = buildRoadmap({
      audience: 'client',
      milestoneId: 'm1',
      projectVisibleToClient: true,
      tasks: [
        {
          id: 't1',
          name: 'Task',
          status: 'Blocked',
          isDone: false,
          stage: 'Building',
          pullRequestUrl: 'https://github.com/a/b/pull/1',
          parentTaskId: null,
          milestoneId: 'm1',
          milestoneOrder: 0,
          resourceCount: 0,
          publishToWarehaus: true,
          hidden: false,
          source: 'portal-review',
          origin: 'review',
          round: 2,
          portalOwned: true,
          detail: 'Staff detail',
          runner: 'peter-mbp',
          commit: 'cccccccccc',
          blockedReason: 'needs Figma frame',
        },
      ],
    }).rows;
    assert.deepEqual(Object.keys(rows[0] ?? {}).sort(), [
      'children',
      'id',
      'isDone',
      'name',
      'onMilestone',
      'resourceCount',
      'stage',
      'status',
    ]);
  });
});
