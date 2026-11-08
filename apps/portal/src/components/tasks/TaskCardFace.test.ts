import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  BoardDropStack,
  DropPlaceholder,
  collapsedCardBox,
  collapsedSourceStyle,
  MOVE_NOT_SAVED,
  boardColumnTemplate,
  boardMovePersists,
  boardShowsEdgeFade,
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
    assert.match(html, /--drop-slot-bg/);
    assert.match(html, /--accent-tint/);
  });

  it('paints light Drop here with a dashed accent', () => {
    const css = readFileSync(new URL('../../styles/global.css', import.meta.url), 'utf8');
    const light = css.match(/:root\.light \.ds-scope \{[^}]+\}/)?.[0] ?? '';
    assert.match(light, /--drop-slot-bg:\s*color-mix\(in oklab, var\(--accent\) 4%, var\(--surface\)\)/);
    assert.match(light, /--drop-slot-border:\s*1px dashed var\(--accent\)/);
    assert.equal(light.includes('dashed var(--border)'), false);
  });

  it('collapses a card with no drag origin and places Drop here at the slot', () => {
    const second = { ...task, id: 't-next', name: 'Second card' };
    const third = { ...task, id: 't-last', name: 'Third card' };
    const fallback = collapsedSourceStyle(null);
    assert.equal(fallback.position, undefined);
    assert.equal(fallback.height, 0);
    assert.equal(fallback.minHeight, 0);
    assert.equal(fallback.overflow, 'hidden');
    assert.equal(fallback.margin, 0);
    const box = collapsedCardBox(null);
    assert.equal(box.position, 'absolute');
    assert.equal(box.height, 0);
    assert.equal(box.minHeight, 0);
    assert.equal(box.overflow, 'hidden');
    assert.equal(box.margin, 0);
    const pinned = collapsedSourceStyle({ top: 12, left: 16, width: 200, height: 96 });
    assert.equal(pinned.position, 'fixed');
    assert.equal(pinned.top, 12);
    const atStart = renderToStaticMarkup(createElement(BoardDropStack, {
      tasks: [task, second],
      draggingId: task.id,
      dropIndex: 0,
      dropHeight: 96,
      renderTask: (item, collapsed) => createElement('div', {
        key: item.id,
        'data-testid': 'task-card',
        'data-collapsed': collapsed ? 'fallback' : 'rest',
        style: collapsed ? { ...box, ...fallback } : undefined,
      }, item.name),
    }));
    assert.match(atStart, /data-collapsed="fallback"/);
    assert.match(atStart, /height:0/);
    assert.match(atStart, /min-height:0/);
    assert.equal(atStart.includes('position:fixed'), false);
    const dragged = atStart.indexOf('Homepage');
    const drop = atStart.indexOf('data-testid="drop-placeholder"');
    const resting = atStart.indexOf('Second card');
    assert.ok(dragged !== -1 && drop !== -1 && resting !== -1);
    assert.ok(dragged < drop && drop < resting);
    assert.match(atStart, /height:96px/);

    const afterFirst = renderToStaticMarkup(createElement(BoardDropStack, {
      tasks: [task, second, third],
      draggingId: second.id,
      dropIndex: 1,
      dropHeight: 96,
      renderTask: (item, collapsed) => createElement('div', {
        key: item.id,
        'data-testid': 'task-card',
        'data-collapsed': collapsed ? 'fallback' : 'rest',
      }, item.name),
    }));
    const first = afterFirst.indexOf('Homepage');
    const mid = afterFirst.indexOf('Second card');
    const slot = afterFirst.indexOf('data-testid="drop-placeholder"');
    const last = afterFirst.indexOf('Third card');
    assert.ok(first !== -1 && mid !== -1 && slot !== -1 && last !== -1);
    assert.ok(first < mid && mid < slot && slot < last);
  });

  it('pins the flag-off toast above the dock with no Undo', () => {
    const html = renderToStaticMarkup(createElement(BoardToast, { message: MOVE_NOT_SAVED, onDismiss: () => undefined }));
    assert.match(html, /Not saved\. Moving cards to Notion is turned off for now\./);
    assert.equal(html.includes('Undo'), false);
    assert.match(html, /data-placement="above-dock"/);
    assert.match(html, /position:fixed/);
    assert.match(html, /z-index:60/);
    assert.match(html, /bottom:calc\(1\.25rem \+ 3\.5rem \+ 16px\)/);
    const flowing = renderToStaticMarkup(createElement(BoardToast, {
      message: 'Couldn’t save. Moved back.',
      onDismiss: () => undefined,
    }));
    assert.match(flowing, /data-placement="below-board"/);
    assert.match(flowing, /position:relative/);
  });

  it('keeps equal column tracks when Inbox loses its last card', () => {
    const before = boardColumns(
      [{ name: 'Capture homepage notes', status: 'Inbox', isDone: false }],
      'status',
    );
    const after = boardColumns([], 'status');
    assert.equal(before.length, after.length);
    assert.equal(boardColumnTemplate(before.length, false), boardColumnTemplate(after.length, false));
    assert.equal(boardColumnTemplate(5, false), 'repeat(5, minmax(12rem, 1fr))');
    assert.equal(boardColumnTemplate(1, true), 'minmax(0, 1fr)');
  });

  it('shows the lane fade only while wide content is still cut off', () => {
    assert.equal(boardShowsEdgeFade({ wide: true, scrollWidth: 1043, clientWidth: 1043, scrollLeft: 0 }), false);
    assert.equal(boardShowsEdgeFade({ wide: true, scrollWidth: 1068, clientWidth: 703, scrollLeft: 0 }), true);
    assert.equal(boardShowsEdgeFade({ wide: true, scrollWidth: 1068, clientWidth: 703, scrollLeft: 365 }), false);
    assert.equal(boardShowsEdgeFade({ wide: false, scrollWidth: 1068, clientWidth: 390, scrollLeft: 0 }), false);
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
    assert.equal(saved.message, 'Moved “Homepage” to Planning');
    const html = renderToStaticMarkup(
      createElement(BoardToast, { message: saved.message, undo: saved.undo, onDismiss: () => undefined }),
    );
    assert.match(html, /Moved “Homepage” to Planning/);
    assert.match(html, /docs-check\.svg/);
    assert.match(html, />Undo</);
    assert.match(html, /data-placement="below-board"/);
    const pinned = renderToStaticMarkup(
      createElement(BoardToast, { message: saved.message, undo: saved.undo, onDismiss: () => undefined, pinned: true }),
    );
    assert.match(pinned, /data-placement="above-dock"/);
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

  it('wraps a long task title on the card', () => {
    const name = 'Quarterly seasonal menu photography, packaging and in-store signage rollout for all twelve Northwind Foods locations';
    const long = { ...task, name };
    const html = renderToStaticMarkup(createElement(TaskCardFace, { task: long, mode: 'status', staff: true }));
    assert.match(html, new RegExp(name));
    assert.match(html, /overflow-wrap:anywhere/);
    const lifted = renderToStaticMarkup(createElement(TaskCardFace, { task: long, lifted: true, mode: 'status', staff: true }));
    assert.match(lifted, /overflow-wrap:anywhere/);
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
