import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PortalSnapshot } from '@/lib/data/view-models';
import {
  EMPTY_PORTAL_CACHE,
  heldSnapshotFor,
  portalSnapshotKey,
  projectsForViewer,
  reducePortalCache,
  viewerIsStaff,
  type PortalCacheState,
} from './portalSnapshotCache';

function snapshot(name: string): PortalSnapshot {
  return {
    clients: [],
    projects: [
      {
        id: name,
        name,
        description: null,
        status: 'Active',
        progress: null,
        startDate: null,
        endDate: null,
        liveUrl: null,
        figmaLink: null,
        docsUrl: null,
        stack: [],
      },
    ],
    tasks: [],
    activity: [],
    syncMeta: { lastSyncedAt: null, lastError: null, mode: 'convex' },
    tenant: { mode: 'team', slug: null, clientExternalId: null, clientName: null, ok: true },
  };
}

const staffA = { contactId: 'contact-staff-a', orgId: 'org-warehaus', isStaff: true };
const clientA = { contactId: 'contact-client-a', orgId: 'org-acme', isStaff: false };
const clientB = { contactId: 'contact-client-b', orgId: 'org-northwind', isStaff: false };
const staffRows = [{ id: 'secret-staff-project', name: 'Internal' }];
const snapshotA = snapshot('Staff A project');
const snapshotClientA = snapshot('Client A project');
const snapshotB = snapshot('Client B project');

function remember(state: PortalCacheState, session: { contactId: string; orgId: string }, host: string, data: PortalSnapshot) {
  const key = portalSnapshotKey(session, host);
  if (!key) throw new Error('missing key');
  return reducePortalCache(state, { type: 'remember', key, data });
}

describe('portal snapshot identity', () => {
  it('keeps staff A off client B, including when B fails to load', () => {
    let state = remember(EMPTY_PORTAL_CACHE, staffA, 'warehaus', snapshotA);
    const keyA = portalSnapshotKey(staffA, 'warehaus');
    assert.equal(heldSnapshotFor(state.held, keyA, false)?.projects[0]?.name, 'Staff A project');

    state = reducePortalCache(state, { type: 'signOut' });
    assert.equal(state.held, null);
    assert.equal(state.sealed, true);
    state = remember(state, clientB, 'northwind', snapshotB);
    assert.equal(state.held, null);

    assert.equal(heldSnapshotFor(state.held, null, true), null);
    assert.equal(viewerIsStaff(null, true), false);
    assert.deepEqual(
      projectsForViewer({ isStaff: viewerIsStaff(null, true), staffProjects: staffRows, clientProjects: [] }),
      [],
    );

    state = reducePortalCache(state, { type: 'unseal' });
    const keyB = portalSnapshotKey(clientB, 'northwind');
    assert.equal(viewerIsStaff(clientB, false), false);
    assert.equal(heldSnapshotFor({ key: keyA!, data: snapshotA }, keyB, false), null);
    assert.deepEqual(
      projectsForViewer({ isStaff: false, staffProjects: staffRows, clientProjects: [] }),
      [],
    );
    assert.equal(heldSnapshotFor(null, keyB, false), null);
  });

  it('keeps client A off client B in another org when B errors', () => {
    const keyA = portalSnapshotKey(clientA, 'acme');
    const keyB = portalSnapshotKey(clientB, 'northwind');
    const held = { key: keyA!, data: snapshotClientA };
    assert.equal(heldSnapshotFor(held, keyB, false), null);
    assert.notEqual(keyA!.orgId, keyB!.orgId);
    assert.equal(viewerIsStaff(clientB, false), false);
    assert.deepEqual(
      projectsForViewer({
        isStaff: false,
        staffProjects: staffRows,
        clientProjects: [],
      }),
      [],
    );
    assert.equal(heldSnapshotFor(held, keyB, true), null);
  });

  it('does not serve a snapshot while auth is settling for an unknown identity', () => {
    const keyA = portalSnapshotKey(staffA, 'warehaus');
    const held = { key: keyA!, data: snapshotA };
    assert.equal(heldSnapshotFor(held, null, true), null);
    assert.equal(viewerIsStaff({ isStaff: true }, true), false);
    assert.equal(viewerIsStaff(staffA, false), true);
  });

  it('clears on sign-out and still serves the same identity after a failed refetch', () => {
    let state = remember(EMPTY_PORTAL_CACHE, clientA, 'acme', snapshotClientA);
    state = reducePortalCache(state, { type: 'signOut' });
    assert.equal(state.held, null);
    state = remember(state, clientA, 'acme', snapshotClientA);
    assert.equal(state.held, null);
    state = reducePortalCache(state, { type: 'unseal' });
    state = remember(state, clientA, 'acme', snapshotClientA);
    const key = portalSnapshotKey(clientA, 'acme');
    assert.equal(heldSnapshotFor(state.held, key, false)?.projects[0]?.name, 'Client A project');
    assert.equal(heldSnapshotFor(state.held, portalSnapshotKey(clientA, 'other-host'), false), null);
    assert.deepEqual(
      projectsForViewer({ isStaff: true, staffProjects: undefined, clientProjects: snapshotClientA.projects }),
      [],
    );
  });
});
