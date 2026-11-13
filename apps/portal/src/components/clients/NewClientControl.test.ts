import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';

Object.assign(globalThis, { React });
const { NewClientForm } = await import('./NewClientControl');

function markup(extra: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    createElement(NewClientForm, {
      narrow: false,
      companyName: '',
      primaryEmail: '',
      phone: '',
      note: null as { tone: 'error' | 'info'; text: string; field?: 'companyName' | 'email' | 'phone' | 'slug' } | null,
      pending: false,
      reused: false,
      onCompanyName: () => {},
      onPrimaryEmail: () => {},
      onPhone: () => {},
      onSubmit: () => {},
      onClose: () => {},
      onUseExisting: () => {},
      ...extra,
    }),
  );
}

describe('new client dialog', () => {
  it('says the client starts as a prospect with portal access off and no invite', () => {
    const html = markup();
    assert.match(html, /data-testid="new-client-dialog"/);
    assert.match(html, /Starts as a prospect\. Portal access stays off\. No invite is sent\./);
    assert.match(html, /data-testid="create-client"/);
    assert.match(html, /Create client/);
    assert.equal(html.includes('data-testid="use-existing-client"'), false);
    assert.equal(html.includes('aria-disabled'), false);
  });

  it('shows Use existing as info when the name or slug is already a client', () => {
    const html = markup({
      reused: true,
      note: { tone: 'info', text: 'A client with this name or slug already exists.' },
    });
    assert.match(html, /data-testid="use-existing-client"/);
    assert.match(html, /data-testid="new-client-info"/);
    assert.match(html, /color:var\(--fg\)/);
    assert.match(html, /Use existing/);
    assert.match(html, /A client with this name or slug already exists\./);
    assert.equal(html.includes('>Create client<'), false);
    assert.equal(html.includes('color:var(--danger)'), false);
  });

  it('marks the returned field invalid and shows the error on that input', () => {
    const html = markup({
      note: { tone: 'error', text: 'Primary Email is not a valid address', field: 'email' },
    });
    assert.match(html, /data-testid="new-client-email"[^>]*aria-invalid="true"/);
    assert.match(html, /id="new-client-email-error"/);
    assert.match(html, /Primary Email is not a valid address/);
    assert.equal(html.includes('data-testid="new-client-name" aria-invalid'), false);
    assert.equal(html.includes('aria-invalid="true" data-testid="new-client-name"') || html.includes('data-testid="new-client-name" aria-invalid'), false);
  });

  it('is a bottom sheet at 390px', () => {
    const html = markup({ narrow: true });
    assert.match(html, /data-testid="new-client-sheet"/);
    assert.match(html, /align-items:flex-end/);
    assert.match(html, /border-radius:16px 16px 0 0/);
    assert.equal(html.includes('data-testid="new-client-dialog"'), false);
  });
});
