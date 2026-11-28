import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import { DRIVER_LOCKED, DRIVER_SAVE_ERROR, AgentDriverSettingView } from './AgentDriverSetting';
import type { MilestoneRoadmapView } from '@convex/_lib/milestones';
import { readFileSync } from 'node:fs';
import { LOOP_ADD, LOOP_ADD_HINT, LOOP_RERUN, LOOP_UPDATED, MilestoneLoopView, UpdatedStamp, fixtureLoopModel, loopSubtitle, loopSubtitleLine, milestoneLoopSubtitle } from './MilestoneLoop';

Object.assign(globalThis, { React });

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe('milestone loop frames', () => {
  it('offers Rerun on the Blocked task, and no Retry, when a run is blocked', () => {
    const model = fixtureLoopModel('blocked');
    assert.ok(model);
    const view = html(createElement(MilestoneLoopView, { model }));
    assert.equal(view.split('data-testid="milestone-loop-fix"').length - 1, 1);
    assert.match(view, new RegExp(`data-fix="rerun"[^>]*>${LOOP_RERUN}<`));
    assert.equal(/>Retry</.test(view), false);
    assert.equal(view.includes('data-testid="milestone-retry"'), false);
    assert.equal(view.includes('Mark as Ready to Ship'), false);
    assert.equal(view.includes('Ready to Ship'), false);
    assert.match(view, /BUILDING · BLOCKED/);
    assert.match(view, /The run is blocked/);
  });

  it('keeps Move to Awaiting Go disabled with a visible reason while tasks are drafting', () => {
    const model = fixtureLoopModel('generating');
    assert.ok(model);
    const view = html(createElement(MilestoneLoopView, { model }));
    assert.match(view, /aria-disabled="true"/);
    assert.match(view, /aria-describedby="milestone-awaiting-reason"/);
    assert.match(view, /Tasks are still being drafted/);
    assert.match(view, /Drafting tasks/);
  });

  it('uses the empty and failed copy', () => {
    const empty = fixtureLoopModel('empty');
    const failed = fixtureLoopModel('failed');
    assert.match(empty?.heading ?? '', /No tasks were drafted/);
    assert.match(failed?.heading ?? '', /Couldn’t draft tasks/);
    assert.equal(failed?.awaitingReason, 'Tasks couldn’t be drafted. Try again, or add a task yourself.');
  });

  it('uses the drafted, failed, and building page subtitles, and leaves the other states alone', () => {
    assert.equal(fixtureLoopModel('drafted')?.subtitle, 'Milestone · 6 drafted tasks');
    assert.equal(loopSubtitle(fixtureLoopModel('drafted')), `Milestone · 6 drafted tasks · ${LOOP_UPDATED}`);
    assert.equal(fixtureLoopModel('failed')?.subtitle, "Milestone · Couldn’t draft tasks");
    assert.equal(loopSubtitle(fixtureLoopModel('failed')), `Milestone · Couldn’t draft tasks · ${LOOP_UPDATED}`);
    assert.equal(fixtureLoopModel('building')?.subtitle, 'Milestone · 3 of 6 tasks done');
    assert.equal(loopSubtitle(fixtureLoopModel('building')), `Milestone · 3 of 6 tasks done · ${LOOP_UPDATED}`);
    assert.equal(fixtureLoopModel('cursor')?.subtitle, 'Milestone · 3 of 6 tasks done');
    assert.equal(loopSubtitle(fixtureLoopModel('cursor')), `Milestone · 3 of 6 tasks done · ${LOOP_UPDATED}`);
    // Every loop frame carries the stamp as a desktop-only span, so it is hidden at 390.
    assert.equal(fixtureLoopModel('generating')?.subtitle, 'Milestone · Drafting tasks');
    assert.equal(loopSubtitle(fixtureLoopModel('generating')), `Milestone · Drafting tasks · ${LOOP_UPDATED}`);
    assert.equal(fixtureLoopModel('empty')?.subtitle, 'Milestone · No tasks yet');
    assert.equal(loopSubtitle(fixtureLoopModel('empty')), `Milestone · No tasks yet · ${LOOP_UPDATED}`);
    assert.equal(fixtureLoopModel('blocked')?.subtitle, 'Milestone · Run blocked');
    assert.equal(loopSubtitle(fixtureLoopModel('blocked')), `Milestone · Run blocked · ${LOOP_UPDATED}`);
    const stamped = html(createElement(Stamp, { text: "Milestone · Couldn’t draft tasks", stamp: LOOP_UPDATED }));
    assert.match(stamped, /Milestone · Couldn’t draft tasks/);
    assert.match(stamped, /portal-detail-stamp/);
    assert.match(stamped, new RegExp(LOOP_UPDATED));
    assert.equal(html(createElement(Stamp, { text: 'Milestone · Drafting tasks' })).includes('portal-detail-stamp'), false);
  });

  it('draws the drafted title with the blue ring and keeps the add hint on one line', () => {
    const drafted = fixtureLoopModel('drafted');
    assert.ok(drafted);
    const editing = html(createElement(MilestoneLoopView, { model: drafted, onRename: () => undefined }));
    assert.match(editing, /border:2px solid #3b82f6/);
    assert.match(editing, /outline:none/);
    assert.match(editing, /flex:0 0 auto[^"]*white-space:nowrap[^"]*">↵ to add · Manual/);
    assert.match(editing, /color:var\(--muted\);background:color-mix\(in srgb, var\(--muted\) 16%, transparent\)[^"]*">DRAFT/);
  });

  it('shows the add field on drafted, empty and failed, with the hint on drafted and failed only', () => {
    const hint = (kind: string) => {
      const model = fixtureLoopModel(kind);
      assert.ok(model);
      const view = html(createElement(MilestoneLoopView, { model }));
      return { add: view.includes(`aria-label="${LOOP_ADD}"`), hint: view.includes(LOOP_ADD_HINT) };
    };
    assert.deepEqual(hint('drafted'), { add: true, hint: true });
    assert.deepEqual(hint('failed'), { add: true, hint: true });
    assert.deepEqual(hint('empty'), { add: true, hint: false });
    for (const kind of ['generating', 'building', 'cursor', 'blocked']) assert.deepEqual(hint(kind), { add: false, hint: false });
  });

  it('offers Try again on empty and failed only, and a task Rerun on blocked only', () => {
    for (const kind of ['generating', 'drafted', 'empty', 'failed', 'building', 'cursor', 'blocked']) {
      const model = fixtureLoopModel(kind);
      assert.ok(model);
      const view = html(createElement(MilestoneLoopView, { model }));
      assert.equal(view.includes('data-testid="milestone-try-again"'), kind === 'empty' || kind === 'failed', kind);
      assert.equal(view.includes('data-testid="milestone-loop-fix"'), kind === 'blocked', kind);
      assert.equal(view.includes('data-testid="milestone-retry"'), false, kind);
      // Regenerate is on the drafted card only (ADR-0005): it archives the planner's drafts and plans again.
      const withRegenerate = html(createElement(MilestoneLoopView, { model, onRegenerate: () => undefined }));
      assert.equal(withRegenerate.includes('data-testid="milestone-regenerate"'), kind === 'drafted', kind);
      assert.equal(/disabled="" tabindex="-1" data-testid="milestone-awaiting"/.test(view), ['generating', 'empty', 'failed'].includes(kind), kind);
      assert.equal(view.includes('Ready to Ship'), false, kind);
    }
  });

  it('uses the typographic quotes in the frames and keeps the run feed in two columns', () => {
    const building = fixtureLoopModel('building');
    const blocked = fixtureLoopModel('blocked');
    assert.equal(building?.agentLine, 'Running with Claude Code (on Peter’s Mac) · peter-mbp');
    assert.equal(fixtureLoopModel('cursor')?.agentLine, 'Running with Cursor cloud agent');
    assert.equal(blocked?.body, 'The Claude Code runner on peter-mbp stopped responding while building “Build milestone overview.”');
    assert.ok(building);
    const view = html(createElement(MilestoneLoopView, { model: building }));
    assert.match(view, /LATEST FROM THE RUN/);
    assert.equal(view.split('display:flex;gap:16px;padding:10px 0;align-items:flex-start').length - 1, 3);
  });

  it('mutes done titles and marks only the task being built', () => {
    for (const kind of ['building', 'cursor']) {
      const model = fixtureLoopModel(kind);
      assert.ok(model);
      assert.deepEqual(model.tasks.map((task) => Boolean(task.done)), [true, true, true, false, false, false]);
      assert.deepEqual(model.tasks.filter((task) => task.current).map((task) => task.order), [4]);
      const view = html(createElement(MilestoneLoopView, { model }));
      assert.equal(view.split('data-testid="milestone-loop-current"').length - 1, 1);
      assert.match(view, /data-testid="milestone-loop-current" style="[^"]*width:6px;height:6px[^"]*background:#3b82f6/);
      assert.match(view, /color:var\(--muted\)[^"]*">Design project overview/);
      assert.match(view, /color:var\(--fg\)[^"]*">Build milestone overview/);
    }
    const blocked = fixtureLoopModel('blocked');
    assert.ok(blocked);
    assert.equal(blocked.tasks.some((task) => task.current), false);
    assert.equal(html(createElement(MilestoneLoopView, { model: blocked })).includes('milestone-loop-current'), false);
  });

  it('keeps the planning bar at full blue and the buttons at frame height', () => {
    const generating = fixtureLoopModel('generating');
    assert.ok(generating);
    const view = html(createElement(MilestoneLoopView, { model: generating }));
    assert.match(view, /height:4px;border-radius:2px;background:var\(--muted\)"><div style="width:120px;height:4px;border-radius:2px;background:#3b82f6"/);
    assert.match(view, /data-testid="milestone-awaiting" style="[^"]*height:42px/);
    const empty = fixtureLoopModel('empty');
    assert.ok(empty);
    assert.match(html(createElement(MilestoneLoopView, { model: empty })), /data-testid="milestone-try-again" style="[^"]*height:44px/);
  });
});

function Stamp({ text, stamp }: { text: string; stamp?: string }) {
  return createElement('p', null, loopSubtitleLine(text, stamp));
}

function milestone(partial: Partial<MilestoneRoadmapView>): MilestoneRoadmapView {
  return partial as MilestoneRoadmapView;
}

function taskRows(count: number, blockedAt?: number): MilestoneRoadmapView['rows'] {
  return Array.from({ length: count }, (_, index) => ({
    children: [],
    blockedReason: blockedAt === index ? 'stopped' : undefined,
  })) as unknown as MilestoneRoadmapView['rows'];
}

describe('live page subtitles', () => {
  const AT = Date.UTC(2026, 10, 22, 16, 0, 0);

  it('reads Milestone · [status] for every loop state and carries the real last-change time', () => {
    const drafted = milestoneLoopSubtitle(milestone({ status: 'Planning', rows: taskRows(6), doneCount: 0, updatedAt: AT }));
    assert.deepEqual(drafted, { text: 'Milestone · 6 drafted tasks', updatedAt: AT });
    const one = milestoneLoopSubtitle(milestone({ status: 'Planning', rows: taskRows(1), doneCount: 0 }));
    assert.equal(one?.text, 'Milestone · 1 drafted task');
    const failed = milestoneLoopSubtitle(milestone({ status: 'Planning', planning: 'blocked', rows: taskRows(0), doneCount: 0, updatedAt: AT }));
    assert.deepEqual(failed, { text: "Milestone · Couldn’t draft tasks", updatedAt: AT });
    const building = milestoneLoopSubtitle(milestone({ status: 'Building', rows: taskRows(6), doneCount: 3, updatedAt: AT }));
    assert.deepEqual(building, { text: 'Milestone · 3 of 6 tasks done', updatedAt: AT });
    const drafting = milestoneLoopSubtitle(milestone({ status: 'Planning', planning: 'running', rows: taskRows(0), doneCount: 0, updatedAt: AT }));
    assert.deepEqual(drafting, { text: 'Milestone · Drafting tasks', updatedAt: AT });
    const empty = milestoneLoopSubtitle(milestone({ status: 'Planning', rows: taskRows(0), doneCount: 0, updatedAt: AT }));
    assert.deepEqual(empty, { text: 'Milestone · No tasks yet', updatedAt: AT });
    const blocked = milestoneLoopSubtitle(milestone({ status: 'Building', rows: taskRows(6, 3), doneCount: 3, updatedAt: AT }));
    assert.deepEqual(blocked, { text: 'Milestone · Run blocked', updatedAt: AT });
  });

  it('shows no stamp without a real time, and never the fixed "just now" copy', () => {
    const none = milestoneLoopSubtitle(milestone({ status: 'Building', rows: taskRows(6), doneCount: 3 }));
    assert.deepEqual(none, { text: 'Milestone · 3 of 6 tasks done' });
    assert.equal(milestoneLoopSubtitle(milestone({ status: 'Shipped', rows: taskRows(1), doneCount: 1, updatedAt: AT })), null);
    const line = html(createElement('p', null, loopSubtitleLine('Milestone · 3 of 6 tasks done', undefined, undefined)));
    assert.equal(line, '<p>Milestone · 3 of 6 tasks done</p>');
    const source = readFileSync(new URL('./MilestoneLoop.tsx', import.meta.url), 'utf8');
    const live = source.slice(source.indexOf('export function liveLoopModel'));
    assert.equal(live.includes('LOOP_UPDATED'), false);
    assert.equal(live.includes('Updated just now'), false);
  });

  it('renders no time on the server, so the first client render matches it', () => {
    // The stamp reads the clock in an effect. A server render has no effect pass and prints no time.
    const server = html(createElement('p', null, loopSubtitleLine('Milestone · 3 of 6 tasks done', undefined, AT)));
    assert.equal(server, '<p>Milestone · 3 of 6 tasks done</p>');
    assert.equal(html(createElement(UpdatedStamp, { at: AT })), '');
    const source = readFileSync(new URL('./MilestoneLoop.tsx', import.meta.url), 'utf8');
    const stamp = source.slice(source.indexOf('export function UpdatedStamp'), source.indexOf('export function loopSubtitleLine'));
    assert.match(stamp, /useState<number \| null>\(null\)/);
    assert.match(stamp, /useEffect/);
    assert.match(stamp, /portal-detail-stamp/);
  });
});

describe('build agent setting', () => {
  it('locks the control while a milestone is Building and never asks for a key', () => {
    const view = html(
      createElement(AgentDriverSettingView, {
        driver: 'claude_code',
        locked: true,
        onSave: async () => undefined,
      }),
    );
    assert.match(view, new RegExp(DRIVER_LOCKED.replace(/'/g, '&#x27;')));
    assert.match(view, /aria-disabled="true"/);
    assert.match(view, /aria-describedby="project-agent-locked"/);
    assert.equal(/type="password"|API key|CURSOR_API_KEY|token/i.test(view), false);
  });

  it('says nothing changed when the save fails', () => {
    const view = html(
      createElement(AgentDriverSettingView, {
        driver: 'claude_code',
        preview: 'error',
        onSave: async () => undefined,
      }),
    );
    assert.match(view, new RegExp(DRIVER_SAVE_ERROR.replace(/'/g, '&#x27;')));
    assert.equal(/type="password"|API key/i.test(view), false);
  });
});
