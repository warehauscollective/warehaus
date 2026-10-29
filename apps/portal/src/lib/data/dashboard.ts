/**
 * Dashboard home. Stage bars and Awaiting go count the Stage field.
 * Status never fills those lists. Sync health is staff-only and reads the
 * Notion pull plus the B0 outbox. While write-back is off the queue is Off,
 * never synced. Clients do not receive sync, outbox, publish, or internal work.
 */

import { TASK_STAGES, isStaffOnlyProject, type TaskStage } from '@warehaus/portal-sync';
import { formatPortalDate, noticeDisplayMessage } from '@/lib/data/view-models';

export type DashboardAudience = 'staff' | 'client';

export type DashboardProject = {
  id: string;
  name: string;
  status: string;
  progress: number | null;
  endDate?: string | null;
  internal?: boolean;
  publishToWarehaus?: boolean;
  syncHidden?: boolean;
  clientName?: string | null;
  orgId?: string;
  lastSyncedAt?: number | null;
  taskCount?: number;
};

export type DashboardTask = {
  id: string;
  name: string;
  status: string;
  isDone: boolean;
  date: string | null;
  stage?: string | null;
  lastEditedTime?: string | null;
  projectId: string | null;
  projectName: string | null;
  category?: string | null;
  publishToWarehaus?: boolean;
  syncHidden?: boolean;
  internal?: boolean;
  clientName?: string | null;
  orgId?: string;
  notionPageId?: string | null;
};

export type DashboardActivity = {
  id: string;
  name: string;
  summary: string;
  timestamp: string;
  type?: string;
  projectId?: string | null;
  taskId?: string | null;
  /** Staff feed only. The publish mark reads this. Client lists omit it. */
  clientVisible?: boolean;
};

export type DashboardNotice = {
  id: string;
  message: string;
  createdAt: number;
  edgeCase?: string | null;
};

export type OutboxCounts = {
  queued: number;
  inflight: number;
  failed: number;
  dead: number;
  conflict: number;
};

/**
 * Staff outbox summary. Counts replace the row list so the dashboard never
 * receives hundreds of outbox payloads. Failed, dead, and conflict counts
 * are rows created within {@link SYNC_PULL_STALE_MS}. Queued and inflight
 * are the open queue.
 */
export type OutboxHealth = {
  counts: OutboxCounts;
  /** Oldest createdAt among the counted rows, or null when the queue is empty. */
  oldestCreatedAt: number | null;
};

export const EMPTY_OUTBOX: OutboxHealth = {
  counts: { queued: 0, inflight: 0, failed: 0, dead: 0, conflict: 0 },
  oldestCreatedAt: null,
};

export type PullMeta = {
  lastSyncedAt: string | null;
  lastError: string | null;
};

export type DashboardInput = {
  audience: DashboardAudience;
  projects: readonly DashboardProject[];
  tasks: readonly DashboardTask[];
  activity: readonly DashboardActivity[];
  pull: PullMeta;
  outbox: OutboxHealth;
  writebackEnabled: boolean;
  notices: readonly DashboardNotice[];
  now: number;
};

export type StatCard = {
  label: string;
  value: string;
  note: string;
  tone: 'danger' | 'warning' | 'default';
};

export type StageBar = {
  stage: TaskStage;
  count: number;
  /** Share of the fullest stage, 0–1. */
  share: number;
};

export type AwaitingRow = {
  id: string;
  name: string;
  meta: string;
  stageLabel: string;
  status: string;
  category: string | null;
  projectId: string | null;
  /** "Updated Oct 6", or empty when the task has no date. */
  when: string;
};

export type StaffAwaitingRow = AwaitingRow & { published: boolean };

export type ActivityRow = {
  id: string;
  name: string;
  summary: string;
  when: string;
};

export type StaffActivityRow = ActivityRow & { published: boolean };

export type ProjectRow = {
  id: string;
  name: string;
  brand: string;
  percent: number;
  percentLabel: string;
  itemsLabel: string;
  updatedLabel: string;
};

export type SyncRow = {
  key: 'pull' | 'queue' | 'failed';
  label: string;
  value: string;
  tone: 'danger' | 'warning' | 'muted' | 'ok';
};

export type SyncHealth = {
  cardValue: string;
  cardNote: string;
  rows: readonly SyncRow[];
  notice: { title: string; body: string } | null;
};

export type StaffDashboard = {
  audience: 'staff';
  stats: readonly StatCard[];
  stages: readonly StageBar[];
  sync: SyncHealth;
  awaiting: readonly StaffAwaitingRow[];
  activity: readonly StaffActivityRow[];
};

export type ClientDashboard = {
  audience: 'client';
  stats: readonly StatCard[];
  projects: readonly ProjectRow[];
  awaiting: readonly AwaitingRow[];
  activity: readonly ActivityRow[];
};

export type DashboardModel = StaffDashboard | ClientDashboard;

const DAY = 24 * 60 * 60 * 1000;
/**
 * A successful Notion pull older than this is stale.
 * Sync health must not read OK past this age.
 */
export const SYNC_PULL_STALE_MS = DAY;

/**
 * Matches `OUTBOX_HEALTH_LIMIT` in convex/portalData.ts. The query stops at
 * this many rows per status, so a count at the cap is a lower bound.
 */
export const OUTBOX_HEALTH_LIMIT = 100;

export const CLIENT_AWAITING_LABEL = 'Pending approval';

export function isInternalProject(project: {
  name?: string | null;
  internal?: boolean;
}): boolean {
  if (project.internal) return true;
  return isStaffOnlyProject({ name: project.name, types: [] });
}

function projectById(projects: readonly DashboardProject[]): Map<string, DashboardProject> {
  return new Map(projects.map((project) => [project.id, project]));
}

function taskIsInternal(task: DashboardTask, projects: Map<string, DashboardProject>): boolean {
  if (task.internal) return true;
  const project = task.projectId ? projects.get(task.projectId) : undefined;
  return project ? isInternalProject(project) : false;
}

function clientCanSeeProject(project: DashboardProject): boolean {
  if (project.syncHidden || project.publishToWarehaus === false) return false;
  return !isInternalProject(project);
}

function clientCanSeeTask(task: DashboardTask, projects: Map<string, DashboardProject>): boolean {
  if (task.syncHidden || task.publishToWarehaus === false) return false;
  if (taskIsInternal(task, projects)) return false;
  const project = task.projectId ? projects.get(task.projectId) : undefined;
  if (project && !clientCanSeeProject(project)) return false;
  return true;
}

function staffCanSeeTask(task: DashboardTask): boolean {
  return !task.syncHidden;
}

function visibleTasks(input: DashboardInput, projects: Map<string, DashboardProject>): DashboardTask[] {
  if (input.audience === 'client') {
    return input.tasks.filter((task) => clientCanSeeTask(task, projects));
  }
  return input.tasks.filter((task) => staffCanSeeTask(task));
}

function visibleProjects(input: DashboardInput): DashboardProject[] {
  const projects = input.projects.filter((project) => !project.syncHidden);
  if (input.audience === 'staff') return projects;
  return projects.filter((project) => clientCanSeeProject(project));
}

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value;
  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : time;
}

function inUtcMonth(value: string | null | undefined, now: number, monthOffset: number): boolean {
  const time = parseTime(value);
  if (time == null) return false;
  const cursor = new Date(now);
  const start = Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + monthOffset, 1);
  const end = Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + monthOffset + 1, 1);
  return time >= start && time < end;
}

function monthName(now: number, monthOffset: number): string {
  const cursor = new Date(now);
  const date = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + monthOffset, 1));
  return date.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
}

function relativeTime(iso: string | null, now: number): string | null {
  const time = parseTime(iso);
  if (time == null) return null;
  const minutes = Math.max(0, Math.round((now - time) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

function ageDays(value: string | null | undefined, now: number): number | null {
  const time = parseTime(value);
  if (time == null) return null;
  return Math.max(0, Math.floor((now - time) / DAY));
}

function stageOf(task: DashboardTask): TaskStage | null {
  if (!task.stage) return null;
  return (TASK_STAGES as readonly string[]).includes(task.stage) ? (task.stage as TaskStage) : null;
}

export function stageBars(tasks: readonly DashboardTask[]): StageBar[] {
  const open = tasks.filter((task) => !task.isDone);
  const counts = TASK_STAGES.map((stage) => ({
    stage,
    count: open.filter((task) => stageOf(task) === stage).length,
  }));
  const max = Math.max(1, ...counts.map((row) => row.count));
  return counts.map((row) => ({ ...row, share: row.count / max }));
}

function awaitingSource(tasks: readonly DashboardTask[]): DashboardTask[] {
  return tasks
    .filter((task) => !task.isDone && task.stage === 'Awaiting Go')
    .sort((a, b) => {
      const left = parseTime(a.date ?? a.lastEditedTime) ?? Number.POSITIVE_INFINITY;
      const right = parseTime(b.date ?? b.lastEditedTime) ?? Number.POSITIVE_INFINITY;
      return left - right;
    });
}

function updatedWords(task: DashboardTask): string {
  const raw = task.lastEditedTime ?? task.date;
  if (!raw) return '';
  const label = formatPortalDate(raw);
  return label ? `Updated ${label}` : '';
}

function metaLine(task: DashboardTask, audience: DashboardAudience): string {
  const due = task.date ? `Due ${formatPortalDate(task.date)}` : null;
  if (audience === 'client') {
    return [task.projectName, due].filter(Boolean).join(' · ');
  }
  return [task.clientName, task.projectName, due].filter(Boolean).join(' · ');
}

function shippedNote(thisMonth: number, lastMonth: number, now: number): string {
  const previous = monthName(now, -1);
  const delta = thisMonth - lastMonth;
  if (delta > 0) return `${delta} more than ${previous}`;
  if (delta < 0) return `${Math.abs(delta)} fewer than ${previous}`;
  return `Same as ${previous}`;
}

function oldestNote(tasks: readonly DashboardTask[], now: number): string {
  const ages = tasks
    .map((task) => ageDays(task.date ?? task.lastEditedTime, now))
    .filter((age): age is number => age != null);
  if (ages.length === 0) return 'Waiting on a go';
  const oldest = Math.max(...ages);
  if (oldest === 0) return 'Oldest waiting today';
  return `Oldest waiting ${oldest} day${oldest === 1 ? '' : 's'}`;
}

function clientCount(tasks: readonly DashboardTask[]): number {
  const ids = new Set(
    tasks.map((task) => task.orgId || task.clientName).filter((value): value is string => Boolean(value)),
  );
  return ids.size;
}

function pullIsStale(iso: string | null, now: number): boolean {
  const time = parseTime(iso);
  if (time == null) return false;
  return now - time > SYNC_PULL_STALE_MS;
}

function hitHealthCap(parts: readonly number[]): boolean {
  return parts.some((count) => count >= OUTBOX_HEALTH_LIMIT);
}

function pullValue(pull: PullMeta, now: number): { value: string; tone: SyncRow['tone'] } {
  if (pull.lastError) return { value: 'Failed', tone: 'danger' };
  const ago = relativeTime(pull.lastSyncedAt, now);
  if (pullIsStale(pull.lastSyncedAt, now)) {
    return { value: ago ? `Stale · ${ago}` : 'Stale', tone: 'warning' };
  }
  if (ago) return { value: `In sync · ${ago}`, tone: 'ok' };
  return { value: 'Syncing', tone: 'muted' };
}

function failedWriteNotice(
  failed: number,
  capped: boolean,
  notices: readonly DashboardNotice[],
  tasks: readonly DashboardTask[],
  pull: PullMeta,
): SyncHealth['notice'] {
  const write = notices.find((notice) => notice.edgeCase === 'sync' || notice.edgeCase === 'conflict');
  if (failed > 0) {
    const title = capped
      ? '100+ writes to Notion failed'
      : failed === 1
        ? '1 write to Notion failed'
        : `${failed} writes to Notion failed`;
    const body = write
      ? noticeDisplayMessage(
          write.message,
          tasks.map((task) => ({ name: task.name, notionPageId: task.notionPageId })),
        )
      : 'The write stays in the outbox. Nothing is lost.';
    return { title, body };
  }
  if (pull.lastError) return { title: 'Sync problem', body: pull.lastError };
  return null;
}

export function summarizeSyncHealth(input: {
  pull: PullMeta;
  outbox: OutboxHealth;
  writebackEnabled: boolean;
  notices: readonly DashboardNotice[];
  tasks: readonly DashboardTask[];
  now: number;
}): SyncHealth {
  const counts = input.outbox.counts;
  const failedParts = [counts.failed, counts.dead, counts.conflict];
  const queueParts = [counts.queued, counts.inflight];
  const failed = failedParts.reduce((sum, count) => sum + count, 0);
  const waiting = queueParts.reduce((sum, count) => sum + count, 0);
  const failedCapped = hitHealthCap(failedParts);
  const queue = input.writebackEnabled
    ? {
        value: hitHealthCap(queueParts) ? '100+ waiting' : waiting === 1 ? '1 waiting' : `${waiting} waiting`,
        tone: 'muted' as const,
      }
    : { value: 'Off', tone: 'muted' as const };
  const pull = pullValue(input.pull, input.now);
  const ago = relativeTime(input.pull.lastSyncedAt, input.now);
  const stale = !input.pull.lastError && pullIsStale(input.pull.lastSyncedAt, input.now);
  const troubled = Boolean(input.pull.lastError) || failed > 0;
  return {
    cardValue: troubled ? 'Issue' : stale ? 'Stale' : input.pull.lastSyncedAt ? 'OK' : '…',
    cardNote: input.pull.lastError ?? (ago ? `Last sync ${ago}` : 'Not synced yet'),
    rows: [
      { key: 'pull', label: 'Notion to portal', value: pull.value, tone: pull.tone },
      { key: 'queue', label: 'Portal to Notion queue', value: queue.value, tone: queue.tone },
      {
        key: 'failed',
        label: 'Failed writes (24h)',
        value: failedCapped ? '100+ need a retry' : failed === 0 ? 'None' : failed === 1 ? '1 needs a retry' : `${failed} need a retry`,
        tone: failed > 0 ? 'danger' : 'muted',
      },
    ],
    notice: failedWriteNotice(failed, failedCapped, input.notices, input.tasks, input.pull),
  };
}

function activityWhen(iso: string, now: number): string {
  return relativeTime(iso, now) ?? formatPortalDate(iso);
}

function visibleActivity(input: DashboardInput): DashboardActivity[] {
  // Client rows are already filtered by the feed or getSnapshot.
  return [...input.activity].sort((a, b) => (parseTime(b.timestamp) ?? 0) - (parseTime(a.timestamp) ?? 0));
}

function progressPercent(project: DashboardProject, tasks: readonly DashboardTask[]): number {
  const mine = tasks.filter((task) => task.projectId === project.id);
  if (mine.length > 0) {
    const shipped = mine.filter((task) => task.stage === 'Shipped' || task.isDone).length;
    return Math.round((shipped / mine.length) * 100);
  }
  if (project.progress == null) return 0;
  const pct = project.progress <= 1 ? project.progress * 100 : project.progress;
  return Math.min(100, Math.max(0, Math.round(pct)));
}

function activeProjects(projects: readonly DashboardProject[]): DashboardProject[] {
  return projects.filter((project) => !/ship|done/i.test(project.status));
}

function buildStaff(input: DashboardInput, projects: DashboardProject[], tasks: DashboardTask[]): StaffDashboard {
  const bars = stageBars(tasks);
  const awaiting = awaitingSource(tasks);
  const building = tasks.filter((task) => !task.isDone && task.stage === 'Building');
  const shippedTasks = tasks.filter((task) => task.stage === 'Shipped');
  const thisMonth = shippedTasks.filter((task) => inUtcMonth(task.date ?? task.lastEditedTime, input.now, 0)).length;
  const lastMonth = shippedTasks.filter((task) => inUtcMonth(task.date ?? task.lastEditedTime, input.now, -1)).length;
  const sync = summarizeSyncHealth({
    pull: input.pull,
    outbox: input.outbox,
    writebackEnabled: input.writebackEnabled,
    notices: input.notices,
    tasks,
    now: input.now,
  });
  const clients = clientCount(building);
  return {
    audience: 'staff',
    stats: [
      {
        label: 'Awaiting your go',
        value: String(awaiting.length),
        note: awaiting.length ? oldestNote(awaiting, input.now) : 'Nothing waiting',
        tone: awaiting.length ? 'danger' : 'default',
      },
      {
        label: 'In progress',
        value: String(building.length),
        note: clients ? `Across ${clients} client${clients === 1 ? '' : 's'}` : 'No clients',
        tone: 'default',
      },
      {
        label: 'Shipped this month',
        value: String(thisMonth),
        note: shippedNote(thisMonth, lastMonth, input.now),
        tone: 'default',
      },
      {
        label: 'Sync health',
        value: sync.cardValue,
        note: sync.cardNote,
        tone: sync.cardValue === 'Stale' ? 'warning' : sync.cardValue === 'OK' || sync.cardValue === '…' ? 'default' : 'danger',
      },
    ],
    stages: bars,
    sync,
    awaiting: awaiting.map((task) => ({
      id: task.id,
      name: task.name,
      meta: metaLine(task, 'staff'),
      stageLabel: 'Awaiting Go',
      status: task.status,
      category: task.category ?? null,
      projectId: task.projectId,
      when: updatedWords(task),
      published: task.publishToWarehaus !== false,
    })),
    activity: visibleActivity(input).slice(0, 6).map((item) => ({
      id: item.id,
      name: item.name,
      summary: item.summary,
      when: activityWhen(item.timestamp, input.now),
      published: item.clientVisible === true,
    })),
  };
}

function buildClient(input: DashboardInput, projects: DashboardProject[], tasks: DashboardTask[]): ClientDashboard {
  const awaiting = awaitingSource(tasks);
  const active = activeProjects(projects);
  const weekAgo = input.now - 7 * DAY;
  const activity = visibleActivity(input).filter((item) => {
    const time = parseTime(item.timestamp);
    return time != null && time >= weekAgo;
  });
  const latest = visibleActivity(input)[0];
  const lead = active[0]?.name;
  return {
    audience: 'client',
    stats: [
      {
        label: 'Active projects',
        value: String(active.length),
        note: !lead ? 'None yet' : active.length === 1 ? lead : `${lead} and ${active.length - 1} more`,
        tone: 'default',
      },
      {
        label: 'Needs your attention',
        value: String(awaiting.length),
        note: awaiting.length ? 'Waiting on your approval' : 'Nothing waiting',
        tone: awaiting.length ? 'danger' : 'default',
      },
      {
        label: 'Updates this week',
        value: String(activity.length),
        note: latest ? `Latest: ${formatPortalDate(latest.timestamp)}` : 'No updates',
        tone: 'default',
      },
    ],
    projects: active.slice(0, 6).map((project) => {
      const mine = tasks.filter((task) => task.projectId === project.id);
      const percent = progressPercent(project, tasks);
      const count = mine.length || project.taskCount || 0;
      const updated = project.lastSyncedAt ? formatPortalDate(new Date(project.lastSyncedAt).toISOString()) : null;
      return {
        id: project.id,
        name: project.name,
        brand: project.clientName ? `Brand: ${project.clientName}` : 'Your project',
        percent,
        percentLabel: `${percent}% of items shipped`,
        itemsLabel: `${count} item${count === 1 ? '' : 's'}`,
        updatedLabel: updated ? `Updated ${updated}` : 'Not updated yet',
      };
    }),
    awaiting: awaiting.map((task) => ({
      id: task.id,
      name: task.name,
      meta: metaLine(task, 'client'),
      stageLabel: CLIENT_AWAITING_LABEL,
      status: task.status,
      category: null,
      projectId: task.projectId,
      when: updatedWords(task),
    })),
    activity: visibleActivity(input).slice(0, 6).map((item) => ({
      id: item.id,
      name: item.name,
      summary: item.summary,
      when: activityWhen(item.timestamp, input.now),
    })),
  };
}

export function buildDashboard(input: DashboardInput): DashboardModel {
  const projects = visibleProjects(input);
  const tasks = visibleTasks(input, projectById(input.projects));
  if (input.audience === 'client') return buildClient(input, projects, tasks);
  return buildStaff(input, projects, tasks);
}
