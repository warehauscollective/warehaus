import { TASK_DESCRIPTION_MAX } from './taskDescription';
import type {
  LinearIo,
  LinearOrgRead,
  MilestoneSeam,
  MilestoneWorkStatus,
  PlatformRead,
  PlatformTaskRead,
  TaskPlatformAdapter,
  TaskPlatformEnv,
} from './taskPlatform';

export const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql';

const PAGE_SIZE = 50;
const MAX_PAGES = 4;
const LINEAR_API_KEY_ENV = 'LINEAR_API_KEY' as const;

const ISSUES_QUERY = `query LinearIssues($first: Int!, $after: String) {
  issues(first: $first, after: $after, includeArchived: false) {
    nodes {
      id
      title
      description
      dueDate
      updatedAt
      completedAt
      state { type }
      project { id name }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

const MILESTONES_QUERY = `query LinearProjectMilestones($first: Int!, $after: String) {
  projectMilestones(first: $first, after: $after, includeArchived: false) {
    nodes {
      id
      name
      description
      progress
      status
      project { id name }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

const STATE_STATUS: Record<string, { status: string; isDone: boolean }> = {
  triage: { status: 'Inbox', isDone: false },
  backlog: { status: 'To Do', isDone: false },
  unstarted: { status: 'To Do', isDone: false },
  started: { status: 'In Progress', isDone: false },
  completed: { status: 'Done', isDone: true },
  canceled: { status: 'Done', isDone: true },
  cancelled: { status: 'Done', isDone: true },
};

function configuredKey(env: TaskPlatformEnv): string | null {
  const raw = env.LINEAR_API_KEY;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function notConfigured(): {
  ok: false;
  platform: 'linear';
  reason: 'not-configured';
  env: typeof LINEAR_API_KEY_ENV;
} {
  return { ok: false, platform: 'linear', reason: 'not-configured', env: LINEAR_API_KEY_ENV };
}

function unavailable(): { ok: false; platform: 'linear'; reason: 'unavailable' } {
  return { ok: false, platform: 'linear', reason: 'unavailable' };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function fetchImpl(io?: LinearIo): typeof fetch {
  return io?.fetch ?? globalThis.fetch.bind(globalThis);
}

function milestoneWorkStatus(status: string | null, progress: number | null): MilestoneWorkStatus {
  if (status === 'done') return 'ready';
  if (status === 'next' || status === 'overdue') return 'active';
  if (status === 'unstarted') return 'draft';
  if (progress != null && progress >= 1) return 'ready';
  if (progress != null && progress > 0) return 'active';
  return 'draft';
}

export function mapLinearIssue(node: unknown): PlatformTaskRead | null {
  const issue = asRecord(node);
  if (!issue) return null;
  const id = text(issue.id);
  const name = text(issue.title);
  if (!id || !name) return null;
  const state = asRecord(issue.state);
  const type = text(state?.type)?.toLowerCase() ?? '';
  const completedAt = text(issue.completedAt);
  let mapped = STATE_STATUS[type] ?? { status: 'To Do', isDone: false };
  if (completedAt && type !== 'canceled' && type !== 'cancelled') {
    mapped = { status: 'Done', isDone: true };
  }
  const project = asRecord(issue.project);
  const description = text(issue.description);
  return {
    id,
    name,
    status: mapped.status,
    isDone: mapped.isDone,
    date: text(issue.dueDate),
    stage: null,
    lastEditedTime: text(issue.updatedAt),
    projectId: text(project?.id),
    projectName: text(project?.name),
    projectStatus: null,
    projectEndDate: null,
    description: description ? description.slice(0, TASK_DESCRIPTION_MAX) : null,
  };
}

export function mapLinearMilestone(node: unknown): MilestoneSeam | null {
  const milestone = asRecord(node);
  if (!milestone) return null;
  const id = text(milestone.id);
  const name = text(milestone.name);
  const project = asRecord(milestone.project);
  const projectId = text(project?.id);
  if (!id || !name || !projectId) return null;
  const progress = typeof milestone.progress === 'number' && Number.isFinite(milestone.progress)
    ? milestone.progress
    : null;
  return {
    id,
    projectId,
    name,
    objective: text(milestone.description) ?? '',
    goals: [],
    workStatus: milestoneWorkStatus(text(milestone.status), progress),
    approval: 'unreviewed',
  };
}

type ConnectionPage = {
  nodes: unknown[];
  hasNextPage: boolean;
  endCursor: string | null;
};

function readPage(payload: unknown, root: 'issues' | 'projectMilestones'): ConnectionPage | null {
  const record = asRecord(payload);
  if (!record) return null;
  if (Array.isArray(record.errors) && record.errors.length > 0) return null;
  const data = asRecord(record.data);
  const connection = data ? asRecord(data[root]) : null;
  if (!connection || !Array.isArray(connection.nodes)) return null;
  const pageInfo = asRecord(connection.pageInfo);
  const endCursor = text(pageInfo?.endCursor);
  return {
    nodes: connection.nodes,
    hasNextPage: pageInfo?.hasNextPage === true && endCursor != null,
    endCursor,
  };
}

async function readConnection(input: {
  key: string;
  query: string;
  root: 'issues' | 'projectMilestones';
  fetchImpl: typeof fetch;
}): Promise<{ ok: true; nodes: unknown[] } | { ok: false }> {
  const nodes: unknown[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    let response: Response;
    try {
      response = await input.fetchImpl(LINEAR_GRAPHQL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: input.key,
        },
        body: JSON.stringify({
          query: input.query,
          variables: { first: PAGE_SIZE, after },
        }),
      });
    } catch {
      return { ok: false };
    }
    if (!response.ok) return { ok: false };
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { ok: false };
    }
    const parsed = readPage(payload, input.root);
    if (!parsed) return { ok: false };
    nodes.push(...parsed.nodes);
    if (!parsed.hasNextPage || !parsed.endCursor) break;
    after = parsed.endCursor;
  }
  return { ok: true, nodes };
}

export async function readLinearTasks(
  env: TaskPlatformEnv,
  io?: LinearIo,
): Promise<PlatformRead<PlatformTaskRead>> {
  const key = configuredKey(env);
  if (!key) return notConfigured();
  const connection = await readConnection({
    key,
    query: ISSUES_QUERY,
    root: 'issues',
    fetchImpl: fetchImpl(io),
  });
  if (!connection.ok) return unavailable();
  const items: PlatformTaskRead[] = [];
  for (const node of connection.nodes) {
    const task = mapLinearIssue(node);
    if (task) items.push(task);
  }
  return { ok: true, platform: 'linear', items };
}

export async function readLinearMilestones(
  env: TaskPlatformEnv,
  io?: LinearIo,
): Promise<PlatformRead<MilestoneSeam>> {
  const key = configuredKey(env);
  if (!key) return notConfigured();
  const connection = await readConnection({
    key,
    query: MILESTONES_QUERY,
    root: 'projectMilestones',
    fetchImpl: fetchImpl(io),
  });
  if (!connection.ok) return unavailable();
  const items: MilestoneSeam[] = [];
  for (const node of connection.nodes) {
    const milestone = mapLinearMilestone(node);
    if (milestone) items.push(milestone);
  }
  return { ok: true, platform: 'linear', items };
}

export async function readLinearPlatform(
  env: TaskPlatformEnv,
  io?: LinearIo,
): Promise<{ tasks: PlatformRead<PlatformTaskRead>; milestones: PlatformRead<MilestoneSeam> }> {
  const [tasks, milestones] = await Promise.all([
    readLinearTasks(env, io),
    readLinearMilestones(env, io),
  ]);
  return { tasks, milestones };
}

export function linearOrgRead(
  orgId: string,
  read: { tasks: PlatformRead<PlatformTaskRead>; milestones: PlatformRead<MilestoneSeam> },
): LinearOrgRead {
  if (!read.tasks.ok) {
    return read.tasks.reason === 'not-configured' ? notConfigured() : unavailable();
  }
  return {
    ok: true,
    platform: 'linear',
    orgId,
    tasks: read.tasks.items.map((task) => ({ ...task, orgId, source: 'linear' as const })),
    milestones: read.milestones.ok
      ? read.milestones.items.map((item) => ({ ...item, goals: [...item.goals] }))
      : [],
    milestonesUnavailable: !read.milestones.ok,
  };
}

/**
 * Live Linear read. Convex queries do not call this.
 * They use the sync preview, which returns remote when the key is set.
 */
export const linearTaskPlatform: TaskPlatformAdapter = {
  platform: 'linear',
  readTasks(_tasks, env, io) {
    return readLinearTasks(env, io);
  },
  readMilestones(env, io) {
    return readLinearMilestones(env, io);
  },
};
