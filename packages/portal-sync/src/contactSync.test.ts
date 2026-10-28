import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decideContactSync } from './contactSync';

const enabled = (id: string | undefined) => id === 'client-a';

function decision(overrides: Partial<Parameters<typeof decideContactSync>[0]> = {}) {
  return decideContactSync({
    portalAccess: 'Disabled',
    source: 'portal',
    clientNotionId: 'client-a',
    clientEnabled: enabled,
    liveToken: { clientNotionPageId: 'client-a' },
    verifiedAcceptance: false,
    ...overrides,
  });
}

describe('decideContactSync read gate', () => {
  it('skips a disabled contact with an empty Invite Status', () => {
    const result = decision({ source: undefined, liveToken: null });
    assert.equal(result.placement, 'SKIP_AND_DROP_PENDING');
    assert.deepEqual(result.actions, []);
  });

  it('reverts Pending with no live token and does not show the row', () => {
    const result = decision({ inviteStatus: 'Pending', liveToken: null, source: 'notion' });
    assert.equal(result.placement, 'SKIP_AND_DROP_PENDING');
    assert.ok(result.actions.some((action) => action.type === 'revert' && action.caseId === 4));
  });

  it('hides a portal pending invite whose client is disabled', () => {
    const result = decision({
      inviteStatus: 'Pending',
      clientEnabled: () => false,
    });
    assert.equal(result.placement, 'SKIP_AND_DROP_PENDING');
  });

  it('places a valid pending invite only as a non-login record', () => {
    const result = decision({ inviteStatus: 'Pending' });
    assert.equal(result.placement, 'UPSERT_PENDING_INVITE');
    assert.equal(result.effective.portalAccess, 'Disabled');
  });

  it('keeps an enabled Pending invite as a non-login record when the token is live', () => {
    const result = decision({ portalAccess: 'Enabled', inviteStatus: 'Pending' });
    assert.equal(result.placement, 'UPSERT_PENDING_INVITE');
    assert.equal(result.effective.portalAccess, 'Disabled');
  });

  it('reverts Portal Access enabled on Pending, Declined, Expired, or Revoked', () => {
    for (const inviteStatus of ['Pending', 'Declined', 'Expired', 'Revoked'] as const) {
      const result = decision({ portalAccess: 'Enabled', inviteStatus, liveToken: null });
      assert.equal(result.placement, 'SKIP_AND_DROP_PENDING');
      assert.ok(result.actions.some((action) => action.type === 'revert' && action.caseId === 6));
    }
  });

  it('notices case 5 and grants nothing while the token stays live', () => {
    const result = decision({
      portalAccess: 'Enabled',
      inviteStatus: 'Accepted',
      prevInviteStatus: 'Pending',
      verifiedAcceptance: false,
    });
    assert.equal(result.placement, 'SKIP_AND_DROP_PENDING');
    assert.ok(result.actions.some((action) => action.type === 'notice' && action.caseId === 5));
    assert.equal(result.actions.some((action) => action.type === 'killToken'), false);
  });

  it('reverts a Client Company move on a live token', () => {
    const result = decision({
      inviteStatus: 'Pending',
      clientNotionId: 'client-b',
      clientEnabled: (id) => id === 'client-a',
    });
    assert.equal(result.placement, 'UPSERT_PENDING_INVITE');
    assert.equal(result.effective.clientNotionId, 'client-a');
    assert.ok(result.actions.some((action) => action.type === 'revert' && action.caseId === 8));
  });

  it('kills the token when staff end or clear a pending invite', () => {
    const ended = decision({ inviteStatus: 'Revoked', prevInviteStatus: 'Pending', liveToken: null });
    assert.ok(ended.actions.some((action) => action.type === 'killToken' && action.caseId === 3));
    const cleared = decision({ inviteStatus: undefined, prevInviteStatus: 'Pending', liveToken: null });
    assert.ok(cleared.actions.some((action) => action.type === 'killToken' && action.caseId === 7));
  });

  it('keeps the enabled empty-status path', () => {
    const result = decision({
      portalAccess: 'Enabled',
      inviteStatus: undefined,
      liveToken: null,
      source: undefined,
    });
    assert.equal(result.placement, 'UPSERT_CONTACT');
  });

  it('upserts a verified acceptance', () => {
    const result = decision({
      portalAccess: 'Enabled',
      inviteStatus: 'Accepted',
      prevInviteStatus: 'Pending',
      verifiedAcceptance: true,
    });
    assert.equal(result.placement, 'UPSERT_CONTACT');
    assert.equal(result.actions.some((action) => action.type === 'notice' && action.caseId === 5), false);
  });

  it('does not revert a self-write', () => {
    const result = decision({ inviteStatus: 'Pending', selfWrite: true });
    assert.equal(result.placement, 'UPSERT_PENDING_INVITE');
    assert.deepEqual(result.actions, []);
  });
});
