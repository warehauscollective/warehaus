/**
 * Projects and Tasks v2. Stage, Parent item, and Resources are on the Notion
 * Tasks database. Resources is a one-way relation to the database titled
 * Resources (collection 7215c759-…). There is no reverse field: the sync reads
 * page ids from the task and joins them locally. Missing values are tolerated.
 * An unknown stage is stored as no stage and noted. Unknown parents and
 * cross-org links fail closed.
 */

export type TaskWriteProperties = Record<string, string | boolean | string[]>;

export const TASK_STAGES = [
  'Idea',
  'Planning',
  'Awaiting Go',
  'Building',
  'Ready to Ship',
  'Shipped',
  'Parked',
] as const;

export type TaskStage = (typeof TASK_STAGES)[number];

export const LIVE_TASK_STATUSES = ['Inbox', 'To Do', 'Blocked', 'In Progress', 'Done'] as const;

export type LiveTaskStatus = (typeof LIVE_TASK_STATUSES)[number];

/** Staff-only project. Type Internal, and this name even if Type is missing. */
export const WAREHAUS_STUDIO_PROJECT_NAME = 'warehaus.studio';

export const TASK_UNAVAILABLE = 'This task is not available.';

export const PROJECT_UNAVAILABLE = 'This project is not available.';

export const STAGE_LOCK_REASONS = {
  Building: 'Building is set in Notion when Peter says go.',
  Shipped: 'Shipped is set in Notion after client sign-off.',
} as const;

const PULL_REQUEST =
  /^(https:\/\/)?github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+\/?$/i;

export type MoveActor = 'staff' | 'client';

export type MoveRule =
  | { kind: 'allowed' }
  | { kind: 'denied'; reason: string }
  | { kind: 'locked'; reason: string }
  | {
      kind: 'needs';
      reason: string;
      fields: Array<{ key: 'pullRequestLink'; label: string; placeholder: string }>;
    };

export function isTaskStage(value: string): value is TaskStage {
  return (TASK_STAGES as readonly string[]).includes(value);
}

export function isLiveTaskStatus(value: string): value is LiveTaskStatus {
  return (LIVE_TASK_STATUSES as readonly string[]).includes(value);
}

export function isPullRequestLink(value: string): boolean {
  return PULL_REQUEST.test(value.trim());
}

/**
 * Select missing or empty is fine. An unknown name is not a stage: staff see
 * the task in the "No stage yet" lane, and the caller logs `notice`.
 */
export function readOptionalStage(raw: string | null | undefined): {
  ok: true;
  stage: TaskStage | null;
  notice?: string;
} {
  if (raw == null || raw.trim() === '') return { ok: true, stage: null };
  if (!isTaskStage(raw)) {
    return { ok: true, stage: null, notice: `Stage ${JSON.stringify(raw)} is not a portal stage` };
  }
  return { ok: true, stage: raw };
}

/** Outbox actor for a stage move. Clients are recorded as client admins. */
export function stageOutboxActor(actor: MoveActor): 'staff' | 'clientAdmin' {
  return actor === 'client' ? 'clientAdmin' : 'staff';
}

/** createTask may only target a project that already belongs to this client. */
export function taskCreateProjectGate(
  project: { orgId: string } | null | undefined,
  orgId: string,
): { ok: true } | { ok: false; error: string } {
  if (!project || project.orgId !== orgId) {
    return { ok: false, error: 'Project is not in this client' };
  }
  return { ok: true };
}

/** Self-relation. Empty is fine. More than one parent fails closed. */
export function readParentItem(ids: readonly string[]):
  | { ok: true; parentNotionId: string | null }
  | { ok: false; reason: string } {
  const unique = [...new Set(ids.filter((id) => id.length > 0))];
  if (unique.length > 1) return { ok: false, reason: 'Parent item must be one page' };
  return { ok: true, parentNotionId: unique[0] ?? null };
}

export function resolveParentLink(input: {
  parentNotionId: string | null;
  taskOrgId: string;
  parent: { orgId: string; hasParent: boolean } | null;
}): { link: boolean; quarantine?: string } {
  if (!input.parentNotionId) return { link: false };
  if (!input.parent) return { link: false };
  if (input.parent.orgId !== input.taskOrgId) {
    return { link: false, quarantine: 'Parent item belongs to another client' };
  }
  if (input.parent.hasParent) {
    return { link: false, quarantine: 'Parent item is more than one level deep' };
  }
  return { link: true };
}

/** Same org stores a link. A different org is quarantined. A missing resource is skipped. */
export function decideResourceLink(
  taskOrgId: string,
  resourceOrgId: string | null,
): 'store' | 'quarantine' | 'skip' {
  if (!resourceOrgId) return 'skip';
  if (resourceOrgId !== taskOrgId) return 'quarantine';
  return 'store';
}

export function isStaffOnlyProject(input: {
  name?: string | null;
  types?: readonly string[] | null;
}): boolean {
  const name = (input.name ?? '').trim().toLowerCase();
  if (name === WAREHAUS_STUDIO_PROJECT_NAME) return true;
  return (input.types ?? []).includes('Internal');
}

export function clientMaySeeProject(project: {
  name?: string | null;
  types?: readonly string[] | null;
  publishToWarehaus: boolean;
  archive: boolean;
  hidden: boolean;
  orgVisible: boolean;
}): boolean {
  if (!project.orgVisible || project.hidden || project.archive || !project.publishToWarehaus) return false;
  if (isStaffOnlyProject(project)) return false;
  return true;
}

export function clientMaySeeTask(task: {
  publishToWarehaus: boolean;
  hidden: boolean;
  project: {
    name?: string | null;
    types?: readonly string[] | null;
    publishToWarehaus: boolean;
    archive: boolean;
    hidden: boolean;
    orgVisible: boolean;
  };
}): boolean {
  if (task.hidden || !task.publishToWarehaus) return false;
  return clientMaySeeProject(task.project);
}

/** Each child is judged on its own publish flag. */
export function visibleChildIds<T extends { id: string; publishToWarehaus: boolean; hidden?: boolean }>(
  children: readonly T[],
): string[] {
  return children.filter((child) => child.publishToWarehaus && !child.hidden).map((child) => child.id);
}

export function stageMoveRule(actor: MoveActor, stage: string): MoveRule {
  if (actor !== 'staff') return { kind: 'denied', reason: 'Clients cannot move tasks.' };
  if (!isTaskStage(stage)) return { kind: 'denied', reason: 'Unknown stage' };
  if (stage === 'Building' || stage === 'Shipped') {
    return { kind: 'locked', reason: STAGE_LOCK_REASONS[stage] };
  }
  if (stage === 'Ready to Ship') {
    return {
      kind: 'needs',
      reason: 'Ready to Ship needs a pull request link.',
      fields: [
        {
          key: 'pullRequestLink',
          label: 'Pull request link',
          placeholder: 'github.com/…/pull/123',
        },
      ],
    };
  }
  return { kind: 'allowed' };
}

/** An unstaged task can be filed into Idea or Planning. Other stages stay blocked. */
export function unstagedMoveAllowed(destination: string): boolean {
  return destination === 'Idea' || destination === 'Planning';
}

/** Building and Shipped change only in Notion. Null when the card may leave this stage. */
export function notionOnlyStageReason(stage: string): string | null {
  if (stage === 'Building' || stage === 'Shipped') return STAGE_LOCK_REASONS[stage];
  return null;
}

export type BoardDropDecision =
  | { kind: 'ignore' }
  | { kind: 'reject'; reason: string }
  | { kind: 'needs'; rule: Extract<MoveRule, { kind: 'needs' }> }
  | { kind: 'move'; value: string };

/**
 * What a staff or client drop onto a board column is allowed to do.
 * `from` and `to` are the column keys (status name, stage name, or an unknown lane).
 */
export function resolveBoardDrop(input: {
  actor: MoveActor;
  mode: 'status' | 'stage';
  from: string;
  to: string;
}): BoardDropDecision {
  if (!input.to || input.to.startsWith('unknown')) {
    return { kind: 'reject', reason: 'That column is not a destination.' };
  }
  if (input.from === input.to) return { kind: 'ignore' };
  if (input.actor !== 'staff') {
    return { kind: 'reject', reason: 'Clients cannot move tasks.' };
  }
  if (input.mode === 'stage') {
    const leaving = notionOnlyStageReason(input.from);
    if (leaving) return { kind: 'reject', reason: leaving };
    if (!isTaskStage(input.from) && !unstagedMoveAllowed(input.to)) {
      return { kind: 'reject', reason: 'Tasks with no stage can move to Idea or Planning.' };
    }
    const rule = stageMoveRule('staff', input.to);
    if (rule.kind === 'locked' || rule.kind === 'denied') {
      return { kind: 'reject', reason: rule.reason };
    }
    if (rule.kind === 'needs') return { kind: 'needs', rule };
    return { kind: 'move', value: input.to };
  }
  const rule = statusMoveRule('staff', input.to);
  if (rule.kind !== 'allowed') {
    const reason = rule.kind === 'denied' || rule.kind === 'locked' ? rule.reason : 'Unknown status';
    return { kind: 'reject', reason };
  }
  return { kind: 'move', value: input.to };
}

export function statusMoveRule(actor: MoveActor, status: string): MoveRule {
  if (actor !== 'staff') return { kind: 'denied', reason: 'Clients cannot move tasks.' };
  if (!isLiveTaskStatus(status)) return { kind: 'denied', reason: 'Unknown status' };
  return { kind: 'allowed' };
}

export function planTaskStageWrite(input: {
  actor: MoveActor;
  stage: string;
  pullRequestLink?: string;
  notionPageId: string;
  expectedLastEditedTime: string;
}): { ok: true; properties: TaskWriteProperties; idempotencyKey: string } | { ok: false; error: string } {
  const rule = stageMoveRule(input.actor, input.stage);
  if (rule.kind === 'denied' || rule.kind === 'locked') return { ok: false, error: rule.reason };
  if (!input.notionPageId) return { ok: false, error: 'Updates require a Notion page' };
  if (!input.expectedLastEditedTime) return { ok: false, error: 'Updates require the last read time' };
  const properties: TaskWriteProperties = { Stage: input.stage };
  if (rule.kind === 'needs') {
    const link = input.pullRequestLink?.trim() ?? '';
    if (!isPullRequestLink(link)) return { ok: false, error: rule.reason };
    properties['GitHub Issue/PR'] = link;
  }
  if ('Status' in properties) return { ok: false, error: 'Stage moves cannot change Status' };
  return {
    ok: true,
    properties,
    idempotencyKey: `task-stage:${input.notionPageId}:${input.stage}:${properties['GitHub Issue/PR'] ?? ''}:${input.expectedLastEditedTime}`,
  };
}

export function planTaskStatusWrite(input: {
  actor: MoveActor;
  status: string;
  notionPageId: string;
  expectedLastEditedTime: string;
}): { ok: true; properties: TaskWriteProperties; idempotencyKey: string } | { ok: false; error: string } {
  const rule = statusMoveRule(input.actor, input.status);
  if (rule.kind !== 'allowed') return { ok: false, error: rule.reason };
  if (!input.notionPageId) return { ok: false, error: 'Updates require a Notion page' };
  if (!input.expectedLastEditedTime) return { ok: false, error: 'Updates require the last read time' };
  return {
    ok: true,
    properties: { Status: input.status },
    idempotencyKey: `task-status:${input.notionPageId}:${input.status}:${input.expectedLastEditedTime}`,
  };
}

export function createTaskExternalId(token: string): string {
  const cleaned = token.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24);
  return `wh_tsk_${cleaned || 'task'}`;
}

export function planTaskCreate(input: {
  actor: MoveActor;
  name: string;
  status: string;
  projectNotionId: string;
  externalId: string;
  date?: string;
  stage?: string;
}): { ok: true; properties: TaskWriteProperties; idempotencyKey: string } | { ok: false; error: string } {
  if (input.actor !== 'staff') return { ok: false, error: 'Clients cannot move tasks.' };
  const name = input.name.trim();
  if (!name) return { ok: false, error: 'Title is required' };
  if (!isLiveTaskStatus(input.status)) return { ok: false, error: 'Unknown status' };
  if (!input.projectNotionId) return { ok: false, error: 'Project is required' };
  if (!input.externalId.startsWith('wh_tsk_')) return { ok: false, error: 'External ID must start with wh_tsk_' };
  const properties: TaskWriteProperties = {
    Name: name,
    Status: input.status,
    'External ID': input.externalId,
    Source: 'portal',
    'Publish to Warehaus': false,
    Projects: [input.projectNotionId],
  };
  if (input.date) properties.Date = input.date;
  if (input.stage) {
    const rule = stageMoveRule('staff', input.stage);
    if (rule.kind !== 'allowed') {
      return { ok: false, error: rule.reason };
    }
    properties.Stage = input.stage;
  }
  return { ok: true, properties, idempotencyKey: `task-create:${input.externalId}` };
}

export function planTaskResourceWrite(input: {
  actor: MoveActor;
  resourceNotionIds: readonly string[];
  notionPageId: string;
  expectedLastEditedTime: string;
}): { ok: true; properties: TaskWriteProperties; idempotencyKey: string } | { ok: false; error: string } {
  if (input.actor !== 'staff') return { ok: false, error: 'Clients cannot move tasks.' };
  if (!input.notionPageId) return { ok: false, error: 'Updates require a Notion page' };
  if (!input.expectedLastEditedTime) return { ok: false, error: 'Updates require the last read time' };
  const ids = [...new Set(input.resourceNotionIds.filter((id) => id.length > 0))];
  return {
    ok: true,
    properties: { Resources: ids },
    idempotencyKey: `task-resources:${input.notionPageId}:${[...ids].sort().join(',')}:${input.expectedLastEditedTime}`,
  };
}

export function compareBoardCards(
  a: { date?: string | null; lastEditedTime?: string | null; name: string },
  b: { date?: string | null; lastEditedTime?: string | null; name: string },
): number {
  const due = (a.date ?? '9999-99-99').localeCompare(b.date ?? '9999-99-99');
  if (due !== 0) return due;
  const edited = (b.lastEditedTime ?? '').localeCompare(a.lastEditedTime ?? '');
  if (edited !== 0) return edited;
  return a.name.localeCompare(b.name);
}

/**
 * Full resolve passes null and visits every task.
 * An incremental pull passes the Notion page ids it touched. A task is included
 * when it was touched, its parent was touched, or one of its resources was.
 */
export function taskTouchesIncrementalSet(
  task: {
    notionPageId: string;
    parentNotionPageId?: string | null;
    resourceNotionIds?: readonly string[] | null;
  },
  touched: ReadonlySet<string> | null,
): boolean {
  if (!touched) return true;
  if (touched.has(task.notionPageId)) return true;
  if (task.parentNotionPageId && touched.has(task.parentNotionPageId)) return true;
  return (task.resourceNotionIds ?? []).some((id) => touched.has(id));
}

export type BoardColumn<T> = { key: string; label: string; tasks: T[] };

function columnStatus(task: { status: string; isDone: boolean }): string {
  if (task.isDone || task.status === 'Done') return 'Done';
  return task.status;
}

export function boardColumns<T extends { status: string; isDone: boolean; stage?: string | null; date?: string | null; lastEditedTime?: string | null; name: string }>(
  tasks: readonly T[],
  mode: 'status' | 'stage',
  audience: 'staff' | 'client' = 'staff',
): BoardColumn<T>[] {
  const sorted = [...tasks].sort(compareBoardCards);
  if (mode === 'stage') {
    const known = TASK_STAGES.map((stage) => ({
      key: stage,
      label: stage,
      tasks: sorted.filter((task) => task.stage === stage),
    }));
    if (audience === 'client') return known;
    const unstaged = sorted.filter((task) => !task.stage || !isTaskStage(task.stage));
    return [{ key: 'unknown-stage:No stage yet', label: 'No stage yet', tasks: unstaged }, ...known];
  }
  const known = LIVE_TASK_STATUSES.map((status) => ({
    key: status,
    label: status,
    tasks: sorted.filter((task) => columnStatus(task) === status),
  }));
  const extras = new Map<string, T[]>();
  for (const task of sorted) {
    if (isLiveTaskStatus(columnStatus(task))) continue;
    const list = extras.get(task.status) ?? [];
    list.push(task);
    extras.set(task.status, list);
  }
  return [
    ...known,
    ...[...extras.entries()].map(([label, columnTasks]) => ({
      key: `unknown:${label}`,
      label,
      tasks: columnTasks,
    })),
  ];
}
