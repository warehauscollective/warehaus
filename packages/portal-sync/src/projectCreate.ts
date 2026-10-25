/**
 * Staff project create → the Projects data source the portal already pulls.
 *
 * This path has its own gate, `NOTION_PROJECT_CREATE_ENABLED` === "true".
 * It does not read `NOTION_WRITEBACK_ENABLED` and it does not write contacts,
 * tasks, docs, resources, or activity.
 *
 * Live Projects schema (data source 39947c31-d003-4125-9c32-5e570d4c7e0e):
 * - Name is the title.
 * - Client is a relation to the Clients data source. Pull quarantines a project
 *   whose Client relation does not resolve, so staff must pick that client.
 * - Status is a status property and defaults to none. It is not required, so
 *   this payload omits it. The pull mapper stores "Inbox" when Status is empty.
 * - Source is a select. `portal` already exists. Send select, not rich text.
 * - Type is not required. Omitting it keeps Internal out of the project gate.
 * - Publish to Warehaus and Archive are checkboxes. This create path sets
 *   Publish on and Archive off.
 * - Tasks, Client Docs, and Ops (Internal) are relations. This path does not set them.
 */

import { normalizeNotionId } from './collections';

export const NOTION_PROJECT_CREATE_ENV = 'NOTION_PROJECT_CREATE_ENABLED';

/** Mapper fallback when Notion Status is absent. Not written to Notion. */
export const PROJECT_CREATE_CONVEX_STATUS = 'Inbox' as const;

const EXTERNAL_ID = /^wh_prj_[a-z0-9]+$/;
const UNSAFE_TEXT = /notion\.(so|com)|amazonaws\.com/i;

export type ProjectCreateProperties = {
  Name: string;
  Client: [string];
  'Publish to Warehaus': true;
  Archive: false;
  Source: 'portal';
  'External ID': string;
};

export type ProjectCreateBuild =
  | { ok: true; properties: ProjectCreateProperties }
  | { ok: false; errors: string[] };

export function isNotionProjectCreateEnabled(value: string | undefined): boolean {
  return value === 'true';
}

/** Warehaus Staff only. Client Admin and Client Member are rejected. */
export function projectCreateStaffAllowed(role: string | null | undefined): boolean {
  return role === 'Warehaus Staff';
}

export function isNotionPageId(id: string): boolean {
  return /^[0-9a-f]{32}$/i.test(id.replace(/-/g, ''));
}

export function createProjectExternalId(entropy: string): string {
  const suffix = entropy.toLowerCase().replace(/[^a-z0-9]/g, '');
  const externalId = `wh_prj_${suffix}`;
  if (!EXTERNAL_ID.test(externalId)) {
    throw new Error('Could not build a project External ID');
  }
  return externalId;
}

export function buildProjectCreateProperties(input: {
  name: string;
  clientNotionPageId: string;
  externalId: string;
}): ProjectCreateBuild {
  const errors: string[] = [];
  const name = input.name.trim();
  if (!name) errors.push('Name is required');
  else if (UNSAFE_TEXT.test(name)) errors.push('Name must be client-safe');
  else if (name.length > 2000) errors.push('Name is too long');

  if (!isNotionPageId(input.clientNotionPageId)) {
    errors.push('Client must be a Notion page from the Clients data source');
  }

  if (!EXTERNAL_ID.test(input.externalId)) {
    errors.push('External ID must start with wh_prj_');
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    properties: {
      Name: name,
      Client: [input.clientNotionPageId],
      'Publish to Warehaus': true,
      Archive: false,
      Source: 'portal',
      'External ID': input.externalId,
    },
  };
}

/** Page-create body properties for Notion-Version 2025-09-03. */
export function toNotionProjectCreateProperties(
  properties: ProjectCreateProperties,
): Record<string, unknown> {
  return {
    Name: { title: [{ type: 'text', text: { content: properties.Name } }] },
    Client: { relation: [{ id: properties.Client[0] }] },
    'Publish to Warehaus': { checkbox: true },
    Archive: { checkbox: false },
    Source: { select: { name: 'portal' } },
    'External ID': {
      rich_text: [{ type: 'text', text: { content: properties['External ID'] } }],
    },
  };
}

export function projectCreatePageRequest(
  dataSourceId: string,
  properties: ProjectCreateProperties,
): {
  parent: { type: 'data_source_id'; data_source_id: string };
  properties: Record<string, unknown>;
} {
  return {
    parent: { type: 'data_source_id', data_source_id: dataSourceId },
    properties: toNotionProjectCreateProperties(properties),
  };
}

export function projectCreateSearchFilter(externalId: string): {
  property: 'External ID';
  rich_text: { equals: string };
} {
  return { property: 'External ID', rich_text: { equals: externalId } };
}

/**
 * Convex row written after Notion confirms the page.
 * Status is the pull mapper's fallback. Type stays empty.
 * No task, resource, or activity fields.
 */
export function projectCreateConvexFields(properties: ProjectCreateProperties): {
  name: string;
  status: typeof PROJECT_CREATE_CONVEX_STATUS;
  type: [];
  archive: false;
  publishToWarehaus: true;
  externalId: string;
  source: 'portal';
} {
  return {
    name: properties.Name,
    status: PROJECT_CREATE_CONVEX_STATUS,
    type: [],
    archive: false,
    publishToWarehaus: true,
    externalId: properties['External ID'],
    source: 'portal',
  };
}

export type ProjectCreateDedupe =
  | { action: 'create' }
  | { action: 'reuse'; notionPageId: string }
  | { action: 'reject'; reason: string };

/**
 * Same External ID and the same client: reuse that page.
 * A hit on another client is rejected and nothing is created.
 */
export function decideProjectCreateDedupe(input: {
  hits: readonly { notionPageId: string; clientNotionIds: readonly string[] }[];
  clientNotionPageId: string;
}): ProjectCreateDedupe {
  const want = normalizeNotionId(input.clientNotionPageId);
  for (const hit of input.hits) {
    const clients = hit.clientNotionIds.map(normalizeNotionId).filter(Boolean);
    if (clients.length !== 1 || clients[0] !== want) {
      return {
        action: 'reject',
        reason: 'A matching project already belongs to another client',
      };
    }
  }
  const own = input.hits[0];
  if (own) return { action: 'reuse', notionPageId: own.notionPageId };
  return { action: 'create' };
}
