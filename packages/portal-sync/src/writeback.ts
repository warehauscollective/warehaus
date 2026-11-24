/**
 * Portal → Notion write-back validator.
 * Missing required fields on a create are rejected. This module never fills a silent default.
 * Writable names are the keys of the tier maps (the allowlist). Unknown names are rejected.
 * That includes NEVER-tier names that exist in Notion, such as Publish to Warehaus.
 * Stage, Parent item, and Resources are on the task map. Building and Shipped cannot be set here.
 */

export const WRITEBACK_OFF_ERROR = 'Write-back is off. Nothing was sent to Notion.';

/** Exact opt-in. Unset, empty, and any other value stay off. */
export function isNotionWritebackEnabled(flag: string | undefined): boolean {
  return flag === 'true';
}

import {
  CLIENT_DOC_PROPERTY_TIERS,
  CLIENT_PROPERTY_TIERS,
  CONTACT_PROPERTY_TIERS,
  PROJECT_PROPERTY_TIERS,
  SHARED_RESOURCE_PROPERTY_TIERS,
  TASK_PROPERTY_TIERS,
} from './tiers';
import { LIVE_TASK_STATUSES, isPullRequestLink, isTaskStage, stageMoveRule } from './taskBoard';
import {
  CLIENT_DOC_SCHEMA,
  CLIENT_SCHEMA,
  CONTACT_SCHEMA,
  PROJECT_SCHEMA,
  SHARED_RESOURCE_SCHEMA,
  TASK_SCHEMA,
  type PropertySchema,
  type PropertySpec,
} from './notionSchema';

export const NOTION_WRITE_VERSION = '2025-09-03';

export type WritebackDatabase =
  | 'clients'
  | 'projects'
  | 'tasks'
  | 'contacts'
  | 'sharedResources'
  | 'clientDocs'
  | 'activity';

const WRITEBACK_DATABASES: readonly WritebackDatabase[] = [
  'clients',
  'projects',
  'tasks',
  'contacts',
  'sharedResources',
  'clientDocs',
  'activity',
];

/** A stored database name as a WritebackDatabase, or null for anything else. */
export function asWritebackDatabase(value: string): WritebackDatabase | null {
  return (WRITEBACK_DATABASES as readonly string[]).includes(value) ? (value as WritebackDatabase) : null;
}

export type WriteActor = 'staff' | 'clientAdmin' | 'system';

export type WriteValue = string | number | boolean | string[] | null;

export type WriteProperties = Record<string, WriteValue>;

const ALLOWED_NAMES: Record<Exclude<WritebackDatabase, 'activity'>, Readonly<Record<string, string>>> = {
  clients: CLIENT_PROPERTY_TIERS,
  projects: PROJECT_PROPERTY_TIERS,
  tasks: TASK_PROPERTY_TIERS,
  contacts: CONTACT_PROPERTY_TIERS,
  sharedResources: SHARED_RESOURCE_PROPERTY_TIERS,
  clientDocs: CLIENT_DOC_PROPERTY_TIERS,
};

const CLIENT_STATUSES = ['Active', 'Prospect', 'Paused', 'Archive'] as const;
const PROJECT_STATUSES = ['Inbox', 'Planned', 'In progress', 'Done'] as const;
const PROJECT_TYPES = ['Website', 'Product', 'Brand', 'Internal', 'R&D'] as const;
/** Same list as the live task board. */
export const TASK_STATUSES = LIVE_TASK_STATUSES;
const CONTACT_ROLES = ['Client Admin', 'Client Member', 'Warehaus Staff'] as const;
const RESOURCE_TYPES = [
  'Image',
  'Social Media Post',
  'Podcast',
  'Course',
  'Video',
  'PDF',
  'Article',
] as const;
const DOC_TYPES = [
  'Start Here',
  'Project Brief',
  'Brand & Assets',
  'Questions & Requests',
  'Decisions Log',
  'Glossary',
  'Meeting Notes',
  'Deliverables & Handoff',
] as const;

const PROPERTY_SCHEMAS = {
  clients: CLIENT_SCHEMA,
  projects: PROJECT_SCHEMA,
  tasks: TASK_SCHEMA,
  contacts: CONTACT_SCHEMA,
  sharedResources: SHARED_RESOURCE_SCHEMA,
  clientDocs: CLIENT_DOC_SCHEMA,
} as const satisfies Record<Exclude<WritebackDatabase, 'activity'>, PropertySchema>;

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type WritebackResult =
  | { ok: true; properties: WriteProperties }
  | { ok: false; errors: string[] };

export function validateWriteback(input: {
  database: WritebackDatabase;
  properties: WriteProperties;
  actor: WriteActor;
}): WritebackResult {
  if (input.database === 'activity') {
    return {
      ok: false,
      errors: ['Activity has no portal create path'],
    };
  }

  const errors: string[] = [];
  const allowed = ALLOWED_NAMES[input.database];
  for (const name of Object.keys(input.properties)) {
    if (!(name in allowed)) errors.push(`Unknown property ${name}`);
  }
  if (errors.length > 0) return { ok: false, errors };

  const props = input.properties;
  switch (input.database) {
    case 'clients':
      validateClient(props, errors);
      break;
    case 'contacts':
      validateContact(props, input.actor, errors);
      break;
    case 'projects':
      validateProject(props, errors);
      break;
    case 'tasks':
      validateTask(props, errors);
      break;
    case 'sharedResources':
      validateResource(props, errors);
      break;
    case 'clientDocs':
      validateDoc(props, errors);
      break;
    default:
      errors.push('Unsupported database');
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, properties: props };
}

/**
 * Partial update. Every name must be on the tier map. Unknown names fail closed.
 * Creates still use `validateWriteback`, which requires the full payload.
 */
export function validatePropertyPatch(input: {
  database: WritebackDatabase;
  properties: WriteProperties;
}): WritebackResult {
  if (input.database === 'activity') {
    return { ok: false, errors: ['Activity has no portal create path'] };
  }
  const names = Object.keys(input.properties);
  if (names.length === 0) {
    return { ok: false, errors: ['At least one property is required'] };
  }
  const allowed = ALLOWED_NAMES[input.database];
  const errors: string[] = [];
  for (const name of names) {
    if (!(name in allowed)) errors.push(`Unknown property ${name}`);
  }
  if (errors.length > 0) return { ok: false, errors };

  if (input.database === 'tasks' && 'Status' in input.properties) {
    requireOneOf(input.properties, 'Status', TASK_STATUSES, errors);
  }
  if (input.database === 'tasks' && 'Stage' in input.properties) {
    const stage = input.properties.Stage;
    const rule = typeof stage === 'string' ? stageMoveRule('staff', stage) : { kind: 'denied' as const, reason: 'Stage must be one of the portal stages' };
    const link = input.properties['GitHub Issue/PR'];
    const mergedReview = stage === 'Shipped' && typeof link === 'string' && isPullRequestLink(link);
    if ((rule.kind === 'denied' || rule.kind === 'locked') && !mergedReview) errors.push(rule.reason);
    if (rule.kind === 'needs') {
      const link = input.properties['GitHub Issue/PR'];
      if (typeof link !== 'string' || !isPullRequestLink(link)) errors.push(rule.reason);
    }
  }
  if (input.database === 'projects' && 'Status' in input.properties) {
    requireOneOf(input.properties, 'Status', PROJECT_STATUSES, errors);
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, properties: input.properties };
}

/** B1 enqueue: one task Status change. Other task fields stay unread and unwritten. */
export function validateTaskStatusUpdate(status: string): WritebackResult {
  return validatePropertyPatch({
    database: 'tasks',
    properties: { Status: status },
  });
}

function validateClient(props: WriteProperties, errors: string[]) {
  requireText(props, 'Company Name', errors);
  requireText(props, 'Slug', errors, (value) =>
    KEBAB.test(value) ? null : 'Slug must be lowercase kebab-case',
  );
  requireOneOf(props, 'Status', CLIENT_STATUSES, errors);
  const slug = typeof props.Slug === 'string' ? props.Slug : '';
  requireText(props, 'External ID', errors, (value) =>
    slug && value === `wh_cli_${slug}` ? null : 'External ID must be wh_cli_<slug>',
  );
  requireSource(props, errors);
  requireExact(props, 'Portal access', 'Disabled', errors);
  for (const link of ['Projects', 'Contacts', 'Client Docs'] as const) {
    if (link in props) errors.push(`${link} links are not allowed on client create`);
  }
}

function validateContact(props: WriteProperties, actor: WriteActor, errors: string[]) {
  requireText(props, 'Name', errors);
  requireText(props, 'Email', errors, (value) => {
    if (value !== value.trim().toLowerCase()) return 'Email must already be trimmed lowercase';
    if (!value.includes('@') || value.startsWith('@') || value.endsWith('@')) {
      return 'Email is not a valid address';
    }
    return null;
  });
  requireOneOf(props, 'Role', CONTACT_ROLES, errors);
  if (props.Role === 'Warehaus Staff' && actor !== 'staff') {
    errors.push('Warehaus Staff can only be written by a staff actor');
  }
  requireSource(props, errors);
  requireExact(props, 'Portal Access', 'Disabled', errors);
  requireRelation(props, 'Client Company', 1, errors);
  if ('Auth User ID' in props && props['Auth User ID'] !== '' && props['Auth User ID'] != null) {
    errors.push('Auth User ID must be empty on create');
  }
}

function validateProject(props: WriteProperties, errors: string[]) {
  requireText(props, 'Name', errors);
  requireOneOf(props, 'Status', PROJECT_STATUSES, errors);
  requireSubset(props, 'Type', PROJECT_TYPES, errors);
  requireSafeText(props, 'Description', errors);
  requireExact(props, 'Archive', false, errors);
  requirePrefix(props, 'External ID', 'wh_prj_', errors);
  requireSource(props, errors);
  requireExact(props, 'Publish to Warehaus', false, errors);
  requireRelation(props, 'Client', 1, errors);
}

function validateTask(props: WriteProperties, errors: string[]) {
  requireSafeText(props, 'Name', errors);
  requireOneOf(props, 'Status', TASK_STATUSES, errors);
  if ('Date' in props) requireText(props, 'Date', errors);
  if ('Stage' in props) {
    const stage = props.Stage;
    if (typeof stage !== 'string' || !isTaskStage(stage)) {
      errors.push('Stage must be one of the portal stages');
    } else {
      const rule = stageMoveRule('staff', stage);
      if (rule.kind !== 'allowed') errors.push(rule.kind === 'needs' ? rule.reason : rule.reason);
    }
  }
  if ('Parent item' in props) requireRelation(props, 'Parent item', 1, errors);
  if ('Resources' in props && !Array.isArray(props.Resources)) {
    errors.push('Resources must be a list of pages');
  }
  requirePrefix(props, 'External ID', 'wh_tsk_', errors);
  requireSource(props, errors);
  requireExact(props, 'Publish to Warehaus', false, errors);
  requireRelation(props, 'Projects', 1, errors);
}

function validateResource(props: WriteProperties, errors: string[]) {
  requireText(props, 'Name', errors);
  requireOneOf(props, 'Type', RESOURCE_TYPES, errors);
  requireSafeText(props, 'Description', errors);
  const url = props.URL;
  const file = props.File;
  const hasUrl = typeof url === 'string' && url.length > 0;
  const hasFile = typeof file === 'string' ? file.length > 0 : Array.isArray(file) && file.length > 0;
  if (!hasUrl && !hasFile) errors.push('URL or File is required');
  if (hasUrl && typeof url === 'string' && /notion\.(so|com)|amazonaws\.com|secure\.notion-static\.com/i.test(url)) {
    errors.push('URL must not point at a Notion or raw S3 host');
  }
  requirePrefix(props, 'External ID', 'wh_res_', errors);
  requireSource(props, errors);
  requireExact(props, 'Publish to Warehaus', false, errors);
  const clients = relationIds(props.Client);
  const projects = relationIds(props.Project);
  if (clients.length + projects.length < 1) {
    errors.push('Client and/or Project is required');
  }
}

function validateDoc(props: WriteProperties, errors: string[]) {
  requireText(props, 'Title', errors);
  requireOneOf(props, 'Doc Type', DOC_TYPES, errors);
  requireSafeText(props, 'Summary', errors);
  if (typeof props.Order !== 'number' || !Number.isFinite(props.Order)) {
    errors.push('Order is required');
  }
  requirePrefix(props, 'External ID', 'wh_doc_', errors);
  requireSource(props, errors);
  requireExact(props, 'Status', 'Draft', errors);
  requireExact(props, 'Publish to Warehaus', false, errors);
  requireRelation(props, 'Client', 1, errors);
  if ('Project' in props) {
    const ids = relationIds(props.Project);
    if (ids.length > 1) errors.push('Project must be a single link when set');
  }
}

function requireSource(props: WriteProperties, errors: string[]) {
  requireExact(props, 'Source', 'portal', errors);
}

function requireText(
  props: WriteProperties,
  name: string,
  errors: string[],
  extra?: (value: string) => string | null,
) {
  const value = props[name];
  if (typeof value !== 'string' || value.length === 0) {
    errors.push(`${name} is required`);
    return;
  }
  const problem = extra?.(value);
  if (problem) errors.push(problem);
}

function requireSafeText(props: WriteProperties, name: string, errors: string[]) {
  requireText(props, name, errors, (value) =>
    /notion\.(so|com)|amazonaws\.com/i.test(value) ? `${name} must be client-safe` : null,
  );
}

function requireExact(props: WriteProperties, name: string, expected: WriteValue, errors: string[]) {
  if (!(name in props)) {
    errors.push(`${name} is required`);
    return;
  }
  if (props[name] !== expected) errors.push(`${name} must be ${String(expected)}`);
}

function requireOneOf(
  props: WriteProperties,
  name: string,
  allowed: readonly string[],
  errors: string[],
) {
  const value = props[name];
  if (typeof value !== 'string' || !allowed.includes(value)) {
    errors.push(`${name} must be one of ${allowed.join(', ')}`);
  }
}

function requireSubset(
  props: WriteProperties,
  name: string,
  allowed: readonly string[],
  errors: string[],
) {
  const value = props[name];
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${name} is required`);
    return;
  }
  if (value.some((item) => !allowed.includes(item))) {
    errors.push(`${name} must be a subset of ${allowed.join(', ')}`);
  }
}

function requirePrefix(props: WriteProperties, name: string, prefix: string, errors: string[]) {
  requireText(props, name, errors, (value) =>
    value.startsWith(prefix) && value.length > prefix.length ? null : `${name} must start with ${prefix}`,
  );
}

function relationIds(value: WriteValue | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id) => typeof id === 'string' && id.length > 0);
}

function requireRelation(props: WriteProperties, name: string, count: number, errors: string[]) {
  const ids = relationIds(props[name]);
  if (ids.length !== count) errors.push(`${name} must link exactly ${count} page`);
}

export type SearchPlan = {
  database: Exclude<WritebackDatabase, 'activity'>;
  property: 'Slug' | 'Email' | 'External ID';
  value: string;
};

/** Search before every create attempt. Slug for clients, Email for contacts, External ID otherwise. */
export function searchPlanForCreate(
  database: WritebackDatabase,
  properties: WriteProperties,
): SearchPlan | { error: string } {
  if (database === 'activity') return { error: 'Activity has no portal create path' };
  const property = database === 'clients' ? 'Slug' : database === 'contacts' ? 'Email' : 'External ID';
  const value = properties[property];
  if (typeof value !== 'string' || value.length === 0) {
    return { error: `${property} is required before search` };
  }
  return { database, property, value };
}

export type ExistingPageHit = {
  notionPageId: string;
  /** True when the hit belongs to the caller's org. Clients match on slug, so this is true. */
  sameOrg: boolean;
};

export type DedupeDecision =
  | { action: 'create' }
  | { action: 'reuse'; notionPageId: string }
  | { action: 'reject'; reason: string };

/**
 * Same-org hit is reused (re-invite / retry). A hit in another org is rejected.
 * Nothing is created when the decision is reject.
 */
export function decideCreateDedupe(existing: readonly ExistingPageHit[]): DedupeDecision {
  const other = existing.find((hit) => !hit.sameOrg);
  if (other) {
    return { action: 'reject', reason: 'A matching page already belongs to another client' };
  }
  const own = existing.find((hit) => hit.sameOrg);
  if (own) return { action: 'reuse', notionPageId: own.notionPageId };
  return { action: 'create' };
}

function richTextValue(value: string) {
  return { rich_text: [{ type: 'text', text: { content: value } }] };
}

/** One Notion property value from a plain value, by the schema's type. Undefined skips it. */
function shapeProperty(spec: PropertySpec | undefined, value: WriteValue): unknown {
  const type = spec?.type;
  if (type === 'select' && spec?.clearable && (value == null || value === '')) return { select: null };
  if (type === 'date') return typeof value === 'string' && value ? { date: { start: value } } : { date: null };
  if (value == null) return undefined;
  switch (type) {
    case 'title':
      if (typeof value === 'string') return { title: [{ type: 'text', text: { content: value } }] };
      break;
    case 'email':
      if (typeof value === 'string') return { email: value };
      break;
    case 'url':
      if (typeof value === 'string') return { url: value };
      break;
    case 'checkbox':
      if (typeof value === 'boolean') return { checkbox: value };
      break;
    case 'number':
      if (typeof value === 'number') return { number: value };
      break;
    case 'multi_select':
      if (Array.isArray(value)) return { multi_select: value.map((item) => ({ name: item })) };
      break;
    case 'status':
      if (typeof value === 'string') return { status: { name: value } };
      break;
    case 'select':
      if (typeof value === 'string') return { select: { name: value } };
      break;
    case 'relation':
      if (Array.isArray(value)) return { relation: value.map((id) => ({ id })) };
      break;
    case 'files':
      if (typeof value === 'string') return { files: [{ name: 'file', external: { url: value } }] };
      break;
    default:
      break;
  }
  return typeof value === 'string' ? richTextValue(value) : undefined;
}

/** Shape a validated plain payload into a 2025-09-03 page property map, by the database's property schema. */
export function toNotionProperties(
  database: Exclude<WritebackDatabase, 'activity'>,
  properties: WriteProperties,
): Record<string, unknown> {
  const schema = PROPERTY_SCHEMAS[database] as PropertySchema;
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(properties)) {
    const shaped = shapeProperty(schema[name], value);
    if (shaped !== undefined) out[name] = shaped;
  }
  return out;
}

/** Best-effort plain read of a Notion property object, or a value that is already plain. */
export function readNotionPlain(property: unknown): WriteValue | undefined {
  if (
    property == null ||
    typeof property === 'string' ||
    typeof property === 'number' ||
    typeof property === 'boolean'
  ) {
    return property;
  }
  if (Array.isArray(property)) {
    return property.every((item) => typeof item === 'string') ? property : undefined;
  }
  if (typeof property !== 'object') return undefined;
  const record = property as Record<string, unknown>;
  if (record.type === 'title' && Array.isArray(record.title)) {
    return richText(record.title);
  }
  if (record.type === 'rich_text' && Array.isArray(record.rich_text)) {
    return richText(record.rich_text);
  }
  if (record.type === 'select') {
    const select = record.select as { name?: string } | null;
    return select?.name ?? null;
  }
  if (record.type === 'status') {
    const status = record.status as { name?: string } | null;
    return status?.name ?? null;
  }
  if (record.type === 'multi_select' && Array.isArray(record.multi_select)) {
    return record.multi_select
      .map((item) => (item as { name?: string }).name)
      .filter((name): name is string => typeof name === 'string');
  }
  if (record.type === 'email') return (record.email as string | null) ?? null;
  if (record.type === 'url') return (record.url as string | null) ?? null;
  if (record.type === 'checkbox') return record.checkbox === true;
  if (record.type === 'number') return typeof record.number === 'number' ? record.number : null;
  if (record.type === 'date') {
    const date = record.date as { start?: string } | null;
    return date?.start ?? null;
  }
  if (record.type === 'relation' && Array.isArray(record.relation)) {
    return record.relation
      .map((item) => (item as { id?: string }).id)
      .filter((id): id is string => typeof id === 'string');
  }
  return undefined;
}

function richText(parts: unknown[]): string {
  return parts
    .map((part) => {
      const text = part as { plain_text?: string; text?: { content?: string } };
      return text.plain_text ?? text.text?.content ?? '';
    })
    .join('');
}
