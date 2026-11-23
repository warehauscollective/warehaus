import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RUNNER_HEALTH_STATES, runnerHealthCopy, runnerHealthState } from '@convex/_lib/runnerHealth';
import { RunnerStatusBody, RunnerStatusChip, runnerFixtureState, runnerHealthFixture } from './RunnerStatus';

// The test runner compiles JSX to React.createElement, so React has to be in scope.
Object.assign(globalThis, { React });

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const NOW = 1_800_000_000_000;
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
const chip = (state: (typeof RUNNER_HEALTH_STATES)[number], compact = false, onAddRepo?: () => void) =>
  renderToStaticMarkup(
    createElement(RunnerStatusChip, { copy: runnerHealthCopy(runnerHealthFixture(state, NOW), NOW), compact, onAddRepo }),
  );
const body = (state: (typeof RUNNER_HEALTH_STATES)[number]) =>
  renderToStaticMarkup(createElement(RunnerStatusBody, { copy: runnerHealthCopy(runnerHealthFixture(state, NOW), NOW) }));

describe('runner status fixtures', () => {
  it('has a fixture for every ?runner= value, and Ready by default', () => {
    assert.deepEqual([...RUNNER_HEALTH_STATES], ['ready', 'working', 'offline', 'offline-building', 'no-repo', 'no-runner']);
    for (const state of RUNNER_HEALTH_STATES) {
      assert.equal(runnerFixtureState(state), state);
      assert.equal(runnerHealthState(runnerHealthFixture(state, NOW), NOW), state);
    }
    assert.equal(runnerFixtureState(null), 'ready');
    assert.equal(runnerFixtureState('nope'), 'ready');
  });
});

describe('runner status chip', () => {
  it('shows the 1440 line for each state', () => {
    assert.equal(text(chip('ready')), "Runner ready · Peter's Mac · seen 20s ago");
    assert.equal(text(chip('working')), 'Runner working · Client experience launch');
    assert.equal(text(chip('offline')), 'Runner offline · last seen 2h ago');
    assert.equal(text(chip('offline-building')), 'Runner offline · Client experience launch');
    assert.equal(text(chip('no-repo', false, () => undefined)), 'Runner not set up · Add repo');
    assert.equal(text(chip('no-runner')), 'Runner not set up · No runner allowed');
  });

  it('shrinks to a dot and a short label at 390', () => {
    const labels = RUNNER_HEALTH_STATES.map((state) => text(chip(state, true, () => undefined)));
    assert.deepEqual(labels, ['Ready', 'Working', 'Offline', 'Offline', 'Not set up', 'Not set up']);
  });

  it('uses the right dot and the amber outline only for offline while Building', () => {
    const dots = RUNNER_HEALTH_STATES.map((state) => /data-runner-dot="(\w+)"/.exec(chip(state))?.[1]);
    assert.deepEqual(dots, ['ready', 'warning', 'offline', 'warning', 'unset', 'unset']);
    for (const state of RUNNER_HEALTH_STATES) {
      const html = chip(state);
      assert.equal(html.includes('border:1px solid var(--warning)'), state === 'offline-building', state);
      // Not set up is the ring alone: one circle. Every other dot has a core.
      assert.equal((html.match(/<circle/g) ?? []).length, state === 'no-repo' || state === 'no-runner' ? 1 : 2, state);
    }
  });

  it('opens the modal from one button, with Add repo as its own control only when there is somewhere to go', () => {
    const linked = chip('no-repo', false, () => undefined);
    assert.equal((linked.match(/<button/g) ?? []).length, 2);
    assert.match(linked, /data-testid="runner-status-add-repo"/);
    assert.equal((chip('no-repo').match(/<button/g) ?? []).length, 1);
    assert.equal((chip('no-runner', false, () => undefined).match(/<button/g) ?? []).length, 1);
    assert.match(chip('ready'), /aria-haspopup="dialog"/);
  });
});

describe('runner status modal body', () => {
  it('shows the fields and helper for each state', () => {
    assert.equal(
      text(body('ready')),
      "Runner ready RUNNER Peter's Mac LAST SEEN 20s ago MILESTONE — The runner will start an agent when a milestone moves to Building.",
    );
    assert.equal(
      text(body('working')),
      "Runner working RUNNER Peter's Mac LAST SEEN 20s ago MILESTONE Client experience launch The runner is working on this milestone.",
    );
    assert.equal(
      text(body('offline')),
      "Runner offline RUNNER Peter's Mac LAST SEEN 2h ago MILESTONE — Your Mac is asleep or the runner is off. Moving a milestone to Building won't start an agent.",
    );
    assert.equal(
      text(body('offline-building')),
      "Runner offline RUNNER Peter's Mac LAST SEEN 2h ago MILESTONE Client experience launch Client experience launch is Building and waiting for the runner.",
    );
    assert.equal(
      text(body('no-repo')),
      'Runner not set up RUNNER — LAST SEEN — MILESTONE — This project has no GitHub repo. Add a repo before the runner can start an agent.',
    );
    assert.equal(text(body('no-runner')), 'Runner not set up RUNNER — LAST SEEN — MILESTONE — No runner is allowed for this project.');
  });
});

describe('runner status is staff only', () => {
  const source = read('./RunnerStatus.tsx');
  const roadmap = read('./ProjectRoadmap.tsx');

  it('renders nothing and asks Convex nothing for a client', () => {
    assert.match(source, /staff && live && !fixtures \? \{ projectId: projectId as Id<'projects'>, hostSlug \} : 'skip'/);
    assert.match(source, /if \(!staff \|\| now == null\) return null;/);
    // The chip sits inside the staff branch of the heading action.
    const action = roadmap.slice(roadmap.indexOf('action={'), roadmap.indexOf('<RunnerHealth') + 1);
    assert.match(action, /staff \? \(/);
    assert.equal((roadmap.match(/<RunnerHealth/g) ?? []).length, 1);
  });

  it('uses one modal: PortalModal, 520 wide, a bottom sheet on a phone, no drawer', () => {
    assert.match(source, /<PortalModal[\s\S]*?header="default"[\s\S]*?width=\{520\}[\s\S]*?sheet=\{narrow \? 'bottom' : 'center'\}/);
    assert.equal(/drawer|aside|position: 'fixed'/i.test(source), false);
  });

  it('moves the relative times on a local clock, not a second query', () => {
    assert.equal((source.match(/useSafeQuery</g) ?? []).length, 1);
    assert.match(source, /RUNNER_CLOCK_MS = 20_000/);
    assert.match(source, /window\.setInterval\(\(\) => setNow\(Date\.now\(\)\), intervalMs\)/);
  });

  it('keeps runner data out of every client view', () => {
    const projects = read('../../../convex/projects.ts');
    const clientShape = projects.slice(projects.indexOf('function toClientProject'), projects.indexOf('export const'));
    assert.equal(/runner|lastSeen/i.test(clientShape), false);
    for (const block of projects.split('export const ').filter((part) => part.includes('= clientQuery('))) {
      assert.equal(/runner|lastSeen/i.test(block), false);
    }
    assert.equal(/runner/i.test(read('../../lib/data/view-models.ts')), false);
  });
});
