import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RUNNER_HEALTH_STATES, runnerHealthCopy, runnerHealthState } from '@convex/_lib/runnerHealth';
import {
  RunnerConfirmBody,
  RunnerListBody,
  RunnerOutOfDateBody,
  RunnerPairedBody,
  RunnerRevokeBody,
  RunnerSetupBody,
  RunnerStatusBody,
  RunnerStatusChip,
  runnerFixtureState,
  runnerHealthFixture,
  runnerModalStep,
} from './RunnerStatus';

// The test runner compiles JSX to React.createElement, so React has to be in scope.
Object.assign(globalThis, { React });

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const NOW = 1_800_000_000_000;
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
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
    assert.equal(text(chip('ready')), 'Runner ready · peter-mbp-prod · seen 4m ago');
    assert.equal(text(chip('working')), 'Runner working · Client experience launch');
    assert.equal(text(chip('offline')), 'Runner offline · last seen 2h ago');
    assert.equal(text(chip('offline-building')), 'Runner offline · Client experience launch');
    assert.equal(text(chip('no-repo', false, () => undefined)), 'Runner not set up · Add repo');
    assert.equal(text(chip('no-runner')), 'Runner not set up · Set up runner');
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
      'Runner ready RUNNER peter-mbp-prod LAST SEEN 4m ago MILESTONE — The runner will start an agent when a milestone moves to Building.',
    );
    assert.equal(
      text(body('working')),
      'Runner working RUNNER peter-mbp-prod LAST SEEN 4m ago MILESTONE Client experience launch The runner is working on this milestone.',
    );
    assert.equal(
      text(body('offline')),
      "Runner offline RUNNER peter-mbp-prod LAST SEEN 2h ago MILESTONE — START COMMAND npm run runner -- start --production No runner serving this repository has been seen in the last 10 minutes. Moving a milestone to Building won't start an agent until one is running.",
    );
    assert.equal(
      text(body('offline-building')),
      'Runner offline RUNNER peter-mbp-prod LAST SEEN 2h ago MILESTONE Client experience launch START COMMAND npm run runner -- start --production Client experience launch is Building and waiting for the runner. Start it to pick the milestone up.',
    );
    assert.equal(
      text(body('no-repo')),
      'Runner not set up RUNNER — LAST SEEN — MILESTONE — This project has no GitHub repo. Add a repo before the runner can start an agent.',
    );
    assert.equal(
      text(body('no-runner')),
      "Runner not set up RUNNER — LAST SEEN — MILESTONE — The command prints an 8-character code. Enter it here to pair that Mac. Its secret goes straight to the Mac's Keychain and is never shown.",
    );
  });
});

describe('runner status is staff only', () => {
  const source = read('./RunnerStatus.tsx');
  const roadmap = read('./ProjectRoadmap.tsx');

  it('renders nothing and asks Convex nothing for a client', () => {
    assert.match(source, /const querying = staff && live && !fixtures;/);
    assert.match(source, /querying \? \{ projectId: projectId as Id<'projects'>, hostSlug \} : 'skip'/);
    assert.match(source, /querying && open && step === 'confirm' \? \{ code, hostSlug \} : 'skip'/);
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
    // The chip's one query, plus the pairing lookup that runs only while staff confirm a code.
    assert.equal((source.match(/useSafeQuery</g) ?? []).length, 2);
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

describe('runner set-up states', () => {
  const noop = () => undefined;
  const view = runnerHealthFixture('ready', NOW);
  const copy = runnerHealthCopy(view, NOW);
  const html = (element: Parameters<typeof renderToStaticMarkup>[0]) => text(renderToStaticMarkup(element));

  it('pairs from the code the command prints', () => {
    assert.equal(
      html(createElement(RunnerSetupBody, { production: true, code: '', onCode: noop, onPair: noop })),
      "No runner set up ON THE MAC THAT WILL RUN WORK npm run runner -- setup --production Pairing code The command prints an 8-character code. Enter it here to pair that Mac. Its secret goes straight to the Mac's Keychain and is never shown. Pair runner",
    );
    assert.equal(
      html(createElement(RunnerConfirmBody, { code: 'K7QM-4XPA', production: true, runnerId: 'peter-mbp-prod', onRunnerId: noop, onCancel: noop, onConfirm: noop })),
      'Confirm this runner CODE K7QM-4XPA DEPLOYMENT Production Runner id Only confirm a code you can see in your own terminal. Codes expire after 10 minutes. Cancel Confirm and pair',
    );
    assert.equal(
      html(createElement(RunnerPairedBody, { runnerId: 'peter-mbp-prod', lastSeen: 'Just now', production: true, onDone: noop })),
      'Runner paired RUNNER peter-mbp-prod LAST SEEN Just now SERVES Every project with a repository this Mac can reach KEEP IT RUNNING npm run runner -- install --production Installing adds a login item that starts the runner at login and restarts it if it stops. Done',
    );
  });

  it('lists registered runners with Revoke, and asks before revoking the last one', () => {
    assert.equal(
      html(createElement(RunnerListBody, { copy, runners: view.runners, production: true, now: NOW, onRevoke: noop, onPairAnother: noop })),
      'Runner ready RUNNERS ON PRODUCTION 2 registered peter-mbp-prod SEEN 4M AGO Revoke studio-mini-prod SEEN 3D AGO Revoke Revoking a runner stops it taking work at once. Any run in progress goes back to the queue. Pair another runner',
    );
    const runner = view.runners[0]!;
    assert.equal(
      html(createElement(RunnerRevokeBody, { runner, now: NOW, lastRunner: true, production: true, onCancel: noop, onRevoke: noop })),
      'Revoke peter-mbp-prod? RUNNER peter-mbp-prod LAST SEEN 4m ago It stops taking work at once, and any run in progress goes back to the queue. This is the last production runner, so production milestones wait until another is paired. Cancel Revoke runner',
    );
  });

  it('says a runner is out of date and how to update it', () => {
    const old = { ...view, protocolMin: 4, runners: [{ ...view.runners[0]!, protocolVersion: 3 }] };
    assert.equal(
      html(createElement(RunnerOutOfDateBody, { view: old, now: NOW })),
      'Runner out of date RUNNER peter-mbp-prod LAST SEEN 4m ago VERSION Protocol 3 · the Portal needs 4 UPDATE git pull && npm run runner -- install --production The Portal refuses claims from this runner until it is updated. The runner never updates its own code.',
    );
    assert.equal(html(createElement(RunnerOutOfDateBody, { view, now: NOW })), '');
  });

  it('offers Manage runners from the status body, and reads ?runnerModal= steps', () => {
    assert.match(text(renderToStaticMarkup(createElement(RunnerStatusBody, { copy, onManage: noop }))), /Manage runners$/);
    assert.equal(runnerModalStep('revoke'), 'revoke');
    assert.equal(runnerModalStep('open'), null);
  });

  it('shows the compact chip by default and the expanded line only on hover at 1440', () => {
    const source = read('./RunnerStatus.tsx');
    assert.match(source, /<RunnerStatusChip copy=\{copy\} compact onOpen=\{onOpen\} \/>/);
    assert.match(source, /<HoverChip copy=\{copy\} hover=\{!phone\}/);
    assert.match(source, /position: 'absolute', top: 0, right: 0/);
    assert.match(chip('ready'), /data-size="default"/);
    assert.match(chip('ready', true), /data-size="compact"/);
  });
});
