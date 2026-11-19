import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { archiveConfirmCopy, fieldSaveNote, projectMoveCopy } from './taskFieldCopy';

describe('task field copy', () => {
  it('names the task and its sub-tasks, and Notion only when write-back is on', () => {
    assert.match(archiveConfirmCopy('Order-ahead landing page', 0), /“Order-ahead landing page” leaves the board/);
    assert.match(archiveConfirmCopy('Order-ahead landing page', 1), /and its 1 sub-task leave/);
    assert.match(archiveConfirmCopy('Order-ahead landing page', 4), /and its 4 sub-tasks leave/);
    assert.equal(archiveConfirmCopy('Order-ahead landing page', 4).includes('Notion'), false);
    assert.match(archiveConfirmCopy('Order-ahead landing page', 4, true), /archives the task’s page in Notion/);
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
