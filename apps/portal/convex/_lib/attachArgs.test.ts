import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConvexError, convexToJson, type Value } from 'convex/values';
import { handlePortalMcp } from '../../src/lib/mcp/handle';
import { portalTools } from '../../src/lib/mcp/tools';
import * as clientCreate from '../clientCreate';
import * as portalCatalog from '../portalCatalog';
import { portalApiHttp } from '../portalApi';
import * as portalApi from '../portalApi';
import * as projectContextApi from '../projectContextApi';
import * as projectCreate from '../projectCreate';
import * as milestones from '../milestones';

const BEARER = 'Bearer whp_testtokenvalue0001';
const ACCEPT = 'application/json, text/event-stream';

type FieldValidator = { fieldType: ValidatorJson; optional: boolean };
type ValidatorJson = { type: string; value?: unknown };

function objectFields(validator: ValidatorJson): Record<string, FieldValidator> | null {
  if (validator.type !== 'object' || !validator.value || typeof validator.value !== 'object' || Array.isArray(validator.value)) {
    return null;
  }
  return validator.value as Record<string, FieldValidator>;
}

type Registered = { exportArgs: () => string };

const functions: Record<string, Registered> = {
  'portalApi:consumeToken': portalApi.consumeToken as unknown as Registered,
  'portalApi:rememberResult': portalApi.rememberResult as unknown as Registered,
  'portalApi:createTask': portalApi.createTask as unknown as Registered,
  'portalApi:updateTask': portalApi.updateTask as unknown as Registered,
  'portalApi:createMilestone': portalApi.createMilestone as unknown as Registered,
  'portalApi:updateMilestone': portalApi.updateMilestone as unknown as Registered,
  'portalApi:addComment': portalApi.addComment as unknown as Registered,
  'portalApi:addLink': portalApi.addLink as unknown as Registered,
  'portalApi:attachTask': portalApi.attachTask as unknown as Registered,
  'portalApi:detachTask': portalApi.detachTask as unknown as Registered,
  'portalApi:taskPullRequest': portalApi.taskPullRequest as unknown as Registered,
  'portalApi:openWrite': portalApi.openWrite as unknown as Registered,
  'portalApi:closeWrite': portalApi.closeWrite as unknown as Registered,
  'portalCatalog:tokenHomeOrg': portalCatalog.tokenHomeOrg as unknown as Registered,
  'clientCreate:createForToken': clientCreate.createForToken as unknown as Registered,
  'projectCreate:createForToken': projectCreate.createForToken as unknown as Registered,
  'milestones:reviewForApi': milestones.reviewForApi as unknown as Registered,
  'projectContextApi:saveBrief': projectContextApi.saveBrief as unknown as Registered,
  'projectContextApi:upsertTerm': projectContextApi.upsertTerm as unknown as Registered,
  'projectContextApi:recordDecision': projectContextApi.recordDecision as unknown as Registered,
};

const functionName = Symbol.for('functionName');

function refName(ref: unknown): string {
  const name = (ref as { [key: symbol]: unknown })[functionName];
  if (typeof name !== 'string') throw new Error('not a function reference');
  return name;
}

function rejectExtraFields(validator: ValidatorJson, value: unknown): void {
  const fields = objectFields(validator);
  if (fields) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new ConvexError('ArgumentValidationError: Value does not match validator.');
    }
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (!(key in fields)) {
        throw new ConvexError(
          `ArgumentValidationError: Object contains extra field \`${key}\` that is not in the validator.`,
        );
      }
    }
    for (const [key, field] of Object.entries(fields)) {
      if (record[key] === undefined) {
        if (!field.optional) {
          throw new ConvexError(`ArgumentValidationError: Missing required field \`${key}\`.`);
        }
        continue;
      }
      rejectExtraFields(field.fieldType, record[key]);
    }
    return;
  }
  if (validator.type === 'array') {
    if (!Array.isArray(value) || !validator.value || typeof validator.value !== 'object') {
      throw new ConvexError('ArgumentValidationError: Value does not match validator.');
    }
    for (const item of value) rejectExtraFields(validator.value as ValidatorJson, item);
    return;
  }
  if (validator.type === 'union' && Array.isArray(validator.value)) {
    const errors: unknown[] = [];
    for (const member of validator.value) {
      try {
        rejectExtraFields(member as ValidatorJson, value);
        return;
      } catch (error) {
        errors.push(error);
      }
    }
    throw errors[0] ?? new ConvexError('ArgumentValidationError: Value does not match validator.');
  }
}

type Call = { name: string; args: Record<string, unknown> };

function validatingCtx(calls: Call[]) {
  const check = (ref: unknown, args: Record<string, unknown> | undefined) => {
    const name = refName(ref);
    const registered = functions[name];
    if (!registered) throw new Error(`No validator registered for ${name}`);
    const payload = convexToJson((args ?? {}) as Value) as Record<string, unknown>;
    calls.push({ name, args: payload });
    rejectExtraFields(JSON.parse(registered.exportArgs()) as ValidatorJson, payload);
    return payload;
  };
  return {
    async runMutation(ref: unknown, args?: Record<string, unknown>) {
      const name = refName(ref);
      check(ref, args);
      if (name === 'portalApi:consumeToken') {
        return { ok: true as const, tokenId: 'apiTokens:token', name: 'claude', scope: 'read-write' as const };
      }
      if (name === 'portalApi:openWrite') return { action: 'start' as const, id: 'apiIdempotency:row' };
      if (name === 'portalApi:closeWrite') {
        return { status: args?.status, body: JSON.parse(String(args?.body ?? 'null')) as unknown };
      }
      if (name === 'portalApi:rememberResult') {
        return { status: args?.status, body: JSON.parse(String(args?.body ?? 'null')) as unknown };
      }
      return { status: 200, body: { ok: true, id: 'wrote' } };
    },
    async runQuery(ref: unknown, args?: Record<string, unknown>) {
      check(ref, args);
      return 'clients:home';
    },
    async runAction(ref: unknown, args?: Record<string, unknown>) {
      check(ref, args);
      return { ok: true as const, clientId: 'clients:made', projectId: 'projects:made', notionPageId: 'page', reused: false };
    },
  };
}

const http = portalApiHttp as unknown as {
  _handler: (ctx: ReturnType<typeof validatingCtx>, request: Request) => Promise<Response>;
};

async function postApi(
  path: string,
  body: Record<string, unknown>,
  idempotencyKey: string,
): Promise<{ status: number; body: unknown; calls: Call[] }> {
  const calls: Call[] = [];
  const response = await http._handler(
    validatingCtx(calls),
    new Request(`https://portal.test${path}`, {
      method: 'POST',
      headers: {
        authorization: BEARER,
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
      },
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, body: (await response.json()) as unknown, calls };
}

function mcpRequest(name: string, args: Record<string, unknown>) {
  return new Request('https://portal.test/api/mcp', {
    method: 'POST',
    headers: {
      accept: ACCEPT,
      'content-type': 'application/json',
      authorization: BEARER,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });
}

async function callMcpTool(name: string, args: Record<string, unknown>) {
  const calls: Call[] = [];
  const response = await handlePortalMcp(mcpRequest(name, args), {
    lookup: async () => ({ ok: true, scope: 'read-write' }),
    call: async (input) => {
      const url = new URL(input.path, 'https://portal.test');
      for (const [key, value] of Object.entries(input.search ?? {})) url.searchParams.set(key, value);
      const response = await http._handler(
        validatingCtx(calls),
        new Request(url, {
          method: input.method,
          headers: {
            authorization: `Bearer ${input.token}`,
            ...(input.body ? { 'content-type': 'application/json' } : {}),
            ...(input.idempotencyKey ? { 'idempotency-key': input.idempotencyKey } : {}),
          },
          body: input.body ? JSON.stringify(input.body) : undefined,
        }),
      );
      return { status: response.status, body: (await response.json()) as unknown };
    },
  });
  const payload = (await response.json()) as {
    result?: { isError?: boolean; content?: Array<{ text?: string }> };
  };
  const text = payload.result?.content?.[0]?.text ?? '';
  return {
    httpStatus: response.status,
    isError: payload.result?.isError === true,
    body: text ? (JSON.parse(text) as unknown) : null,
    calls,
  };
}

const writeTools: Record<string, Record<string, unknown>> = {
  create_task: {
    projectId: 'projects:1',
    name: 'Draft a page',
    status: 'Inbox',
    milestoneId: 'milestones:1',
    idempotencyKey: 'task-1',
  },
  update_task: {
    taskId: 'tasks:1',
    expectedLastEditedTime: '2026-01-01T00:00:00.000Z',
    status: 'To Do',
    idempotencyKey: 'task-2',
  },
  move_task_stage: {
    taskId: 'tasks:1',
    stage: 'Planning',
    expectedLastEditedTime: '2026-01-01T00:00:00.000Z',
    idempotencyKey: 'task-3',
  },
  create_client: { companyName: 'Northwind', idempotencyKey: 'client-1' },
  create_project: { name: 'Website', clientId: 'clients:1', idempotencyKey: 'project-1' },
  save_project_brief: { projectId: 'projects:1', goal: 'One portal.', doneWhen: '', idempotencyKey: 'brief-1' },
  upsert_glossary_term: {
    projectId: 'projects:1',
    term: 'Milestone',
    definition: 'A reviewable unit of work.',
    idempotencyKey: 'term-1',
  },
  record_decision: { projectId: 'projects:1', title: 'Tasks live only inside milestones.', idempotencyKey: 'decision-1' },
  create_milestone: {
    projectId: 'projects:1',
    name: 'Launch site',
    objective: 'Ship the public site.',
    goals: ['Home page live'],
    status: 'Planning',
    idempotencyKey: 'mile-create-1',
  },
  update_milestone: {
    milestoneId: 'milestones:1',
    name: 'Launch',
    status: 'Shipped',
    stage: 'Shipped',
    idempotencyKey: 'mile-edit',
  },
  attach_task_to_milestone: { milestoneId: 'milestones:1', taskId: 'tasks:1', idempotencyKey: 'mile-1' },
  detach_task_from_milestone: { milestoneId: 'milestones:1', taskId: 'tasks:1', idempotencyKey: 'mile-off' },
  add_task_link: {
    taskId: 'tasks:1',
    kind: 'agent',
    url: 'https://cursor.com/agents/bc-example',
    idempotencyKey: 'link-1',
  },
  record_milestone_review: {
    milestoneId: 'milestones:1',
    iteration: 2,
    decision: 'approve',
    notes: '',
    idempotencyKey: 'review-1',
  },
};

describe('MCP attach arguments', () => {
  it('calls attach through the MCP handler with the real mutation arguments', async () => {
    const args = { milestoneId: 'milestones:1', taskId: 'tasks:1', idempotencyKey: 'mile-1' };
    assert.deepEqual(Object.keys(args).sort(), ['idempotencyKey', 'milestoneId', 'taskId']);
    const result = await callMcpTool('attach_task_to_milestone', args);
    assert.equal(result.httpStatus, 200, JSON.stringify(result.body));
    assert.equal(result.isError, false, JSON.stringify(result.body));
    assert.deepEqual(result.body, { ok: true, id: 'wrote' });
    const attach = result.calls.find((call) => call.name === 'portalApi:attachTask');
    assert.ok(attach, result.calls.map((call) => call.name).join(','));
    assert.equal(attach.args.milestoneId, 'milestones:1');
    assert.equal(attach.args.taskId, 'tasks:1');
    assert.equal(attach.args.key, 'mile-1');
    assert.equal(typeof attach.args.tokenId, 'string');
    assert.equal(typeof attach.args.requestHash, 'string');
    if ('tokenName' in attach.args) assert.equal(typeof attach.args.tokenName, 'string');
    assert.equal(JSON.stringify(result.body).includes('tokenName'), false);
  });

  it('accepts every other write tool mutation argument', async () => {
    const names = portalTools.filter((tool) => tool.write).map((tool) => tool.name).sort();
    assert.deepEqual(names, Object.keys(writeTools).sort());
    for (const name of names) {
      if (name === 'attach_task_to_milestone') continue;
      const result = await callMcpTool(name, writeTools[name] ?? {});
      assert.equal(result.isError, false, `${name} ${JSON.stringify(result.body)}`);
      assert.equal(result.httpStatus, 200, name);
    }

    const milestones = await postApi(
      '/api/v1/milestones',
      { projectId: 'projects:1', name: 'Milestone One', objective: 'Ship the page', goals: ['Live'] },
      'mile-create',
    );
    assert.equal(milestones.status, 200, JSON.stringify(milestones.body));
    assert.equal(
      milestones.calls.some((call) => call.name === 'portalApi:createMilestone'),
      true,
    );
    // The token name rides along so the tile can show which bot opened the milestone.
    const createCall = milestones.calls.find((call) => call.name === 'portalApi:createMilestone');
    assert.equal(typeof createCall?.args.tokenName, 'string');
    assert.equal(JSON.stringify(milestones.body).includes('tokenName'), false);

    const updated = await postApi(
      '/api/v1/milestones/update',
      { milestoneId: 'milestones:1', name: 'Milestone One' },
      'mile-update',
    );
    assert.equal(updated.status, 200, JSON.stringify(updated.body));

    const comment = await postApi('/api/v1/comments', { taskId: 'tasks:1', body: 'Noted' }, 'comment-1');
    assert.equal(comment.status, 200, JSON.stringify(comment.body));
    const commented = comment.calls.find((call) => call.name === 'portalApi:addComment');
    assert.ok(commented);
    assert.equal(commented.args.tokenName, 'claude');
  });
});

describe('project context API arguments', () => {
  it('passes the token name and only the brief fields that were sent', async () => {
    const saved = await postApi('/api/v1/context/brief', { projectId: 'projects:1', goal: 'One portal.' }, 'brief-a');
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const call = saved.calls.find((entry) => entry.name === 'projectContextApi:saveBrief');
    assert.ok(call);
    assert.deepEqual(call.args, { projectId: 'projects:1', tokenName: 'claude', goal: 'One portal.' });
  });

  it('rejects a bad shape before the context mutation runs', async () => {
    const cases: Array<[string, Record<string, unknown>, RegExp]> = [
      ['/api/v1/context/brief', { projectId: 'projects:1' }, /at least one brief field/],
      ['/api/v1/context/brief', { goal: 'x' }, /Project id is required/],
      ['/api/v1/context/brief', { projectId: 'projects:1', goal: 'x', budget: '1' }, /budget/],
      ['/api/v1/context/terms', { projectId: 'projects:1', term: 'Task' }, /definition is required/],
      ['/api/v1/context/terms', { projectId: 'projects:1', term: 'Task', definition: 5 }, /definition/],
      ['/api/v1/context/decisions', { projectId: 'projects:1', title: '  ' }, /title is required/],
    ];
    for (const [path, body, message] of cases) {
      const result = await postApi(path, body, `bad-${path}-${JSON.stringify(body).length}`);
      assert.equal(result.status, 400, `${path} ${JSON.stringify(result.body)}`);
      assert.match(JSON.stringify(result.body), message);
      assert.equal(result.calls.some((entry) => entry.name.startsWith('projectContextApi:')), false, path);
    }
  });
});
