import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CLIENT_AWAITING_LABEL } from './dashboard';
import {
  CLIENT_TEAM_STAGE_LABEL,
  brandLine,
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
    assert.equal(clientUpdatedLabel({ lastEditedTime: '2026-10-05', date: '2026-10-20' }), 'Updated Oct 5');
    assert.equal(clientUpdatedLabel({ date: '2026-10-20' }), 'Updated Oct 20');
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
