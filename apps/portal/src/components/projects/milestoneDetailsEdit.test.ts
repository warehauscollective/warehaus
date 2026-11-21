import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { textBlurSave } from '@convex/_lib/milestoneDetails';
import type { MilestoneRoadmapView } from '@convex/_lib/milestones';
import { MilestoneDetailView } from './ProjectRoadmap';
import { anchoredMenuBox, OwnerMenu, Popover, StatusMenu } from './milestoneDetailsEdit';

Object.assign(globalThis, { React });

const idle = async () => undefined;

const milestone = {
  id: 'm-launch',
  name: 'Launch the homepage',
  objective: 'The homepage matches the approved frame and is ready to review.',
  goals: ['Hero matches the approved frame'],
  status: 'Building',
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
        setPublish: idle,
        setStatus: idle,
        advance: idle,
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
  it('lets staff edit status, project, and visibility, and hides those controls from clients', () => {
    const staff = view({ staff: true });
    assert.match(staff, /data-testid="milestone-status-edit"/);
    assert.equal(staff.includes('milestone-stage-edit'), false);
    assert.equal(staff.includes('>STAGE<'), false);
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
    assert.match(client, /data-testid="milestone-creator"[^>]*>—</);
    assert.equal(client.includes('milestone-creator-note'), false);
    assert.equal(client.includes('data-testid="milestone-visibility-edit"'), false);
    assert.match(client, /data-testid="milestone-publish"[^>]*>Not published</);
    assert.equal(client.includes('data-testid="milestone-status-edit"'), false);
    assert.equal(client.includes('data-testid="milestone-project-edit"'), false);
    assert.equal(client.includes('Staff only'), false);
    assert.equal(client.includes('Review milestone'), false);
    assert.equal(client.includes('milestone-review-action'), false);
    assert.equal(staff.includes('Review milestone'), false);
    assert.match(staff, /Staff only · clients see nothing/);
    assert.match(client, /data-testid="milestone-status"/);
    assert.match(client, /data-testid="milestone-project"/);
    assert.match(client, /data-testid="milestone-owner"[^>]*>—</);
    assert.match(client, /data-testid="milestone-due"[^>]*>—</);
    assert.equal(client.includes('milestone-owner-edit'), false);
    assert.equal(client.includes('milestone-due-edit'), false);
    assert.match(staff, /data-testid="milestone-preview-link-edit"/);
    assert.match(staff, /Attach preview link/);
    assert.equal(client.includes('milestone-preview-link-edit'), false);
    assert.equal(client.includes('Attach preview link'), false);
    assert.equal(client.includes('Remove link'), false);

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

    const shared = view({
      staff: false,
      milestone: {
        ...milestone,
        creatorName: 'Maya Chen',
        publishToWarehaus: true,
        resources: [{ id: 'r-notes', title: 'Kickoff recap', url: 'https://example.com/recap', type: 'Meeting notes' }],
      },
    });
    assert.match(shared, /data-testid="milestone-creator"[^>]*>Maya Chen</);
    assert.match(shared, /data-testid="milestone-publish"[^>]*>Published</);
    assert.match(shared, /Meeting notes · Shared with you/);
    assert.equal(shared.includes('Shared with client'), false);
    assert.equal(shared.includes('milestone-visibility-edit'), false);
    assert.equal(shared.includes('milestone-owner-edit'), false);
    assert.equal(shared.includes('Staff only'), false);

    const publishedStaff = view({
      staff: true,
      milestone: {
        ...milestone,
        publishToWarehaus: true,
        resources: [{ id: 'r-notes', title: 'Kickoff recap', url: null, type: 'Meeting notes' }],
      },
    });
    assert.equal(publishedStaff.includes('clients see nothing'), false);
    assert.match(publishedStaff, /Shared with client/);
    assert.equal(publishedStaff.includes('Shared with you'), false);
  });

  it('flips a menu above its anchor when the space below is too short', () => {
    const bounds = { top: 157, right: 1100, bottom: 740, left: 340 };
    const due = anchoredMenuBox({
      anchor: { top: 549, bottom: 596, left: 728, right: 1075 },
      menu: { width: 347, height: 333 },
      bounds,
      align: 'left',
    });
    assert.equal(due.placement, 'up');
    assert.equal(due.left, 728);
    assert.ok(due.top >= bounds.top + 8);
    assert.ok(due.top + 333 <= bounds.bottom - 8);

    const owner = anchoredMenuBox({
      anchor: { top: 200, bottom: 247, left: 360, right: 700 },
      menu: { width: 340, height: 130 },
      bounds,
      align: 'left',
    });
    assert.equal(owner.placement, 'down');
    assert.equal(owner.top, 255);
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

  it('lets staff set every status except Shipped', () => {
    const menu = view({ staff: true, preview: 'status' });
    assert.match(menu, /data-testid="milestone-status-menu"/);
    for (const status of ['Idea', 'Planning', 'Awaiting Go', 'Building', 'Ready to Ship', 'Shipped', 'Parked']) {
      assert.ok(stageOption(menu, status), status);
    }
    for (const retired of ['Draft', 'In progress', 'In review', 'Complete']) {
      assert.equal(stageOption(menu, retired), '', retired);
    }
    assert.doesNotMatch(stageOption(menu, 'Awaiting Go'), /disabled=""/);
    assert.doesNotMatch(stageOption(menu, 'Ready to Ship'), /disabled=""/);
    assert.match(stageOption(menu, 'Ready to Ship'), /outline-\[var\(--info\)\]/);
    assert.equal(menu.includes('PETER’S CALL'), false);
    assert.doesNotMatch(stageOption(menu, 'Shipped'), /disabled=""/);
    assert.match(stageOption(menu, 'Shipped'), /aria-disabled="true"/);
    assert.match(stageOption(menu, 'Shipped'), /aria-describedby="milestone-status-hint"/);
    assert.match(menu, /id="milestone-status-hint"/);
    assert.match(stageOption(menu, 'Shipped'), /NOT DONE/);
    assert.match(stageOption(menu, 'Shipped'), /task-lock\.svg/);
    assert.equal(menu.includes('>Close<'), false);

    const same = view({ staff: true, preview: 'stage-peter', email: 'alex@warehaus.co' });
    assert.doesNotMatch(stageOption(same, 'Awaiting Go'), /disabled=""/);
    assert.match(stageOption(same, 'Shipped'), /aria-disabled="true"/);
    assert.doesNotMatch(stageOption(same, 'Shipped'), /disabled=""/);
  });

  it('keeps a locked Shipped option focusable and clears the dock on the phone sheet', () => {
    const locked = renderToStaticMarkup(
      createElement(StatusMenu, { current: 'Building', canClose: false, sheet: true, onPick: () => undefined, onClose: () => undefined }),
    );
    assert.match(locked, /aria-disabled="true"/);
    assert.equal(locked.includes('disabled=""'), false);
    assert.match(locked, /padding-bottom:calc\(82px \+ env\(safe-area-inset-bottom, 0px\)\)/);
    const open = renderToStaticMarkup(
      createElement(StatusMenu, { current: 'Building', canClose: true, onPick: () => undefined, onClose: () => undefined }),
    );
    assert.equal(open.includes('aria-disabled'), false);
    assert.equal(open.includes('NOT DONE'), false);
    assert.match(open, /outline-\[var\(--info\)\]/);
  });

  it('keeps Awaiting Go editable for staff', () => {
    const html = view({ staff: true, preview: 'locked' });
    assert.match(html, /data-testid="milestone-status-edit"/);
    assert.match(html, /data-testid="milestone-status"[^>]*>Awaiting Go</);
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
    assert.equal(publish.includes('data-focus-ring'), false);
  });

  it('uses the info ring on the details attach and remove confirms', () => {
    const attach = view({ staff: true, preview: 'attach-link' });
    assert.match(attach, /https only\. Team Vercel previews\. Localhost and production stay off this milestone\./);
    assert.match(attach, /data-focus-ring="info"/);
    assert.match(attach, /class="needs-field block"/);
    assert.match(attach, /data-testid="preview-link-input"/);
    assert.match(attach, /outline:none/);
    const invalid = view({ staff: true, preview: 'preview-link-error' });
    assert.match(invalid, /data-focus-ring="info"/);
    assert.match(invalid, /border:1px solid var\(--danger\)/);
    assert.match(invalid, /http:\/\/localhost:3100/);
    const remove = view({ staff: true, preview: 'remove-link' });
    assert.match(remove, /data-focus-ring="info"/);
    const clientAttach = view({ staff: false, preview: 'attach-link' });
    assert.equal(clientAttach.includes('Attach preview link'), false);
    assert.equal(clientAttach.includes('preview-link-input'), false);
    assert.equal(clientAttach.includes('https only'), false);
    const clientRemove = view({ staff: false, preview: 'remove-link' });
    assert.equal(clientRemove.includes('Remove preview link'), false);
    assert.equal(clientRemove.includes('Remove link'), false);
    assert.match(remove, /Remove preview link\?/);
    assert.match(remove, />Cancel</);
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
        status: 'Ready to Ship',
      },
    });
    assert.equal(html.includes('data-testid="milestone-approval"'), false);
    assert.equal(html.includes('data-testid="milestone-last-review"'), false);
    assert.equal(html.includes('Review milestone'), false);
  });
});

function ownerOption(html: string, name: string): string {
  const match = html.match(new RegExp(`<button[^>]*>(?:(?!<button).)*${name}(?:(?!<\\/button>).)*<\\/button>`));
  return match?.[0] ?? '';
}

describe('assignee menu selection', () => {
  const people = [{ id: 'ct-maya', name: 'Maya Chen' }];

  it('ticks a name that has no contact, and never Unassigned', () => {
    const html = renderToStaticMarkup(
      createElement(OwnerMenu, {
        people,
        currentId: null,
        currentName: 'Alex Bauer',
        onPick: () => undefined,
        onClose: () => undefined,
      }),
    );
    assert.match(ownerOption(html, 'Alex Bauer'), /aria-selected="true"/);
    assert.match(ownerOption(html, 'Unassigned'), /aria-selected="false"/);
    assert.equal(ownerOption(html, 'Unassigned').includes('docs-check.svg'), false);
  });

  it('ticks the contact when the assignee is in the list', () => {
    const html = renderToStaticMarkup(
      createElement(OwnerMenu, {
        people,
        currentId: 'ct-maya',
        currentName: 'Maya Chen',
        onPick: () => undefined,
        onClose: () => undefined,
      }),
    );
    assert.match(ownerOption(html, 'Maya Chen'), /aria-selected="true"/);
    assert.match(ownerOption(html, 'Unassigned'), /aria-selected="false"/);
    assert.equal(html.includes('Alex Bauer'), false);
  });

  it('ticks Unassigned only when nobody is assigned', () => {
    const html = renderToStaticMarkup(
      createElement(OwnerMenu, {
        people,
        currentId: null,
        currentName: null,
        onPick: () => undefined,
        onClose: () => undefined,
      }),
    );
    assert.match(ownerOption(html, 'Unassigned'), /aria-selected="true"/);
    assert.equal(html.includes('Alex Bauer'), false);
  });
});

describe('milestone popover fill', () => {
  it('keeps ds-scope and paints no square behind the rounded menu', () => {
    const html = renderToStaticMarkup(
      // createElement's extra-child overload rejects a component whose props require children.
      // eslint-disable-next-line react/no-children-prop
      createElement(Popover, {
        onClose: () => undefined,
        children: createElement('div', { 'data-testid': 'menu-card', style: { borderRadius: 18 } }, 'Owner'),
      }),
    );
    assert.match(html, /class="ds-scope absolute z-30"/);
    assert.match(html, /background:\s*transparent/);
    const source = readFileSync(new URL('./milestoneDetailsEdit.tsx', import.meta.url), 'utf8');
    const popover = source.slice(source.indexOf('export function Popover'), source.indexOf('export function OwnerMenu'));
    assert.match(popover, /preventScroll:\s*true/);
    assert.match(popover, /nextDialogFocus/);
    assert.match(popover, /event\.key === 'Tab'/);
    assert.match(popover, /background: 'transparent'/);
    assert.match(source, /function menuKey/);
    assert.match(source, /event\.key === 'Escape'/);
  });
});
