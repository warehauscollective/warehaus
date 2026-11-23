import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ARCHIVE_BODY, ARCHIVE_TASK_TITLE, MENU_ARCHIVE } from '@/components/closeout/closeoutCopy';
import { fieldSaveNote, projectMoveCopy } from './taskFieldCopy';

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
    assert.equal(fieldSaveNote('portal', true), null);
    assert.equal(fieldSaveNote('queued', true), 'Queued for Notion.');
    assert.match(fieldSaveNote('off', true) ?? '', /Saved in the Portal only/);
    assert.equal(fieldSaveNote('queued', false), null);
  });
});
