/**
 * Staff and client activity feeds, plus the per-task timeline.
 * Client items keep the same project and task gates as the board.
 * warehaus.studio and Type Internal never appear for a client.
 */

import {
  clientMaySeeProject,
  clientMaySeeTask,
  isClientVisibleActivityType,
  sanitizeInlineText,
} from '@warehaus/portal-sync';

export type FeedProject = {
  _id: string;
  name: string;
  type?: string[] | null;
  publishToWarehaus: boolean;
  archive: boolean;
  syncHiddenAt?: number;
  notionPageId?: string;
};

export type FeedTask = {
  _id: string;
  name: string;
  projectId: string;
  notionPageId: string;
  publishToWarehaus: boolean;
  syncHiddenAt?: number;
};

export type FeedActivity = {
  _id: string;
  name: string;
  summary?: string;
  type: string;
  tone?: string;
  timestamp: number;
  projectId?: string;
  /**
   * Filter lane. Independent of `type`, which is what client visibility checks.
   * A published project event can still count as a resource or a person.
   */
  lane?: 'tasks' | 'resources' | 'people' | 'sync';
  /** Client title. Staff rows keep `name`. */
  clientName?: string;
  /** Client meta. Staff rows keep `summary`. Still passed through the client strip. */
  clientSummary?: string;
};

export type FeedAudit = {
  _id: string;
  action: string;
  notionPageId?: string;
  after?: string;
  actorKind: string;
  createdAt: number;
};

export type FeedOutbox = {
  _id: string;
  kind: string;
  status: string;
  database: string;
  notionPageId?: string;
  lastError?: string;
  createdAt: number;
};

export type ActivityFeedItem = {
  id: string;
  name: string;
  summary: string;
  type: string;
  tone: string;
  timestamp: string;
  projectId: string | null;
  taskId: string | null;
  /** Filter lane. Omitted when the row has no explicit lane. */
  lane?: 'tasks' | 'resources' | 'people' | 'sync';
  /** Staff feed only. True when the client feed includes this same id. */
  clientVisible?: boolean;
};

export type TaskTimelineItem = {
  id: string;
  at: string;
  title: string;
  detail: string;
  tone: string;
};

const CLIENT_FIELDS = ['Name', 'Status', 'Stage', 'Date', 'Is Done'] as const;

function gate(project: FeedProject, orgVisible: boolean) {
  return {
    name: project.name,
    types: project.type ?? [],
    publishToWarehaus: project.publishToWarehaus,
    archive: project.archive,
    hidden: project.syncHiddenAt != null,
    orgVisible,
  };
}

function clientSeesProject(project: FeedProject | undefined, orgVisible: boolean): boolean {
  if (!project) return false;
  return clientMaySeeProject(gate(project, orgVisible));
}

function clientSeesTask(
  task: FeedTask | undefined,
  project: FeedProject | undefined,
  orgVisible: boolean,
): boolean {
  if (!task || !project) return false;
  return clientMaySeeTask({
    publishToWarehaus: task.publishToWarehaus,
    hidden: task.syncHiddenAt != null,
    project: gate(project, orgVisible),
  });
}

/**
 * Whether the client feed includes this row.
 * Activity-table rows must be a client activity type and sit on a project the
 * client can see. Audits follow the task, or the project when there is no task.
 * A row with neither a task nor a project is dropped. Outbox rows stay staff-only.
 * Published-task audits stay visible: the activity-type allowlist applies to
 * activity-table rows, which have no task link.
 */
export function isClientVisibleFeedItem(input: {
  source: 'activity' | 'audit' | 'outbox';
  type: string;
  project: FeedProject | undefined;
  task: FeedTask | undefined;
  orgVisible: boolean;
  audit?: FeedAudit;
}): boolean {
  if (input.source === 'outbox') return false;
  if (!input.task && !input.project) return false;
  if (input.source === 'activity') {
    if (!isClientVisibleActivityType(input.type)) return false;
    return clientSeesProject(input.project, input.orgVisible);
  }
  if (input.audit && !clientAuditItem(input.audit, input.task, input.project)) return false;
  if (input.task) return clientSeesTask(input.task, input.project, input.orgVisible);
  return clientSeesProject(input.project, input.orgVisible);
}

function readProperties(after?: string): Record<string, unknown> | null {
  if (!after) return null;
  try {
    const parsed = JSON.parse(after) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    const properties = record.properties;
    if (properties && typeof properties === 'object' && !Array.isArray(properties)) {
      return properties as Record<string, unknown>;
    }
    return record;
  } catch {
    return null;
  }
}

function clientFieldDetail(after?: string): string | null {
  const props = readProperties(after);
  if (!props) return null;
  const shown = CLIENT_FIELDS.filter((key) => {
    const value = props[key];
    return value != null && value !== '';
  });
  if (shown.length === 0) return null;
  return shown
    .map((key) => `${key}: ${sanitizeInlineText(String(props[key]))}`)
    .filter((line) => line.length > 0)
    .join(' · ');
}

function clientAuditItem(
  audit: FeedAudit,
  task: FeedTask | undefined,
  project: FeedProject | undefined,
): ActivityFeedItem | null {
  if (audit.action.startsWith('invite.')) return null;
  if (
    audit.action === 'outbox.conflict' ||
    audit.action === 'outbox.staffNotice' ||
    audit.action === 'outbox.rejected'
  ) {
    return null;
  }
  if (!audit.action.startsWith('outbox.') && !audit.action.startsWith('task.')) return null;
  const detail = clientFieldDetail(audit.after);
  if (!detail) return null;
  return {
    id: audit._id,
    name: task?.name ? `${task.name} updated` : 'Task updated',
    summary: detail,
    type: 'task',
    tone: 'muted',
    timestamp: new Date(audit.createdAt).toISOString(),
    projectId: task?.projectId ?? project?._id ?? null,
    taskId: task?._id ?? null,
  };
}

/** Client meta keeps the person (or other public segment) and drops internal fields. */
function clientDetailLeaks(segment: string): boolean {
  return (
    /source\s*:/i.test(segment) ||
    /invite[\s-]*pending/i.test(segment) ||
    /invite-status/i.test(segment) ||
    /\blastError\b/i.test(segment) ||
    /\berror\b/i.test(segment) ||
    /\bfailed\b/i.test(segment) ||
    /\bconflict\b/i.test(segment) ||
    /^system$/i.test(segment) ||
    /^sync\b/i.test(segment)
  );
}

export function clientSafeSummary(summary: string): string {
  return summary
    .split(/\s*·\s*/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && !clientDetailLeaks(segment))
    .join(' · ');
}

function staffDetail(after?: string): string {
  const props = readProperties(after);
  if (!props) return sanitizeInlineText(after ?? '').slice(0, 180);
  return Object.entries(props)
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => `${key}: ${sanitizeInlineText(String(value))}`)
    .join(' · ')
    .slice(0, 180);
}

export function buildActivityFeed(input: {
  audience: 'client' | 'staff';
  orgVisible: boolean;
  activity: readonly FeedActivity[];
  audits: readonly FeedAudit[];
  outbox: readonly FeedOutbox[];
  projects: readonly FeedProject[];
  tasks: readonly FeedTask[];
  limit?: number;
}): ActivityFeedItem[] {
  const projectsById = new Map(input.projects.map((project) => [project._id, project]));
  const tasksByNotion = new Map(input.tasks.map((task) => [task.notionPageId, task]));
  const projectsByNotion = new Map(
    input.projects.flatMap((project) => (project.notionPageId ? [[project.notionPageId, project] as const] : [])),
  );
  const items: ActivityFeedItem[] = [];

  for (const row of input.activity) {
    if (row.type === 'shipment') continue;
    const project = row.projectId ? projectsById.get(row.projectId) : undefined;
    const clientVisible = isClientVisibleFeedItem({
      source: 'activity',
      type: row.type,
      project,
      task: undefined,
      orgVisible: input.orgVisible,
    });
    if (input.audience === 'client' && !clientVisible) continue;
    const staffSummary = row.summary ?? '';
    items.push({
      id: row._id,
      name: input.audience === 'client' && row.clientName ? row.clientName : row.name,
      summary: input.audience === 'client' ? clientSafeSummary(row.clientSummary ?? staffSummary) : staffSummary,
      type: row.type,
      tone: row.tone ?? 'muted',
      timestamp: new Date(row.timestamp).toISOString(),
      projectId: row.projectId ?? null,
      taskId: null,
      ...(row.lane ? { lane: row.lane } : {}),
      ...(input.audience === 'staff' ? { clientVisible } : {}),
    });
  }

  for (const audit of input.audits) {
    const task = audit.notionPageId ? tasksByNotion.get(audit.notionPageId) : undefined;
    const project =
      (task ? projectsById.get(task.projectId) : undefined) ??
      (audit.notionPageId ? projectsByNotion.get(audit.notionPageId) : undefined);
    const clientVisible = isClientVisibleFeedItem({
      source: 'audit',
      type: 'task',
      project,
      task,
      orgVisible: input.orgVisible,
      audit,
    });
    if (input.audience === 'client') {
      if (!clientVisible) continue;
      const item = clientAuditItem(audit, task, project);
      if (item) items.push({ ...item, summary: clientSafeSummary(item.summary) });
      continue;
    }
    if (audit.action.startsWith('invite.')) continue;
    items.push({
      id: audit._id,
      name: task?.name ? `${task.name} · ${audit.action}` : audit.action,
      summary: staffDetail(audit.after),
      type: audit.action.includes('conflict') ? 'exception' : 'task',
      tone: audit.action.includes('conflict') ? 'danger' : 'muted',
      timestamp: new Date(audit.createdAt).toISOString(),
      projectId: task?.projectId ?? project?._id ?? null,
      taskId: task?._id ?? null,
      clientVisible,
    });
  }

  if (input.audience === 'staff') {
    for (const row of input.outbox) {
      const task = row.notionPageId ? tasksByNotion.get(row.notionPageId) : undefined;
      const failed = row.status === 'conflict' || row.status === 'dead';
      items.push({
        id: row._id,
        name: failed ? 'Write conflict' : `Notion ${row.kind}`,
        summary: sanitizeInlineText(row.lastError ?? row.status),
        type: failed ? 'exception' : 'sync',
        tone: failed ? 'danger' : 'muted',
        timestamp: new Date(row.createdAt).toISOString(),
        projectId: task?.projectId ?? null,
        taskId: task?._id ?? null,
        clientVisible: false,
      });
    }
  }

  return items
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0))
    .slice(0, input.limit ?? 50);
}

export function buildTaskTimeline(input: {
  audience: 'client' | 'staff';
  task: FeedTask;
  project: FeedProject | undefined;
  orgVisible: boolean;
  audits: readonly FeedAudit[];
  outbox: readonly FeedOutbox[];
}): TaskTimelineItem[] {
  if (input.audience === 'client' && !clientSeesTask(input.task, input.project, input.orgVisible)) {
    return [];
  }
  const items: TaskTimelineItem[] = [];
  for (const audit of input.audits) {
    if (audit.notionPageId && audit.notionPageId !== input.task.notionPageId) continue;
    if (input.audience === 'client') {
      const detail = clientFieldDetail(audit.after);
      if (!detail || audit.action.startsWith('invite.')) continue;
      items.push({
        id: audit._id,
        at: new Date(audit.createdAt).toISOString(),
        title: 'Task updated',
        detail,
        tone: 'muted',
      });
      continue;
    }
    items.push({
      id: audit._id,
      at: new Date(audit.createdAt).toISOString(),
      title: audit.action,
      detail: staffDetail(audit.after),
      tone: audit.action.includes('conflict') ? 'danger' : 'muted',
    });
  }
  if (input.audience === 'staff') {
    for (const row of input.outbox) {
      if (row.notionPageId !== input.task.notionPageId) continue;
      const failed = row.status === 'conflict' || row.status === 'dead';
      items.push({
        id: row._id,
        at: new Date(row.createdAt).toISOString(),
        title: `${row.kind} · ${row.status}`,
        detail: sanitizeInlineText(row.lastError ?? ''),
        tone: failed ? 'danger' : 'muted',
      });
    }
  }
  return items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
