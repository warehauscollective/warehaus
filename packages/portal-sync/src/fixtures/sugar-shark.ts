/**
 * Sugar Shark fixture — the client with real Second Brain history.
 * CI must assert zero Brain-sourced content reaches CLIENT payloads.
 */

import { OUT_OF_BOUNDS_COLLECTIONS, PORTAL_COLLECTIONS } from '../collections';

export const SUGAR_SHARK_CLIENT = {
  companyName: 'Sugar Shark',
  slug: 'sugar-shark',
  externalId: 'wh_cli_sugar_shark',
  portalAccess: 'Enabled',
  status: 'Active',
  notionPageId: 'fixture-sugar-shark-client',
} as const;

/**
 * Simulated Projects row that still has Ops (Internal) → Project Ops / Brain.
 * Worker must NEVER traverse these relation targets.
 */
export const SUGAR_SHARK_PROJECT_WITH_BRAIN_EDGE = {
  name: 'Sugar Shark Portal',
  publishToWarehaus: true,
  archive: false,
  types: ['Website'],
  clientRelationIds: [SUGAR_SHARK_CLIENT.notionPageId],
  properties: {
    Name: 'Sugar Shark Portal',
    Description: 'Client-facing project',
    Status: 'In progress',
    Client: [SUGAR_SHARK_CLIENT.notionPageId],
    'External ID': 'wh_prj_sugar_shark_portal',
    Type: ['Website'],
    Archive: false,
    'Publish to Warehaus': true,
    'Ops (Internal)': [
      {
        pageId: 'fixture-ops-page',
        dataSourceId: OUT_OF_BOUNDS_COLLECTIONS.projectOps,
      },
    ],
    'Secret Brain Leak': 'granola transcript text',
    'Primary Email': 'should-not-reach-client@example.com',
  },
  relatedCollections: [
    PORTAL_COLLECTIONS.clients,
    OUT_OF_BOUNDS_COLLECTIONS.projectOps,
    OUT_OF_BOUNDS_COLLECTIONS.granolaNotes,
  ],
} as const;

/** Live-ish property names for schema-drift tests (Projects). */
export const LIVE_PROJECT_PROPERTY_NAMES = [
  'Name',
  'Description',
  'Client',
  'Tasks',
  'Ops (Internal)',
  'Client Docs',
  'Status',
  'Priority',
  'Type',
  'Stack',
  'Start Date',
  'End Date',
  'Progress',
  'Owner/DRI',
  'Live URL',
  'Docs URL',
  'Figma Link',
  'Github Repo',
  'Archive',
  'External ID',
  'Source',
  'BridgeDirection',
  'LastBridgedAt',
  'BrainPageId',
  'WarehausPageId',
  'Publish to Warehaus',
  'Promote to Brain',
] as const;
