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
import { memoryCtx, type MemoryCtx, type Respond } from './memoryCtx.testkit';
import { seedOrg, seedProject, seedTask } from './seedRows.testkit';

const SECRET = 'test_webhook_secret';
const TASK_ID = '417ffd60316b81bca82ae951aa5a8a4e';
const SHA = 'abc123def456abc123def456abc123def456abcd';
const TIME = '2026-11-13T18:00:00.000Z';
const APPLY_INBOUND = 'sync/inbound:applyInbound';
const ENQUEUE = 'sync/outbox:enqueue';

type ApplyResult = {
  ok: true;
  wrote: boolean;
  duplicate?: boolean;
  unmatched?: boolean;
  limited?: boolean;
  links: number;
  stageMoves: number;
};

/**
 * One org and project with the task the Portal-Task line names. `task()`
 * reads the stored task row back.
 */
function world(taskFields: Record<string, unknown> = {}) {
  const t = memoryCtx();
  const orgId = seedOrg(t);
  const projectId = seedProject(t, orgId);
  const taskId = seedTask(t, orgId, projectId, {
    notionPageId: TASK_ID,
    name: 'Two-way sync',
    status: 'In Progress',
    isDone: false,
    publishToWarehaus: false,
    stage: 'Building',
    lastEditedTime: TIME,
    lastSyncedAt: 1,
    ...taskFields,
  });
  return { t, orgId, projectId, taskId, task: () => t.row(taskId) };
}

/** applyInbound queues its Notion write through enqueue. Run it for real. */
function runEnqueue(t: MemoryCtx): Respond {
  return (call) => (call.name === ENQUEUE ? t.call(enqueue, call.args) : undefined);
}

/** The webhook's one mutation, run for real against the same store. */
function runApplyInbound(t: MemoryCtx): Respond {
  return (call) =>
    call.name === APPLY_INBOUND ? t.call(applyInbound, call.args, { respond: runEnqueue(t) }) : undefined;
}

function apply(t: MemoryCtx, decision: Awaited<ReturnType<typeof decidePull>>['decision']) {
  return t.call<ApplyResult>(applyInbound, applyArgs(decision), { respond: runEnqueue(t) });
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

async function signedGitHubRequest(rawBody: string, delivery: string) {
  return new Request('https://example.test/github/webhook', {
    method: 'POST',
    headers: {
      'x-hub-signature-256': await githubSignatureHeader(rawBody, SECRET),
      'x-github-event': 'pull_request',
      'x-github-delivery': delivery,
    },
    body: rawBody,
  });
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
    const t = memoryCtx();
    await withEnv('GITHUB_WEBHOOK_SECRET', SECRET, async () => {
      const response = await t.callHttp(githubWebhook, new Request('https://example.test/github/webhook', {
        method: 'POST',
        headers: {
          'x-hub-signature-256': 'sha256=nope',
          'x-github-event': 'pull_request',
          'x-github-delivery': 'delivery-1',
        },
        body: JSON.stringify(pullBody('opened')),
      }));
      assert.equal(response.status, 401);
    });
    await withEnv('VERCEL_WEBHOOK_SECRET', SECRET, async () => {
      const response = await t.callHttp(vercelWebhook, new Request('https://example.test/vercel/webhook', {
        method: 'POST',
        headers: { 'x-vercel-signature': 'nope' },
        body: '{}',
      }));
      assert.equal(response.status, 401);
    });
    assert.deepEqual(t.runs, []);
  });
});

describe('inbound webhook matching', () => {
  it('ignores a pull request with no Portal-Task line and writes nothing', async () => {
    const body = pullBody('opened');
    (body.pull_request as { body: string }).body = 'No task line here.';
    const { decision } = await decidePull('opened', { body });
    assert.equal(decision.ok, true);
    if (decision.ok) assert.deepEqual(decision.plan, { action: 'ignore', reason: 'no_portal_task' });

    const t = memoryCtx();
    await withEnv('GITHUB_WEBHOOK_SECRET', SECRET, async () => {
      const response = await t.callHttp(
        githubWebhook,
        await signedGitHubRequest(JSON.stringify(body), 'delivery-unmatched-line'),
      );
      assert.equal(response.status, 200);
      const payload = await response.json() as { ignored?: string };
      assert.equal(payload.ignored, 'no_portal_task');
    });
    assert.deepEqual(t.runs, []);
  });

  it('writes nothing when the Portal-Task id does not match a task', async () => {
    const { decision } = await decidePull('opened');
    const { t } = world({ notionPageId: 'ffffffffffffffffffffffffffffffff' });
    const result = await apply(t, decision);
    assert.deepEqual(result, { ok: true, wrote: false, links: 0, stageMoves: 0, unmatched: true });
    assert.equal(t.rows('taskLinks').length, 0);
    assert.equal(t.rows('syncEvents').length, 0);
    assert.equal(t.rows('notionOutbox').length, 0);
    assert.equal(t.rows('syncMeta').length, 0);
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
    const { t, task } = world();
    await withWriteback(true, async () => {
      const first = await apply(t, opened.decision);
      assert.equal(first.wrote, true);
      assert.equal(task()?.stage, 'Building');
      const mergedBody = pullBody('closed');
      const rawBody = JSON.stringify(mergedBody);
      const replay = await decideGitHubWebhook({
        rawBody,
        signatureHeader: await githubSignatureHeader(rawBody, SECRET),
        eventHeader: 'pull_request',
        deliveryHeader: 'delivery-same',
        secret: SECRET,
      });
      const second = await apply(t, replay);
      assert.deepEqual(second, { ok: true, wrote: false, links: 0, stageMoves: 0, duplicate: true });
    });
    const links = t.rows('taskLinks');
    assert.equal(links.length, 1);
    assert.equal(links[0]?.state, 'open');
    assert.equal(task()?.stage, 'Building');
    assert.equal(task()?.status, 'In Progress');
    assert.equal(task()?.isDone, false);
    assert.equal(t.rows('notionOutbox').length, 0);
    assert.equal(t.rows('syncEvents').length, 2);
  });

  it('does not write again for the same repo, number, and sha', async () => {
    const firstDecision = await decidePull('opened', { delivery: 'delivery-a' });
    const secondDecision = await decidePull('opened', { delivery: 'delivery-b' });
    const { t } = world();
    const first = await apply(t, firstDecision.decision);
    assert.equal(first.wrote, true);
    const updatedAt = t.rows('taskLinks')[0]?.updatedAt;
    const second = await apply(t, secondDecision.decision);
    assert.deepEqual(second, { ok: true, wrote: false, links: 0, stageMoves: 0, duplicate: true });
    const links = t.rows('taskLinks');
    assert.equal(links.length, 1);
    assert.equal(links[0]?.updatedAt, updatedAt);
    assert.equal(t.rows('syncEvents').length, 2);
    assert.equal(t.rows('syncMeta').length, 1);
  });

  it('a retried delivery sees the claim and does not insert a second link', async () => {
    const { decision } = await decidePull('opened', { delivery: 'delivery-race' });
    const { t } = world();
    t.seed('syncEvents', {
      eventId: deliveryClaimId('github', 'delivery-race'),
      receivedAt: 1,
      status: 'done',
      processedAt: 1,
    });
    t.seed('syncEvents', {
      eventId: deliveryClaimId('github', 'delivery-race'),
      receivedAt: 2,
      status: 'done',
      processedAt: 2,
    });
    const result = await apply(t, decision);
    assert.deepEqual(result, { ok: true, wrote: false, links: 0, stageMoves: 0, duplicate: true });
    assert.equal(t.rows('taskLinks').length, 0);
    assert.equal(t.rows('syncEvents').length, 2);
  });

  it('keeps one link when the same url arrives with a new sha', async () => {
    const opened = await decidePull('opened', { delivery: 'delivery-url-1' });
    const nextSha = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const body = pullBody('synchronize');
    (body.pull_request as { head: { sha: string } }).head = { sha: nextSha };
    const synced = await decidePull('synchronize', { body, delivery: 'delivery-url-2' });
    const { t } = world();
    await apply(t, opened.decision);
    const second = await apply(t, synced.decision);
    assert.deepEqual(second, { ok: true, wrote: true, links: 1, stageMoves: 0 });
    const links = t.rows('taskLinks');
    assert.equal(links.length, 1);
    assert.equal(links[0]?.sha, nextSha);
    assert.equal(links[0]?.url, 'https://github.com/warehauscollective/warehaus/pull/12');
  });

  it('patches a legacy duplicate url instead of inserting a third row', async () => {
    const nextSha = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const body = pullBody('synchronize');
    (body.pull_request as { head: { sha: string } }).head = { sha: nextSha };
    const synced = await decidePull('synchronize', { body, delivery: 'delivery-legacy-url' });
    const { t, orgId, taskId } = world();
    const url = 'https://github.com/warehauscollective/warehaus/pull/12';
    const legacy = { orgId, taskId, kind: 'PR', url, sha: SHA, state: 'open', addedBy: 'github-webhook', createdAt: 1 };
    const firstLink = t.seed('taskLinks', legacy);
    const secondLink = t.seed('taskLinks', legacy);
    const result = await apply(t, synced.decision);
    assert.equal(result.wrote, true);
    assert.equal(t.rows('taskLinks').length, 2);
    assert.equal(t.row(firstLink)?.sha, nextSha);
    assert.equal(t.row(secondLink)?.sha, SHA);
  });
});

describe('inbound webhook stage moves', () => {
  it('moves a merged pull request to Shipped and never to Done', async () => {
    const { decision } = await decidePull('closed', { delivery: 'delivery-merge' });
    assert.equal(decision.ok, true);
    if (decision.ok && decision.plan.action === 'apply') {
      assert.equal(decision.plan.items[0]?.moveStage, true);
      assert.equal(decision.plan.items[0]?.state, 'merged');
      assert.equal(decision.plan.items[0]?.kind, 'PR');
    }
    const { t, task } = world();
    await withWriteback(true, async () => {
      const result = await apply(t, decision);
      assert.deepEqual(result, { ok: true, wrote: true, links: 1, stageMoves: 1 });
    });
    assert.deepEqual(t.runs.map((call) => call.name), [ENQUEUE]);
    const row = task();
    assert.equal(row?.stage, MERGE_REVIEW_STAGE);
    assert.equal(row?.status, 'In Progress');
    assert.equal(row?.isDone, false);
    assert.equal(row?.publishToWarehaus, false);
    const outbox = t.rows('notionOutbox');
    assert.equal(outbox.length, 1);
    const payload = JSON.parse(String(outbox[0]?.payload)) as {
      properties: Record<string, string>;
    };
    assert.equal(payload.properties.Stage, 'Shipped');
    assert.equal(payload.properties['GitHub Issue/PR'], 'https://github.com/warehauscollective/warehaus/pull/12');
    assert.equal('Status' in payload.properties, false);
    assert.equal(Object.values(payload.properties).includes('Done'), false);
    const links = t.rows('taskLinks');
    assert.equal(links[0]?.kind, 'PR');
    assert.equal(links[0]?.sha, SHA);
    assert.equal(links[0]?.state, 'merged');
  });

  it('keeps the link when write-back is off and does not patch the stage', async () => {
    const { decision } = await decidePull('closed', { delivery: 'delivery-off' });
    const { t, task } = world();
    await withWriteback(false, async () => {
      const result = await apply(t, decision);
      assert.equal(result.links, 1);
      assert.equal(result.stageMoves, 0);
    });
    assert.equal(task()?.stage, 'Building');
    assert.equal(task()?.status, 'In Progress');
    assert.equal(t.rows('notionOutbox').length, 0);
    assert.equal(t.rows('taskLinks').length, 1);
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
    if (forward.ok) assert.equal(forward.stage, 'Shipped');
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
    const { t, task } = world({ stage: 'Parked' });
    await withWriteback(true, async () => {
      const result = await apply(t, decision);
      assert.equal(result.links, 1);
      assert.equal(result.stageMoves, 0);
    });
    assert.equal(task()?.stage, 'Parked');
    assert.equal(task()?.status, 'In Progress');
    assert.equal(t.rows('notionOutbox').length, 0);
    assert.equal(t.rows('taskLinks')[0]?.state, 'merged');
  });

  it('notes a closed unmerged pull request and does not queue a stage', async () => {
    const body = pullBody('closed');
    (body.pull_request as { merged: boolean }).merged = false;
    const { decision } = await decidePull('closed', { body, delivery: 'delivery-closed' });
    if (decision.ok && decision.plan.action === 'apply') assert.equal(decision.plan.items[0]?.moveStage, false);
    const { t, task } = world();
    await withWriteback(true, async () => {
      await apply(t, decision);
    });
    assert.equal(task()?.stage, 'Building');
    assert.equal(t.rows('notionOutbox').length, 0);
    assert.equal(t.rows('taskLinks')[0]?.state, 'closed');
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
    const { t, task } = world();
    await withWriteback(true, async () => {
      const result = await apply(t, decision);
      assert.deepEqual(result, { ok: true, wrote: true, links: 1, stageMoves: 0 });
    });
    assert.equal(task()?.stage, 'Building');
    assert.equal(t.rows('notionOutbox').length, 0);
    const links = t.rows('taskLinks');
    assert.equal(links[0]?.kind, 'deploy');
    assert.equal(links[0]?.state, 'succeeded');
    assert.equal(links[0]?.url, 'https://warehaus-portal-abc123.vercel.app');
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
    const { t } = world();
    t.seed('syncMeta', {
      key: INBOUND_RATE_KEY,
      details: JSON.stringify({ windowStartedAt: Date.now(), windowCount: INBOUND_RATE_LIMIT }),
      lastSyncedAt: Date.now(),
    });
    const result = await apply(t, decision);
    assert.deepEqual(result, { ok: true, wrote: false, links: 0, stageMoves: 0, limited: true });
    assert.equal(t.rows('taskLinks').length, 0);
    assert.equal(t.rows('syncEvents').length, 0);
  });
});

describe('inbound webhook claims and checks', () => {
  it('matches a dashed Portal-Task line and two ids on one pull request', async () => {
    const dashed = '417ffd60-316b-81bc-a82a-e951aa5a8a4e';
    const dashedBody = pullBody('opened');
    (dashedBody.pull_request as { body: string }).body = `Portal-Task: ${dashed}`;
    const dashedDecision = await decidePull('opened', { body: dashedBody, delivery: 'delivery-dashed' });
    const dashedWorld = world({ notionPageId: dashed });
    const dashedResult = await apply(dashedWorld.t, dashedDecision.decision);
    assert.equal(dashedResult.links, 1);
    assert.equal(dashedWorld.t.rows('taskLinks').length, 1);

    const other = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const multiBody = pullBody('opened');
    (multiBody.pull_request as { body: string }).body = `Portal-Task: ${TASK_ID}\nPortal-Task: ${other}\n`;
    const multi = await decidePull('opened', { body: multiBody, delivery: 'delivery-multi' });
    const { t, orgId, projectId } = world();
    seedTask(t, orgId, projectId, {
      notionPageId: other,
      name: 'Second',
      status: 'In Progress',
      stage: 'Building',
      lastEditedTime: TIME,
      lastSyncedAt: 1,
    });
    await apply(t, multi.decision);
    const links = t.rows('taskLinks');
    assert.equal(links.length, 2);
    assert.equal(new Set(links.map((row) => row.taskId)).size, 2);
    assert.equal(t.rows('syncEvents').length, 2);
  });

  it('updates an existing pull request link from workflow_run and writes nothing when the sha is new', async () => {
    const opened = await decidePull('opened', { delivery: 'delivery-pr-for-run' });
    const { t, task } = world();
    await apply(t, opened.decision);
    const beforeEvents = t.rows('syncEvents').length;

    const unknownSha = 'cccccccccccccccccccccccccccccccccccccccc';
    const miss = await decidePull('opened', {
      body: { action: 'completed', workflow_run: { conclusion: 'success', head_sha: unknownSha } },
      event: 'workflow_run',
      delivery: 'delivery-run-miss',
    });
    const missed = await apply(t, miss.decision);
    assert.deepEqual(missed, { ok: true, wrote: false, links: 0, stageMoves: 0 });
    assert.equal(t.rows('taskLinks').length, 1);
    assert.equal(t.rows('taskLinks')[0]?.state, 'open');
    assert.equal(t.rows('syncEvents').length, beforeEvents);

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
    const updated = await apply(t, hit.decision);
    assert.deepEqual(updated, { ok: true, wrote: true, links: 1, stageMoves: 0 });
    assert.equal(t.rows('taskLinks').length, 1);
    assert.equal(t.rows('taskLinks')[0]?.state, 'failure');
    assert.equal(task()?.stage, 'Building');
    assert.equal(t.rows('notionOutbox').length, 0);
  });

  it('still moves the stage when a merge follows an open of the same sha', async () => {
    const opened = await decidePull('opened', { delivery: 'delivery-then-open' });
    const merged = await decidePull('closed', { delivery: 'delivery-then-merge' });
    const { t, task } = world();
    await withWriteback(true, async () => {
      await apply(t, opened.decision);
      const second = await apply(t, merged.decision);
      assert.equal(second.stageMoves, 1);
    });
    const links = t.rows('taskLinks');
    assert.equal(links.length, 1);
    assert.equal(links[0]?.state, 'merged');
    assert.equal(task()?.stage, MERGE_REVIEW_STAGE);
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
    const { t, task } = world();
    const created = await vercel('deployment.created', 'evt_created');
    const succeeded = await vercel('deployment.succeeded', 'evt_succeeded');
    const replay = await vercel('deployment.succeeded', 'evt_succeeded_again');
    await apply(t, created);
    const next = await apply(t, succeeded);
    const again = await apply(t, replay);
    assert.equal(next.wrote, true);
    assert.deepEqual(again, { ok: true, wrote: false, links: 0, stageMoves: 0, duplicate: true });
    const links = t.rows('taskLinks');
    assert.equal(links.length, 1);
    assert.equal(links[0]?.state, 'succeeded');
    assert.equal(links[0]?.url, 'https://warehaus-portal-abc123.vercel.app');
    assert.equal(task()?.stage, 'Building');
  });

  it('rejects a body over 1 MiB with 413 before the signature', async () => {
    const exact = 'a'.repeat(INBOUND_MAX_BODY_BYTES);
    assert.equal(payloadTooLarge(null, exact), false);
    assert.equal(payloadTooLarge(String(INBOUND_MAX_BODY_BYTES), exact), false);
    assert.equal(payloadTooLarge(String(INBOUND_MAX_BODY_BYTES + 1), '{}'), true);
    assert.equal(payloadTooLarge(null, `${exact}b`), true);

    const t = memoryCtx();
    const oversized = `${exact}b`;
    await withEnv('GITHUB_WEBHOOK_SECRET', SECRET, async () => {
      // The header understates the size, so the body itself must be measured.
      const response = await t.callHttp(
        githubWebhook,
        new Request('https://example.test/github/webhook', {
          method: 'POST',
          headers: { 'content-length': '12' },
          body: oversized,
        }),
      );
      assert.equal(response.status, 413);
      const payload = await response.json() as { error?: string };
      assert.deepEqual(payload, { error: 'payload_too_large' });
    });
    await withEnv('VERCEL_WEBHOOK_SECRET', SECRET, async () => {
      const response = await t.callHttp(
        vercelWebhook,
        new Request('https://example.test/vercel/webhook', {
          method: 'POST',
          headers: { 'content-length': String(INBOUND_MAX_BODY_BYTES + 1) },
          body: '{}',
        }),
      );
      assert.equal(response.status, 413);
    });
    assert.deepEqual(t.runs, []);
  });

  it('returns 429 for a rate-limited delivery and does not record it', async () => {
    const { t } = world();
    t.seed('syncMeta', {
      key: INBOUND_RATE_KEY,
      details: JSON.stringify({ windowStartedAt: Date.now(), windowCount: INBOUND_RATE_LIMIT }),
      lastSyncedAt: Date.now(),
    });
    const rawBody = JSON.stringify(pullBody('opened'));
    await withEnv('GITHUB_WEBHOOK_SECRET', SECRET, async () => {
      const response = await t.callHttp(
        githubWebhook,
        await signedGitHubRequest(rawBody, 'delivery-http-limited'),
        { respond: runApplyInbound(t) },
      );
      assert.equal(response.status, 429);
      const payload = await response.json() as { error?: string };
      assert.deepEqual(payload, { error: 'rate_limited' });
    });
    assert.deepEqual(t.runs.map((call) => call.name), [APPLY_INBOUND]);
    assert.equal(t.rows('syncEvents').length, 0);
    assert.equal(t.rows('taskLinks').length, 0);
  });

  it('returns a generic 500 and logs without the payload', async () => {
    const rawBody = JSON.stringify(pullBody('opened'));
    const t = memoryCtx();
    const logs: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      logs.push(args);
    };
    try {
      await withEnv('GITHUB_WEBHOOK_SECRET', SECRET, async () => {
        const response = await t.callHttp(githubWebhook, await signedGitHubRequest(rawBody, 'delivery-boom'), {
          respond: () => {
            throw new Error(`boom ${rawBody}`);
          },
        });
        assert.equal(response.status, 500);
        const payload = await response.json() as { error?: string };
        assert.deepEqual(payload, { error: 'internal' });
      });
    } finally {
      console.error = original;
    }
    assert.deepEqual(t.runs.map((call) => call.name), [APPLY_INBOUND]);
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
