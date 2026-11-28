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
  milestoneTileHeadline,
  milestoneTileStatus,
  tileMetaLine,
  tileProgressLabel,
  tileStageMenuBox,
} from '@/components/projects/ProjectRoadmap';
import { readRoadmapSource } from '../../components/projects/roadmapSource';

Object.assign(globalThis, { React });

const resource = { id: 'r-notes', title: 'Kickoff recap', url: null };

function renderTile(input: {
  staff: boolean;
  milestone: MilestoneRoadmapView;
  phone?: boolean;
  stagePreview?: 'menu' | null;
  isPeter?: boolean;
}): string {
  return renderToStaticMarkup(
    createElement(MilestoneListCard, {
      milestone: input.milestone,
      staff: input.staff,
      isPeter: input.isPeter,
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
    status: 'Building',
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
    const shipped = applyFixtureMilestonePreview(staff, '?shipped=1');
    assert.equal(shipped.at(-1)?.id, 'm-preview-shipped');
    assert.equal(shipped.at(-1)?.status, 'Shipped');
    assert.equal(shipped.at(-1)?.name, 'Design system foundation');
    const states = applyFixtureMilestonePreview(staff, '?tiles=states');
    assert.deepEqual(
      states.map((milestone) => milestone.name),
      ['Launch the homepage', 'Billing export draft', 'Case study', 'Navigation pass', 'Approved, awaiting merge', 'Production launch'],
    );
    assert.equal(states[2]?.status, 'Building');
    assert.equal(states[2]?.approval, 'unreviewed');
    assert.equal(states[3]?.decidedAt, Date.parse('2026-11-03T15:00:00Z'));
    assert.equal(states[4]?.id, 'm-preview-approved');
    assert.equal(states[4]?.approval, 'approved');
    assert.equal(states[4]?.status, 'Ready to Ship');
    assert.equal(states[5]?.id, 'm-preview-shipped');
    assert.equal(states[5]?.status, 'Shipped');
    const links = applyFixtureMilestonePreview(staff, '?tiles=links');
    assert.equal(links[0]?.localPreviewUrl, 'http://localhost:3200');
    assert.equal(links[0]?.figmaUrl, 'https://www.figma.com/design/TS3DcaCgrIdYf0jhvnMy3k/Portal');
    assert.equal(links[1]?.figmaUrl ?? null, null);
    assert.equal(links[1]?.localPreviewUrl ?? null, null);
    const ready = applyFixtureMilestonePreview(staff, '?tiles=ready');
    assert.equal(ready[0]?.review?.previewUrl, 'https://warehaus-portal-git-order-ahead-warehaus-collective.vercel.app');
    assert.equal(ready[0]?.figmaUrl, 'https://www.figma.com/design/TS3DcaCgrIdYf0jhvnMy3k/Portal');
    const plain = applyFixtureMilestonePreview(staff, '?tiles=nofigma');
    assert.equal(plain[0]?.localPreviewUrl, 'http://localhost:3201');
    assert.equal(plain[0]?.figmaUrl ?? null, null);
    const readyClose = applyFixtureMilestonePreview(staff, '?close=ready');
    const openTasks = readyClose[0]?.rows.flatMap((row) => [row, ...row.children]) ?? [];
    assert.ok(openTasks.length > 0);
    assert.equal(openTasks.every((task) => task.isDone && task.status === 'Done'), true);
    assert.equal(readyClose[0]?.openCount, 0);
    assert.equal(readyClose[1]?.name, 'Billing export draft');
    assert.equal(readyClose[1]?.rows.length, staff[1]?.rows.length);
  });
});

describe('roadmap markup', () => {
  it('renders goals as text and does not use a checkbox', () => {
    const source = readRoadmapSource();
    assert.match(source, /data-testid="milestone-goals"/);
    assert.match(source, /data-testid="milestone-counts"/);
    assert.match(source, /not the decision/);
    assert.doesNotMatch(source, /type="checkbox"/);
    assert.doesNotMatch(source, /PortalCheckbox/);
    assert.doesNotMatch(source, /percent/);
  });

  it('matches the milestone tile status, date, and progress chip', () => {
    assert.deepEqual(milestoneTileStatus({ status: 'Planning' }), {
      label: 'Planning',
      glyph: '/icons/item-stage.svg',
    });
    assert.deepEqual(milestoneTileStatus({ status: 'Building' }), {
      label: 'Building',
      glyph: '/icons/task-stage.svg',
    });
    assert.deepEqual(milestoneTileStatus({ status: 'Ready to Ship' }), {
      label: 'Ready to Ship',
      glyph: '/icons/task-stage.svg',
    });
    assert.equal(milestoneTileStatus({ status: 'Shipped' }).label, 'Shipped');
    assert.equal(milestoneTileStatus({ status: 'Shipped' }).glyph, '/icons/task-stage-shipped.svg');
    assert.equal('status' in milestoneTileStatus({ status: 'Building' }), false);
    assert.equal(milestoneTileDate({ approval: 'unreviewed', decidedAt: null }), null);
    assert.equal(milestoneTileDate({ approval: 'approved', decidedAt: null }), 'Approved');
    const decidedAt = Date.parse('2026-11-06T15:00:00Z');
    const day = new Date(decidedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    assert.equal(milestoneTileDate({ approval: 'approved', decidedAt }), `Approved ${day}`);
    assert.equal(clientTileDate({ status: 'Shipped', decidedAt }), `Shipped ${day}`);
    assert.equal(clientTileDate({ status: 'Ready to Ship', decidedAt }), null);
    assert.equal(clientTileDate({ status: 'Shipped', decidedAt: null }), 'Shipped');
    assert.equal(
      milestoneTileHeadline({ staff: true, approval: 'unreviewed', dueDate: '2026-11-20' }),
      'Due Nov 20',
    );
    assert.equal(
      milestoneTileHeadline({ staff: true, approval: 'approved', status: 'Building', dueDate: '2026-11-20' }),
      null,
    );
    assert.equal(
      milestoneTileHeadline({ staff: true, approval: 'approved', status: 'Shipped', decidedAt }),
      `Approved ${day}`,
    );
    assert.equal(tileProgressLabel(1, 3, 0, false), '1 / 3 complete');
    assert.equal(tileProgressLabel(1, 3, 0, true), '1 / 3 tasks complete');
    assert.equal(tileProgressLabel(1, 3, 1, false), '1 / 3 complete · includes 1 subtask');
    assert.equal(tileProgressLabel(1, 3, 1, true), '1 / 3 tasks complete · includes 1 subtask');
    assert.equal(tileProgressLabel(12, 148, 9, true), '12 / 148 tasks complete · includes 9 subtasks');
    assert.equal(tileMetaLine({ resources: 0 }), '0 resources');
    assert.equal(tileMetaLine({ resources: 1 }), '1 resource');
    assert.equal(tileMetaLine({ resources: 2 }), '2 resources');
    assert.equal(tileMetaLine({ resources: 2 }).includes('Updated'), false);
  });

  it('renders the chip, date, and meta copy for staff and client tiles', () => {
    const source = readRoadmapSource();
    assert.match(source, /flex flex-col gap-6 lg:gap-4/);
    assert.equal(source.includes('longChip'), false);
    assert.equal(source.includes("get('chip')"), false);
    const details = readFileSync(new URL('../../components/projects/milestoneDetailsEdit.tsx', import.meta.url), 'utf8');
    assert.match(details, /valueTestId="milestone-status"/);
    assert.match(details, /testId="milestone-status"/);
    assert.match(details, /label="STATUS"/);
    assert.equal(details.includes('label="STAGE"'), false);
    assert.equal(details.includes('milestone-work-status'), false);

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
    assert.match(withSubtask, /data-testid="milestone-meta"[^>]*>1 resource</);
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
      milestone: tileMilestone({ publishToWarehaus: false, status: 'Planning', resources: [] }),
    });
    assert.match(staffDraft, /data-testid="milestone-meta"[^>]*>0 resources</);
    assert.match(staffDraft, /data-testid="milestone-staff-only"/);
    assert.match(staffDraft, />Staff only</);
    assert.match(staffDraft, /gap:16px/);
    assert.match(staffDraft, /items-center/);
    assert.match(staffDraft, /data-testid="milestone-status-chip"[^>]*>[\s\S]*Planning</);
    assert.equal(staffDraft.includes('Updated'), false);

    const staffUnpublishedReady = renderTile({
      staff: true,
      milestone: tileMilestone({
        publishToWarehaus: false,
        status: 'Ready to Ship',
        resources: [resource, { ...resource, id: 'r-2' }],
      }),
    });
    assert.match(staffUnpublishedReady, /data-testid="milestone-meta"[^>]*>2 resources</);
    assert.match(staffUnpublishedReady, /data-testid="milestone-staff-only"/);

    const clientDraft = renderTile({
      staff: false,
      milestone: tileMilestone({ publishToWarehaus: false, status: 'Planning', resources: [] }),
    });
    assert.match(clientDraft, /data-testid="milestone-meta"[^>]*>0 resources</);
    assert.equal(clientDraft.includes('milestone-staff-only'), false);
    assert.equal(clientDraft.includes('Staff only'), false);
    assert.equal(clientDraft.includes('No review yet'), false);
    assert.equal(clientDraft.includes('Not published'), false);
    assert.equal(plain.includes('milestone-staff-only'), false);

    const ready = renderTile({
      staff: false,
      milestone: tileMilestone({
        status: 'Ready to Ship',
        publishToWarehaus: true,
        resources: [resource, { ...resource, id: 'r-2' }],
      }),
    });
    assert.match(ready, /data-testid="milestone-meta"[^>]*>2 resources</);
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
        status: 'Building',
        decidedAt,
        resources: [resource, { ...resource, id: 'r-2' }],
        openCount: 0,
        doneCount: 6,
      }),
    });
    assert.match(approved, /data-testid="milestone-awaiting"[^>]*>Approved · awaiting merge and deploy</);
    assert.equal(approved.includes('data-testid="milestone-due"'), false);
    assert.match(approved, />Open milestone</);
    assert.match(approved, />6 \/ 6 tasks complete</);
    assert.match(approved, />6 \/ 6 complete</);
    assert.equal(approved.includes('includes'), false);
    assert.match(approved, /data-testid="milestone-meta"[^>]*>2 resources</);
    assert.match(approved, /data-testid="milestone-status-chip"[^>]*>[\s\S]*Building</);
    assert.equal(approved.includes('Updated'), false);
    assert.equal(approved.includes('Due '), false);
    assert.equal(approved.includes('Ready for review'), false);

    const approvedUndated = renderTile({
      staff: true,
      milestone: tileMilestone({ approval: 'approved', decidedAt: null, resources: [resource] }),
    });
    assert.match(approvedUndated, /data-testid="milestone-awaiting"[^>]*>Approved · awaiting merge and deploy</);
    assert.equal(approvedUndated.includes('data-testid="milestone-due"'), false);
    assert.match(approvedUndated, /data-testid="milestone-meta"[^>]*>1 resource</);
    assert.equal(approvedUndated.includes('No review yet'), false);
    assert.equal(approvedUndated.includes('Due '), false);

    const approvedReady = renderTile({
      staff: true,
      milestone: tileMilestone({
        approval: 'approved',
        status: 'Ready to Ship',
        decidedAt,
        resources: [resource, { ...resource, id: 'r-2' }],
      }),
    });
    assert.match(approvedReady, /data-testid="milestone-status-chip"[^>]*>[\s\S]*Ready to Ship</);
    assert.match(approvedReady, /data-testid="milestone-awaiting"[^>]*>Approved · awaiting merge and deploy</);
    assert.equal(approvedReady.includes('data-testid="milestone-due"'), false);
    assert.match(approvedReady, />Open milestone</);
    assert.match(approvedReady, /data-testid="milestone-meta"[^>]*>2 resources</);
    assert.equal(approvedReady.includes('Ready for review'), false);
    assert.equal(approvedReady.includes('Approve &amp; deploy'), false);

    const clientAwaiting = renderTile({
      staff: false,
      milestone: tileMilestone({
        approval: 'approved',
        status: 'Ready to Ship',
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
        status: 'Shipped',
        decidedAt,
      }),
    });
    const linked = renderTile({
      staff: true,
      milestone: tileMilestone({
        localPreviewUrl: 'http://localhost:3200',
        figmaUrl: 'https://www.figma.com/design/TS3DcaCgrIdYf0jhvnMy3k/Portal',
        dueDate: '2026-11-20',
        status: 'Ready to Ship',
      }),
    });
    assert.match(linked, /data-testid="milestone-local-preview"/);
    assert.match(linked, /Local preview/);
    assert.match(linked, /data-testid="milestone-figma"/);
    assert.match(linked, /href="http:\/\/localhost:3200"/);
    assert.match(linked, /data-testid="milestone-preview-hint"[^>]*>localhost:3200</);
    assert.match(linked, /data-testid="milestone-due"[^>]*>Due Nov 20</);
    assert.match(linked, /data-testid="milestone-status-chip"[^>]*>[\s\S]*Ready to Ship</);
    assert.match(linked, /Milestone Details/);
    assert.match(linked, /lg:order-1/);
    assert.match(linked, /lg:order-2/);
    assert.match(linked, /lg:order-3/);
    const readyApprove = renderTile({
      staff: true,
      isPeter: true,
      milestone: tileMilestone({
        status: 'Ready to Ship',
        approval: 'unreviewed',
        review: {
          iteration: 2,
          previewUrl: 'https://warehaus-portal-git-order-ahead-warehaus-collective.vercel.app',
          prNumber: 108,
          prTitle: null,
          branch: null,
          commit: null,
          builtAt: null,
          designCheck: 'pending',
          designCheckNote: null,
          previewBuild: null,
          previewBuildAttempt: null,
          previewBuildAt: null,
          previewDelete: null,
          previewDeleteAttempt: null,
          previewDeleteAt: null,
          deployFinishedAt: null,
          history: [],
        },
      }),
    });
    assert.match(readyApprove, /data-testid="milestone-stage-action"/);
    assert.match(readyApprove, /data-testid="tile-approve-deploy"/);
    assert.match(readyApprove, /Milestone Details/);
    const unlinked = renderTile({ staff: true, milestone: tileMilestone({}) });
    assert.match(unlinked, /data-testid="milestone-local-preview"/);
    assert.match(unlinked, /preview not running/);
    assert.equal(unlinked.includes('data-testid="milestone-figma"'), false);
    const clientLinked = renderTile({
      staff: false,
      milestone: tileMilestone({
        localPreviewUrl: 'http://localhost:3200',
        figmaUrl: 'https://www.figma.com/design/abc',
      }),
    });
    assert.equal(clientLinked.includes('milestone-local-preview'), false);
    assert.equal(clientLinked.includes('milestone-figma'), false);
    assert.equal(clientLinked.includes('preview not running'), false);

    assert.match(clientShipped, /data-testid="milestone-status-chip"[^>]*>[\s\S]*Shipped</);
    assert.match(clientShipped, />Open milestone</);
    assert.match(clientShipped, new RegExp(`data-testid="milestone-due"[^>]*>Shipped ${day}<`));
    assert.equal(clientShipped.includes('Approved'), false);

    const shipped = renderTile({
      staff: true,
      milestone: tileMilestone({
        approval: 'approved',
        status: 'Shipped',
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
    assert.match(longChip, /whitespace-normal lg:w-max lg:max-w-none lg:whitespace-nowrap"[\s\S]*data-testid="milestone-progress"/);
    assert.match(longChip, /overflow-wrap:anywhere/);
    assert.match(longChip, /flex-nowrap items-center/);
    assert.match(longChip, /data-testid="milestone-status-chip"[^>]*white-space:nowrap/);
    assert.match(longChip, /data-testid="milestone-meta"[^>]*truncate/);
    assert.doesNotMatch(longChip, /line-clamp/);
    assert.match(longChip, /flex w-full min-w-0 flex-col items-start gap-4 md:flex-row md:flex-wrap md:items-center/);
  });

  it('opens the tile status menu for staff and saves on pick', () => {
    const milestone = tileMilestone({});
    const client = renderTile({ staff: false, milestone, stagePreview: 'menu' });
    assert.match(client, /<span[^>]*data-testid="milestone-status-chip"/);
    assert.equal(client.includes('milestone-status-menu'), false);
    assert.equal(client.includes('data-milestone-status-trigger'), false);
    assert.equal(client.includes('milestone-status-play'), false);
    assert.equal(client.includes('task-chev-down.svg'), false);

    const desktop = renderTile({ staff: true, milestone, stagePreview: 'menu' });
    assert.match(desktop, /<button[^>]*data-testid="milestone-status-chip"/);
    const staffChip = desktop.match(/<button[^>]*data-testid="milestone-status-chip"[^>]*>/)?.[0] ?? '';
    assert.match(staffChip, /font-size:12px/);
    assert.match(staffChip, /letter-spacing:0\.48px/);
    assert.match(staffChip, /aria-haspopup="listbox"/);
    assert.doesNotMatch(staffChip, /font:\s*inherit/);
    const control = desktop.match(/<div[^>]*data-testid="milestone-status-control"[^>]*>/)?.[0] ?? '';
    assert.match(control, /border:1px solid var\(--border-2\)/);
    assert.match(control, /border-radius:9px/);
    assert.match(control, /height:34px/);
    assert.match(desktop, /data-testid="tile-stage-popover"/);
    const popover = desktop.match(/<div[^>]*data-testid="tile-stage-popover"[^>]*>/)?.[0] ?? '';
    assert.match(popover, /class="ds-scope"/);
    const menuAt = desktop.indexOf('data-testid="milestone-status-menu"');
    const scopeAt = desktop.lastIndexOf('ds-scope', menuAt);
    assert.ok(scopeAt >= 0 && scopeAt < menuAt, 'portaled status menu sits inside ds-scope');
    assert.match(desktop, /data-testid="milestone-status-menu"/);
    assert.match(desktop, /aria-label="Status"/);
    // Shipped is locked on this tile, so the hint points to Mark complete.
    assert.match(desktop, /Use Mark complete to close/);
    assert.match(desktop, /task-chev-down\.svg/);
    assert.equal(desktop.includes('tile-stage-menu'), false);
    assert.equal(desktop.includes('stage-confirm-sheet'), false);
    assert.equal(desktop.includes('>Close<'), false);
    const shipped = desktop.split('<button').find((part) => part.includes('>Shipped<')) ?? '';
    assert.doesNotMatch(shipped, /disabled=""/);
    assert.match(shipped, /aria-disabled="true"/);
    assert.match(shipped, /aria-describedby="milestone-status-hint"/);
    assert.doesNotMatch(desktop, /NOT DONE/);

    const phoneMenu = renderTile({ staff: true, milestone, phone: true, stagePreview: 'menu' });
    assert.equal(phoneMenu.includes('tile-stage-popover'), false);
    assert.match(phoneMenu, /data-testid="tile-stage-menu"/);
    assert.match(phoneMenu, /data-testid="milestone-status-menu"/);
    assert.match(phoneMenu, /Use Mark complete to close/);
    assert.equal(phoneMenu.includes('Nothing changes until you confirm'), false);
    assert.match(phoneMenu, />Close</);
    assert.equal(phoneMenu.includes('stage-confirm'), false);
    assert.equal(phoneMenu.includes('stage-confirm-sheet'), false);
    assert.equal(phoneMenu.split('portal-modal-scrim').length - 1, 1);
  });

  it('flips the desktop stage menu above the chip only when it fits there', () => {
    const menu = { width: 320, height: 360 };
    const bounds = { top: 80, right: 1400, bottom: 820, left: 280 };
    const first = tileStageMenuBox({
      chip: { top: 180, right: 1200, bottom: 204 },
      menu,
      bounds,
    });
    assert.equal(first.placement, 'down');
    assert.equal(first.top, 212);
    assert.ok(first.top + menu.height <= bounds.bottom - 8);

    const last = tileStageMenuBox({
      chip: { top: 640, right: 1200, bottom: 664 },
      menu,
      bounds,
    });
    assert.equal(last.placement, 'up');
    assert.equal(last.top, 640 - 8 - menu.height);
    assert.ok(last.top >= bounds.top + 8);
    assert.ok(last.top + menu.height <= bounds.bottom - 8);

    const tight = tileStageMenuBox({
      chip: { top: 400, right: 1200, bottom: 424 },
      menu: { width: 320, height: 500 },
      bounds,
    });
    assert.equal(tight.placement, 'down');
    assert.equal(tight.top, bounds.bottom - 500 - 8);
    assert.ok(tight.top + 500 <= bounds.bottom - 8);
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
        setStatus: idle,
        advance: idle,
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
  it('shows one Status row, with the same value the tile shows', () => {
    const cases = [
      { status: 'Idea' as const, approval: 'unreviewed' as const },
      { status: 'Planning' as const, approval: 'unreviewed' as const },
      { status: 'Awaiting Go' as const, approval: 'unreviewed' as const },
      { status: 'Building' as const, approval: 'unreviewed' as const },
      { status: 'Ready to Ship' as const, approval: 'unreviewed' as const },
      { status: 'Ready to Ship' as const, approval: 'approved' as const },
      { status: 'Shipped' as const, approval: 'approved' as const },
      { status: 'Parked' as const, approval: 'unreviewed' as const },
    ];
    for (const item of cases) {
      const html = renderDetail(tileMilestone({ status: item.status, approval: item.approval }));
      assert.equal(field(html, 'milestone-status'), item.status, item.status);
      assert.equal(html.includes('milestone-work-status'), false);
      assert.equal(html.includes('milestone-stage-edit'), false);
      assert.equal(html.split('>STATUS<').length - 1, 1, 'one STATUS label');
      assert.equal(html.includes('>STAGE<'), false);
      const tile = renderTile({ staff: true, milestone: tileMilestone({ status: item.status, approval: item.approval }) });
      assert.match(tile, new RegExp(`data-testid="milestone-status-control"[^>]*data-status="${item.status}"`));
    }
  });

  it('offers play on Idea, Planning, Awaiting Go and Building, and nowhere else', () => {
    const next = { Idea: 'Planning', Planning: 'Awaiting Go', 'Awaiting Go': 'Building', Building: 'Ready to Ship' } as const;
    for (const status of ['Idea', 'Planning', 'Awaiting Go', 'Building'] as const) {
      for (const html of [
        renderTile({ staff: true, milestone: tileMilestone({ status }) }),
        renderDetail(tileMilestone({ status })),
      ]) {
        const play = html.match(/<button[^>]*data-testid="milestone-status-play"[^>]*>/)?.[0] ?? '';
        assert.match(play, new RegExp(`aria-label="Move to ${next[status]}"`), status);
        assert.match(play, /type="button"/);
        assert.match(html, new RegExp(`role="tooltip"[^>]*>Next: ${next[status]}<`), status);
        // Play is its own control beside the menu trigger, never inside it.
        const trigger = html.slice(html.indexOf('aria-haspopup="listbox"'));
        const triggerEnd = trigger.indexOf('</button>');
        assert.equal(trigger.slice(0, triggerEnd).includes('milestone-status-play'), false, status);
      }
    }
    for (const status of ['Ready to Ship', 'Shipped', 'Parked'] as const) {
      assert.equal(renderTile({ staff: true, milestone: tileMilestone({ status }) }).includes('milestone-status-play'), false, status);
      assert.equal(renderDetail(tileMilestone({ status })).includes('milestone-status-play'), false, status);
    }
  });

  it('gives the review card its phone layout on a phone', () => {
    const source = readRoadmapSource();
    assert.match(source, /<MilestoneReviewLive milestone=\{milestone\} hostSlug=\{hostSlug\} isPeter=\{isPeter\} phone=\{phone\} \/>/);
    assert.match(source, /const phone = useMaxWidth\(767\);/);
  });

  it('gives clients a plain status pill with no menu and no play', () => {
    for (const status of ['Planning', 'Building', 'Ready to Ship'] as const) {
      const tile = renderTile({ staff: false, milestone: tileMilestone({ status }) });
      assert.match(tile, new RegExp(`<span[^>]*data-testid="milestone-status-chip"[^>]*>[\\s\\S]*?${status}`));
      assert.equal(tile.includes('milestone-status-play'), false);
      assert.equal(tile.includes('aria-haspopup'), false);
      const detail = renderDetail(tileMilestone({ status }), false, false);
      assert.equal(field(detail, 'milestone-status'), status);
      assert.equal(detail.includes('milestone-status-play'), false);
      assert.equal(detail.includes('milestone-status-edit'), false);
      assert.equal(detail.includes('data-picker-outline'), false);
    }
  });

  it('outlines every editable picker for staff and leaves read-only rows alone', () => {
    const html = renderDetail(tileMilestone({ status: 'Planning' }));
    for (const id of ['milestone-status-edit', 'milestone-owner-edit', 'milestone-due-edit', 'milestone-project-edit', 'milestone-visibility-edit']) {
      const at = html.indexOf(`data-testid="${id}"`);
      assert.ok(at > 0, id);
      const wrapper = html.slice(html.lastIndexOf('<div', at), at);
      assert.match(wrapper, /class="milestone-picker /, id);
      assert.match(wrapper, /data-picker-outline=""/, id);
    }
    for (const id of ['milestone-creator', 'milestone-created']) {
      const at = html.indexOf(`data-testid="${id}"`);
      const wrapper = html.slice(html.lastIndexOf('<div', at), at);
      assert.equal(wrapper.includes('milestone-picker'), false, id);
      assert.match(wrapper, /border:1px solid transparent/, id);
    }
    const css = readFileSync(new URL('../../styles/global.css', import.meta.url), 'utf8');
    assert.match(css, /\.ds-scope \.milestone-picker \{\s*border: 1px solid var\(--border\);\s*border-radius: 10px;/);
    assert.match(css, /\.milestone-picker:hover,[\s\S]*?\.milestone-picker:focus-within,[\s\S]*?border-color: var\(--border-2\);/);
    assert.match(css, /\.ds-scope \.milestone-play \{[\s\S]*?width: 24px;\s*height: 24px;/);
    assert.match(css, /@media \(max-width: 767px\), \(pointer: coarse\) \{\s*\.ds-scope \.milestone-play \{\s*width: 44px;\s*height: 44px;/);
  });

  it('prints the last review as the approver and the decision day', () => {
    const decidedAt = Date.parse('2026-11-03T15:00:00Z');
    const day = new Date(decidedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    assert.equal(lastReviewLabel({ approverName: 'Northwind', decidedAt }), `Northwind · ${day}`);
    const html = renderDetail(
      tileMilestone({
        approval: 'approved',
        status: 'Ready to Ship',
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
    const approved = renderDetail(tileMilestone({ approval: 'approved', status: 'Ready to Ship' }));
    assert.equal(field(approved, 'milestone-approval'), 'Approved');
    const changes = renderDetail(tileMilestone({ approval: 'changes_requested', status: 'Building' }));
    assert.equal(field(changes, 'milestone-approval'), 'Changes requested');
  });

  it('ends the detail trail at Milestones', () => {
    const html = renderDetail(tileMilestone({ name: 'Brand system' }), true);
    assert.match(html, /data-testid="nav-breadcrumb-current"[^>]*>Milestones</);
    assert.equal(html.includes('>Brand system</span>'), false);
    assert.match(html, /class="portal-crumb"/);
  });

  it('does not offer the old Review milestone control', () => {
    const ready = renderDetail(tileMilestone({ status: 'Ready to Ship', approval: 'unreviewed', note: 'Peter wrote this.' }));
    assert.equal(ready.includes('Review milestone'), false);
    assert.equal(ready.includes('data-testid="milestone-review-action"'), false);
    const client = renderDetail(tileMilestone({ status: 'Ready to Ship', approval: 'approved', note: 'Peter wrote this.', approverName: 'Peter' }), false, false);
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

describe('design gate on the tile', () => {
  const staff = fixtureMilestones({ id: 'p-site', name: 'Northwind site' }, FIXTURE_TASKS, 'staff');
  const gateTile = (phase: string) => applyFixtureMilestonePreview(staff, `?gate=${phase}`)[0];

  it('derives each Building phase from the task set and the approval', () => {
    assert.deepEqual(
      ['designs', 'waiting', 'build'].map((phase) => gateTile(phase).designGate?.phase),
      ['designs', 'design-approval', 'build'],
    );
    assert.equal(gateTile('waiting').designGate?.buildLocked, true);
    assert.equal(gateTile('build').designGate?.buildLocked, false);
  });

  it('shows the phase after Building, and Peter gets Request design changes beside Approve designs', () => {
    const waiting = renderTile({ staff: true, isPeter: true, milestone: gateTile('waiting') });
    assert.match(waiting, /data-testid="building-phase"[^>]*> · Waiting on design approval/);
    assert.match(waiting, /data-testid="tile-design-waiting"/);
    assert.match(waiting, /data-testid="tile-approve-designs"/);
    // Without a handler (a client or fixture card) the action stays hidden.
    assert.doesNotMatch(waiting, /tile-request-design-changes/);
    const withHandler = renderToStaticMarkup(
      createElement(MilestoneListCard, {
        milestone: gateTile('waiting'),
        staff: true,
        isPeter: true,
        onOpen: () => undefined,
        onApproveDesign: async () => undefined,
        onRequestDesignChanges: async () => undefined,
      }),
    );
    assert.match(withHandler, /data-testid="tile-request-design-changes"/);
    const build = renderTile({ staff: true, isPeter: true, milestone: gateTile('build') });
    assert.doesNotMatch(build, /building-phase/);
    assert.doesNotMatch(build, /tile-request-design-changes/);
  });

  it('shows Peter Approve designs only once a design task is done', () => {
    const waiting = gateTile('waiting');
    assert.equal(waiting.designGate?.doneDesign, 2);
    // No design task: the Status box stays the plain control.
    const plain = renderTile({
      staff: true,
      isPeter: true,
      milestone: { ...waiting, designGate: { visual: false, buildLocked: false, phase: 'build', doneDesign: 0 } },
    });
    assert.doesNotMatch(plain, /tile-approve-designs|tile-request-design-changes/);
    // A design task is open and none is done.
    const open = renderTile({
      staff: true,
      isPeter: true,
      milestone: { ...waiting, designGate: { visual: true, buildLocked: true, phase: 'designs', doneDesign: 0 } },
    });
    assert.doesNotMatch(open, /tile-approve-designs|tile-request-design-changes/);
    // A tile sent with no gate at all gets no button either.
    const none = renderTile({ staff: true, isPeter: true, milestone: { ...waiting, designGate: undefined } });
    assert.doesNotMatch(none, /tile-approve-designs/);
    assert.match(renderTile({ staff: true, isPeter: true, milestone: waiting }), /data-testid="tile-approve-designs"/);
  });

  it('never shows a client the phase', () => {
    const tile = { ...gateTile('designs') };
    const client = renderTile({ staff: false, milestone: tile });
    assert.doesNotMatch(client, /building-phase|tile-approve-designs/);
  });
});
