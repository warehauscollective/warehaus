import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PortalIdentity } from './identity';
import { assertPortalWrite, authorizePortalWrite, isNotionWritebackEnabled, requireClientAdmin, requireStaff } from './writeAuthz';

function identity(role: PortalIdentity['role'], orgId = 'org-a'): PortalIdentity {
  return {
    authUserId: 'user-1',
    contactId: 'contact-1',
    orgId,
    orgSlug: 'sugar-shark',
    role,
    portalAccess: 'Enabled',
    name: 'Ada',
    email: 'ada@example.com',
  };
}

describe('portal write authorization', () => {
  it('lets staff create any of the six databases in their identity org', () => {
    for (const database of ['clients', 'projects', 'tasks', 'contacts', 'sharedResources', 'clientDocs'] as const) {
      const decision = authorizePortalWrite({
        role: 'Warehaus Staff',
        identityOrgId: 'org-a',
        database,
        requestedOrgId: 'org-b',
      });
      assert.deepEqual(decision, { ok: true, orgId: 'org-a' });
    }
  });

  it('lets a Client Admin create contacts only, using the identity org', () => {
    assert.deepEqual(
      authorizePortalWrite({
        role: 'Client Admin',
        identityOrgId: 'org-a',
        database: 'contacts',
        requestedOrgId: 'org-b',
      }),
      { ok: true, orgId: 'org-a' },
    );
    const project = authorizePortalWrite({
      role: 'Client Admin',
      identityOrgId: 'org-a',
      database: 'projects',
    });
    assert.equal(project.ok, false);
  });

  it('refuses Client Members and Activity creates', () => {
    assert.equal(
      authorizePortalWrite({ role: 'Client Member', identityOrgId: 'org-a', database: 'contacts' }).ok,
      false,
    );
    assert.equal(
      authorizePortalWrite({ role: 'Warehaus Staff', identityOrgId: 'org-a', database: 'activity' }).ok,
      false,
    );
    assert.throws(() => requireStaff(identity('Client Admin')), /Staff role required/);
    assert.throws(() => requireClientAdmin(identity('Client Member')), /Client Admin role required/);
    assert.throws(
      () => assertPortalWrite({ identity: identity('Client Member'), database: 'contacts', requestedOrgId: 'org-b' }),
      /cannot write/,
    );
  });

  it('enables Notion write-back only for the exact string true', () => {
    assert.equal(isNotionWritebackEnabled(''), false);
    assert.equal(isNotionWritebackEnabled('1'), false);
    assert.equal(isNotionWritebackEnabled('true'), true);
  });
});
