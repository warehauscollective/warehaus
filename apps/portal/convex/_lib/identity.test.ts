import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConvexError } from 'convex/values';
import {
  PortalAuthError,
  assertHostMatchesOrg,
  filterRowsForIdentity,
  resolveIdentityFromContact,
  type PortalIdentity,
} from './identity';
import { userFacingErrorMessage } from './userFacingError';

const sugarShark: PortalIdentity = {
  authUserId: 'user_sugar',
  contactId: 'con_sugar',
  orgId: 'org_sugar',
  orgSlug: 'sugar-shark',
  role: 'Client Admin',
  portalAccess: 'Enabled',
  name: 'Sugar Contact',
  email: 'hello@sugarshark.test',
};

const staff: PortalIdentity = {
  ...sugarShark,
  authUserId: 'user_staff',
  contactId: 'con_staff',
  orgId: 'org_warehaus',
  orgSlug: 'warehaus',
  role: 'Warehaus Staff',
  email: 'team@warehaus.co',
};

describe('PortalAuthError', () => {
  it('is a ConvexError whose data is the user-facing sentence', () => {
    const error = new PortalAuthError(
      "This email can't register here. Contact your Warehaus team.",
      'FORBIDDEN',
    );
    assert.ok(error instanceof ConvexError);
    assert.equal(error.data, "This email can't register here. Contact your Warehaus team.");
    const wrapped = new ConvexError<string>(
      '[CONVEX M(contacts:linkSession)] Server Error\n  Called by client',
    );
    wrapped.data = error.data;
    assert.equal(
      userFacingErrorMessage(wrapped, 'Could not link portal contact'),
      "This email can't register here. Contact your Warehaus team.",
    );
  });
});

describe('resolveIdentityFromContact', () => {
  it('joins auth user to contact + client', () => {
    const identity = resolveIdentityFromContact({
      authUserId: 'user_1',
      contact: {
        _id: 'con_1',
        orgId: 'org_1',
        name: 'Ada',
        email: 'ada@client.test',
        authUserId: 'user_1',
        role: 'Client Member',
        portalAccess: 'Enabled',
      },
      client: {
        _id: 'org_1',
        slug: 'acme',
        portalAccess: 'Enabled',
      },
    });
    assert.equal(identity.orgSlug, 'acme');
    assert.equal(identity.orgId, 'org_1');
  });

  it('rejects missing contact', () => {
    assert.throws(
      () =>
        resolveIdentityFromContact({
          authUserId: 'user_1',
          contact: null,
          client: null,
        }),
      (err: unknown) => err instanceof PortalAuthError && err.code === 'NO_CONTACT',
    );
  });

  it('rejects disabled portal access', () => {
    assert.throws(
      () =>
        resolveIdentityFromContact({
          authUserId: 'user_1',
          contact: {
            _id: 'con_1',
            orgId: 'org_1',
            name: 'Ada',
            email: 'ada@client.test',
            role: 'Client Admin',
            portalAccess: 'Disabled',
          },
          client: { _id: 'org_1', slug: 'acme', portalAccess: 'Enabled' },
        }),
      (err: unknown) => err instanceof PortalAuthError && err.code === 'PORTAL_DISABLED',
    );
  });
});

describe('assertHostMatchesOrg (D1)', () => {
  it('fails closed when host slug ≠ session org', () => {
    assert.throws(
      () => assertHostMatchesOrg(sugarShark, 'other-client'),
      (err: unknown) => err instanceof PortalAuthError && err.code === 'HOST_MISMATCH',
    );
  });

  it('allows matching host', () => {
    assert.doesNotThrow(() => assertHostMatchesOrg(sugarShark, 'sugar-shark'));
  });

  it('allows staff on any host', () => {
    assert.doesNotThrow(() => assertHostMatchesOrg(staff, 'sugar-shark'));
  });
});

describe('foreign-org zero rows', () => {
  const rows = [
    { orgId: 'org_sugar', name: 'Shark Project' },
    { orgId: 'org_syzygy', name: 'Syzygy Project' },
    { orgId: 'org_sugar', name: 'Shark Two' },
  ];

  it('client identity only sees own org rows', () => {
    const filtered = filterRowsForIdentity(sugarShark, rows);
    assert.equal(filtered.length, 2);
    assert.ok(filtered.every((r) => r.orgId === 'org_sugar'));
    assert.ok(!filtered.some((r) => r.orgId === 'org_syzygy'));
  });

  it('staff identity is not org-filtered by this helper', () => {
    assert.equal(filterRowsForIdentity(staff, rows).length, 3);
  });
});
