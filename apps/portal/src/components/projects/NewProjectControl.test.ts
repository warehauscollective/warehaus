import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';

Object.assign(globalThis, { React });
const {
  CLIENT_CREATED_COPY,
  NewProjectForm,
  PROJECT_PUBLISH_COPY,
  pinnedClientAction,
  projectClientOptions,
  projectDraftAfterClient,
  shouldConfirmProjectDiscard,
  visibleProjectClients,
} = await import('./NewProjectControl');

const handlers = {
  onName: () => {},
  onOrgId: () => {},
  onPickerOpen: () => {},
  onPickerClose: () => {},
  onPickerQuery: () => {},
  onNewClient: () => {},
  onSubmit: () => {},
  onRequestClose: () => {},
  onKeepEditing: () => {},
  onDiscard: () => {},
};

function markup(extra: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    createElement(NewProjectForm, {
      name: '',
      orgId: '',
      clients: [
        { id: 'c-north', name: 'Northwind', projectCount: 2 },
        { id: 'c-warehaus', name: 'Warehaus', projectCount: 1, internal: true },
      ],
      locked: false,
      note: null,
      pending: false,
      sheetOpen: false,
      ...handlers,
      ...extra,
    }),
  );
}

describe('inline new client', () => {
  it('keeps the project draft and selects the created client', () => {
    const draft = projectDraftAfterClient(
      { name: 'Harbor site', orgId: '', externalId: 'wh_prj_harbor' },
      'c-new',
    );
    assert.deepEqual(draft, {
      name: 'Harbor site',
      orgId: 'c-new',
      externalId: 'wh_prj_harbor',
    });
    const clients = projectClientOptions(
      [{ id: 'c-north', name: 'Northwind', projectCount: 2 }],
      [{ id: 'c-new', name: 'North Wind', projectCount: 0 }],
    );
    assert.equal(clients[0]?.id, 'c-new');
    const html = markup({ name: draft.name, orgId: draft.orgId, clients, fresh: true });
    assert.match(html, /data-testid="new-project-name"/);
    assert.match(html, /value="Harbor site"/);
    assert.match(html, /data-testid="new-project-client"[^>]*data-locked="false"/);
    assert.match(html, /North Wind/);
    assert.match(html, />New</);
    assert.match(html, new RegExp(CLIENT_CREATED_COPY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(html, /Publish is on and Archive is off/);
    assert.equal(html.includes('Publish to client portal'), false);
  });

  it('pins New client, and turns that row into Create client when nothing matches', () => {
    const open = markup({ pickerOpen: true, clients: [] });
    assert.match(open, /data-testid="new-client-row"/);
    assert.match(open, />New client</);
    assert.match(open, /draft · no invite/);
    assert.match(open, /No clients yet/);

    const typed = markup({ pickerOpen: true, pickerQuery: 'Fieldnote' });
    assert.match(typed, /Create client “Fieldnote”/);
    assert.match(typed, /No clients match “Fieldnote”/);
    assert.match(typed, /data-create="true"/);
    assert.equal(pinnedClientAction('Fieldnote', 0).create, true);
    assert.equal(visibleProjectClients(
      [{ id: 'c-north', name: 'Northwind' }],
      'north',
    )[0]?.id, 'c-north');
  });

  it('shows an error the person can retry without clearing the name', () => {
    const html = markup({
      name: 'Harbor site',
      orgId: 'c-north',
      note: { tone: 'error', text: 'Could not create the project' },
    });
    assert.match(html, /data-testid="new-project-error"/);
    assert.match(html, /Could not create the project/);
    assert.match(html, /Try again/);
    assert.match(html, /value="Harbor site"/);
  });

  it('shows the pending label while the create is in flight', () => {
    const html = markup({ name: 'Harbor site', orgId: 'c-north', pending: true });
    assert.match(html, /Creating…/);
    assert.match(html, /disabled=""[^>]*data-testid="create-project"|data-testid="create-project"[^>]*disabled/);
    assert.match(html, /value="Harbor site"/);
  });
});

describe('prefilled client', () => {
  it('prefills the client and leaves the field editable', () => {
    const html = markup({
      name: 'Harbor site',
      orgId: 'c-north',
      locked: false,
      pickerOpen: true,
    });
    assert.match(html, /data-locked="false"/);
    assert.match(html, /Northwind/);
    assert.match(html, />New client</);
    assert.match(html, /admin-only/);
    assert.match(html, /2 projects/);
    assert.equal(/data-testid="new-project-client"[^>]*disabled/.test(html), false);
    assert.match(html, /value="Harbor site"/);
    assert.match(html, new RegExp(PROJECT_PUBLISH_COPY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });

  it('locks the field only when the preset says so', () => {
    const html = markup({
      name: 'Harbor site',
      orgId: 'c-north',
      locked: true,
      lockedName: 'Northwind',
    });
    assert.match(html, /data-testid="new-project-client"[^>]*data-locked="true"/);
    assert.match(html, /aria-disabled="true"/);
    assert.match(html, /Client · preset/);
    assert.match(html, />Preset</);
    assert.match(html, /Set from Northwind\. Start from Projects to pick another client\./);
    assert.equal(html.includes('data-testid="new-client-row"'), false);
    assert.equal(html.includes('Publish to client portal'), false);
    assert.match(html, /Publish is on and Archive is off/);
    assert.match(html, /value="Harbor site"/);
    assert.equal(shouldConfirmProjectDiscard({
      name: '',
      orgId: 'c-north',
      initialOrgId: 'c-north',
      locked: true,
    }), false);
    assert.equal(shouldConfirmProjectDiscard({
      name: 'Harbor site',
      orgId: 'c-north',
      initialOrgId: 'c-north',
      locked: true,
    }), true);
  });
});
