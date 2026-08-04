#!/usr/bin/env node
/**
 * Add Clients.Slug property (if missing) and backfill seed slugs.
 * Notion API v5: schema + query go through data_sources.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from '@notionhq/client';

const envPath = resolve('apps/portal/.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const token = process.env.NOTION_WAREHAUS_TOKEN?.trim();
const clientsDbId = process.env.NOTION_WAREHAUS_CLIENTS_DB_ID?.trim();
if (!token || !clientsDbId) {
  console.error('Missing NOTION_WAREHAUS_TOKEN or NOTION_WAREHAUS_CLIENTS_DB_ID');
  process.exit(1);
}

const SLUGS = {
  'CLI-001': 'client-portal',
  'CLI-002': 'warehaus-internal',
};

const notion = new Client({ auth: token });

const db = await notion.databases.retrieve({ database_id: clientsDbId });
const dataSourceId =
  ('data_sources' in db && Array.isArray(db.data_sources) && db.data_sources[0]?.id) ||
  clientsDbId;

const ds = await notion.dataSources.retrieve({ data_source_id: dataSourceId });
const props = ds.properties ?? {};
if (!props.Slug) {
  await notion.dataSources.update({
    data_source_id: dataSourceId,
    properties: { Slug: { rich_text: {} } },
  });
  console.log('Added Slug property to Clients data source', dataSourceId);
} else {
  console.log('Slug property already present');
}

let cursor;
let updated = 0;
do {
  const page = await notion.dataSources.query({
    data_source_id: dataSourceId,
    start_cursor: cursor,
  });
  for (const row of page.results) {
    const external =
      row.properties?.['External ID']?.rich_text?.map((t) => t.plain_text).join('')?.trim() ||
      '';
    const slug = SLUGS[external];
    if (!slug) continue;
    await notion.pages.update({
      page_id: row.id,
      properties: {
        Slug: { rich_text: [{ type: 'text', text: { content: slug } }] },
      },
    });
    console.log(`Updated ${external} → ${slug}`);
    updated += 1;
  }
  cursor = page.has_more ? page.next_cursor : undefined;
} while (cursor);

console.log(`Done. Updated ${updated} client(s).`);
