import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  APPROVE_NOT_READY,
  DEFAULT_MILESTONE_STATUS,
  MILESTONE_STATUSES,
  MILESTONE_STATUS_CATEGORY,
  SHIPPED_ON_MERGE,
  STATUS_ALIAS_CONFLICT,
  STATUS_STALE,
  UNKNOWN_STATUS,
  WORK_STATUS_ALIAS_INVALID,
  apiStatusFields,
  apiStatusInput,
  backfillPageSize,
  isMilestoneStatus,
  legacyWorkStatus,
  milestoneStatusOf,
  nextStatus,
  planRetiredFieldsPage,
  planStatusBackfill,
  planStatusBackfillPage,
  statusFromWorkStatus,
  statusOptionLock,
  transitionMilestone,
  type MilestoneStatus,
} from './milestoneStatus';

describe('milestone status list', () => {
  it('has the seven values in order', () => {
    assert.deepEqual(MILESTONE_STATUSES, [
      'Idea',
      'Planning',
      'Awaiting Go',
      'Building',
      'Ready to Ship',
      'Shipped',
      'Parked',
    ]);
    assert.equal(DEFAULT_MILESTONE_STATUS, 'Planning');
  });

  it('knows a status from anything else', () => {
    assert.equal(isMilestoneStatus('Awaiting Go'), true);
    assert.equal(isMilestoneStatus('ready'), false);
    assert.equal(isMilestoneStatus('shipped'), false);
    assert.equal(isMilestoneStatus(null), false);
  });

  it('maps every status to a category', () => {
    assert.deepEqual(MILESTONE_STATUS_CATEGORY, {
      Idea: 'not_started',
      Planning: 'not_started',
      'Awaiting Go': 'not_started',
      Building: 'started',
      'Ready to Ship': 'started',
      Shipped: 'completed',
      Parked: 'canceled',
    });
  });

  it('locks only Shipped in the menu', () => {
    for (const status of MILESTONE_STATUSES) {
      assert.equal(statusOptionLock(status), status === 'Shipped' ? 'shipped' : null);
    }
  });
});

describe('nextStatus', () => {
  it('moves one step along the line', () => {
    assert.equal(nextStatus('Idea'), 'Planning');
    assert.equal(nextStatus('Planning'), 'Awaiting Go');
    assert.equal(nextStatus('Awaiting Go'), 'Building');
    assert.equal(nextStatus('Building'), 'Ready to Ship');
  });

  it('has no next step on Ready to Ship, Shipped or Parked', () => {
    assert.equal(nextStatus('Ready to Ship'), null);
    assert.equal(nextStatus('Shipped'), null);
    assert.equal(nextStatus('Parked'), null);
  });
});

describe('transitionMilestone · set', () => {
  it('lets a person pick any status except Shipped, forward or back', () => {
    for (const from of MILESTONE_STATUSES) {
      for (const to of MILESTONE_STATUSES) {
        const result = transitionMilestone({ from, cause: 'set', to });
        if (to === from) {
          assert.deepEqual(result, { ok: true, from, status: from, wrote: false });
        } else if (to === 'Shipped') {
          assert.deepEqual(result, { ok: false, reason: SHIPPED_ON_MERGE, code: 'shipped' });
        } else {
          assert.deepEqual(result, { ok: true, from, status: to, wrote: true });
        }
      }
    }
  });

  it('keeps Shipped as a no-op when it is already Shipped', () => {
    assert.deepEqual(transitionMilestone({ from: 'Shipped', cause: 'set', to: 'Shipped' }), {
      ok: true,
      from: 'Shipped',
      status: 'Shipped',
      wrote: false,
    });
  });

  it('rejects a value that is not a status', () => {
    for (const to of ['ready', 'shipped', 'In review', '', null, undefined]) {
      assert.deepEqual(transitionMilestone({ from: 'Planning', cause: 'set', to }), {
        ok: false,
        reason: UNKNOWN_STATUS,
        code: 'unknown',
      });
    }
  });

  it('rejects a stale expected status, and treats a repeat as a no-op', () => {
    assert.deepEqual(
      transitionMilestone({ from: 'Building', cause: 'set', to: 'Awaiting Go', expected: 'Building' }),
      { ok: true, from: 'Building', status: 'Awaiting Go', wrote: true },
    );
    assert.deepEqual(
      transitionMilestone({ from: 'Parked', cause: 'set', to: 'Awaiting Go', expected: 'Building' }),
      { ok: false, reason: STATUS_STALE, code: 'stale' },
    );
    assert.deepEqual(
      transitionMilestone({ from: 'Awaiting Go', cause: 'set', to: 'Awaiting Go', expected: 'Building' }),
      { ok: true, from: 'Awaiting Go', status: 'Awaiting Go', wrote: false },
    );
  });

  it('locks AI out of an approved milestone', () => {
    const locked = transitionMilestone({ from: 'Ready to Ship', cause: 'set', to: 'Building', actor: 'ai', approval: 'approved' });
    assert.equal(locked.ok, false);
    assert.equal(locked.ok === false && locked.code, 'locked');
    const open = transitionMilestone({ from: 'Planning', cause: 'set', to: 'Building', actor: 'ai', approval: 'unreviewed' });
    assert.deepEqual(open, { ok: true, from: 'Planning', status: 'Building', wrote: true });
    const human = transitionMilestone({ from: 'Ready to Ship', cause: 'set', to: 'Building', actor: 'human', approval: 'approved' });
    assert.equal(human.ok, true);
  });

  it('never lets AI set Shipped', () => {
    const result = transitionMilestone({ from: 'Ready to Ship', cause: 'set', to: 'Shipped', actor: 'ai', approval: 'unreviewed' });
    assert.deepEqual(result, { ok: false, reason: SHIPPED_ON_MERGE, code: 'shipped' });
  });
});

describe('transitionMilestone · advance', () => {
  const steps: [MilestoneStatus, MilestoneStatus][] = [
    ['Idea', 'Planning'],
    ['Planning', 'Awaiting Go'],
    ['Awaiting Go', 'Building'],
    ['Building', 'Ready to Ship'],
  ];

  it('moves each playable status one step', () => {
    for (const [from, to] of steps) {
      assert.deepEqual(transitionMilestone({ from, cause: 'advance', expected: from }), {
        ok: true,
        from,
        status: to,
        wrote: true,
      });
    }
  });

  it('has nowhere to go from Ready to Ship, Shipped or Parked', () => {
    for (const from of ['Ready to Ship', 'Shipped', 'Parked'] as const) {
      const result = transitionMilestone({ from, cause: 'advance', expected: from });
      assert.equal(result.ok, false);
      assert.equal(result.ok === false && result.code, 'no_next');
    }
  });

  it('never reaches Shipped by play', () => {
    for (const from of MILESTONE_STATUSES) {
      const result = transitionMilestone({ from, cause: 'advance' });
      if (result.ok) assert.notEqual(result.status, 'Shipped');
    }
  });

  it('rejects a status that changed underneath', () => {
    assert.deepEqual(transitionMilestone({ from: 'Parked', cause: 'advance', expected: 'Planning' }), {
      ok: false,
      reason: STATUS_STALE,
      code: 'stale',
    });
    assert.deepEqual(transitionMilestone({ from: 'Idea', cause: 'advance', expected: 'Planning' }), {
      ok: false,
      reason: STATUS_STALE,
      code: 'stale',
    });
  });

  it('is a no-op when the same click arrives twice', () => {
    assert.deepEqual(transitionMilestone({ from: 'Awaiting Go', cause: 'advance', expected: 'Planning' }), {
      ok: true,
      from: 'Awaiting Go',
      status: 'Awaiting Go',
      wrote: false,
    });
  });

  it('does not skip a step', () => {
    const skip = transitionMilestone({ from: 'Planning', cause: 'advance', to: 'Building' });
    assert.equal(skip.ok, false);
    const named = transitionMilestone({ from: 'Planning', cause: 'advance', to: 'Awaiting Go' });
    assert.deepEqual(named, { ok: true, from: 'Planning', status: 'Awaiting Go', wrote: true });
  });

  it('rejects an expected value that is not a status', () => {
    assert.deepEqual(transitionMilestone({ from: 'Planning', cause: 'advance', expected: 'draft' }), {
      ok: false,
      reason: UNKNOWN_STATUS,
      code: 'unknown',
    });
  });
});

describe('transitionMilestone · review and merge', () => {
  it('approves only from Ready to Ship, and keeps the status', () => {
    assert.deepEqual(transitionMilestone({ from: 'Ready to Ship', cause: 'approve' }), {
      ok: true,
      from: 'Ready to Ship',
      status: 'Ready to Ship',
      wrote: false,
    });
    for (const from of MILESTONE_STATUSES.filter((status) => status !== 'Ready to Ship')) {
      assert.deepEqual(transitionMilestone({ from, cause: 'approve' }), {
        ok: false,
        reason: APPROVE_NOT_READY,
        code: 'not_ready',
      });
    }
  });

  it('request changes returns Ready to Ship to Building', () => {
    assert.deepEqual(transitionMilestone({ from: 'Ready to Ship', cause: 'request_changes' }), {
      ok: true,
      from: 'Ready to Ship',
      status: 'Building',
      wrote: true,
    });
    assert.equal(transitionMilestone({ from: 'Building', cause: 'request_changes' }).ok, false);
  });

  it('merge is the only way to Shipped, and repeats as a no-op', () => {
    assert.deepEqual(transitionMilestone({ from: 'Ready to Ship', cause: 'merge' }), {
      ok: true,
      from: 'Ready to Ship',
      status: 'Shipped',
      wrote: true,
    });
    assert.deepEqual(transitionMilestone({ from: 'Shipped', cause: 'merge' }), {
      ok: true,
      from: 'Shipped',
      status: 'Shipped',
      wrote: false,
    });
  });
});

describe('reading old rows', () => {
  it('prefers status, then stage, then work status', () => {
    assert.equal(milestoneStatusOf({ status: 'Parked', stage: 'Building', workStatus: 'ready' }), 'Parked');
    assert.equal(milestoneStatusOf({ stage: 'Awaiting Go', workStatus: 'ready' }), 'Awaiting Go');
    assert.equal(milestoneStatusOf({ workStatus: 'draft' }), 'Planning');
    assert.equal(milestoneStatusOf({ workStatus: 'active' }), 'Building');
    assert.equal(milestoneStatusOf({ workStatus: 'ready' }), 'Ready to Ship');
    assert.equal(milestoneStatusOf({}), 'Planning');
    assert.equal(milestoneStatusOf({ status: 'nonsense', stage: null, workStatus: 'active' }), 'Building');
  });

  it('maps work status both ways for the API alias', () => {
    assert.equal(statusFromWorkStatus('draft'), 'Planning');
    assert.equal(statusFromWorkStatus('active'), 'Building');
    assert.equal(statusFromWorkStatus('ready'), 'Ready to Ship');
    assert.equal(legacyWorkStatus('Idea'), 'draft');
    assert.equal(legacyWorkStatus('Planning'), 'draft');
    assert.equal(legacyWorkStatus('Awaiting Go'), 'draft');
    assert.equal(legacyWorkStatus('Parked'), 'draft');
    assert.equal(legacyWorkStatus('Building'), 'active');
    assert.equal(legacyWorkStatus('Ready to Ship'), 'ready');
    assert.equal(legacyWorkStatus('Shipped'), 'ready');
  });
});

describe('status backfill', () => {
  it('skips a row that already has a status', () => {
    assert.deepEqual(planStatusBackfill({ status: 'Building', stage: 'Idea', workStatus: 'ready' }), {
      action: 'skip',
      status: 'Building',
    });
  });

  it('takes the stage when there is one', () => {
    assert.deepEqual(planStatusBackfill({ stage: 'Awaiting Go', workStatus: 'draft' }), {
      action: 'set',
      status: 'Awaiting Go',
      source: 'stage',
      disagreements: [],
    });
  });

  it('falls back to work status: draft, active, ready', () => {
    assert.deepEqual(planStatusBackfill({ workStatus: 'draft' }), {
      action: 'set',
      status: 'Planning',
      source: 'workStatus',
      disagreements: [],
    });
    assert.equal(planStatusBackfill({ workStatus: 'active' }).status, 'Building');
    assert.equal(planStatusBackfill({ workStatus: 'ready' }).status, 'Ready to Ship');
  });

  it('reports a stage and work status that disagreed', () => {
    const plan = planStatusBackfill({ stage: 'Building', workStatus: 'ready' });
    assert.equal(plan.action, 'set');
    assert.equal(plan.status, 'Building');
    assert.deepEqual(plan.action === 'set' && plan.disagreements, ['stage Building, work status ready']);
  });

  it('reports an old status picker that disagreed', () => {
    const plan = planStatusBackfill({ stage: 'Planning', workStatus: 'draft', detailStatus: 'complete' });
    assert.deepEqual(plan.action === 'set' && plan.disagreements, [
      'stage gives Planning, old status picker complete',
    ]);
    const fromWork = planStatusBackfill({ workStatus: 'ready', detailStatus: 'complete' });
    assert.deepEqual(fromWork.action === 'set' && fromWork.disagreements, [
      'work status gives Ready to Ship, old status picker complete',
    ]);
  });

  it('does not flag Parked or a matching picker', () => {
    assert.deepEqual(
      planStatusBackfill({ stage: 'Parked', workStatus: 'active', detailStatus: 'draft' }).action === 'set' &&
        planStatusBackfill({ stage: 'Parked', workStatus: 'active', detailStatus: 'draft' }),
      { action: 'set', status: 'Parked', source: 'stage', disagreements: [] },
    );
    const shipped = planStatusBackfill({ stage: 'Shipped', workStatus: 'ready', detailStatus: 'complete' });
    assert.deepEqual(shipped.action === 'set' && shipped.disagreements, []);
  });

  it('summarises a page and lists only rows to write', () => {
    const report = planStatusBackfillPage([
      { id: 'a', name: 'A', status: 'Building' },
      { id: 'b', name: 'B', stage: 'Idea', workStatus: 'draft' },
      { id: 'c', name: 'C', stage: 'Building', workStatus: 'ready', detailStatus: 'in_review' },
      { id: 'd', name: 'D', workStatus: 'active' },
    ]);
    assert.equal(report.scanned, 4);
    assert.equal(report.alreadySet, 1);
    assert.equal(report.toSet, 3);
    assert.deepEqual(report.writes, [
      { id: 'b', status: 'Idea' },
      { id: 'c', status: 'Building' },
      { id: 'd', status: 'Building' },
    ]);
    assert.deepEqual(report.disagreements, [
      {
        id: 'c',
        name: 'C',
        status: 'Building',
        stage: 'Building',
        workStatus: 'ready',
        detailStatus: 'in_review',
        notes: ['stage Building, work status ready', 'stage gives Building, old status picker in_review'],
      },
    ]);
  });

  it('a second pass over written rows writes nothing', () => {
    const first = planStatusBackfillPage([{ id: 'b', name: 'B', stage: 'Idea', workStatus: 'draft' }]);
    const second = planStatusBackfillPage([
      { id: 'b', name: 'B', stage: 'Idea', workStatus: 'draft', status: first.writes[0]!.status },
    ]);
    assert.equal(second.toSet, 0);
    assert.deepEqual(second.writes, []);
  });

  it('bounds the page size', () => {
    assert.equal(backfillPageSize(undefined), 50);
    assert.equal(backfillPageSize(0), 1);
    assert.equal(backfillPageSize(1000), 100);
    assert.equal(backfillPageSize(25.9), 25);
  });
});

describe('staff API aliases', () => {
  it('reads status, and stage and workStatus as aliases', () => {
    assert.deepEqual(apiStatusInput({}), { ok: true, status: null });
    assert.deepEqual(apiStatusInput({ status: 'Building' }), { ok: true, status: 'Building' });
    assert.deepEqual(apiStatusInput({ stage: 'Awaiting Go' }), { ok: true, status: 'Awaiting Go' });
    assert.deepEqual(apiStatusInput({ workStatus: 'draft' }), { ok: true, status: 'Planning' });
    assert.deepEqual(apiStatusInput({ workStatus: 'active' }), { ok: true, status: 'Building' });
    assert.deepEqual(apiStatusInput({ workStatus: 'ready' }), { ok: true, status: 'Ready to Ship' });
  });

  it('accepts aliases that agree and rejects ones that do not', () => {
    assert.deepEqual(apiStatusInput({ status: 'Idea', stage: 'Idea', workStatus: 'draft' }), { ok: true, status: 'Idea' });
    assert.deepEqual(apiStatusInput({ status: 'Idea', stage: 'Building' }), { ok: false, reason: STATUS_ALIAS_CONFLICT });
    assert.deepEqual(apiStatusInput({ status: 'Idea', workStatus: 'ready' }), { ok: false, reason: STATUS_ALIAS_CONFLICT });
    assert.deepEqual(apiStatusInput({ workStatus: 'done' }), { ok: false, reason: WORK_STATUS_ALIAS_INVALID });
  });

  it('passes an unknown status through for the transition to reject', () => {
    const wanted = apiStatusInput({ status: 'Shipping soon' });
    assert.deepEqual(wanted, { ok: true, status: 'Shipping soon' });
    assert.equal(transitionMilestone({ from: 'Planning', cause: 'set', to: wanted.ok ? wanted.status : null }).ok, false);
  });

  it('returns status with both aliases', () => {
    assert.deepEqual(apiStatusFields('Awaiting Go'), { status: 'Awaiting Go', stage: 'Awaiting Go', workStatus: 'draft' });
    assert.deepEqual(apiStatusFields('Ready to Ship'), { status: 'Ready to Ship', stage: 'Ready to Ship', workStatus: 'ready' });
  });
});

describe('clearing retired fields before the schema narrows', () => {
  it('clears only the fields a row still has, and only once it has a status', () => {
    const report = planRetiredFieldsPage([
      { id: 'a', name: 'A', status: 'Building', stage: 'Building', workStatus: 'active', detailStatus: 'in_progress' },
      { id: 'b', name: 'B', status: 'Planning', workStatus: 'draft' },
      { id: 'c', name: 'C', status: 'Idea' },
      { id: 'd', name: 'D', stage: 'Parked', workStatus: 'draft' },
    ]);
    assert.equal(report.scanned, 4);
    assert.equal(report.alreadyClear, 1);
    assert.equal(report.toClear, 2);
    assert.deepEqual(report.writes, [
      { id: 'a', fields: ['stage', 'workStatus', 'detailStatus'] },
      { id: 'b', fields: ['workStatus'] },
    ]);
    assert.deepEqual(report.missingStatus, [{ id: 'd', name: 'D' }]);
  });

  it('writes nothing on a second pass', () => {
    const report = planRetiredFieldsPage([
      { id: 'a', name: 'A', status: 'Building', stage: null, workStatus: null, detailStatus: null },
      { id: 'b', name: 'B', status: 'Planning' },
    ]);
    assert.equal(report.toClear, 0);
    assert.deepEqual(report.writes, []);
    assert.equal(report.alreadyClear, 2);
  });

  it('keeps the status the row already shows', () => {
    const row = { id: 'a', name: 'A', status: 'Awaiting Go', stage: 'Building', workStatus: 'ready' };
    assert.equal(milestoneStatusOf(row), 'Awaiting Go');
    const [write] = planRetiredFieldsPage([row]).writes;
    const cleared = { ...row, ...Object.fromEntries(write!.fields.map((field) => [field, null])) };
    assert.equal(milestoneStatusOf(cleared), 'Awaiting Go');
  });
});
