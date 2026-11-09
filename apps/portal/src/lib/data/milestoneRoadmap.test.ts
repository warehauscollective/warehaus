import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { MilestoneRoadmapView } from '@convex/_lib/milestones';
import { FIXTURE_TASKS } from '@/lib/data/fixtures';
import { fixtureMilestones } from '@/lib/data/milestoneRoadmap';
import {
  inclusiveProgressCopy,
  MilestoneListCard,
  milestoneTileDate,
  milestoneTileStage,
  tileMetaLine,
  tileProgressLabel,
} from '@/components/projects/ProjectRoadmap';

Object.assign(globalThis, { React });

const resource = { id: 'r-notes', title: 'Kickoff recap', url: null };

function renderTile(input: { staff: boolean; milestone: MilestoneRoadmapView; nested?: number }): string {
  return renderToStaticMarkup(
    createElement(MilestoneListCard, {
      milestone: input.milestone,
      staff: input.staff,
      nested: input.nested,
      onOpen: () => undefined,
    }),
  );
}

function rowWithSubtasks(count: number) {
  return {
    id: 'parent',
    name: 'Build the project page',
    status: 'In Progress',
    isDone: false,
    stage: 'Building',
    resourceCount: 0,
    children: Array.from({ length: count }, (_, index) => ({
      id: `sub-${index}`,
      name: `Subtask ${index + 1}`,
      status: 'To Do',
      isDone: false,
      stage: null,
      resourceCount: 0,
    })),
  };
}

function tileMilestone(patch: Partial<MilestoneRoadmapView>): MilestoneRoadmapView {
  return {
    id: 'm-launch',
    name: 'Launch the homepage',
    objective: 'The homepage matches the approved frame.',
    goals: [],
    workStatus: 'active',
    approval: 'unreviewed',
    note: null,
    approverName: null,
    decidedAt: null,
    publishToWarehaus: true,
    resources: [],
    openCount: 2,
    doneCount: 1,
    countIsDecision: false,
    rows: [],
    ...patch,
  };
}

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
    assert.deepEqual(milestoneTileStage({ approval: 'unreviewed', workStatus: 'ready' }), {
      label: 'Building',
      glyph: '/icons/task-stage.svg',
    });
    assert.equal(milestoneTileStage({ approval: 'approved', workStatus: 'ready' }).label, 'Shipped');
    assert.equal(milestoneTileDate({ approval: 'unreviewed', decidedAt: null }), null);
    assert.equal(milestoneTileDate({ approval: 'approved', decidedAt: null }), 'Approved');
    const decidedAt = Date.parse('2026-11-06T15:00:00Z');
    const day = new Date(decidedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    assert.equal(milestoneTileDate({ approval: 'approved', decidedAt }), `Approved ${day}`);
    assert.equal(tileProgressLabel(1, 3, 0, false), '1 / 3 complete');
    assert.equal(tileProgressLabel(1, 3, 0, true), '1 / 3 tasks complete');
    assert.equal(tileProgressLabel(1, 3, 1, false), '1 / 3 complete · includes 1 subtask');
    assert.equal(tileProgressLabel(1, 3, 1, true), '1 / 3 tasks complete · includes 1 subtask');
    assert.equal(tileProgressLabel(12, 148, 9, true), '12 / 148 tasks complete · includes 9 subtasks');
    assert.equal(
      tileMetaLine({ staff: true, published: false, resources: 0, decidedAt: null, workStatus: 'draft' }),
      'Not published · 0 resources · No review yet',
    );
    assert.equal(
      tileMetaLine({ staff: false, published: false, resources: 0, decidedAt: null, workStatus: 'draft' }),
      '0 resources · No review yet',
    );
    assert.equal(
      tileMetaLine({ staff: true, published: true, resources: 2, decidedAt: null, workStatus: 'ready' }),
      '2 resources · No review yet · Ready for review',
    );
  });

  it('renders the chip, date, and meta copy for staff and client tiles', () => {
    const source = readFileSync(new URL('../../components/projects/ProjectRoadmap.tsx', import.meta.url), 'utf8');
    assert.match(source, /flex flex-col gap-6 lg:gap-4/);
    assert.match(source, /data-testid="milestone-stage"/);
    assert.match(source, /<FieldLabel>STATUS<\/FieldLabel>/);
    assert.match(source, /<FieldLabel>STAGE<\/FieldLabel>/);

    const withSubtask = renderTile({
      staff: true,
      milestone: tileMilestone({
        resources: [resource],
        rows: [rowWithSubtasks(1)],
      }),
    });
    assert.equal(withSubtask.includes('milestone-due'), false);
    assert.equal(withSubtask.includes('Due '), false);
    assert.match(withSubtask, />1 \/ 3 tasks complete · includes 1 subtask</);
    assert.match(withSubtask, />1 \/ 3 complete · includes 1 subtask</);
    assert.match(withSubtask, /data-testid="milestone-meta"[^>]*>1 resource · No review yet</);
    assert.equal(withSubtask.includes('Not published'), false);
    assert.equal(withSubtask.includes('Ready for review'), false);
    assert.equal(withSubtask.includes('Updated'), false);
    assert.match(withSubtask, /data-testid="milestone-status-chip"[^>]*>[\s\S]*Building</);

    const plain = renderTile({
      staff: true,
      milestone: tileMilestone({ resources: [resource], rows: [] }),
    });
    assert.match(plain, />1 \/ 3 tasks complete</);
    assert.match(plain, />1 \/ 3 complete</);
    assert.equal(plain.includes('includes'), false);

    const staffDraft = renderTile({
      staff: true,
      milestone: tileMilestone({ publishToWarehaus: false, workStatus: 'draft', resources: [] }),
    });
    assert.match(staffDraft, /data-testid="milestone-meta"[^>]*>Not published · 0 resources · No review yet</);
    assert.match(staffDraft, /data-testid="milestone-status-chip"[^>]*>[\s\S]*Planning</);
    assert.equal(staffDraft.includes('Updated'), false);

    const clientDraft = renderTile({
      staff: false,
      milestone: tileMilestone({ publishToWarehaus: false, workStatus: 'draft', resources: [] }),
    });
    assert.match(clientDraft, /data-testid="milestone-meta"[^>]*>0 resources · No review yet</);
    assert.equal(clientDraft.includes('Not published'), false);

    const ready = renderTile({
      staff: false,
      milestone: tileMilestone({
        workStatus: 'ready',
        resources: [resource, { ...resource, id: 'r-2' }],
      }),
    });
    assert.match(ready, /data-testid="milestone-meta"[^>]*>2 resources · No review yet · Ready for review</);
    assert.match(ready, /data-testid="milestone-status-chip"[^>]*>[\s\S]*Building</);
    assert.equal(ready.includes('Not published'), false);
    assert.equal(ready.includes('Updated'), false);

    const decidedAt = Date.parse('2026-11-03T15:00:00Z');
    const day = new Date(decidedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const approved = renderTile({
      staff: true,
      milestone: tileMilestone({
        approval: 'approved',
        workStatus: 'active',
        decidedAt,
        resources: [resource, { ...resource, id: 'r-2' }],
        openCount: 0,
        doneCount: 6,
      }),
    });
    assert.match(approved, new RegExp(`data-testid="milestone-due"[^>]*>Approved ${day}<`));
    assert.match(approved, />6 \/ 6 tasks complete</);
    assert.match(approved, />6 \/ 6 complete</);
    assert.equal(approved.includes('includes'), false);
    assert.match(approved, new RegExp(`data-testid="milestone-meta"[^>]*>2 resources · Last review ${day}<`));
    assert.match(approved, /data-testid="milestone-status-chip"[^>]*>[\s\S]*Shipped</);
    assert.equal(approved.includes('Updated'), false);
    assert.equal(approved.includes('Due '), false);
    assert.equal(approved.includes('Ready for review'), false);

    const approvedUndated = renderTile({
      staff: true,
      milestone: tileMilestone({ approval: 'approved', decidedAt: null, resources: [resource] }),
    });
    assert.match(approvedUndated, /data-testid="milestone-due"[^>]*>Approved</);
    assert.match(approvedUndated, /data-testid="milestone-meta"[^>]*>1 resource · No review yet</);
    assert.equal(approvedUndated.includes('Due '), false);

    const longChip = renderTile({
      staff: true,
      nested: 9,
      milestone: tileMilestone({ doneCount: 12, openCount: 136, resources: [resource] }),
    });
    assert.match(longChip, />12 \/ 148 tasks complete · includes 9 subtasks</);
    assert.match(longChip, />12 \/ 148 complete · includes 9 subtasks</);
    assert.match(longChip, /white-space:normal/);
    assert.match(longChip, /overflow-wrap:anywhere/);
    assert.doesNotMatch(longChip, /flex-nowrap/);
    assert.doesNotMatch(longChip, /truncate/);
    assert.doesNotMatch(longChip, /whitespace-nowrap/);
    assert.doesNotMatch(longChip, /line-clamp/);
    assert.match(longChip, /data-testid="milestone-meta"[^>]*class="block min-w-0 w-full max-w-full"/);
    assert.match(longChip, /flex w-full min-w-0 flex-col items-start gap-4/);
  });

  it('names subtasks in the inclusive progress and leaves a plain count when there are none', () => {
    assert.equal(inclusiveProgressCopy(1, 3, 1), '1 of 3 complete · includes 1 subtask');
    assert.equal(inclusiveProgressCopy(2, 5, 2), '2 of 5 complete · includes 2 subtasks');
    assert.equal(inclusiveProgressCopy(1, 2, 0), '1 of 2 complete');
    assert.equal(inclusiveProgressCopy(0, 0, 0), '0 of 0 complete');
  });
});
