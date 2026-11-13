/**
 * Portal MCP tools. Each one calls a staff /api/v1 route.
 * Writes send the idempotency key as a header, not a body field.
 */

import {
  API_PAGE_MAX,
  LIVE_TASK_STATUSES,
  TASK_LINK_KINDS,
  TASK_STAGES,
  taskListPlan,
} from '@warehaus/portal-sync';
import { z } from 'zod';

const limit = z.number().int().min(1).max(API_PAGE_MAX).optional();
const cursor = z.string().min(1).max(2000).optional();
const idempotencyKey = z.string().min(1).max(200);
const stage = z.enum(TASK_STAGES);
const status = z.enum(LIVE_TASK_STATUSES);

export type ToolCall = {
  method: 'GET' | 'POST';
  path: string;
  search?: Record<string, string>;
  body?: Record<string, unknown>;
  idempotencyKey?: string;
};

type ReadArgs = Record<string, unknown>;

function search(entries: Record<string, string | number | undefined>): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(entries)) {
    if (value == null || value === '') continue;
    out[key] = String(value);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function defined(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined));
}

export type PortalTool = {
  name: string;
  description: string;
  write: boolean;
  schema: z.ZodRawShape;
  call: (args: ReadArgs) => ToolCall;
};

export const portalTools: PortalTool[] = [
  {
    name: 'list_projects',
    description:
      'List staff-visible projects, including unpublished drafts. Omit concealed clients. Page size is 1 to 50. A page can be shorter than the limit while more results remain. Pass orgId to stay on one client.',
    write: false,
    schema: { orgId: z.string().min(1).optional(), cursor, limit },
    call: (args) => ({
      method: 'GET',
      path: '/api/v1/projects',
      search: search({ orgId: args.orgId as string | undefined, cursor: args.cursor as string | undefined, limit: args.limit as number | undefined }),
    }),
  },
  {
    name: 'get_project',
    description: 'Read one staff-visible project, including an unpublished draft. Concealed clients return not found.',
    write: false,
    schema: { projectId: z.string().min(1) },
    call: (args) => ({ method: 'GET', path: '/api/v1/projects/item', search: { id: String(args.projectId) } }),
  },
  {
    name: 'list_clients',
    description:
      'List staff-visible clients. Disabled portal access is included. Trash, archive, and quarantine are omitted. Page size is 1 to 50. A page can be shorter than the limit while more results remain.',
    write: false,
    schema: { cursor, limit },
    call: (args) => ({
      method: 'GET',
      path: '/api/v1/clients',
      search: search({ cursor: args.cursor as string | undefined, limit: args.limit as number | undefined }),
    }),
  },
  {
    name: 'get_client',
    description: 'Read one staff-visible client. A concealed client returns not found.',
    write: false,
    schema: { clientId: z.string().min(1) },
    call: (args) => ({ method: 'GET', path: '/api/v1/clients/item', search: { id: String(args.clientId) } }),
  },
  {
    name: 'list_tasks',
    description:
      'List staff-visible tasks. Filter by project, milestone, stage, or updatedSince (milliseconds). Status is an optional extra filter. Milestone cannot be combined with status, stage, or updatedSince. Page size is 1 to 50. A page can be shorter than the limit while more results remain, because concealed rows are skipped.',
    write: false,
    schema: {
      projectId: z.string().min(1).optional(),
      milestoneId: z.string().min(1).optional(),
      stage: stage.optional(),
      status: status.optional(),
      updatedSince: z.number().int().nonnegative().optional(),
      cursor,
      limit,
    },
    call: (args) => ({
      method: 'GET',
      path: '/api/v1/tasks',
      search: search({
        projectId: args.projectId as string | undefined,
        milestoneId: args.milestoneId as string | undefined,
        stage: args.stage as string | undefined,
        status: args.status as string | undefined,
        updatedSince: args.updatedSince as number | undefined,
        cursor: args.cursor as string | undefined,
        limit: args.limit as number | undefined,
      }),
    }),
  },
  {
    name: 'get_task',
    description: 'Read one staff-visible task, including its stage, lastEditedTime, links, and comments. Use lastEditedTime on later writes.',
    write: false,
    schema: { taskId: z.string().min(1) },
    call: (args) => ({ method: 'GET', path: '/api/v1/tasks/item', search: { id: String(args.taskId) } }),
  },
  {
    name: 'list_milestones',
    description: 'List milestones on one project. New milestones stay unpublished. Page size is 1 to 50.',
    write: false,
    schema: { projectId: z.string().min(1), cursor, limit },
    call: (args) => ({
      method: 'GET',
      path: '/api/v1/milestones',
      search: search({
        projectId: String(args.projectId),
        cursor: args.cursor as string | undefined,
        limit: args.limit as number | undefined,
      }),
    }),
  },
  {
    name: 'create_task',
    description:
      'Create a task through the staff task path. It stays unpublished and is queued on the Notion outbox. Send an idempotency key. Retries with the same key replay the first result.',
    write: true,
    schema: {
      projectId: z.string().min(1),
      name: z.string().min(1).max(2000),
      status,
      date: z.string().min(1).max(40).optional(),
      stage: stage.optional(),
      milestoneId: z.string().min(1).optional(),
      idempotencyKey,
    },
    call: (args) => ({
      method: 'POST',
      path: '/api/v1/tasks',
      idempotencyKey: String(args.idempotencyKey),
      body: defined({
        projectId: args.projectId,
        name: args.name,
        status: args.status,
        date: args.date,
        stage: args.stage,
        milestoneId: args.milestoneId,
      }),
    }),
  },
  {
    name: 'update_task',
    description:
      'Update task status, priority, next action, or stage through the staff update path. Last write wins per field. Send lastEditedTime from get_task and an idempotency key.',
    write: true,
    schema: {
      taskId: z.string().min(1),
      expectedLastEditedTime: z.string().min(1),
      status: status.optional(),
      priority: z.string().max(200).nullable().optional(),
      nextAction: z.string().max(500).nullable().optional(),
      stage: stage.optional(),
      pullRequestLink: z.string().min(1).optional(),
      idempotencyKey,
    },
    call: (args) => ({
      method: 'POST',
      path: '/api/v1/tasks/update',
      idempotencyKey: String(args.idempotencyKey),
      body: defined({
        taskId: args.taskId,
        expectedLastEditedTime: args.expectedLastEditedTime,
        status: args.status,
        priority: args.priority,
        nextAction: args.nextAction,
        stage: args.stage,
        pullRequestLink: args.pullRequestLink,
      }),
    }),
  },
  {
    name: 'move_task_stage',
    description:
      'Move a task stage through the staff update path. Last write wins on stage, and the Notion outbox uses the task-stage write. Ready to Ship needs a pull request link. Send lastEditedTime from get_task and an idempotency key.',
    write: true,
    schema: {
      taskId: z.string().min(1),
      stage,
      expectedLastEditedTime: z.string().min(1),
      pullRequestLink: z.string().min(1).optional(),
      idempotencyKey,
    },
    call: (args) => ({
      method: 'POST',
      path: '/api/v1/tasks/update',
      idempotencyKey: String(args.idempotencyKey),
      body: defined({
        taskId: args.taskId,
        expectedLastEditedTime: args.expectedLastEditedTime,
        stage: args.stage,
        pullRequestLink: args.pullRequestLink,
      }),
    }),
  },
  {
    name: 'create_client',
    description:
      'Create a client through the staff client-create path. The client stays Disabled, unpublished, and staff-only. No invite and no email. Send an idempotency key.',
    write: true,
    schema: {
      companyName: z.string().min(1).max(2000),
      primaryEmail: z.string().min(1).max(200).optional(),
      phone: z.string().min(1).max(40).optional(),
      idempotencyKey,
    },
    call: (args) => ({
      method: 'POST',
      path: '/api/v1/clients',
      idempotencyKey: String(args.idempotencyKey),
      body: defined({
        companyName: args.companyName,
        primaryEmail: args.primaryEmail,
        phone: args.phone,
      }),
    }),
  },
  {
    name: 'create_project',
    description:
      'Create a project through the staff project-create path. Pass clientId, or client to create a new client first with the staff client-create path. The new client stays unpublished. The project stays unpublished unless publishToWarehaus is true. Send an idempotency key.',
    write: true,
    schema: {
      name: z.string().min(1).max(2000),
      clientId: z.string().min(1).optional(),
      client: z
        .object({
          companyName: z.string().min(1).max(2000),
          primaryEmail: z.string().min(1).max(200).optional(),
          phone: z.string().min(1).max(40).optional(),
        })
        .optional(),
      externalId: z.string().min(1).max(80).optional(),
      publishToWarehaus: z.boolean().optional(),
      idempotencyKey,
    },
    call: (args) => ({
      method: 'POST',
      path: '/api/v1/projects',
      idempotencyKey: String(args.idempotencyKey),
      body: defined({
        name: args.name,
        clientId: args.clientId,
        client: args.client,
        externalId: args.externalId,
        publishToWarehaus: args.publishToWarehaus,
      }),
    }),
  },
  {
    name: 'attach_task_to_milestone',
    description:
      'Attach a task to a milestone with the same rules as the staff milestone control. An already attached task is left as it is. Send an idempotency key.',
    write: true,
    schema: {
      milestoneId: z.string().min(1),
      taskId: z.string().min(1),
      idempotencyKey,
    },
    call: (args) => ({
      method: 'POST',
      path: '/api/v1/milestones/attach',
      idempotencyKey: String(args.idempotencyKey),
      body: { milestoneId: args.milestoneId, taskId: args.taskId },
    }),
  },
  {
    name: 'add_task_link',
    description:
      'Add a staff task link. Kinds that mirror a Notion field go through the update outbox and need lastEditedTime from get_task. A duplicate link is not written again. Send an idempotency key.',
    write: true,
    schema: {
      taskId: z.string().min(1),
      kind: z.enum(TASK_LINK_KINDS),
      url: z.string().min(1).max(2000),
      title: z.string().min(1).max(200).optional(),
      expectedLastEditedTime: z.string().min(1).optional(),
      idempotencyKey,
    },
    call: (args) => ({
      method: 'POST',
      path: '/api/v1/links',
      idempotencyKey: String(args.idempotencyKey),
      body: defined({
        taskId: args.taskId,
        kind: args.kind,
        url: args.url,
        title: args.title,
        expectedLastEditedTime: args.expectedLastEditedTime,
      }),
    }),
  },
];

const toolsByName = new Map(portalTools.map((tool) => [tool.name, tool]));

export function isWriteTool(name: string): boolean {
  return toolsByName.get(name)?.write === true;
}

export async function runPortalTool(input: {
  name: string;
  args: Record<string, unknown>;
  scope: 'read' | 'read-write';
  token: string;
  call: (request: ToolCall & { token: string }) => Promise<{ status: number; body: unknown }>;
}): Promise<{ status: number; body: unknown }> {
  if (isWriteTool(input.name) && input.scope !== 'read-write') {
    return { status: 403, body: { error: 'This token is read-only' } };
  }
  const planned = planToolCall(input.name, input.args);
  if (!planned.ok) return { status: planned.status, body: { error: planned.error } };
  return input.call({ ...planned.call, token: input.token });
}

export function planToolCall(
  name: string,
  args: ReadArgs,
): { ok: true; call: ToolCall } | { ok: false; status: 400 | 404; error: string } {
  const tool = toolsByName.get(name);
  if (!tool) return { ok: false, status: 404, error: 'Unknown tool' };
  const parsed = z.object(tool.schema).safeParse(args);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path?.length ? `${issue.path.join('.')}: ` : '';
    return { ok: false, status: 400, error: `${path}${issue?.message ?? 'Invalid arguments'}` };
  }
  if (name === 'create_project') {
    const body = parsed.data as { clientId?: string; client?: unknown };
    if (Boolean(body.clientId) === Boolean(body.client)) {
      return { ok: false, status: 400, error: 'Provide a clientId or a new client' };
    }
  }
  if (name === 'list_tasks') {
    const data = parsed.data as {
      projectId?: string;
      milestoneId?: string;
      status?: string;
      stage?: string;
      updatedSince?: number;
    };
    const plan = taskListPlan(data);
    if (!plan.ok) return { ok: false, status: 400, error: plan.error };
  }
  return { ok: true, call: tool.call(parsed.data) };
}
