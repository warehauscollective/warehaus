import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { listStaffNotices, markNoticeRead } from '../invitesSync';
import { memoryCtx } from './memoryCtx.testkit';
import { seedContact, seedOrg } from './seedRows.testkit';

type Listed = Array<{ unread: boolean; readAt: number | null }>;

describe('per-staff notice reads', () => {
  it('keeps staff B unread after staff A marks the notice read', async () => {
    const t = memoryCtx();
    const orgId = seedOrg(t, { companyName: 'Northwind', slug: 'northwind' });
    for (const [key, name] of [
      ['a', 'Ada Staff'],
      ['b', 'Bea Staff'],
    ]) {
      seedContact(t, orgId, {
        name,
        email: `${name.split(' ')[0]?.toLowerCase()}.staff@warehaus.test`,
        authUserId: `auth-${key}`,
        role: 'Warehaus Staff',
        notionPageId: `staff-${key}`,
      });
    }
    const noticeId = t.seed('notices', {
      orgId,
      audience: 'staff',
      message: 'Homepage: Stage "Mystery" is not a portal stage',
      edgeCase: 'unknown-stage:page-1',
      createdAt: 20,
    });
    const staffA = { as: { authUserId: 'auth-a' } };
    const staffB = { as: { authUserId: 'auth-b' } };

    const beforeA = await t.call<Listed>(listStaffNotices, {}, staffA);
    const beforeB = await t.call<Listed>(listStaffNotices, {}, staffB);
    assert.equal(beforeA[0]?.unread, true);
    assert.equal(beforeB[0]?.unread, true);

    const marked = await t.call(markNoticeRead, { noticeId }, staffA);
    assert.deepEqual(marked, { ok: true });

    const afterA = await t.call<Listed>(listStaffNotices, {}, staffA);
    const afterB = await t.call<Listed>(listStaffNotices, {}, staffB);
    assert.equal(afterA[0]?.unread, false);
    assert.ok(afterA[0]?.readAt);
    assert.equal(afterB[0]?.unread, true);
    assert.equal(afterB[0]?.readAt, null);
    assert.equal(t.row(noticeId)?.readAt, undefined);
    assert.equal(t.rows('noticeReads').length, 1);
  });
});
