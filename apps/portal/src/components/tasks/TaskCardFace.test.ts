import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import { boardColumns } from '@warehaus/portal-sync';
import type { PortalTask } from '@/lib/data/view-models';

// tsx compiles JSX with the classic runtime. The portal build uses the automatic runtime.
Object.assign(globalThis, { React });
const {
  TaskCardFace,
  BoardToast,
  DropPlaceholder,
  MOVE_NOT_SAVED,
  boardColumnTemplate,
  boardMovePersists,
  cardDragPointerDown,
  flagOffDropMessage,
  stageSavedFeedback,
} = await import('./TaskBoard');

const task: PortalTask = {
  id: 't-stage',
  name: 'Homepage',
  status: 'Building',
  isDone: false,
  date: '2026-10-20',
  stage: 'Building',
  projectId: 'p-site',
  projectName: 'Northwind site',
  projectStatus: 'In Progress',
  projectEndDate: null,
  syncNotice: 'Stage "Brainstorm" is not a portal stage',
};

describe('TaskCardFace client stage card', () => {
  it('hides the sync notice from clients', () => {
    const client = renderToStaticMarkup(createElement(TaskCardFace, { task, mode: 'stage', staff: false }));
    assert.equal(client.includes('Unknown stage'), false);
    assert.equal(client.includes('Brainstorm'), false);
    const staff = renderToStaticMarkup(createElement(TaskCardFace, { task, mode: 'stage', staff: true }));
    assert.match(staff, /Unknown stage/);
  });

  it('forwards the card pointer event to the drag listener', () => {
    let dragged = 0;
    let longPress = 0;
    cardDragPointerDown({ button: 0 }, () => {
      dragged += 1;
    }, undefined);
    assert.equal(dragged, 1);
    assert.equal(longPress, 0);
    cardDragPointerDown({ button: 0 }, () => {
      dragged += 1;
    }, () => {
      longPress += 1;
    });
    assert.equal(dragged, 2);
    assert.equal(longPress, 1);
  });

  it('reports a flag-off drop as not saved', () => {
    const off = { ok: false as const, error: 'Write-back is off. Nothing was sent to Notion.' };
    assert.equal(boardMovePersists(off), false);
    assert.equal(flagOffDropMessage(off), MOVE_NOT_SAVED);
    assert.equal(MOVE_NOT_SAVED.includes('Undo'), false);
    assert.equal(boardMovePersists({ ok: true }), true);
    assert.equal(flagOffDropMessage({ ok: false, error: 'Couldn’t save. Moved back.' }), null);
  });

  it('lifts the card onto surface-2 with the drag grip', () => {
    const html = renderToStaticMarkup(createElement(TaskCardFace, { task, lifted: true, mode: 'status', staff: true }));
    assert.match(html, /--surface-2/);
    assert.match(html, /0 16px 32px/);
    assert.match(html, /sidebar-menu\.svg/);
    assert.match(html, /grabbing/);
    const rest = renderToStaticMarkup(createElement(TaskCardFace, { task, mode: 'status', staff: true }));
    assert.equal(rest.includes('sidebar-menu.svg'), false);
    assert.equal(rest.includes('--surface-2'), false);
  });

  it('renders a Drop here slot at the card height', () => {
    const html = renderToStaticMarkup(createElement(DropPlaceholder, { height: 134 }));
    assert.match(html, /Drop here/);
    assert.match(html, /height:134px/);
    assert.match(html, /dashed/);
    assert.match(html, /--accent-tint/);
  });

  it('places the flag-off toast under the board with no Undo', () => {
    const html = renderToStaticMarkup(createElement(BoardToast, { message: MOVE_NOT_SAVED, onDismiss: () => undefined }));
    assert.match(html, /Not saved\. Moving cards to Notion is turned off for now\./);
    assert.equal(html.includes('Undo'), false);
    assert.equal(html.includes('position:fixed'), false);
    assert.match(html, /below-board/);
    assert.match(html, /position:relative/);
  });

  it('keeps equal column tracks when Inbox loses its last card', () => {
    const before = boardColumns(
      [{ name: 'Capture homepage notes', status: 'Inbox', isDone: false }],
      'status',
    );
    const after = boardColumns([], 'status');
    assert.equal(before.length, after.length);
    assert.equal(boardColumnTemplate(before.length, false), boardColumnTemplate(after.length, false));
    assert.equal(boardColumnTemplate(5, false), 'repeat(5, minmax(12.75rem, 1fr))');
    assert.equal(boardColumnTemplate(1, true), 'minmax(0, 1fr)');
  });

  it('toasts a saved stage move with Undo back to the previous stage', () => {
    const moves: string[] = [];
    const saved = stageSavedFeedback({
      task: { ...task, name: 'Homepage', stage: 'Idea' },
      mode: 'stage',
      value: 'Planning',
      previous: 'Idea',
      onUndo: (request) => moves.push(request.value),
    });
    assert.equal(saved.message, 'Moved Homepage to Planning');
    const html = renderToStaticMarkup(
      createElement(BoardToast, { message: saved.message, undo: saved.undo, onDismiss: () => undefined }),
    );
    assert.match(html, /Moved Homepage to Planning/);
    assert.match(html, />Undo</);
    saved.undo();
    assert.deepEqual(moves, ['Idea']);
  });

  it('keeps a flag-off status drop on the not-saved toast without Undo', () => {
    const off = { ok: false as const, error: 'Write-back is off. Nothing was sent to Notion.' };
    assert.equal(flagOffDropMessage(off), MOVE_NOT_SAVED);
    const html = renderToStaticMarkup(createElement(BoardToast, { message: MOVE_NOT_SAVED, onDismiss: () => undefined }));
    assert.match(html, /Not saved/);
    assert.equal(html.includes('Undo'), false);
  });

  it('shows Not in Notion yet only on a staff card with stagePending', () => {
    const pending = { ...task, stagePending: true };
    const staff = renderToStaticMarkup(createElement(TaskCardFace, { task: pending, mode: 'stage', staff: true }));
    assert.match(staff, /Not in Notion yet/);
    assert.match(staff, /Unknown stage/);
    const client = renderToStaticMarkup(createElement(TaskCardFace, { task: pending, mode: 'stage', staff: false }));
    assert.equal(client.includes('Not in Notion yet'), false);
    assert.equal(client.includes('stagePending'), false);
  });
});
