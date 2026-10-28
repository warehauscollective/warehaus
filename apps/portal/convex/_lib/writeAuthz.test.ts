import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { authorizePortalWrite, isNotionWritebackEnabled } from './writeAuthz';

describe('portal write authorization', () => {
  it('allows staff and rejects everyone else', () => {
    assert.deepEqual(
      authorizePortalWrite({
        role: 'Warehaus Staff',
        identityOrgId: 'org-staff',
        database: 'tasks',
        requestedOrgId: 'org-other',
      }),
      { ok: true, orgId: 'org-staff' },
    );
    assert.equal(
      authorizePortalWrite({
        role: 'Client Admin',
        identityOrgId: 'org-client',
        database: 'contacts',
      }).ok,
      false,
    );
    assert.equal(
      authorizePortalWrite({
        role: 'Client Member',
        identityOrgId: 'org-client',
        database: 'tasks',
      }).ok,
      false,
    );
  });

  it('rejects activity for staff', () => {
    const decision = authorizePortalWrite({
      role: 'Warehaus Staff',
      identityOrgId: 'org-staff',
      database: 'activity',
    });
    assert.equal(decision.ok, false);
  });

  it('treats only the exact string true as on', () => {
    assert.equal(isNotionWritebackEnabled('true'), true);
    assert.equal(isNotionWritebackEnabled(undefined), false);
    assert.equal(isNotionWritebackEnabled(''), false);
    assert.equal(isNotionWritebackEnabled('TRUE'), false);
    assert.equal(isNotionWritebackEnabled('1'), false);
  });
});
