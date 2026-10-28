import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mapNotionTask } from './mappers';
import {
  clientMaySeeTaskDescription,
  plainTextFromNotionBlocks,
  planTaskDescriptionWrite,
  resolveTaskDescription,
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
    assert.equal(
      resolveTaskDescription({
        pageBody: 'From the page',
        descriptionProperty: 'From the property',
      }),
      'From the page',
    );
    assert.equal(
      resolveTaskDescription({ pageBody: '  ', descriptionProperty: 'From the property' }),
      'From the property',
    );
    assert.equal(resolveTaskDescription({ pageBody: '', descriptionProperty: '' }), undefined);
    assert.equal(
      resolveTaskDescription({
        pageBody: 'See https://www.notion.so/secret-page for notes',
      }),
      'See for notes',
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
    const fromProperty = mapNotionTask('page-1', properties, true, '');
    assert.equal(
      fromProperty.row && 'description' in fromProperty.row && fromProperty.row.description,
      'Property copy',
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
