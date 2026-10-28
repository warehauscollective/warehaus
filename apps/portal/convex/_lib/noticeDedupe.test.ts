import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isDuplicateNotice, type NoticeIdentity } from './noticeDedupe';

const org = 'org-north';

function row(partial: Partial<NoticeIdentity> & { readAt?: number | null }): NoticeIdentity & { readAt?: number | null } {
  return {
    audience: 'staff',
    orgId: org,
    message: partial.message ?? '',
    edgeCase: partial.edgeCase,
    contactNotionPageId: partial.contactNotionPageId,
    readAt: partial.readAt,
  };
}

describe('notice de-duplication', () => {
  it('treats the same staff sync, conflict, stage, and invite notice as one row', () => {
    const existing = [
      row({ message: 'Notion write key-1 needs staff attention', edgeCase: 'sync', readAt: 50 }),
      row({ message: 'Notion write key-2 conflicted with a newer edit', edgeCase: 'conflict' }),
      row({ message: 'Homepage: Stage "Brainstorm" is not a portal stage', edgeCase: 'unknown-stage:page-1' }),
      row({
        message: 'Invite status changed in Notion',
        edgeCase: '5',
        contactNotionPageId: 'contact-1',
        readAt: 9,
      }),
    ];

    for (const notice of existing) {
      assert.equal(isDuplicateNotice(existing, notice), true);
    }
  });

  it('keeps a different edge, page, contact, or message', () => {
    const existing = [
      row({ message: 'Notion write key-1 needs staff attention', edgeCase: 'sync' }),
      row({ message: 'Homepage: Stage "Brainstorm" is not a portal stage', edgeCase: 'unknown-stage:page-1' }),
      row({ message: 'Invite status changed in Notion', edgeCase: '5', contactNotionPageId: 'contact-1' }),
    ];
    assert.equal(
      isDuplicateNotice(existing, row({ message: 'Notion write key-1 conflicted with a newer edit', edgeCase: 'conflict' })),
      false,
    );
    assert.equal(
      isDuplicateNotice(existing, row({
        message: 'Menu: Stage "Brainstorm" is not a portal stage',
        edgeCase: 'unknown-stage:page-2',
      })),
      false,
    );
    assert.equal(
      isDuplicateNotice(existing, row({
        message: 'Invite status changed in Notion',
        edgeCase: '5',
        contactNotionPageId: 'contact-2',
      })),
      false,
    );
    assert.equal(
      isDuplicateNotice(existing, row({ message: 'Invite rate limit reached', edgeCase: 'invite-state' })),
      false,
    );
  });
});
