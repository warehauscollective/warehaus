import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { JoinContactCandidate } from './contactJoin';
import { CANT_REGISTER_MESSAGE } from './contactJoin';
import {
  REGISTRATION_UI_FLOOR_MS,
  checkEmailModel,
  decideSelfServeRegistration,
  registrationBlockMessage,
  registrationWaitMs,
  signupScreenForDecision,
  staffManualLinkError,
  staffProvisionContactError,
  type RegistrationBlockReason,
} from './registration';

const client: JoinContactCandidate = {
  _id: 'con_1',
  orgId: 'org_1',
  email: 'ada@client.test',
  name: 'Ada',
  role: 'Client Member',
  portalAccess: 'Enabled',
  notionPageId: 'page',
  externalId: null,
};

describe('self-serve registration', () => {
  it('allows one enabled client contact', () => {
    const decision = decideSelfServeRegistration({
      email: 'Ada@Client.test',
      contacts: [client],
      clientPortalAccess: 'Enabled',
    });
    assert.deepEqual(decision, { allowed: true });
    assert.equal(signupScreenForDecision(decision), 'check-email');
  });

  it('uses one refusal sentence for every blocked reason', () => {
    const reasons: RegistrationBlockReason[] = [
      'invalid_email',
      'no_contact',
      'ambiguous',
      'staff',
      'disabled',
      'already_linked',
      'client_disabled',
    ];
    for (const reason of reasons) {
      assert.equal(registrationBlockMessage(reason), CANT_REGISTER_MESSAGE);
    }
  });

  it('shows check-email for a missing contact and the shared sentence for staff', () => {
    const missing = decideSelfServeRegistration({
      email: 'nobody@x.test',
      contacts: [client],
      clientPortalAccess: null,
    });
    const staff = decideSelfServeRegistration({
      email: 'team@warehaus.co',
      contacts: [{ ...client, email: 'team@warehaus.co', role: 'Warehaus Staff' }],
      clientPortalAccess: 'Enabled',
    });
    const disabled = decideSelfServeRegistration({
      email: client.email,
      contacts: [{ ...client, portalAccess: 'Disabled' }],
      clientPortalAccess: 'Enabled',
    });
    assert.equal(signupScreenForDecision(missing), 'check-email');
    assert.equal(signupScreenForDecision(staff), 'cant-register');
    assert.equal(signupScreenForDecision(disabled), 'cant-register');
    assert.equal(missing.allowed, false);
    if (!staff.allowed && !disabled.allowed) {
      assert.equal(registrationBlockMessage(staff.reason), registrationBlockMessage(disabled.reason));
    }
  });

  it('check-email copy and timing do not depend on a matching contact', () => {
    assert.deepEqual(checkEmailModel(true), checkEmailModel(false));
    assert.deepEqual(checkEmailModel(), checkEmailModel(true));
    assert.equal(
      checkEmailModel().body,
      "If this address can use the portal, we've sent a link to verify it. It expires in 30 minutes.",
    );
    assert.equal(registrationWaitMs(0, REGISTRATION_UI_FLOOR_MS), REGISTRATION_UI_FLOOR_MS);
    assert.equal(registrationWaitMs(REGISTRATION_UI_FLOOR_MS), 0);
    assert.equal(registrationWaitMs(50), registrationWaitMs(50));
  });

  it('staff provision only accepts one enabled staff contact', () => {
    const staff = { ...client, role: 'Warehaus Staff' as const, email: 'peter@warehaus.co' };
    assert.equal(staffProvisionContactError(staff), null);
    assert.match(staffProvisionContactError(null) ?? '', /No contact/);
    assert.match(staffProvisionContactError(client) ?? '', /not Warehaus Staff/);
    assert.match(
      staffProvisionContactError({ ...staff, portalAccess: 'Disabled' }) ?? '',
      /disabled/,
    );
  });

  it('manual staff link requires a verified auth user on a staff contact', () => {
    const staff = { ...client, role: 'Warehaus Staff' as const, email: 'peter@warehaus.co' };
    assert.equal(
      staffManualLinkError({
        contact: staff,
        authUser: { id: 'user_1', email: 'Peter@warehaus.co', emailVerified: true },
      }),
      null,
    );
    assert.match(
      staffManualLinkError({
        contact: client,
        authUser: { id: 'user_1', email: client.email, emailVerified: true },
      }) ?? '',
      /not Warehaus Staff/,
    );
    assert.match(
      staffManualLinkError({
        contact: staff,
        authUser: { id: 'user_1', email: staff.email, emailVerified: false },
      }) ?? '',
      /not verified/,
    );
  });
});
