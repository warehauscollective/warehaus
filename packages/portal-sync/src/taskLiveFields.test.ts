import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { planTaskLiveFieldsWrite, taskLiveFieldsWriteError } from './taskLiveFields';

const page = {
  actor: 'staff' as const,
  notionPageId: 'page-1',
  expectedLastEditedTime: '2026-10-28T00:00:00.000Z',
};

describe('task live field writes', () => {
  it('plans Estimate, Priority, Source, and publish for staff', () => {
    const planned = planTaskLiveFieldsWrite({
      ...page,
      estimate: 'M',
      priority: 'High',
      source: 'portal',
      publishToWarehaus: false,
    });
    assert.equal(planned.ok, true);
    if (!planned.ok) return;
    assert.deepEqual(planned.properties, {
      Estimate: 'M',
      Priority: 'High',
      Source: 'portal',
      'Publish to Warehaus': false,
    });
    assert.equal(
      planned.idempotencyKey,
      'task-fields:page-1:Estimate=M|Priority=High|Publish to Warehaus=false|Source=portal:2026-10-28T00:00:00.000Z',
    );
  });

  it('plans one field and a cleared select', () => {
    const estimate = planTaskLiveFieldsWrite({ ...page, estimate: '  XL  ' });
    assert.equal(estimate.ok, true);
    if (estimate.ok) assert.deepEqual(estimate.properties, { Estimate: 'XL' });
    const cleared = planTaskLiveFieldsWrite({ ...page, priority: '  ' });
    assert.equal(cleared.ok, true);
    if (cleared.ok) assert.deepEqual(cleared.properties, { Priority: null });
  });

  it('rejects a client, an unknown option, and an empty patch', () => {
    assert.deepEqual(planTaskLiveFieldsWrite({ ...page, actor: 'client', estimate: 'S' }), {
      ok: false,
      error: 'Clients cannot edit these task fields.',
    });
    assert.deepEqual(planTaskLiveFieldsWrite({ ...page, estimate: '3 days' }), {
      ok: false,
      error: 'Unknown estimate',
    });
    assert.deepEqual(planTaskLiveFieldsWrite({ ...page, source: 'notion' }), {
      ok: false,
      error: 'Unknown source',
    });
    assert.deepEqual(planTaskLiveFieldsWrite(page), {
      ok: false,
      error: 'At least one property is required',
    });
    assert.equal(planTaskLiveFieldsWrite({ ...page, expectedLastEditedTime: '', estimate: 'S' }).ok, false);
    assert.equal(
      taskLiveFieldsWriteError({ Status: 'Done', Estimate: 'S' }),
      'Task field updates can only set Estimate, Priority, Source, or Publish to Warehaus',
    );
    assert.equal(taskLiveFieldsWriteError({ 'Publish to Warehaus': 'yes' }), 'Publish to Warehaus must be true or false');
    assert.equal(taskLiveFieldsWriteError({ 'Is Done': true }), 'Task field updates can only set Estimate, Priority, Source, or Publish to Warehaus');
  });
});
