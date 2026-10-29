import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CLIENT_AWAITING_LABEL } from './dashboard';
import {
  CLIENT_TEAM_STAGE_LABEL,
  brandLine,
  clientBrandMeta,
  inSyncLine,
  projectItemCount,
  sortTasksNewestFirst,
  syncLine,
  clientDueLabel,
  clientUpdatedLabel,
  clientPersonStatus,
  clientTeamCrumbs,
  clientTeamInviteCopy,
  clientVisiblePerson,
  formatClientSince,
  isStudioEmail,
  isStudioProjectName,
  staffHeaderLine,
  warehausLead,
  withoutClientLeaks,
} from './clientDetail';

describe('client detail', () => {
  it('formats client since from the earliest project start', () => {
    assert.equal(formatClientSince([null, '2026-09-01', '2026-03-04']), 'March 2026');
    assert.equal(formatClientSince([]), null);
    assert.equal(formatClientSince(['not-a-date']), null);
  });

  it('joins the lead and the since line, and drops a missing half', () => {
    assert.equal(staffHeaderLine('March 2026', 'Maya Chen'), 'Client since March 2026 · Warehaus lead: Maya Chen');
    assert.equal(staffHeaderLine(null, 'Maya Chen'), 'Warehaus lead: Maya Chen');
    assert.equal(staffHeaderLine('March 2026', null), 'Client since March 2026');
    assert.equal(staffHeaderLine(null, null), null);
  });

  it('uses the company as the only brand', () => {
    assert.equal(brandLine('Northwind Foods'), 'Brand: Northwind Foods');
    assert.equal(clientBrandMeta('Northwind Foods'), null);
    assert.equal(clientBrandMeta('Northwind Foods', 'northwind foods'), null);
    assert.equal(clientBrandMeta('Northwind Foods', 'Northwind Kitchen'), 'Brand: Northwind Kitchen');
    const synced = Date.parse('2026-10-05T15:00:00Z');
    const day = 24 * 60 * 60 * 1000;
    assert.equal(inSyncLine(synced, synced + 2 * 60000), 'In sync · 2 min ago');
    assert.equal(inSyncLine(null), 'In sync');
    assert.equal(syncLine(synced, synced + 2 * 60000).stale, false);
    assert.equal(inSyncLine(synced, synced + day), 'In sync · 24h ago');
    assert.equal(syncLine(synced, synced + day).stale, false);
    assert.equal(inSyncLine(synced, synced + day + 60_000), 'Last synced 1d ago');
    assert.equal(inSyncLine(synced, synced + 24 * day), 'Last synced 24d ago');
    assert.equal(syncLine(synced, synced + 24 * day).stale, true);
    assert.equal(inSyncLine(synced, synced + 24 * day).startsWith('In sync'), false);
    assert.deepEqual(
      sortTasksNewestFirst([
        { id: 'old', date: '2026-10-01' },
        { id: 'mid', date: '2026-10-20', lastEditedTime: '2026-10-18' },
        { id: 'new', date: '2026-10-20', lastEditedTime: '2026-10-28T15:00:00Z' },
        { id: 'tie', date: '2026-10-20', lastEditedTime: '2026-10-28T15:00:00Z' },
      ]).map((task) => task.id),
      ['new', 'tie', 'mid', 'old'],
    );
    assert.equal(projectItemCount({ id: 'p-site', name: 'Site', taskCount: 8 }, []), 8);
    assert.equal(
      projectItemCount(
        { id: 'p-site', name: 'Site', taskCount: 8 },
        [{ projectId: 'p-site' }, { projectId: 'other', projectName: 'Site' }, { projectName: 'Site' }],
      ),
      2,
    );
    assert.equal(warehausLead([
      { name: 'Ada North', role: 'Client Admin' },
      { name: 'Maya Chen', role: 'Warehaus Staff' },
    ]), 'Maya Chen');
    assert.equal(warehausLead([{ name: 'Ada North', role: 'Client Member' }]), null);
  });

  it('keeps warehaus.studio rows and sync fields off a client payload', () => {
    assert.equal(isStudioProjectName(' warehaus.studio '), true);
    assert.equal(isStudioEmail('Sam@warehaus.studio'), true);
    assert.equal(clientVisiblePerson({ role: 'Warehaus Staff', email: 'maya@warehaus.co' }), false);
    assert.equal(clientVisiblePerson({ role: 'Client Member', email: 'sam@warehaus.studio' }), false);
    assert.equal(clientVisiblePerson({ role: 'Client Admin', email: 'ada@northwind.example' }), true);
    const safe = withoutClientLeaks({
      id: 'p1',
      name: 'Northwind site',
      notionPageId: 'secret',
      publishToWarehaus: true,
      lastSyncedAt: 1,
      syncHidden: false,
      internal: false,
    });
    assert.equal('notionPageId' in safe, false);
    assert.equal('publishToWarehaus' in safe, false);
    assert.equal('lastSyncedAt' in safe, false);
    assert.equal('syncHidden' in safe, false);
    assert.equal('internal' in safe, false);
    assert.equal(safe.name, 'Northwind site');
  });

  it('builds the client team trail and invite notice without sending mail', () => {
    assert.deepEqual(clientTeamCrumbs(false), {
      parent: 'Account',
      middle: 'Company',
      current: 'Your team',
      back: 'account',
    });
    assert.deepEqual(clientTeamCrumbs(true), {
      parent: 'Company',
      middle: null,
      current: 'Your team',
      back: 'company',
    });
    assert.equal(clientPersonStatus({ invitePending: true, portalAccess: 'Disabled' }), 'Invite pending');
    assert.equal(clientPersonStatus({ portalAccess: 'Enabled' }), 'Active');
    assert.equal(clientPersonStatus({ portalAccess: 'Disabled' }), 'No portal access');
    assert.equal(clientDueLabel('2026-10-20'), 'Due Oct 20');
    assert.equal(clientUpdatedLabel({ lastEditedTime: '2026-10-05' }), 'Updated Oct 5');
    assert.equal(clientUpdatedLabel({ date: '2026-10-20' }), null);
    assert.equal(clientUpdatedLabel({}), null);
    assert.equal(clientDueLabel(null), null);
    assert.equal(CLIENT_TEAM_STAGE_LABEL, CLIENT_AWAITING_LABEL);
    const notice = clientTeamInviteCopy('Northwind', [
      { name: 'Maya Chen', role: 'Warehaus Staff' },
      { name: 'Ada North', role: 'Client Admin' },
    ]);
    assert.equal(notice.title, 'Client Admins can invite teammates');
    assert.match(notice.body, /^Ada can invite new Client Members/);
    assert.match(notice.body, /only see Northwind\.$/);
    assert.equal(notice.body.includes('@'), false);
  });
});
