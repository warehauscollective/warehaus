/**
 * CLIENT-tier portal view-models (allowlist-aligned).
 * Prefer these over any legacy Notion seed shapes.
 *
 * Field renames vs older portal/Notion seed UI:
 * - Project `phase` → `status` (Notion Status)
 * - Project `due` → `endDate`
 * - Project `visibility` / Owner / DRI → not CLIENT (hidden)
 * - Task board columns derived from `status` + `isDone` (see TASK_BOARD_COLUMNS)
 */

export type PortalTenantMeta = {
  mode: 'team' | 'client';
  slug: string | null;
  clientExternalId: string | null;
  clientName: string | null;
  ok: boolean;
  error?: 'unknown_tenant' | 'portal_disabled';
};

export type PortalClient = {
  id: string;
  name: string;
  slug: string | null;
};

/** CLIENT project fields only — no Owner/DRI, Type, Archive, Priority. */
export type PortalProject = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  progress: number | null;
  startDate: string | null;
  endDate: string | null;
  liveUrl: string | null;
  figmaLink: string | null;
  docsUrl: string | null;
  stack: string[];
  notionPageId?: string | null;
  lastSyncedAt?: number | null;
  syncHidden?: boolean;
  publishToWarehaus?: boolean;
  internal?: boolean;
  taskCount?: number;
  orgId?: string;
  clientName?: string | null;
  clientSlug?: string | null;
};

/** CLIENT task fields only — no Priority, Estimate, Owner, Description. */
export type PortalTask = {
  id: string;
  name: string;
  status: string;
  isDone: boolean;
  date: string | null;
  projectId: string | null;
  projectName: string | null;
  projectStatus: string | null;
  projectEndDate: string | null;
  notionPageId?: string | null;
  lastSyncedAt?: number | null;
  syncHidden?: boolean;
  publishToWarehaus?: boolean;
  estimate?: string | null;
  priority?: string | null;
  source?: string | null;
  orgId?: string;
  syncState?: 'syncing' | 'synced' | 'failed' | null;
};

export type PortalActivity = {
  id: string;
  name: string;
  type: string;
  summary: string;
  timestamp: string;
  tone: string;
  projectId: string | null;
};

export type TaskResponseType = 'approve' | 'request-change' | 'comment';

export type PortalTaskResponse = {
  id: string;
  taskId: string;
  type: TaskResponseType;
  body: string | null;
  createdAt: number;
  contactName: string;
};

export type PortalSnapshot = {
  clients: PortalClient[];
  projects: PortalProject[];
  tasks: PortalTask[];
  activity: PortalActivity[];
  syncMeta: {
    lastSyncedAt: string | null;
    lastError: string | null;
    mode: 'convex';
  };
  tenant: PortalTenantMeta;
};

/** Stripe → Convex billing summary (CLIENT-safe). */
export type PortalBillingSummary = {
  hasBilling: boolean;
  subscription: {
    status: string;
    planName: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: number | null;
  } | null;
  nextInvoice: {
    id: string;
    number: string | null;
    status: string;
    amountLabel: string;
    amountDue: number;
    currency: string;
    periodEnd: number | null;
    createdAt: number;
    hostedInvoiceUrl: string | null;
    invoicePdf: string | null;
  } | null;
};

export type PortalBillingInvoice = {
  id: string;
  number: string | null;
  status: string;
  amountDue: number;
  amountLabel: string;
  currency: string;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
  periodStart: number | null;
  periodEnd: number | null;
  createdAt: number;
};

/**
 * Live Notion Status only. Order matches the Status Kanban.
 * Unmatched statuses return null — they are not filed under Inbox.
 */
export const LIVE_TASK_STATUSES = ['Inbox', 'To Do', 'Blocked', 'In Progress', 'Done'] as const;

export const TASK_BOARD_COLUMNS = [
  { key: 'inbox', label: 'Inbox', match: (s: string) => /^inbox$/i.test(s) },
  { key: 'todo', label: 'To Do', match: (s: string) => /^to\s*do$/i.test(s) || /^todo$/i.test(s) },
  { key: 'blocked', label: 'Blocked', match: (s: string) => /^blocked$/i.test(s) },
  { key: 'in_progress', label: 'In Progress', match: (s: string) => /^in\s*progress$/i.test(s) },
  { key: 'done', label: 'Done', match: (s: string) => /^done$/i.test(s) },
] as const;

export type TaskBoardColumnKey = (typeof TASK_BOARD_COLUMNS)[number]['key'];

export function taskBoardColumnKey(
  task: Pick<PortalTask, 'status' | 'isDone'>,
): TaskBoardColumnKey | null {
  if (task.isDone || /^done$/i.test(task.status.trim())) return 'done';
  const status = task.status.trim();
  for (const col of TASK_BOARD_COLUMNS) {
    if (col.key === 'done') continue;
    if (col.match(status)) return col.key;
  }
  return null;
}

export type RowSyncState = 'syncing' | 'synced' | 'failed';

/**
 * True only when the payload actually carries sync fields.
 * A deployed list that omits them is unknown — not "Syncing".
 */
export function rowHasSyncFields(row: {
  notionPageId?: string | null;
  syncHidden?: boolean;
  syncState?: RowSyncState | null;
}): boolean {
  return row.notionPageId !== undefined || row.syncHidden !== undefined || row.syncState != null;
}

/** Pulled rows with a real Notion page id read as synced. Local or hidden rows never do. */
export function rowSyncChip(row: {
  notionPageId?: string | null;
  syncHidden?: boolean;
  syncState?: RowSyncState | null;
}): RowSyncState {
  if (row.syncState === 'failed' || row.syncHidden) return 'failed';
  if (row.syncState === 'syncing') return 'syncing';
  const id = row.notionPageId?.trim() ?? '';
  const confirmed =
    id.length > 0 && !id.startsWith('portal:') && !id.startsWith('pending:');
  if (!confirmed) return 'syncing';
  return 'synced';
}

export function rowSyncLabel(row: {
  notionPageId?: string | null;
  syncHidden?: boolean;
  syncState?: RowSyncState | null;
}): string {
  const chip = rowSyncChip(row);
  if (chip === 'failed') return row.syncHidden && row.syncState !== 'failed' ? 'Hidden' : 'Failed';
  if (chip === 'synced') return 'In sync';
  return 'Syncing';
}

/** Same words as a row chip, for the Activity pull tile. */
export function pullSyncWords(meta: {
  lastSyncedAt?: string | null;
  lastError?: string | null;
}): { value: 'Failed' | 'In sync' | 'Syncing'; hint: string } {
  if (meta.lastError) return { value: 'Failed', hint: 'Notion pull' };
  if (meta.lastSyncedAt) return { value: 'In sync', hint: 'Notion pull' };
  return { value: 'Syncing', hint: 'Notion pull' };
}

/** Prefer an in-progress project. Shipped work is the fallback, not the hero. */
export function pickActiveProject<T extends { status: string; internal?: boolean }>(
  projects: readonly T[],
): T | null {
  const visible = projects.filter((project) => !project.internal);
  const pool = visible.length > 0 ? visible : projects;
  const open = pool.filter((project) => !/ship|done/i.test(project.status));
  return open.find((project) => /progress/i.test(project.status)) ?? open[0] ?? pool[0] ?? null;
}

/**
 * Copy a Notion id from a snapshot row onto a staff list row that omitted it.
 * Rows with no matching id stay unmarked so the chip stays hidden.
 */
export function attachKnownSync<
  T extends { id: string; notionPageId?: string | null; syncHidden?: boolean },
>(
  rows: readonly T[],
  known: ReadonlyArray<{ id: string; notionPageId?: string | null; syncHidden?: boolean }>,
): Array<T & { notionPageId?: string | null; syncHidden?: boolean }> {
  const byId = new Map(known.map((row) => [row.id, row]));
  return rows.map((row) => {
    if (row.notionPageId !== undefined || row.syncHidden !== undefined) return row;
    const match = byId.get(row.id);
    if (!match || (match.notionPageId === undefined && match.syncHidden === undefined)) return row;
    return { ...row, notionPageId: match.notionPageId ?? null, syncHidden: match.syncHidden };
  });
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Client list subtitle from fields the deployed directory actually returns.
 * A missing people count is omitted. It is not drawn as a dash.
 */
export function clientDirectoryMeta(client: {
  contactCount?: number | null;
  projectCount?: number | null;
  openTaskCount?: number | null;
  resourceCount?: number | null;
  status?: string | null;
}): string {
  const parts: string[] = [];
  if (typeof client.contactCount === 'number') {
    parts.push(countLabel(client.contactCount, 'person', 'people'));
  }
  if (typeof client.projectCount === 'number') {
    parts.push(client.projectCount === 0 ? 'No projects yet' : countLabel(client.projectCount, 'project', 'projects'));
  }
  if (typeof client.openTaskCount === 'number' && client.openTaskCount > 0) {
    parts.push(countLabel(client.openTaskCount, 'open item', 'open items'));
  }
  if (typeof client.resourceCount === 'number' && client.resourceCount > 0) {
    parts.push(countLabel(client.resourceCount, 'resource', 'resources'));
  }
  if (parts.length === 0 && client.status) parts.push(client.status);
  return parts.length > 0 ? parts.join(' · ') : 'No projects yet';
}

export function taskStatusColor(status: string, isDone = false): string {
  if (isDone || /^done$/i.test(status)) return 'var(--success)';
  if (/block/i.test(status)) return 'var(--danger)';
  if (/progress/i.test(status) || /^doing$/i.test(status)) return 'var(--accent)';
  if (/inbox/i.test(status)) return 'var(--warn)';
  return 'var(--muted)';
}

export function projectStatusColor(status: string): string {
  const s = status.toLowerCase();
  if (s.includes('done') || s.includes('ship')) return 'var(--success)';
  if (s.includes('progress')) return 'var(--accent)';
  if (s.includes('plan')) return 'var(--info, var(--accent))';
  if (s.includes('inbox')) return 'var(--warn)';
  return 'var(--muted)';
}

export function formatPortalDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
