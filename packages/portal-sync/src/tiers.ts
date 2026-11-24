/**
 * Property name → tier maps, derived from the property schemas in notionSchema.ts.
 *
 * Default: any property not named here is NEVER (fail closed).
 * Source: docs/planning/portal-convex/warehaus-portal-field-allowlist.md
 */

import type { SyncInCollectionKey } from './collections';
import {
  CLIENT_DOC_SCHEMA,
  CLIENT_SCHEMA,
  CONTACT_SCHEMA,
  PROJECT_SCHEMA,
  SHARED_RESOURCE_SCHEMA,
  TASK_SCHEMA,
  type FieldTier,
  type PropertySchema,
} from './notionSchema';

export type { FieldTier };

export type PropertyTierMap = Readonly<Record<string, FieldTier>>;

/** Name to tier, read off a property schema. */
function tiersOf<S extends PropertySchema>(schema: S): { readonly [K in keyof S]: S[K]['tier'] } {
  return Object.fromEntries(Object.entries(schema).map(([name, spec]) => [name, spec.tier])) as {
    readonly [K in keyof S]: S[K]['tier'];
  };
}

export const CLIENT_PROPERTY_TIERS = tiersOf(CLIENT_SCHEMA);

export const PROJECT_PROPERTY_TIERS = tiersOf(PROJECT_SCHEMA);

export const TASK_PROPERTY_TIERS = tiersOf(TASK_SCHEMA);

export const CONTACT_PROPERTY_TIERS = tiersOf(CONTACT_SCHEMA);

export const SHARED_RESOURCE_PROPERTY_TIERS = tiersOf(SHARED_RESOURCE_SCHEMA);

export const CLIENT_DOC_PROPERTY_TIERS = tiersOf(CLIENT_DOC_SCHEMA);

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
