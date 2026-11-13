import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { API_PAGE_MAX } from '@warehaus/portal-sync';
import { handlePortalMcp, type PortalMcpDeps } from './handle';
import { planToolCall, portalTools, runPortalTool, type ToolCall } from './tools';

const BEARER = 'Bearer whp_testtokenvalue0001';
const ACCEPT = 'application/json, text/event-stream';

const samples: Record<string, Record<string, unknown>> = {
  list_projects: { limit: API_PAGE_MAX, orgId: 'client-1' },
  get_project: { projectId: 'project-1' },
  list_clients: { limit: 25 },
  get_client: { clientId: 'client-1' },
  list_tasks: { projectId: 'project-1', milestoneId: 'milestone-1', updatedSince: undefined, limit: API_PAGE_MAX },
  get_task: { taskId: 'task-1' },
  list_milestones: { projectId: 'project-1', limit: API_PAGE_MAX },
  create_task: { projectId: 'project-1', name: 'Draft a page', status: 'Inbox', idempotencyKey: 'task-1' },
  update_task: {
    taskId: 'task-1',
    expectedLastEditedTime: '2026-01-01T00:00:00.000Z',
    status: 'To Do',
    idempotencyKey: 'task-2',
  },
  move_task_stage: {
    taskId: 'task-1',
    stage: 'Planning',
    expectedLastEditedTime: '2026-01-01T00:00:00.000Z',
    idempotencyKey: 'task-3',
  },
  create_client: { companyName: 'Northwind', idempotencyKey: 'client-1' },
  create_project: { name: 'Website', clientId: 'client-1', idempotencyKey: 'project-1' },
  attach_task_to_milestone: { milestoneId: 'milestone-1', taskId: 'task-1', idempotencyKey: 'mile-1' },
  add_task_link: {
    taskId: 'task-1',
    kind: 'deploy',
    url: 'https://example.com/ship',
    idempotencyKey: 'link-1',
  },
};

const paths: Record<string, { method: 'GET' | 'POST'; path: string }> = {
  list_projects: { method: 'GET', path: '/api/v1/projects' },
  get_project: { method: 'GET', path: '/api/v1/projects/item' },
  list_clients: { method: 'GET', path: '/api/v1/clients' },
  get_client: { method: 'GET', path: '/api/v1/clients/item' },
  list_tasks: { method: 'GET', path: '/api/v1/tasks' },
  get_task: { method: 'GET', path: '/api/v1/tasks/item' },
  list_milestones: { method: 'GET', path: '/api/v1/milestones' },
  create_task: { method: 'POST', path: '/api/v1/tasks' },
  update_task: { method: 'POST', path: '/api/v1/tasks/update' },
  move_task_stage: { method: 'POST', path: '/api/v1/tasks/update' },
  create_client: { method: 'POST', path: '/api/v1/clients' },
  create_project: { method: 'POST', path: '/api/v1/projects' },
  attach_task_to_milestone: { method: 'POST', path: '/api/v1/milestones/attach' },
  add_task_link: { method: 'POST', path: '/api/v1/links' },
};

describe('portal MCP tools', () => {
  it('plans a bounded happy path for every tool', () => {
    assert.equal(portalTools.length, Object.keys(samples).length);
    for (const tool of portalTools) {
      const planned = planToolCall(tool.name, samples[tool.name] ?? {});
      assert.equal(planned.ok, true, tool.name);
      if (!planned.ok) continue;
      assert.equal(planned.call.method, paths[tool.name]?.method, tool.name);
      assert.equal(planned.call.path, paths[tool.name]?.path, tool.name);
      const limit = Number(planned.call.search?.limit ?? API_PAGE_MAX);
      assert.ok(limit >= 1 && limit <= API_PAGE_MAX, tool.name);
      if (tool.write) {
        assert.equal(typeof planned.call.idempotencyKey, 'string', tool.name);
        assert.equal(planned.call.body && 'idempotencyKey' in planned.call.body, false, tool.name);
      }
    }
  });

  it('rejects a page above 50 and sends 50 when asked', () => {
    const tooBig = planToolCall('list_tasks', { projectId: 'project-1', limit: API_PAGE_MAX + 1 });
    assert.equal(tooBig.ok, false);
    const capped = planToolCall('list_projects', { limit: API_PAGE_MAX });
    assert.equal(capped.ok, true);
    if (capped.ok) assert.equal(capped.call.search?.limit, String(API_PAGE_MAX));
    const tasks = planToolCall('list_tasks', { milestoneId: 'milestone-1', stage: 'Idea' });
    assert.equal(tasks.ok, true);
    if (tasks.ok) {
      assert.equal(tasks.call.search?.milestoneId, 'milestone-1');
      assert.equal(tasks.call.search?.stage, 'Idea');
    }
  });

  it('calls a mocked handler for every tool and blocks a read token', async () => {
    const calls: string[] = [];
    for (const tool of portalTools) {
      const result = await runPortalTool({
        name: tool.name,
        args: samples[tool.name] ?? {},
        scope: 'read-write',
        token: 'whp_testtokenvalue0001',
        call: async (request) => {
          calls.push(`${request.method} ${request.path}`);
          const limit = Number(request.search?.limit ?? API_PAGE_MAX);
          assert.ok(limit <= API_PAGE_MAX);
          return { status: 200, body: { tool: tool.name } };
        },
      });
      assert.equal(result.status, 200, tool.name);
      assert.deepEqual(result.body, { tool: tool.name });
    }
    assert.equal(calls.length, portalTools.length);

    let blocked = false;
    const denied = await runPortalTool({
      name: 'move_task_stage',
      args: samples.move_task_stage ?? {},
      scope: 'read',
      token: 'whp_testtokenvalue0001',
      call: async () => {
        blocked = true;
        return { status: 200, body: {} };
      },
    });
    assert.equal(denied.status, 403);
    assert.equal(blocked, false);
  });

  it('requires a client or a client id when creating a project', () => {
    const missing = planToolCall('create_project', { name: 'Website', idempotencyKey: 'project-1' });
    assert.equal(missing.ok, false);
    const both = planToolCall('create_project', {
      name: 'Website',
      clientId: 'client-1',
      client: { companyName: 'Northwind' },
      idempotencyKey: 'project-1',
    });
    assert.equal(both.ok, false);
    const created = planToolCall('create_project', {
      name: 'Website',
      client: { companyName: 'Northwind' },
      idempotencyKey: 'project-2',
    });
    assert.equal(created.ok, true);
    if (created.ok) {
      assert.equal(created.call.path, '/api/v1/projects');
      assert.deepEqual(created.call.body?.client, { companyName: 'Northwind' });
    }
  });
});

function mcpRequest(body: unknown, authorization?: string) {
  return new Request('https://portal.test/api/mcp', {
    method: 'POST',
    headers: {
      accept: ACCEPT,
      'content-type': 'application/json',
      ...(authorization ? { authorization } : {}),
    },
    body: JSON.stringify(body),
  });
}

function deps(scope: 'read' | 'read-write'): PortalMcpDeps & { calls: Array<ToolCall & { token: string }> } {
  const calls: Array<ToolCall & { token: string }> = [];
  return {
    calls,
    lookup: async () => ({ ok: true, scope }),
    call: async (input) => {
      calls.push(input);
      return { status: 200, body: { ok: true } };
    },
  };
}

describe('portal MCP HTTP', () => {
  it('returns 401 when the bearer is missing or bad', async () => {
    const open = deps('read-write');
    const missing = await handlePortalMcp(
      mcpRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      open,
    );
    assert.equal(missing.status, 401);
    const bad = await handlePortalMcp(
      mcpRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, 'Bearer nope'),
      open,
    );
    assert.equal(bad.status, 401);
    const unknown = await handlePortalMcp(
      mcpRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, BEARER),
      { ...open, lookup: async () => ({ ok: false, status: 401, error: 'Unauthorized' }) },
    );
    assert.equal(unknown.status, 401);
    assert.equal(open.calls.length, 0);
  });

  it('returns 403 when a read token calls a write tool', async () => {
    const read = deps('read');
    const response = await handlePortalMcp(
      mcpRequest(
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'create_task', arguments: samples.create_task },
        },
        BEARER,
      ),
      read,
    );
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'This token is read-only' });
    assert.equal(read.calls.length, 0);
  });

  it('lists the tools and calls the staff handler for a read', async () => {
    const read = deps('read');
    const listed = await handlePortalMcp(
      mcpRequest({ jsonrpc: '2.0', id: 3, method: 'tools/list' }, BEARER),
      read,
    );
    assert.equal(listed.status, 200);
    const listBody = (await listed.json()) as { result?: { tools?: Array<{ name: string }> } };
    const names = (listBody.result?.tools ?? []).map((tool) => tool.name).sort();
    assert.deepEqual(
      names,
      portalTools.map((tool) => tool.name).sort(),
    );

    const called = await handlePortalMcp(
      mcpRequest(
        {
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: { name: 'list_projects', arguments: { limit: API_PAGE_MAX } },
        },
        BEARER,
      ),
      read,
    );
    assert.equal(called.status, 200);
    assert.equal(read.calls.length, 1);
    assert.equal(read.calls[0]?.path, '/api/v1/projects');
    assert.equal(read.calls[0]?.search?.limit, String(API_PAGE_MAX));
    const payload = (await called.json()) as { result?: { content?: Array<{ text: string }> } };
    assert.equal(payload.result?.content?.[0]?.text, JSON.stringify({ ok: true }));
  });
});
