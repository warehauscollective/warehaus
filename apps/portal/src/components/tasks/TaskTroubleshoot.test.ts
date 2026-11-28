import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import type { TroubleshootView } from '@convex/_lib/troubleshoot';
import type { PortalTask } from '@/lib/data/view-models';

// tsx compiles JSX with the classic runtime. The portal build uses the automatic runtime.
Object.assign(globalThis, { React });
const { TaskCardFace } = await import('./TaskBoard');
const { ANSWER_HINT, OUTPUT_TITLE, STOP_CONFIRM, STOP_HINT, TroubleshootSection } = await import('./TaskTroubleshoot');
const { requestTroubleshootFocus, takeTroubleshootFocus } = await import('./troubleshootFocus');

const NOW = Date.UTC(2026, 10, 28, 20, 15, 0);
const base: TroubleshootView = {
  state: 'failed',
  reason: 'The run ended with no new commit',
  runnerId: 'peteroqs-laptop-prod',
  aliveAt: NOW - 40_000,
  canStop: false,
  events: [
    { id: 'e1', summary: 'Run started on peteroqs-laptop-prod', at: NOW - 12 * 60_000 },
    { id: 'e2', summary: 'Commit a1b2c3d pushed', at: NOW - 5 * 60_000 },
  ],
  output: '$ npm run typecheck\nFound 1 error',
  branch: 'milestone/run-troubleshooting',
  commit: 'a1b2c3d',
};
const section = (view: Partial<TroubleshootView>) => renderToStaticMarkup(createElement(TroubleshootSection, { view: { ...base, ...view }, now: NOW }));

describe('Troubleshoot section', () => {
  it('shows the cause, reason, Rerun, the last run, the output, the branch and the last commit on a Failed task', () => {
    const html = section({});
    assert.match(html, />TROUBLESHOOT</);
    assert.match(html, /Staff only/);
    assert.match(html, /data-tone="danger"[^>]*>.*Failed/);
    assert.match(html, /The run ended with no new commit/);
    assert.match(html, /data-testid="troubleshoot-fix"[^>]*>Rerun</);
    assert.match(html, />LAST RUN</);
    assert.match(html, /Commit a1b2c3d pushed/);
    assert.ok(html.includes(OUTPUT_TITLE));
    assert.match(html, /Found 1 error/);
    assert.match(html, /milestone\/run-troubleshooting/);
    assert.match(html, /data-testid="troubleshoot-commit"[^>]*>a1b2c3d</);
    assert.equal(html.includes('troubleshoot-stop'), false);
    assert.equal(html.includes('troubleshoot-answer'), false);
  });

  it('asks for the answer on Needs input, with no output box', () => {
    const html = section({ state: 'needs_input', reason: 'Which Stripe price ID should checkout use?', output: null });
    assert.match(html, /data-tone="info"[^>]*>.*Needs input/);
    assert.match(html, /placeholder="Your answer"/);
    assert.ok(html.includes(ANSWER_HINT.replace("'", '&#x27;')));
    assert.match(html, /data-testid="troubleshoot-fix"[^>]*>Answer and rerun</);
    assert.equal(html.includes(OUTPUT_TITLE), false);
  });

  it('offers Rerun on Stalled', () => {
    const html = section({ state: 'stalled', reason: 'No sign of life from the runner for 15 minutes', output: null });
    assert.match(html, /data-tone="warning"[^>]*>.*Stalled/);
    assert.match(html, /data-testid="troubleshoot-fix"[^>]*>Rerun</);
  });

  it('shows Stop run while running only on a runner that honours stop', () => {
    const running = { state: 'running' as const, reason: null, output: null };
    const stoppable = section({ ...running, canStop: true });
    assert.match(stoppable, /data-tone="info"[^>]*>.*Running/);
    assert.match(stoppable, /peteroqs-laptop-prod · last sign of life 40 seconds ago/);
    assert.match(stoppable, /data-testid="troubleshoot-stop"[^>]*>Stop run</);
    assert.ok(stoppable.includes(STOP_HINT));
    assert.match(stoppable, />THIS RUN</);
    assert.equal(stoppable.includes('troubleshoot-fix'), false);
    const old = section({ ...running, canStop: false });
    assert.equal(old.includes('troubleshoot-stop'), false);
    assert.equal(old.includes(STOP_HINT), false);
  });

  it('uses the confirm copy from the frame', () => {
    assert.equal(STOP_CONFIRM.title, 'Stop this run?');
    assert.equal(
      STOP_CONFIRM.body,
      'The runner stops working on this task. Commits it already pushed stay on the branch, and a late result is ignored.',
    );
  });

  it('is mounted for staff only, and never read by a client query', () => {
    const modal = readFileSync(new URL('./TaskDetailModal.tsx', import.meta.url), 'utf8');
    assert.match(modal, /\{staff && live && task\.milestoneId \? \(\s*<div[^>]*>\s*<TaskTroubleshootLive/);
    for (const file of ['../../../convex/portalData.ts', '../../../convex/tasks.ts', '../../../convex/milestones.ts']) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      for (const word of ['failureOutput', 'taskTroubleshoot', 'rerunAnswer']) assert.equal(source.includes(word), false, `${file} has ${word}`);
    }
  });

  it('hands the Answer and rerun focus to the task once', () => {
    requestTroubleshootFocus('t1');
    assert.equal(takeTroubleshootFocus('t2'), false);
    assert.equal(takeTroubleshootFocus('t1'), true);
    assert.equal(takeTroubleshootFocus('t1'), false);
  });
});

describe('Blocked card face', () => {
  const task: PortalTask = {
    id: 't-blocked',
    name: 'Build the card',
    status: 'Blocked',
    isDone: false,
    date: null,
    stage: null,
    projectId: 'p',
    projectName: 'Warehaus Portal',
    projectStatus: 'In Progress',
    projectEndDate: null,
    nextAction: 'Waiting on client copy',
  };
  const face = { run: null, origin: 'Brief', pullRequest: null };
  const blocked = { label: 'Failed', tone: 'danger' as const, reason: 'The run ended with no new commit', fix: 'Rerun' };

  it('shows the cause above a muted reason, and keeps room for the fix', () => {
    const html = renderToStaticMarkup(createElement(TaskCardFace, { task, staff: true, face: { ...face, blocked } }));
    assert.match(html, /data-testid="cause-label" data-tone="danger"/);
    assert.match(html, /color:var\(--muted\)[^>]*>The run ended with no new commit</);
    assert.match(html, /data-testid="card-fix-room"/);
    assert.equal(html.includes('Waiting on client copy'), false);
  });

  it('keeps the Waiting on text in danger when the task has no cause', () => {
    const html = renderToStaticMarkup(createElement(TaskCardFace, { task, staff: true, face }));
    assert.match(html, /color:var\(--danger-text\)[^>]*>Waiting on client copy</);
    assert.equal(html.includes('cause-label'), false);
    assert.equal(html.includes('card-fix-room'), false);
  });

  it('shows a client no cause, no reason and no fix', () => {
    const html = renderToStaticMarkup(createElement(TaskCardFace, { task, staff: false, face: { ...face, blocked } }));
    assert.equal(html.includes('cause-label'), false);
    assert.equal(html.includes('The run ended'), false);
    assert.equal(html.includes('Waiting on client copy'), false);
    assert.equal(html.includes('card-fix-room'), false);
  });
});
