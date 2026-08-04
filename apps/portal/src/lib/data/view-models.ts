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

/** Notion Status → board column (CLIENT-facing). */
export const TASK_BOARD_COLUMNS = [
  { key: 'inbox', label: 'Inbox', match: (s: string, done: boolean) => !done && /^inbox$/i.test(s) },
  {
    key: 'todo',
    label: 'To do',
    match: (s: string, done: boolean) =>
      !done && (/^to\s*do$/i.test(s) || /^todo$/i.test(s) || /^planned$/i.test(s)),
  },
  {
    key: 'in_progress',
    label: 'In progress',
    match: (s: string, done: boolean) =>
      !done && (/progress/i.test(s) || /^doing$/i.test(s)),
  },
  {
    key: 'blocked',
    label: 'Blocked',
    match: (s: string, done: boolean) => !done && /block/i.test(s),
  },
  {
    key: 'done',
    label: 'Done',
    match: (s: string, done: boolean) => done || /^done$/i.test(s),
  },
] as const;

export type TaskBoardColumnKey = (typeof TASK_BOARD_COLUMNS)[number]['key'];

export function taskBoardColumnKey(task: Pick<PortalTask, 'status' | 'isDone'>): TaskBoardColumnKey {
  for (const col of TASK_BOARD_COLUMNS) {
    if (col.match(task.status, task.isDone)) return col.key;
  }
  return task.isDone ? 'done' : 'todo';
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
