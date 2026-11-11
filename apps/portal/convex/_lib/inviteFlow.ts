/**
 * Invite write rules. Tokens and emails are produced only after Notion confirms.
 * Email compare uses normalizeEmail (trim + lowercase). Dots and +tags stay.
 * Only Warehaus Staff can plan an invite. Clients cannot.
 */

import {
  WRITEBACK_OFF_ERROR,
  isNotionPageId,
  isWarehausInternalClient,
  normalizeNotionId,
} from '@warehaus/portal-sync';
import { normalizeEmail } from './contactJoin';
import type { PortalRole } from './identity';

export const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
export const INVITE_DAILY_LIMIT = 20;
export const INVITE_CLIENT_FAILURE = "We couldn't send this invite";
export const INVITE_EXPIRED_MESSAGE = 'This invite has expired.';
export const INVITE_USED_MESSAGE = 'This invite was already used.';
export const INVITE_REVOKED_MESSAGE = 'This invite was revoked.';
export const INVITE_MISMATCH_MESSAGE = 'You’re signed in as a different account.';
export const INVITE_ALREADY_MESSAGE = 'This email is already staff or a member.';
export const INVITE_UNVERIFIED_MESSAGE = 'Verify your email, then open this link again.';
export const INVITE_EMAIL_OFF_MESSAGE = 'Invite email is off. Nothing was sent.';
export const INVITE_URL_OFF_MESSAGE = 'The portal link is not set. Nothing was sent.';
export const INVITE_CLIENT_ROLE_MESSAGE = 'Client invites are off.';
export const INVITE_UNUSABLE_MESSAGE = 'This invite link can’t be used.';
export const INVITE_INTERNAL_MISSING = 'Warehaus internal org is missing.';
/**
 * Convex env. A `clients` document id for the Warehaus row that already
 * stores a real Notion page uuid. Never a page id, and never a stand-in
 * for a row that does not hold one.
 */
export const WAREHAUS_INTERNAL_CLIENT_ID_ENV = 'WAREHAUS_INTERNAL_CLIENT_ID';
export const INVITE_NOTION_UUID_MESSAGE =
  'Warehaus internal client has no Notion page uuid. Nothing was queued.';

// Web Crypto only: Convex's default runtime has no node:crypto.
export async function hashInviteToken(raw: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function createInviteToken(): Promise<{ raw: string; tokenHash: string }> {
  const raw = base64url(crypto.getRandomValues(new Uint8Array(32)));
  return { raw, tokenHash: await hashInviteToken(raw) };
}

export function inviteEmailsMatch(signedInEmail: string, invitedEmail: string): boolean {
  return normalizeEmail(signedInEmail) === normalizeEmail(invitedEmail);
}

export function inviteRateAllows(sentInWindow: number): boolean {
  return sentInWindow < INVITE_DAILY_LIMIT;
}

/** Warehaus staff org, including the slug the seed and the Notion client have both used. */
export function isWarehausInviteClient(input: {
  slug?: string | null;
  externalId?: string | null;
}): boolean {
  return isWarehausInternalClient(input) || input.slug === 'warehaus';
}

/** Dashed, stripped, and the original form. Lookup must hit whichever the row stored. */
export function notionPageIdForms(id: string): string[] {
  const stripped = normalizeNotionId(id);
  if (!/^[0-9a-f]{32}$/.test(stripped)) return [id];
  const dashed = `${stripped.slice(0, 8)}-${stripped.slice(8, 12)}-${stripped.slice(12, 16)}-${stripped.slice(16, 20)}-${stripped.slice(20)}`;
  return [...new Set([id, stripped, dashed])];
}

export type WarehausPageCandidate = {
  id: string;
  slug?: string | null;
  externalId?: string | null;
  notionPageId?: string | null;
  portalAccess?: 'Enabled' | 'Disabled' | null;
  syncHiddenAt?: number | null;
};

function holdsNotionPage(client: WarehausPageCandidate): boolean {
  const pageId = client.notionPageId?.trim() ?? '';
  return pageId.length > 0 && isNotionPageId(pageId);
}

/** Same bar as sync: Enabled, and not soft-hidden. A hidden or disabled client drops the contact on pull. */
function holderBlock(client: WarehausPageCandidate): string | null {
  if (client.syncHiddenAt != null) {
    return 'Warehaus internal client is hidden from sync. Nothing was queued.';
  }
  if (client.portalAccess !== 'Enabled') {
    return 'Warehaus internal client portal access is disabled. Nothing was queued.';
  }
  return null;
}

function isReadyHolder(client: WarehausPageCandidate): boolean {
  return isWarehausInviteClient(client) && holdsNotionPage(client) && holderBlock(client) == null;
}

/**
 * Invite org and Client Company come from the same Warehaus row.
 * The env id may only choose among rows that already store a Notion page uuid.
 */
export function resolveWarehausInviteClient(input: {
  clients: readonly WarehausPageCandidate[];
  configuredClientId?: string | null;
}): { ok: true; orgId: string; notionPageId: string } | { ok: false; message: string } {
  const configured = input.configuredClientId?.trim() ?? '';
  const pageHolders = input.clients.filter(
    (client) => isWarehausInviteClient(client) && holdsNotionPage(client),
  );
  const holders = pageHolders.filter((client) => holderBlock(client) == null);
  if (configured) {
    const named = pageHolders.find((client) => client.id === configured);
    const blocked = named ? holderBlock(named) : null;
    if (blocked) return { ok: false, message: blocked };
    const chosen = holders.find((client) => client.id === configured);
    if (!chosen?.notionPageId) {
      return {
        ok: false,
        message: `${WAREHAUS_INTERNAL_CLIENT_ID_ENV} does not match a Warehaus client with a Notion page uuid. Nothing was queued.`,
      };
    }
    return { ok: true, orgId: chosen.id, notionPageId: chosen.notionPageId.trim() };
  }
  if (holders.length === 1) {
    const chosen = holders[0]!;
    return { ok: true, orgId: chosen.id, notionPageId: chosen.notionPageId!.trim() };
  }
  if (holders.length > 1) {
    return {
      ok: false,
      message: 'More than one Warehaus client has a Notion page uuid. Nothing was queued.',
    };
  }
  const blocked = pageHolders.map((client) => holderBlock(client)).find((message) => message != null);
  if (blocked) return { ok: false, message: blocked };
  const seed = input.clients.find((client) => {
    if (!isWarehausInviteClient(client)) return false;
    const pageId = client.notionPageId ?? '';
    return pageId.startsWith('seed-') || pageId.startsWith('fixture-');
  });
  if (seed?.notionPageId) {
    return {
      ok: false,
      message: `Warehaus internal client page id "${seed.notionPageId}" is not a Notion page uuid. Nothing was queued.`,
    };
  }
  return { ok: false, message: INVITE_NOTION_UUID_MESSAGE };
}

export function warehausHolderOrgIds(clients: readonly WarehausPageCandidate[]): string[] {
  return clients.filter((client) => isReadyHolder(client)).map((client) => client.id);
}

/** Existing staff stay on the slug row. A new invite may use the row that holds the page. */
export function staffInviteOrgAllowed(input: {
  orgId: string | null | undefined;
  legacyOrgId: string | null | undefined;
  holderOrgIds: readonly string[];
}): boolean {
  if (!input.orgId) return false;
  if (input.legacyOrgId && input.orgId === input.legacyOrgId) return true;
  return input.holderOrgIds.includes(input.orgId);
}

/** Every relation id in an invite create body must be a Notion page uuid. */
export function inviteRelationError(properties: Record<string, string | string[]>): string | null {
  for (const [name, value] of Object.entries(properties)) {
    if (!Array.isArray(value)) continue;
    for (const id of value) {
      if (!isNotionPageId(id)) {
        return `${name} must be a Notion page uuid. Nothing was queued.`;
      }
    }
  }
  return null;
}

export function inviteCreatePayloadError(payload: {
  properties: Record<string, string | string[]>;
  clientNotionPageId: string;
}): string | null {
  const relationError = inviteRelationError(payload.properties);
  if (relationError) return relationError;
  if (!isNotionPageId(payload.clientNotionPageId)) {
    return 'Client Company must be a Notion page uuid. Nothing was queued.';
  }
  const companies = payload.properties['Client Company'];
  if (
    !Array.isArray(companies) ||
    companies.length === 0 ||
    companies.some((id) => normalizeNotionId(id) !== normalizeNotionId(payload.clientNotionPageId))
  ) {
    return 'Client Company must be a Notion page uuid. Nothing was queued.';
  }
  return null;
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
  inviteRole: string;
  email: string;
  name: string;
  /** Used only when `resolved` and `clients` are omitted. */
  internalOrgId: string;
  internalNotionPageId: string;
  /** The row create already resolved. Skips a second lookup. */
  resolved?: { orgId: string; notionPageId: string };
  clients?: readonly WarehausPageCandidate[];
  configuredClientId?: string | null;
  sentToday: number;
  emailOwnedByOtherOrg: boolean;
  emailAlreadyMember?: boolean;
}): InvitePlan {
  if (input.role !== 'Warehaus Staff') {
    return { ok: false, clientMessage: 'You cannot send invites' };
  }
  if (input.inviteRole !== 'Warehaus Staff') {
    return { ok: false, clientMessage: INVITE_CLIENT_ROLE_MESSAGE };
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
  if (input.emailAlreadyMember) {
    return {
      ok: false,
      clientMessage: INVITE_ALREADY_MESSAGE,
      staffMessage: `Invite email is already staff or a member: ${emailNormalized}`,
    };
  }
  if (!input.name.trim()) {
    return {
      ok: false,
      clientMessage: INVITE_INTERNAL_MISSING,
      staffMessage: 'Staff invite is missing the warehaus-internal org',
    };
  }
  const resolved = input.resolved
    ? isNotionPageId(input.resolved.notionPageId) && input.resolved.orgId
      ? { ok: true as const, orgId: input.resolved.orgId, notionPageId: input.resolved.notionPageId }
      : { ok: false as const, message: INVITE_NOTION_UUID_MESSAGE }
    : input.clients
      ? resolveWarehausInviteClient({
          clients: input.clients,
          configuredClientId: input.configuredClientId,
        })
      : isNotionPageId(input.internalNotionPageId) && input.internalOrgId
        ? { ok: true as const, orgId: input.internalOrgId, notionPageId: input.internalNotionPageId }
        : { ok: false as const, message: INVITE_NOTION_UUID_MESSAGE };
  if (!resolved.ok) {
    return { ok: false, clientMessage: resolved.message, staffMessage: resolved.message };
  }
  const properties: Record<string, string | string[]> = {
    Name: input.name.trim(),
    Email: emailNormalized,
    Role: 'Warehaus Staff',
    Source: 'portal',
    'Portal Access': 'Disabled',
    'Invite Status': 'Pending',
    'Client Company': [resolved.notionPageId],
  };
  const relationError = inviteRelationError(properties);
  if (relationError) {
    return { ok: false, clientMessage: relationError, staffMessage: relationError };
  }
  return {
    ok: true,
    orgId: resolved.orgId,
    emailNormalized,
    properties,
  };
}

/** Exact flags. Anything other than write-back and email both "true", plus an origin, sends nothing. */
export function inviteSendGate(env: {
  writebackEnabled: boolean;
  emailEnabled: boolean;
  publicUrl: string;
}): { ok: true } | { ok: false; message: string } {
  if (!env.writebackEnabled) return { ok: false, message: WRITEBACK_OFF_ERROR };
  if (!env.emailEnabled) return { ok: false, message: INVITE_EMAIL_OFF_MESSAGE };
  if (!env.publicUrl.trim()) return { ok: false, message: INVITE_URL_OFF_MESSAGE };
  return { ok: true };
}

export type AcceptReason = 'mismatch' | 'unverified' | 'unusable' | 'expired' | 'used' | 'revoked';

export type AcceptPlan =
  | { ok: true; emailNormalized: string }
  | {
      ok: false;
      reason: AcceptReason;
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
  if (input.tokenStatus === 'killed') return { ok: false, reason: 'revoked' };
  if (input.tokenStatus === 'used') return { ok: false, reason: 'used' };
  if (input.tokenStatus === 'expired' || (input.tokenStatus === 'live' && input.expiresAt <= input.now)) {
    return { ok: false, reason: 'expired' };
  }
  if (input.tokenStatus !== 'live') return { ok: false, reason: 'unusable' };
  if (!inviteEmailsMatch(input.signedInEmail, input.tokenEmail)) {
    return { ok: false, reason: 'mismatch', signedInEmail: normalizeEmail(input.signedInEmail) };
  }
  if (input.emailVerified !== true) return { ok: false, reason: 'unverified' };
  return { ok: true, emailNormalized: normalizeEmail(input.signedInEmail) };
}

export function inviteStatusMessage(status: string, signedInEmail?: string): string {
  if (status === 'expired') return INVITE_EXPIRED_MESSAGE;
  if (status === 'used') return INVITE_USED_MESSAGE;
  if (status === 'revoked') return INVITE_REVOKED_MESSAGE;
  if (status === 'different-email') {
    const who = signedInEmail?.trim();
    return who ? `You’re signed in as ${who}. ${INVITE_MISMATCH_MESSAGE}` : INVITE_MISMATCH_MESSAGE;
  }
  if (status === 'already') return INVITE_ALREADY_MESSAGE;
  if (status === 'unverified') return INVITE_UNVERIFIED_MESSAGE;
  if (status === 'off') return WRITEBACK_OFF_ERROR;
  if (status === 'email-off') return INVITE_EMAIL_OFF_MESSAGE;
  if (status === 'url-off') return INVITE_URL_OFF_MESSAGE;
  return INVITE_UNUSABLE_MESSAGE;
}

export type StaffLinkContact = {
  role: string;
  authUserId?: string | null;
  email: string;
};

/**
 * Staff invite acceptance. Not self-serve: a client contact or an existing
 * link refuses. An unlinked staff row is linked; no row means create one
 * after Notion confirms.
 */
export function planStaffInviteLink(input: {
  authUserId: string;
  authEmail: string;
  emailVerified: boolean;
  tokenEmail: string;
  sessionAlreadyLinked: boolean;
  contacts: readonly StaffLinkContact[];
}): { ok: true; mode: 'create' | 'link' } | { ok: false; reason: 'mismatch' | 'unverified' | 'already' } {
  if (!inviteEmailsMatch(input.authEmail, input.tokenEmail)) return { ok: false, reason: 'mismatch' };
  if (input.emailVerified !== true) return { ok: false, reason: 'unverified' };
  if (input.sessionAlreadyLinked) return { ok: false, reason: 'already' };
  const email = normalizeEmail(input.tokenEmail);
  const matches = input.contacts.filter((contact) => normalizeEmail(contact.email) === email);
  for (const contact of matches) {
    if (contact.role !== 'Warehaus Staff') return { ok: false, reason: 'already' };
    if (contact.authUserId) return { ok: false, reason: 'already' };
  }
  return matches.some((contact) => contact.role === 'Warehaus Staff')
    ? { ok: true, mode: 'link' }
    : { ok: true, mode: 'create' };
}

/** Password create is only for a live staff token whose email has no account yet. */
export function planInviteSignup(input: {
  tokenStatus: 'live' | 'pending' | 'used' | 'killed' | 'expired' | 'missing';
  expiresAt: number;
  now: number;
  tokenEmail: string;
  accountExists: boolean;
  staffInvite: boolean;
}): { ok: true; emailNormalized: string } | { ok: false; reason: 'expired' | 'used' | 'unusable' | 'sign-in' | 'not-staff' } {
  const token = planInviteAccept({
    tokenStatus: input.tokenStatus,
    expiresAt: input.expiresAt,
    now: input.now,
    tokenEmail: input.tokenEmail,
    signedInEmail: input.tokenEmail,
    emailVerified: true,
  });
  if (!token.ok) {
    if (token.reason === 'expired') return { ok: false, reason: 'expired' };
    if (token.reason === 'used' || token.reason === 'revoked') return { ok: false, reason: 'used' };
    return { ok: false, reason: 'unusable' };
  }
  if (!input.staffInvite) return { ok: false, reason: 'not-staff' };
  if (input.accountExists) return { ok: false, reason: 'sign-in' };
  return { ok: true, emailNormalized: token.emailNormalized };
}

/** How long a signup permit stays usable. Opening the link is the verification. */
export const INVITE_SIGNUP_PERMIT_MS = 15_000;

export function signupPermitExpiry(now = Date.now()): number {
  return now + INVITE_SIGNUP_PERMIT_MS;
}

/** True only while the row is unexpired and for this email. The caller deletes it. */
export function signupPermitOpen(
  permit: { email: string; expiresAt: number } | null,
  email: string,
  now = Date.now(),
): boolean {
  if (!permit) return false;
  return normalizeEmail(permit.email) === normalizeEmail(email) && permit.expiresAt > now;
}

const ENDED_INVITE_STATUS = new Set(['Expired', 'Revoked', 'Accepted']);

/**
 * A later Notion pull that still says Pending must not revive an invite
 * whose token is expired or otherwise dead.
 */
export function pendingInviteWouldRegress(input: {
  existingStatus: string | null | undefined;
  incomingStatus: string | null | undefined;
  tokens: ReadonlyArray<{ status: string; expiresAt: number }>;
  now: number;
}): boolean {
  if (input.incomingStatus !== 'Pending') return false;
  if (!input.existingStatus || !ENDED_INVITE_STATUS.has(input.existingStatus)) return false;
  const live = input.tokens.some((token) => token.status === 'live' && token.expiresAt > input.now);
  return !live;
}

/** Expired rows stay listed with Resend. Revoke is only for a live pending invite. */
export function teamInviteActions(status: string): { resend: true; revoke: boolean } {
  return { resend: true, revoke: status !== 'Expired' };
}

/** Accept only a Warehaus Staff invite on the internal org. */
export function staffAcceptOrgOk(input: {
  pendingRole: string | null | undefined;
  pendingOrgId: string | null | undefined;
  tokenOrgId: string | null | undefined;
  internalOrgId: string | null | undefined;
  holderOrgIds?: readonly string[];
}): boolean {
  return (
    input.pendingRole === 'Warehaus Staff' &&
    Boolean(input.pendingOrgId) &&
    input.pendingOrgId === input.tokenOrgId &&
    staffInviteOrgAllowed({
      orgId: input.pendingOrgId,
      legacyOrgId: input.internalOrgId,
      holderOrgIds: input.holderOrgIds ?? [],
    })
  );
}

export function liveTokenIsExpired(status: string, expiresAt: number, now: number): boolean {
  return status === 'live' && expiresAt <= now;
}

export type StaffAcceptInvite = {
  email: string;
  role: string;
  inviteStatus: string;
  notionPageId: string;
};

export type StaffAcceptToken = {
  emailNormalized: string;
  status: string;
  contactNotionPageId: string;
};

export type StaffAcceptHold = {
  notionPageId: string;
  inviteStatus: string | null;
  staff: boolean;
  open: boolean;
};

/**
 * True while this email's staff accept is waiting on an open Notion write.
 * Accepted with no open hold does not count. A Pending invite still needs the
 * token held by accept. Decline, revoke, and conflict holds do not count.
 */
export function staffAcceptInProgress(input: {
  email: string;
  invites: readonly StaffAcceptInvite[];
  tokens: readonly StaffAcceptToken[];
  holds: readonly StaffAcceptHold[];
}): boolean {
  const email = normalizeEmail(input.email);
  if (!email.includes('@')) return false;
  return input.invites.some((invite) => {
    if (normalizeEmail(invite.email) !== email || invite.role !== 'Warehaus Staff') return false;
    if (invite.inviteStatus !== 'Pending' && invite.inviteStatus !== 'Accepted') return false;
    const openHold = input.holds.some(
      (hold) =>
        hold.notionPageId === invite.notionPageId &&
        hold.open &&
        hold.staff &&
        hold.inviteStatus === 'Accepted',
    );
    if (!openHold) return false;
    if (invite.inviteStatus === 'Accepted') return true;
    return input.tokens.some(
      (token) =>
        token.contactNotionPageId === invite.notionPageId &&
        normalizeEmail(token.emailNormalized) === email &&
        token.status === 'pending',
    );
  });
}

export function readAcceptHold(
  notionPageId: string,
  kind: string,
  status: string,
  payload: string,
): StaffAcceptHold | null {
  if (kind !== 'setInviteState' || !notionPageId) return null;
  // conflict is not retried. Leaving it open would keep AuthGate waiting.
  const open = status === 'queued' || status === 'inflight' || status === 'done';
  try {
    const parsed = JSON.parse(payload) as {
      properties?: { 'Invite Status'?: string };
      staffLink?: { role?: string };
    };
    return {
      notionPageId,
      inviteStatus: parsed.properties?.['Invite Status'] ?? null,
      staff: parsed.staffLink?.role === 'Warehaus Staff',
      open,
    };
  } catch {
    return null;
  }
}

export function inviteStateProperties(target: 'Accepted' | 'Declined' | 'Expired' | 'Revoked'): Record<string, string> {
  if (target === 'Accepted') return { 'Portal Access': 'Enabled', 'Invite Status': 'Accepted' };
  if (target === 'Revoked') return { 'Portal Access': 'Disabled', 'Invite Status': 'Revoked' };
  if (target === 'Declined') return { 'Invite Status': 'Declined' };
  return { 'Invite Status': 'Expired' };
}

export type ClientInviteRole = 'Client Member' | 'Client Admin';
export type InviteRole = ClientInviteRole | 'Warehaus Staff';

export function asClientInviteRole(role: string): ClientInviteRole | null {
  if (role === 'Client Member' || role === 'Client Admin') return role;
  return null;
}

export function asInviteRole(role: string): InviteRole | null {
  if (role === 'Warehaus Staff') return role;
  return asClientInviteRole(role);
}

/** Notion patch that takes portal access away. Invite Status stays as it is. */
export function memberRemoveProperties(): Record<string, string> {
  return { 'Portal Access': 'Disabled' };
}

/**
 * Staff may remove a client person in their own org.
 * Warehaus Staff and the signed-in contact are refused. Hidden rows are refused.
 */
export function planMemberRemove(input: {
  role: PortalRole;
  contactOrgId: string;
  identityOrgId: string;
  contactRole: string;
  contactId: string;
  actorContactId: string;
  hidden: boolean;
}): { ok: true } | { ok: false; clientMessage: string } {
  if (input.role !== 'Warehaus Staff') {
    return { ok: false, clientMessage: 'You cannot remove this person' };
  }
  if (input.hidden || input.contactOrgId !== input.identityOrgId) {
    return { ok: false, clientMessage: INVITE_CLIENT_FAILURE };
  }
  if (input.contactRole === 'Warehaus Staff' || input.contactId === input.actorContactId) {
    return { ok: false, clientMessage: 'You cannot remove this person' };
  }
  return { ok: true };
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
  | { status: 'unusable' | 'used' | 'revoked'; portalName: 'Portal invite' }
  | { status: 'expired'; portalName: 'Portal invite'; invitedEmail: string }
  | { status: 'sign-in' | 'create-account'; portalName: string; invitedEmail: string }
  | { status: 'different-email'; portalName: string; signedInEmail: string; invitedEmail: string }
  | { status: 'unverified' | 'already' | 'ready'; portalName: string };

/** Staff-invite password. Eight characters, one letter, one number. */
export function invitePasswordReady(password: string): boolean {
  return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

export const INVITE_PASSWORD_MESSAGE = 'Use at least 8 characters, with a letter and a number.';

/** Same sentence for every caller. It does not say whether an account exists. */
export function renewRequestMessage(): string {
  return 'If this invite can be renewed, we’ll email the person who sent it.';
}

/**
 * Dead tokens omit the company. An expired link may show the address on the token,
 * because the person holding the link already has it.
 */
export function describeInvitePreview(input: {
  tokenStatus: 'live' | 'pending' | 'used' | 'killed' | 'expired' | 'missing';
  expiresAt: number;
  now: number;
  companyName: string | null;
  signedInEmail: string | null;
  emailVerified: boolean;
  tokenEmail: string;
  accountExists?: boolean;
  staffInvite?: boolean;
  alreadyMember?: boolean;
}): InvitePreview {
  const dead = planInviteAccept({
    tokenStatus: input.tokenStatus,
    expiresAt: input.expiresAt,
    now: input.now,
    tokenEmail: input.tokenEmail,
    signedInEmail: input.tokenEmail,
    emailVerified: true,
  });
  if (!dead.ok) {
    if (dead.reason === 'expired') {
      return { status: 'expired', portalName: 'Portal invite', invitedEmail: normalizeEmail(input.tokenEmail) };
    }
    if (dead.reason === 'used') return { status: 'used', portalName: 'Portal invite' };
    if (dead.reason === 'revoked') return { status: 'revoked', portalName: 'Portal invite' };
    return { status: 'unusable', portalName: 'Portal invite' };
  }
  const portalName = input.companyName ? `${input.companyName} portal invite` : 'Portal invite';
  const invitedEmail = normalizeEmail(input.tokenEmail);
  if (!input.signedInEmail) {
    if (input.staffInvite && !input.accountExists) {
      return { status: 'create-account', portalName, invitedEmail };
    }
    return { status: 'sign-in', portalName, invitedEmail };
  }
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
      invitedEmail,
    };
  }
  if (!plan.ok && plan.reason === 'unverified') return { status: 'unverified', portalName };
  if (!plan.ok) return { status: 'unusable', portalName: 'Portal invite' };
  if (input.staffInvite && input.alreadyMember) return { status: 'already', portalName };
  return { status: 'ready', portalName };
}

/** Token material is created only when Notion has already confirmed. */
export async function tokenFromConfirmation(input: {
  confirmed: boolean;
  now: number;
}): Promise<{ raw: string; tokenHash: string; expiresAt: number } | null> {
  if (!input.confirmed) return null;
  const created = await createInviteToken();
  return { ...created, expiresAt: input.now + INVITE_EXPIRY_MS };
}
