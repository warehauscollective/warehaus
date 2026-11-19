import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { MilestoneRoadmapView } from '@convex/_lib/milestones';
import { FIXTURE_TASKS } from '@/lib/data/fixtures';
import { applyFixtureMilestonePreview, fixtureMilestones } from '@/lib/data/milestoneRoadmap';
import {
  inclusiveProgressCopy,
  lastReviewLabel,
  MilestoneDetailView,
  MilestoneListCard,
  MoreMenu,
  milestoneDetachOptions,
  clientTileDate,
  milestoneTileDate,
  milestoneTileStage,
  tileMetaLine,
  tileProgressLabel,
} from '@/components/projects/ProjectRoadmap';

Object.assign(globalThis, { React });

const resource = { id: 'r-notes', title: 'Kickoff recap', url: null };

function renderTile(input: {
  staff: boolean;
  milestone: MilestoneRoadmapView;
  phone?: boolean;
  stagePreview?: 'menu' | 'confirm' | null;
}): string {
  return renderToStaticMarkup(
    createElement(MilestoneListCard, {
      milestone: input.milestone,
      staff: input.staff,
      phone: input.phone,
      stagePreview: input.stagePreview,
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
      onMilestone: true,
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
    const staffLaunch = staff[0];
    assert.equal(staffLaunch?.attachableTasks?.some((task) => task.name === 'Check the type scale'), true);
    assert.equal(launch.rows[1]?.status, 'In Progress');
    assert.equal(launch.rows[1]?.stage, 'Building');
    assert.equal(launch.rows[1]?.resourceCount, 3);
    assert.equal('pullRequestUrl' in (launch.rows[1] ?? {}), false);
    assert.equal(
      staffLaunch?.rows[1]?.pullRequestUrl,
      'https://github.com/warehauscollective/warehaus/pull/83',
    );
  });

  it('keeps fixture previews off the default list and behind the query', () => {
    const staff = fixtureMilestones(site, FIXTURE_TASKS, 'staff');
    assert.deepEqual(
      applyFixtureMilestonePreview(staff, '').map((milestone) => milestone.name),
      ['Launch the homepage', 'Billing export draft'],
    );
    const long = applyFixtureMilestonePreview(staff, '?chip=long');
    assert.equal(long[0]?.doneCount, 12);
    assert.equal((long[0]?.doneCount ?? 0) + (long[0]?.openCount ?? 0), 148);
    assert.equal(long[0]?.rows.reduce((sum, row) => sum + row.children.length, 0), 9);
    assert.equal(long[1]?.name, 'Billing export draft');
    const states = applyFixtureMilestonePreview(staff, '?tiles=states');
    assert.deepEqual(
      states.map((milestone) => milestone.name),
      ['Launch the homepage', 'Billing export draft', 'Case study', 'Navigation pass', 'Approved, awaiting merge', 'Production launch'],
    );
    assert.equal(states[2]?.workStatus, 'active');
    assert.equal(states[2]?.approval, 'unreviewed');
    assert.equal(states[3]?.decidedAt, Date.parse('2026-11-03T15:00:00Z'));
    assert.equal(states[4]?.id, 'm-preview-approved');
    assert.equal(states[4]?.approval, 'approved');
    assert.equal(states[4]?.workStatus, 'ready');
    assert.equal(states[4]?.stage ?? null, null);
    assert.notEqual(states[4]?.workStatus, 'active');
    assert.equal(states[5]?.id, 'm-preview-shipped');
    assert.equal(states[5]?.stage, 'Shipped');
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
      status: 'Draft',
      label: 'Planning',
      glyph: '/icons/item-stage.svg',
    });
    assert.deepEqual(milestoneTileStage({ approval: 'unreviewed', workStatus: 'active' }), {
      status: 'In progress',
      label: 'Building',
      glyph: '/icons/task-stage.svg',
    });
    assert.deepEqual(milestoneTileStage({ approval: 'unreviewed', workStatus: 'ready' }), {
      status: 'In review',
      label: 'Ready to Ship',
      glyph: '/icons/task-stage.svg',
    });
    assert.equal(milestoneTileStage({ approval: 'approved', workStatus: 'ready' }).label, 'Ready to Ship');
    assert.equal(milestoneTileStage({ approval: 'approved', workStatus: 'ready' }).status, 'In review');
    assert.equal(milestoneTileStage({ approval: 'approved', workStatus: 'active' }).status, 'In progress');
    assert.equal(milestoneTileStage({ approval: 'approved', workStatus: 'active' }).label, 'Building');
    assert.equal(milestoneTileStage({ approval: 'approved', workStatus: 'active', stage: 'Shipped' }).label, 'Shipped');
    assert.equal(milestoneTileDate({ approval: 'unreviewed', decidedAt: null }), null);
    assert.equal(milestoneTileDate({ approval: 'approved', decidedAt: null }), 'Approved');
    const decidedAt = Date.parse('2026-11-06T15:00:00Z');
    const day = new Date(decidedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    assert.equal(milestoneTileDate({ approval: 'approved', decidedAt }), `Approved ${day}`);
    assert.equal(clientTileDate({ stage: 'Shipped', decidedAt }), `Shipped ${day}`);
    assert.equal(clientTileDate({ stage: 'Ready to Ship', decidedAt }), null);
    assert.equal(clientTileDate({ stage: 'Shipped', decidedAt: null }), 'Shipped');
    assert.equal(tileProgressLabel(1, 3, 0, false), '1 / 3 complete');
    assert.equal(tileProgressLabel(1, 3, 0, true), '1 / 3 tasks complete');
    assert.equal(tileProgressLabel(1, 3, 1, false), '1 / 3 complete · includes 1 subtask');
    assert.equal(tileProgressLabel(1, 3, 1, true), '1 / 3 tasks complete · includes 1 subtask');
    assert.equal(tileProgressLabel(12, 148, 9, true), '12 / 148 tasks complete · includes 9 subtasks');
    assert.equal(
      tileMetaLine({
        staff: true,
        published: false,
        resources: 0,
        decidedAt: null,
        workStatus: 'draft',
        approval: 'unreviewed',
      }),
      'Not published · 0 resources · No review yet',
    );
    assert.equal(
      tileMetaLine({
        staff: false,
        published: false,
        resources: 0,
        decidedAt: null,
        workStatus: 'draft',
        approval: 'unreviewed',
      }),
      '0 resources',
    );
    assert.equal(
      tileMetaLine({
        staff: false,
        published: true,
        resources: 2,
        decidedAt: null,
        workStatus: 'ready',
        approval: 'unreviewed',
      }),
      '',
    );
    assert.equal(
      tileMetaLine({
        staff: true,
        published: true,
        resources: 2,
        decidedAt: null,
        workStatus: 'ready',
        approval: 'unreviewed',
      }),
      '2 resources · No review yet · In review',
    );
    assert.equal(
      tileMetaLine({
        staff: true,
        published: true,
        resources: 2,
        decidedAt: null,
        workStatus: 'ready',
        approval: 'unreviewed',
        omitReview: true,
      }),
      '2 resources',
    );
    assert.equal(
      tileMetaLine({
        staff: true,
        published: true,
        resources: 1,
        decidedAt: null,
        workStatus: 'ready',
        approval: 'approved',
      }),
      '1 resource',
    );
    const reviewedAt = Date.parse('2026-11-03T15:00:00Z');
    const reviewedDay = new Date(reviewedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    assert.equal(
      tileMetaLine({
        staff: true,
        published: true,
        resources: 2,
        decidedAt: reviewedAt,
        workStatus: 'ready',
        approval: 'approved',
      }),
      `2 resources · Last review ${reviewedDay}`,
    );
  });

  it('renders the chip, date, and meta copy for staff and client tiles', () => {
    const source = readFileSync(new URL('../../components/projects/ProjectRoadmap.tsx', import.meta.url), 'utf8');
    assert.match(source, /flex flex-col gap-6 lg:gap-4/);
    assert.equal(source.includes('longChip'), false);
    assert.equal(source.includes("get('chip')"), false);
    const details = readFileSync(new URL('../../components/projects/milestoneDetailsEdit.tsx', import.meta.url), 'utf8');
    assert.match(details, /data-testid="milestone-stage"/);
    assert.match(details, /label="STATUS"/);
    assert.match(details, /label="STAGE"/);

    const withSubtask = renderTile({
      staff: true,
      milestone: tileMilestone({
        resources: [resource],
        rows: [rowWithSubtasks(1)],
      }),
    });
    assert.equal(withSubtask.includes('milestone-due'), false);
    assert.equal(withSubtask.includes('Due '), false);
    assert.match(withSubtask, /1 \/ 3 tasks complete · <span style="white-space:nowrap">includes 1 subtask<\/span>/);
    assert.match(withSubtask, /1 \/ 3 complete · <span style="white-space:nowrap">includes 1 subtask<\/span>/);
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
    assert.match(clientDraft, /data-testid="milestone-meta"[^>]*>0 resources</);
    assert.equal(clientDraft.includes('No review yet'), false);
    assert.equal(clientDraft.includes('Not published'), false);

    const ready = renderTile({
      staff: false,
      milestone: tileMilestone({
        workStatus: 'ready',
        publishToWarehaus: true,
        resources: [resource, { ...resource, id: 'r-2' }],
      }),
    });
    assert.equal(ready.includes('data-testid="milestone-meta"'), false);
    assert.equal(ready.includes('No review yet'), false);
    assert.equal(ready.includes('Ready for review'), false);
    assert.match(ready, /data-testid="milestone-status-chip"[^>]*>[\s\S]*Ready to Ship</);
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
    assert.match(approved, /data-testid="milestone-due"[^>]*>Approved · awaiting merge and deploy</);
    assert.match(approved, />Open milestone</);
    assert.match(approved, />6 \/ 6 tasks complete</);
    assert.match(approved, />6 \/ 6 complete</);
    assert.equal(approved.includes('includes'), false);
    assert.match(approved, new RegExp(`data-testid="milestone-meta"[^>]*>2 resources · Last review ${day}<`));
    assert.match(approved, /data-testid="milestone-status-chip"[^>]*>[\s\S]*Building</);
    assert.equal(approved.includes('Updated'), false);
    assert.equal(approved.includes('Due '), false);
    assert.equal(approved.includes('Ready for review'), false);

    const approvedUndated = renderTile({
      staff: true,
      milestone: tileMilestone({ approval: 'approved', decidedAt: null, resources: [resource] }),
    });
    assert.match(approvedUndated, /data-testid="milestone-due"[^>]*>Approved · awaiting merge and deploy</);
    assert.match(approvedUndated, /data-testid="milestone-meta"[^>]*>1 resource</);
    assert.equal(approvedUndated.includes('No review yet'), false);
    assert.equal(approvedUndated.includes('Due '), false);

    const approvedReady = renderTile({
      staff: true,
      milestone: tileMilestone({
        approval: 'approved',
        workStatus: 'ready',
        decidedAt,
        resources: [resource, { ...resource, id: 'r-2' }],
      }),
    });
    assert.match(approvedReady, /data-testid="milestone-status-chip"[^>]*>[\s\S]*Ready to Ship</);
    assert.match(approvedReady, /data-testid="milestone-due"[^>]*>Approved · awaiting merge and deploy</);
    assert.match(approvedReady, />Open milestone</);
    assert.match(approvedReady, new RegExp(`data-testid="milestone-meta"[^>]*>2 resources · Last review ${day}<`));
    assert.equal(approvedReady.includes('Ready for review'), false);
    assert.equal(approvedReady.includes('Approve &amp; deploy'), false);

    const clientAwaiting = renderTile({
      staff: false,
      milestone: tileMilestone({
        approval: 'approved',
        workStatus: 'ready',
        decidedAt,
      }),
    });
    assert.match(clientAwaiting, /data-testid="milestone-status-chip"[^>]*>[\s\S]*Ready to Ship</);
    assert.equal(clientAwaiting.includes('Approved · awaiting merge and deploy'), false);
    assert.equal(clientAwaiting.includes('milestone-due'), false);
    assert.match(clientAwaiting, />Open milestone</);

    const clientShipped = renderTile({
      staff: false,
      milestone: tileMilestone({
        approval: 'approved',
        workStatus: 'ready',
        stage: 'Shipped',
        decidedAt,
      }),
    });
    assert.match(clientShipped, /data-testid="milestone-status-chip"[^>]*>[\s\S]*Shipped</);
    assert.match(clientShipped, />Open milestone</);
    assert.match(clientShipped, new RegExp(`data-testid="milestone-due"[^>]*>Shipped ${day}<`));
    assert.equal(clientShipped.includes('Approved'), false);

    const shipped = renderTile({
      staff: true,
      milestone: tileMilestone({
        approval: 'approved',
        workStatus: 'ready',
        stage: 'Shipped',
        decidedAt,
      }),
    });
    assert.match(shipped, /data-testid="milestone-status-chip"[^>]*>[\s\S]*Shipped</);
    assert.equal(shipped.includes('Approved · awaiting merge and deploy'), false);
    assert.match(shipped, new RegExp(`data-testid="milestone-due"[^>]*>Approved ${day}<`));

    const longChip = renderTile({
      staff: true,
      milestone: tileMilestone({
        doneCount: 12,
        openCount: 136,
        resources: [resource],
        rows: [rowWithSubtasks(9)],
      }),
    });
    assert.match(longChip, /12 \/ 148 tasks complete · <span style="white-space:nowrap">includes 9 subtasks<\/span>/);
    assert.match(longChip, /12 \/ 148 complete · <span style="white-space:nowrap">includes 9 subtasks<\/span>/);
    assert.match(longChip, /data-testid="milestone-progress"[^>]*white-space:normal/);
    assert.match(longChip, /overflow-wrap:anywhere/);
    assert.match(longChip, /flex-nowrap items-center/);
    assert.match(longChip, /whitespace-nowrap" data-testid="milestone-status-chip"/);
    assert.match(longChip, /data-testid="milestone-meta"[^>]*truncate/);
    assert.doesNotMatch(longChip, /line-clamp/);
    assert.match(longChip, /flex w-full min-w-0 flex-col items-start gap-4 md:flex-row md:flex-wrap md:items-center/);
  });

  it('opens the tile stage menu for staff and confirms on the phone before saving', () => {
    const milestone = tileMilestone({});
    const client = renderTile({ staff: false, milestone, stagePreview: 'menu' });
    assert.match(client, /<span[^>]*data-testid="milestone-status-chip"/);
    assert.equal(client.includes('milestone-stage-menu'), false);
    assert.equal(client.includes('data-milestone-stage-trigger'), false);

    const desktop = renderTile({ staff: true, milestone, stagePreview: 'menu' });
    assert.match(desktop, /<button[^>]*data-testid="milestone-status-chip"/);
    assert.match(desktop, /data-testid="tile-stage-popover"/);
    assert.match(desktop, /data-testid="milestone-stage-menu"/);
    assert.match(desktop, /Saves as soon as you pick/);
    assert.match(desktop, /task-chev-down\.svg/);
    assert.equal(desktop.includes('tile-stage-menu'), false);
    assert.equal(desktop.includes('stage-confirm-sheet'), false);
    assert.equal(desktop.includes('>Close<'), false);
    const shipped = desktop.split('<button').find((part) => part.includes('>Shipped<')) ?? '';
    assert.match(shipped, /disabled=""/);
    assert.match(shipped, /ON MERGE/);

    const phoneMenu = renderTile({ staff: true, milestone, phone: true, stagePreview: 'menu' });
    assert.equal(phoneMenu.includes('tile-stage-popover'), false);
    assert.match(phoneMenu, /data-testid="tile-stage-menu"/);
    assert.match(phoneMenu, /data-testid="milestone-stage-menu"/);
    assert.match(phoneMenu, /Nothing changes until you confirm/);
    assert.match(phoneMenu, />Close</);
    assert.equal(phoneMenu.includes('stage-confirm-sheet'), false);
    assert.equal(phoneMenu.split('portal-modal-scrim').length - 1, 1);

    const phoneConfirm = renderTile({ staff: true, milestone, phone: true, stagePreview: 'confirm' });
    assert.match(phoneConfirm, /data-testid="stage-confirm"/);
    assert.match(phoneConfirm, /data-testid="stage-confirm-sheet"/);
    assert.match(phoneConfirm, /Move this milestone to Planning\?/);
    assert.match(phoneConfirm, /Move to Planning/);
    assert.equal(phoneConfirm.includes('milestone-stage-menu'), false);
    assert.equal(phoneConfirm.includes('tile-stage-menu'), false);
    assert.equal(phoneConfirm.split('portal-modal-scrim').length - 1, 1);
  });

  it('names subtasks in the inclusive progress and leaves a plain count when there are none', () => {
    assert.equal(inclusiveProgressCopy(1, 3, 1), '1 of 3 complete · includes 1 subtask');
    assert.equal(inclusiveProgressCopy(2, 5, 2), '2 of 5 complete · includes 2 subtasks');
    assert.equal(inclusiveProgressCopy(1, 2, 0), '1 of 2 complete');
    assert.equal(inclusiveProgressCopy(0, 0, 0), '0 of 0 complete');
  });
});

const idle = async () => undefined;

function renderDetail(milestone: MilestoneRoadmapView, page = false, staff = true): string {
  return renderToStaticMarkup(
    createElement(MilestoneDetailView, {
      milestone,
      project: site,
      tasks: [],
      staff,
      fixtures: true,
      resourceChoices: [],
      onBack: () => undefined,
      ...(page ? { onBackToProjects: () => undefined } : {}),
      onFixture: () => undefined,
      mutations: {
        save: idle,
        setWorkStatus: idle,
        setPublish: idle,
        attachTask: idle,
        detachTask: idle,
      },
    }),
  );
}

function field(html: string, testId: string): string {
  const match = new RegExp(`data-testid="${testId}"[^>]*>([^<]*)<`).exec(html);
  return match?.[1] ?? '';
}

describe('MilestoneDetailView', () => {
  it('keeps status and stage on one derivation for draft, in progress, ready, and approved', () => {
    const cases = [
      { workStatus: 'draft' as const, approval: 'unreviewed' as const, status: 'Draft', stage: 'Planning' },
      { workStatus: 'active' as const, approval: 'unreviewed' as const, status: 'In progress', stage: 'Building' },
      { workStatus: 'ready' as const, approval: 'unreviewed' as const, status: 'In review', stage: 'Ready to Ship' },
      { workStatus: 'ready' as const, approval: 'approved' as const, status: 'In review', stage: 'Ready to Ship' },
      { workStatus: 'active' as const, approval: 'approved' as const, status: 'In progress', stage: 'Building' },
    ];
    for (const item of cases) {
      const html = renderDetail(tileMilestone({ workStatus: item.workStatus, approval: item.approval }));
      assert.equal(field(html, 'milestone-work-status'), item.status, item.status);
      assert.equal(field(html, 'milestone-stage'), item.stage, item.stage);
    }
  });

  it('prints the last review as the approver and the decision day', () => {
    const decidedAt = Date.parse('2026-11-03T15:00:00Z');
    const day = new Date(decidedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    assert.equal(lastReviewLabel({ approverName: 'Northwind', decidedAt }), `Northwind · ${day}`);
    const html = renderDetail(
      tileMilestone({
        approval: 'approved',
        workStatus: 'ready',
        approverName: 'Northwind',
        decidedAt,
        note: 'Approved with the brand file.',
      }),
    );
    assert.equal(field(html, 'milestone-last-review'), `Northwind · ${day}`);
    assert.equal(html.includes('>Northwind<'), false);
  });

  it('omits the approval row until a review exists', () => {
    const unreviewed = renderDetail(tileMilestone({ approval: 'unreviewed' }));
    assert.equal(unreviewed.includes('data-testid="milestone-approval"'), false);
    const approved = renderDetail(tileMilestone({ approval: 'approved', workStatus: 'ready' }));
    assert.equal(field(approved, 'milestone-approval'), 'Approved');
    const changes = renderDetail(tileMilestone({ approval: 'changes_requested', workStatus: 'active' }));
    assert.equal(field(changes, 'milestone-approval'), 'Changes requested');
  });

  it('ends the detail trail at Milestones', () => {
    const html = renderDetail(tileMilestone({ name: 'Brand system' }), true);
    assert.match(html, /data-testid="nav-breadcrumb-current"[^>]*>Milestones</);
    assert.equal(html.includes('>Brand system</span>'), false);
    assert.match(html, /class="portal-crumb"/);
  });

  it('does not offer the old Review milestone control', () => {
    const ready = renderDetail(tileMilestone({ workStatus: 'ready', approval: 'unreviewed', note: 'Peter wrote this.' }));
    assert.equal(ready.includes('Review milestone'), false);
    assert.equal(ready.includes('data-testid="milestone-review-action"'), false);
    const client = renderDetail(tileMilestone({ workStatus: 'ready', approval: 'approved', note: 'Peter wrote this.', approverName: 'Peter' }), false, false);
    assert.equal(client.includes('Review milestone'), false);
    assert.equal(client.includes('Reviews ·'), false);
    assert.equal(client.includes('data-testid="milestone-approval"'), false);
    assert.equal(client.includes('data-testid="milestone-last-review"'), false);
    assert.equal(client.includes('Peter wrote this.'), false);
    assert.equal(client.includes('APPROVAL'), false);
    assert.equal(client.includes('LAST REVIEW'), false);
  });

  it('offers detach only for tasks linked to the milestone', () => {
    const row = rowWithSubtasks(1);
    row.children.push({
      id: 'sub-free',
      name: 'Unlinked subtask',
      status: 'To Do',
      isDone: false,
      stage: null,
      resourceCount: 0,
      onMilestone: false,
    });
    const milestone = tileMilestone({
      rows: [row],
      attachableTasks: [
        { id: 'sub-0', name: 'Subtask 1' },
        { id: 'sub-free', name: 'Unlinked subtask' },
        { id: 'loose', name: 'Loose subtask' },
      ],
    });
    assert.deepEqual(
      milestoneDetachOptions(milestone.rows).map((task) => task.id),
      ['parent', 'sub-0'],
    );
    const html = renderToStaticMarkup(
      createElement(MoreMenu, {
        milestone,
        busy: false,
        attachable: [
          { id: 'sub-free', name: 'Unlinked subtask' },
          { id: 'loose', name: 'Loose subtask' },
        ],
        onPublish: () => undefined,
        onAttach: () => undefined,
        onDetach: () => undefined,
      }),
    );
    const detach = html.match(/data-testid="milestone-detach"[\s\S]*?<\/select>/)?.[0] ?? '';
    assert.match(detach, /<option value="sub-0">Subtask 1<\/option>/);
    assert.equal(detach.includes('sub-free'), false);
    assert.match(html, /<option value="sub-free">Unlinked subtask<\/option>/);
    assert.match(html, /<option value="loose">Loose subtask<\/option>/);
  });

  it('shows DETAILS from 768px up', () => {
    const html = renderDetail(tileMilestone({ name: 'Launch the homepage' }));
    assert.match(html, /hidden md:block[^>]*>\s*DETAILS\s*</);
  });
});
