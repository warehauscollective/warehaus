import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  brandLine,
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
});
