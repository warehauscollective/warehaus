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
import { MILESTONE_STATUSES } from '@convex/_lib/milestoneStatus';
import { MILESTONE_OBJECTIVE_LIMIT, attachFailureCode, attachFailureStatus } from '@convex/_lib/milestones';
import { PROPOSED_TASKS_MAX, PROPOSED_TASKS_MIN } from '@convex/_lib/milestoneBot';
import { REVIEW_TASK_LIMIT } from '@convex/_lib/milestoneTasks';
import { z } from 'zod';

const limit = z.number().int().min(1).max(API_PAGE_MAX).optional();
const cursor = z.string().min(1).max(2000).optional();
const idempotencyKey = z.string().min(1).max(200);
const stage = z.enum(TASK_STAGES);
const status = z.enum(LIVE_TASK_STATUSES);
/** Statuses a bot may set. Building is claimed by the runner. Shipped is set later, when the tasks are Done. */
const settableMilestoneStatuses = MILESTONE_STATUSES.filter((value) => value !== 'Shipped' && value !== 'Building') as [
  string,
  ...string[],
];
const milestoneStatus = z.enum(settableMilestoneStatuses);
const milestoneStatusWithShipped = z.enum(
  MILESTONE_STATUSES.filter((value) => value !== 'Building') as [string, ...string[]],
);
const milestoneGoals = z.array(z.string().min(1).max(500)).max(20);

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
    description:
      'List milestones on one project. Each has one status: Idea, Planning, Awaiting Go, Building, Ready to Ship, Shipped, or Parked. Approval is the separate review result. The stage and workStatus fields repeat status for one release; read status. New milestones stay unpublished. Page size is 1 to 50.',
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
      'Create one task inside an existing milestone through the staff task path. To start new work, use create_milestone with proposedTasks instead. milestoneId is required: a task only exists inside a milestone on the same project, and a Shipped milestone takes no new tasks. It is stored in the Portal only, like a staff add: no Notion page and no outbox row, so it is on the milestone as soon as this returns. The result has its task id. Send an idempotency key. Retries with the same key replay the first result.',
    write: true,
    schema: {
      projectId: z.string().min(1),
      name: z.string().min(1).max(2000),
      status,
      date: z.string().min(1).max(40).optional(),
      stage: stage.optional(),
      milestoneId: z.string().min(1),
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
      'Update task status, priority, next action, or stage through the staff update path. Last write wins per field. Stage Shipped is allowed when the task has a pull request link and GitHub shows that pull request merged into main. The check runs on this write. Send lastEditedTime from get_task as expectedLastEditedTime and an idempotency key. Leave it out when get_task shows portalOwned true or lastEditedTime null (a Portal-only task). A Portal-only task has no Notion edit time, so any expectedLastEditedTime sent for it is ignored.',
    write: true,
    schema: {
      taskId: z.string().min(1),
      expectedLastEditedTime: z.string().optional(),
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
      'Move a task stage through the staff update path. Last write wins on stage, and the Notion outbox uses the task-stage write. Staff can set Shipped when the task has a pull request link and GitHub shows that pull request merged into main. The check runs on this write. Send lastEditedTime from get_task as expectedLastEditedTime and an idempotency key. Leave it out when get_task shows portalOwned true or lastEditedTime null (a Portal-only task). A Portal-only task has no Notion edit time, so any expectedLastEditedTime sent for it is ignored.',
    write: true,
    schema: {
      taskId: z.string().min(1),
      stage,
      expectedLastEditedTime: z.string().optional(),
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
      'Create a project through the staff project-create path. Pass clientId, or client to create a new client first with the staff client-create path. The new client stays unpublished. The project stays unpublished unless publishToWarehaus is true. A new project has no brief: after creating it, call get_grilling_instructions and grill the user before planning milestones or tasks. Send an idempotency key.',
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
    name: 'update_milestone',
    description:
      'Update a milestone name, objective, goals, or status. Send only the fields that change, and at least one. status and stage are the same field: Idea, Planning, Awaiting Go, Ready to Ship, Shipped, or Parked. Building is set in the Portal, not here. Shipped is allowed when every task that is not Parked is Done. The objective is at most 2000 characters. Sending the stored values again writes nothing. Use record_milestone_review for an approval or a request for changes. Send an idempotency key.',
    write: true,
    schema: {
      milestoneId: z.string().min(1),
      name: z.string().min(1).max(200).optional(),
      objective: z.string().min(1).max(MILESTONE_OBJECTIVE_LIMIT).optional(),
      goals: milestoneGoals.optional(),
      status: milestoneStatusWithShipped.optional(),
      stage: milestoneStatusWithShipped.optional(),
      idempotencyKey,
    },
    call: (args) => ({
      method: 'POST',
      path: '/api/v1/milestones/update',
      idempotencyKey: String(args.idempotencyKey),
      body: defined({
        milestoneId: args.milestoneId,
        name: args.name,
        objective: args.objective,
        goals: args.goals,
        status: args.status,
        stage: args.stage,
      }),
    }),
  },
  {
    name: 'attach_task_to_milestone',
    description:
      'Attach one task to a milestone on the same project. A subtask can be attached on its own. The parent and its other subtasks stay unattached. An already attached task is left as it is. Send an idempotency key.',
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
    name: 'detach_task_from_milestone',
    description:
      'Remove one task from a milestone. The task stays on the project. Send an idempotency key. Retries with the same key replay the first result.',
    write: true,
    schema: {
      milestoneId: z.string().min(1),
      taskId: z.string().min(1),
      idempotencyKey,
    },
    call: (args) => ({
      method: 'POST',
      path: '/api/v1/milestones/detach',
      idempotencyKey: String(args.idempotencyKey),
      body: { milestoneId: args.milestoneId, taskId: args.taskId },
    }),
  },
  {
    name: 'add_task_link',
    description:
      'Add a staff task link. Post a Cursor agent URL with kind `agent`. Kinds that mirror a Notion field go through the update outbox and need lastEditedTime from get_task, except on a Portal-only task (portalOwned true, lastEditedTime null), whose link stays in the portal and ignores any expectedLastEditedTime. Kind `agent` does not write a Notion field. A duplicate link is not written again. Send an idempotency key.',
    write: true,
    schema: {
      taskId: z.string().min(1),
      kind: z.enum(TASK_LINK_KINDS),
      url: z
        .string()
        .min(1)
        .max(2000)
        .refine((value) => {
          try {
            return new URL(value).protocol === 'https:';
          } catch {
            return false;
          }
        }, 'Link URL must start with https'),
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
  {
    name: 'create_milestone',
    description:
      'Create a milestone and its task list in one call. Call list_milestones first and reuse a matching milestone instead of making a second one. Read the brief and propose 3 to 10 concrete tasks in proposedTasks, each one a piece of work a developer can finish and check, in the order they should be done. It starts at Planning. A status you send is kept, except Building and Shipped, which cannot be sent on create. The objective is at most 2000 characters. It stays unpublished. The tasks are stored in the Portal only and are not sent to Notion. Where it was created is taken from the token name. Send an idempotency key. Retries with the same key replay the first result.',
    write: true,
    schema: {
      projectId: z.string().min(1),
      name: z.string().min(1).max(200),
      objective: z.string().min(1).max(MILESTONE_OBJECTIVE_LIMIT),
      goals: milestoneGoals.optional(),
      status: milestoneStatus.optional(),
      proposedTasks: z
        .array(
          z.object({
            title: z.string().min(1).max(200),
            detail: z.string().max(4000).optional(),
          }),
        )
        .min(PROPOSED_TASKS_MIN)
        .max(PROPOSED_TASKS_MAX)
        .optional(),
      idempotencyKey,
    },
    call: (args) => ({
      method: 'POST',
      path: '/api/v1/milestones',
      idempotencyKey: String(args.idempotencyKey),
      body: defined({
        projectId: args.projectId,
        name: args.name,
        objective: args.objective,
        goals: args.goals ?? [],
        status: args.status,
        proposedTasks: args.proposedTasks,
      }),
    }),
  },
  {
    name: 'get_milestone_status',
    description:
      'Read one milestone: status, approval, iteration, the ordered task checklist with origin, the local and Vercel previews, the pull request, and the latest reviews, notes and events. Use the iteration it returns when you approve or request changes.',
    write: false,
    schema: { milestoneId: z.string().min(1) },
    call: (args) => ({
      method: 'GET',
      path: '/api/v1/milestones/item',
      search: search({ id: args.milestoneId as string }),
    }),
  },
  {
    name: 'list_needs_peter',
    description:
      'List what is waiting on Peter, newest first: milestones that reached Ready to Ship and need his review, and tasks a runner is blocked on. Each item has the milestone, the reason (approval or blocked) and a note with the pull request, the local preview command and link, and the approval line or the blocked reason. Raise each one with Peter. An item leaves the list when he approves or requests changes, or when the blocked task is done. At most 20.',
    write: false,
    schema: {},
    call: () => ({ method: 'GET', path: '/api/v1/milestones/needs-peter' }),
  },
  {
    name: 'add_note',
    description:
      'Add a staff note to a milestone. Notes are staff only and are never shown to a client. A note does not change status, approval or tasks. Send an idempotency key.',
    write: true,
    schema: {
      milestoneId: z.string().min(1),
      body: z.string().min(1).max(4000),
      idempotencyKey,
    },
    call: (args) => ({
      method: 'POST',
      path: '/api/v1/milestones/note',
      idempotencyKey: String(args.idempotencyKey),
      body: { milestoneId: args.milestoneId, body: args.body },
    }),
  },
  {
    name: 'approve_milestone',
    description:
      "Record Peter's approval of one milestone iteration. Only the grok-bot token is accepted. Approve needs status Ready to Ship and a preview, and keeps that status. It records the decision only: it does not merge, does not deploy, and does not move the status to Shipped. The same iteration is idempotent with the Portal. A stale iteration is rejected. Send the iteration from get_milestone_status and an idempotency key.",
    write: true,
    schema: {
      milestoneId: z.string().min(1),
      iteration: z.number().int().positive(),
      notes: z.string().max(8000).optional(),
      idempotencyKey,
    },
    call: (args) => ({
      method: 'POST',
      path: `/api/v1/milestones/${String(args.milestoneId)}/review`,
      idempotencyKey: String(args.idempotencyKey),
      body: { iteration: args.iteration, decision: 'approve', notes: args.notes ?? '' },
    }),
  },
  {
    name: 'request_changes',
    description:
      "Record Peter's change request for one milestone iteration. Only the grok-bot token is accepted. Notes are required. Put each change as its own line in newTasks: every line becomes a review task in this milestone. Without newTasks the notes are split into tasks. It starts the next iteration and moves status back to Building. A stale iteration is rejected. Send the iteration from get_milestone_status and an idempotency key.",
    write: true,
    schema: {
      milestoneId: z.string().min(1),
      iteration: z.number().int().positive(),
      notes: z.string().min(1).max(8000),
      newTasks: z.array(z.string().min(1).max(200)).max(REVIEW_TASK_LIMIT).optional(),
      taskIds: z.array(z.string().min(1)).max(50).optional(),
      idempotencyKey,
    },
    call: (args) => ({
      method: 'POST',
      path: `/api/v1/milestones/${String(args.milestoneId)}/review`,
      idempotencyKey: String(args.idempotencyKey),
      body: defined({
        iteration: args.iteration,
        decision: 'request_changes',
        notes: args.notes,
        newTasks: args.newTasks,
        taskIds: args.taskIds,
      }),
    }),
  },
  {
    name: 'record_milestone_review',
    description:
      "Older name for approve_milestone and request_changes, kept for one release. Record Peter's chat approval or change request for one milestone iteration. Only the grok-bot token is accepted. The same iteration is idempotent with the Portal. Notes are required to request changes. A stale iteration is rejected. Approve needs status Ready to Ship and a preview, and keeps that status. Request changes moves status back to Building. The result returns status. This does not write Notion and does not move the status to Shipped.",
    write: true,
    schema: {
      milestoneId: z.string().min(1),
      iteration: z.number().int().positive(),
      decision: z.enum(['approve', 'request_changes']),
      notes: z.string().max(8000).optional(),
      taskIds: z.array(z.string().min(1)).max(50).optional(),
      idempotencyKey,
    },
    call: (args) => ({
      method: 'POST',
      path: `/api/v1/milestones/${String(args.milestoneId)}/review`,
      idempotencyKey: String(args.idempotencyKey),
      body: defined({
        iteration: args.iteration,
        decision: args.decision,
        notes: args.notes ?? '',
        taskIds: args.taskIds,
      }),
    }),
  },
  {
    name: 'get_project_context',
    description:
      'Read one project\'s context: the brief (goal, audience, outOfScope, doneWhen), glossary terms, and recorded decisions. Staff only. summary.incomplete is true when no brief field is set; run a grilling session before planning work on such a project. Read this before asking the user anything about a project, and use the glossary\'s words.',
    write: false,
    schema: { projectId: z.string().min(1) },
    call: (args) => ({ method: 'GET', path: '/api/v1/context', search: { projectId: String(args.projectId) } }),
  },
  {
    name: 'get_grilling_instructions',
    description:
      'Return the Warehaus rules for a grilling session: how to interview the user about a project or feature, and what to save to its context as each point is settled. Call this once at the start of a session, when the user asks to grill, plan, or scope a project or feature, or when get_project_context shows summary.incomplete.',
    write: false,
    schema: {},
    call: () => ({ method: 'GET', path: '/api/v1/context/grilling' }),
  },
  {
    name: 'save_project_brief',
    description:
      'Set brief fields on a project: goal, audience (who it is for), outOfScope, doneWhen. Send only the fields that are settled; a field left out is not changed, and an empty string clears it. Plain sentences, no implementation detail, at most 1200 characters each. Returns the updated context. Send an idempotency key.',
    write: true,
    schema: {
      projectId: z.string().min(1),
      goal: z.string().max(1200).optional(),
      audience: z.string().max(1200).optional(),
      outOfScope: z.string().max(1200).optional(),
      doneWhen: z.string().max(1200).optional(),
      idempotencyKey,
    },
    call: (args) => ({
      method: 'POST',
      path: '/api/v1/context/brief',
      idempotencyKey: String(args.idempotencyKey),
      body: defined({
        projectId: args.projectId,
        goal: args.goal,
        audience: args.audience,
        outOfScope: args.outOfScope,
        doneWhen: args.doneWhen,
      }),
    }),
  },
  {
    name: 'upsert_glossary_term',
    description:
      'Add a term to a project\'s glossary, or change its definition. One call per term, as soon as its meaning is agreed. Terms match without regard to case, so the same term is updated, not added twice. The definition says what the thing is in one or two sentences, with no implementation detail. Send an idempotency key.',
    write: true,
    schema: {
      projectId: z.string().min(1),
      term: z.string().min(1).max(80),
      definition: z.string().min(1).max(600),
      idempotencyKey,
    },
    call: (args) => ({
      method: 'POST',
      path: '/api/v1/context/terms',
      idempotencyKey: String(args.idempotencyKey),
      body: { projectId: args.projectId, term: args.term, definition: args.definition },
    }),
  },
  {
    name: 'record_decision',
    description:
      'Record a decision on a project. Use only when it is hard to reverse, would surprise a later reader, and came from a real trade-off. The title states the decision; body says why and what was turned down. Decisions are numbered per project. Recording the same title again returns the first record. Send an idempotency key.',
    write: true,
    schema: {
      projectId: z.string().min(1),
      title: z.string().min(1).max(200),
      body: z.string().max(2000).optional(),
      idempotencyKey,
    },
    call: (args) => ({
      method: 'POST',
      path: '/api/v1/context/decisions',
      idempotencyKey: String(args.idempotencyKey),
      body: defined({ projectId: args.projectId, title: args.title, body: args.body }),
    }),
  },
];

const toolsByName = new Map(portalTools.map((tool) => [tool.name, tool]));

export function isWriteTool(name: string): boolean {
  return toolsByName.get(name)?.write === true;
}

const ATTACH_FALLBACK = 'The milestone link failed before a reason was returned';

/** Staff attach failures carry a code. A bare "Request failed" is not a result. */
export function presentAttachResult(result: { status: number; body: unknown }): { status: number; body: unknown } {
  if (result.status < 400) return result;
  const record =
    result.body && typeof result.body === 'object' && !Array.isArray(result.body)
      ? (result.body as Record<string, unknown>)
      : null;
  const raw = typeof record?.error === 'string' ? record.error.trim() : '';
  const given = typeof record?.code === 'string' ? record.code : '';
  const code =
    given === 'not_found' ||
    given === 'wrong_project' ||
    given === 'permission' ||
    given === 'already_attached' ||
    given === 'failed'
      ? given
      : attachFailureCode(raw);
  const error = raw && raw !== 'Request failed' ? raw : ATTACH_FALLBACK;
  const status = code === 'failed' ? result.status : attachFailureStatus(code);
  return { status, body: { error, code } };
}

export async function runPortalTool(input: {
  name: string;
  args: Record<string, unknown>;
  scope: 'read' | 'read-write';
  token: string;
  call: (request: ToolCall & { token: string }) => Promise<{ status: number; body: unknown }>;
}): Promise<{ status: number; body: unknown }> {
  if (isWriteTool(input.name) && input.scope !== 'read-write') {
    if (input.name === 'attach_task_to_milestone') {
      return { status: 403, body: { error: 'This token is read-only', code: 'permission' } };
    }
    return { status: 403, body: { error: 'This token is read-only' } };
  }
  const planned = planToolCall(input.name, input.args);
  if (!planned.ok) {
    const denied = { status: planned.status, body: { error: planned.error } };
    return input.name === 'attach_task_to_milestone' ? presentAttachResult(denied) : denied;
  }
  const result = await input.call({ ...planned.call, token: input.token });
  return input.name === 'attach_task_to_milestone' ? presentAttachResult(result) : result;
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
  if (name === 'update_milestone') {
    const data = parsed.data as {
      name?: string;
      objective?: string;
      goals?: string[];
      status?: string;
      stage?: string;
    };
    if (!data.name && !data.objective && !data.goals && !data.status && !data.stage) {
      return { ok: false, status: 400, error: 'At least one field is required' };
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
