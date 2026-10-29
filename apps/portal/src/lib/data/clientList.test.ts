import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clientDirectoryErrorMode,
  clientDirectoryShowsFilters,
  clientDirectoryShowsKpis,
  clientInitials,
  clientListStats,
  clientMatchesFilter,
  singleOrAcross,
} from './clientList';

const rows = [
  { id: '1', name: 'Northwind Foods', status: 'Active', internal: false, syncHidden: false, projectCount: 2, openTaskCount: 12, contactCount: 4, awaitingGoCount: 3 },
  { id: '2', name: 'Lumen Dental', status: 'Active', internal: false, syncHidden: true, projectCount: 1, openTaskCount: 5, contactCount: 2, awaitingGoCount: 1 },
  { id: '3', name: 'Warehaus', status: 'Active', internal: true, syncHidden: false, projectCount: 1, openTaskCount: 8, contactCount: 3, awaitingGoCount: 0 },
];

describe('client list filters', () => {
  it('splits all, active, internal, and sync problem', () => {
    assert.equal(rows.filter((row) => clientMatchesFilter(row, 'all')).length, 3);
    assert.deepEqual(
      rows.filter((row) => clientMatchesFilter(row, 'active')).map((row) => row.name),
      ['Northwind Foods', 'Warehaus'],
    );
    assert.deepEqual(
      rows.filter((row) => clientMatchesFilter(row, 'internal')).map((row) => row.name),
      ['Warehaus'],
    );
    assert.deepEqual(
      rows.filter((row) => clientMatchesFilter(row, 'sync')).map((row) => row.name),
      ['Lumen Dental'],
    );
  });

  it('summarises awaiting go and sync problems by client name', () => {
    const stats = clientListStats(rows);
    assert.equal(stats.awaiting, 4);
    assert.equal(singleOrAcross(stats.awaitingNames, 'None waiting'), 'Across 2 clients');
    assert.equal(singleOrAcross(stats.syncNames, 'None'), 'Lumen Dental');
    assert.equal(stats.active, 2);
    assert.equal(stats.internal, 1);
    assert.equal(clientInitials('Northwind Foods'), 'NF');
    assert.equal(clientInitials('Warehaus'), 'WA');
  });

  it('derives empty, loading, and cached-error from the client array', () => {
    assert.equal(clientDirectoryShowsKpis(0, false), false);
    assert.equal(clientDirectoryShowsKpis(0, true), true);
    assert.equal(clientDirectoryShowsKpis(2, false), true);
    assert.equal(clientDirectoryShowsFilters(0, false), false);
    assert.equal(clientDirectoryShowsFilters(2, true), false);
    assert.equal(clientDirectoryShowsFilters(2, false), true);
    assert.equal(clientDirectoryErrorMode(null, 0), 'none');
    assert.equal(clientDirectoryErrorMode('Network error', 0), 'empty');
    assert.equal(clientDirectoryErrorMode('Network error', 3), 'refresh');
  });
});
