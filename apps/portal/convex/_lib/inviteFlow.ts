/**
 * Invite write rules. Tokens and emails are produced only after Notion confirms.
 * Email compare uses normalizeEmail (trim + lowercase). Dots and +tags stay.
 * Only Warehaus Staff can plan an invite. Clients cannot.
 */

import { createHash, randomBytes } from 'node:crypto';
import { normalizeEmail } from './contactJoin';
import type { PortalRole } from './identity';

export const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
export const INVITE_DAILY_LIMIT = 20;
export const INVITE_CLIENT_FAILURE = "We couldn't send this invite";

export function hashInviteToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function createInviteToken(): { raw: string; tokenHash: string } {
  const raw = randomBytes(32).toString('base64url');
  return { raw, tokenHash: hashInviteToken(raw) };
}

export function inviteEmailsMatch(signedInEmail: string, invitedEmail: string): boolean {
  return normalizeEmail(signedInEmail) === normalizeEmail(invitedEmail);
}

export function inviteRateAllows(sentInWindow: number): boolean {
  return sentInWindow < INVITE_DAILY_LIMIT;
}

export type InvitePlan =
  | {
      ok: true;
      orgId: string;
      emailNormalized: string;
      properties: Record<string, string | string[]>;
    }
  | { ok: false; clientMessage: string; staffMessage?: string };

export function planInviteCreate(input: {
  role: PortalRole;
  identityOrgId: string;
  inviteRole: string;
  email: string;
  name: string;
  clientNotionPageId: string;
  sentToday: number;
  emailOwnedByOtherOrg: boolean;
}): InvitePlan {
  if (input.role !== 'Warehaus Staff') {
    return { ok: false, clientMessage: 'You cannot send invites' };
  }
  if (input.inviteRole !== 'Client Member' && input.inviteRole !== 'Client Admin') {
    return { ok: false, clientMessage: 'You cannot send invites' };
  }
  if (!inviteRateAllows(input.sentToday)) {
    return { ok: false, clientMessage: INVITE_CLIENT_FAILURE, staffMessage: 'Invite rate limit reached' };
  }
  const emailNormalized = normalizeEmail(input.email);
  if (!emailNormalized.includes('@')) {
    return { ok: false, clientMessage: 'Enter a valid email' };
  }
  if (input.emailOwnedByOtherOrg) {
    return {
      ok: false,
      clientMessage: INVITE_CLIENT_FAILURE,
      staffMessage: `Invite email already belongs to another client: ${emailNormalized}`,
    };
  }
  if (!input.name.trim() || !input.clientNotionPageId) {
    return { ok: false, clientMessage: INVITE_CLIENT_FAILURE, staffMessage: 'Invite is missing a name or client' };
  }
  return {
    ok: true,
    orgId: input.identityOrgId,
    emailNormalized,
    properties: {
      Name: input.name.trim(),
      Email: emailNormalized,
      Role: input.inviteRole,
      Source: 'portal',
      'Portal Access': 'Disabled',
      'Invite Status': 'Pending',
      'Client Company': [input.clientNotionPageId],
    },
  };
}

export type AcceptPlan =
  | { ok: true; emailNormalized: string }
  | {
      ok: false;
      reason: 'mismatch' | 'unverified' | 'unusable' | 'expired';
      /** Signed-in address only. Never the invited address. */
      signedInEmail?: string;
    };

export function planInviteAccept(input: {
  tokenStatus: 'live' | 'pending' | 'used' | 'killed' | 'expired' | 'missing';
  expiresAt: number;
  now: number;
  tokenEmail: string;
  signedInEmail: string;
  emailVerified: boolean;
}): AcceptPlan {
  if (input.tokenStatus !== 'live' || input.expiresAt <= input.now) {
    return { ok: false, reason: input.expiresAt <= input.now ? 'expired' : 'unusable' };
  }
  if (!inviteEmailsMatch(input.signedInEmail, input.tokenEmail)) {
    return { ok: false, reason: 'mismatch', signedInEmail: normalizeEmail(input.signedInEmail) };
  }
  if (input.emailVerified !== true) return { ok: false, reason: 'unverified' };
  return { ok: true, emailNormalized: normalizeEmail(input.signedInEmail) };
}

export function inviteStateProperties(target: 'Accepted' | 'Declined' | 'Expired' | 'Revoked'): Record<string, string> {
  if (target === 'Accepted') return { 'Portal Access': 'Enabled', 'Invite Status': 'Accepted' };
  if (target === 'Revoked') return { 'Portal Access': 'Disabled', 'Invite Status': 'Revoked' };
  if (target === 'Declined') return { 'Invite Status': 'Declined' };
  return { 'Invite Status': 'Expired' };
}

export type ClientInviteRole = 'Client Member' | 'Client Admin';

export function asClientInviteRole(role: string): ClientInviteRole | null {
  if (role === 'Client Member' || role === 'Client Admin') return role;
  return null;
}

export type InviteTokenState = {
  status: 'live' | 'pending' | 'used' | 'killed' | 'expired';
  attempt: number;
};

/**
 * Accept, decline, and revoke all consume a live token in the same mutation.
 * A second use sees `pending` and is refused.
 */
export function claimInviteToken(
  token: InviteTokenState,
  action: 'accept' | 'decline' | 'revoke',
): { ok: true; token: InviteTokenState } | { ok: false; token: InviteTokenState } {
  const consumes = action === 'accept' || action === 'decline' || action === 'revoke';
  if (!consumes || token.status !== 'live') return { ok: false, token };
  return { ok: true, token: { ...token, status: 'pending' } };
}

/** Notion confirm finalizes the hold. A dead write puts the token back to live. */
export function finishInviteToken(
  token: InviteTokenState,
  outcome: 'confirmed' | 'dead',
  inviteStatus: 'Accepted' | 'Declined' | 'Revoked' | 'Expired',
): InviteTokenState {
  if (token.status !== 'pending') return token;
  if (outcome === 'dead') return { status: 'live', attempt: token.attempt + 1 };
  if (inviteStatus === 'Accepted') return { ...token, status: 'used' };
  if (inviteStatus === 'Expired') return { ...token, status: 'expired' };
  return { ...token, status: 'killed' };
}

export type InvitePreview =
  | { status: 'unusable'; portalName: 'Portal invite' }
  | { status: 'sign-in'; portalName: string }
  | { status: 'different-email'; portalName: string; signedInEmail: string }
  | { status: 'unverified'; portalName: string }
  | { status: 'ready'; portalName: string };

/**
 * Unknown, expired, and already-used tokens share one response.
 * The company name is included only after the token is live and unexpired.
 */
export function describeInvitePreview(input: {
  tokenStatus: 'live' | 'pending' | 'used' | 'killed' | 'expired' | 'missing';
  expiresAt: number;
  now: number;
  companyName: string | null;
  signedInEmail: string | null;
  emailVerified: boolean;
  tokenEmail: string;
}): InvitePreview {
  const usable = input.tokenStatus === 'live' && input.expiresAt > input.now;
  if (!usable) return { status: 'unusable', portalName: 'Portal invite' };
  const portalName = input.companyName ? `${input.companyName} portal invite` : 'Portal invite';
  if (!input.signedInEmail) return { status: 'sign-in', portalName };
  const plan = planInviteAccept({
    tokenStatus: 'live',
    expiresAt: input.expiresAt,
    now: input.now,
    tokenEmail: input.tokenEmail,
    signedInEmail: input.signedInEmail,
    emailVerified: input.emailVerified,
  });
  if (!plan.ok && plan.reason === 'mismatch') {
    return {
      status: 'different-email',
      portalName,
      signedInEmail: plan.signedInEmail ?? normalizeEmail(input.signedInEmail),
    };
  }
  if (!plan.ok && plan.reason === 'unverified') return { status: 'unverified', portalName };
  if (!plan.ok) return { status: 'unusable', portalName: 'Portal invite' };
  return { status: 'ready', portalName };
}

/** Token material is created only when Notion has already confirmed. */
export function tokenFromConfirmation(input: {
  confirmed: boolean;
  now: number;
}): { raw: string; tokenHash: string; expiresAt: number } | null {
  if (!input.confirmed) return null;
  const created = createInviteToken();
  return { ...created, expiresAt: input.now + INVITE_EXPIRY_MS };
}
