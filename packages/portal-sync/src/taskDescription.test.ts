import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mapNotionTask } from './mappers';
import {
  clientMaySeeTaskDescription,
  plainTextFromNotionBlocks,
  planTaskDescriptionWrite,
  resolveTaskDescription,
  shouldRefetchTaskBody,
  taskDescriptionEditMode,
  taskDescriptionTier,
} from './taskDescription';

describe('task description', () => {
  it('keeps the portal field at SERVER', () => {
    assert.equal(taskDescriptionTier(), 'SERVER');
    assert.equal(clientMaySeeTaskDescription({ publishToWarehaus: true }), false);
    assert.equal(clientMaySeeTaskDescription({ publishToWarehaus: false }), false);
    assert.equal(
      clientMaySeeTaskDescription({ publishToWarehaus: true, tier: 'CLIENT' }),
      true,
    );
    assert.equal(
      clientMaySeeTaskDescription({ publishToWarehaus: false, tier: 'CLIENT' }),
      false,
    );
    assert.equal(
      clientMaySeeTaskDescription({ publishToWarehaus: true, tier: 'NEVER' }),
      false,
    );
  });

  it('prefers the page body and falls back to the Description property', () => {
    assert.deepEqual(
      resolveTaskDescription({
        pageBody: 'From the page',
        descriptionProperty: 'From the property',
      }),
      { text: 'From the page', source: 'body' },
    );
    assert.deepEqual(
      resolveTaskDescription({ pageBody: '  ', descriptionProperty: 'From the property' }),
      { text: 'From the property', source: 'property' },
    );
    assert.equal(resolveTaskDescription({ pageBody: '', descriptionProperty: '' }), undefined);
    assert.deepEqual(
      resolveTaskDescription({
        pageBody: 'See https://www.notion.so/secret-page for notes',
      }),
      { text: 'See for notes', source: 'body' },
    );
  });

  it('keeps a page-body description read-only so a property edit is not the stored copy', () => {
    const fromBody = resolveTaskDescription({
      pageBody: 'From the page',
      descriptionProperty: 'Edited in the portal',
    });
    assert.equal(fromBody?.source, 'body');
    assert.equal(fromBody?.text, 'From the page');
    assert.equal(taskDescriptionEditMode(fromBody?.source), 'notion');
    assert.equal(
      taskDescriptionEditMode(
        resolveTaskDescription({ pageBody: '', descriptionProperty: 'From the property' })?.source,
      ),
      'portal',
    );
    assert.equal(taskDescriptionEditMode(undefined), 'portal');
    assert.equal(taskDescriptionEditMode(null), 'portal');
    assert.equal(taskDescriptionEditMode('none'), 'portal');
  });

  it('refetches task blocks only when last_edited_time changed or the source is unknown', () => {
    assert.equal(
      shouldRefetchTaskBody({
        storedLastEditedTime: '2026-10-01T00:00:00.000Z',
        storedDescriptionSource: 'body',
        pageLastEditedTime: '2026-10-01T00:00:00.000Z',
      }),
      false,
    );
    assert.equal(
      shouldRefetchTaskBody({
        storedLastEditedTime: '2026-10-01T00:00:00.000Z',
        storedDescriptionSource: 'property',
        pageLastEditedTime: '2026-10-02T00:00:00.000Z',
      }),
      true,
    );
    assert.equal(
      shouldRefetchTaskBody({
        storedLastEditedTime: '2026-10-01T00:00:00.000Z',
        storedDescriptionSource: null,
        pageLastEditedTime: '2026-10-01T00:00:00.000Z',
      }),
      true,
    );
  });

  it('reads paragraph text from Notion blocks', () => {
    const text = plainTextFromNotionBlocks([
      { type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Hello' }] } },
      { type: 'child_page', child_page: { title: 'Skip' } },
      { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ plain_text: 'Next' }] } },
    ]);
    assert.equal(text, 'Hello\nNext');
  });

  it('maps body text onto the task and ignores an empty body', () => {
    const properties = {
      Name: { type: 'title', title: [{ plain_text: 'Homepage' }] },
      Projects: { type: 'relation', relation: [{ id: 'prj' }] },
      'Publish to Warehaus': { type: 'checkbox', checkbox: true },
      Status: { type: 'status', status: { name: 'To Do' } },
      Description: { type: 'rich_text', rich_text: [{ plain_text: 'Property copy' }] },
    };
    const fromBody = mapNotionTask('page-1', properties, true, 'Body copy');
    assert.equal(fromBody.row && 'description' in fromBody.row && fromBody.row.description, 'Body copy');
    assert.equal(
      fromBody.row && 'descriptionSource' in fromBody.row && fromBody.row.descriptionSource,
      'body',
    );
    const fromProperty = mapNotionTask('page-1', properties, true, '');
    assert.equal(
      fromProperty.row && 'description' in fromProperty.row && fromProperty.row.description,
      'Property copy',
    );
    assert.equal(
      fromProperty.row && 'descriptionSource' in fromProperty.row && fromProperty.row.descriptionSource,
      'property',
    );
  });

  it('plans a staff description patch and refuses a client', () => {
    const planned = planTaskDescriptionWrite({
      actor: 'staff',
      description: 'Staff note',
      notionPageId: 'page-1',
      expectedLastEditedTime: '2026-10-01T00:00:00.000Z',
    });
    assert.equal(planned.ok, true);
    if (planned.ok) {
      assert.deepEqual(planned.properties, { Description: 'Staff note' });
      assert.match(planned.idempotencyKey, /^task-description:page-1:Staff note:/);
    }
    assert.equal(
      planTaskDescriptionWrite({
        actor: 'client',
        description: 'nope',
        notionPageId: 'page-1',
        expectedLastEditedTime: '2026-10-01T00:00:00.000Z',
      }).ok,
      false,
    );
    assert.equal(
      planTaskDescriptionWrite({
        actor: 'staff',
        description: 'https://notion.so/private',
        notionPageId: 'page-1',
        expectedLastEditedTime: '2026-10-01T00:00:00.000Z',
      }).ok,
      false,
    );
  });
});
