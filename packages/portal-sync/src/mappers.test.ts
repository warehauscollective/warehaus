import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mapNotionClient, mapNotionProject } from './mappers';

describe('notion → convex mappers', () => {
  it('upserts enabled client with slug', () => {
    const result = mapNotionClient('page-1', {
      'Company Name': { type: 'title', title: [{ plain_text: 'Acme' }] },
      Slug: { type: 'rich_text', rich_text: [{ plain_text: 'acme' }] },
      Status: { type: 'select', select: { name: 'Active' } },
      'Portal access': { type: 'select', select: { name: 'Enabled' } },
      'External ID': { type: 'rich_text', rich_text: [{ plain_text: 'wh_cli_acme' }] },
      'Ops Leak': { type: 'rich_text', rich_text: [{ plain_text: 'nope' }] },
    });
    assert.equal(result.disposition, 'upsert');
    assert.equal(result.row?.database, 'clients');
    if (result.row?.database === 'clients') {
      assert.equal(result.row.slug, 'acme');
    }
    assert.ok(result.droppedProperties.includes('Ops Leak'));
  });

  it('skips unpublished / Internal projects', () => {
    const unpublished = mapNotionProject('p1', {
      Name: { type: 'title', title: [{ plain_text: 'Secret' }] },
      Client: { type: 'relation', relation: [{ id: 'c1' }] },
      Type: { type: 'multi_select', multi_select: [{ name: 'Website' }] },
      Archive: { type: 'checkbox', checkbox: false },
      'Publish to Warehaus': { type: 'checkbox', checkbox: false },
      Status: { type: 'status', status: { name: 'In progress' } },
    });
    assert.equal(unpublished.disposition, 'skip');

    const internal = mapNotionProject('p2', {
      Name: { type: 'title', title: [{ plain_text: 'Internal' }] },
      Client: { type: 'relation', relation: [{ id: 'c1' }] },
      Type: { type: 'multi_select', multi_select: [{ name: 'Internal' }] },
      Archive: { type: 'checkbox', checkbox: false },
      'Publish to Warehaus': { type: 'checkbox', checkbox: true },
      Status: { type: 'status', status: { name: 'In progress' } },
    });
    assert.equal(internal.disposition, 'skip');
  });
});
