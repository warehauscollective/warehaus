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

export function selectContactForJoin(input: {
  email: string;
  authUserId: string;
  contacts: readonly JoinContactCandidate[];
}): JoinContactCandidate {
  const email = normalizeEmail(input.email);
  const matches = input.contacts.filter((c) => normalizeEmail(c.email) === email);

  if (matches.length === 0) {
    throw new PortalAuthError(
      'No portal contact found for this email. Ask Warehaus to enable access.',
      'NO_CONTACT',
    );
  }

  if (matches.length > 1) {
    throw new PortalAuthError(
      'Multiple contacts share this email — fix in Notion before joining.',
      'FORBIDDEN',
    );
  }

  const contact = matches[0]!;

  if (contact.portalAccess !== 'Enabled') {
    throw new PortalAuthError('Portal access is disabled for this contact', 'PORTAL_DISABLED');
  }

  if (
    contact.authUserId &&
    contact.authUserId !== input.authUserId
  ) {
    throw new PortalAuthError(
      'This contact is already linked to a different login',
      'FORBIDDEN',
    );
  }

  return contact;
}

export function assertJoinClient(client: JoinClientCandidate | null, role: PortalRole): JoinClientCandidate {
  if (!client) {
    throw new PortalAuthError('Contact has no client company', 'NO_CONTACT');
  }
  if (role !== 'Warehaus Staff' && client.portalAccess !== 'Enabled') {
    throw new PortalAuthError('Client portal access is disabled', 'PORTAL_DISABLED');
  }
  return client;
}

/** Generate wh_con_* when Notion External ID is empty. */
export function ensureContactExternalId(existing: string | null | undefined, contactId: string): string {
  if (existing && existing.startsWith('wh_con_')) return existing;
  const slug = contactId.replace(/[^a-zA-Z0-9]/g, '').slice(-12).toLowerCase() || 'new';
  return `wh_con_${slug}`;
}
