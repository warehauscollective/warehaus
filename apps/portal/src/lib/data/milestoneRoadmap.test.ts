import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { FIXTURE_TASKS } from '@/lib/data/fixtures';
import { fixtureMilestones } from '@/lib/data/milestoneRoadmap';
import {
  inclusiveProgressCopy,
  milestoneTileDate,
  milestoneTileStage,
  tileProgressLabel,
  tileUpdatedLine,
} from '@/components/projects/ProjectRoadmap';

const site = {
  id: 'p-site',
  name: 'Northwind site',
  publishToWarehaus: true,
  internal: false,
};

describe('fixture roadmap', () => {
  it('shows the milestone tasks to staff and hides the unpublished milestone from a client', () => {
    const staff = fixtureMilestones(site, FIXTURE_TASKS, 'staff');
    const client = fixtureMilestones(site, FIXTURE_TASKS, 'client');
    assert.deepEqual(
      staff.map((milestone) => milestone.name),
      ['Launch the homepage', 'Billing export draft'],
    );
    assert.deepEqual(
      client.map((milestone) => milestone.name),
      ['Launch the homepage'],
    );
    const launch = client[0];
    assert.ok(launch);
    assert.equal(launch.countIsDecision, false);
    assert.equal(launch.openCount > 0, true);
    assert.deepEqual(
      launch.rows.map((row) => row.name),
      ['Approve the type ramp', 'Build the project page'],
    );
    assert.equal(launch.rows[1]?.children[0]?.name, 'Check the type scale');
    assert.equal(launch.rows[1]?.status, 'In Progress');
    assert.equal(launch.rows[1]?.stage, 'Building');
    assert.equal(launch.rows[1]?.resourceCount, 3);
    assert.equal('pullRequestUrl' in (launch.rows[1] ?? {}), false);
    const staffLaunch = staff[0];
    assert.equal(
      staffLaunch?.rows[1]?.pullRequestUrl,
      'https://github.com/warehauscollective/warehaus/pull/83',
    );
  });
});

describe('roadmap markup', () => {
  it('renders goals as text and does not use a checkbox', () => {
    const source = readFileSync(new URL('../../components/projects/ProjectRoadmap.tsx', import.meta.url), 'utf8');
    assert.match(source, /data-testid="milestone-goals"/);
    assert.match(source, /data-testid="milestone-counts"/);
    assert.match(source, /not the decision/);
    assert.doesNotMatch(source, /type="checkbox"/);
    assert.doesNotMatch(source, /PortalCheckbox/);
    assert.doesNotMatch(source, /percent/);
  });

  it('matches the milestone tile stage, date, and progress chip', () => {
    assert.deepEqual(milestoneTileStage({ approval: 'unreviewed', workStatus: 'draft' }), {
      label: 'Planning',
      glyph: '/icons/item-stage.svg',
    });
    assert.deepEqual(milestoneTileStage({ approval: 'unreviewed', workStatus: 'active' }), {
      label: 'Building',
      glyph: '/icons/task-stage.svg',
    });
    assert.equal(milestoneTileStage({ approval: 'approved', workStatus: 'ready' }).label, 'Shipped');
    assert.equal(milestoneTileDate({ approval: 'unreviewed', decidedAt: null, due: '2026-11-20' }), 'Due Nov 20');
    assert.equal(
      milestoneTileDate({ approval: 'approved', decidedAt: Date.parse('2026-11-06T15:00:00Z'), due: '2026-11-20' }),
      'Approved Nov 6',
    );
    assert.equal(tileProgressLabel(3, 8, false), '3 / 8 complete');
    assert.equal(tileProgressLabel(3, 8, true), '3 / 8 tasks complete');
    assert.equal(tileUpdatedLine(null, Date.parse('2026-11-09T12:00:00Z')), 'Updated today');
    assert.equal(tileUpdatedLine(Date.parse('2026-11-06T15:00:00Z'), Date.parse('2026-11-09T12:00:00Z')), 'Updated Nov 6');
  });

  it('names subtasks in the inclusive progress and leaves a plain count when there are none', () => {
    assert.equal(inclusiveProgressCopy(1, 3, 1), '1 of 3 complete · includes 1 subtask');
    assert.equal(inclusiveProgressCopy(2, 5, 2), '2 of 5 complete · includes 2 subtasks');
    assert.equal(inclusiveProgressCopy(1, 2, 0), '1 of 2 complete');
    assert.equal(inclusiveProgressCopy(0, 0, 0), '0 of 0 complete');
  });
});
