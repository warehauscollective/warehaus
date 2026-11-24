import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mergePulledTask, pullBeatsStamp, type LocalTaskForPull, type PulledTask } from './taskPullMerge';

const T0 = '2026-11-20T10:00:00.000Z';
const T1 = '2026-11-20T11:00:00.000Z';
const ms = (iso: string) => Date.parse(iso);
/** Stage is stamped by its own merge on every pull, as before; these tests are about the other fields. */
const notStage = (stamps: Record<string, unknown>) => Object.fromEntries(Object.entries(stamps).filter(([field]) => field !== 'stage'));

function pulled(fields: Partial<PulledTask> = {}): PulledTask {
  return {
    name: 'Homepage',
    notionPageId: 'page-1',
    status: 'In Progress',
    isDone: false,
    stage: 'Build',
    lastEditedTime: T0,
    priority: 'Low',
    nextAction: null,
    date: '2026-12-01',
    estimate: 'S',
    source: 'notion-ui',
    publishToWarehaus: true,
    ...fields,
  };
}

function local(fields: Partial<LocalTaskForPull> = {}): LocalTaskForPull {
  return {
    status: 'In Progress',
    isDone: false,
    stage: 'Build',
    stageSynced: 'Build',
    lastEditedTime: T0,
    priority: 'Low',
    nextAction: null,
    date: '2026-12-01',
    estimate: 'S',
    source: 'notion-ui',
    publishToWarehaus: true,
    ...fields,
  };
}

describe('pullBeatsStamp', () => {
  it('lets an unstamped field and an equal or newer edit through, and keeps an older one out', () => {
    assert.equal(pullBeatsStamp(null, 0), true);
    assert.equal(pullBeatsStamp({ updatedAt: 100, updatedBy: 'staff' }, 100), true);
    assert.equal(pullBeatsStamp({ updatedAt: 100, updatedBy: 'staff' }, 99), false);
    assert.equal(pullBeatsStamp({ updatedAt: 100, updatedBy: 'staff' }, null), false);
  });
});

describe('mergePulledTask', () => {
  it('takes every pulled value for a new row', () => {
    const merged = mergePulledTask(null, pulled({ resourceNotionIds: ['r1'] }));
    assert.equal(merged.status, 'In Progress');
    assert.equal(merged.date, '2026-12-01');
    assert.deepEqual(merged.resourceNotionIds, ['r1']);
    assert.deepEqual(notStage(merged.fieldStamps), {});
  });

  it('keeps each stamped portal value against an older Notion edit', () => {
    const stamp = { updatedAt: ms(T1), updatedBy: 'contacts:1' };
    const row = local({
      status: 'Done',
      isDone: true,
      priority: 'High',
      nextAction: 'Call the client',
      date: '2026-12-24',
      estimate: 'L',
      source: 'portal',
      publishToWarehaus: false,
      description: 'Portal text',
      descriptionSource: 'property',
      resourceNotionIds: ['r2'],
      fieldStamps: {
        status: stamp,
        priority: stamp,
        nextAction: stamp,
        date: stamp,
        estimate: stamp,
        source: stamp,
        publishToWarehaus: stamp,
        description: stamp,
        resources: stamp,
      },
    });
    const merged = mergePulledTask(row, pulled({ description: 'Notion text', descriptionSource: 'property', resourceNotionIds: ['r1'] }));
    assert.deepEqual(
      [merged.status, merged.isDone, merged.priority, merged.nextAction, merged.date, merged.estimate, merged.source, merged.publishToWarehaus],
      ['Done', true, 'High', 'Call the client', '2026-12-24', 'L', 'portal', false],
    );
    assert.equal(merged.description, undefined, 'a kept description is not patched');
    assert.deepEqual(merged.resourceNotionIds, ['r2']);
    assert.deepEqual(notStage(merged.fieldStamps), row.fieldStamps);
  });

  it('lets a newer Notion edit replace a stamped field and stamps it as Notion', () => {
    const row = local({ date: '2026-12-24', fieldStamps: { date: { updatedAt: ms(T0), updatedBy: 'contacts:1' } } });
    const merged = mergePulledTask(row, pulled({ lastEditedTime: T1, date: '2027-01-05' }));
    assert.equal(merged.date, '2027-01-05');
    assert.deepEqual(merged.fieldStamps.date, { updatedAt: ms(T1), updatedBy: 'notion' });
  });

  it('writes no stamp for an unstamped field Notion left as it was', () => {
    const merged = mergePulledTask(local(), pulled({ lastEditedTime: T1 }));
    assert.deepEqual(notStage(merged.fieldStamps), {});
  });

  it('keeps a pending stage move against an older pull', () => {
    const row = local({ stage: 'Review', stagePendingAt: 1, stagePendingBaseEditedTime: T0, stageSynced: 'Build' });
    const merged = mergePulledTask(row, pulled({ lastEditedTime: T0, stage: 'Build' }));
    assert.equal(merged.stage, 'Review');
    assert.equal(merged.deleteUnsent, false);
    assert.equal(merged.notice, null);
  });

  it('gives a newer Notion stage the field, clears the pending move, and raises the notice', () => {
    const row = local({ stage: 'Review', stagePendingAt: 1, stagePendingBaseEditedTime: T0, stageSynced: 'Build' });
    const merged = mergePulledTask(row, pulled({ lastEditedTime: T1, stage: 'Planning' }));
    assert.equal(merged.stage, 'Planning');
    assert.equal(merged.stagePatch.stagePendingAt, undefined);
    assert.equal('stagePendingBy' in merged.stagePatch, true);
    assert.equal(merged.deleteUnsent, true);
    assert.match(merged.notice?.message ?? '', /Planning after a portal move to Review/);
  });
});
