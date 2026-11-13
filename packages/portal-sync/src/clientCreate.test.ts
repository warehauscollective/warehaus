import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PORTAL_COLLECTIONS } from './collections';
import {
  buildClientCreateProperties,
  clientCreateConvexFields,
  clientCreateEnqueueError,
  clientCreateExternalId,
  clientCreateInsertAllowed,
  clientCreatePageRequest,
  clientCreateSearchFilter,
  clientCreateStaffAllowed,
  clientFieldsFromNotionPage,
  companyNameKey,
  decideClientCreateDedupe,
  planClientCreateDispatch,
  reservedClientSlug,
  toNotionClientCreateProperties,
} from './clientCreate';
import { clientRowPassesGate } from './gates';
import { mapNotionClient } from './mappers';
import { outboxKindSendsInvite } from './outbox';
import { decideSyncedRowVisibility } from './ungate';
import { WRITEBACK_OFF_ERROR } from './writeback';

function built(extra: { primaryEmail?: string; phone?: string; slug?: string } = {}) {
  const result = buildClientCreateProperties({ companyName: '  North Wind  ', ...extra });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('expected properties');
  return result.properties;
}

describe('client create payload', () => {
  it('posts a full Clients page with prospect defaults and no relations', () => {
    const properties = built({ primaryEmail: 'ada@example.com', phone: '415 555 0100' });
    const notion = toNotionClientCreateProperties(properties);
    const request = clientCreatePageRequest(PORTAL_COLLECTIONS.clients, properties);

    assert.deepEqual(Object.keys(notion).sort(), [
      'Company Name',
      'External ID',
      'Phone',
      'Portal access',
      'Primary Email',
      'Publish to Warehaus',
      'Slug',
      'Source',
      'Status',
    ]);
    assert.equal(request.parent.data_source_id, PORTAL_COLLECTIONS.clients);
    assert.deepEqual(notion['Company Name'], {
      title: [{ type: 'text', text: { content: 'North Wind' } }],
    });
    assert.deepEqual(notion.Status, { select: { name: 'Prospect' } });
    assert.deepEqual(notion['Portal access'], { select: { name: 'Disabled' } });
    assert.deepEqual(notion['Publish to Warehaus'], { checkbox: false });
    assert.deepEqual(notion.Source, { select: { name: 'portal' } });
    assert.deepEqual(notion['Primary Email'], { email: 'ada@example.com' });
    assert.deepEqual(notion.Phone, { phone_number: '415 555 0100' });
    assert.equal(properties['External ID'], 'wh_cli_north-wind');
    assert.equal('Contacts' in notion, false);
    assert.equal('Projects' in notion, false);
    assert.equal('Invite Status' in notion, false);
    assert.equal(clientCreateEnqueueError(properties), null);
    assert.deepEqual(clientCreateSearchFilter(properties['External ID'], properties.Slug), {
      or: [
        { property: 'External ID', rich_text: { equals: 'wh_cli_north-wind' } },
        { property: 'Slug', rich_text: { equals: 'north-wind' } },
      ],
    });
  });

  it('keeps a Disabled prospect in the pull instead of skipping it', () => {
    const properties = built();
    const mapped = mapNotionClient('page-new', {
      'Company Name': { type: 'title', title: [{ plain_text: properties['Company Name'] }] },
      Slug: { type: 'rich_text', rich_text: [{ plain_text: properties.Slug }] },
      Status: { type: 'select', select: { name: properties.Status } },
      'Portal access': { type: 'select', select: { name: properties['Portal access'] } },
      Source: { type: 'select', select: { name: properties.Source } },
      'External ID': { type: 'rich_text', rich_text: [{ plain_text: properties['External ID'] }] },
    });
    assert.equal(mapped.disposition, 'upsert');
    assert.equal(mapped.row?.database, 'clients');
    if (mapped.row?.database !== 'clients') return;
    assert.equal(mapped.row.status, 'Prospect');
    assert.equal(mapped.row.portalAccess, 'Disabled');
    assert.equal(mapped.row.slug, 'north-wind');
    assert.equal(clientRowPassesGate({ portalAccess: 'Disabled' }).ok, true);
    assert.equal(clientRowPassesGate({ portalAccess: 'Enabled' }).ok, true);
    const shown = decideSyncedRowVisibility({ table: 'clients', disposition: mapped.disposition });
    assert.equal(shown.action, 'show');
    const convex = clientCreateConvexFields(properties);
    assert.equal(convex.status, 'Prospect');
    assert.equal(convex.portalAccess, 'Disabled');
    assert.equal(convex.source, 'portal');
    assert.equal(convex.nameKey, 'north wind');
    assert.equal('publishToWarehaus' in convex, false);
  });

  it('rejects a blank name, a bad email, a reserved slug, and a non-staff role', () => {
    const missing = buildClientCreateProperties({ companyName: '   ' });
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.field, 'companyName');

    const email = buildClientCreateProperties({ companyName: 'Acme', primaryEmail: 'not-an-email' });
    assert.equal(email.ok, false);
    if (!email.ok) assert.equal(email.field, 'email');

    const reserved = buildClientCreateProperties({ companyName: 'Warehaus Internal' });
    assert.equal(reserved.ok, false);
    if (!reserved.ok) {
      assert.equal(reserved.field, 'slug');
      assert.match(reserved.error, /reserved/);
    }
    assert.equal(reservedClientSlug('warehaus'), true);
    assert.equal(reservedClientSlug('warehaus-internal'), true);
    assert.equal(clientCreateExternalId('warehaus-internal'), 'wh_cli_warehaus-internal');

    assert.equal(clientCreateStaffAllowed('Warehaus Staff'), true);
    assert.equal(clientCreateStaffAllowed('Client Admin'), false);
    assert.equal(clientCreateStaffAllowed('Client Member'), false);
  });

  it('sends nothing when write-back is off', () => {
    assert.deepEqual(planClientCreateDispatch({ writebackEnabled: false }), {
      ok: false,
      error: WRITEBACK_OFF_ERROR,
    });
    assert.deepEqual(planClientCreateDispatch({ writebackEnabled: true }), { ok: true });
  });

  it('reuses an External ID or Slug and does not treat that as a create', () => {
    assert.deepEqual(
      decideClientCreateDedupe({ externalId: 'wh_cli_acme', slug: 'acme', hits: [] }),
      { action: 'create' },
    );
    assert.deepEqual(
      decideClientCreateDedupe({
        externalId: 'wh_cli_acme',
        slug: 'acme',
        hits: [{ notionPageId: 'page-1', externalId: 'wh_cli_acme', slug: 'acme' }],
      }),
      { action: 'reuse', notionPageId: 'page-1', kind: 'external-id' },
    );
    assert.deepEqual(
      decideClientCreateDedupe({
        externalId: 'wh_cli_acme',
        slug: 'acme',
        hits: [{ notionPageId: 'page-2', externalId: 'wh_cli_other', slug: 'acme' }],
      }),
      { action: 'reuse', notionPageId: 'page-2', kind: 'slug' },
    );
  });

  it('reads an existing page without forcing prospect onto it', () => {
    const fields = clientFieldsFromNotionPage('page-old', {
      'Company Name': { type: 'title', title: [{ plain_text: 'Acme' }] },
      Slug: { type: 'rich_text', rich_text: [{ plain_text: 'acme' }] },
      Status: { type: 'select', select: { name: 'Active' } },
      'Portal access': { type: 'select', select: { name: 'Enabled' } },
      Source: { type: 'select', select: { name: 'notion-ui' } },
    });
    assert.equal(fields?.status, 'Active');
    assert.equal(fields?.portalAccess, 'Enabled');
    assert.equal(fields?.source, 'notion-ui');
    assert.equal(fields?.nameKey, companyNameKey('Acme'));
  });

  it('inserts only when the page is not already a Convex client', () => {
    assert.equal(clientCreateInsertAllowed(null), true);
    assert.equal(clientCreateInsertAllowed('client-1'), false);
  });

  it('does not send invite mail for this kind', () => {
    assert.equal(outboxKindSendsInvite('client-create'), false);
    assert.equal(outboxKindSendsInvite('create'), false);
    assert.equal(outboxKindSendsInvite('createInvite'), true);
    assert.equal(outboxKindSendsInvite('setInviteState'), true);
  });
});
