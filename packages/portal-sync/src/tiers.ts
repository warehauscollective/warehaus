/**
 * Property name → tier maps. Single source of truth for sync worker + CLIENT serializers.
 *
 * Default: any property not named here is NEVER (fail closed).
 * Source: docs/planning/portal-convex/warehaus-portal-field-allowlist.md
 */

import type { SyncInCollectionKey } from './collections';

export type FieldTier = 'CLIENT' | 'SERVER' | 'NEVER';

export type PropertyTierMap = Readonly<Record<string, FieldTier>>;

export const CLIENT_PROPERTY_TIERS = {
  'Company Name': 'CLIENT',
  Slug: 'CLIENT',
  Projects: 'CLIENT',
  Contacts: 'SERVER',
  /** Present live; portal lists docs via Client Docs table, not this edge. */
  'Client Docs': 'NEVER',
  'External ID': 'SERVER',
  Status: 'SERVER',
  'Portal access': 'SERVER',
  'Primary Email': 'SERVER',
  Phone: 'SERVER',
  Source: 'SERVER',
  LastBridgedAt: 'SERVER',
  BridgeDirection: 'NEVER',
  BrainPageId: 'NEVER',
  WarehausPageId: 'NEVER',
  'Publish to Warehaus': 'NEVER',
  'Promote to Brain': 'NEVER',
} as const satisfies PropertyTierMap;

export const PROJECT_PROPERTY_TIERS = {
  Name: 'CLIENT',
  Description: 'CLIENT',
  Status: 'CLIENT',
  Progress: 'CLIENT',
  'Start Date': 'CLIENT',
  'End Date': 'CLIENT',
  'Live URL': 'CLIENT',
  'Figma Link': 'CLIENT',
  'Docs URL': 'CLIENT',
  Stack: 'CLIENT',
  Tasks: 'CLIENT',
  Client: 'SERVER',
  /** Present live; docs listed via Client Docs table filtered by org/project. */
  'Client Docs': 'NEVER',
  'External ID': 'SERVER',
  Type: 'SERVER',
  Archive: 'SERVER',
  Priority: 'SERVER',
  Source: 'SERVER',
  LastBridgedAt: 'SERVER',
  /** Second Brain edge — NEVER traverse / sync this relation. */
  'Ops (Internal)': 'NEVER',
  'Github Repo': 'NEVER',
  'Owner/DRI': 'NEVER',
  BridgeDirection: 'NEVER',
  BrainPageId: 'NEVER',
  WarehausPageId: 'NEVER',
  'Publish to Warehaus': 'NEVER',
  'Promote to Brain': 'NEVER',
} as const satisfies PropertyTierMap;

export const TASK_PROPERTY_TIERS = {
  Name: 'CLIENT',
  Status: 'CLIENT',
  'Is Done': 'CLIENT',
  Date: 'CLIENT',
  Projects: 'SERVER',
  'External ID': 'SERVER',
  Estimate: 'SERVER',
  Priority: 'SERVER',
  Source: 'SERVER',
  LastBridgedAt: 'SERVER',
  Description: 'NEVER',
  'Next Action': 'NEVER',
  'Owner / DRI': 'NEVER',
  'Blocked by': 'NEVER',
  Blocking: 'NEVER',
  'GitHub Issue/PR': 'NEVER',
  'Repo Branch': 'NEVER',
  'Figma Frame': 'NEVER',
  URL: 'NEVER',
  'Legacy Complete': 'NEVER',
  BridgeDirection: 'NEVER',
  BrainPageId: 'NEVER',
  WarehausPageId: 'NEVER',
  'Publish to Warehaus': 'NEVER',
  'Promote to Brain': 'NEVER',
} as const satisfies PropertyTierMap;

export const CONTACT_PROPERTY_TIERS = {
  Name: 'CLIENT',
  Email: 'CLIENT',
  'Auth User ID': 'SERVER',
  'External ID': 'SERVER',
  'Client Company': 'SERVER',
  Role: 'SERVER',
  'Portal Access': 'SERVER',
  Phone: 'SERVER',
  Source: 'SERVER',
  LastBridgedAt: 'SERVER',
  'Internal Notes': 'NEVER',
  'Internal Description': 'NEVER',
  Website: 'NEVER',
  LinkedIn: 'NEVER',
  Instagram: 'NEVER',
  'X / Twitter': 'NEVER',
  'Publish to Warehaus': 'NEVER',
} as const satisfies PropertyTierMap;

export const SHARED_RESOURCE_PROPERTY_TIERS = {
  Name: 'CLIENT',
  Description: 'CLIENT',
  Type: 'CLIENT',
  URL: 'CLIENT',
  File: 'CLIENT',
  Client: 'SERVER',
  Project: 'SERVER',
  'External ID': 'SERVER',
  Source: 'SERVER',
  LastBridgedAt: 'SERVER',
  BridgeDirection: 'NEVER',
  BrainPageId: 'NEVER',
  WarehausPageId: 'NEVER',
  'Publish to Warehaus': 'NEVER',
  'Promote to Brain': 'NEVER',
} as const satisfies PropertyTierMap;

export const CLIENT_DOC_PROPERTY_TIERS = {
  Title: 'CLIENT',
  Summary: 'CLIENT',
  'Doc Type': 'CLIENT',
  Order: 'CLIENT',
  /** Page body is CLIENT with separate block allowlist rules. */
  'Page body content': 'CLIENT',
  Client: 'SERVER',
  Project: 'SERVER',
  'External ID': 'SERVER',
  Status: 'SERVER',
  Source: 'SERVER',
  LastBridgedAt: 'SERVER',
  'Publish to Warehaus': 'NEVER',
} as const satisfies PropertyTierMap;

/**
 * Activity is Convex-native / Notion digest write-out only.
 * No property is CLIENT or SERVER for sync-in.
 */
export const ACTIVITY_SYNC_IN_TIERS = {} as const satisfies PropertyTierMap;

export const PROPERTY_TIERS_BY_DATABASE: Record<SyncInCollectionKey, PropertyTierMap> = {
  clients: CLIENT_PROPERTY_TIERS,
  projects: PROJECT_PROPERTY_TIERS,
  tasks: TASK_PROPERTY_TIERS,
  contacts: CONTACT_PROPERTY_TIERS,
  sharedResources: SHARED_RESOURCE_PROPERTY_TIERS,
  clientDocs: CLIENT_DOC_PROPERTY_TIERS,
};

/** Fail closed: unknown property → NEVER. */
export function classifyProperty(
  database: SyncInCollectionKey,
  propertyName: string,
): FieldTier {
  return PROPERTY_TIERS_BY_DATABASE[database][propertyName] ?? 'NEVER';
}

export function isSyncedTier(tier: FieldTier): boolean {
  return tier === 'CLIENT' || tier === 'SERVER';
}

export function propertiesForTier(
  database: SyncInCollectionKey,
  tier: FieldTier,
): string[] {
  return Object.entries(PROPERTY_TIERS_BY_DATABASE[database])
    .filter(([, t]) => t === tier)
    .map(([name]) => name);
}

/**
 * Schema-drift helper: every live Notion property name must appear in the map.
 * Unknown live props fail CI; map-only props (e.g. synthetic "Page body content") are ok.
 */
export function findUnmappedProperties(
  database: SyncInCollectionKey,
  livePropertyNames: readonly string[],
): string[] {
  const map = PROPERTY_TIERS_BY_DATABASE[database];
  return livePropertyNames.filter((name) => !(name in map));
}
