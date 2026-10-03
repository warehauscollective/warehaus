import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  decideCreateDedupe,
  searchPlanForCreate,
  toNotionProperties,
  validateWriteback,
  type WriteProperties,
} from './writeback';

const client: WriteProperties = {
  'Company Name': 'Sugar Shark',
  Slug: 'sugar-shark',
  Status: 'Active',
  'External ID': 'wh_cli_sugar-shark',
  Source: 'portal',
  'Portal access': 'Disabled',
};

const contact: WriteProperties = {
  Name: 'Ada Lovelace',
  Email: 'ada@example.com',
  Role: 'Client Member',
  Source: 'portal',
  'Portal Access': 'Disabled',
  'Client Company': ['client-page'],
};

const project: WriteProperties = {
  Name: 'Site',
  Status: 'Planned',
  Type: ['Website'],
  Description: 'A client-safe summary',
  Archive: false,
  'External ID': 'wh_prj_site',
  Source: 'portal',
  'Publish to Warehaus': false,
  Client: ['client-page'],
};

const task: WriteProperties = {
  Name: 'Review homepage',
  Status: 'To Do',
  Date: '2026-09-27',
  'External ID': 'wh_tsk_review',
  Source: 'portal',
  'Publish to Warehaus': false,
  Projects: ['project-page'],
};

const resource: WriteProperties = {
  Name: 'Logo',
  Type: 'Image',
  URL: 'https://example.com/logo.png',
  Description: 'Primary logo',
  'External ID': 'wh_res_logo',
  Source: 'portal',
  'Publish to Warehaus': false,
  Client: ['client-page'],
};

const doc: WriteProperties = {
  Title: 'Start',
  'Doc Type': 'Start Here',
  Summary: 'How to use the portal',
  Order: 1,
  'External ID': 'wh_doc_start',
  Source: 'portal',
  Status: 'Draft',
  'Publish to Warehaus': false,
  Client: ['client-page'],
};

describe('write-back validator', () => {
  it('accepts an explicit payload for each creatable database', () => {
    assert.equal(validateWriteback({ database: 'clients', properties: client, actor: 'staff' }).ok, true);
    assert.equal(validateWriteback({ database: 'contacts', properties: contact, actor: 'clientAdmin' }).ok, true);
    assert.equal(validateWriteback({ database: 'projects', properties: project, actor: 'staff' }).ok, true);
    assert.equal(validateWriteback({ database: 'tasks', properties: task, actor: 'staff' }).ok, true);
    assert.equal(validateWriteback({ database: 'sharedResources', properties: resource, actor: 'staff' }).ok, true);
    assert.equal(validateWriteback({ database: 'clientDocs', properties: doc, actor: 'staff' }).ok, true);
  });

  it('rejects a missing field and does not fill it', () => {
    const { Source: _source, ...rest } = contact;
    const result = validateWriteback({ database: 'contacts', properties: rest, actor: 'staff' });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.errors.join(' '), /Source is required/);
  });

  it('rejects an unknown property', () => {
    const result = validateWriteback({
      database: 'contacts',
      properties: { ...contact, 'Invite Secret': 'nope' },
      actor: 'staff',
    });
    assert.equal(result.ok, false);
  });

  it('rejects Publish left off the payload and Publish left on', () => {
    const { 'Publish to Warehaus': _publish, ...rest } = project;
    assert.equal(validateWriteback({ database: 'projects', properties: rest, actor: 'staff' }).ok, false);
    assert.equal(
      validateWriteback({
        database: 'projects',
        properties: { ...project, 'Publish to Warehaus': true },
        actor: 'staff',
      }).ok,
      false,
    );
  });

  it('rejects Activity creates', () => {
    const result = validateWriteback({ database: 'activity', properties: { Name: 'Shipped' }, actor: 'staff' });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.errors[0]!, /no portal create path/);
  });

  it('allows Warehaus Staff role only for a staff actor', () => {
    const staffContact = { ...contact, Role: 'Warehaus Staff' };
    assert.equal(validateWriteback({ database: 'contacts', properties: staffContact, actor: 'staff' }).ok, true);
    assert.equal(
      validateWriteback({ database: 'contacts', properties: staffContact, actor: 'clientAdmin' }).ok,
      false,
    );
  });

  it('rejects an email that still needs case folding, and keeps plus tags', () => {
    assert.equal(
      validateWriteback({
        database: 'contacts',
        properties: { ...contact, Email: 'Ada@Example.com' },
        actor: 'staff',
      }).ok,
      false,
    );
    assert.equal(
      validateWriteback({
        database: 'contacts',
        properties: { ...contact, Email: 'ada+tag@example.com' },
        actor: 'staff',
      }).ok,
      true,
    );
  });

  it('rejects Auth User ID on create and client links', () => {
    assert.equal(
      validateWriteback({
        database: 'contacts',
        properties: { ...contact, 'Auth User ID': 'user_1' },
        actor: 'staff',
      }).ok,
      false,
    );
    assert.equal(
      validateWriteback({
        database: 'clients',
        properties: { ...client, Projects: ['p1'] },
        actor: 'staff',
      }).ok,
      false,
    );
  });
});

describe('search before create', () => {
  it('searches slug, email, or external id', () => {
    assert.deepEqual(searchPlanForCreate('clients', client), {
      database: 'clients',
      property: 'Slug',
      value: 'sugar-shark',
    });
    assert.deepEqual(searchPlanForCreate('contacts', contact), {
      database: 'contacts',
      property: 'Email',
      value: 'ada@example.com',
    });
    const taskPlan = searchPlanForCreate('tasks', task);
    assert.equal('property' in taskPlan && taskPlan.property, 'External ID');
  });

  it('reuses a same-org page and rejects another client', () => {
    assert.equal(decideCreateDedupe([]).action, 'create');
    assert.deepEqual(decideCreateDedupe([{ notionPageId: 'page-1', sameOrg: true }]), {
      action: 'reuse',
      notionPageId: 'page-1',
    });
    const rejected = decideCreateDedupe([{ notionPageId: 'page-2', sameOrg: false }]);
    assert.equal(rejected.action, 'reject');
  });

  it('shapes a contact create for Notion 2025-09-03 without adding defaults', () => {
    const shaped = toNotionProperties('contacts', contact);
    assert.deepEqual(shaped.Email, { email: 'ada@example.com' });
    assert.deepEqual(shaped['Portal Access'], { select: { name: 'Disabled' } });
    assert.equal('Auth User ID' in shaped, false);
    assert.equal('Phone' in shaped, false);
  });
});
