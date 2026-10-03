import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertJoinClient,
  ensureContactExternalId,
  normalizeEmail,
  selectContactForJoin,
} from './contactJoin';
import { PortalAuthError } from './identity';

const baseContact = {
  _id: 'con_1',
  orgId: 'org_1',
  email: 'Demo@NorthBay.test',
  name: 'Demo',
  role: 'Client Admin' as const,
  portalAccess: 'Enabled' as const,
  notionPageId: 'seed-1',
  externalId: null,
};

describe('contact join', () => {
  it('normalizes email', () => {
    assert.equal(normalizeEmail('  Ada@X.COM '), 'ada@x.com');
  });

  it('joins unique enabled contact', () => {
    const contact = selectContactForJoin({
      email: 'demo@northbay.test',
      authUserId: 'user_1',
      contacts: [baseContact],
    });
    assert.equal(contact._id, 'con_1');
  });

  it('rejects unknown email', () => {
    assert.throws(
      () =>
        selectContactForJoin({
          email: 'nobody@x.test',
          authUserId: 'user_1',
          contacts: [baseContact],
        }),
      (err: unknown) => err instanceof PortalAuthError && err.code === 'NO_CONTACT',
    );
  });

  it('rejects already-linked different user', () => {
    assert.throws(
      () =>
        selectContactForJoin({
          email: 'demo@northbay.test',
          authUserId: 'user_2',
          contacts: [{ ...baseContact, authUserId: 'user_1' }],
        }),
      (err: unknown) => err instanceof PortalAuthError && err.code === 'FORBIDDEN',
    );
  });

  it('refuses to auto-link an unlinked staff contact', () => {
    assert.throws(
      () =>
        selectContactForJoin({
          email: 'team@warehaus.co',
          authUserId: 'user_new',
          contacts: [
            {
              ...baseContact,
              email: 'team@warehaus.co',
              role: 'Warehaus Staff',
            },
          ],
        }),
      (err: unknown) =>
        err instanceof PortalAuthError &&
        err.code === 'FORBIDDEN' &&
        err.message === "This email can't register here. Contact your Warehaus team.",
    );
  });

  it('allows a staff contact already linked to this user', () => {
    const contact = selectContactForJoin({
      email: 'team@warehaus.co',
      authUserId: 'user_staff',
      contacts: [
        {
          ...baseContact,
          email: 'team@warehaus.co',
          role: 'Warehaus Staff',
          authUserId: 'user_staff',
        },
      ],
    });
    assert.equal(contact.role, 'Warehaus Staff');
  });

  it('rejects disabled client for non-staff', () => {
    assert.throws(
      () =>
        assertJoinClient(
          { _id: 'org_1', slug: 'client-portal', portalAccess: 'Disabled' },
          'Client Admin',
        ),
      (err: unknown) => err instanceof PortalAuthError && err.code === 'PORTAL_DISABLED',
    );
  });

  it('ensures wh_con external id', () => {
    assert.equal(ensureContactExternalId('wh_con_existing', 'x'), 'wh_con_existing');
    assert.match(ensureContactExternalId(null, 'abc123XYZ'), /^wh_con_/);
  });
});
