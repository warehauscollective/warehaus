import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  LINEAR_GRAPHQL_URL,
  linearOrgRead,
  linearTaskPlatform,
  readLinearPlatform,
} from './linearTaskPlatform';
import { readTaskPlatform } from './taskPlatform';

const KEY = 'linear-test-key';

type Call = { url: string; init: RequestInit };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function connection(root: 'issues' | 'projectMilestones', nodes: unknown[], page?: { hasNextPage?: boolean; endCursor?: string | null }) {
  return {
    data: {
      [root]: {
        nodes,
        pageInfo: {
          hasNextPage: page?.hasNextPage === true,
          endCursor: page?.endCursor ?? null,
        },
      },
    },
  };
}

function callsFor(calls: Call[], root: 'issues' | 'projectMilestones'): Call[] {
  return calls.filter((call) => String(call.init.body).includes(root === 'issues' ? 'LinearIssues' : 'LinearProjectMilestones'));
}

describe('linear fetch', () => {
  it('does not fetch when the key is unset', async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = () => {
      calls += 1;
      throw new Error('Linear was called');
    };
    const read = await readLinearPlatform({ LINEAR_API_KEY: '   ' }, { fetch: fetchImpl });
    assert.equal(calls, 0);
    assert.equal(read.tasks.ok, false);
    assert.equal(read.milestones.ok, false);
    if (read.tasks.ok || read.milestones.ok) return;
    assert.equal(read.tasks.reason, 'not-configured');
    assert.equal(read.milestones.reason, 'not-configured');
  });

  it('maps a fixture issue page and a fixture milestone page', async () => {
    const calls: Call[] = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      const body = String(init?.body ?? '');
      if (body.includes('LinearIssues')) {
        return jsonResponse(connection('issues', [
          {
            id: 'issue-1',
            title: 'Homepage',
            description: 'Ship the homepage',
            dueDate: '2026-12-01',
            updatedAt: '2026-11-01T00:00:00.000Z',
            completedAt: null,
            state: { type: 'started' },
            project: { id: 'lin-proj', name: 'Site' },
          },
          {
            id: 'issue-2',
            title: 'Retired',
            description: null,
            dueDate: null,
            updatedAt: '2026-10-02T00:00:00.000Z',
            completedAt: '2026-10-01T00:00:00.000Z',
            state: { type: 'canceled' },
            project: null,
          },
          {
            id: 'issue-3',
            title: 'Triage me',
            state: { type: 'triage' },
          },
          { title: 'missing id' },
          {
            id: 'issue-4',
            title: 'Closed',
            completedAt: '2026-09-01T00:00:00.000Z',
            state: { type: 'started' },
          },
        ]));
      }
      return jsonResponse(connection('projectMilestones', [
        {
          id: 'ms-1',
          name: 'Launch',
          description: 'One objective',
          progress: 0.4,
          status: 'next',
          project: { id: 'lin-proj', name: 'Site' },
        },
        {
          id: 'ms-2',
          name: 'Done phase',
          description: '   ',
          progress: 1,
          status: 'done',
          project: { id: 'lin-proj', name: 'Site' },
        },
        {
          id: 'ms-3',
          name: 'Not started',
          status: 'unstarted',
          progress: 0,
          project: { id: 'lin-proj', name: 'Site' },
        },
        {
          id: 'ms-4',
          name: 'No project',
          status: 'overdue',
          project: null,
        },
      ]));
    };

    const read = await linearTaskPlatform.readTasks([], { LINEAR_API_KEY: KEY }, { fetch: fetchImpl });
    const milestones = await linearTaskPlatform.readMilestones({ LINEAR_API_KEY: KEY }, { fetch: fetchImpl });
    assert.equal(calls.length, 2);
    assert.equal(calls.every((call) => call.url === LINEAR_GRAPHQL_URL), true);
    assert.equal(calls.every((call) => call.init.method === 'POST'), true);
    for (const call of calls) {
      const headers = call.init.headers as Record<string, string>;
      assert.equal(headers.Authorization, KEY);
      assert.equal(String(call.init.body).includes(KEY), false);
      assert.match(String(call.init.body), /includeArchived: false/);
    }
    assert.equal(read.ok, true);
    if (!read.ok || read.platform !== 'linear') return;
    assert.deepEqual(read.items.map((item) => item.name), ['Homepage', 'Retired', 'Triage me', 'Closed']);
    const homepage = read.items[0];
    assert.equal(homepage?.status, 'In Progress');
    assert.equal(homepage?.isDone, false);
    assert.equal(homepage?.stage, null);
    assert.equal(homepage?.date, '2026-12-01');
    assert.equal(homepage?.projectId, 'lin-proj');
    assert.equal(homepage?.projectName, 'Site');
    assert.equal(homepage?.projectStatus, null);
    assert.equal(homepage?.description, 'Ship the homepage');
    assert.equal(read.items[1]?.status, 'Done');
    assert.equal(read.items[1]?.isDone, true);
    assert.equal(read.items[2]?.status, 'Inbox');
    assert.equal(read.items[3]?.isDone, true);
    assert.equal(milestones.ok, true);
    if (!milestones.ok) return;
    assert.equal(milestones.items.length, 3);
    assert.equal(milestones.items[0]?.objective, 'One objective');
    assert.deepEqual(milestones.items[0]?.goals, []);
    assert.equal(milestones.items[0]?.workStatus, 'active');
    assert.equal(milestones.items[0]?.approval, 'unreviewed');
    assert.equal(milestones.items[1]?.workStatus, 'ready');
    assert.equal(milestones.items[1]?.objective, '');
    assert.equal(milestones.items[2]?.workStatus, 'draft');
    const org = linearOrgRead('org-1', { tasks: read, milestones });
    assert.equal(org.ok, true);
    if (!org.ok || org.platform !== 'linear') return;
    assert.equal(org.tasks[0]?.orgId, 'org-1');
    assert.equal(org.tasks[0]?.source, 'linear');
    assert.equal(org.milestonesUnavailable, false);
    assert.equal(JSON.stringify(org).includes(KEY), false);
    const stored = [{ id: 'task-1', notionPageId: 'notion-1' }];
    const preview = readTaskPlatform({ platform: 'linear', tasks: stored, env: { LINEAR_API_KEY: KEY } });
    assert.equal(preview.tasks.ok, false);
    assert.deepEqual(stored, [{ id: 'task-1', notionPageId: 'notion-1' }]);
  });

  it('follows separate cursors and stops at the page cap', async () => {
    const calls: Call[] = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      const body = String(init?.body ?? '');
      const issues = body.includes('LinearIssues');
      const after = JSON.parse(body).variables.after as string | null;
      const page = after == null ? 1 : Number(after.replace('cursor-', '')) + 1;
      const root = issues ? 'issues' : 'projectMilestones';
      return jsonResponse(connection(root, [{ id: `${root}-${page}`, title: `Issue ${page}`, name: `Milestone ${page}`, project: { id: 'lin-proj' }, state: { type: 'backlog' }, status: 'unstarted' }], {
        hasNextPage: true,
        endCursor: `cursor-${page}`,
      }));
    };
    const read = await readLinearPlatform({ LINEAR_API_KEY: KEY }, { fetch: fetchImpl });
    assert.equal(callsFor(calls, 'issues').length, 4);
    assert.equal(callsFor(calls, 'projectMilestones').length, 4);
    assert.equal(read.tasks.ok, true);
    assert.equal(read.milestones.ok, true);
    if (!read.tasks.ok || !read.milestones.ok) return;
    assert.equal(read.tasks.items.length, 4);
    assert.equal(read.tasks.items[0]?.status, 'To Do');
    assert.equal(read.milestones.items.length, 4);
    const cursors = callsFor(calls, 'issues').map((call) => JSON.parse(String(call.init.body)).variables.after);
    assert.deepEqual(cursors, [null, 'cursor-1', 'cursor-2', 'cursor-3']);
  });

  it('returns unavailable without the response body when Linear fails', async () => {
    const fetchImpl: typeof fetch = async (_url, init) => {
      const body = String(init?.body ?? '');
      if (body.includes('LinearIssues')) return jsonResponse({ error: 'secret-body', token: KEY }, 500);
      return jsonResponse({ errors: [{ message: 'no milestone field' }], data: null });
    };
    const read = await readLinearPlatform({ LINEAR_API_KEY: KEY }, { fetch: fetchImpl });
    assert.equal(read.tasks.ok, false);
    assert.equal(read.milestones.ok, false);
    if (read.tasks.ok || read.milestones.ok) return;
    assert.equal(read.tasks.reason, 'unavailable');
    assert.equal(read.milestones.reason, 'unavailable');
    const org = linearOrgRead('org-1', read);
    const encoded = JSON.stringify(org);
    assert.equal(encoded.includes(KEY), false);
    assert.equal(encoded.includes('secret-body'), false);
    assert.equal(encoded.includes('no milestone field'), false);
  });

  it('keeps tasks when milestones fail', async () => {
    const fetchImpl: typeof fetch = async (_url, init) => {
      const body = String(init?.body ?? '');
      if (body.includes('LinearIssues')) {
        return jsonResponse(connection('issues', [{ id: 'issue-1', title: 'Homepage', state: { type: 'unstarted' } }]));
      }
      throw new Error('milestone network');
    };
    const read = await readLinearPlatform({ LINEAR_API_KEY: KEY }, { fetch: fetchImpl });
    const org = linearOrgRead('org-1', read);
    assert.equal(org.ok, true);
    if (!org.ok || org.platform !== 'linear') return;
    assert.equal(org.tasks.length, 1);
    assert.equal(org.milestonesUnavailable, true);
    assert.deepEqual(org.milestones, []);
  });

  it('treats an empty page as a successful empty read', async () => {
    const fetchImpl: typeof fetch = async (_url, init) => {
      const root = String(init?.body ?? '').includes('LinearIssues') ? 'issues' : 'projectMilestones';
      return jsonResponse(connection(root, []));
    };
    const read = await readLinearPlatform({ LINEAR_API_KEY: KEY }, { fetch: fetchImpl });
    assert.equal(read.tasks.ok, true);
    assert.equal(read.milestones.ok, true);
    if (!read.tasks.ok || !read.milestones.ok) return;
    assert.deepEqual(read.tasks.items, []);
    assert.deepEqual(read.milestones.items, []);
  });
});
