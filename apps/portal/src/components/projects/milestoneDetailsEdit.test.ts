import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { textBlurSave } from '@convex/_lib/milestoneDetails';
import type { MilestoneRoadmapView } from '@convex/_lib/milestones';
import { MilestoneDetailView } from './ProjectRoadmap';

Object.assign(globalThis, { React });

const idle = async () => undefined;

const milestone = {
  id: 'm-launch',
  name: 'Launch the homepage',
  objective: 'The homepage matches the approved frame and is ready to review.',
  goals: ['Hero matches the approved frame'],
  workStatus: 'active',
  approval: 'unreviewed',
  note: null,
  approverName: null,
  decidedAt: null,
  publishToWarehaus: false,
  resources: [],
  openCount: 1,
  doneCount: 0,
  countIsDecision: false,
  rows: [],
  createdAt: Date.UTC(2026, 10, 2),
} as MilestoneRoadmapView;

function view(input: { staff: boolean; preview?: string; email?: string; milestone?: MilestoneRoadmapView }): string {
  return renderToStaticMarkup(
    createElement(MilestoneDetailView, {
      milestone: input.milestone ?? milestone,
      project: { id: 'p-site', name: 'Northwind site', clientName: 'Northwind' },
      tasks: [],
      staff: input.staff,
      fixtures: true,
      preview: input.preview ?? null,
      viewerEmail: input.email ?? 'alex@warehaus.co',
      moveTargets: [{ id: 'p-shipped', name: 'Northwind brand' }],
      resourceChoices: [],
      onBack: () => undefined,
      onFixture: () => undefined,
      mutations: {
        save: idle,
        setWorkStatus: idle,
        setPublish: idle,
        setDetailStatus: idle,
        setStage: idle,
        moveProject: idle,
        attachTask: idle,
        detachTask: idle,
      },
    }),
  );
}

function stageOption(html: string, label: string): string {
  const match = html.match(new RegExp(`<button type="button" role="option"[^>]*>[\\s\\S]*?<span class="whitespace-nowrap">${label}</span>[\\s\\S]*?</button>`));
  return match?.[0] ?? '';
}

describe('milestone details panel', () => {
  it('lets staff edit status, stage, project, and visibility, and hides those controls from clients', () => {
    const staff = view({ staff: true });
    assert.match(staff, /data-testid="milestone-status-edit"/);
    assert.match(staff, /data-testid="milestone-stage-edit"/);
    assert.match(staff, /data-testid="milestone-project-edit"/);
    assert.match(staff, /data-testid="milestone-visibility-edit"/);
    assert.match(staff, /data-testid="milestone-creator"[^>]*>—</);
    assert.match(staff, /Staff only/);
    assert.match(staff, /data-testid="milestone-owner-edit"/);
    assert.match(staff, /data-testid="milestone-owner"[^>]*>Unassigned</);
    assert.match(staff, /data-testid="milestone-due-edit"/);
    assert.match(staff, /data-testid="milestone-due"[^>]*>Not set</);
    assert.equal(staff.includes('<input'), false);
    assert.match(staff, /<p data-testid="milestone-objective"/);

    const client = view({ staff: false });
    assert.equal(client.includes('data-testid="milestone-creator"'), false);
    assert.equal(client.includes('data-testid="milestone-visibility-edit"'), false);
    assert.equal(client.includes('data-testid="milestone-publish"'), false);
    assert.equal(client.includes('data-testid="milestone-status-edit"'), false);
    assert.equal(client.includes('data-testid="milestone-stage-edit"'), false);
    assert.equal(client.includes('data-testid="milestone-project-edit"'), false);
    assert.equal(client.includes('Staff only'), false);
    assert.equal(client.includes('Review milestone'), false);
    assert.equal(client.includes('milestone-review-action'), false);
    assert.equal(staff.includes('Review milestone'), false);
    assert.match(staff, /Staff only · clients see nothing/);
    assert.match(client, /data-testid="milestone-work-status"/);
    assert.match(client, /data-testid="milestone-project"/);
    assert.match(client, /data-testid="milestone-owner"[^>]*>—</);
    assert.match(client, /data-testid="milestone-due"[^>]*>—</);
    assert.equal(client.includes('milestone-owner-edit'), false);
    assert.equal(client.includes('milestone-due-edit'), false);

    const named = view({
      staff: true,
      milestone: {
        ...milestone,
        ownerContactId: 'ct-maya',
        ownerName: 'Maya Chen',
        dueDate: '2026-11-20',
        creatorName: 'Maya Chen',
      },
    });
    assert.match(named, /data-testid="milestone-owner"[^>]*>Maya Chen</);
    assert.match(named, /data-testid="milestone-due"[^>]*>Nov 20, 2026</);
    assert.match(named, /data-testid="milestone-creator"[^>]*>Maya Chen</);
    assert.match(named, /Set automatically · read-only/);
  });

  it('shows an owner and due save error from the fixture', () => {
    const html = view({ staff: true, preview: 'owner-due-error' });
    assert.match(html, /data-details-state="owner-due-error"/);
    assert.match(html, /data-testid="milestone-owner-retry"/);
    assert.match(html, /data-testid="milestone-due-retry"/);
    assert.match(html, /Couldn’t save\./);
  });

  it('opens the owner menu and the due date menu', () => {
    const owner = view({ staff: true, preview: 'owner' });
    assert.match(owner, /data-testid="milestone-owner-menu"/);
    assert.match(owner, /Unassigned/);
    assert.match(owner, /Saved in the Portal/);
    const due = view({ staff: true, preview: 'due' });
    assert.match(due, /data-testid="milestone-due-menu"/);
    assert.match(due, /Clear date/);
    assert.match(due, /Saved in the Portal/);
  });

  it('lets staff set every stage except Shipped', () => {
    const menu = view({ staff: true, preview: 'stage' });
    assert.match(menu, /data-testid="milestone-stage-menu"/);
    assert.doesNotMatch(stageOption(menu, 'Awaiting Go'), /disabled=""/);
    assert.doesNotMatch(stageOption(menu, 'Ready to Ship'), /disabled=""/);
    assert.equal(menu.includes('PETER’S CALL'), false);
    assert.match(stageOption(menu, 'Shipped'), /disabled=""/);
    assert.match(stageOption(menu, 'Shipped'), /ON MERGE/);
    assert.match(stageOption(menu, 'Shipped'), /task-lock\.svg/);
    assert.equal(menu.includes('>Close<'), false);

    const same = view({ staff: true, preview: 'stage-peter', email: 'alex@warehaus.co' });
    assert.doesNotMatch(stageOption(same, 'Awaiting Go'), /disabled=""/);
    assert.match(stageOption(same, 'Shipped'), /disabled=""/);
  });

  it('keeps Awaiting Go editable for staff', () => {
    const html = view({ staff: true, preview: 'locked' });
    assert.match(html, /data-testid="milestone-stage-edit"/);
    assert.equal(html.includes('milestone-stage-locked'), false);
    assert.equal(html.includes('Waiting on Peter’s go'), false);
  });

  it('keeps title and description read-only and skips an unchanged blur', () => {
    const html = view({ staff: true });
    assert.match(html, /data-testid="milestone-name"/);
    assert.equal(html.includes('<textarea'), false);
    assert.equal(textBlurSave({ previous: 'Launch the homepage', next: 'Launch the homepage', escape: false }).action, 'skip');
    assert.equal(textBlurSave({ previous: 'Launch the homepage', next: 'Launch', escape: false }).action, 'save');
    assert.equal(textBlurSave({ previous: 'Launch the homepage', next: 'Launch', escape: true }).action, 'discard');
  });

  it('opens a publish confirm and a move confirm instead of writing immediately', () => {
    const publish = view({ staff: true, preview: 'publish' });
    assert.match(publish, /data-testid="milestone-details-scrim"/);
    assert.match(publish, /portal-modal-scrim/);
    assert.match(publish, /Publish to client\?/);
    assert.match(publish, /data-testid="milestone-confirm-submit"/);
    assert.match(publish, /data-modal-header="default"/);
    assert.match(publish, /border-radius:28px/);
    assert.equal(publish.includes('border:2px solid'), false);

    const move = view({ staff: true, preview: 'move' });
    assert.match(move, /Move to Northwind brand\?/);
    assert.match(move, /Nothing changes until you confirm/);

    const unpublish = view({ staff: true, preview: 'unpublish' });
    assert.match(unpublish, /Hide from client\?/);
    assert.match(unpublish, />Unpublish</);

    const error = view({ staff: true, preview: 'error' });
    assert.match(error, /data-testid="milestone-details-error"/);
    assert.match(error, /color:var\(--danger-text\)/);
    assert.match(error, /Couldn’t move the milestone/);
  });

  it('counts the same task lanes the Tasks tab shows', () => {
    const html = view({
      staff: true,
      preview: 'move',
      milestone: {
        ...milestone,
        openCount: 2,
        doneCount: 1,
        rows: [
          { id: 'a', name: 'One', status: 'To Do', isDone: false, stage: null, resourceCount: 0, children: [{ id: 'c', name: 'Sub', status: 'To Do', isDone: false, stage: null, resourceCount: 0 }] },
          { id: 'b', name: 'Two', status: 'Done', isDone: true, stage: null, resourceCount: 0, children: [] },
        ],
      },
    });
    assert.match(html, /2 tasks/);
    assert.equal(html.includes('3 tasks'), false);
  });

  it('hides approval and the review button from a client', () => {
    const html = view({
      staff: false,
      milestone: {
        ...milestone,
        approval: 'approved',
        note: 'Ship it',
        approverName: 'Peter',
        decidedAt: Date.UTC(2026, 10, 1),
        workStatus: 'ready',
      },
    });
    assert.equal(html.includes('data-testid="milestone-approval"'), false);
    assert.equal(html.includes('data-testid="milestone-last-review"'), false);
    assert.equal(html.includes('Review milestone'), false);
  });
});
