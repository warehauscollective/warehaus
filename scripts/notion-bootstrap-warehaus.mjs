#!/usr/bin/env node
/**
 * Create Warehaus Notion databases (Clients, Projects, Tasks, Activity, Shared Resources)
 * under a parent page shared with the Warehaus integration.
 *
 * Shipments are dead (D-I) — not created by this bootstrap.
 *
 * Usage:
 *   NOTION_WAREHAUS_TOKEN=... NOTION_WAREHAUS_PARENT_PAGE_ID=... node scripts/notion-bootstrap-warehaus.mjs
 *   Optional: --write-env apps/portal/.env.local
 */
import { Client } from '@notionhq/client';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const token = process.env.NOTION_WAREHAUS_TOKEN?.trim();
const parentPageId = process.env.NOTION_WAREHAUS_PARENT_PAGE_ID?.trim();
const writeEnvIdx = process.argv.indexOf('--write-env');
const writeEnvPath =
  writeEnvIdx >= 0 ? resolve(process.argv[writeEnvIdx + 1] || 'apps/portal/.env.local') : null;

if (!token || !parentPageId) {
  console.error(
    'Missing NOTION_WAREHAUS_TOKEN or NOTION_WAREHAUS_PARENT_PAGE_ID.\n' +
      'Create an integration at https://www.notion.so/my-integrations, share a parent page, then re-run.',
  );
  process.exit(1);
}

const SOURCE_OPTIONS = ['motoko', 'portal', 'notion-ui', 'bridge', 'arc'];
const BRIDGE_DIRECTION_OPTIONS = ['none', 'brain-to-warehaus', 'warehaus-to-brain'];

function selectOptions(names) {
  return { select: { options: names.map((name) => ({ name })) } };
}

function bridgeProps() {
  return {
    Source: selectOptions(SOURCE_OPTIONS),
    BrainPageId: { rich_text: {} },
    WarehausPageId: { rich_text: {} },
    LastBridgedAt: { date: {} },
    BridgeDirection: selectOptions(BRIDGE_DIRECTION_OPTIONS),
    'Publish to Warehaus': { checkbox: {} },
    'Promote to Brain': { checkbox: {} },
  };
}

const client = new Client({ auth: token });

async function createDb(title, properties) {
  const db = await client.databases.create({
    parent: { type: 'page_id', page_id: parentPageId },
    title: [{ type: 'text', text: { content: title } }],
    properties,
  });
  console.log(`Created ${title}: ${db.id}`);
  return db.id;
}

const ids = {};

ids.clients = await createDb('Clients', {
  Name: { title: {} },
  'External ID': { rich_text: {} },
  Slug: { rich_text: {} },
  Status: selectOptions(['Active', 'Prospect', 'Paused']),
  'Portal access': selectOptions(['Enabled', 'Disabled']),
  Contacts: { rich_text: {} },
  ...bridgeProps(),
});

ids.projects = await createDb('Projects', {
  Name: { title: {} },
  'External ID': { rich_text: {} },
  Client: {
    relation: {
      database_id: ids.clients,
      single_property: {},
    },
  },
  Phase: selectOptions(['Discovery', 'Design', 'Build', 'Shipped']),
  Owner: { rich_text: {} },
  Due: { date: {} },
  Visibility: selectOptions(['Internal', 'Client']),
  ...bridgeProps(),
});

ids.tasks = await createDb('Tasks', {
  Name: { title: {} },
  'External ID': { rich_text: {} },
  Project: {
    relation: { database_id: ids.projects, single_property: {} },
  },
  Status: selectOptions(['Todo', 'Doing', 'Done', 'Blocked']),
  Assignee: { rich_text: {} },
  Priority: selectOptions(['Low', 'Med', 'High']),
  ...bridgeProps(),
});

ids.activity = await createDb('Activity', {
  Name: { title: {} },
  'External ID': { rich_text: {} },
  // shipment type removed — Convex-native activity; client feeds are project-only
  Type: selectOptions(['project', 'team', 'sync', 'exception']),
  Summary: { rich_text: {} },
  Timestamp: { date: {} },
  Tone: selectOptions(['success', 'warn', 'danger', 'accent', 'muted']),
  'Sync status': selectOptions(['ok', 'pending', 'error', 'stale']),
  Client: {
    relation: { database_id: ids.clients, single_property: {} },
  },
  Project: {
    relation: { database_id: ids.projects, single_property: {} },
  },
  Source: selectOptions(SOURCE_OPTIONS),
});

ids.resources = await createDb('Shared Resources', {
  Name: { title: {} },
  URL: { url: {} },
  Type: selectOptions([
    'Image',
    'Social Media Post',
    'Podcast',
    'Course',
    'Video',
    'PDF',
    'Article',
  ]),
  Description: { rich_text: {} },
  Client: {
    relation: { database_id: ids.clients, single_property: {} },
  },
  Project: {
    relation: { database_id: ids.projects, single_property: {} },
  },
  ...bridgeProps(),
});

const envBlock = [
  `NOTION_WAREHAUS_TOKEN=${token}`,
  `NOTION_WAREHAUS_CLIENTS_DB_ID=${ids.clients}`,
  `NOTION_WAREHAUS_PROJECTS_DB_ID=${ids.projects}`,
  `NOTION_WAREHAUS_TASKS_DB_ID=${ids.tasks}`,
  `NOTION_WAREHAUS_ACTIVITY_DB_ID=${ids.activity}`,
  `NOTION_WAREHAUS_RESOURCES_DB_ID=${ids.resources}`,
].join('\n');

console.log('\n# Add to apps/portal/.env.local (legacy DB id envs — live sync uses portal-sync collection IDs):\n');
console.log(envBlock);

if (writeEnvPath) {
  let existing = '';
  if (existsSync(writeEnvPath)) existing = readFileSync(writeEnvPath, 'utf8');
  const next = `${existing.trim()}\n\n# Warehaus Notion (bootstrap)\n${envBlock}\n`;
  writeFileSync(writeEnvPath, next);
  console.log(`\nWrote env keys to ${writeEnvPath}`);
}

console.log(
  '\nDone. Share these databases only with the Warehaus integration (not Motoko Brain).',
);
console.log(
  'Portal sync: set NOTION_WAREHAUS_TOKEN on Convex and use @warehaus/portal-sync collection IDs.',
);
