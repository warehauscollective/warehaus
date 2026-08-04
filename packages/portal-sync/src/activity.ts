/**
 * Activity is Convex-native. Notion receives a digest write-out only.
 * Shipments are dead (D-I). Notion Activity no longer offers Type=shipment;
 * keep filtering it so any legacy rows stay out of client feeds.
 */

export const ACTIVITY_DIGEST_FIELDS = [
  'Name',
  'Summary',
  'Type',
  'Timestamp',
  'Client',
  'Project',
] as const;

/** Types aggregated to counts in the Notion digest (not individual rows). */
export const ACTIVITY_DIGEST_AGGREGATE_TYPES = ['sync', 'exception'] as const;

/** Internal-only types — never shown in client feeds. */
export const ACTIVITY_INTERNAL_TYPES = ['team', 'sync', 'exception', 'shipment'] as const;

/**
 * Client-facing activity types.
 * Brief historically listed shipment|project; shipments are locked dead → project only.
 */
export const ACTIVITY_CLIENT_TYPES = ['project'] as const;

export type ActivityClientType = (typeof ACTIVITY_CLIENT_TYPES)[number];

export function isClientVisibleActivityType(type: string): type is ActivityClientType {
  return (ACTIVITY_CLIENT_TYPES as readonly string[]).includes(type);
}
