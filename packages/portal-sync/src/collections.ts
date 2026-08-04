/**
 * Hardcoded Notion collection IDs for the portal sync boundary.
 * The worker reads exactly these seven and refuses every other relation target.
 *
 * Source: docs/planning/portal-convex/warehaus-portal-agent-brief.md (§4)
 */

/** Parent page that hosts the seven portal databases (Warehaus Databases). */
export const WAREHAUS_PORTAL_PAGE_ID = '3b1ffd60-316b-8099-a796-e5b47113fdc1';

/** Database page ids under the parent (for sharing / docs). Collection ids stay in PORTAL_COLLECTIONS. */
export const PORTAL_DATABASE_PAGE_IDS = {
  clients: 'c59b8f00-d07b-4fb3-8923-d6dbda467794',
  projects: 'da5371e2-77ed-4b98-95ba-4d1fcc23adf9',
  tasks: 'd02c4d14-9fc6-405e-bee2-cd151bd20a61',
  clientDocs: 'eef3f956-ccdb-47be-9791-536ba4b03136',
  sharedResources: 'dbd7746a-d39e-4989-afae-453825a1cb0b',
  contacts: '87d7288c-4ea9-40f0-a6ac-33ed50851d50',
  activity: '847a447c-d512-412e-8631-e41fd4aed318',
} as const;

/** Databases the sync worker may read (Activity is write-out only — listed for boundary checks). */
export const PORTAL_COLLECTIONS = {
  clients: '5165ca6e-352e-45af-8918-98779fd76e61',
  projects: '39947c31-d003-4125-9c32-5e570d4c7e0e',
  tasks: 'f418e8e8-6470-4e12-8207-b45b8ae6d8a5',
  contacts: 'b8e25824-c184-448f-a4fd-32fbf03b3c8a',
  sharedResources: '7215c759-e91b-4fd3-b90d-ac834e5435fc',
  activity: 'd9e9c053-dec7-415b-bb06-ff3f6b71538f',
  clientDocs: '50f364f7-9162-4226-9a01-53464052fd19',
} as const;

export type PortalCollectionKey = keyof typeof PORTAL_COLLECTIONS;

export const PORTAL_COLLECTION_IDS: readonly string[] = Object.values(PORTAL_COLLECTIONS);

/** Sync-in sources: Activity is digest write-out only and must not be pulled as SoT. */
export const SYNC_IN_COLLECTION_KEYS = [
  'clients',
  'projects',
  'tasks',
  'contacts',
  'sharedResources',
  'clientDocs',
] as const satisfies readonly PortalCollectionKey[];

export type SyncInCollectionKey = (typeof SYNC_IN_COLLECTION_KEYS)[number];

/** Out of bounds — refuse relation traversal. Not a denylist for sync; relations must be in-bounds. */
export const OUT_OF_BOUNDS_COLLECTIONS = {
  projectOps: '74122728-5f56-4fa0-89fb-1bed8a70148c',
  brainAreas: 'e59ffd60-316b-82f8-a0e3-07f0de2329da',
  brainNotes: 'ac1ffd60-316b-83d8-b4a6-87ecd16a4937',
  brainResources: 'e51ffd60-316b-8356-ace3-87453234d7b1',
  granolaNotes: '740ffd60-316b-8335-9986-87f96b0da096',
  brainTasks: 'ea0ffd60-316b-8297-a233-87d1441c54e1',
  brainProjects: '820ffd60-316b-83dd-afa9-87a4a26422e9',
} as const;

export const OUT_OF_BOUNDS_COLLECTION_IDS: readonly string[] = Object.values(
  OUT_OF_BOUNDS_COLLECTIONS,
);

/** Normalize Notion IDs (with/without hyphens) for comparison. */
export function normalizeNotionId(id: string): string {
  return id.replace(/-/g, '').toLowerCase();
}

const IN_BOUNDS = new Set(PORTAL_COLLECTION_IDS.map(normalizeNotionId));
const OUT_OF_BOUNDS = new Set(OUT_OF_BOUNDS_COLLECTION_IDS.map(normalizeNotionId));

export function isInBoundsCollection(collectionId: string): boolean {
  return IN_BOUNDS.has(normalizeNotionId(collectionId));
}

export function isOutOfBoundsCollection(collectionId: string): boolean {
  return OUT_OF_BOUNDS.has(normalizeNotionId(collectionId));
}

export function isSyncInCollection(collectionId: string): boolean {
  const norm = normalizeNotionId(collectionId);
  return SYNC_IN_COLLECTION_KEYS.some(
    (key) => normalizeNotionId(PORTAL_COLLECTIONS[key]) === norm,
  );
}

/**
 * Relation targets may only point at the seven portal collections.
 * Project Ops / Second Brain IDs must be refused (log + drop), never followed.
 */
export type RelationTraversal = 'allow' | 'refuse';

export function classifyRelationTarget(targetCollectionId: string): RelationTraversal {
  return isInBoundsCollection(targetCollectionId) ? 'allow' : 'refuse';
}
