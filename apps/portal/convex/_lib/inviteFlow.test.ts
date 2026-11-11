import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validatePropertyPatch } from '@warehaus/portal-sync';
import { signInToAcceptPath } from './acceptPaths';
import { deliverInviteEmail, existingLoginEmail, inviteEmail, sendIssuedInviteMail } from './email';
import { WRITEBACK_OFF_ERROR } from '@warehaus/portal-sync';
import {
  INVITE_ALREADY_MESSAGE,
  INVITE_CLIENT_FAILURE,
  INVITE_CLIENT_ROLE_MESSAGE,
  INVITE_EMAIL_OFF_MESSAGE,
  INVITE_EXPIRED_MESSAGE,
  INVITE_UNVERIFIED_MESSAGE,
  INVITE_URL_OFF_MESSAGE,
  INVITE_USED_MESSAGE,
  WAREHAUS_INTERNAL_CLIENT_ID_ENV,
  asClientInviteRole,
  inviteCreatePayloadError,
  inviteRelationError,
  resolveWarehausInviteClient,
  staffInviteOrgAllowed,
  type WarehausPageCandidate,
  asInviteRole,
  claimInviteToken,
  createInviteToken,
  describeInvitePreview,
  finishInviteToken,
  hashInviteToken,
  inviteEmailsMatch,
  invitePasswordReady,
  readAcceptHold,
  inviteSendGate,
  inviteStateProperties,
  inviteStatusMessage,
  liveTokenIsExpired,
  memberRemoveProperties,
  planInviteAccept,
  planInviteCreate,
  planInviteSignup,
  planMemberRemove,
  planStaffInviteLink,
  pendingInviteWouldRegress,
  renewRequestMessage,
  staffAcceptConflicted,
  staffAcceptInProgress,
  staffAcceptOrgOk,
  signupPermitOpen,
  tokenFromConfirmation,
  type InviteTokenState,
} from './inviteFlow';

const INTERNAL_PAGE = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const base = {
  role: 'Warehaus Staff' as const,
  inviteRole: 'Warehaus Staff',
  email: 'ada@example.com',
  name: 'Ada',
  internalOrgId: 'org-internal',
  internalNotionPageId: INTERNAL_PAGE,
  sentToday: 0,
  emailOwnedByOtherOrg: false,
};

describe('invite create plan', () => {
  it('builds a disabled staff contact on the warehaus-internal org', () => {
    const plan = planInviteCreate(base);
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(plan.orgId, 'org-internal');
    assert.equal(plan.properties.Role, 'Warehaus Staff');
    assert.equal(plan.properties['Portal Access'], 'Disabled');
    assert.equal(plan.properties['Invite Status'], 'Pending');
    assert.equal(plan.properties.Email, 'ada@example.com');
    assert.deepEqual(plan.properties['Client Company'], [INTERNAL_PAGE]);
  });

  it('refuses a seed id and does not build a Notion payload', () => {
    const resolved = resolveWarehausInviteClient({
      clients: [
        {
          id: 'org-seed',
          slug: 'warehaus-internal',
          externalId: 'wh_cli_warehaus-internal',
          notionPageId: 'seed-warehaus-org',
        },
        { id: 'org-client', slug: 'client-portal', notionPageId: INTERNAL_PAGE },
      ],
    });
    assert.equal(resolved.ok, false);
    if (!resolved.ok) {
      assert.match(resolved.message, /seed-warehaus-org/);
      assert.match(resolved.message, /Nothing was queued/);
    }

    const plan = planInviteCreate({ ...base, internalNotionPageId: 'seed-warehaus-org' });
    assert.equal(plan.ok, false);
    if (!plan.ok) {
      assert.match(plan.clientMessage, /Notion page uuid/);
      assert.equal('properties' in plan, false);
    }
    const payloadError = inviteCreatePayloadError({
      properties: {
        Name: 'Ada',
        'Client Company': ['seed-warehaus-org'],
        Project: [INTERNAL_PAGE],
      },
      clientNotionPageId: 'seed-warehaus-org',
    });
    assert.match(payloadError ?? '', /Client Company must be a Notion page uuid/);
    assert.match(
      inviteRelationError({
        'Client Company': [INTERNAL_PAGE],
        Project: ['seed-warehaus-org'],
      }) ?? '',
      /Project must be a Notion page uuid/,
    );
  });

  it('uses the row that holds the Warehaus page, not the seed org', () => {
    const resolved = resolveWarehausInviteClient({
      clients: [
        { id: 'org-seed', slug: 'warehaus-internal', notionPageId: 'seed-warehaus-org' },
        { id: 'org-real', slug: 'warehaus', notionPageId: INTERNAL_PAGE, portalAccess: 'Enabled' },
      ],
    });
    assert.deepEqual(resolved, { ok: true, orgId: 'org-real', notionPageId: INTERNAL_PAGE });
    const plan = planInviteCreate({
      ...base,
      internalOrgId: 'org-seed',
      internalNotionPageId: 'seed-warehaus-org',
      clients: [
        { id: 'org-seed', slug: 'warehaus-internal', notionPageId: 'seed-warehaus-org' },
        { id: 'org-real', slug: 'warehaus', notionPageId: INTERNAL_PAGE, portalAccess: 'Enabled' },
      ],
    });
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(plan.orgId, 'org-real');
    assert.deepEqual(plan.properties['Client Company'], [INTERNAL_PAGE]);
  });

  it('does not let an env page id stand in for a row', () => {
    const resolved = resolveWarehausInviteClient({
      clients: [{ id: 'org-seed', slug: 'warehaus-internal', notionPageId: 'seed-warehaus-org' }],
      configuredClientId: INTERNAL_PAGE,
    });
    assert.equal(resolved.ok, false);
    if (!resolved.ok) {
      assert.match(resolved.message, new RegExp(WAREHAUS_INTERNAL_CLIENT_ID_ENV));
      assert.match(resolved.message, /Nothing was queued/);
    }
    const pointingAtSeed = resolveWarehausInviteClient({
      clients: [
        { id: 'org-seed', slug: 'warehaus-internal', notionPageId: 'seed-warehaus-org' },
        { id: 'org-real', slug: 'warehaus', notionPageId: INTERNAL_PAGE, portalAccess: 'Enabled' },
      ],
      configuredClientId: 'org-seed',
    });
    assert.equal(pointingAtSeed.ok, false);
    if (!pointingAtSeed.ok) assert.match(pointingAtSeed.message, /Nothing was queued/);
  });

  it('fails when more than one Warehaus row holds a page unless the env picks one', () => {
    const clients: WarehausPageCandidate[] = [
      { id: 'org-seed', slug: 'warehaus-internal', notionPageId: 'seed-warehaus-org' },
      { id: 'org-a', slug: 'warehaus', notionPageId: INTERNAL_PAGE, portalAccess: 'Enabled' },
      {
        id: 'org-b',
        slug: 'warehaus',
        notionPageId: '3b1ffd60-316b-813f-987b-f9912477dbc0',
        portalAccess: 'Enabled',
      },
    ];
    const ambiguous = resolveWarehausInviteClient({ clients });
    assert.equal(ambiguous.ok, false);
    if (!ambiguous.ok) assert.match(ambiguous.message, /More than one/);
    const chosen = resolveWarehausInviteClient({ clients, configuredClientId: 'org-b' });
    assert.deepEqual(chosen, {
      ok: true,
      orgId: 'org-b',
      notionPageId: '3b1ffd60-316b-813f-987b-f9912477dbc0',
    });
    const otherClient = resolveWarehausInviteClient({
      clients,
      configuredClientId: 'org-north',
    });
    assert.equal(otherClient.ok, false);
  });

  it('refuses a holder whose portal access is disabled', () => {
    const resolved = resolveWarehausInviteClient({
      clients: [
        { id: 'org-seed', slug: 'warehaus-internal', notionPageId: 'seed-warehaus-org' },
        { id: 'org-real', slug: 'warehaus', notionPageId: INTERNAL_PAGE, portalAccess: 'Disabled' },
      ],
    });
    assert.equal(resolved.ok, false);
    if (!resolved.ok) {
      assert.match(resolved.message, /portal access is disabled/);
      assert.match(resolved.message, /Nothing was queued/);
    }
    const configured = resolveWarehausInviteClient({
      clients: [
        { id: 'org-real', slug: 'warehaus', notionPageId: INTERNAL_PAGE, portalAccess: 'Disabled' },
        { id: 'org-other', slug: 'warehaus', notionPageId: '3b1ffd60-316b-813f-987b-f9912477dbc0', portalAccess: 'Enabled' },
      ],
      configuredClientId: 'org-real',
    });
    assert.equal(configured.ok, false);
    if (!configured.ok) assert.match(configured.message, /Nothing was queued/);
  });

  it('refuses a holder hidden from sync', () => {
    const resolved = resolveWarehausInviteClient({
      clients: [
        {
          id: 'org-real',
          slug: 'warehaus',
          notionPageId: INTERNAL_PAGE,
          portalAccess: 'Enabled',
          syncHiddenAt: 1,
        },
      ],
    });
    assert.equal(resolved.ok, false);
    if (!resolved.ok) {
      assert.match(resolved.message, /hidden from sync/);
      assert.match(resolved.message, /Nothing was queued/);
    }
  });

  it('refuses clients, including a Client Admin', () => {
    assert.equal(planInviteCreate({ ...base, role: 'Client Member' }).ok, false);
    const admin = planInviteCreate({ ...base, role: 'Client Admin' });
    assert.equal(admin.ok, false);
    if (!admin.ok) assert.equal(admin.clientMessage, 'You cannot send invites');
  });

  it('refuses client-role invite creation', () => {
    const member = planInviteCreate({ ...base, inviteRole: 'Client Member' });
    const admin = planInviteCreate({ ...base, inviteRole: 'Client Admin' });
    assert.equal(member.ok, false);
    assert.equal(admin.ok, false);
    if (!member.ok) assert.equal(member.clientMessage, INVITE_CLIENT_ROLE_MESSAGE);
    if (!admin.ok) assert.equal(admin.clientMessage, INVITE_CLIENT_ROLE_MESSAGE);
  });

  it('refuses an email that is already staff or a member', () => {
    const plan = planInviteCreate({ ...base, emailAlreadyMember: true });
    assert.equal(plan.ok, false);
    if (!plan.ok) assert.equal(plan.clientMessage, INVITE_ALREADY_MESSAGE);
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

describe('member remove', () => {
  const removeBase = {
    role: 'Warehaus Staff' as const,
    contactOrgId: 'org-a',
    identityOrgId: 'org-a',
    contactRole: 'Client Admin',
    contactId: 'contact-bea',
    actorContactId: 'contact-staff',
    hidden: false,
  };

  it('plans a portal-access patch for a client person', () => {
    assert.deepEqual(planMemberRemove(removeBase), { ok: true });
    const patch = validatePropertyPatch({ database: 'contacts', properties: memberRemoveProperties() });
    assert.equal(patch.ok, true);
    if (!patch.ok) return;
    assert.equal(patch.properties['Portal Access'], 'Disabled');
  });

  it('refuses staff, the signed-in contact, another org, and a hidden row', () => {
    assert.equal(planMemberRemove({ ...removeBase, contactRole: 'Warehaus Staff' }).ok, false);
    assert.equal(planMemberRemove({ ...removeBase, contactId: 'contact-staff' }).ok, false);
    assert.equal(planMemberRemove({ ...removeBase, role: 'Client Admin' }).ok, false);
    assert.equal(planMemberRemove({ ...removeBase, contactOrgId: 'org-b' }).ok, false);
    assert.equal(planMemberRemove({ ...removeBase, hidden: true }).ok, false);
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
    if (!dead.ok) assert.equal(dead.reason, 'revoked');
    const expired = planInviteAccept({
      tokenStatus: 'expired',
      expiresAt: 100,
      now: 1,
      tokenEmail: 'ada@example.com',
      signedInEmail: 'ada@example.com',
      emailVerified: true,
    });
    assert.equal(expired.ok, false);
    if (!expired.ok) assert.equal(expired.reason, 'expired');
    assert.equal(inviteStatusMessage('expired'), INVITE_EXPIRED_MESSAGE);
    assert.equal(inviteStatusMessage('used'), INVITE_USED_MESSAGE);
    assert.equal(inviteStatusMessage('unverified'), INVITE_UNVERIFIED_MESSAGE);
  });

  it('creates a token only after Notion confirms', async () => {
    assert.equal(await tokenFromConfirmation({ confirmed: false, now: 1 }), null);
    const issued = await tokenFromConfirmation({ confirmed: true, now: 1 });
    assert.ok(issued);
    assert.equal(issued!.tokenHash, await hashInviteToken(issued!.raw));
    const { raw } = await createInviteToken();
    assert.equal(raw.length, 43);
    assert.match(raw, /^[A-Za-z0-9_-]+$/);
  });

  it('hashes tokens as hex SHA-256, same as before', async () => {
    assert.equal(
      await hashInviteToken('abc'),
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('builds the invite email in the portal style', () => {
    const mail = inviteEmail({ name: 'Ada', acceptUrl: 'https://portal.example/accept?token=abc' });
    assert.match(mail.html, /Warehaus Portal/);
    assert.match(mail.html, /background: #111/);
    assert.match(mail.text, /portal\.example\/accept\?token=abc/);
    assert.equal(mail.html.includes('Decline'), false);
    assert.equal(mail.html.includes('7 days from now'), false);
    const named = inviteEmail({
      name: 'Ada',
      acceptUrl: 'https://portal.example/accept?token=abc',
      inviterName: 'Peter Roquemore',
      expiresOn: 'Nov 16, 2026',
    });
    assert.match(named.html, /Peter Roquemore/);
    assert.match(named.text, /stops working on Nov 16, 2026/);
    assert.equal(named.text.includes('7 days from now'), false);
  });

  it('emails people who already have a login instead of a password screen', () => {
    const mail = existingLoginEmail({
      name: 'Ada',
      acceptUrl: 'https://portal.example/accept?token=abc',
    });
    assert.match(mail.subject, /invited you to join Warehaus on the Portal|You’re invited to join Warehaus/);
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

  it('gives expired and used tokens their own preview and hides the company', () => {
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
    const revoked = describeInvitePreview({ ...shared, tokenStatus: 'killed', expiresAt: 100 });
    assert.deepEqual(unknown, { status: 'unusable', portalName: 'Portal invite' });
    assert.deepEqual(expired, { status: 'expired', portalName: 'Portal invite', invitedEmail: 'ada@example.com' });
    assert.deepEqual(past, { status: 'expired', portalName: 'Portal invite', invitedEmail: 'ada@example.com' });
    assert.deepEqual(used, { status: 'used', portalName: 'Portal invite' });
    assert.deepEqual(revoked, { status: 'revoked', portalName: 'Portal invite' });
    assert.equal(JSON.stringify({ unknown, used }).includes(secret), false);
    assert.equal(JSON.stringify(expired).includes(secret), false);
    assert.equal(JSON.stringify(unknown).includes('ada@example.com'), false);
    assert.equal(expired.invitedEmail, 'ada@example.com');
    const ready = describeInvitePreview({
      ...shared,
      tokenStatus: 'live',
      expiresAt: 100,
      staffInvite: true,
    });
    assert.deepEqual(ready, {
      status: 'ready',
      portalName: 'Secret Co portal invite',
      invitedEmail: 'ada@example.com',
    });
    const created = describeInvitePreview({
      ...shared,
      signedInEmail: null,
      tokenStatus: 'live',
      expiresAt: 100,
      staffInvite: true,
      accountExists: false,
    });
    assert.equal(created.status, 'create-account');
    if (created.status === 'create-account') assert.equal(created.invitedEmail, 'ada@example.com');
    const existing = describeInvitePreview({
      ...shared,
      signedInEmail: null,
      tokenStatus: 'live',
      expiresAt: 100,
      staffInvite: true,
      accountExists: true,
    });
    assert.equal(existing.status, 'sign-in');
    const already = describeInvitePreview({
      ...shared,
      tokenStatus: 'live',
      expiresAt: 100,
      staffInvite: true,
      alreadyMember: true,
    });
    assert.equal(already.status, 'already');
  });

  it('treats only an accepted staff hold as an invite still in progress', () => {
    const invite = {
      email: 'Ada@example.com',
      role: 'Warehaus Staff',
      inviteStatus: 'Pending',
      notionPageId: 'page-1',
    };
    const held = { emailNormalized: 'ada@example.com', status: 'pending', contactNotionPageId: 'page-1' };
    const accepted = { notionPageId: 'page-1', inviteStatus: 'Accepted', staff: true, open: true };
    assert.equal(
      staffAcceptInProgress({ email: 'ada@example.com', invites: [invite], tokens: [held], holds: [accepted] }),
      true,
    );
    assert.equal(
      staffAcceptInProgress({
        email: 'ada@example.com',
        invites: [invite],
        tokens: [{ ...held, status: 'live' }],
        holds: [],
      }),
      false,
    );
    assert.equal(
      staffAcceptInProgress({
        email: 'ada@example.com',
        invites: [invite],
        tokens: [held],
        holds: [{ ...accepted, inviteStatus: 'Revoked' }],
      }),
      false,
    );
    assert.equal(
      staffAcceptInProgress({
        email: 'ada@example.com',
        invites: [{ ...invite, inviteStatus: 'Accepted' }],
        tokens: [],
        holds: [],
      }),
      false,
    );
    assert.equal(
      staffAcceptInProgress({
        email: 'ada@example.com',
        invites: [{ ...invite, inviteStatus: 'Accepted' }],
        tokens: [],
        holds: [accepted],
      }),
      true,
    );
    const conflict = readAcceptHold(
      'page-1',
      'setInviteState',
      'conflict',
      JSON.stringify({ properties: { 'Invite Status': 'Accepted' }, staffLink: { role: 'Warehaus Staff' } }),
    );
    assert.equal(conflict?.open, false);
    assert.equal(conflict?.conflicted, true);
    assert.equal(
      staffAcceptInProgress({
        email: 'ada@example.com',
        invites: [{ ...invite, inviteStatus: 'Accepted' }],
        tokens: [held],
        holds: conflict ? [conflict] : [],
      }),
      false,
    );
    assert.equal(
      staffAcceptConflicted({
        email: 'ada@example.com',
        invites: [{ ...invite, inviteStatus: 'Accepted' }],
        holds: conflict ? [conflict] : [],
      }),
      true,
    );
    const queued = readAcceptHold(
      'page-1',
      'setInviteState',
      'queued',
      JSON.stringify({ properties: { 'Invite Status': 'Accepted' }, staffLink: { role: 'Warehaus Staff' } }),
    );
    assert.equal(queued?.open, true);
    assert.equal(
      staffAcceptInProgress({
        email: 'other@example.com',
        invites: [invite],
        tokens: [held],
        holds: [accepted],
      }),
      false,
    );
  });

  it('links a new staff invite and refuses someone who is already staff or a member', () => {
    const fresh = planStaffInviteLink({
      authUserId: 'user-new',
      authEmail: 'ada@example.com',
      emailVerified: true,
      tokenEmail: 'ada@example.com',
      sessionAlreadyLinked: false,
      contacts: [],
    });
    assert.deepEqual(fresh, { ok: true, mode: 'create' });
    const member = planStaffInviteLink({
      authUserId: 'user-new',
      authEmail: 'ada@example.com',
      emailVerified: true,
      tokenEmail: 'ada@example.com',
      sessionAlreadyLinked: false,
      contacts: [{ role: 'Client Member', email: 'ada@example.com', authUserId: 'user-old' }],
    });
    assert.equal(member.ok, false);
    if (!member.ok) assert.equal(member.reason, 'already');
    const linkedStaff = planStaffInviteLink({
      authUserId: 'user-new',
      authEmail: 'ada@example.com',
      emailVerified: true,
      tokenEmail: 'ada@example.com',
      sessionAlreadyLinked: true,
      contacts: [],
    });
    assert.equal(linkedStaff.ok, false);
    const unverified = planStaffInviteLink({
      authUserId: 'user-new',
      authEmail: 'ada@example.com',
      emailVerified: false,
      tokenEmail: 'ada@example.com',
      sessionAlreadyLinked: false,
      contacts: [],
    });
    assert.equal(unverified.ok, false);
    if (!unverified.ok) assert.equal(unverified.reason, 'unverified');
  });

  it('lets a live staff token create a password and refuses an existing account', () => {
    const created = planInviteSignup({
      tokenStatus: 'live',
      expiresAt: 100,
      now: 1,
      tokenEmail: 'ada@example.com',
      accountExists: false,
      staffInvite: true,
    });
    assert.deepEqual(created, { ok: true, emailNormalized: 'ada@example.com' });
    const existing = planInviteSignup({
      tokenStatus: 'live',
      expiresAt: 100,
      now: 1,
      tokenEmail: 'ada@example.com',
      accountExists: true,
      staffInvite: true,
    });
    assert.equal(existing.ok, false);
    if (!existing.ok) assert.equal(existing.reason, 'sign-in');
    const client = planInviteSignup({
      tokenStatus: 'live',
      expiresAt: 100,
      now: 1,
      tokenEmail: 'ada@example.com',
      accountExists: false,
      staffInvite: false,
    });
    assert.equal(client.ok, false);
    const expired = planInviteSignup({
      tokenStatus: 'expired',
      expiresAt: 100,
      now: 1,
      tokenEmail: 'ada@example.com',
      accountExists: false,
      staffInvite: true,
    });
    assert.equal(expired.ok, false);
    if (!expired.ok) assert.equal(expired.reason, 'expired');
  });

  it('fails closed when write-back, invite email, or the public url is off', () => {
    assert.deepEqual(inviteSendGate({ writebackEnabled: false, emailEnabled: true, publicUrl: 'http://localhost:3100' }), {
      ok: false,
      message: WRITEBACK_OFF_ERROR,
    });
    assert.deepEqual(inviteSendGate({ writebackEnabled: true, emailEnabled: false, publicUrl: 'http://localhost:3100' }), {
      ok: false,
      message: INVITE_EMAIL_OFF_MESSAGE,
    });
    assert.deepEqual(inviteSendGate({ writebackEnabled: true, emailEnabled: true, publicUrl: '' }), {
      ok: false,
      message: INVITE_URL_OFF_MESSAGE,
    });
    assert.deepEqual(inviteSendGate({ writebackEnabled: true, emailEnabled: true, publicUrl: 'http://localhost:3100' }), {
      ok: true,
    });
    assert.equal(liveTokenIsExpired('live', 5, 10), true);
    assert.equal(liveTokenIsExpired('used', 5, 10), false);
    const permit = { email: 'ada@example.com', expiresAt: 1_000 + 15_000 };
    assert.equal(signupPermitOpen(permit, 'Ada@Example.com', 1_001), true);
    assert.equal(signupPermitOpen(permit, 'ada@example.com', permit.expiresAt), false);
    assert.equal(signupPermitOpen(null, 'ada@example.com', 1_001), false);
    assert.equal(
      pendingInviteWouldRegress({
        existingStatus: 'Expired',
        incomingStatus: 'Pending',
        tokens: [{ status: 'expired', expiresAt: 1 }],
        now: 10,
      }),
      true,
    );
    assert.equal(
      pendingInviteWouldRegress({
        existingStatus: 'Expired',
        incomingStatus: 'Pending',
        tokens: [{ status: 'live', expiresAt: 50 }],
        now: 10,
      }),
      false,
    );
    assert.equal(
      staffAcceptOrgOk({
        pendingRole: 'Warehaus Staff',
        pendingOrgId: 'org-wh',
        tokenOrgId: 'org-wh',
        internalOrgId: 'org-wh',
      }),
      true,
    );
    assert.equal(
      staffAcceptOrgOk({
        pendingRole: 'Warehaus Staff',
        pendingOrgId: 'org-client',
        tokenOrgId: 'org-client',
        internalOrgId: 'org-wh',
      }),
      false,
    );
    assert.equal(
      staffAcceptOrgOk({
        pendingRole: 'Warehaus Staff',
        pendingOrgId: 'org-real',
        tokenOrgId: 'org-real',
        internalOrgId: 'org-wh',
        holderOrgIds: ['org-real'],
      }),
      true,
    );
    assert.equal(
      staffInviteOrgAllowed({ orgId: 'org-wh', legacyOrgId: 'org-wh', holderOrgIds: ['org-real'] }),
      true,
    );
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
    assert.equal(asInviteRole('Warehaus Staff'), 'Warehaus Staff');
    assert.equal(asInviteRole('Client Member'), 'Client Member');
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
        {
          INVITE_EMAIL_ENABLED: 'true',
          PORTAL_PUBLIC_URL: 'https://portal.example/',
          EMAIL_FROM: 'Warehaus Portal <portal@warehaus.studio>',
        },
        client,
      );
      assert.deepEqual(on, { sent: true });
      const noFrom = await sendIssuedInviteMail(
        message,
        { INVITE_EMAIL_ENABLED: 'true', PORTAL_PUBLIC_URL: 'https://portal.example/' },
        client,
      );
      assert.deepEqual(noFrom, { sent: false, reason: 'EMAIL_FROM is not set' });
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

  it('requires a letter and a number and keeps the renew reply constant', () => {
    assert.equal(invitePasswordReady('short1'), false);
    assert.equal(invitePasswordReady('longpassword'), false);
    assert.equal(invitePasswordReady('longpass1'), true);
    assert.equal(renewRequestMessage(), renewRequestMessage());
    assert.equal(renewRequestMessage().toLowerCase().includes('account'), false);
  });
});
