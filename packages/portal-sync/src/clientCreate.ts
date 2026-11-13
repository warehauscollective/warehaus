/**
 * Staff client create → the Clients data source the portal already pulls.
 *
 * The outbox kind is `client-create`. It POSTs a full page. An External ID
 * or Slug hit is reused and is not patched. `NOTION_WRITEBACK_ENABLED` must
 * be exactly "true" or nothing is queued.
 *
 * This path does not create a contact, an invite, or an email.
 * Portal access Disabled still fails the client pull gate. This module does
 * not change that gate. The create action upserts after Notion returns a page
 * id; the next pull may conceal the row.
 *
 * Live Clients schema (data source 5165ca6e-352e-45af-8918-98779fd76e61):
 * - Company Name is the title.
 * - Slug and External ID are text. External ID is `wh_cli_<slug>`.
 * - Status and Portal access and Source are selects.
 * - Primary Email is email. Phone is phone_number.
 * - Publish to Warehaus is a checkbox. This path sets it off. It is not a
 *   Convex column. Staff-only in Convex is Portal access Disabled.
 */

import { mapNotionClient } from './mappers';
import { validateWriteback, WRITEBACK_OFF_ERROR, type WriteProperties } from './writeback';

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UNSAFE_TEXT = /notion\.(so|com)|amazonaws\.com/i;

export type ClientCreateField = 'companyName' | 'email' | 'phone' | 'slug';

export type ClientCreateProperties = {
  'Company Name': string;
  Slug: string;
  Status: 'Prospect';
  'External ID': string;
  Source: 'portal';
  'Portal access': 'Disabled';
  'Publish to Warehaus': false;
  'Primary Email'?: string;
  Phone?: string;
};

export type ClientCreateBuild =
  | { ok: true; properties: ClientCreateProperties }
  | { ok: false; error: string; field: ClientCreateField };

/** Trim + lowercase. The `by_nameKey` index stores this. No other folding. */
export function companyNameKey(name: string): string {
  return name.trim().toLowerCase();
}

export function reservedClientSlug(slug: string): boolean {
  return slug === 'warehaus' || slug.startsWith('warehaus-');
}

export function slugFromCompanyName(name: string): string | null {
  const slug = name
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!KEBAB.test(slug)) return null;
  return slug;
}

export function clientCreateExternalId(slug: string): string {
  return `wh_cli_${slug}`;
}

/** Warehaus Staff only. Client Admin and Client Member are rejected. */
export function clientCreateStaffAllowed(role: string | null | undefined): boolean {
  return role === 'Warehaus Staff';
}

/**
 * Write-back is the only gate. Off returns the write-back error and sends nothing.
 */
export function planClientCreateDispatch(flags: {
  writebackEnabled: boolean;
}): { ok: true } | { ok: false; error: string } {
  if (!flags.writebackEnabled) return { ok: false, error: WRITEBACK_OFF_ERROR };
  return { ok: true };
}

export function buildClientCreateProperties(input: {
  companyName: string;
  slug?: string;
  primaryEmail?: string;
  phone?: string;
}): ClientCreateBuild {
  const companyName = input.companyName.trim().replace(/\s+/g, ' ');
  if (!companyName) return { ok: false, error: 'Company Name is required', field: 'companyName' };
  if (UNSAFE_TEXT.test(companyName)) {
    return { ok: false, error: 'Company Name must be client-safe', field: 'companyName' };
  }
  if (companyName.length > 2000) {
    return { ok: false, error: 'Company Name is too long', field: 'companyName' };
  }

  const slug = (input.slug?.trim() || slugFromCompanyName(companyName) || '').toLowerCase();
  if (!slug || !KEBAB.test(slug)) {
    return {
      ok: false,
      error: 'Company Name needs a slug made of letters or numbers',
      field: 'slug',
    };
  }
  if (reservedClientSlug(slug)) {
    return { ok: false, error: 'That slug is reserved', field: 'slug' };
  }

  const email = input.primaryEmail?.trim() ?? '';
  if (email) {
    if (UNSAFE_TEXT.test(email) || !EMAIL.test(email)) {
      return { ok: false, error: 'Primary Email is not a valid address', field: 'email' };
    }
  }

  const phone = input.phone?.trim() ?? '';
  if (phone) {
    if (UNSAFE_TEXT.test(phone) || phone.length > 40 || !/\d/.test(phone)) {
      return { ok: false, error: 'Phone needs a number', field: 'phone' };
    }
  }

  const properties: ClientCreateProperties = {
    'Company Name': companyName,
    Slug: slug,
    Status: 'Prospect',
    'External ID': clientCreateExternalId(slug),
    Source: 'portal',
    'Portal access': 'Disabled',
    'Publish to Warehaus': false,
  };
  if (email) properties['Primary Email'] = email;
  if (phone) properties.Phone = phone;
  return { ok: true, properties };
}

/** Full-page rules plus the staff defaults. Unknown names and invite fields fail. */
export function clientCreateEnqueueError(properties: WriteProperties): string | null {
  if (properties['Publish to Warehaus'] !== false) return 'Publish to Warehaus must be off';
  if (properties.Status !== 'Prospect') return 'Status must be Prospect';
  if (properties['Portal access'] !== 'Disabled') return 'Portal access must be Disabled';
  if (properties.Source !== 'portal') return 'Source must be portal';
  const slug = properties.Slug;
  if (typeof slug !== 'string' || !KEBAB.test(slug)) return 'Slug must be lowercase kebab-case';
  if (reservedClientSlug(slug)) return 'That slug is reserved';
  if (properties['External ID'] !== clientCreateExternalId(slug)) {
    return 'External ID must be wh_cli_<slug>';
  }
  const email = properties['Primary Email'];
  if (email != null && email !== '') {
    if (typeof email !== 'string' || !EMAIL.test(email)) return 'Primary Email is not a valid address';
  }
  const phone = properties.Phone;
  if (phone != null && phone !== '') {
    if (typeof phone !== 'string' || phone.length > 40 || !/\d/.test(phone)) return 'Phone needs a number';
  }
  const allowed = new Set([
    'Company Name',
    'Slug',
    'Status',
    'External ID',
    'Source',
    'Portal access',
    'Publish to Warehaus',
    'Primary Email',
    'Phone',
  ]);
  for (const name of Object.keys(properties)) {
    if (!allowed.has(name)) return `${name} is not part of client create`;
  }
  const validated = validateWriteback({ database: 'clients', properties, actor: 'staff' });
  if (!validated.ok) return validated.errors.join('; ');
  return null;
}

export function asClientCreateProperties(properties: WriteProperties): ClientCreateProperties | null {
  if (clientCreateEnqueueError(properties)) return null;
  const shaped: ClientCreateProperties = {
    'Company Name': properties['Company Name'] as string,
    Slug: properties.Slug as string,
    Status: 'Prospect',
    'External ID': properties['External ID'] as string,
    Source: 'portal',
    'Portal access': 'Disabled',
    'Publish to Warehaus': false,
  };
  if (typeof properties['Primary Email'] === 'string' && properties['Primary Email']) {
    shaped['Primary Email'] = properties['Primary Email'];
  }
  if (typeof properties.Phone === 'string' && properties.Phone) shaped.Phone = properties.Phone;
  return shaped;
}

/** Page-create body for Notion-Version 2025-09-03. Email and phone use their real types. */
export function toNotionClientCreateProperties(
  properties: ClientCreateProperties,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    'Company Name': { title: [{ type: 'text', text: { content: properties['Company Name'] } }] },
    Slug: { rich_text: [{ type: 'text', text: { content: properties.Slug } }] },
    Status: { select: { name: 'Prospect' } },
    'External ID': {
      rich_text: [{ type: 'text', text: { content: properties['External ID'] } }],
    },
    Source: { select: { name: 'portal' } },
    'Portal access': { select: { name: 'Disabled' } },
    'Publish to Warehaus': { checkbox: false },
  };
  if (properties['Primary Email']) out['Primary Email'] = { email: properties['Primary Email'] };
  if (properties.Phone) out.Phone = { phone_number: properties.Phone };
  return out;
}

export function clientCreatePageRequest(
  dataSourceId: string,
  properties: ClientCreateProperties,
): {
  parent: { type: 'data_source_id'; data_source_id: string };
  properties: Record<string, unknown>;
} {
  return {
    parent: { type: 'data_source_id', data_source_id: dataSourceId },
    properties: toNotionClientCreateProperties(properties),
  };
}

/** External ID first, then Slug. One query, no page patch. */
export function clientCreateSearchFilter(
  externalId: string,
  slug: string,
): {
  or: [
    { property: 'External ID'; rich_text: { equals: string } },
    { property: 'Slug'; rich_text: { equals: string } },
  ];
} {
  return {
    or: [
      { property: 'External ID', rich_text: { equals: externalId } },
      { property: 'Slug', rich_text: { equals: slug } },
    ],
  };
}

export type ClientCreateHit = {
  notionPageId: string;
  externalId: string;
  slug: string;
  properties: Record<string, unknown>;
};

export function clientCreateHitFromNotion(page: {
  notionPageId: string;
  properties: Record<string, unknown>;
}): ClientCreateHit {
  const external = page.properties['External ID'];
  const slug = page.properties.Slug;
  return {
    notionPageId: page.notionPageId,
    externalId: readRichText(external),
    slug: readRichText(slug).toLowerCase(),
    properties: page.properties,
  };
}

function readRichText(prop: unknown): string {
  const record = prop as { type?: string; rich_text?: Array<{ plain_text?: string }> };
  if (record?.type !== 'rich_text' || !Array.isArray(record.rich_text)) return '';
  return record.rich_text.map((part) => part.plain_text ?? '').join('');
}

export type ClientCreateDedupe =
  | { action: 'create' }
  | { action: 'reuse'; notionPageId: string; kind: 'external-id' | 'slug' };

/**
 * Same External ID is the retry. A Slug hit is the existing page.
 * Neither result is a reason to PATCH.
 */
export function decideClientCreateDedupe(input: {
  externalId: string;
  slug: string;
  hits: readonly Pick<ClientCreateHit, 'notionPageId' | 'externalId' | 'slug'>[];
}): ClientCreateDedupe {
  const external = input.hits.find((hit) => hit.externalId === input.externalId);
  if (external) return { action: 'reuse', notionPageId: external.notionPageId, kind: 'external-id' };
  const slug = input.hits.find((hit) => hit.slug === input.slug);
  if (slug) return { action: 'reuse', notionPageId: slug.notionPageId, kind: 'slug' };
  return { action: 'create' };
}

export type ClientUpsertFields = {
  companyName: string;
  slug: string;
  status: string;
  portalAccess: 'Enabled' | 'Disabled';
  primaryEmail?: string;
  phone?: string;
  externalId?: string;
  source?: string;
  nameKey: string;
};

export function clientCreateConvexFields(properties: ClientCreateProperties): ClientUpsertFields {
  return {
    companyName: properties['Company Name'],
    slug: properties.Slug,
    status: 'Prospect',
    portalAccess: 'Disabled',
    ...(properties['Primary Email'] ? { primaryEmail: properties['Primary Email'] } : {}),
    ...(properties.Phone ? { phone: properties.Phone } : {}),
    externalId: properties['External ID'],
    source: 'portal',
    nameKey: companyNameKey(properties['Company Name']),
  };
}

/**
 * A row that already exists is not written again. Insert only when this page
 * id is new, so a later pull's sync-hidden stamp is left alone.
 */
export function clientCreateInsertAllowed(existingClientId: string | null): boolean {
  return existingClientId == null;
}

/**
 * Fields already on a Notion page we are reusing.
 * Null when that page has no slug. Status and portal access stay as Notion has them.
 */
export function clientFieldsFromNotionPage(
  notionPageId: string,
  properties: Record<string, unknown>,
): ClientUpsertFields | null {
  const mapped = mapNotionClient(notionPageId, properties);
  if (!mapped.row || mapped.row.database !== 'clients' || !mapped.row.slug) return null;
  const row = mapped.row;
  return {
    companyName: row.companyName,
    slug: row.slug,
    status: row.status,
    portalAccess: row.portalAccess,
    ...(row.primaryEmail ? { primaryEmail: row.primaryEmail } : {}),
    ...(row.phone ? { phone: row.phone } : {}),
    ...(row.externalId ? { externalId: row.externalId } : {}),
    ...(row.source ? { source: row.source } : {}),
    nameKey: companyNameKey(row.companyName),
  };
}
