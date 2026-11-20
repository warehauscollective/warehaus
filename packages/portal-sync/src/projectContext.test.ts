import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PROJECT_CONTEXT_DOC_TYPES, PROJECT_CONTEXT_KINDS, projectContextKind } from './projectContext';
import { validateWriteback, type WriteProperties } from './writeback';

const doc = (docType: string): WriteProperties => ({
  Title: 'Context',
  'Doc Type': docType,
  Summary: 'Project context',
  Order: 1,
  'External ID': 'wh_doc_context',
  Source: 'portal',
  Status: 'Draft',
  'Publish to Warehaus': false,
  Client: ['client-page'],
  Project: ['project-page'],
});

describe('project context doc types', () => {
  it('maps each doc type to its kind and back', () => {
    assert.deepEqual(PROJECT_CONTEXT_KINDS, ['brief', 'glossary', 'decisions']);
    assert.equal(projectContextKind('Project Brief'), 'brief');
    assert.equal(projectContextKind('Glossary'), 'glossary');
    assert.equal(projectContextKind('Decisions Log'), 'decisions');
  });

  it('treats every other doc type as not context', () => {
    for (const other of ['Start Here', 'Meeting Notes', 'glossary', 'Decision', '', null, undefined]) {
      assert.equal(projectContextKind(other), null);
    }
  });

  it('can be written back to Notion as an unpublished draft', () => {
    for (const kind of PROJECT_CONTEXT_KINDS) {
      const result = validateWriteback({
        database: 'clientDocs',
        properties: doc(PROJECT_CONTEXT_DOC_TYPES[kind]),
        actor: 'staff',
      });
      assert.equal(result.ok, true, kind);
    }
  });

  it('cannot be written back already published', () => {
    const published = { ...doc('Glossary'), Status: 'Published', 'Publish to Warehaus': true };
    assert.equal(validateWriteback({ database: 'clientDocs', properties: published, actor: 'staff' }).ok, false);
  });

  it('rejects a doc type Notion does not have', () => {
    assert.equal(validateWriteback({ database: 'clientDocs', properties: doc('Decision'), actor: 'staff' }).ok, false);
  });
});
