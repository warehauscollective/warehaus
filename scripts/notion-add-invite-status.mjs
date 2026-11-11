#!/usr/bin/env node
/**
 * Add-only: Contacts "Invite Status" select, if that exact name is missing.
 * Does not rename, delete, or retype properties, and does not edit pages.
 *
 * Contacts data source is the id in packages/portal-sync/src/collections.ts.
 * Dev and prod portal code share that id. There is no second Contacts source.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve('apps/portal/.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

const token = process.env.NOTION_WAREHAUS_TOKEN?.trim();
const CONTACTS_DATA_SOURCE = 'b8e25824-c184-448f-a4fd-32fbf03b3c8a';
const INVITE_STATUS = 'Invite Status';
const OPTIONS = ['Pending', 'Accepted', 'Declined', 'Expired', 'Revoked'];

if (!token) {
  console.error('Missing NOTION_WAREHAUS_TOKEN. No schema change was made.');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  'Notion-Version': '2025-09-03',
  'Content-Type': 'application/json',
};

async function notion(path, init) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Notion ${path} → ${res.status}: ${text.slice(0, 400)}`);
  }
  return JSON.parse(text);
}

const source = await notion(`/data_sources/${CONTACTS_DATA_SOURCE}`);
const props = source.properties ?? {};
const live = Object.entries(props)
  .map(([name, value]) => ({ name, type: value?.type ?? 'unknown' }))
  .sort((a, b) => a.name.localeCompare(b.name));

console.log('Contacts data source', CONTACTS_DATA_SOURCE);
for (const row of live) console.log(`${row.name}\t${row.type}`);

const exact = props[INVITE_STATUS];
const otherCase = Object.keys(props).find(
  (name) => name.toLowerCase() === INVITE_STATUS.toLowerCase() && name !== INVITE_STATUS,
);
if (otherCase) {
  console.error(
    `A property already exists as "${otherCase}" (${props[otherCase]?.type ?? 'unknown'}). Not adding a duplicate.`,
  );
  process.exit(2);
}

if (exact) {
  if (exact.type !== 'select') {
    console.error(`"${INVITE_STATUS}" already exists as ${exact.type}. Not retyping it.`);
    process.exit(2);
  }
  const existing = (exact.select?.options ?? []).map((option) => option.name);
  const missing = OPTIONS.filter((name) => !existing.includes(name));
  console.log(`"${INVITE_STATUS}" select already exists. Options: ${existing.join(', ') || '(none)'}`);
  if (missing.length === 0) {
    console.log('No options to add.');
    process.exit(0);
  }
  const options = [
    ...(exact.select?.options ?? []).map((option) => ({ name: option.name, id: option.id, color: option.color })),
    ...missing.map((name) => ({ name })),
  ];
  await notion(`/data_sources/${CONTACTS_DATA_SOURCE}`, {
    method: 'PATCH',
    body: JSON.stringify({ properties: { [INVITE_STATUS]: { select: { options } } } }),
  });
  console.log(`Added options: ${missing.join(', ')}`);
  process.exit(0);
}

await notion(`/data_sources/${CONTACTS_DATA_SOURCE}`, {
  method: 'PATCH',
  body: JSON.stringify({
    properties: {
      [INVITE_STATUS]: {
        select: { options: OPTIONS.map((name) => ({ name })) },
      },
    },
  }),
});
console.log(`Added "${INVITE_STATUS}" select. Options: ${OPTIONS.join(', ')}`);
