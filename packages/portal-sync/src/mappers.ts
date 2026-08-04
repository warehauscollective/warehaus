/**
 * Notion page → Convex upsert candidates (allowlist + gates).
 */

import {
  clientDocRowPassesGate,
  clientRowPassesGate,
  contactRowPassesGate,
  projectRowPassesGate,
  sharedResourceRowPassesGate,
  taskRowPassesGate,
} from './gates';
import {
  extractCheckbox,
  extractDateStart,
  extractEmail,
  extractFiles,
  extractFormulaBoolean,
  extractMultiSelect,
  extractNumber,
  extractPhone,
  extractRelationIds,
  extractRichText,
  extractRollupNumber,
  extractSelect,
  extractStatus,
  extractTitle,
  extractUrl,
  type NotionFileRef,
} from './extract';
import { classifyProperty, isSyncedTier } from './tiers';
import type { SyncInCollectionKey } from './collections';

export type SyncDisposition =
  | { disposition: 'upsert' }
  | { disposition: 'skip'; reason: string }
  | { disposition: 'quarantine'; reason: string };

export type MappedClient = {
  database: 'clients';
  notionPageId: string;
  companyName: string;
  slug: string;
  status: string;
  portalAccess: 'Enabled' | 'Disabled';
  primaryEmail?: string;
  phone?: string;
  externalId?: string;
  source?: string;
};

export type MappedProject = {
  database: 'projects';
  notionPageId: string;
  clientNotionIds: string[];
  name: string;
  description?: string;
  status: string;
  progress?: number;
  startDate?: string;
  endDate?: string;
  liveUrl?: string;
  figmaLink?: string;
  docsUrl?: string;
  stack?: string[];
  type: string[];
  archive: boolean;
  publishToWarehaus: boolean;
  priority?: string;
  externalId?: string;
  source?: string;
};

export type MappedTask = {
  database: 'tasks';
  notionPageId: string;
  projectNotionIds: string[];
  name: string;
  status: string;
  isDone: boolean;
  date?: string;
  publishToWarehaus: boolean;
  estimate?: string;
  priority?: string;
  externalId?: string;
  source?: string;
};

export type MappedContact = {
  database: 'contacts';
  notionPageId: string;
  clientNotionIds: string[];
  name: string;
  email: string;
  authUserId?: string;
  role: 'Client Admin' | 'Client Member' | 'Warehaus Staff';
  portalAccess: 'Enabled' | 'Disabled';
  phone?: string;
  externalId?: string;
  source?: string;
};

export type MappedSharedResource = {
  database: 'sharedResources';
  notionPageId: string;
  clientNotionIds: string[];
  projectNotionIds: string[];
  title: string;
  description?: string;
  type?: string;
  url?: string;
  files: NotionFileRef[];
  publishToWarehaus: boolean;
  archive: boolean;
  externalId?: string;
  source?: string;
};

export type MappedClientDoc = {
  database: 'clientDocs';
  notionPageId: string;
  clientNotionIds: string[];
  projectNotionIds: string[];
  title: string;
  summary?: string;
  docType: string;
  order?: number;
  status: 'Draft' | 'Published';
  publishToWarehaus: boolean;
  externalId?: string;
  source?: string;
};

export type MappedRow =
  | MappedClient
  | MappedProject
  | MappedTask
  | MappedContact
  | MappedSharedResource
  | MappedClientDoc;

export type MapResult = SyncDisposition & {
  droppedProperties: string[];
  row?: MappedRow;
};

function dropUnknown(database: SyncInCollectionKey, properties: Record<string, unknown>): string[] {
  return Object.keys(properties).filter((name) => {
    const tier = classifyProperty(database, name);
    return !isSyncedTier(tier) && tier === 'NEVER';
  });
}

function asPortalAccess(value: string | null): 'Enabled' | 'Disabled' {
  return value === 'Enabled' ? 'Enabled' : 'Disabled';
}

function asContactRole(
  value: string | null,
): 'Client Admin' | 'Client Member' | 'Warehaus Staff' {
  if (value === 'Client Admin' || value === 'Warehaus Staff') return value;
  return 'Client Member';
}

export function mapNotionClient(
  notionPageId: string,
  properties: Record<string, unknown>,
): MapResult {
  const droppedProperties = dropUnknown('clients', properties);
  const portalAccess = asPortalAccess(extractSelect(properties['Portal access']));
  const row: MappedClient = {
    database: 'clients',
    notionPageId,
    companyName: extractTitle(properties['Company Name']) || 'Untitled',
    slug: (extractRichText(properties.Slug) || '').toLowerCase(),
    status: extractSelect(properties.Status) || 'Active',
    portalAccess,
    primaryEmail: extractEmail(properties['Primary Email']) ?? undefined,
    phone: extractPhone(properties.Phone) ?? undefined,
    externalId: extractRichText(properties['External ID']) || undefined,
    source: extractSelect(properties.Source) ?? undefined,
  };

  const gate = clientRowPassesGate({ portalAccess: row.portalAccess });
  if (!gate.ok) return { disposition: 'skip', reason: gate.reason, droppedProperties };
  if (!row.slug) {
    return { disposition: 'quarantine', reason: 'Client missing Slug', droppedProperties, row };
  }
  return { disposition: 'upsert', droppedProperties, row };
}

export function mapNotionProject(
  notionPageId: string,
  properties: Record<string, unknown>,
): MapResult {
  const droppedProperties = dropUnknown('projects', properties);
  const row: MappedProject = {
    database: 'projects',
    notionPageId,
    clientNotionIds: extractRelationIds(properties.Client),
    name: extractTitle(properties.Name) || 'Untitled',
    description: extractRichText(properties.Description) || undefined,
    status: extractStatus(properties.Status) || extractSelect(properties.Status) || 'Inbox',
    progress: extractRollupNumber(properties.Progress) ?? undefined,
    startDate: extractDateStart(properties['Start Date']) ?? undefined,
    endDate: extractDateStart(properties['End Date']) ?? undefined,
    liveUrl: extractUrl(properties['Live URL']) ?? undefined,
    figmaLink: extractUrl(properties['Figma Link']) ?? undefined,
    docsUrl: extractUrl(properties['Docs URL']) ?? undefined,
    stack: extractMultiSelect(properties.Stack),
    type: extractMultiSelect(properties.Type),
    archive: extractCheckbox(properties.Archive),
    publishToWarehaus: extractCheckbox(properties['Publish to Warehaus']),
    priority: extractSelect(properties.Priority) ?? undefined,
    externalId: extractRichText(properties['External ID']) || undefined,
    source: extractSelect(properties.Source) ?? undefined,
  };

  const gate = projectRowPassesGate({
    publishToWarehaus: row.publishToWarehaus,
    clientRelationIds: row.clientNotionIds,
    archive: row.archive,
    types: row.type,
  });
  if (!gate.ok) return { disposition: 'skip', reason: gate.reason, droppedProperties };
  return { disposition: 'upsert', droppedProperties, row };
}

export function mapNotionTask(
  notionPageId: string,
  properties: Record<string, unknown>,
  parentProjectPassesGate: boolean,
): MapResult {
  const droppedProperties = dropUnknown('tasks', properties);
  const status = extractStatus(properties.Status) || extractSelect(properties.Status) || 'Inbox';
  const formulaDone = extractFormulaBoolean(properties['Is Done']);
  const row: MappedTask = {
    database: 'tasks',
    notionPageId,
    projectNotionIds: extractRelationIds(properties.Projects),
    name: extractTitle(properties.Name) || 'Untitled',
    status,
    isDone: formulaDone ?? status === 'Done',
    date: extractDateStart(properties.Date) ?? undefined,
    publishToWarehaus: extractCheckbox(properties['Publish to Warehaus']),
    estimate: extractSelect(properties.Estimate) ?? undefined,
    priority: extractSelect(properties.Priority) ?? undefined,
    externalId: extractRichText(properties['External ID']) || undefined,
    source: extractSelect(properties.Source) ?? undefined,
  };

  const gate = taskRowPassesGate({
    publishToWarehaus: row.publishToWarehaus,
    projectRelationIds: row.projectNotionIds,
    parentProjectPassesGate,
  });
  if (!gate.ok) return { disposition: 'skip', reason: gate.reason, droppedProperties };
  return { disposition: 'upsert', droppedProperties, row };
}

export function mapNotionContact(
  notionPageId: string,
  properties: Record<string, unknown>,
): MapResult {
  const droppedProperties = dropUnknown('contacts', properties);
  const email = (extractEmail(properties.Email) || '').toLowerCase();
  const row: MappedContact = {
    database: 'contacts',
    notionPageId,
    clientNotionIds: extractRelationIds(properties['Client Company']),
    name: extractTitle(properties.Name) || 'Untitled',
    email,
    authUserId: extractRichText(properties['Auth User ID']) || undefined,
    role: asContactRole(extractSelect(properties.Role)),
    portalAccess: asPortalAccess(extractSelect(properties['Portal Access'])),
    phone: extractPhone(properties.Phone) ?? undefined,
    externalId: extractRichText(properties['External ID']) || undefined,
    source: extractSelect(properties.Source) ?? undefined,
  };

  const gate = contactRowPassesGate({
    portalAccess: row.portalAccess,
    clientCompanyRelationIds: row.clientNotionIds,
  });
  if (!gate.ok) return { disposition: 'skip', reason: gate.reason, droppedProperties };
  if (!row.email.includes('@')) {
    return { disposition: 'quarantine', reason: 'Contact missing Email', droppedProperties, row };
  }
  return { disposition: 'upsert', droppedProperties, row };
}

export function mapNotionSharedResource(
  notionPageId: string,
  properties: Record<string, unknown>,
  projectClientNotionId?: string | null,
): MapResult {
  const droppedProperties = dropUnknown('sharedResources', properties);
  const row: MappedSharedResource = {
    database: 'sharedResources',
    notionPageId,
    clientNotionIds: extractRelationIds(properties.Client),
    projectNotionIds: extractRelationIds(properties.Project),
    title: extractTitle(properties.Name) || 'Untitled',
    description: extractRichText(properties.Description) || undefined,
    type: extractSelect(properties.Type) ?? undefined,
    url: extractUrl(properties.URL) ?? undefined,
    files: extractFiles(properties.File),
    publishToWarehaus: extractCheckbox(properties['Publish to Warehaus']),
    archive: false,
    externalId: extractRichText(properties['External ID']) || undefined,
    source: extractSelect(properties.Source) ?? undefined,
  };

  const gate = sharedResourceRowPassesGate({
    publishToWarehaus: row.publishToWarehaus,
    clientRelationIds: row.clientNotionIds,
    projectRelationIds: row.projectNotionIds,
    projectClientId: projectClientNotionId,
  });
  if (!gate.ok) {
    if (gate.reason.includes('quarantine') || gate.reason.includes('disagree')) {
      return { disposition: 'quarantine', reason: gate.reason, droppedProperties, row };
    }
    return { disposition: 'skip', reason: gate.reason, droppedProperties };
  }
  return { disposition: 'upsert', droppedProperties, row };
}

export function mapNotionClientDoc(
  notionPageId: string,
  properties: Record<string, unknown>,
): MapResult {
  const droppedProperties = dropUnknown('clientDocs', properties);
  const statusRaw = extractSelect(properties.Status);
  const status = statusRaw === 'Published' ? 'Published' : 'Draft';
  const row: MappedClientDoc = {
    database: 'clientDocs',
    notionPageId,
    clientNotionIds: extractRelationIds(properties.Client),
    projectNotionIds: extractRelationIds(properties.Project),
    title: extractTitle(properties.Title) || 'Untitled',
    summary: extractRichText(properties.Summary) || undefined,
    docType: extractSelect(properties['Doc Type']) || 'Start Here',
    order: extractNumber(properties.Order) ?? undefined,
    status,
    publishToWarehaus: extractCheckbox(properties['Publish to Warehaus']),
    externalId: extractRichText(properties['External ID']) || undefined,
    source: extractSelect(properties.Source) ?? undefined,
  };

  const gate = clientDocRowPassesGate({
    status: row.status,
    publishToWarehaus: row.publishToWarehaus,
    clientRelationIds: row.clientNotionIds,
  });
  if (!gate.ok) return { disposition: 'skip', reason: gate.reason, droppedProperties };
  return { disposition: 'upsert', droppedProperties, row };
}
