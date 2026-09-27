/**
 * Invite write rules. Tokens and emails are produced only after Notion confirms.
 * Email compare uses normalizeEmail (trim + lowercase). Dots and +tags stay.
 */

import { createHash, randomBytes } from 'node:crypto';
import { normalizeEmail } from './contactJoin';
import type { PortalRole } from './identity';

export const CLIENT_ADMIN_INVITE_ROLES = ['Client Member'] as const;
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
  if (input.role === 'Client Member') {
    return { ok: false, clientMessage: 'You cannot send invites' };
  }
  if (input.role !== 'Warehaus Staff' && input.role !== 'Client Admin') {
    return { ok: false, clientMessage: 'You cannot send invites' };
  }
  if (input.role === 'Client Admin' && !CLIENT_ADMIN_INVITE_ROLES.includes(input.inviteRole as 'Client Member')) {
    return { ok: false, clientMessage: 'Only Warehaus can add admins for now' };
  }
  if (input.inviteRole === 'Warehaus Staff' && input.role !== 'Warehaus Staff') {
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
  tokenStatus: 'live' | 'used' | 'killed' | 'expired' | 'missing';
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

/** Token material is created only when Notion has already confirmed. */
export function tokenFromConfirmation(input: {
  confirmed: boolean;
  now: number;
}): { raw: string; tokenHash: string; expiresAt: number } | null {
  if (!input.confirmed) return null;
  const created = createInviteToken();
  return { ...created, expiresAt: input.now + INVITE_EXPIRY_MS };
}
