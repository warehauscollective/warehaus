/**
 * Row-level gates — all must pass before a row is eligible to sync.
 * Source: docs/planning/portal-convex/warehaus-portal-field-allowlist.md
 */

export type GateResult = { ok: true } | { ok: false; reason: string };

function fail(reason: string): GateResult {
  return { ok: false, reason };
}

function pass(): GateResult {
  return { ok: true };
}

export type ClientGateInput = {
  portalAccess: string | null | undefined;
};

/** Clients: `Portal access` = Enabled */
export function clientRowPassesGate(row: ClientGateInput): GateResult {
  if (row.portalAccess !== 'Enabled') {
    return fail(`Portal access is ${JSON.stringify(row.portalAccess)}, expected Enabled`);
  }
  return pass();
}

export type ProjectGateInput = {
  publishToWarehaus: boolean;
  clientRelationIds: readonly string[];
  archive: boolean;
  /** Multi-select Type values */
  types: readonly string[];
};

/**
 * Projects: Publish AND Client not empty AND Archive=false AND Type ∌ Internal
 */
export function projectRowPassesGate(row: ProjectGateInput): GateResult {
  if (!row.publishToWarehaus) return fail('Publish to Warehaus is false');
  if (row.clientRelationIds.length === 0) return fail('Client relation is empty');
  if (row.archive) return fail('Archive is true');
  if (row.types.includes('Internal')) return fail('Type contains Internal');
  return pass();
}

export type TaskGateInput = {
  publishToWarehaus: boolean;
  projectRelationIds: readonly string[];
  /** Parent project(s) must already pass projectRowPassesGate */
  parentProjectPassesGate: boolean;
};

/**
 * Tasks: Publish AND Projects not empty AND parent project passes its gate.
 */
export function taskRowPassesGate(row: TaskGateInput): GateResult {
  if (!row.publishToWarehaus) return fail('Publish to Warehaus is false');
  if (row.projectRelationIds.length === 0) return fail('Projects relation is empty');
  if (!row.parentProjectPassesGate) {
    return fail('Parent project does not pass Projects gate');
  }
  return pass();
}

export type ContactGateInput = {
  portalAccess: string | null | undefined;
  clientCompanyRelationIds: readonly string[];
};

/** Contacts: Portal Access = Enabled AND Client Company not empty */
export function contactRowPassesGate(row: ContactGateInput): GateResult {
  if (row.portalAccess !== 'Enabled') {
    return fail(`Portal Access is ${JSON.stringify(row.portalAccess)}, expected Enabled`);
  }
  if (row.clientCompanyRelationIds.length === 0) {
    return fail('Client Company relation is empty');
  }
  return pass();
}

export type SharedResourceGateInput = {
  publishToWarehaus: boolean;
  clientRelationIds: readonly string[];
  projectRelationIds: readonly string[];
  /** When both Client and Project set, project must belong to that client */
  projectClientId?: string | null;
};

/**
 * Shared Resources: Publish AND (Client or Project not empty).
 * If both Client and Project set and they disagree → quarantine (not ok).
 */
export function sharedResourceRowPassesGate(row: SharedResourceGateInput): GateResult {
  if (!row.publishToWarehaus) return fail('Publish to Warehaus is false');
  const hasClient = row.clientRelationIds.length > 0;
  const hasProject = row.projectRelationIds.length > 0;
  if (!hasClient && !hasProject) {
    return fail('Client and Project relations are both empty');
  }
  if (hasClient && hasProject) {
    const clientId = row.clientRelationIds[0];
    if (row.projectClientId != null && row.projectClientId !== clientId) {
      return fail('Client and Project tenancy disagree — quarantine');
    }
  }
  return pass();
}

export type ClientDocGateInput = {
  status: string | null | undefined;
  publishToWarehaus: boolean;
  clientRelationIds: readonly string[];
};

/** Client Docs: Status = Published AND Publish AND Client not empty */
export function clientDocRowPassesGate(row: ClientDocGateInput): GateResult {
  if (row.status !== 'Published') {
    return fail(`Status is ${JSON.stringify(row.status)}, expected Published`);
  }
  if (!row.publishToWarehaus) return fail('Publish to Warehaus is false');
  if (row.clientRelationIds.length === 0) return fail('Client relation is empty');
  return pass();
}
