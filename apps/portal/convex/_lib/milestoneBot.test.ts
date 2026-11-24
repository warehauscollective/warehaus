import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { z } from 'zod';
import { portalTools } from '../../src/lib/mcp/tools';
import {
  BOT_STATUS_BUILDING,
  NOTE_REQUIRED,
  NOTE_TOO_LONG,
  PROPOSED_TASKS_COUNT,
  PROPOSED_TASKS_DUPLICATE,
  PROPOSED_TASKS_SHAPE,
  PROPOSED_TASK_TITLE,
  createdViaDecision,
  noteDecision,
  proposedTasksDecision,
  statusForBotCreate,
} from './milestoneBot';
import { ONLY_PETER, planReview } from './milestoneReview';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('proposed tasks', () => {
  it('takes none, or 3 to 10', () => {
    assert.deepEqual(proposedTasksDecision(undefined), { ok: true, tasks: [] });
    assert.deepEqual(proposedTasksDecision([]), { ok: true, tasks: [] });
    assert.deepEqual(proposedTasksDecision(['a', 'b']), { ok: false, reason: PROPOSED_TASKS_COUNT });
    const eleven = Array.from({ length: 11 }, (_, index) => `Task ${index}`);
    assert.deepEqual(proposedTasksDecision(eleven), { ok: false, reason: PROPOSED_TASKS_COUNT });
    const three = proposedTasksDecision(['  Design  it ', { title: 'Build it', detail: ' With care ' }, { title: 'Check it' }]);
    assert.deepEqual(three, {
      ok: true,
      tasks: [
        { title: 'Design it', detail: '' },
        { title: 'Build it', detail: 'With care' },
        { title: 'Check it', detail: '' },
      ],
    });
  });

  it('rejects a wrong shape, an empty title and a repeat', () => {
    assert.deepEqual(proposedTasksDecision('one task'), { ok: false, reason: PROPOSED_TASKS_SHAPE });
    assert.deepEqual(proposedTasksDecision([1, 2, 3]), { ok: false, reason: PROPOSED_TASKS_SHAPE });
    assert.deepEqual(proposedTasksDecision(['a', 'b', { title: 'c', detail: 4 }]), {
      ok: false,
      reason: PROPOSED_TASKS_SHAPE,
    });
    assert.deepEqual(proposedTasksDecision(['a', ' ', 'c']), { ok: false, reason: PROPOSED_TASK_TITLE });
    assert.deepEqual(proposedTasksDecision(['a', 'b', 'x'.repeat(201)]), { ok: false, reason: PROPOSED_TASK_TITLE });
    assert.deepEqual(proposedTasksDecision(['Build it', 'b', 'build  IT']), {
      ok: false,
      reason: PROPOSED_TASKS_DUPLICATE,
    });
  });
});

describe('status and source of a bot milestone', () => {
  it('starts at Planning and refuses Building', () => {
    assert.deepEqual(statusForBotCreate(null), { ok: true, status: 'Planning' });
    assert.deepEqual(statusForBotCreate(undefined), { ok: true, status: 'Planning' });
    assert.deepEqual(statusForBotCreate('Idea'), { ok: true, status: 'Idea' });
    assert.deepEqual(statusForBotCreate('Awaiting Go'), { ok: true, status: 'Awaiting Go' });
    assert.deepEqual(statusForBotCreate('Building'), { ok: false, reason: BOT_STATUS_BUILDING });
  });

  it('reads the source from the token and ignores the request', () => {
    assert.deepEqual(createdViaDecision({ tokenName: 'grok-bot' }), { ok: true, createdVia: 'grok' });
    assert.deepEqual(createdViaDecision({ tokenName: 'Claude Code' }), { ok: true, createdVia: 'claude' });
    assert.deepEqual(createdViaDecision({ tokenName: 'cursor' }), { ok: true, createdVia: 'other' });
    const api = read('../portalApi.ts');
    assert.equal(api.includes('createdVia: body.createdVia'), false);
    assert.match(api, /createdViaDecision\(\{ tokenName:/);
    assert.match(api, /statusForBotCreate\(wanted\.status\)/);
    assert.match(api, /wanted\.status === 'Building'/);
  });
});

describe('notes', () => {
  it('needs text and caps the length', () => {
    assert.deepEqual(noteDecision('  Design check passed.  '), { ok: true, body: 'Design check passed.' });
    assert.deepEqual(noteDecision('   '), { ok: false, reason: NOTE_REQUIRED });
    assert.deepEqual(noteDecision(null), { ok: false, reason: NOTE_REQUIRED });
    assert.deepEqual(noteDecision('x'.repeat(4001)), { ok: false, reason: NOTE_TOO_LONG });
  });

  it('keeps notes in a table no client query reads', () => {
    for (const file of ['../portalData.ts', '../tasks.ts', '../clients.ts']) {
      assert.equal(read(file).includes('milestoneNotes'), false, file);
    }
    // milestones.ts touches notes in one place: the review decision closes the open approval request.
    const milestones = read('../milestones.ts');
    assert.equal(milestones.split("query('milestoneNotes')").length - 1, 1);
    const review = milestones.slice(milestones.indexOf('async function applyMilestoneReview'), milestones.indexOf('function peterPortalActor'));
    assert.match(review, /query\('milestoneNotes'\)/);
    const api = read('../portalApi.ts');
    const note = api.slice(api.indexOf('export const addMilestoneNote'), api.indexOf('export const updateMilestone'));
    assert.match(note, /internalMutation/);
    assert.match(note, /staffMayReadOrg\(ctx, milestone\.orgId\)/);
  });
});

describe('approval stays with Peter', () => {
  const base = {
    currentIteration: 1,
    status: 'Ready to Ship' as const,
    hasPreview: true,
    iteration: 1,
    notes: 'Looks right.',
    existing: null,
    appliesTo: [],
  };

  it('refuses approve and request changes from any token but grok-bot', () => {
    for (const decision of ['approve', 'request_changes']) {
      assert.deepEqual(planReview({ ...base, decision, actor: { source: 'chat', tokenName: 'claude' } }), {
        ok: false,
        reason: ONLY_PETER,
      });
    }
    const approved = planReview({ ...base, decision: 'approve', actor: { source: 'chat', tokenName: 'grok-bot' } });
    assert.equal(approved.ok, true);
    // Approve records the decision. The status does not move to Shipped.
    if (approved.ok && !approved.idempotent) assert.equal(approved.status, 'Ready to Ship');
  });

  it('does not merge or deploy from the review path', () => {
    const source = read('../milestones.ts');
    const review = source.slice(source.indexOf('async function applyMilestoneReview'), source.indexOf('function peterPortalActor'));
    assert.doesNotMatch(review, /merge/i);
    assert.doesNotMatch(review, /status: 'Shipped'/);
  });
});

describe('MCP tools', () => {
  const byName = new Map(portalTools.map((tool) => [tool.name, tool]));

  it('offers the milestone tools and keeps the old review name for one release', () => {
    for (const name of [
      'create_milestone',
      'get_milestone_status',
      'add_note',
      'approve_milestone',
      'request_changes',
      'record_milestone_review',
    ]) {
      assert.ok(byName.has(name), name);
    }
    assert.equal(byName.get('get_milestone_status')?.write, false);
    assert.match(byName.get('create_milestone')?.description ?? '', /3 to 10 concrete tasks/);
    assert.match(byName.get('approve_milestone')?.description ?? '', /does not merge, does not deploy/);
  });

  it('lets no tool create a task without a milestone', () => {
    // Every tool is called with its required fields only. One that reaches the
    // task-create route has to have been forced to name a milestone.
    const sample = (shape: z.ZodRawShape): Record<string, unknown> => {
      const out: Record<string, unknown> = {};
      for (const [key, field] of Object.entries(shape)) {
        if (field.isOptional()) continue;
        out[key] = key === 'iteration' ? 1 : `${key}-value`;
      }
      return out;
    };
    let creators = 0;
    for (const tool of portalTools) {
      const call = tool.call(sample(tool.schema));
      if (call.method !== 'POST' || call.path !== '/api/v1/tasks') continue;
      creators += 1;
      const field = tool.schema.milestoneId;
      assert.ok(field, `${tool.name} has no milestoneId`);
      assert.equal(field.isOptional(), false, `${tool.name} lets milestoneId be left out`);
      assert.equal(z.object(tool.schema).safeParse({ ...sample(tool.schema), milestoneId: undefined }).success, false, tool.name);
      assert.equal(call.body?.milestoneId, 'milestoneId-value', tool.name);
    }
    assert.equal(creators, 1);
    // Tasks made with a milestone are made inside that milestone's own insert.
    const created = byName.get('create_milestone')?.call({
      projectId: 'p',
      name: 'n',
      objective: 'o',
      proposedTasks: [{ title: 'a' }, { title: 'b' }, { title: 'c' }],
      idempotencyKey: 'k',
    });
    assert.equal(created?.path, '/api/v1/milestones');
    assert.equal(created?.body?.createdVia, undefined);
    const api = read('../portalApi.ts');
    const create = api.slice(api.indexOf('export const createMilestone'), api.indexOf('export const getMilestoneStatus'));
    assert.match(create, /milestoneId,\n\s+milestoneOrder: index/);
    assert.doesNotMatch(create, /internal\.sync\.outbox/);
  });

  it('routes approve and request changes to the review path with a fixed decision', () => {
    const approve = byName.get('approve_milestone')?.call({ milestoneId: 'm1', iteration: 2, idempotencyKey: 'k' });
    assert.deepEqual(approve?.body, { iteration: 2, decision: 'approve', notes: '' });
    assert.equal(approve?.path, '/api/v1/milestones/m1/review');
    const changes = byName
      .get('request_changes')
      ?.call({ milestoneId: 'm1', iteration: 2, notes: 'Fix it', newTasks: ['One'], idempotencyKey: 'k' });
    assert.deepEqual(changes?.body, { iteration: 2, decision: 'request_changes', notes: 'Fix it', newTasks: ['One'] });
    assert.equal('decision' in (byName.get('approve_milestone')?.schema ?? {}), false);
  });
});
