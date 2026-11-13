import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GITHUB_WEBHOOK_PATH, VERCEL_WEBHOOK_PATH } from '../http';
import { enqueue } from '../sync/outbox';
import { applyInbound, githubWebhook, vercelWebhook } from '../sync/inbound';
import {
  INBOUND_RATE_KEY,
  INBOUND_RATE_LIMIT,
  MERGE_REVIEW_STAGE,
  decideGitHubWebhook,
  decideVercelWebhook,
  githubSignatureHeader,
  linkWriteAction,
  stageMoveForMerge,
  vercelSignatureHeader,
} from './inboundWebhook';

const SECRET = 'test_webhook_secret';
const TASK_ID = '417ffd60316b81bca82ae951aa5a8a4e';
const SHA = 'abc123def456abc123def456abc123def456abcd';
const TIME = '2026-11-13T18:00:00.000Z';

type Row = Record<string, unknown> & { _id: string };
type Handler = (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>;

class EqBuilder {
  private eqs: Array<[string, unknown]> = [];
  eq(field: string, value: unknown): this {
    this.eqs.push([field, value]);
    return this;
  }
  matches(row: Row): boolean {
    return this.eqs.every(([field, value]) => row[field] === value);
  }
}

function memoryDb(tables: Record<string, Row[]>) {
  let seq = 1;
  return {
    async get(id: string) {
      for (const rows of Object.values(tables)) {
        const found = rows.find((row) => row._id === id);
        if (found) return found;
      }
      return null;
    },
    async insert(table: string, row: Record<string, unknown>) {
      const stored = { ...row, _id: `gen-${seq++}` } as Row;
      (tables[table] ??= []).push(stored);
      return stored._id;
    },
    async patch(id: string, value: Record<string, unknown>) {
      const row = await this.get(id);
      if (!row) return;
      for (const [key, field] of Object.entries(value)) {
        if (field === undefined) delete row[key];
        else row[key] = field;
      }
    },
    async delete(id: string) {
      for (const rows of Object.values(tables)) {
        const index = rows.findIndex((row) => row._id === id);
        if (index >= 0) {
          rows.splice(index, 1);
          return;
        }
      }
    },
    query(table: string) {
      const chain = (list: Row[]) => ({
        withIndex(_name: string, build?: (q: EqBuilder) => EqBuilder) {
          const builder = new EqBuilder();
          build?.(builder);
          return chain(list.filter((row) => builder.matches(row)));
        },
        take: async (count: number) => list.slice(0, count),
        unique: async () => {
          if (list.length > 1) throw new Error('Expected a unique row');
          return list[0] ?? null;
        },
      });
      return chain(tables[table] ?? []);
    },
  };
}

function run(fn: object, ctx: unknown, args: Record<string, unknown> = {}) {
  return (fn as { _handler: Handler })._handler(ctx, args);
}

function dbCtx(tables: Record<string, Row[]>) {
  const db = memoryDb(tables);
  const ctx = {
    db,
    scheduler: { runAfter: async () => undefined },
    runMutation: async (_ref: unknown, args: Record<string, unknown>) => run(enqueue, ctx, args),
  };
  return ctx;
}

function task(extra: Record<string, unknown> = {}): Row {
  return {
    _id: 'task-1',
    orgId: 'org-1',
    projectId: 'proj-1',
    notionPageId: TASK_ID,
    name: 'Two-way sync',
    status: 'In Progress',
    isDone: false,
    publishToWarehaus: false,
    stage: 'Building',
    lastEditedTime: TIME,
    lastSyncedAt: 1,
    ...extra,
  };
}

function tablesWith(row: Row = task()) {
  return {
    tasks: [row],
    taskLinks: [] as Row[],
    syncEvents: [] as Row[],
    syncMeta: [] as Row[],
    notionOutbox: [] as Row[],
  };
}

async function withWriteback(on: boolean, fn: () => Promise<void>) {
  const previous = process.env.NOTION_WRITEBACK_ENABLED;
  if (on) process.env.NOTION_WRITEBACK_ENABLED = 'true';
  else delete process.env.NOTION_WRITEBACK_ENABLED;
  try {
    await fn();
  } finally {
    if (previous === undefined) delete process.env.NOTION_WRITEBACK_ENABLED;
    else process.env.NOTION_WRITEBACK_ENABLED = previous;
  }
}

async function withEnv(name: string, value: string | undefined, fn: () => Promise<void>) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    await fn();
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
}

function pullBody(action: string, extra: Record<string, unknown> = {}) {
  return {
    action,
    pull_request: {
      number: 12,
      title: 'Portal webhooks',
      body: `Ship the handlers.\n\nPortal-Task: ${TASK_ID}\n`,
      merged: action === 'closed' ? true : false,
      head: { sha: SHA },
      ...extra,
    },
    repository: { full_name: 'warehauscollective/warehaus' },
  };
}

async function decidePull(action: string, options?: {
  secret?: string;
  signature?: string | null;
  delivery?: string;
  body?: unknown;
  event?: string;
}) {
  const rawBody = JSON.stringify(options?.body ?? pullBody(action));
  const secret = options?.secret === undefined ? SECRET : options.secret;
  const signature =
    options && 'signature' in options
      ? options.signature
      : secret
        ? await githubSignatureHeader(rawBody, secret)
        : null;
  return {
    rawBody,
    decision: await decideGitHubWebhook({
      rawBody,
      signatureHeader: signature,
      eventHeader: options?.event ?? 'pull_request',
      deliveryHeader: options?.delivery ?? 'delivery-open-1',
      secret,
    }),
  };
}

function applyArgs(decision: Awaited<ReturnType<typeof decidePull>>['decision']) {
  assert.equal(decision.ok, true);
  if (!decision.ok || decision.plan.action !== 'apply') throw new Error('expected an apply plan');
  return {
    source: decision.plan.source,
    ...(decision.plan.deliveryId ? { deliveryId: decision.plan.deliveryId } : {}),
    items: decision.plan.items,
  };
}

describe('inbound webhook signatures', () => {
  it('rejects a bad, missing, or unsigned GitHub signature', async () => {
    const rawBody = JSON.stringify(pullBody('opened'));
    const bad = await decideGitHubWebhook({
      rawBody,
      signatureHeader: 'sha256=deadbeef',
      eventHeader: 'pull_request',
      deliveryHeader: 'delivery-1',
      secret: SECRET,
    });
    assert.deepEqual(bad, { ok: false, status: 401, reason: 'invalid_signature' });

    const missing = await decideGitHubWebhook({
      rawBody,
      signatureHeader: null,
      eventHeader: 'pull_request',
      deliveryHeader: 'delivery-1',
      secret: SECRET,
    });
    assert.deepEqual(missing, { ok: false, status: 401, reason: 'invalid_signature' });

    const blank = await decideGitHubWebhook({
      rawBody,
      signatureHeader: await githubSignatureHeader(rawBody, SECRET),
      eventHeader: 'pull_request',
      deliveryHeader: 'delivery-1',
      secret: '   ',
    });
    assert.deepEqual(blank, { ok: false, status: 401, reason: 'missing_secret' });

    const tampered = await decideGitHubWebhook({
      rawBody: `${rawBody} `,
      signatureHeader: await githubSignatureHeader(rawBody, SECRET),
      eventHeader: 'pull_request',
      deliveryHeader: 'delivery-1',
      secret: SECRET,
    });
    assert.equal(tampered.ok, false);
  });

  it('rejects a bad Vercel signature and does not accept a SHA-256 stand-in', async () => {
    const rawBody = JSON.stringify({ id: 'evt_1', type: 'deployment.succeeded' });
    const sha256 = await githubSignatureHeader(rawBody, SECRET);
    const wrongHash = await decideVercelWebhook({
      rawBody,
      signatureHeader: sha256.slice('sha256='.length),
      secret: SECRET,
    });
    assert.deepEqual(wrongHash, { ok: false, status: 401, reason: 'invalid_signature' });

    const good = await decideVercelWebhook({
      rawBody,
      signatureHeader: await vercelSignatureHeader(rawBody, SECRET),
      secret: SECRET,
    });
    assert.equal(good.ok, true);
  });

  it('does not call the mutation when the signature is bad', async () => {
    const calls: unknown[] = [];
    const ctx = { runMutation: async (...args: unknown[]) => calls.push(args) };
    await withEnv('GITHUB_WEBHOOK_SECRET', SECRET, async () => {
      const response = await run(githubWebhook, ctx, new Request('https://example.test/github/webhook', {
        method: 'POST',
        headers: {
          'x-hub-signature-256': 'sha256=nope',
          'x-github-event': 'pull_request',
          'x-github-delivery': 'delivery-1',
        },
        body: JSON.stringify(pullBody('opened')),
      }) as unknown as Record<string, unknown>);
      assert.equal((response as Response).status, 401);
    });
    await withEnv('VERCEL_WEBHOOK_SECRET', SECRET, async () => {
      const response = await run(vercelWebhook, ctx, new Request('https://example.test/vercel/webhook', {
        method: 'POST',
        headers: { 'x-vercel-signature': 'nope' },
        body: '{}',
      }) as unknown as Record<string, unknown>);
      assert.equal((response as Response).status, 401);
    });
    assert.equal(calls.length, 0);
  });
});

describe('inbound webhook matching', () => {
  it('ignores a pull request with no Portal-Task line and writes nothing', async () => {
    const body = pullBody('opened');
    (body.pull_request as { body: string }).body = 'No task line here.';
    const { decision } = await decidePull('opened', { body });
    assert.equal(decision.ok, true);
    if (decision.ok) assert.deepEqual(decision.plan, { action: 'ignore', reason: 'no_portal_task' });

    const calls: unknown[] = [];
    await withEnv('GITHUB_WEBHOOK_SECRET', SECRET, async () => {
      const rawBody = JSON.stringify(body);
      const response = await run(
        githubWebhook,
        { runMutation: async (...args: unknown[]) => calls.push(args) },
        new Request('https://example.test/github/webhook', {
          method: 'POST',
          headers: {
            'x-hub-signature-256': await githubSignatureHeader(rawBody, SECRET),
            'x-github-event': 'pull_request',
            'x-github-delivery': 'delivery-unmatched-line',
          },
          body: rawBody,
        }) as unknown as Record<string, unknown>,
      );
      assert.equal((response as Response).status, 200);
      const payload = await (response as Response).json() as { ignored?: string };
      assert.equal(payload.ignored, 'no_portal_task');
    });
    assert.equal(calls.length, 0);
  });

  it('writes nothing when the Portal-Task id does not match a task', async () => {
    const { decision } = await decidePull('opened');
    const stored = tablesWith();
    stored.tasks[0]!.notionPageId = 'ffffffffffffffffffffffffffffffff';
    const result = await run(applyInbound, dbCtx(stored), applyArgs(decision));
    assert.deepEqual(result, { ok: true, wrote: false, links: 0, stageMoves: 0, unmatched: true });
    assert.equal(stored.taskLinks.length, 0);
    assert.equal(stored.syncEvents.length, 0);
    assert.equal(stored.notionOutbox.length, 0);
    assert.equal(stored.syncMeta.length, 0);
  });

  it('ignores another Vercel project and a deploy with no Portal-Task line', async () => {
    const other = JSON.stringify({
      id: 'evt_other',
      type: 'deployment.succeeded',
      payload: {
        project: { name: 'marketing-site' },
        deployment: {
          name: 'marketing-site',
          url: 'marketing-site.vercel.app',
          meta: { githubCommitSha: SHA, githubCommitMessage: `Portal-Task: ${TASK_ID}` },
        },
      },
    });
    const otherDecision = await decideVercelWebhook({
      rawBody: other,
      signatureHeader: await vercelSignatureHeader(other, SECRET),
      secret: SECRET,
    });
    assert.equal(otherDecision.ok, true);
    if (otherDecision.ok) assert.equal(otherDecision.plan.action, 'ignore');
    if (otherDecision.ok && otherDecision.plan.action === 'ignore') {
      assert.equal(otherDecision.plan.reason, 'project');
    }

    const quiet = JSON.stringify({
      id: 'evt_quiet',
      type: 'deployment.created',
      payload: {
        project: { name: 'warehaus-portal' },
        deployment: {
          name: 'warehaus-portal',
          url: 'warehaus-portal-abc.vercel.app',
          meta: { githubCommitSha: SHA, githubCommitMessage: 'no task' },
        },
      },
    });
    const quietDecision = await decideVercelWebhook({
      rawBody: quiet,
      signatureHeader: await vercelSignatureHeader(quiet, SECRET),
      secret: SECRET,
    });
    assert.equal(quietDecision.ok, true);
    if (quietDecision.ok) assert.deepEqual(quietDecision.plan, { action: 'ignore', reason: 'no_portal_task' });
  });
});

describe('inbound webhook replays', () => {
  it('treats the same delivery id as a no-op even when the later body would merge', async () => {
    const opened = await decidePull('opened', { delivery: 'delivery-same' });
    const stored = tablesWith();
    await withWriteback(true, async () => {
      const first = await run(applyInbound, dbCtx(stored), applyArgs(opened.decision));
      assert.equal((first as { wrote: boolean }).wrote, true);
      assert.equal(stored.tasks[0]?.stage, 'Building');
      const mergedBody = pullBody('closed');
      const rawBody = JSON.stringify(mergedBody);
      const replay = await decideGitHubWebhook({
        rawBody,
        signatureHeader: await githubSignatureHeader(rawBody, SECRET),
        eventHeader: 'pull_request',
        deliveryHeader: 'delivery-same',
        secret: SECRET,
      });
      const second = await run(applyInbound, dbCtx(stored), applyArgs(replay));
      assert.deepEqual(second, { ok: true, wrote: false, links: 0, stageMoves: 0, duplicate: true });
    });
    assert.equal(stored.taskLinks.length, 1);
    assert.equal(stored.taskLinks[0]?.state, 'open');
    assert.equal(stored.tasks[0]?.stage, 'Building');
    assert.equal(stored.tasks[0]?.status, 'In Progress');
    assert.equal(stored.tasks[0]?.isDone, false);
    assert.equal(stored.notionOutbox.length, 0);
    assert.equal(stored.syncEvents.length, 1);
  });

  it('does not write again for the same repo, number, and sha', async () => {
    const firstDecision = await decidePull('opened', { delivery: 'delivery-a' });
    const secondDecision = await decidePull('opened', { delivery: 'delivery-b' });
    const stored = tablesWith();
    const ctx = dbCtx(stored);
    const first = await run(applyInbound, ctx, applyArgs(firstDecision.decision));
    assert.equal((first as { wrote: boolean }).wrote, true);
    const updatedAt = stored.taskLinks[0]?.updatedAt;
    const second = await run(applyInbound, ctx, applyArgs(secondDecision.decision));
    assert.deepEqual(second, { ok: true, wrote: false, links: 0, stageMoves: 0 });
    assert.equal(stored.taskLinks.length, 1);
    assert.equal(stored.taskLinks[0]?.updatedAt, updatedAt);
    assert.equal(stored.syncEvents.length, 1);
    assert.equal(stored.syncMeta.length, 1);
  });
});

describe('inbound webhook stage moves', () => {
  it('moves a merged pull request to Ready to Ship and never to Done', async () => {
    const { decision } = await decidePull('closed', { delivery: 'delivery-merge' });
    assert.equal(decision.ok, true);
    if (decision.ok && decision.plan.action === 'apply') {
      assert.equal(decision.plan.items[0]?.moveStage, true);
      assert.equal(decision.plan.items[0]?.state, 'merged');
      assert.equal(decision.plan.items[0]?.kind, 'PR');
    }
    const row = task();
    const stored = tablesWith(row);
    await withWriteback(true, async () => {
      const result = await run(applyInbound, dbCtx(stored), applyArgs(decision));
      assert.deepEqual(result, { ok: true, wrote: true, links: 1, stageMoves: 1 });
    });
    assert.equal(row.stage, MERGE_REVIEW_STAGE);
    assert.equal(row.status, 'In Progress');
    assert.equal(row.isDone, false);
    assert.equal(row.publishToWarehaus, false);
    assert.equal(stored.notionOutbox.length, 1);
    const payload = JSON.parse(String(stored.notionOutbox[0]?.payload)) as {
      properties: Record<string, string>;
    };
    assert.equal(payload.properties.Stage, 'Ready to Ship');
    assert.equal(payload.properties['GitHub Issue/PR'], 'https://github.com/warehauscollective/warehaus/pull/12');
    assert.equal('Status' in payload.properties, false);
    assert.equal(Object.values(payload.properties).includes('Done'), false);
    assert.equal(Object.values(payload.properties).includes('Shipped'), false);
    assert.equal(stored.taskLinks[0]?.kind, 'PR');
    assert.equal(stored.taskLinks[0]?.sha, SHA);
    assert.equal(stored.taskLinks[0]?.state, 'merged');
  });

  it('keeps the link when write-back is off and does not patch the stage', async () => {
    const { decision } = await decidePull('closed', { delivery: 'delivery-off' });
    const row = task();
    const stored = tablesWith(row);
    await withWriteback(false, async () => {
      const result = await run(applyInbound, dbCtx(stored), applyArgs(decision));
      assert.equal((result as { links: number }).links, 1);
      assert.equal((result as { stageMoves: number }).stageMoves, 0);
    });
    assert.equal(row.stage, 'Building');
    assert.equal(row.status, 'In Progress');
    assert.equal(stored.notionOutbox.length, 0);
    assert.equal(stored.taskLinks.length, 1);
  });

  it('does not move a Done or Shipped task backwards', () => {
    const done = stageMoveForMerge({
      moveStage: true,
      status: 'Done',
      isDone: true,
      stage: 'Building',
      stamp: null,
      lastEditedTime: TIME,
      now: 10,
    });
    assert.deepEqual(done, { ok: false, reason: 'done' });
    const shipped = stageMoveForMerge({
      moveStage: true,
      status: 'In Progress',
      isDone: false,
      stage: 'Shipped',
      stamp: null,
      lastEditedTime: TIME,
      now: 10,
    });
    assert.equal(shipped.ok, false);
    const forward = stageMoveForMerge({
      moveStage: true,
      status: 'In Progress',
      isDone: false,
      stage: 'Building',
      stamp: null,
      lastEditedTime: TIME,
      now: 10,
    });
    assert.equal(forward.ok, true);
    if (forward.ok) assert.equal(forward.stage, 'Ready to Ship');
  });

  it('notes a closed unmerged pull request and does not queue a stage', async () => {
    const body = pullBody('closed');
    (body.pull_request as { merged: boolean }).merged = false;
    const { decision } = await decidePull('closed', { body, delivery: 'delivery-closed' });
    if (decision.ok && decision.plan.action === 'apply') assert.equal(decision.plan.items[0]?.moveStage, false);
    const row = task();
    const stored = tablesWith(row);
    await withWriteback(true, async () => {
      await run(applyInbound, dbCtx(stored), applyArgs(decision));
    });
    assert.equal(row.stage, 'Building');
    assert.equal(stored.notionOutbox.length, 0);
    assert.equal(stored.taskLinks[0]?.state, 'closed');
  });

  it('records a warehaus-portal deploy without moving the stage', async () => {
    const rawBody = JSON.stringify({
      id: 'evt_portal_deploy',
      type: 'deployment.succeeded',
      payload: {
        project: { name: 'warehaus-portal' },
        deployment: {
          name: 'warehaus-portal',
          url: 'warehaus-portal-abc123.vercel.app',
          meta: {
            githubCommitSha: SHA,
            githubCommitMessage: `Portal-Task: ${TASK_ID}`,
          },
        },
      },
    });
    const decision = await decideVercelWebhook({
      rawBody,
      signatureHeader: await vercelSignatureHeader(rawBody, SECRET),
      secret: SECRET,
    });
    const row = task();
    const stored = tablesWith(row);
    await withWriteback(true, async () => {
      const result = await run(applyInbound, dbCtx(stored), applyArgs(decision));
      assert.deepEqual(result, { ok: true, wrote: true, links: 1, stageMoves: 0 });
    });
    assert.equal(row.stage, 'Building');
    assert.equal(stored.notionOutbox.length, 0);
    assert.equal(stored.taskLinks[0]?.kind, 'deploy');
    assert.equal(stored.taskLinks[0]?.state, 'succeeded');
    assert.equal(stored.taskLinks[0]?.url, 'https://warehaus-portal-abc123.vercel.app');
  });

  it('accepts a check conclusion and does not move the stage', async () => {
    const body = {
      action: 'completed',
      check_suite: {
        conclusion: 'success',
        head_sha: SHA,
        pull_requests: [{ number: 12 }],
      },
      repository: { full_name: 'warehauscollective/warehaus' },
      head_commit: { message: `Portal-Task: ${TASK_ID}` },
    };
    const { decision } = await decidePull('opened', {
      body,
      event: 'check_suite',
      delivery: 'delivery-check',
    });
    assert.equal(decision.ok, true);
    if (decision.ok && decision.plan.action === 'apply') {
      assert.equal(decision.plan.items[0]?.state, 'success');
      assert.equal(decision.plan.items[0]?.moveStage, false);
    }
    const requested = {
      action: 'requested',
      check_suite: { conclusion: null, head_sha: SHA, pull_requests: [{ number: 12 }] },
      repository: { full_name: 'warehauscollective/warehaus' },
    };
    const ignored = await decidePull('opened', {
      body: requested,
      event: 'check_suite',
      delivery: 'delivery-requested',
    });
    assert.equal(ignored.decision.ok, true);
    if (ignored.decision.ok) assert.equal(ignored.decision.plan.action, 'ignore');
  });

  it('drops a new write once the defensive rate limit is full', async () => {
    const { decision } = await decidePull('opened', { delivery: 'delivery-limited' });
    const stored = tablesWith();
    stored.syncMeta.push({
      _id: 'rate-1',
      key: INBOUND_RATE_KEY,
      details: JSON.stringify({ windowStartedAt: Date.now(), windowCount: INBOUND_RATE_LIMIT }),
      lastSyncedAt: Date.now(),
    });
    const result = await run(applyInbound, dbCtx(stored), applyArgs(decision));
    assert.deepEqual(result, { ok: true, wrote: false, links: 0, stageMoves: 0, limited: true });
    assert.equal(stored.taskLinks.length, 0);
    assert.equal(stored.syncEvents.length, 0);
  });
});

describe('inbound webhook routes', () => {
  it('exposes the GitHub and Vercel paths', () => {
    assert.equal(GITHUB_WEBHOOK_PATH, '/github/webhook');
    assert.equal(VERCEL_WEBHOOK_PATH, '/vercel/webhook');
  });

  it('keeps a merged link from being replaced by an older conclusion', () => {
    assert.equal(
      linkWriteAction(
        { url: 'https://github.com/warehauscollective/warehaus/pull/12', sha: SHA, state: 'merged' },
        { url: 'https://github.com/warehauscollective/warehaus/pull/12', sha: SHA, state: 'success' },
      ),
      'noop',
    );
  });
});
