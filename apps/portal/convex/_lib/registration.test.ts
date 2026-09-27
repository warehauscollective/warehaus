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
  needsTypedVerifyEmail,
  signupScreenForDecision,
  staffManualLinkError,
  verifyEmailView,
  staffProvisionContactError,
  staffSessionDeleteArgs,
  staffSessionDeleteCursor,
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

  it('asks for an email on an expired link when this browser has none', () => {
    assert.equal(needsTypedVerifyEmail(''), true);
    assert.equal(needsTypedVerifyEmail('   '), true);
    assert.equal(needsTypedVerifyEmail('ada@client.test'), false);
  });

  it('leaves checking your link for every settled verify outcome', () => {
    const checking = {
      resentTo: null,
      tokenError: null,
      sessionPending: true,
      hasUser: false,
      linkStatus: 'loading',
      joining: false,
      joinError: null,
      refused: false,
    };
    assert.equal(verifyEmailView(checking), 'checking');
    assert.equal(
      verifyEmailView({ ...checking, sessionPending: false, linkStatus: 'disabled' }),
      'expired',
    );
    assert.equal(
      verifyEmailView({ ...checking, tokenError: 'INVALID_TOKEN', sessionPending: false }),
      'expired',
    );
    assert.equal(
      verifyEmailView({
        ...checking,
        sessionPending: false,
        hasUser: true,
        linkStatus: 'unlinked',
        joining: false,
        joinError: 'Could not link portal contact',
      }),
      'error',
    );
    assert.equal(
      verifyEmailView({
        ...checking,
        sessionPending: false,
        hasUser: true,
        linkStatus: 'unlinked',
        joinError: CANT_REGISTER_MESSAGE,
      }),
      'cant-register',
    );
    assert.equal(
      verifyEmailView({
        ...checking,
        sessionPending: false,
        hasUser: true,
        linkStatus: 'linked',
      }),
      'verified',
    );
    assert.equal(
      verifyEmailView({ ...checking, resentTo: 'ada@client.test', sessionPending: false }),
      'check-email',
    );
    assert.equal(
      verifyEmailView({
        ...checking,
        sessionPending: false,
        hasUser: true,
        linkStatus: 'unlinked',
        joining: true,
      }),
      'checking',
    );
  });

  it('staff reprovision deletes only that user\'s sessions', () => {
    const args = staffSessionDeleteArgs('user_existing');
    assert.equal(args.model, 'session');
    assert.deepEqual(args.where, [{ field: 'userId', operator: 'eq', value: 'user_existing' }]);
    assert.equal(staffSessionDeleteCursor({ isDone: false, continueCursor: 'page-2' }), 'page-2');
    assert.equal(staffSessionDeleteCursor({ isDone: true, continueCursor: 'page-2' }), null);
    assert.throws(
      () => staffSessionDeleteCursor({ isDone: false, continueCursor: null }),
      /did not finish/,
    );
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
