/**
 * What the pull should do when a Notion row no longer passes its gate.
 * Soft-hide keeps the Convex copy so a later passing pull can show it again.
 */

export type SyncTable =
  | 'clients'
  | 'contacts'
  | 'projects'
  | 'tasks'
  | 'sharedResources'
  | 'clientDocs';

export type HideReason = 'gate' | 'ancestor' | 'trashed';

export type ContactRole = 'Client Admin' | 'Client Member' | 'Warehaus Staff';

export type VisibilityDecision =
  | { action: 'show' }
  | {
      action: 'hide';
      reason: HideReason;
      detail: string;
      revokeSessions: boolean;
      cascade: 'none' | 'client-children' | 'project-tasks';
    }
  | {
      action: 'store-hidden';
      reason: 'ancestor';
      detail: string;
      revokeSessions: boolean;
      cascade: 'none' | 'project-tasks';
    }
  | {
      action: 'quarantine';
      reason: string;
      hideExisting: true;
      revokeSessions: boolean;
      cascade: 'none' | 'client-children' | 'project-tasks';
    };

function cascadeFor(table: SyncTable): 'none' | 'client-children' | 'project-tasks' {
  if (table === 'clients') return 'client-children';
  if (table === 'projects') return 'project-tasks';
  return 'none';
}

function revokeSessions(table: SyncTable, role: ContactRole | undefined, ancestor: boolean): boolean {
  if (table !== 'contacts') return false;
  if (ancestor && role === 'Warehaus Staff') return false;
  return true;
}

/**
 * Gate failure, trash, and a concealed parent hide the Convex copy.
 * Portal access Disabled is not a gate failure for a client.
 * A passing row whose parent client is concealed is stored hidden (`ancestor`).
 * `parentStaffVisible` is omitted for the client table itself.
 * Child pulls pass `clientIsStaffVisible` so a Disabled client keeps
 * contacts, projects, tasks, shared resources, and client docs on the staff
 * roster. Client users still use `isOrgVisibleToClients`.
 */
export function decideSyncedRowVisibility(input: {
  table: SyncTable;
  disposition: 'upsert' | 'skip' | 'quarantine';
  dispositionReason?: string;
  archived?: boolean;
  inTrash?: boolean;
  parentStaffVisible?: boolean;
  parentProjectVisible?: boolean;
  contactRole?: ContactRole;
}): VisibilityDecision {
  if (input.inTrash || input.archived) {
    return {
      action: 'hide',
      reason: 'trashed',
      detail: input.inTrash ? 'Notion page is in the trash' : 'Notion page is archived',
      revokeSessions: revokeSessions(input.table, input.contactRole, false),
      cascade: cascadeFor(input.table),
    };
  }

  if (input.disposition === 'quarantine') {
    return {
      action: 'quarantine',
      reason: input.dispositionReason ?? 'quarantine',
      hideExisting: true,
      revokeSessions: revokeSessions(input.table, input.contactRole, false),
      cascade: cascadeFor(input.table),
    };
  }

  if (input.disposition === 'skip') {
    return {
      action: 'hide',
      reason: 'gate',
      detail: input.dispositionReason ?? 'Row failed its portal gate',
      revokeSessions: revokeSessions(input.table, input.contactRole, false),
      cascade: cascadeFor(input.table),
    };
  }

  if (input.parentStaffVisible === false) {
    return {
      action: 'store-hidden',
      reason: 'ancestor',
      detail: 'Parent client is not staff-visible',
      revokeSessions: revokeSessions(input.table, input.contactRole, true),
      cascade: input.table === 'projects' ? 'project-tasks' : 'none',
    };
  }

  if (input.table === 'tasks' && input.parentProjectVisible === false) {
    return {
      action: 'store-hidden',
      reason: 'ancestor',
      detail: 'Parent project is not client-visible',
      revokeSessions: false,
      cascade: 'none',
    };
  }

  return { action: 'show' };
}

/** Client lists omit rows the pull has soft-hidden. Missing means visible. */
export function isClientSurfaceVisible(row: { syncHiddenAt?: number | null }): boolean {
  return row.syncHiddenAt == null;
}

/**
 * Staff still see child rows when the client row itself is not concealed.
 * Portal access Disabled does not conceal it. Trash, archive, and quarantine do.
 * `portalAccess` is accepted so a client row can be passed to both this and
 * `isOrgVisibleToClients`. It does not affect the result.
 */
export function clientIsStaffVisible(
  client:
    | { portalAccess?: 'Enabled' | 'Disabled'; syncHiddenAt?: number | null }
    | null
    | undefined,
): boolean {
  return !!client && isClientSurfaceVisible(client);
}

/**
 * A contact that passes its own gate stays on the staff roster when the
 * client is Disabled but not concealed. Invite placement still requires
 * portal access Enabled. An unverified Accepted status stays concealed.
 */
export function contactStaysStaffVisible(input: {
  disposition: 'upsert' | 'skip' | 'quarantine';
  parentStaffVisible: boolean;
  effectivePortalAccess: 'Enabled' | 'Disabled';
  inviteStatus?: string | null;
  unverifiedAcceptance: boolean;
}): boolean {
  if (!input.parentStaffVisible) return false;
  if (input.disposition !== 'upsert') return false;
  if (input.unverifiedAcceptance) return false;
  if (input.effectivePortalAccess !== 'Enabled') return false;
  return input.inviteStatus == null || input.inviteStatus === 'Accepted';
}

export function isOrgVisibleToClients(
  client: { portalAccess: 'Enabled' | 'Disabled'; syncHiddenAt?: number | null } | null | undefined,
): boolean {
  return !!client && client.portalAccess === 'Enabled' && isClientSurfaceVisible(client);
}
