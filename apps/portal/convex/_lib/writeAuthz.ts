/**
 * Server-side write authorization (placement plan 6a / 6e).
 * The org always comes from the identity. Arguments cannot choose it.
 */

import { PortalAuthError, type PortalIdentity, type PortalRole } from './identity';

export type PortalWriteDatabase =
  | 'clients'
  | 'projects'
  | 'tasks'
  | 'contacts'
  | 'sharedResources'
  | 'clientDocs'
  | 'activity';

export function requireStaff(identity: PortalIdentity): void {
  if (identity.role !== 'Warehaus Staff') {
    throw new PortalAuthError('Staff role required', 'FORBIDDEN');
  }
}

export function requireClientAdmin(identity: PortalIdentity): void {
  if (identity.role !== 'Client Admin') {
    throw new PortalAuthError('Client Admin role required', 'FORBIDDEN');
  }
}

/**
 * Staff may create any of the six portal databases.
 * A Client Admin may create Contacts only, and only in their own org.
 * Client Members cannot write. Activity creates are rejected for every role.
 */
export function authorizePortalWrite(input: {
  role: PortalRole;
  identityOrgId: string;
  database: PortalWriteDatabase;
  /** Ignored. Present so callers cannot accidentally pass a chosen org through. */
  requestedOrgId?: string;
}): { ok: true; orgId: string } | { ok: false; reason: string } {
  if (input.database === 'activity') {
    return { ok: false, reason: 'Activity has no portal create path' };
  }
  if (input.role === 'Warehaus Staff') {
    return { ok: true, orgId: input.identityOrgId };
  }
  if (input.role === 'Client Admin') {
    if (input.database !== 'contacts') {
      return { ok: false, reason: 'Client Admins can only create contacts' };
    }
    return { ok: true, orgId: input.identityOrgId };
  }
  return { ok: false, reason: 'Client Members cannot write to Notion' };
}

export function assertPortalWrite(input: {
  identity: PortalIdentity;
  database: PortalWriteDatabase;
  requestedOrgId?: string;
}): { orgId: string } {
  const decision = authorizePortalWrite({
    role: input.identity.role,
    identityOrgId: input.identity.orgId,
    database: input.database,
    requestedOrgId: input.requestedOrgId,
  });
  if (!decision.ok) throw new PortalAuthError(decision.reason, 'FORBIDDEN');
  return { orgId: decision.orgId };
}

/** Exact opt-in. Unset, empty, and any other value stay off. */
export function isNotionWritebackEnabled(flag = process.env.NOTION_WRITEBACK_ENABLED): boolean {
  return flag === 'true';
}
