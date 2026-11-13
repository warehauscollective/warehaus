import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GITHUB_WEBHOOK_PATH, VERCEL_WEBHOOK_PATH } from '../http';
import { enqueue } from '../sync/outbox';
import { applyInbound, githubWebhook, vercelWebhook } from '../sync/inbound';
import {
  INBOUND_MAX_BODY_BYTES,
  INBOUND_RATE_KEY,
  INBOUND_RATE_LIMIT,
  MERGE_REVIEW_STAGE,
  decideGitHubWebhook,
  decideVercelWebhook,
  deliveryClaimId,
  githubSignatureHeader,
  linkWriteAction,
  payloadTooLarge,
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
        first: async () => list[0] ?? null,
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
    ...(decision.plan.contentKey ? { contentKey: decision.plan.contentKey } : {}),
    ...(decision.plan.matchSha ? { matchSha: decision.plan.matchSha } : {}),
    ...(decision.plan.checkState ? { checkState: decision.plan.checkState } : {}),
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
    assert.equal(stored.syncEvents.length, 2);
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
    assert.deepEqual(second, { ok: true, wrote: false, links: 0, stageMoves: 0, duplicate: true });
    assert.equal(stored.taskLinks.length, 1);
    assert.equal(stored.taskLinks[0]?.updatedAt, updatedAt);
    assert.equal(stored.syncEvents.length, 2);
    assert.equal(stored.syncMeta.length, 1);
  });

  it('a retried delivery sees the claim and does not insert a second link', async () => {
    const { decision } = await decidePull('opened', { delivery: 'delivery-race' });
    const stored = tablesWith();
    stored.syncEvents.push({
      _id: 'claim-a',
      eventId: deliveryClaimId('github', 'delivery-race'),
      receivedAt: 1,
      status: 'done',
      processedAt: 1,
    });
    stored.syncEvents.push({
      _id: 'claim-b',
      eventId: deliveryClaimId('github', 'delivery-race'),
      receivedAt: 2,
      status: 'done',
      processedAt: 2,
    });
    const result = await run(applyInbound, dbCtx(stored), applyArgs(decision));
    assert.deepEqual(result, { ok: true, wrote: false, links: 0, stageMoves: 0, duplicate: true });
    assert.equal(stored.taskLinks.length, 0);
    assert.equal(stored.syncEvents.length, 2);
  });

  it('keeps one link when the same url arrives with a new sha', async () => {
    const opened = await decidePull('opened', { delivery: 'delivery-url-1' });
    const nextSha = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const body = pullBody('synchronize');
    (body.pull_request as { head: { sha: string } }).head = { sha: nextSha };
    const synced = await decidePull('synchronize', { body, delivery: 'delivery-url-2' });
    const stored = tablesWith();
    const ctx = dbCtx(stored);
    await run(applyInbound, ctx, applyArgs(opened.decision));
    const second = await run(applyInbound, ctx, applyArgs(synced.decision));
    assert.deepEqual(second, { ok: true, wrote: true, links: 1, stageMoves: 0 });
    assert.equal(stored.taskLinks.length, 1);
    assert.equal(stored.taskLinks[0]?.sha, nextSha);
    assert.equal(stored.taskLinks[0]?.url, 'https://github.com/warehauscollective/warehaus/pull/12');
  });

  it('patches a legacy duplicate url instead of inserting a third row', async () => {
    const nextSha = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const body = pullBody('synchronize');
    (body.pull_request as { head: { sha: string } }).head = { sha: nextSha };
    const synced = await decidePull('synchronize', { body, delivery: 'delivery-legacy-url' });
    const stored = tablesWith();
    const url = 'https://github.com/warehauscollective/warehaus/pull/12';
    stored.taskLinks.push(
      { _id: 'link-1', orgId: 'org-1', taskId: 'task-1', kind: 'PR', url, sha: SHA, state: 'open' },
      { _id: 'link-2', orgId: 'org-1', taskId: 'task-1', kind: 'PR', url, sha: SHA, state: 'open' },
    );
    const result = await run(applyInbound, dbCtx(stored), applyArgs(synced.decision));
    assert.equal((result as { wrote: boolean }).wrote, true);
    assert.equal(stored.taskLinks.length, 2);
    assert.equal(stored.taskLinks[0]?.sha, nextSha);
    assert.equal(stored.taskLinks[1]?.sha, SHA);
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
    const parked = stageMoveForMerge({
      moveStage: true,
      status: 'In Progress',
      isDone: false,
      stage: 'Parked',
      stamp: null,
      lastEditedTime: TIME,
      now: 10,
    });
    assert.deepEqual(parked, { ok: false, reason: 'parked' });
  });

  it('does not move a parked task to Ready to Ship when the pull request merges', async () => {
    const { decision } = await decidePull('closed', { delivery: 'delivery-parked' });
    const row = task({ stage: 'Parked' });
    const stored = tablesWith(row);
    await withWriteback(true, async () => {
      const result = await run(applyInbound, dbCtx(stored), applyArgs(decision));
      assert.equal((result as { links: number }).links, 1);
      assert.equal((result as { stageMoves: number }).stageMoves, 0);
    });
    assert.equal(row.stage, 'Parked');
    assert.equal(row.status, 'In Progress');
    assert.equal(stored.notionOutbox.length, 0);
    assert.equal(stored.taskLinks[0]?.state, 'merged');
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
      },
    };
    const { decision } = await decidePull('opened', {
      body,
      event: 'check_suite',
      delivery: 'delivery-check',
    });
    assert.equal(decision.ok, true);
    if (decision.ok && decision.plan.action === 'apply') {
      assert.equal(decision.plan.matchSha, SHA);
      assert.equal(decision.plan.checkState, 'success');
      assert.equal(decision.plan.items.length, 0);
    }
    const requested = {
      action: 'requested',
      check_suite: { conclusion: null, head_sha: SHA },
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

describe('inbound webhook claims and checks', () => {
  it('matches a dashed Portal-Task line and two ids on one pull request', async () => {
    const dashed = '417ffd60-316b-81bc-a82a-e951aa5a8a4e';
    const dashedBody = pullBody('opened');
    (dashedBody.pull_request as { body: string }).body = `Portal-Task: ${dashed}`;
    const dashedDecision = await decidePull('opened', { body: dashedBody, delivery: 'delivery-dashed' });
    const dashedStore = tablesWith(task({ notionPageId: dashed }));
    const dashedResult = await run(applyInbound, dbCtx(dashedStore), applyArgs(dashedDecision.decision));
    assert.equal((dashedResult as { links: number }).links, 1);
    assert.equal(dashedStore.taskLinks.length, 1);

    const other = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const multiBody = pullBody('opened');
    (multiBody.pull_request as { body: string }).body = `Portal-Task: ${TASK_ID}\nPortal-Task: ${other}\n`;
    const multi = await decidePull('opened', { body: multiBody, delivery: 'delivery-multi' });
    const stored = tablesWith();
    stored.tasks.push(task({ _id: 'task-2', notionPageId: other, name: 'Second' }));
    await run(applyInbound, dbCtx(stored), applyArgs(multi.decision));
    assert.equal(stored.taskLinks.length, 2);
    assert.equal(new Set(stored.taskLinks.map((row) => row.taskId)).size, 2);
    assert.equal(stored.syncEvents.length, 2);
  });

  it('updates an existing pull request link from workflow_run and writes nothing when the sha is new', async () => {
    const opened = await decidePull('opened', { delivery: 'delivery-pr-for-run' });
    const stored = tablesWith();
    const ctx = dbCtx(stored);
    await run(applyInbound, ctx, applyArgs(opened.decision));
    const beforeEvents = stored.syncEvents.length;

    const unknownSha = 'cccccccccccccccccccccccccccccccccccccccc';
    const miss = await decidePull('opened', {
      body: { action: 'completed', workflow_run: { conclusion: 'success', head_sha: unknownSha } },
      event: 'workflow_run',
      delivery: 'delivery-run-miss',
    });
    const missed = await run(applyInbound, ctx, applyArgs(miss.decision));
    assert.deepEqual(missed, { ok: true, wrote: false, links: 0, stageMoves: 0 });
    assert.equal(stored.taskLinks.length, 1);
    assert.equal(stored.taskLinks[0]?.state, 'open');
    assert.equal(stored.syncEvents.length, beforeEvents);

    const hit = await decidePull('opened', {
      body: { action: 'completed', workflow_run: { conclusion: 'failure', head_sha: SHA } },
      event: 'workflow_run',
      delivery: 'delivery-run-hit',
    });
    assert.equal(hit.decision.ok, true);
    if (hit.decision.ok && hit.decision.plan.action === 'apply') {
      assert.equal(hit.decision.plan.matchSha, SHA);
      assert.equal(hit.decision.plan.items.length, 0);
    }
    const updated = await run(applyInbound, ctx, applyArgs(hit.decision));
    assert.deepEqual(updated, { ok: true, wrote: true, links: 1, stageMoves: 0 });
    assert.equal(stored.taskLinks.length, 1);
    assert.equal(stored.taskLinks[0]?.state, 'failure');
    assert.equal(stored.tasks[0]?.stage, 'Building');
    assert.equal(stored.notionOutbox.length, 0);
  });

  it('still moves the stage when a merge follows an open of the same sha', async () => {
    const opened = await decidePull('opened', { delivery: 'delivery-then-open' });
    const merged = await decidePull('closed', { delivery: 'delivery-then-merge' });
    const row = task();
    const stored = tablesWith(row);
    const ctx = dbCtx(stored);
    await withWriteback(true, async () => {
      await run(applyInbound, ctx, applyArgs(opened.decision));
      const second = await run(applyInbound, ctx, applyArgs(merged.decision));
      assert.equal((second as { stageMoves: number }).stageMoves, 1);
    });
    assert.equal(stored.taskLinks.length, 1);
    assert.equal(stored.taskLinks[0]?.state, 'merged');
    assert.equal(row.stage, MERGE_REVIEW_STAGE);
  });

  it('applies each Vercel deployment state once and keeps a single deploy link', async () => {
    async function vercel(type: string, id: string) {
      const rawBody = JSON.stringify({
        id,
        type,
        payload: {
          project: { name: 'warehaus-portal' },
          deployment: {
            id: 'dpl_portal_1',
            name: 'warehaus-portal',
            url: 'warehaus-portal-abc123.vercel.app',
            meta: { githubCommitSha: SHA, githubCommitMessage: `Portal-Task: ${TASK_ID}` },
          },
        },
      });
      return decideVercelWebhook({
        rawBody,
        signatureHeader: await vercelSignatureHeader(rawBody, SECRET),
        secret: SECRET,
      });
    }
    const stored = tablesWith();
    const ctx = dbCtx(stored);
    const created = await vercel('deployment.created', 'evt_created');
    const succeeded = await vercel('deployment.succeeded', 'evt_succeeded');
    const replay = await vercel('deployment.succeeded', 'evt_succeeded_again');
    await run(applyInbound, ctx, applyArgs(created));
    const next = await run(applyInbound, ctx, applyArgs(succeeded));
    const again = await run(applyInbound, ctx, applyArgs(replay));
    assert.equal((next as { wrote: boolean }).wrote, true);
    assert.deepEqual(again, { ok: true, wrote: false, links: 0, stageMoves: 0, duplicate: true });
    assert.equal(stored.taskLinks.length, 1);
    assert.equal(stored.taskLinks[0]?.state, 'succeeded');
    assert.equal(stored.taskLinks[0]?.url, 'https://warehaus-portal-abc123.vercel.app');
    assert.equal(stored.tasks[0]?.stage, 'Building');
  });

  it('rejects a body over 1 MiB with 413 before the signature', async () => {
    const exact = 'a'.repeat(INBOUND_MAX_BODY_BYTES);
    assert.equal(payloadTooLarge(null, exact), false);
    assert.equal(payloadTooLarge(String(INBOUND_MAX_BODY_BYTES), exact), false);
    assert.equal(payloadTooLarge(String(INBOUND_MAX_BODY_BYTES + 1), '{}'), true);
    assert.equal(payloadTooLarge(null, `${exact}b`), true);

    const calls: unknown[] = [];
    const oversized = `${exact}b`;
    await withEnv('GITHUB_WEBHOOK_SECRET', SECRET, async () => {
      const response = await run(
        githubWebhook,
        { runMutation: async (...args: unknown[]) => calls.push(args) },
        {
          text: async () => oversized,
          headers: { get: (name: string) => (name.toLowerCase() === 'content-length' ? '12' : null) },
        } as unknown as Record<string, unknown>,
      );
      assert.equal((response as Response).status, 413);
      const payload = await (response as Response).json() as { error?: string };
      assert.deepEqual(payload, { error: 'payload_too_large' });
    });
    await withEnv('VERCEL_WEBHOOK_SECRET', SECRET, async () => {
      const response = await run(
        vercelWebhook,
        { runMutation: async (...args: unknown[]) => calls.push(args) },
        {
          text: async () => '{}',
          headers: {
            get: (name: string) => (name.toLowerCase() === 'content-length' ? String(INBOUND_MAX_BODY_BYTES + 1) : null),
          },
        } as unknown as Record<string, unknown>,
      );
      assert.equal((response as Response).status, 413);
    });
    assert.equal(calls.length, 0);
  });

  it('returns 429 for a rate-limited delivery and does not record it', async () => {
    const stored = tablesWith();
    stored.syncMeta.push({
      _id: 'rate-http',
      key: INBOUND_RATE_KEY,
      details: JSON.stringify({ windowStartedAt: Date.now(), windowCount: INBOUND_RATE_LIMIT }),
      lastSyncedAt: Date.now(),
    });
    const rawBody = JSON.stringify(pullBody('opened'));
    await withEnv('GITHUB_WEBHOOK_SECRET', SECRET, async () => {
      const response = await run(
        githubWebhook,
        {
          runMutation: async (_ref: unknown, args: Record<string, unknown>) =>
            run(applyInbound, dbCtx(stored), args),
        },
        new Request('https://example.test/github/webhook', {
          method: 'POST',
          headers: {
            'x-hub-signature-256': await githubSignatureHeader(rawBody, SECRET),
            'x-github-event': 'pull_request',
            'x-github-delivery': 'delivery-http-limited',
          },
          body: rawBody,
        }) as unknown as Record<string, unknown>,
      );
      assert.equal((response as Response).status, 429);
      const payload = await (response as Response).json() as { error?: string };
      assert.deepEqual(payload, { error: 'rate_limited' });
    });
    assert.equal(stored.syncEvents.length, 0);
    assert.equal(stored.taskLinks.length, 0);
  });

  it('returns a generic 500 and logs without the payload', async () => {
    const rawBody = JSON.stringify(pullBody('opened'));
    const logs: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      logs.push(args);
    };
    try {
      await withEnv('GITHUB_WEBHOOK_SECRET', SECRET, async () => {
        const response = await run(
          githubWebhook,
          {
            runMutation: async () => {
              throw new Error(`boom ${rawBody}`);
            },
          },
          new Request('https://example.test/github/webhook', {
            method: 'POST',
            headers: {
              'x-hub-signature-256': await githubSignatureHeader(rawBody, SECRET),
              'x-github-event': 'pull_request',
              'x-github-delivery': 'delivery-boom',
            },
            body: rawBody,
          }) as unknown as Record<string, unknown>,
        );
        assert.equal((response as Response).status, 500);
        const payload = await (response as Response).json() as { error?: string };
        assert.deepEqual(payload, { error: 'internal' });
      });
    } finally {
      console.error = original;
    }
    assert.deepEqual(logs, [['[inbound-webhook] github failed']]);
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
