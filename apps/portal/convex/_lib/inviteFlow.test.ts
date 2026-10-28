import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { signInToAcceptPath } from './acceptPaths';
import { deliverInviteEmail, existingLoginEmail, inviteEmail, sendIssuedInviteMail } from './email';
import {
  INVITE_CLIENT_FAILURE,
  asClientInviteRole,
  claimInviteToken,
  createInviteToken,
  describeInvitePreview,
  finishInviteToken,
  hashInviteToken,
  inviteEmailsMatch,
  inviteStateProperties,
  planInviteAccept,
  planInviteCreate,
  tokenFromConfirmation,
  type InviteTokenState,
} from './inviteFlow';

const base = {
  role: 'Warehaus Staff' as const,
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

  it('refuses clients, including a Client Admin', () => {
    assert.equal(planInviteCreate({ ...base, role: 'Client Member' }).ok, false);
    const admin = planInviteCreate({ ...base, role: 'Client Admin' });
    assert.equal(admin.ok, false);
    if (!admin.ok) assert.equal(admin.clientMessage, 'You cannot send invites');
  });

  it('hides a cross-client email from the caller and keeps the reason for staff', () => {
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

  it('delivers invite mail only through the injected client', async () => {
    const sent: Array<{ to: string; subject: string }> = [];
    const originalFetch = globalThis.fetch;
    let fetched = false;
    globalThis.fetch = async () => {
      fetched = true;
      return new Response('no');
    };
    try {
      await deliverInviteEmail(
        {
          to: 'ada@example.com',
          name: 'Ada',
          acceptUrl: 'https://portal.example/accept?token=abc',
          alreadyHasLogin: false,
        },
        {
          send: async (message) => {
            sent.push({ to: message.to, subject: message.subject });
          },
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
    assert.equal(fetched, false);
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.to, 'ada@example.com');
    assert.match(sent[0]?.subject ?? '', /invited/);
  });

  it('gives unknown, expired, and used tokens the same preview and hides the company', () => {
    const secret = 'Secret Co';
    const shared = {
      now: 10,
      companyName: secret,
      signedInEmail: 'ada@example.com',
      emailVerified: true,
      tokenEmail: 'ada@example.com',
    };
    const unknown = describeInvitePreview({ ...shared, tokenStatus: 'missing', expiresAt: 0 });
    const expired = describeInvitePreview({ ...shared, tokenStatus: 'expired', expiresAt: 100 });
    const past = describeInvitePreview({ ...shared, tokenStatus: 'live', expiresAt: 5 });
    const used = describeInvitePreview({ ...shared, tokenStatus: 'used', expiresAt: 100 });
    assert.deepEqual(unknown, { status: 'unusable', portalName: 'Portal invite' });
    assert.deepEqual(expired, unknown);
    assert.deepEqual(past, unknown);
    assert.deepEqual(used, unknown);
    assert.equal(JSON.stringify(unknown).includes(secret), false);
    const ready = describeInvitePreview({ ...shared, tokenStatus: 'live', expiresAt: 100 });
    assert.deepEqual(ready, { status: 'ready', portalName: 'Secret Co portal invite' });
  });

  it('refuses decline and revoke after accept until a dead write releases the token', () => {
    let token: InviteTokenState = { status: 'live', attempt: 0 };
    const accepted = claimInviteToken(token, 'accept');
    assert.equal(accepted.ok, true);
    if (!accepted.ok) return;
    token = accepted.token;
    assert.equal(token.status, 'pending');
    assert.equal(claimInviteToken(token, 'decline').ok, false);
    assert.equal(claimInviteToken(token, 'revoke').ok, false);
    const used = finishInviteToken(token, 'confirmed', 'Accepted');
    assert.equal(used.status, 'used');
    assert.equal(claimInviteToken(used, 'decline').ok, false);
    assert.equal(claimInviteToken(used, 'revoke').ok, false);

    const held = claimInviteToken({ status: 'live', attempt: 0 }, 'accept');
    assert.equal(held.ok, true);
    if (!held.ok) return;
    const released = finishInviteToken(held.token, 'dead', 'Accepted');
    assert.deepEqual(released, { status: 'live', attempt: 1 });
    const revoked = claimInviteToken(released, 'revoke');
    assert.equal(revoked.ok, true);
    if (!revoked.ok) return;
    assert.equal(revoked.token.status, 'pending');
    assert.equal(claimInviteToken(revoked.token, 'accept').ok, false);
    assert.equal(finishInviteToken(revoked.token, 'confirmed', 'Revoked').status, 'killed');
  });

  it('keeps pending invite roles to client roles', () => {
    assert.equal(asClientInviteRole('Client Member'), 'Client Member');
    assert.equal(asClientInviteRole('Client Admin'), 'Client Admin');
    assert.equal(asClientInviteRole('Warehaus Staff'), null);
  });

  it('does not send invite email unless INVITE_EMAIL_ENABLED is exactly true', async () => {
    const sent: string[] = [];
    const originalFetch = globalThis.fetch;
    let fetched = false;
    globalThis.fetch = async () => {
      fetched = true;
      return new Response('no');
    };
    const previousWriteback = process.env.NOTION_WRITEBACK_ENABLED;
    process.env.NOTION_WRITEBACK_ENABLED = 'true';
    const client = {
      send: async (message: { to: string }) => {
        sent.push(message.to);
      },
    };
    const message = {
      to: 'ada@example.com',
      name: 'Ada',
      rawToken: 'raw token',
      alreadyHasLogin: false,
    };
    try {
      const off = await sendIssuedInviteMail(
        message,
        { INVITE_EMAIL_ENABLED: undefined, PORTAL_PUBLIC_URL: 'https://portal.example' },
        client,
      );
      assert.deepEqual(off, { sent: false, reason: 'INVITE_EMAIL_ENABLED is off' });
      const almost = await sendIssuedInviteMail(
        message,
        { INVITE_EMAIL_ENABLED: 'TRUE', PORTAL_PUBLIC_URL: 'https://portal.example' },
        client,
      );
      assert.equal(almost.sent, false);
      const on = await sendIssuedInviteMail(
        message,
        { INVITE_EMAIL_ENABLED: 'true', PORTAL_PUBLIC_URL: 'https://portal.example/' },
        client,
      );
      assert.deepEqual(on, { sent: true });
    } finally {
      globalThis.fetch = originalFetch;
      if (previousWriteback === undefined) delete process.env.NOTION_WRITEBACK_ENABLED;
      else process.env.NOTION_WRITEBACK_ENABLED = previousWriteback;
    }
    assert.equal(fetched, false);
    assert.deepEqual(sent, ['ada@example.com']);
    assert.equal(process.env.NOTION_WRITEBACK_ENABLED, previousWriteback);
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
