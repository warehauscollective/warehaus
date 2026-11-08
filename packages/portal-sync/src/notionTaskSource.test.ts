import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { MappedTask } from './mappers';
import {
  NOTION_WEBHOOK_PATH,
  mapNotionTaskStatus,
  neutralTaskFromNotion,
  notionTaskSourceCapabilities,
  notionWebhookEventId,
  parseNotionWebhook,
} from './notionTaskSource';

function mapped(over: Partial<MappedTask> = {}): MappedTask {
  return {
    database: 'tasks',
    notionPageId: 'page-1',
    projectNotionIds: ['proj-1'],
    name: 'Fix header',
    status: 'In Progress',
    isDone: false,
    resourceNotionIds: [],
    publishToWarehaus: true,
    ...over,
  };
}

describe('notionTaskSourceCapabilities', () => {
  it('can write only when the flag is exactly "true"', () => {
    assert.equal(notionTaskSourceCapabilities('true').canWrite, true);
    assert.equal(notionTaskSourceCapabilities(undefined).canWrite, false);
    assert.equal(notionTaskSourceCapabilities('TRUE').canWrite, false);
    assert.equal(notionTaskSourceCapabilities('1').canWrite, false);
  });

  it('supports webhooks and stage, not dependencies', () => {
    const caps = notionTaskSourceCapabilities(undefined);
    assert.equal(caps.supportsWebhooks, true);
    assert.equal(caps.supportsStage, true);
    assert.equal(caps.supportsDependencies, false);
  });

  it('keeps the webhook path', () => {
    assert.equal(NOTION_WEBHOOK_PATH, '/notion/webhook');
  });
});

describe('mapNotionTaskStatus', () => {
  it('passes live statuses through', () => {
    for (const s of ['Inbox', 'To Do', 'Blocked', 'In Progress', 'Done']) {
      assert.deepEqual(mapNotionTaskStatus(s), { status: s, hiddenFromClients: false });
    }
  });

  it('reads an unknown value as Inbox', () => {
    assert.equal(mapNotionTaskStatus('Someday').status, 'Inbox');
    assert.equal(mapNotionTaskStatus(null).status, 'Inbox');
  });
});

describe('neutralTaskFromNotion', () => {
  it('maps the fields a Notion task has', () => {
    const task = neutralTaskFromNotion({
      row: mapped({ stage: 'Building', date: '2026-11-10', description: 'Body' }),
      lastEdited: '2026-11-05T10:00:00.000Z',
      hiddenFromClients: false,
    });
    assert.deepEqual(task, {
      source: 'notion',
      externalId: 'page-1',
      title: 'Fix header',
      status: 'In Progress',
      hiddenFromClients: false,
      stage: 'Building',
      dependencyExternalIds: [],
      notionContextPageId: 'page-1',
      sourceUpdatedAt: '2026-11-05T10:00:00.000Z',
      description: 'Body',
      dueDate: '2026-11-10',
    });
  });

  it('drops an unknown stage and keeps hidden', () => {
    const task = neutralTaskFromNotion({
      row: mapped({ stage: 'Nope' }),
      lastEdited: '',
      hiddenFromClients: true,
    });
    assert.equal(task.stage, null);
    assert.equal(task.hiddenFromClients, true);
    assert.equal('description' in task, false);
  });
});

describe('notionWebhookEventId', () => {
  it('prefers id, then event_id', () => {
    assert.equal(notionWebhookEventId({ id: 'a', event_id: 'b' }), 'a');
    assert.equal(notionWebhookEventId({ event_id: 'b' }), 'b');
    assert.equal(notionWebhookEventId({ id: '', event_id: 'b' }), 'b');
  });

  it('returns null with neither', () => {
    assert.equal(notionWebhookEventId({}), null);
    assert.equal(notionWebhookEventId({ id: 7 }), null);
  });
});

describe('parseNotionWebhook', () => {
  it('reads delivery id, page id and action', () => {
    assert.deepEqual(
      parseNotionWebhook(
        JSON.stringify({ id: 'evt', type: 'page.created', entity: { id: 'p', type: 'page' } }),
      ),
      { deliveryId: 'evt', externalIds: ['p'], action: 'create' },
    );
    assert.equal(parseNotionWebhook(JSON.stringify({ type: 'page.deleted' })).action, 'remove');
    assert.equal(
      parseNotionWebhook(JSON.stringify({ type: 'page.properties_updated' })).action,
      'update',
    );
  });

  it('ignores non-page entities and bad JSON', () => {
    assert.deepEqual(
      parseNotionWebhook(JSON.stringify({ id: 'e', entity: { id: 'db', type: 'database' } }))
        .externalIds,
      [],
    );
    assert.deepEqual(parseNotionWebhook('not json'), {
      deliveryId: '',
      externalIds: [],
      action: 'update',
    });
  });
});
