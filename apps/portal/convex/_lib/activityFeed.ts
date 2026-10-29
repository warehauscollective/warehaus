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

/** Activity row as stored. Lane and client copy are derived, not columns. */
export type FeedActivity = {
  _id: string;
  name: string;
  summary?: string;
  type: string;
  tone?: string;
  timestamp: number;
  projectId?: string;
};

/** Display name only. Email stays off the feed. */
export type FeedContact = {
  name: string;
};

export type ActivityLane = 'tasks' | 'resources' | 'people' | 'sync';

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
  /** Filter lane derived from type and tone. Visibility stays on `type`. */
  lane?: ActivityLane;
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

function clientAuditHasPublicFields(after?: string): boolean {
  const props = readProperties(after);
  if (!props) return false;
  return CLIENT_FIELDS.some((key) => {
    const value = props[key];
    return value != null && value !== '';
  });
}

const NOTION_PAGE_ID =
  /\b[0-9a-f]{32}\b|\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const OUTBOX_WORD = /\b(queued|inflight|dead|conflict|failed|outbox)\b/i;

/** Reject text that must never be copied into a client row. */
function clientTextRejected(value: string): boolean {
  return (
    value.includes('@') ||
    /warehaus\.studio/i.test(value) ||
    /\binternal\b/i.test(value) ||
    /\bsource\b/i.test(value) ||
    NOTION_PAGE_ID.test(value) ||
    OUTBOX_WORD.test(value)
  );
}

function safeClientTitle(value: string | undefined): string | null {
  const title = value?.trim() ?? '';
  if (!title || clientTextRejected(title)) return null;
  return title;
}

/**
 * Lane from type, then tone. `type` still decides client visibility.
 * A published project event can count as a resource or a person.
 */
export function activityLane(type: string, tone?: string): ActivityLane | undefined {
  if (type === 'resource') return 'resources';
  if (type === 'sync' || type === 'exception') return 'sync';
  if (type === 'task') return 'tasks';
  if (type !== 'project') return undefined;
  const kind = (tone ?? '').trim().toLowerCase();
  if (kind === 'resource' || kind === 'resources') return 'resources';
  if (kind === 'people' || kind === 'person' || kind === 'invite') return 'people';
  return 'tasks';
}

/** Actor only when a summary segment is exactly a known contact name. */
function knownContactName(summary: string | undefined, contacts: readonly FeedContact[]): string | null {
  if (!summary) return null;
  const byName = new Map(contacts.map((contact) => [contact.name, contact.name]));
  for (const segment of summary.split(/\s*·\s*/)) {
    const known = byName.get(segment.trim());
    if (!known || clientTextRejected(known)) continue;
    return known;
  }
  return null;
}

/**
 * Client title and meta. Built only from a project or task title, a fixed
 * phrase, and a contact name. Staff `name` and `summary` are never copied.
 */
function clientActivityCopy(input: {
  lane: ActivityLane | undefined;
  project: FeedProject | undefined;
  task: FeedTask | undefined;
  summary: string | undefined;
  contacts: readonly FeedContact[];
}): { name: string; summary: string } {
  const actor = knownContactName(input.summary, input.contacts);
  const title = safeClientTitle(input.task?.name) ?? safeClientTitle(input.project?.name);
  if (input.lane === 'people') {
    return {
      name: actor ? `${actor} joined your team` : 'A teammate joined your team',
      summary: actor ?? '',
    };
  }
  if (input.lane === 'resources') {
    return {
      name: title ? `${title} shared` : 'A file was shared',
      summary: actor ?? '',
    };
  }
  if (input.lane === 'sync') {
    return { name: 'A sync update', summary: '' };
  }
  return {
    name: title ? `${title} is ready for your review` : 'An update is ready for your review',
    summary: actor ?? '',
  };
}

function withLane(item: Omit<ActivityFeedItem, 'lane'>, type: string, tone?: string): ActivityFeedItem {
  const lane = activityLane(type, tone);
  return lane ? { ...item, lane } : item;
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
  if (!clientAuditHasPublicFields(audit.after)) return null;
  const copy = clientActivityCopy({
    lane: 'tasks',
    project,
    task,
    summary: undefined,
    contacts: [],
  });
  return {
    id: audit._id,
    name: copy.name,
    summary: copy.summary,
    type: 'task',
    tone: 'muted',
    timestamp: new Date(audit.createdAt).toISOString(),
    projectId: task?.projectId ?? project?._id ?? null,
    taskId: task?._id ?? null,
    lane: 'tasks',
  };
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
  /** Org contacts, name only. Used to allow an actor onto client meta. */
  contacts?: readonly FeedContact[];
  limit?: number;
}): ActivityFeedItem[] {
  const projectsById = new Map(input.projects.map((project) => [project._id, project]));
  const tasksByNotion = new Map(input.tasks.map((task) => [task.notionPageId, task]));
  const projectsByNotion = new Map(
    input.projects.flatMap((project) => (project.notionPageId ? [[project.notionPageId, project] as const] : [])),
  );
  const contacts = input.contacts ?? [];
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
    const lane = activityLane(row.type, row.tone);
    const clientCopy = clientActivityCopy({
      lane,
      project,
      task: undefined,
      summary: row.summary,
      contacts,
    });
    const staffSummary = row.summary ?? '';
    items.push(
      withLane(
        {
          id: row._id,
          name: input.audience === 'client' ? clientCopy.name : row.name,
          summary: input.audience === 'client' ? clientCopy.summary : staffSummary,
          type: row.type,
          tone: row.tone ?? 'muted',
          timestamp: new Date(row.timestamp).toISOString(),
          projectId: row.projectId ?? null,
          taskId: null,
          ...(input.audience === 'staff' ? { clientVisible } : {}),
        },
        row.type,
        row.tone,
      ),
    );
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
      if (item) items.push(item);
      continue;
    }
    if (audit.action.startsWith('invite.')) continue;
    const staffType = audit.action.includes('conflict') ? 'exception' : 'task';
    items.push(
      withLane(
        {
          id: audit._id,
          name: task?.name ? `${task.name} · ${audit.action}` : audit.action,
          summary: staffDetail(audit.after),
          type: staffType,
          tone: audit.action.includes('conflict') ? 'danger' : 'muted',
          timestamp: new Date(audit.createdAt).toISOString(),
          projectId: task?.projectId ?? project?._id ?? null,
          taskId: task?._id ?? null,
          clientVisible,
        },
        staffType,
      ),
    );
  }

  if (input.audience === 'staff') {
    for (const row of input.outbox) {
      const task = row.notionPageId ? tasksByNotion.get(row.notionPageId) : undefined;
      const failed = row.status === 'conflict' || row.status === 'dead';
      const staffType = failed ? 'exception' : 'sync';
      items.push(
        withLane(
          {
            id: row._id,
            name: failed ? 'Write conflict' : `Notion ${row.kind}`,
            summary: sanitizeInlineText(row.lastError ?? row.status),
            type: staffType,
            tone: failed ? 'danger' : 'muted',
            timestamp: new Date(row.createdAt).toISOString(),
            projectId: task?.projectId ?? null,
            taskId: task?._id ?? null,
            clientVisible: false,
          },
          staffType,
        ),
      );
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
      if (!clientAuditHasPublicFields(audit.after) || audit.action.startsWith('invite.')) continue;
      const title = safeClientTitle(input.task.name);
      items.push({
        id: audit._id,
        at: new Date(audit.createdAt).toISOString(),
        title: 'Task updated',
        detail: title ? `${title} was updated` : 'This task was updated',
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
