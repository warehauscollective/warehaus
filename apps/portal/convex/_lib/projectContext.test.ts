import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BRIEF_FIELDS,
  CONTEXT_LIMITS,
  buildContextView,
  cleanContextLine,
  cleanContextText,
  contextSourceForToken,
  decisionError,
  decisionKey,
  findDecisionByTitle,
  isBriefFieldKey,
  isSameContent,
  nextDecisionNumber,
  termError,
  termKey,
  type ContextEntry,
} from './projectContext';

const entry = (over: Partial<ContextEntry & { createdAt: number }>): ContextEntry & { createdAt: number } => ({
  kind: 'term',
  key: 'k',
  title: 'T',
  body: 'B',
  updatedAt: 10,
  createdAt: 5,
  ...over,
});

describe('context text cleaning', () => {
  it('trims, collapses spaces, and keeps paragraph breaks', () => {
    assert.equal(cleanContextText('  One   portal \r\n\r\n\r\n\r\n for  staff.  '), 'One portal\n\nfor staff.');
  });

  it('puts a title or term on one line', () => {
    assert.equal(cleanContextLine('  Client \n  portal  '), 'Client portal');
  });

  it('gives two spellings of one term the same key', () => {
    assert.equal(termKey('  Milestone '), termKey('MILESTONE'));
    assert.notEqual(termKey('Milestone'), termKey('Milestones'));
  });
});

describe('context validation', () => {
  it('requires a term and a definition within the limits', () => {
    assert.equal(termError('Task', 'A step inside a milestone.'), null);
    assert.equal(termError('', 'x'), 'Term is required');
    assert.equal(termError('Task', ''), 'Definition is required');
    assert.match(termError('x'.repeat(CONTEXT_LIMITS.term + 1), 'd') ?? '', /Term must be 80/);
    assert.match(termError('Task', 'd'.repeat(CONTEXT_LIMITS.definition + 1)) ?? '', /Definition must be 600/);
  });

  it('requires a decision title and allows an empty detail', () => {
    assert.equal(decisionError('Tasks live only inside milestones.', ''), null);
    assert.equal(decisionError('', 'why'), 'Decision title is required');
    assert.match(decisionError('t'.repeat(CONTEXT_LIMITS.decisionTitle + 1), '') ?? '', /Decision title must be 200/);
  });

  it('knows the four brief fields and no others', () => {
    assert.deepEqual(BRIEF_FIELDS.map((f) => f.key), ['goal', 'audience', 'outOfScope', 'doneWhen']);
    assert.equal(isBriefFieldKey('goal'), true);
    assert.equal(isBriefFieldKey('budget'), false);
  });
});

describe('decision numbering', () => {
  it('starts at 1 and never reuses a number after a gap', () => {
    assert.equal(nextDecisionNumber([]), 1);
    assert.equal(nextDecisionNumber([1, 2, 5]), 6);
    assert.equal(decisionKey(3), '0003');
    assert.equal(decisionKey(1234), '1234');
  });

  it('finds a decision recorded twice by its title, whatever the case or spacing', () => {
    const rows = [{ title: 'Tasks live only inside milestones.', number: 1 }];
    assert.equal(findDecisionByTitle(rows, '  tasks live  only inside milestones. ')?.number, 1);
    assert.equal(findDecisionByTitle(rows, 'Tasks live only inside projects.'), null);
  });
});

describe('no-op writes', () => {
  it('is the same content only when title and body both match', () => {
    assert.equal(isSameContent({ title: 'Task', body: 'A step.' }, { title: 'Task', body: 'A step.' }), true);
    assert.equal(isSameContent({ title: 'Task', body: 'A step.' }, { title: 'task', body: 'A step.' }), false);
    assert.equal(isSameContent(null, { title: 'Task', body: 'A step.' }), false);
  });
});

describe('context view', () => {
  it('is incomplete with no brief, and still lists all four fields', () => {
    const view = buildContextView([]);
    assert.equal(view.summary.incomplete, true);
    assert.equal(view.summary.briefComplete, false);
    assert.deepEqual(view.brief.map((f) => f.body), ['', '', '', '']);
    assert.equal(view.summary.briefUpdatedAt, null);
  });

  it('stops being incomplete at the first brief field and completes at the fourth', () => {
    const one = buildContextView([entry({ kind: 'brief', key: 'goal', title: 'Goal', body: 'One portal.', updatedAt: 40 })]);
    assert.equal(one.summary.incomplete, false);
    assert.equal(one.summary.briefComplete, false);
    assert.equal(one.summary.briefUpdatedAt, 40);
    const all = buildContextView(
      BRIEF_FIELDS.map((f, i) => entry({ kind: 'brief', key: f.key, title: f.label, body: 'set', updatedAt: i })),
    );
    assert.equal(all.summary.briefComplete, true);
  });

  it('sorts terms A to Z and decisions newest first', () => {
    const view = buildContextView([
      entry({ kind: 'term', key: 'task', title: 'Task' }),
      entry({ kind: 'term', key: 'client', title: 'client' }),
      entry({ kind: 'decision', key: '0001', title: 'First', number: 1, createdAt: 100 }),
      entry({ kind: 'decision', key: '0002', title: 'Second', number: 2, createdAt: 200 }),
    ]);
    assert.deepEqual(view.terms.map((t) => t.term), ['client', 'Task']);
    assert.deepEqual(view.decisions.map((d) => d.id), ['0002', '0001']);
    assert.equal(view.decisions[0].recordedAt, 200);
    assert.equal(view.summary.termCount, 2);
    assert.equal(view.summary.decisionCount, 2);
  });
});

describe('context source', () => {
  it('names the bot from its token and never a person', () => {
    assert.equal(contextSourceForToken('grok-bot'), 'grok');
    assert.equal(contextSourceForToken(' Claude '), 'claude');
    assert.equal(contextSourceForToken('warehaus-studio-manager'), 'other');
  });
});
