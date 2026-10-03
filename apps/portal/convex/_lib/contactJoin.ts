/**
 * Pure Contact ↔ Better Auth join rules (unit-tested).
 * On first login: match Contact by email, require Portal Access + Client Company,
 * then bind authUserId.
 */

import { PortalAuthError, type PortalRole } from './identity';

export type JoinContactCandidate = {
  _id: string;
  orgId: string;
  email: string;
  name: string;
  role: PortalRole;
  portalAccess: 'Enabled' | 'Disabled';
  authUserId?: string | null;
  /** Set when the pull has soft-hidden this contact. */
  syncHiddenAt?: number | null;
  notionPageId: string;
  externalId?: string | null;
};

export type JoinClientCandidate = {
  _id: string;
  slug: string;
  portalAccess: 'Enabled' | 'Disabled';
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Shown for every self-serve refusal. Does not say why. */
export const CANT_REGISTER_MESSAGE =
  "This email can't register here. Contact your Warehaus team.";

export function selectContactForJoin(input: {
  email: string;
  authUserId: string;
  /** Better Auth `emailVerified`. Unverified users cannot bind a contact. */
  emailVerified: boolean;
  contacts: readonly JoinContactCandidate[];
}): JoinContactCandidate {
  if (input.emailVerified !== true) {
    throw new PortalAuthError(
      'Verify your email before this contact can be linked',
      'FORBIDDEN',
    );
  }

  const email = normalizeEmail(input.email);
  const matches = input.contacts.filter((c) => normalizeEmail(c.email) === email);

  if (matches.length === 0) {
    throw new PortalAuthError(CANT_REGISTER_MESSAGE, 'NO_CONTACT');
  }

  if (matches.length > 1) {
    throw new PortalAuthError(CANT_REGISTER_MESSAGE, 'FORBIDDEN');
  }

  const contact = matches[0]!;

  // Staff contacts are linked by hand. An existing link to this user may continue.
  if (contact.role === 'Warehaus Staff' && contact.authUserId !== input.authUserId) {
    throw new PortalAuthError(CANT_REGISTER_MESSAGE, 'FORBIDDEN');
  }

  if (contact.syncHiddenAt != null) {
    throw new PortalAuthError('Portal access is disabled for this contact', 'PORTAL_DISABLED');
  }

  if (contact.portalAccess !== 'Enabled') {
    throw new PortalAuthError(CANT_REGISTER_MESSAGE, 'PORTAL_DISABLED');
  }

  if (contact.authUserId && contact.authUserId !== input.authUserId) {
    throw new PortalAuthError(CANT_REGISTER_MESSAGE, 'FORBIDDEN');
  }

  return contact;
}

export function assertJoinClient(client: JoinClientCandidate | null, role: PortalRole): JoinClientCandidate {
  if (!client) {
    throw new PortalAuthError(CANT_REGISTER_MESSAGE, 'NO_CONTACT');
  }
  if (role !== 'Warehaus Staff' && client.portalAccess !== 'Enabled') {
    throw new PortalAuthError(CANT_REGISTER_MESSAGE, 'PORTAL_DISABLED');
  }
  return client;
}

/** Generate wh_con_* when Notion External ID is empty. */
export function ensureContactExternalId(existing: string | null | undefined, contactId: string): string {
  if (existing && existing.startsWith('wh_con_')) return existing;
  const slug = contactId.replace(/[^a-zA-Z0-9]/g, '').slice(-12).toLowerCase() || 'new';
  return `wh_con_${slug}`;
}
