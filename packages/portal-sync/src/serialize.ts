/**
 * Split synced property bags into Convex-store vs CLIENT-safe payloads.
 * SERVER fields sync to Convex but never leave the backend in client queries.
 */

import type { SyncInCollectionKey } from './collections';
import {
  PROPERTY_TIERS_BY_DATABASE,
  classifyProperty,
  isSyncedTier,
  type FieldTier,
} from './tiers';

export type DroppedProperty = {
  name: string;
  tier: FieldTier;
  reason: 'never' | 'unknown' | 'server-stripped-for-client';
};

export type SyncPartition<T = unknown> = {
  /** CLIENT + SERVER — what the worker may write to Convex */
  forConvex: Record<string, T>;
  /** CLIENT only — what a client-scoped query may return */
  forClient: Record<string, T>;
  dropped: DroppedProperty[];
};

/**
 * Partition a raw Notion property bag by allowlist tiers.
 * Unknown keys → NEVER (dropped from both).
 */
export function partitionProperties<T = unknown>(
  database: SyncInCollectionKey,
  properties: Readonly<Record<string, T>>,
): SyncPartition<T> {
  const forConvex: Record<string, T> = {};
  const forClient: Record<string, T> = {};
  const dropped: DroppedProperty[] = [];
  const map = PROPERTY_TIERS_BY_DATABASE[database];

  for (const [name, value] of Object.entries(properties)) {
    const known = Object.prototype.hasOwnProperty.call(map, name);
    const tier = classifyProperty(database, name);

    if (!isSyncedTier(tier)) {
      dropped.push({
        name,
        tier: 'NEVER',
        reason: known ? 'never' : 'unknown',
      });
      continue;
    }

    forConvex[name] = value;
    if (tier === 'CLIENT') {
      forClient[name] = value;
    }
  }

  return { forConvex, forClient, dropped };
}

/**
 * Strip a Convex-stored bag down to CLIENT fields for browser payloads.
 * Also records SERVER keys that were present so callers can assert they never leak.
 */
export function serializeForClient<T = unknown>(
  database: SyncInCollectionKey,
  convexRow: Readonly<Record<string, T>>,
): { client: Record<string, T>; stripped: DroppedProperty[] } {
  const client: Record<string, T> = {};
  const stripped: DroppedProperty[] = [];

  for (const [name, value] of Object.entries(convexRow)) {
    const tier = classifyProperty(database, name);
    if (tier === 'CLIENT') {
      client[name] = value;
      continue;
    }
    if (tier === 'SERVER') {
      stripped.push({
        name,
        tier: 'SERVER',
        reason: 'server-stripped-for-client',
      });
      continue;
    }
    stripped.push({
      name,
      tier: 'NEVER',
      reason: Object.prototype.hasOwnProperty.call(
        PROPERTY_TIERS_BY_DATABASE[database],
        name,
      )
        ? 'never'
        : 'unknown',
    });
  }

  return { client, stripped };
}

/** Hosts that must never appear in CLIENT file/image URLs. */
export const FORBIDDEN_FILE_HOST_PATTERNS = [
  /amazonaws\.com/i,
  /notion\.so/i,
  /notion\.com/i,
  /secure\.notion-static\.com/i,
] as const;

export function assertNoForbiddenFileHosts(url: string): boolean {
  return !FORBIDDEN_FILE_HOST_PATTERNS.some((re) => re.test(url));
}
