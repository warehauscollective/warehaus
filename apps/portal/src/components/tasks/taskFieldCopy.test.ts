import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ARCHIVE_BODY, ARCHIVE_TASK_TITLE, MENU_ARCHIVE } from '@/components/closeout/closeoutCopy';
import { projectMoveCopy, taskChangeNote } from './taskFieldCopy';

describe('task field copy', () => {
  it('uses the revised archive confirm: hidden, not deleted, restore from Archived', () => {
    assert.equal(ARCHIVE_TASK_TITLE, 'Archive this task?');
    assert.equal(ARCHIVE_BODY, 'It will be hidden from the board and lists, not deleted. You can restore it from Archived.');
    // The button is Archive, not Archive task.
    assert.equal(MENU_ARCHIVE, 'Archive');
  });

  it('names the project move without a visibility change', () => {
    assert.equal(
      projectMoveCopy('Order-ahead landing page', 'Warehaus Portal', 'VISIT App'),
      '“Order-ahead landing page” moves from Warehaus Portal to VISIT App. Visibility doesn’t change.',
    );
  });

  it('says where a saved field went', () => {
    assert.equal(taskChangeNote({ ok: true, wrote: true, notion: 'portal' }), null);
    assert.equal(taskChangeNote({ ok: true, wrote: true, notion: 'queued' }), 'Saved · Queued for Notion.');
    assert.match(taskChangeNote({ ok: true, wrote: true, notion: 'off' }) ?? '', /Saved in the Portal only/);
    assert.equal(taskChangeNote({ ok: true, wrote: false, notion: 'queued' }), null);
    assert.equal(taskChangeNote({ ok: false, error: 'This task changed in Notion. Check it and try again.' }), 'This task changed in Notion. Check it and try again.');
  });
});
