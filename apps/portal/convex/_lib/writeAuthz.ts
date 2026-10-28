/**
 * Server-side write authorization.
 * B0 writes are Warehaus Staff only. Client Admin contact creates are the
 * invite batch, not this one. The org always comes from the identity.
 * Arguments cannot choose it.
 */

import { isNotionWritebackEnabled as writebackFlagIsOn } from '@warehaus/portal-sync';
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

/**
 * Staff may enqueue a write for any of the six portal databases.
 * Client Admins and Client Members cannot. Activity is rejected for every role.
 * `requestedOrgId` is ignored so callers cannot pass a chosen org through.
 */
export function authorizePortalWrite(input: {
  role: PortalRole;
  identityOrgId: string;
  database: PortalWriteDatabase;
  requestedOrgId?: string;
}): { ok: true; orgId: string } | { ok: false; reason: string } {
  if (input.database === 'activity') {
    return { ok: false, reason: 'Activity has no portal create path' };
  }
  if (input.role === 'Warehaus Staff') {
    return { ok: true, orgId: input.identityOrgId };
  }
  return { ok: false, reason: 'Only Warehaus Staff can write to Notion' };
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
  return writebackFlagIsOn(flag);
}
