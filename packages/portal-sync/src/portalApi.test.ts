import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mapNotionTask } from './mappers';
import {
  applyFieldWrite,
  authorizeApiCall,
  claimIdempotency,
  completeIdempotency,
  idempotencyDecision,
  idempotencyKeyError,
  planApiComment,
  planApiLink,
  planApiLinkPatch,
  planApiTaskCreate,
  planApiTaskUpdate,
  portalRequestAuth,
  pullFieldsChanged,
  pullUpdatedAt,
  resolvePulledStage,
  sourceLinksChanged,
  storedPullLastEditedTime,
  sourceLinksFromFields,
  takeRateLimit,
  taskListPlan,
  toPortalTokenListItem,
  visibilityWriteError,
  type IdempotencyRecord,
  type PullFieldSnapshot,
} from './portalApi';

const page = { notionPageId: 'page-1', expectedLastEditedTime: '2026-11-13T15:00:00.000Z' };

describe('portal API auth scopes', () => {
  it('rejects a missing or revoked token and a read token that writes', () => {
    assert.deepEqual(authorizeApiCall({ token: null, method: 'GET' }), {
      ok: false,
      status: 401,
      reason: 'missing',
    });
    assert.deepEqual(
      authorizeApiCall({ token: { scope: 'read-write', revokedAt: 10 }, method: 'GET' }),
      { ok: false, status: 401, reason: 'revoked' },
    );
    assert.deepEqual(authorizeApiCall({ token: { scope: 'read' }, method: 'POST' }), {
      ok: false,
      status: 403,
      reason: 'scope',
    });
    assert.equal(authorizeApiCall({ token: { scope: 'read' }, method: 'GET' }).ok, true);
    assert.equal(authorizeApiCall({ token: { scope: 'read-write' }, method: 'POST' }).ok, true);
  });

  it('limits a token inside its window and opens a new window after it', () => {
    const first = takeRateLimit({
      windowStartedAt: 0,
      windowCount: 0,
      limit: 2,
      windowMs: 60_000,
      now: 1_000,
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    const second = takeRateLimit({ ...first, limit: 2, windowMs: 60_000, now: 2_000 });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    const blocked = takeRateLimit({ ...second, limit: 2, windowMs: 60_000, now: 3_000 });
    assert.equal(blocked.ok, false);
    const reset = takeRateLimit({
      windowStartedAt: second.windowStartedAt,
      windowCount: second.windowCount,
      limit: 2,
      windowMs: 60_000,
      now: 61_000,
    });
    assert.equal(reset.ok, true);
    if (reset.ok) assert.equal(reset.windowCount, 1);
  });
});

describe('portal API idempotency', () => {
  it('starts, replays the same request, and rejects a different body', () => {
    assert.deepEqual(idempotencyDecision({ existing: null, requestHash: 'a' }), { action: 'start' });
    assert.deepEqual(
      idempotencyDecision({
        existing: { requestHash: 'a', state: 'done', status: 200, body: '{"id":"1"}' },
        requestHash: 'a',
      }),
      { action: 'replay', status: 200, body: '{"id":"1"}' },
    );
    assert.equal(
      idempotencyDecision({
        existing: { requestHash: 'a', state: 'done', status: 200, body: '{}' },
        requestHash: 'b',
      }).action,
      'mismatch',
    );
    assert.equal(
      idempotencyDecision({
        existing: { requestHash: 'a', state: 'pending' },
        requestHash: 'a',
      }).action,
      'in_progress',
    );
  });

  it('tells a missing key from a blank key and a key that is too long', () => {
    assert.equal(idempotencyKeyError(null), 'Idempotency key is required');
    assert.equal(idempotencyKeyError(''), 'Idempotency key is required');
    assert.equal(idempotencyKeyError('   '), 'Idempotency key cannot be blank');
    assert.equal(idempotencyKeyError(' key'), 'Idempotency key cannot be blank');
    assert.equal(idempotencyKeyError('k'.repeat(201)), 'Idempotency key is too long');
    assert.equal(idempotencyKeyError('cursor-portal'), null);
  });

  it('lets only one of two overlapping same-key writes start', async () => {
    let record: IdempotencyRecord | null = null;
    let writes = 0;
    async function attempt() {
      const claim = claimIdempotency(record, 'same-hash');
      record = claim.record;
      if (claim.action !== 'start') return claim.action;
      await Promise.resolve();
      writes += 1;
      record = completeIdempotency(claim.record, { status: 200, body: '{"id":"1"}' });
      return 'wrote';
    }
    const [first, second] = await Promise.all([attempt(), attempt()]);
    assert.equal(writes, 1);
    assert.deepEqual([first, second].sort(), ['in_progress', 'wrote']);
  });
});

describe('portal API conflict rule', () => {
  const stamp = { updatedAt: 200, updatedBy: 'cursor-portal' };

  it('lets the newer field write win and keeps an older one from replacing it', () => {
    const newer = applyFieldWrite({
      field: 'priority',
      origin: 'api',
      currentValue: 'Low',
      currentStamp: stamp,
      nextValue: 'High',
      updatedAt: 200,
      updatedBy: 'grok-adl',
    });
    assert.equal(newer.apply, true);
    if (newer.apply) assert.equal(newer.stamp.updatedBy, 'grok-adl');
    const older = applyFieldWrite({
      field: 'priority',
      origin: 'api',
      currentValue: 'High',
      currentStamp: stamp,
      nextValue: 'Low',
      updatedAt: 199,
      updatedBy: 'grok-adl',
    });
    assert.deepEqual(older, { apply: false, reason: 'A newer write already set this field' });
  });

  it('stops an event from reopening Done or moving a stage backwards', () => {
    const reopen = applyFieldWrite({
      field: 'status',
      origin: 'event',
      currentValue: 'Done',
      currentStamp: stamp,
      nextValue: 'In Progress',
      updatedAt: 300,
      updatedBy: 'github',
    });
    assert.equal(reopen.apply, false);
    if (!reopen.apply) assert.match(reopen.reason, /Done/);
    const back = applyFieldWrite({
      field: 'stage',
      origin: 'event',
      currentValue: 'Shipped',
      currentStamp: null,
      nextValue: 'Building',
      updatedAt: 300,
      updatedBy: 'github',
    });
    assert.equal(back.apply, false);
    const forward = applyFieldWrite({
      field: 'stage',
      origin: 'event',
      currentValue: 'Building',
      currentStamp: stamp,
      nextValue: 'Ready to Ship',
      updatedAt: 300,
      updatedBy: 'github',
    });
    assert.equal(forward.apply, true);
  });

  it('lets a newer staff write reopen a task', () => {
    const staff = applyFieldWrite({
      field: 'status',
      origin: 'api',
      currentValue: 'Done',
      currentStamp: stamp,
      nextValue: 'In Progress',
      updatedAt: 300,
      updatedBy: 'cursor-portal',
    });
    assert.equal(staff.apply, true);
  });

  it('keeps a newer Convex field when an older Notion pull arrives', () => {
    const pulled = applyFieldWrite({
      field: 'status',
      origin: 'pull',
      currentValue: 'In Progress',
      currentStamp: { updatedAt: 500, updatedBy: 'cursor-portal' },
      nextValue: 'Inbox',
      updatedAt: 400,
      updatedBy: 'notion',
    });
    assert.equal(pulled.apply, false);
  });

  it('keeps a newer stage stamp when an older pull arrives and keeps a pending move', () => {
    const stampAt = Date.parse('2026-11-13T16:00:00.000Z');
    const older = resolvePulledStage({
      pending: false,
      notionStage: 'Building',
      notionEditedMs: Date.parse('2026-11-13T15:00:00.000Z'),
      localStage: 'Ready to Ship',
      localStamp: { updatedAt: stampAt, updatedBy: 'cursor-portal' },
      pulledStage: 'Building',
      pulledStageSynced: 'Building',
      pulledLastEditedTime: '2026-11-13T15:00:00.000Z',
    });
    assert.equal(older.keptLocal, true);
    assert.equal(older.stage, 'Ready to Ship');
    assert.equal(older.stamp, null);
    assert.equal(
      storedPullLastEditedTime(older.lastEditedTime, '2026-11-13T14:00:00.000Z'),
      '2026-11-13T15:00:00.000Z',
    );
    const pending = resolvePulledStage({
      pending: true,
      notionStage: 'Building',
      notionEditedMs: Date.parse('2026-11-13T15:00:00.000Z'),
      localStage: 'Ready to Ship',
      localStamp: { updatedAt: stampAt, updatedBy: 'cursor-portal' },
      pulledStage: 'Ready to Ship',
      pulledStageSynced: 'Building',
      pulledLastEditedTime: '2026-11-13T14:00:00.000Z',
    });
    assert.equal(pending.keptLocal, false);
    assert.equal(pending.stage, 'Ready to Ship');
    assert.equal(pending.stageSynced, 'Building');
    const event = applyFieldWrite({
      field: 'status',
      origin: 'event',
      currentValue: 'Done',
      currentStamp: { updatedAt: stampAt, updatedBy: 'cursor-portal' },
      nextValue: 'In Progress',
      updatedAt: stampAt + 1_000,
      updatedBy: 'github',
    });
    assert.equal(event.apply, false);
  });

  it('keeps the local stage when the stamp wins and still stores the newer Notion lastEditedTime', () => {
    const resolved = resolvePulledStage({
      pending: false,
      notionStage: 'Building',
      notionEditedMs: Date.parse('2026-11-13T15:00:00.000Z'),
      localStage: 'Ready to Ship',
      localStamp: { updatedAt: Date.parse('2026-11-13T16:00:00.000Z'), updatedBy: 'cursor-portal' },
      pulledStage: 'Building',
      pulledStageSynced: 'Building',
      pulledLastEditedTime: '2026-11-13T15:00:00.000Z',
    });
    assert.equal(resolved.keptLocal, true);
    assert.equal(resolved.stage, 'Ready to Ship');
    assert.equal(resolved.stamp, null);
    assert.equal(
      storedPullLastEditedTime(resolved.lastEditedTime, '2026-11-13T14:00:00.000Z'),
      '2026-11-13T15:00:00.000Z',
    );
  });
});

const quietPull: PullFieldSnapshot = {
  name: 'Ship the API',
  date: '2026-11-20',
  description: 'Staff notes',
  status: 'In Progress',
  isDone: false,
  stage: 'Building',
  priority: 'High',
  nextAction: 'Review the diff',
  pullRequestUrl: 'https://github.com/warehauscollective/warehaus/pull/12',
  figmaFrame: null,
  repoBranch: 'cursor/portal-api-p1-eeef',
};

describe('portal pull updatedAt', () => {
  it('leaves updatedAt alone on a no-op pull and bumps it when a field or link changes', () => {
    assert.equal(pullFieldsChanged(quietPull, { ...quietPull }), false);
    assert.equal(
      sourceLinksChanged(
        [{ kind: 'PR', url: quietPull.pullRequestUrl ?? '', addedBy: 'notion' }],
        [{ kind: 'PR', url: quietPull.pullRequestUrl ?? '' }],
      ),
      false,
    );
    assert.equal(
      pullUpdatedAt({ previousUpdatedAt: 100, now: 999, fieldsChanged: false, linksChanged: false }),
      100,
    );
    assert.equal(
      pullUpdatedAt({
        previousUpdatedAt: 100,
        now: 999,
        fieldsChanged: pullFieldsChanged(quietPull, { ...quietPull, stage: 'Shipped' }),
        linksChanged: false,
      }),
      999,
    );
    assert.equal(pullUpdatedAt({ previousUpdatedAt: 100, now: 999, fieldsChanged: false, linksChanged: true }), 999);
    for (const edit of [
      { name: 'Rename the task' },
      { date: '2026-11-21' },
      { description: 'Updated in Notion' },
    ] as const) {
      assert.equal(pullFieldsChanged(quietPull, { ...quietPull, ...edit }), true);
      assert.equal(
        pullUpdatedAt({
          previousUpdatedAt: 100,
          now: 999,
          fieldsChanged: pullFieldsChanged(quietPull, { ...quietPull, ...edit }),
          linksChanged: false,
        }),
        999,
      );
    }
  });
});

const bearer = 'Bearer whp_0123456789abcdef';

describe('portal HTTP auth', () => {
  it('rejects a missing, malformed, or revoked bearer and a read token that posts', () => {
    assert.deepEqual(portalRequestAuth({ authorization: null, method: 'GET', stored: { scope: 'read-write' } }), {
      ok: false,
      status: 401,
      error: 'Unauthorized',
    });
    assert.equal(portalRequestAuth({ authorization: 'Bearer nope', method: 'GET', stored: { scope: 'read-write' } }).ok, false);
    assert.equal(
      portalRequestAuth({ authorization: 'Bearer whp_short', method: 'GET', stored: { scope: 'read-write' } }).ok,
      false,
    );
    assert.deepEqual(
      portalRequestAuth({
        authorization: bearer,
        method: 'GET',
        stored: { scope: 'read-write', revokedAt: 5 },
      }),
      { ok: false, status: 401, error: 'Unauthorized' },
    );
    assert.deepEqual(portalRequestAuth({ authorization: bearer, method: 'POST', stored: { scope: 'read' } }), {
      ok: false,
      status: 403,
      error: 'This token is read-only',
    });
    assert.equal(portalRequestAuth({ authorization: bearer, method: 'POST', stored: { scope: 'read-write' } }).ok, true);
  });

  it('does not apply a second overlapping write for the same idempotency key', async () => {
    let record: IdempotencyRecord | null = null;
    let writes = 0;
    async function post() {
      const claim = claimIdempotency(record, 'http-hash');
      record = claim.record;
      if (claim.action !== 'start') return claim.action;
      await Promise.resolve();
      writes += 1;
      record = completeIdempotency(claim.record, { status: 200, body: '{"ok":true}' });
      return 'wrote';
    }
    const results = await Promise.all([post(), post()]);
    assert.equal(writes, 1);
    assert.deepEqual(results.sort(), ['in_progress', 'wrote']);
  });
});

describe('portal API outbox plans', () => {
  it('patches status, priority, and next action with kind update', () => {
    const planned = planApiTaskUpdate({
      ...page,
      status: 'In Progress',
      priority: 'High',
      nextAction: 'Review the diff',
    });
    assert.equal(planned.ok, true);
    if (!planned.ok) return;
    assert.equal(planned.writes.length, 1);
    assert.equal(planned.writes[0]?.kind, 'update');
    assert.deepEqual(planned.writes[0]?.properties, {
      Status: 'In Progress',
      Priority: 'High',
      'Next Action': 'Review the diff',
    });
  });

  it('keeps a stage move on the task-stage path and create on the create path', () => {
    const stage = planApiTaskUpdate({ ...page, stage: 'Planning' });
    assert.equal(stage.ok, true);
    if (!stage.ok) return;
    assert.equal(stage.writes[0]?.kind, 'task-stage');
    assert.equal(stage.writes[0]?.properties.Stage, 'Planning');
    const created = planApiTaskCreate({
      name: 'Ship the API',
      status: 'To Do',
      projectNotionId: 'project-1',
      externalId: 'wh_tsk_portalapi',
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.kind, 'create');
    assert.equal(created.properties.Name, 'Ship the API');
    assert.equal(created.properties['Publish to Warehaus'], false);
  });

  it('refuses client visibility and a Notion page for comments or non-field links', () => {
    assert.match(visibilityWriteError({ publishToWarehaus: true }) ?? '', /visibility/);
    assert.equal(planApiComment('Noted on the task').ok, true);
    const chat = planApiLink({ kind: 'chat request', url: 'https://example.com/chat' });
    assert.equal(chat.ok, true);
    if (!chat.ok) return;
    assert.equal(chat.property, null);
    const pr = planApiLink({ kind: 'PR', url: 'https://github.com/warehauscollective/warehaus/pull/12' });
    assert.equal(pr.ok, true);
    if (!pr.ok || !pr.property) return;
    const patch = planApiLinkPatch(pr.property, pr.url);
    assert.equal(patch.ok, true);
    if (patch.ok) assert.equal(patch.kind, 'update');
  });

  it('reads one indexed filter at a time', () => {
    assert.equal(taskListPlan({ projectId: 'p', status: 'Done' }).ok, true);
    assert.equal(taskListPlan({ status: 'Done', stage: 'Building' }).ok, false);
    assert.equal(taskListPlan({}).ok, false);
  });
});

describe('task link backfill', () => {
  it('copies GitHub, Figma, and the repo branch and drops blanks', () => {
    assert.deepEqual(
      sourceLinksFromFields({
        pullRequestUrl: 'https://github.com/warehauscollective/warehaus/pull/12',
        figmaFrame: ' https://www.figma.com/file/abc ',
        repoBranch: 'cursor/portal-api-p1-eeef',
      }),
      [
        { kind: 'PR', url: 'https://github.com/warehauscollective/warehaus/pull/12' },
        { kind: 'Figma frame', url: 'https://www.figma.com/file/abc' },
        { kind: 'Repo branch', url: 'cursor/portal-api-p1-eeef' },
      ],
    );
    assert.deepEqual(sourceLinksFromFields({ pullRequestUrl: '  ', figmaFrame: null, repoBranch: '' }), []);
  });

  it('maps the Notion fields that the tier list does not sync in', () => {
    const mapped = mapNotionTask(
      'page-1',
      {
        Name: { type: 'title', title: [{ plain_text: 'Ship the API' }] },
        Status: { type: 'status', status: { name: 'In Progress' } },
        'Is Done': { type: 'formula', formula: { type: 'boolean', boolean: false } },
        Projects: { type: 'relation', relation: [{ id: 'project-1' }] },
        'Publish to Warehaus': { type: 'checkbox', checkbox: true },
        'GitHub Issue/PR': { type: 'url', url: 'https://github.com/warehauscollective/warehaus/pull/12' },
        'Figma Frame': { type: 'rich_text', rich_text: [{ plain_text: 'https://www.figma.com/file/abc' }] },
        'Repo Branch': { type: 'rich_text', rich_text: [{ plain_text: 'cursor/portal-api-p1-eeef' }] },
        'Next Action': { type: 'rich_text', rich_text: [{ plain_text: 'Review the diff' }] },
      },
      true,
    );
    assert.equal(mapped.row?.database, 'tasks');
    if (mapped.row?.database !== 'tasks') return;
    assert.equal(mapped.row.pullRequestUrl, 'https://github.com/warehauscollective/warehaus/pull/12');
    assert.equal(mapped.row.figmaFrame, 'https://www.figma.com/file/abc');
    assert.equal(mapped.row.repoBranch, 'cursor/portal-api-p1-eeef');
    assert.equal(mapped.row.nextAction, 'Review the diff');
  });
});

describe('portal token list', () => {
  it('returns the prefix and never the raw token or its hash', () => {
    const item = toPortalTokenListItem({
      id: 'tok',
      name: 'cursor-portal',
      prefix: 'whp_shownonce',
      scope: 'read-write',
      createdAt: 1,
      rateLimit: 60,
      token: 'whp_shownonceSECRET',
      tokenHash: 'abc',
    });
    assert.equal('token' in item, false);
    assert.equal('tokenHash' in item, false);
    assert.equal(item.prefix, 'whp_shownonce');
  });
});
