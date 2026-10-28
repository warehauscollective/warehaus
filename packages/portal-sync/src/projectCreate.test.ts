import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PORTAL_COLLECTIONS } from './collections';
import { projectRowPassesGate } from './gates';
import { mapNotionProject } from './mappers';
import { WRITEBACK_OFF_ERROR } from './writeback';
import {
  buildProjectCreateProperties,
  createProjectExternalId,
  decideProjectCreateDedupe,
  isNotionProjectCreateEnabled,
  planProjectCreateDispatch,
  PROJECT_CREATE_OFF_ERROR,
  projectCreateConvexFields,
  projectCreatePageRequest,
  projectCreateSearchFilter,
  projectCreateStaffAllowed,
  toNotionProjectCreateProperties,
} from './projectCreate';

const CLIENT_ID = '5165ca6e-352e-45af-8918-98779fd76e61';

function built() {
  const result = buildProjectCreateProperties({
    name: '  Spring menu  ',
    clientNotionPageId: CLIENT_ID,
    externalId: createProjectExternalId('menu1234'),
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('expected properties');
  return result.properties;
}

describe('project create payload', () => {
  it('sets the properties the Projects pull needs, and no child relations', () => {
    const properties = built();
    const notion = toNotionProjectCreateProperties(properties);
    const request = projectCreatePageRequest(PORTAL_COLLECTIONS.projects, properties);

    assert.deepEqual(Object.keys(notion).sort(), [
      'Archive',
      'Client',
      'External ID',
      'Name',
      'Publish to Warehaus',
      'Source',
    ]);
    assert.equal(request.parent.type, 'data_source_id');
    assert.equal(request.parent.data_source_id, PORTAL_COLLECTIONS.projects);
    assert.deepEqual(request.properties, notion);

    assert.deepEqual(notion.Name, {
      title: [{ type: 'text', text: { content: 'Spring menu' } }],
    });
    assert.deepEqual(notion.Client, { relation: [{ id: CLIENT_ID }] });
    assert.deepEqual(notion['Publish to Warehaus'], { checkbox: true });
    assert.deepEqual(notion.Archive, { checkbox: false });
    assert.deepEqual(notion.Source, { select: { name: 'portal' } });
    assert.deepEqual(notion['External ID'], {
      rich_text: [{ type: 'text', text: { content: properties['External ID'] } }],
    });
    assert.equal(properties['External ID'].startsWith('wh_prj_'), true);

    for (const omitted of [
      'Status',
      'Type',
      'Description',
      'Tasks',
      'Client Docs',
      'Ops (Internal)',
      'Activity',
    ]) {
      assert.equal(omitted in notion, false, omitted);
    }

    assert.deepEqual(projectCreateSearchFilter(properties['External ID']), {
      property: 'External ID',
      rich_text: { equals: properties['External ID'] },
    });
  });

  it('round-trips through the project mapper with Publish on and Archive off', () => {
    const properties = built();
    const mapped = mapNotionProject('new-project-page', {
      Name: { type: 'title', title: [{ plain_text: properties.Name }] },
      Client: { type: 'relation', relation: [{ id: properties.Client[0] }] },
      Archive: { type: 'checkbox', checkbox: properties.Archive },
      'Publish to Warehaus': {
        type: 'checkbox',
        checkbox: properties['Publish to Warehaus'],
      },
      Source: { type: 'select', select: { name: properties.Source } },
      'External ID': {
        type: 'rich_text',
        rich_text: [{ plain_text: properties['External ID'] }],
      },
    });

    assert.equal(mapped.disposition, 'upsert');
    assert.equal(mapped.row?.database, 'projects');
    if (mapped.row?.database !== 'projects') return;

    assert.equal(mapped.row.name, 'Spring menu');
    assert.deepEqual(mapped.row.clientNotionIds, [CLIENT_ID]);
    assert.equal(mapped.row.publishToWarehaus, true);
    assert.equal(mapped.row.archive, false);
    assert.deepEqual(mapped.row.type, []);
    assert.equal(mapped.row.status, 'Inbox');
    assert.equal(mapped.row.source, 'portal');
    assert.equal(mapped.row.externalId, properties['External ID']);

    const gate = projectRowPassesGate({
      publishToWarehaus: mapped.row.publishToWarehaus,
      clientRelationIds: mapped.row.clientNotionIds,
      archive: mapped.row.archive,
      types: mapped.row.type,
    });
    assert.equal(gate.ok, true);

    const convex = projectCreateConvexFields(properties);
    assert.equal(convex.status, mapped.row.status);
    assert.equal(convex.publishToWarehaus, true);
    assert.equal(convex.archive, false);
    assert.deepEqual(convex.type, []);
    assert.equal(convex.source, 'portal');
    assert.equal('taskId' in convex, false);
  });

  it('rejects a missing name, a non-Notion client, and a bad external id', () => {
    const missing = buildProjectCreateProperties({
      name: '   ',
      clientNotionPageId: 'portal:client:1',
      externalId: 'prj_nope',
    });
    assert.equal(missing.ok, false);
    if (missing.ok) return;
    assert.ok(missing.errors.some((error) => error.includes('Name')));
    assert.ok(missing.errors.some((error) => error.includes('Client')));
    assert.ok(missing.errors.some((error) => error.includes('External ID')));
  });

  it('sends a project only when write-back and project create are both exactly on', () => {
    assert.deepEqual(
      planProjectCreateDispatch({ writebackEnabled: false, projectCreateEnabled: true }),
      { ok: false, error: WRITEBACK_OFF_ERROR },
    );
    assert.deepEqual(
      planProjectCreateDispatch({ writebackEnabled: true, projectCreateEnabled: false }),
      { ok: false, error: PROJECT_CREATE_OFF_ERROR },
    );
    assert.deepEqual(
      planProjectCreateDispatch({ writebackEnabled: false, projectCreateEnabled: false }),
      { ok: false, error: WRITEBACK_OFF_ERROR },
    );
    assert.deepEqual(
      planProjectCreateDispatch({ writebackEnabled: true, projectCreateEnabled: true }),
      { ok: true },
    );
  });

  it('keeps the project-create gate separate from any other flag', () => {
    assert.equal(isNotionProjectCreateEnabled('true'), true);
    assert.equal(isNotionProjectCreateEnabled(undefined), false);
    assert.equal(isNotionProjectCreateEnabled(''), false);
    assert.equal(isNotionProjectCreateEnabled('false'), false);
    assert.equal(isNotionProjectCreateEnabled('1'), false);
    assert.equal(isNotionProjectCreateEnabled('TRUE'), false);
  });

  it('allows Warehaus Staff only', () => {
    assert.equal(projectCreateStaffAllowed('Warehaus Staff'), true);
    assert.equal(projectCreateStaffAllowed('Client Admin'), false);
    assert.equal(projectCreateStaffAllowed('Client Member'), false);
    assert.equal(projectCreateStaffAllowed(undefined), false);
  });

  it('reuses the same client page and rejects another client', () => {
    assert.deepEqual(
      decideProjectCreateDedupe({ hits: [], clientNotionPageId: CLIENT_ID }),
      { action: 'create' },
    );
    assert.deepEqual(
      decideProjectCreateDedupe({
        hits: [{ notionPageId: 'page-1', clientNotionIds: [CLIENT_ID.replace(/-/g, '')] }],
        clientNotionPageId: CLIENT_ID,
      }),
      { action: 'reuse', notionPageId: 'page-1' },
    );
    const other = decideProjectCreateDedupe({
      hits: [{ notionPageId: 'page-2', clientNotionIds: ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'] }],
      clientNotionPageId: CLIENT_ID,
    });
    assert.equal(other.action, 'reject');
  });
});
