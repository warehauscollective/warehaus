import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mapNotionTask } from './mappers';
import {
  applyFieldWrite,
  authorizeApiCall,
  API_IDEMPOTENCY_LEASE_MS,
  claimIdempotency,
  completeIdempotency,
  IDEMPOTENCY_IN_PROGRESS_ERROR,
  idempotencyDecision,
  idempotencyKeyError,
  planApiComment,
  planApiLink,
  planApiLinkPatch,
  SOURCE_NO_STATUS,
  sourceAddedByLabel,
  sourceKindLabel,
  sourceLinkHref,
  sourceStateChip,
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

  it('keeps a fresh pending key at 409 and reclaims it after the lease', () => {
    const pending = { requestHash: 'a', state: 'pending' as const, createdAt: 1_000 };
    const fresh = idempotencyDecision({
      existing: pending,
      requestHash: 'a',
      now: 1_000 + API_IDEMPOTENCY_LEASE_MS - 1,
    });
    assert.equal(fresh.action, 'in_progress');
    assert.equal(IDEMPOTENCY_IN_PROGRESS_ERROR, 'A request with this idempotency key is already in progress');
    const stale = claimIdempotency(pending, 'a', 1_000 + API_IDEMPOTENCY_LEASE_MS);
    assert.equal(stale.action, 'reclaim');
    const other = idempotencyDecision({
      existing: pending,
      requestHash: 'b',
      now: 1_000 + API_IDEMPOTENCY_LEASE_MS,
    });
    assert.equal(other.action, 'mismatch');
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
    assert.equal(visibilityWriteError({ publishToWarehaus: true }, ['publishToWarehaus']), null);
    assert.match(
      visibilityWriteError({ clientVisible: true }, ['publishToWarehaus']) ?? '',
      /visibility/,
    );
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
    const agent = planApiLink({
      kind: 'agent',
      url: ' https://cursor.com/agents/bc-example ',
      title: 'Cursor agent',
    });
    assert.equal(agent.ok, true);
    if (!agent.ok) return;
    assert.equal(agent.kind, 'agent');
    assert.equal(agent.url, 'https://cursor.com/agents/bc-example');
    assert.equal(agent.property, null);
    assert.equal(agent.title, 'Cursor agent');
    assert.equal(planApiLink({ kind: 'agent', url: 'http://cursor.com/agents/bc-example' }).ok, false);
    assert.equal(planApiLink({ kind: 'agent', url: 'cursor/p4' }).ok, false);
  });

  it('reads one indexed filter at a time', () => {
    assert.equal(taskListPlan({ projectId: 'p', status: 'Done' }).ok, true);
    assert.equal(taskListPlan({ status: 'Done', stage: 'Building' }).ok, false);
    assert.equal(taskListPlan({}).ok, false);
    const byMilestone = taskListPlan({ projectId: 'p', milestoneId: 'm' });
    assert.equal(byMilestone.ok && byMilestone.index, 'by_milestone');
    assert.equal(taskListPlan({ milestoneId: 'm', stage: 'Idea' }).ok, false);
    assert.equal(taskListPlan({ milestoneId: 'm', updatedSince: 1 }).ok, false);
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
    assert.equal(
      sourceLinksChanged(
        [{ kind: 'agent', url: 'https://cursor.com/agents/bc-example', addedBy: 'cursor' }],
        [],
      ),
      false,
    );
  });

  it('labels source chips for the staff panel', () => {
    assert.equal(sourceKindLabel('chat request'), 'Chat request');
    assert.equal(sourceKindLabel('PR'), 'Cursor PR');
    assert.equal(sourceKindLabel('deploy'), 'Deploy');
    assert.equal(sourceKindLabel('agent'), 'Agent run');
    assert.equal(sourceKindLabel('Figma frame'), 'Figma frame');
    assert.equal(sourceKindLabel('Notion page or doc'), 'Doc');
    assert.equal(sourceKindLabel('Repo branch'), 'Branch');
    assert.deepEqual(sourceStateChip('merged'), { label: 'Merged', tone: 'good' });
    assert.deepEqual(sourceStateChip('deployed'), { label: 'Deployed', tone: 'good' });
    assert.deepEqual(sourceStateChip(' open '), { label: 'Open', tone: 'warn' });
    assert.deepEqual(sourceStateChip('failed'), { label: 'Failed', tone: 'bad' });
    assert.deepEqual(sourceStateChip('failure'), { label: 'Failed', tone: 'bad' });
    assert.deepEqual(sourceStateChip('error'), { label: 'Failed', tone: 'bad' });
    assert.deepEqual(sourceStateChip('succeeded'), { label: 'Deployed', tone: 'good' });
    assert.deepEqual(sourceStateChip('ready'), { label: 'Deployed', tone: 'good' });
    assert.deepEqual(sourceStateChip('success'), { label: 'Success', tone: 'good' });
    assert.deepEqual(sourceStateChip('in_progress'), { label: 'In progress', tone: 'warn' });
    assert.deepEqual(sourceStateChip('in progress'), { label: 'In progress', tone: 'warn' });
    assert.deepEqual(sourceStateChip('In Progress'), { label: 'In progress', tone: 'warn' });
    assert.deepEqual(sourceStateChip('weird_state'), { label: 'Weird State', tone: 'neutral' });
    assert.deepEqual(sourceStateChip('  '), { label: SOURCE_NO_STATUS, tone: 'neutral' });
    assert.deepEqual(sourceStateChip(null), { label: SOURCE_NO_STATUS, tone: 'neutral' });
    assert.equal(sourceStateChip('x'.repeat(41)), null);
    assert.equal(sourceAddedByLabel('cursor'), 'Added by Cursor');
    assert.equal(sourceAddedByLabel('github'), 'Added by GitHub');
    assert.equal(sourceAddedByLabel('github-webhook'), 'Added by GitHub');
    assert.equal(sourceAddedByLabel('vercel'), 'Added by Vercel');
    assert.equal(sourceAddedByLabel('vercel-webhook'), 'Added by Vercel');
    assert.equal(sourceAddedByLabel('staff'), 'Added by Staff');
    assert.equal(sourceAddedByLabel('notion'), 'Added by Notion');
    assert.equal(sourceAddedByLabel('claude_bot'), 'Added by Claude');
    assert.equal(sourceAddedByLabel('claude'), 'Added by Claude');
    assert.equal(sourceAddedByLabel('linear_bot'), 'Added by Linear');
    assert.equal(sourceAddedByLabel('figma-source'), 'Added by Figma');
    assert.equal(sourceAddedByLabel('github_source'), 'Added by GitHub');
    assert.equal(sourceAddedByLabel('bridge'), 'Added by Bridge');
    assert.notEqual(sourceAddedByLabel('claude_bot'), 'Claude Bot');
    assert.notEqual(sourceAddedByLabel('claude_bot'), 'Added by Claude Bot');
    assert.equal(sourceAddedByLabel('k57f3m9q2n4p5r6s7t8v9w0x1y2z3a'), 'Added by Staff');
    assert.equal(sourceAddedByLabel('a1b2c3d4e5f67890abcd1234ef567890'), 'Added by Staff');
    assert.equal(sourceAddedByLabel('550e8400-e29b-41d4-a716-446655440000'), 'Added by Staff');
    assert.equal(sourceAddedByLabel('bc-182f5a11-7d73-5b60'), 'Added by Staff');
    assert.equal(sourceAddedByLabel('  '), 'Unknown');
    assert.equal(sourceLinkHref('https://cursor.com/agents/bc-example'), 'https://cursor.com/agents/bc-example');
    assert.equal(sourceLinkHref('cursor/p4-sources'), null);
    assert.equal(sourceLinkHref('javascript:alert(1)'), null);
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
