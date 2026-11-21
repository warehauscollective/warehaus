import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildContextView } from '@convex/_lib/projectContext';
import { FIXTURE_PROJECT_CONTEXT, briefMeta, contextDate, contextSubTabs, countMeta, grillingPrompt } from './projectContextView';

describe('context sub-tabs', () => {
  it('lists four tabs in order, with counts once loaded', () => {
    assert.deepEqual(contextSubTabs(null).map((tab) => tab.label), ['Brief', 'Glossary', 'Decisions', 'Resources']);
    assert.deepEqual(
      contextSubTabs(FIXTURE_PROJECT_CONTEXT).map((tab) => tab.label),
      ['Brief', 'Glossary 6', 'Decisions 3', 'Resources'],
    );
    assert.deepEqual(contextSubTabs(buildContextView([])).map((tab) => tab.label), ['Brief', 'Glossary 0', 'Decisions 0', 'Resources']);
  });
});

describe('context labels', () => {
  it('prints a short UTC date', () => {
    assert.equal(contextDate(Date.parse('2026-11-18T23:30:00Z')), 'Nov 18');
    assert.equal(contextDate(Date.parse('2026-01-01T00:00:00Z')), 'Jan 1');
  });

  it('says when the brief was last updated, or that it has not started', () => {
    assert.equal(briefMeta(FIXTURE_PROJECT_CONTEXT), 'Updated Nov 18');
    assert.equal(briefMeta(buildContextView([])), 'Not started');
  });

  it('counts with the right noun', () => {
    assert.equal(countMeta(0, 'term', 'terms', 'No terms'), 'No terms');
    assert.equal(countMeta(1, 'term', 'terms', 'No terms'), '1 term');
    assert.equal(countMeta(6, 'term', 'terms', 'No terms'), '6 terms');
  });
});

describe('grilling prompt', () => {
  it('names the project, carries its id, and points the bot at the rules first', () => {
    const prompt = grillingPrompt({ id: 'project-1', name: 'Warehaus Portal' });
    assert.match(prompt, /"Warehaus Portal"/);
    assert.match(prompt, /Project id: project-1/);
    assert.ok(prompt.indexOf('get_grilling_instructions') < prompt.indexOf('get_project_context'));
  });
});

describe('fixture context', () => {
  it('agrees with its own summary', () => {
    assert.equal(FIXTURE_PROJECT_CONTEXT.terms.length, FIXTURE_PROJECT_CONTEXT.summary.termCount);
    assert.equal(FIXTURE_PROJECT_CONTEXT.decisions.length, FIXTURE_PROJECT_CONTEXT.summary.decisionCount);
    assert.deepEqual(FIXTURE_PROJECT_CONTEXT.decisions.map((d) => d.number), [3, 2, 1]);
  });
});
