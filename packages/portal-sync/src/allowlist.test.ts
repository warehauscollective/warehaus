import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ACTIVITY_CLIENT_TYPES,
  ACTIVITY_INTERNAL_TYPES,
  OUT_OF_BOUNDS_COLLECTIONS,
  PORTAL_COLLECTIONS,
  PORTAL_COLLECTION_IDS,
  SYNC_IN_COLLECTION_KEYS,
  assertNoForbiddenFileHosts,
  blobPathname,
  classifyDocBlock,
  classifyProperty,
  classifyRelationTarget,
  clientDocRowPassesGate,
  clientRowPassesGate,
  findUnmappedProperties,
  isClientVisibleActivityType,
  isInBoundsCollection,
  isOutOfBoundsCollection,
  partitionProperties,
  projectRowPassesGate,
  serializeForClient,
  sharedResourceRowPassesGate,
  taskRowPassesGate,
  toClientUploadClientView,
  toSharedResourceClientView,
} from './index';
import {
  LIVE_PROJECT_PROPERTY_NAMES,
  SUGAR_SHARK_PROJECT_WITH_BRAIN_EDGE,
} from './fixtures/sugar-shark';

describe('portal collections boundary', () => {
  it('exposes exactly seven portal collection IDs', () => {
    assert.equal(PORTAL_COLLECTION_IDS.length, 7);
    assert.equal(Object.keys(PORTAL_COLLECTIONS).length, 7);
  });

  it('sync-in excludes Activity (write-out only)', () => {
    assert.ok(!SYNC_IN_COLLECTION_KEYS.includes('activity' as never));
    assert.equal(SYNC_IN_COLLECTION_KEYS.length, 6);
    assert.ok(isInBoundsCollection(PORTAL_COLLECTIONS.activity));
  });

  it('refuses Project Ops and Second Brain collection IDs', () => {
    assert.equal(classifyRelationTarget(OUT_OF_BOUNDS_COLLECTIONS.projectOps), 'refuse');
    assert.equal(classifyRelationTarget(OUT_OF_BOUNDS_COLLECTIONS.granolaNotes), 'refuse');
    assert.ok(isOutOfBoundsCollection(OUT_OF_BOUNDS_COLLECTIONS.brainNotes));
  });

  it('allows only in-bounds relation targets', () => {
    for (const id of PORTAL_COLLECTION_IDS) {
      assert.equal(classifyRelationTarget(id), 'allow');
    }
    assert.equal(classifyRelationTarget('00000000-0000-0000-0000-000000000000'), 'refuse');
  });
});

describe('property tiers fail closed', () => {
  it('unknown properties are NEVER', () => {
    assert.equal(classifyProperty('projects', 'Secret Brain Leak'), 'NEVER');
    assert.equal(classifyProperty('clients', 'Totally New Field'), 'NEVER');
  });

  it('Ops (Internal) is NEVER', () => {
    assert.equal(classifyProperty('projects', 'Ops (Internal)'), 'NEVER');
  });

  it('Auth User ID is SERVER not CLIENT', () => {
    assert.equal(classifyProperty('contacts', 'Auth User ID'), 'SERVER');
  });

  it('drops unknown + NEVER from Convex partition', () => {
    const { forConvex, forClient, dropped } = partitionProperties('projects', {
      Name: 'Demo',
      Status: 'In progress',
      Client: ['cli'],
      'Ops (Internal)': ['ops'],
      'Secret Brain Leak': 'transcript',
      'External ID': 'wh_prj_x',
    });

    assert.deepEqual(forClient, { Name: 'Demo', Status: 'In progress' });
    assert.equal(forConvex.Name, 'Demo');
    assert.deepEqual(forConvex.Client, ['cli']);
    assert.equal(forConvex['External ID'], 'wh_prj_x');
    assert.ok(!('Ops (Internal)' in forConvex));
    assert.ok(!('Secret Brain Leak' in forConvex));
    assert.ok(!('Client' in forClient));
    assert.ok(dropped.some((d) => d.name === 'Secret Brain Leak' && d.reason === 'unknown'));
    assert.ok(dropped.some((d) => d.name === 'Ops (Internal)' && d.reason === 'never'));
  });

  it('CLIENT serializer never emits SERVER fields', () => {
    const { client, stripped } = serializeForClient('contacts', {
      Name: 'Ada',
      Email: 'ada@example.com',
      'Auth User ID': 'user_abc',
      'External ID': 'wh_con_1',
      Role: 'Client Admin',
    });

    assert.deepEqual(client, { Name: 'Ada', Email: 'ada@example.com' });
    assert.ok(stripped.some((s) => s.name === 'Auth User ID'));
    assert.ok(!('Auth User ID' in client));
  });
});

describe('row gates', () => {
  it('clients require Portal access Enabled', () => {
    assert.equal(clientRowPassesGate({ portalAccess: 'Enabled' }).ok, true);
    assert.equal(clientRowPassesGate({ portalAccess: 'Disabled' }).ok, false);
  });

  it('projects block Internal type even when published', () => {
    const base = {
      publishToWarehaus: true,
      clientRelationIds: ['c1'],
      archive: false,
      types: ['Website'],
    };
    assert.equal(projectRowPassesGate(base).ok, true);
    assert.equal(projectRowPassesGate({ ...base, types: ['Internal'] }).ok, false);
    assert.equal(projectRowPassesGate({ ...base, archive: true }).ok, false);
  });

  it('tasks inherit parent project gate', () => {
    assert.equal(
      taskRowPassesGate({
        publishToWarehaus: true,
        projectRelationIds: ['p1'],
        parentProjectPassesGate: true,
      }).ok,
      true,
    );
    assert.equal(
      taskRowPassesGate({
        publishToWarehaus: true,
        projectRelationIds: ['p1'],
        parentProjectPassesGate: false,
      }).ok,
      false,
    );
  });

  it('client docs require Published + publish + client', () => {
    assert.equal(
      clientDocRowPassesGate({
        status: 'Draft',
        publishToWarehaus: true,
        clientRelationIds: ['c1'],
      }).ok,
      false,
    );
    assert.equal(
      clientDocRowPassesGate({
        status: 'Published',
        publishToWarehaus: true,
        clientRelationIds: ['c1'],
      }).ok,
      true,
    );
  });

  it('shared resources quarantine client/project tenancy mismatch', () => {
    assert.equal(
      sharedResourceRowPassesGate({
        publishToWarehaus: true,
        clientRelationIds: ['c1'],
        projectRelationIds: ['p1'],
        projectClientId: 'c2',
      }).ok,
      false,
    );
  });
});

describe('Sugar Shark Brain leak', () => {
  it('refuses every Brain-related collection on the fixture project', () => {
    for (const id of SUGAR_SHARK_PROJECT_WITH_BRAIN_EDGE.relatedCollections) {
      if (id === PORTAL_COLLECTIONS.clients) {
        assert.equal(classifyRelationTarget(id), 'allow');
        continue;
      }
      assert.equal(classifyRelationTarget(id), 'refuse');
    }
  });

  it('CLIENT payload contains zero Brain-sourced fields', () => {
    const gate = projectRowPassesGate({
      publishToWarehaus: SUGAR_SHARK_PROJECT_WITH_BRAIN_EDGE.publishToWarehaus,
      clientRelationIds: [...SUGAR_SHARK_PROJECT_WITH_BRAIN_EDGE.clientRelationIds],
      archive: SUGAR_SHARK_PROJECT_WITH_BRAIN_EDGE.archive,
      types: [...SUGAR_SHARK_PROJECT_WITH_BRAIN_EDGE.types],
    });
    assert.equal(gate.ok, true);

    const { forClient, dropped } = partitionProperties(
      'projects',
      SUGAR_SHARK_PROJECT_WITH_BRAIN_EDGE.properties as Record<string, unknown>,
    );

    assert.ok(!('Ops (Internal)' in forClient));
    assert.ok(!('Secret Brain Leak' in forClient));
    assert.ok(!('Primary Email' in forClient));
    assert.ok(dropped.some((d) => d.name === 'Ops (Internal)'));
    assert.ok(dropped.some((d) => d.name === 'Secret Brain Leak' && d.reason === 'unknown'));
    assert.equal(forClient.Name, 'Sugar Shark Portal');
  });
});

describe('schema drift map coverage', () => {
  it('every live Projects property appears in the tier map', () => {
    const unmapped = findUnmappedProperties('projects', LIVE_PROJECT_PROPERTY_NAMES);
    assert.deepEqual(unmapped, []);
  });
});

describe('client docs body rules', () => {
  it('keeps allowlisted blocks and drops child pages / synced blocks', () => {
    assert.equal(classifyDocBlock('paragraph').disposition, 'keep');
    assert.equal(classifyDocBlock('child_page').reason, 'child-page');
    assert.equal(classifyDocBlock('synced_block').reason, 'synced-block');
    assert.equal(classifyDocBlock('video').disposition, 'drop');
  });
});

describe('activity client filter', () => {
  it('allows project only — shipments are dead/internal', () => {
    assert.deepEqual(ACTIVITY_CLIENT_TYPES, ['project']);
    assert.equal(isClientVisibleActivityType('project'), true);
    assert.equal(isClientVisibleActivityType('shipment'), false);
    assert.ok((ACTIVITY_INTERNAL_TYPES as readonly string[]).includes('shipment'));
  });
});

describe('file metadata contracts', () => {
  it('strips sourceNotionUrl from client shared-resource view', () => {
    const view = toSharedResourceClientView({
      orgId: 'org1',
      notionPageId: 'page1',
      externalId: 'wh_res_1',
      title: 'Brand kit',
      mimeType: 'application/pdf',
      byteSize: 100,
      checksum: 'abc',
      blobPathname: 'portal/org1/shared/page1/abc-kit.pdf',
      blobUrl: 'https://blob.vercel-storage.com/portal/org1/shared/page1/abc-kit.pdf',
      sourceNotionUrl: 'https://prod-files-secure.s3.us-west-2.amazonaws.com/notion/secret',
      published: true,
      archive: false,
      lastSyncedAt: '2026-08-03T00:00:00.000Z',
    });
    assert.ok(!('sourceNotionUrl' in view));
    assert.ok(assertNoForbiddenFileHosts(view.blobUrl));
    assert.equal(
      assertNoForbiddenFileHosts(
        'https://prod-files-secure.s3.us-west-2.amazonaws.com/notion/secret',
      ),
      false,
    );
  });

  it('strips storageId from client upload view', () => {
    const view = toClientUploadClientView(
      {
        orgId: 'org1',
        uploadedByContactId: 'con1',
        storageId: 'kg2storage',
        filename: 'brief.pdf',
        mimeType: 'application/pdf',
        byteSize: 12,
        scanStatus: 'pending',
        needsReview: true,
        createdAt: '2026-08-03T00:00:00.000Z',
      },
      'https://convex.example/signed',
    );
    assert.ok(!('storageId' in view));
    assert.equal(view.needsReview, true);
    assert.equal(view.downloadUrl, 'https://convex.example/signed');
  });

  it('builds org-scoped blob pathnames', () => {
    assert.equal(
      blobPathname({
        orgId: 'org1',
        kind: 'shared',
        notionPageId: 'p1',
        checksum: 'deadbeef',
        safeName: 'My File!.pdf',
      }),
      'portal/org1/shared/p1/deadbeef-My_File_.pdf',
    );
  });
});
