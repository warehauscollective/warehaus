/**
 * Portal identity + tenancy guards.
 * Pure helpers are unit-tested; Convex wrappers call into these.
 */

export type PortalRole = 'Client Admin' | 'Client Member' | 'Warehaus Staff';

export type PortalIdentity = {
  authUserId: string;
  contactId: string;
  orgId: string;
  orgSlug: string;
  role: PortalRole;
  portalAccess: 'Enabled' | 'Disabled';
  name: string;
  email: string;
};

export class PortalAuthError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'UNAUTHENTICATED'
      | 'NO_CONTACT'
      | 'PORTAL_DISABLED'
      | 'HOST_MISMATCH'
      | 'FORBIDDEN',
  ) {
    super(message);
    this.name = 'PortalAuthError';
  }
}

export function isStaff(identity: PortalIdentity): boolean {
  return identity.role === 'Warehaus Staff';
}

export function isClientRole(identity: PortalIdentity): boolean {
  return identity.role === 'Client Admin' || identity.role === 'Client Member';
}

/** D1: Host slug must match session org (fail closed). Staff may browse any host. */
export function assertHostMatchesOrg(
  identity: PortalIdentity,
  hostSlug: string | null | undefined,
): void {
  if (hostSlug == null || hostSlug === '') return;
  if (isStaff(identity)) return;
  if (identity.orgSlug !== hostSlug) {
    throw new PortalAuthError(
      `Host slug "${hostSlug}" does not match session org "${identity.orgSlug}"`,
      'HOST_MISMATCH',
    );
  }
}

export function assertPortalAccess(identity: PortalIdentity): void {
  if (identity.portalAccess !== 'Enabled') {
    throw new PortalAuthError('Portal access is disabled for this contact', 'PORTAL_DISABLED');
  }
}

export function assertClientScope(
  identity: PortalIdentity,
  rowOrgId: string,
): void {
  if (isStaff(identity)) return;
  if (identity.orgId !== rowOrgId) {
    throw new PortalAuthError('Cross-org access denied', 'FORBIDDEN');
  }
}

/**
 * Foreign-org filter: client identities only keep rows for their org.
 * Staff keep all rows (admin path). Used by CI / pure tests.
 */
export function filterRowsForIdentity<T extends { orgId: string }>(
  identity: PortalIdentity,
  rows: readonly T[],
): T[] {
  if (isStaff(identity)) return [...rows];
  return rows.filter((row) => row.orgId === identity.orgId);
}

export type ContactRecord = {
  _id: string;
  orgId: string;
  name: string;
  email: string;
  authUserId?: string;
  role: PortalRole;
  portalAccess: 'Enabled' | 'Disabled';
};

export type ClientRecord = {
  _id: string;
  slug: string;
  portalAccess: 'Enabled' | 'Disabled';
};

/**
 * Resolve session auth user → Contact → org.
 * Contact join is the tenancy source of truth (Better Auth user id on Contact).
 */
export function resolveIdentityFromContact(input: {
  authUserId: string;
  contact: ContactRecord | null;
  client: ClientRecord | null;
}): PortalIdentity {
  if (!input.contact) {
    throw new PortalAuthError('No portal contact linked to this user', 'NO_CONTACT');
  }
  if (input.contact.authUserId && input.contact.authUserId !== input.authUserId) {
    throw new PortalAuthError('Contact auth user mismatch', 'FORBIDDEN');
  }
  if (input.contact.portalAccess !== 'Enabled') {
    throw new PortalAuthError('Portal access is disabled for this contact', 'PORTAL_DISABLED');
  }
  if (!input.client) {
    throw new PortalAuthError('Contact org client missing', 'NO_CONTACT');
  }
  if (
    input.contact.role !== 'Warehaus Staff' &&
    input.client.portalAccess !== 'Enabled'
  ) {
    throw new PortalAuthError('Client portal access is disabled', 'PORTAL_DISABLED');
  }

  return {
    authUserId: input.authUserId,
    contactId: input.contact._id,
    orgId: input.contact.orgId,
    orgSlug: input.client.slug,
    role: input.contact.role,
    portalAccess: input.contact.portalAccess,
    name: input.contact.name,
    email: input.contact.email,
  };
}
