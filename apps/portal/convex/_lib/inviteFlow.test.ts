import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { signInToAcceptPath } from './acceptPaths';
import { existingLoginEmail, inviteEmail } from './email';
import {
  INVITE_CLIENT_FAILURE,
  createInviteToken,
  hashInviteToken,
  inviteEmailsMatch,
  inviteStateProperties,
  planInviteAccept,
  planInviteCreate,
  tokenFromConfirmation,
} from './inviteFlow';

const base = {
  role: 'Client Admin' as const,
  identityOrgId: 'org-a',
  inviteRole: 'Client Member',
  email: 'ada@example.com',
  name: 'Ada',
  clientNotionPageId: 'client-page',
  sentToday: 0,
  emailOwnedByOtherOrg: false,
};

describe('invite create plan', () => {
  it('builds a disabled pending contact and keeps the identity org', () => {
    const plan = planInviteCreate(base);
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(plan.orgId, 'org-a');
    assert.equal(plan.properties['Portal Access'], 'Disabled');
    assert.equal(plan.properties['Invite Status'], 'Pending');
    assert.equal(plan.properties.Email, 'ada@example.com');
  });

  it('refuses Client Members and Client Admin invites', () => {
    assert.equal(planInviteCreate({ ...base, role: 'Client Member' }).ok, false);
    const admin = planInviteCreate({ ...base, inviteRole: 'Client Admin' });
    assert.equal(admin.ok, false);
    if (!admin.ok) assert.match(admin.clientMessage, /Only Warehaus can add admins/);
  });

  it('hides a cross-client email from the client and keeps the reason for staff', () => {
    const plan = planInviteCreate({ ...base, emailOwnedByOtherOrg: true });
    assert.equal(plan.ok, false);
    if (!plan.ok) {
      assert.equal(plan.clientMessage, INVITE_CLIENT_FAILURE);
      assert.match(plan.staffMessage ?? '', /another client/);
    }
  });

  it('stops after 20 invites in the window', () => {
    const plan = planInviteCreate({ ...base, sentToday: 20 });
    assert.equal(plan.ok, false);
  });
});

describe('invite accept email match', () => {
  it('matches case and surrounding whitespace and keeps dots and plus tags', () => {
    assert.equal(inviteEmailsMatch('  Ada@Example.com ', 'ada@example.com'), true);
    assert.equal(inviteEmailsMatch('ada+tag@example.com', 'ada@example.com'), false);
    assert.equal(inviteEmailsMatch('a.da@example.com', 'ada@example.com'), false);
    const accepted = planInviteAccept({
      tokenStatus: 'live',
      expiresAt: 100,
      now: 1,
      tokenEmail: 'ada@example.com',
      signedInEmail: '  Ada@Example.com ',
      emailVerified: true,
    });
    assert.deepEqual(accepted, { ok: true, emailNormalized: 'ada@example.com' });
  });

  it('treats a different email as a mismatch before verification and omits the invited address', () => {
    const plan = planInviteAccept({
      tokenStatus: 'live',
      expiresAt: 100,
      now: 1,
      tokenEmail: 'ada+tag@example.com',
      signedInEmail: '  Other@Example.com ',
      emailVerified: false,
    });
    assert.deepEqual(plan, { ok: false, reason: 'mismatch', signedInEmail: 'other@example.com' });
    assert.equal(JSON.stringify(plan).includes('ada+tag@example.com'), false);
    assert.equal(JSON.stringify(plan).includes('+tag'), false);
  });

  it('keeps the invite token on the sign-in return path', () => {
    const path = signInToAcceptPath('tok en+1');
    const next = new URL(path, 'https://portal.example').searchParams.get('next');
    assert.equal(next, '/accept?token=tok%20en%2B1');
    assert.equal(path.includes('@'), false);
  });

  it('rejects a different signed-in email without returning the invited address', () => {
    const plan = planInviteAccept({
      tokenStatus: 'live',
      expiresAt: 100,
      now: 1,
      tokenEmail: 'invited@example.com',
      signedInEmail: 'Other@Example.com',
      emailVerified: true,
    });
    assert.deepEqual(plan, { ok: false, reason: 'mismatch', signedInEmail: 'other@example.com' });
    assert.equal(JSON.stringify(plan).includes('invited@example.com'), false);
  });

  it('requires a verified email and a live token', () => {
    assert.equal(
      planInviteAccept({
        tokenStatus: 'live',
        expiresAt: 100,
        now: 1,
        tokenEmail: 'ada@example.com',
        signedInEmail: 'ada@example.com',
        emailVerified: false,
      }).ok,
      false,
    );
    const dead = planInviteAccept({
      tokenStatus: 'killed',
      expiresAt: 100,
      now: 1,
      tokenEmail: 'ada@example.com',
      signedInEmail: 'ada@example.com',
      emailVerified: true,
    });
    assert.equal(dead.ok, false);
    if (!dead.ok) assert.equal(dead.reason, 'unusable');
  });

  it('creates a token only after Notion confirms', () => {
    assert.equal(tokenFromConfirmation({ confirmed: false, now: 1 }), null);
    const issued = tokenFromConfirmation({ confirmed: true, now: 1 });
    assert.ok(issued);
    assert.equal(issued!.tokenHash, hashInviteToken(issued!.raw));
    assert.equal(createInviteToken().raw.length > 40, true);
  });

  it('builds the invite email in the portal style', () => {
    const mail = inviteEmail({ name: 'Ada', acceptUrl: 'https://portal.example/accept?token=abc' });
    assert.match(mail.html, /Warehaus Portal/);
    assert.match(mail.html, /background: #111/);
    assert.match(mail.text, /portal\.example\/accept\?token=abc/);
    assert.equal(mail.html.includes('Decline'), false);
  });

  it('emails people who already have a login instead of a password screen', () => {
    const mail = existingLoginEmail({
      name: 'Ada',
      acceptUrl: 'https://portal.example/accept?token=abc',
    });
    assert.match(mail.subject, /already have a Warehaus portal login/);
    assert.match(mail.html, /Warehaus Portal/);
    assert.match(mail.html, /background: #111/);
    assert.match(mail.html, /Sign in to accept/);
    assert.equal(mail.html.includes('set a password'), false);
    assert.equal(mail.html.includes('Decline'), false);
  });

  it('maps accept, decline, revoke, and expire onto Notion fields', () => {
    assert.deepEqual(inviteStateProperties('Accepted'), {
      'Portal Access': 'Enabled',
      'Invite Status': 'Accepted',
    });
    assert.equal(inviteStateProperties('Declined')['Invite Status'], 'Declined');
    assert.equal(inviteStateProperties('Revoked')['Portal Access'], 'Disabled');
    assert.equal(inviteStateProperties('Expired')['Invite Status'], 'Expired');
  });
});
