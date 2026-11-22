import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import { DRIVER_LOCKED, DRIVER_SAVE_ERROR, AgentDriverSettingView } from './AgentDriverSetting';
import { LOOP_RETRY, MilestoneLoopView, fixtureLoopModel } from './MilestoneLoop';

Object.assign(globalThis, { React });

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe('milestone loop frames', () => {
  it('offers only Retry when a run is blocked', () => {
    const model = fixtureLoopModel('blocked');
    assert.ok(model);
    const view = html(createElement(MilestoneLoopView, { model }));
    assert.match(view, new RegExp(LOOP_RETRY));
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
    assert.match(failed?.heading ?? '', /Couldn't draft tasks/);
    assert.equal(failed?.awaitingReason, "Tasks couldn't be drafted. Try again, or add a task yourself.");
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
