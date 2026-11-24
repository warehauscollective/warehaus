import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TASK_UNAVAILABLE } from '@warehaus/portal-sync';
import { getForClient as getDocForClient, listForClient as listDocsForClient } from '../clientDocs';
import { listForClient as listPeopleForClient } from '../contacts';
import { getSnapshot, listActivityForClient, listActivityForStaff } from '../portalData';
import {
  listForClient as listProjectsForClient,
  listForOrgAdmin,
  listForStaff,
  listPublishedForStaff,
} from '../projects';
import {
  getForClient as getResourceForClient,
  listForClient as listResourcesForClient,
  usedInTasks,
  usedInTasksForClient,
} from '../sharedResources';
import {
  activityForClient,
  activityForStaff,
  getForClient,
  listForClient as listTasksForClient,
  listForStaff as listTasksForStaff,
} from '../tasks';
import { PortalAuthError } from './identity';
import { memoryCtx } from './memoryCtx.testkit';
import { seedContact, seedOrg, seedProject, seedTask } from './seedRows.testkit';
import { sortProjectsByLastUpdated } from '../../src/lib/data/projectList';

type Fields = Record<string, unknown>;

const CLIENT_AUTH = 'auth-client';
const STAFF_AUTH = 'auth-staff';

/** Ids of rows that do not exist. Table scoped, so they pass the arg validators. */
const MISSING = {
  project: 'projects:9001',
  task: 'tasks:9002',
  doc: 'clientDocs:9003',
  resource: 'sharedResources:9004',
};

/**
 * Northwind (the signed-in client's org) with a shared project, a newer shared
 * project, the internal warehaus.studio project, drafts, a sync-hidden task,
 * orphans and staff-only fields. Lumen Dental is another client with its own
 * published rows. Maya Internal is staff, on the Northwind org.
 */
function world(orgFields: Fields = {}) {
  const t = memoryCtx();
  const org = seedOrg(t, {
    companyName: 'Northwind',
    slug: 'northwind',
    portalAccess: 'Enabled',
    notionPageId: 'client-notion',
    lastSyncedAt: 1,
    ...orgFields,
  });
  const otherOrg = seedOrg(t, {
    companyName: 'Lumen Dental',
    slug: 'lumen',
    portalAccess: 'Enabled',
    notionPageId: 'lumen-notion',
    lastSyncedAt: 1,
  });

  const ada = seedContact(t, org, {
    name: 'Ada Client',
    email: 'ada@northwind.test',
    authUserId: CLIENT_AUTH,
    role: 'Client Member',
    portalAccess: 'Enabled',
    notionPageId: 'contact-notion',
    lastSyncedAt: 1,
  });
  const maya = seedContact(t, org, {
    name: 'Maya Internal',
    email: 'maya@warehaus.studio',
    authUserId: STAFF_AUTH,
    role: 'Warehaus Staff',
    portalAccess: 'Enabled',
    notionPageId: 'staff-notion',
    lastSyncedAt: 1,
  });
  seedContact(t, org, {
    name: 'Sam Studio',
    email: 'sam@warehaus.studio',
    authUserId: 'auth-studio-mail',
    role: 'Client Member',
    portalAccess: 'Enabled',
    notionPageId: 'studio-mail-notion',
    lastSyncedAt: 1,
  });

  const project = (orgId: string, fields: Fields) =>
    seedProject(t, orgId, { status: 'In Progress', type: ['Website'], archive: false, publishToWarehaus: true, stack: [], ...fields });
  const projPublic = project(org, {
    name: 'Northwind site',
    notionPageId: 'project-public',
    lastSyncedAt: 1,
    description: 'Public site',
  });
  project(org, {
    name: 'Zebra refresh',
    notionPageId: 'project-zebra',
    lastSyncedAt: 80,
    description: 'Newer shared project',
  });
  const projInternal = project(org, {
    name: 'warehaus.studio',
    type: ['Internal'],
    notionPageId: 'project-internal',
    lastSyncedAt: 1,
    description: 'Staff only studio',
  });
  const projForeign = project(otherOrg, {
    name: 'Lumen site',
    notionPageId: 'project-foreign',
    lastSyncedAt: 1,
    description: 'Another client',
  });

  const taskPublic = seedTask(t, org, projPublic, {
    name: 'Homepage',
    status: 'To Do',
    isDone: false,
    publishToWarehaus: true,
    notionPageId: 'task-public-notion',
    lastSyncedAt: 1,
    description: 'Staff only task copy',
    estimate: 'estimate-secret',
    priority: 'priority-high',
    stage: 'Planning',
    stagePendingAt: 99,
    stageSynced: 'Idea',
    stagePendingBaseEditedTime: '2026-10-28T00:00:00.000Z',
    stagePendingPullRequest: 'pending-pr-secret',
    pullRequestUrl: 'https://github.com/warehaus/secret/pull/1',
  });
  const taskInternal = seedTask(t, org, projInternal, {
    name: 'Studio ops',
    status: 'To Do',
    isDone: false,
    stage: 'Shipped',
    publishToWarehaus: true,
    notionPageId: 'task-internal-notion',
    lastSyncedAt: 1,
  });
  const taskDraft = seedTask(t, org, projPublic, {
    name: 'Secret draft',
    status: 'Inbox',
    isDone: false,
    stage: 'Parked',
    publishToWarehaus: false,
    notionPageId: 'task-draft-notion',
    lastSyncedAt: 1,
  });
  const taskHidden = seedTask(t, org, projPublic, {
    name: 'Hidden launch task',
    status: 'To Do',
    isDone: false,
    stage: 'Awaiting Go',
    publishToWarehaus: true,
    notionPageId: 'task-hidden-notion',
    lastSyncedAt: 1,
    syncHiddenAt: 5,
  });
  const taskForeign = seedTask(t, otherOrg, projForeign, {
    name: 'Foreign task',
    publishToWarehaus: true,
    notionPageId: 'task-foreign-notion',
    lastSyncedAt: 1,
  });

  const activity = (fields: Fields) => t.seed('activity', { orgId: org, tone: 'muted', ...fields });
  activity({ projectId: projInternal, name: 'Internal note', type: 'project', summary: 'warehaus.studio planning', timestamp: 30 });
  activity({ projectId: projPublic, name: 'Sync', type: 'sync', summary: 'sync noise', timestamp: 25 });
  activity({ projectId: projPublic, name: 'Public note', type: 'project', summary: 'Northwind site update', timestamp: 20 });
  activity({
    projectId: projPublic,
    name: 'Homepage wireframes moved to Awaiting Go',
    type: 'project',
    summary: 'Maya Chen · Source: Notion · ada@northwind.test · invite pending',
    timestamp: 40,
  });
  activity({ name: 'Org note', type: 'project', summary: 'General update', timestamp: 10 });
  activity({ projectId: projPublic, name: 'Task moved', type: 'task', summary: 'Task row for a published task', timestamp: 15 });

  const doc = (fields: Fields) => t.seed('clientDocs', { orgId: org, lastSyncedAt: 1, ...fields });
  const docPublic = doc({
    projectId: projPublic,
    title: 'Public brief',
    summary: 'Shared scope',
    docType: 'Brief',
    order: 1,
    status: 'Published',
    publishToWarehaus: true,
    notionPageId: 'doc-public-notion',
  });
  const docDraft = doc({
    projectId: projPublic,
    title: 'Secret doc',
    summary: 'Draft',
    docType: 'Note',
    status: 'Draft',
    publishToWarehaus: false,
    notionPageId: 'doc-draft-notion',
  });
  const docUnpub = doc({
    projectId: projPublic,
    title: 'Unpublished doc',
    summary: 'Held',
    docType: 'Note',
    status: 'Published',
    publishToWarehaus: false,
    notionPageId: 'doc-unpub-notion',
  });
  const docInternal = doc({
    projectId: projInternal,
    title: 'Studio doc',
    summary: 'Internal notes',
    docType: 'Note',
    status: 'Published',
    publishToWarehaus: true,
    notionPageId: 'doc-internal-notion',
  });
  const docOrphan = doc({
    projectId: MISSING.project,
    title: 'Orphan doc',
    summary: 'Missing project',
    docType: 'Note',
    order: 3,
    status: 'Published',
    publishToWarehaus: true,
    notionPageId: 'doc-orphan-notion',
  });
  doc({
    title: 'Org guide',
    summary: 'No project',
    docType: 'Guide',
    order: 0,
    status: 'Published',
    publishToWarehaus: true,
    notionPageId: 'doc-org-notion',
  });
  doc({
    projectId: projPublic,
    title: 'Unordered note',
    summary: 'No Order field',
    docType: 'Note',
    status: 'Published',
    publishToWarehaus: true,
    notionPageId: 'doc-unordered-notion',
  });

  const resource = (fields: Fields) =>
    t.seed('sharedResources', { orgId: org, publishToWarehaus: true, archive: false, lastSyncedAt: 1, ...fields });
  const resPublic = resource({
    projectId: projPublic,
    title: 'Kickoff notes',
    description: 'Shared recap',
    type: 'Meeting notes',
    url: 'https://example.com/recap',
    externalId: 'wh_res_secret',
    sourceNotionUrl: 'https://www.notion.so/secret-page',
    notionPageId: 'res-public-notion',
  });
  const resDraft = resource({ projectId: projPublic, title: 'Draft file', publishToWarehaus: false, notionPageId: 'res-draft-notion' });
  const resInternal = resource({ projectId: projInternal, title: 'Studio file', notionPageId: 'res-internal-notion' });
  const resOrphan = resource({ projectId: MISSING.project, title: 'Orphan file', notionPageId: 'res-orphan-notion' });
  const resForeign = resource({
    orgId: otherOrg,
    projectId: projForeign,
    title: 'Foreign recap',
    description: 'Another client',
    type: 'Meeting notes',
    notionPageId: 'res-foreign-notion',
  });
  const resOrg = resource({ title: 'Org file', notionPageId: 'res-org-notion' });

  const audit = (fields: Fields) => t.seed('auditEvents', { orgId: org, action: 'outbox.confirmed', actorKind: 'staff', ...fields });
  audit({ notionPageId: 'task-public-notion', after: JSON.stringify({ properties: { Status: 'To Do' } }), createdAt: 40 });
  audit({ notionPageId: 'task-public-notion', after: JSON.stringify({ properties: { Description: 'Staff only task copy' } }), createdAt: 35 });
  audit({
    notionPageId: 'task-internal-notion',
    after: JSON.stringify({ properties: { Status: 'To Do', Name: 'Studio ops' } }),
    createdAt: 45,
  });

  t.seed('taskResources', { orgId: org, resourceId: resPublic, taskId: taskPublic });
  t.seed('taskResources', { orgId: org, resourceId: resPublic, taskId: taskDraft });
  t.seed('taskResources', { orgId: org, resourceId: resPublic, taskId: taskInternal });
  t.seed('taskResources', { orgId: otherOrg, resourceId: resForeign, taskId: taskForeign });

  t.seed('notionOutbox', {
    orgId: org,
    kind: 'task-description',
    status: 'conflict',
    database: 'tasks',
    notionPageId: 'task-internal-notion',
    lastError: 'warehaus.studio write conflict',
    createdAt: 50,
    idempotencyKey: 'task-description:internal',
    payload: '{}',
    actor: 'staff',
    attempts: 1,
    nextAttemptAt: 50,
  });

  return {
    t,
    org,
    otherOrg,
    ada,
    maya,
    projInternal,
    taskPublic,
    taskInternal,
    taskDraft,
    taskHidden,
    docPublic,
    docDraft,
    docUnpub,
    docInternal,
    docOrphan,
    resPublic,
    resDraft,
    resInternal,
    resOrphan,
    resForeign,
    resOrg,
    run: (fn: unknown, args: Fields = {}) => t.call(fn, args, { as: { authUserId: CLIENT_AUTH } }),
    runStaff: (fn: unknown, args: Fields = {}) => t.call(fn, args, { as: { authUserId: STAFF_AUTH } }),
  };
}

function text(value: unknown): string {
  return JSON.stringify(value);
}

describe('client identity against warehaus.studio', () => {
  it('returns the shared project and task and none of the internal rows', async () => {
    const w = world();
    const { run } = w;
    const projects = await run(listProjectsForClient);
    const tasks = await run(listTasksForClient);
    const docs = await run(listDocsForClient);
    const resources = await run(listResourcesForClient);
    const people = await run(listPeopleForClient);
    const snapshot = await run(getSnapshot);
    const bundled = text({ projects, tasks, docs, resources, people, snapshot });

    assert.match(bundled, /Northwind site/);
    assert.match(bundled, /Homepage/);
    assert.match(bundled, /A task in Northwind site is ready for your review/);
    assert.equal(bundled.includes('Northwind site update'), false);
    assert.equal(bundled.includes('Public note'), false);
    assert.equal(bundled.includes('Awaiting Go'), false);
    assert.equal(bundled.includes('Maya Chen'), false);
    assert.equal(bundled.includes('invite pending'), false);
    assert.equal(bundled.includes('General update'), false);
    assert.equal(bundled.includes('Task row for a published task'), false);
    assert.equal(bundled.includes('warehaus.studio'), false);
    assert.equal(bundled.includes('Studio ops'), false);
    assert.equal(bundled.includes('Secret draft'), false);
    assert.equal(bundled.includes(`"${w.projInternal}"`), false);
    assert.equal(bundled.includes(`"${w.taskInternal}"`), false);
    assert.equal(bundled.includes('project-internal'), false);
    assert.equal(bundled.includes('task-internal'), false);
    assert.equal(bundled.includes('sync noise'), false);
    assert.equal(bundled.includes('Staff only task copy'), false);
    assert.equal(bundled.includes('Public brief'), true);
    assert.equal(bundled.includes('Kickoff notes'), true);
    assert.equal(bundled.includes('Ada Client'), true);
    assert.equal(bundled.includes('Secret doc'), false);
    assert.equal(bundled.includes('Unpublished doc'), false);
    assert.equal(bundled.includes('Studio doc'), false);
    assert.equal(bundled.includes('Draft file'), false);
    assert.equal(bundled.includes('Studio file'), false);
    assert.equal(bundled.includes('maya@warehaus.studio'), false);
    assert.equal(bundled.includes('sam@warehaus.studio'), false);
    assert.equal(bundled.includes('Orphan doc'), false);
    assert.equal(bundled.includes('Org guide'), true);
    assert.equal(bundled.includes('Orphan file'), false);
    assert.equal(bundled.includes('Org file'), true);
    assert.equal(bundled.includes('Foreign recap'), false);
    assert.equal(bundled.includes('Foreign task'), false);
    assert.equal(bundled.includes('Lumen'), false);
    assert.equal(text(docs).includes('notionPageId'), false);
    assert.equal(text(docs).includes('"order"'), false);
    assert.equal(text(docs).includes('publishToWarehaus'), false);
    assert.equal(text(docs).includes('lastSyncedAt'), false);
    assert.equal(text(docs).includes('syncHidden'), false);
    assert.equal(text(docs).includes('syncState'), false);
    assert.equal(text(docs).includes('"status"'), false);
    assert.equal(text(resources).includes('notionPageId'), false);
    assert.equal(text(resources).includes('lastSyncedAt'), false);
    assert.equal(text(resources).includes('updatedAt'), true);
    const listedTasks = tasks as Array<{ name: string; stage: string | null }>;
    assert.equal(listedTasks.some((task) => task.name === 'Homepage' && task.stage === 'Planning'), true);
    assert.equal(listedTasks.some((task) => task.name === 'Secret draft' || task.name === 'Studio ops' || task.name === 'Hidden launch task'), false);
    const docTitles = (docs as Array<{ title: string }>).map((doc) => doc.title);
    assert.deepEqual(docTitles, ['Org guide', 'Public brief', 'Unordered note']);
    assert.equal(bundled.includes('Warehaus Staff'), false);
    assert.equal(bundled.includes('estimate-secret'), false);
    assert.equal(bundled.includes('priority-high'), false);
    assert.equal(bundled.includes('secret/pull/1'), false);
    assert.equal(bundled.includes('pending-pr-secret'), false);
    assert.equal(bundled.includes('stagePending'), false);
    assert.equal(bundled.includes('stageSynced'), false);
    assert.equal(bundled.includes('stagePendingAt'), false);
    assert.equal(bundled.includes('wh_res_secret'), false);
    assert.equal(bundled.includes('notion.so'), false);
    assert.equal(bundled.includes('publishToWarehaus'), false);
    const listedPeople = people as Array<{
      id: string;
      name: string;
      email: string;
      role: string;
      portalAccess: string;
      invitePending: boolean;
    }>;
    assert.deepEqual(listedPeople.map((person) => person.name), ['Ada Client']);
    assert.deepEqual(listedPeople[0], {
      id: w.ada,
      name: 'Ada Client',
      email: 'ada@northwind.test',
      role: 'Client Member',
      portalAccess: 'Enabled',
      invitePending: false,
      joinedAt: null,
    });
    assert.equal('authUserId' in listedPeople[0], false);
    assert.equal('notionPageId' in listedPeople[0], false);

    const publicDoc = await run(getDocForClient, { docId: w.docPublic });
    assert.equal((publicDoc as { title: string }).title, 'Public brief');
    assert.equal('notionPageId' in (publicDoc as object), false);
    assert.equal('order' in (publicDoc as object), false);
    assert.equal('publishToWarehaus' in (publicDoc as object), false);
    assert.equal('syncState' in (publicDoc as object), false);
    assert.equal('lastSyncedAt' in (publicDoc as object), false);
    assert.equal('status' in (publicDoc as object), false);
    for (const docId of [w.docDraft, w.docUnpub, w.docInternal, w.docOrphan, MISSING.doc]) {
      await assert.rejects(run(getDocForClient, { docId }), (err: unknown) => {
        assert.ok(err instanceof PortalAuthError);
        assert.equal(err.message, 'Doc not found');
        return true;
      });
    }
    const publicResource = await run(getResourceForClient, { resourceId: w.resPublic });
    assert.equal((publicResource as { name: string }).name, 'Kickoff notes');
    assert.equal('notionPageId' in (publicResource as object), false);
    assert.equal('lastSyncedAt' in (publicResource as object), false);
    assert.equal(typeof (publicResource as { updatedAt: number }).updatedAt, 'number');
    const orgResource = await run(getResourceForClient, { resourceId: w.resOrg });
    assert.equal((orgResource as { name: string }).name, 'Org file');
    for (const resourceId of [w.resDraft, w.resInternal, w.resOrphan, w.resForeign, MISSING.resource]) {
      await assert.rejects(run(getResourceForClient, { resourceId }), (err: unknown) => {
        assert.ok(err instanceof PortalAuthError);
        assert.equal(err.message, 'Resource not found');
        return true;
      });
    }

    const snapshotBody = snapshot as {
      projects: Array<{ name: string; lastSyncedAt?: number }>;
      tasks: Array<{ name: string }>;
      activity: Array<{ name: string; summary: string }>;
    };
    assert.deepEqual(snapshotBody.projects.map((project) => project.name), ['Northwind site', 'Zebra refresh']);
    assert.deepEqual(
      snapshotBody.projects.map((project) => project.lastSyncedAt),
      [1, 80],
    );
    assert.equal(snapshotBody.tasks.some((task) => 'lastSyncedAt' in task), false);
    assert.deepEqual(
      sortProjectsByLastUpdated(snapshotBody.projects).map((project) => project.name),
      ['Zebra refresh', 'Northwind site'],
    );
    assert.deepEqual(snapshotBody.tasks.map((task) => task.name), ['Homepage']);
    assert.deepEqual(
      snapshotBody.activity.map((item) => item.name),
      ['A task in Northwind site is ready for your review', 'A task in Northwind site is ready for your review', 'Task'],
    );
    assert.deepEqual(
      snapshotBody.activity.map((item) => item.summary),
      ['', '', 'Task'],
    );
    assert.equal(JSON.stringify(snapshotBody.activity).includes('Staff only task copy'), false);
    const snapshotText = text(snapshot);
    assert.equal((snapshot as { leadName?: string }).leadName, 'Maya Internal');
    assert.equal(snapshotText.includes('maya@warehaus.studio'), false);
    assert.equal(snapshotText.includes(`"${w.maya}"`), false);
    assert.equal(snapshotText.includes('staff-notion'), false);
    assert.equal(snapshotText.includes('notionPageId'), false);
    assert.equal(snapshotText.includes('publishToWarehaus'), false);
    assert.equal(snapshotText.includes('lastSyncedAt'), true);
    assert.equal(snapshotText.includes('syncHidden'), false);
    assert.equal(snapshotText.includes('syncState'), false);
  });

  it('proves the hidden rows exist: staff see the internal project, drafts, hidden task and orphans', async () => {
    const { t, runStaff } = world();
    const staffTasks = text(await runStaff(listTasksForStaff));
    assert.match(staffTasks, /Studio ops/);
    assert.match(staffTasks, /Secret draft/);
    assert.match(staffTasks, /Homepage/);
    const names = (table: string, field: string) => t.rows(table).map((row) => row[field]);
    assert.ok(names('tasks', 'name').includes('Hidden launch task'));
    assert.ok(names('projects', 'name').includes('warehaus.studio'));
    for (const title of ['Secret doc', 'Unpublished doc', 'Studio doc', 'Orphan doc']) assert.ok(names('clientDocs', 'title').includes(title), title);
    for (const title of ['Draft file', 'Studio file', 'Orphan file', 'Foreign recap']) {
      assert.ok(names('sharedResources', 'title').includes(title), title);
    }
    assert.ok(names('contacts', 'email').includes('maya@warehaus.studio'));
    assert.ok(names('contacts', 'email').includes('sam@warehaus.studio'));
  });

  it('returns used-in-tasks without publish, sync, or warehaus.studio rows', async () => {
    const w = world();
    const { run, runStaff } = w;
    const visible = (await run(usedInTasksForClient, { resourceId: w.resPublic })) as Array<{ name: string }>;
    assert.deepEqual(visible.map((task) => task.name), ['Homepage']);
    const hiddenResource = await run(usedInTasksForClient, { resourceId: w.resInternal });
    assert.deepEqual(hiddenResource, []);
    const draft = await run(usedInTasksForClient, { resourceId: w.resDraft });
    assert.deepEqual(draft, []);
    const foreign = await run(usedInTasksForClient, { resourceId: w.resForeign });
    assert.deepEqual(foreign, []);
    assert.equal(text(foreign).includes('Foreign recap'), false);
    assert.equal(text(foreign).includes('Foreign task'), false);
    assert.equal(text(foreign).includes('Lumen Dental'), false);
    const body = text(visible);
    assert.equal(body.includes('notionPageId'), false);
    assert.equal(body.includes('publishToWarehaus'), false);
    assert.equal(body.includes('lastSyncedAt'), false);
    assert.equal(body.includes('warehaus.studio'), false);
    assert.equal(body.includes('Studio ops'), false);
    assert.equal(body.includes('Secret draft'), false);
    const staff = (await runStaff(usedInTasks, { resourceId: w.resPublic })) as Array<{ name: string }>;
    assert.deepEqual(staff.map((task) => task.name), ['Homepage', 'Secret draft', 'Studio ops']);
    const staffForeign = (await runStaff(usedInTasks, { resourceId: w.resForeign })) as Array<{ name: string }>;
    assert.deepEqual(staffForeign.map((task) => task.name), ['Foreign task']);
  });

  it('keeps raw activity text out of the client snapshot', async () => {
    const { run } = world();
    const snapshot = (await run(getSnapshot)) as { activity: Array<{ name: string; summary: string }> };
    const blob = text(snapshot.activity);
    assert.equal(blob.includes('Source'), false);
    assert.equal(blob.includes('Awaiting Go'), false);
    assert.equal(blob.includes('Maya Chen'), false);
    assert.equal(blob.includes('Public note'), false);
    assert.equal(blob.includes('@'), false);
    assert.equal(/invite pending/i.test(blob), false);
    assert.match(blob, /A task in Northwind site is ready for your review/);
  });

  it('uses the same unavailable message for a hidden task and a missing task', async () => {
    const w = world();
    const { run } = w;
    const visible = await run(getForClient, { taskId: w.taskPublic });
    assert.equal((visible as { name: string }).name, 'Homepage');
    assert.equal((visible as { stage: string | null }).stage, 'Planning');
    assert.equal('stagePending' in (visible as object), false);
    assert.equal('pullRequestUrl' in (visible as object), false);

    for (const taskId of [w.taskInternal, MISSING.task, w.taskDraft, w.taskHidden]) {
      await assert.rejects(run(getForClient, { taskId }), (err: unknown) => {
        assert.ok(err instanceof PortalAuthError);
        assert.equal(err.message, TASK_UNAVAILABLE);
        assert.equal(err.message.includes('warehaus'), false);
        return true;
      });
    }
  });

  it('keeps internal projects, server descriptions, and outbox rows out of the client feed', async () => {
    const w = world();
    const { run } = w;
    const feed = await run(listActivityForClient);
    const timeline = await run(activityForClient, { taskId: w.taskPublic });
    const bundled = text({ feed, timeline });
    assert.match(bundled, /A task in Northwind site is ready for your review/);
    assert.match(bundled, /Homepage was updated/);
    assert.equal(bundled.includes('Northwind site update'), false);
    assert.equal(bundled.includes('Public note'), false);
    assert.equal(bundled.includes('Status:'), false);
    assert.equal(bundled.includes('To Do'), false);
    assert.equal(bundled.includes('ada@northwind.test'), false);
    assert.equal(bundled.includes('maya@warehaus.studio'), false);
    assert.equal(bundled.includes('warehaus.studio'), false);
    assert.equal(bundled.includes('Studio ops'), false);
    assert.equal(bundled.includes('sync noise'), false);
    assert.equal(bundled.includes('Staff only task copy'), false);
    assert.equal(bundled.includes('write conflict'), false);
    assert.equal(bundled.includes('task-internal-notion'), false);

    await assert.rejects(run(activityForClient, { taskId: w.taskInternal }), (err: unknown) => {
      assert.ok(err instanceof PortalAuthError);
      assert.equal(err.message, TASK_UNAVAILABLE);
      return true;
    });
    for (const [query, args] of [
      [listActivityForStaff, {}],
      [activityForStaff, { taskId: w.taskPublic }],
    ] as const) {
      await assert.rejects(run(query, args), (err: unknown) => {
        assert.ok(err instanceof PortalAuthError);
        assert.equal(err.message, 'Staff role required');
        return true;
      });
    }
  });

  it('shows a saved stage to clients and stagePending only to staff', async () => {
    const w = world();
    const { run, runStaff } = w;
    const clientList = (await run(listTasksForClient)) as Array<Record<string, unknown>>;
    const clientTask = clientList.find((task) => task.name === 'Homepage');
    const clientSnapshot = (await run(getSnapshot)) as { tasks: Array<Record<string, unknown>> };
    const clientSnap = clientSnapshot.tasks.find((task) => task.name === 'Homepage');
    const clientDetail = (await run(getForClient, { taskId: w.taskPublic })) as Record<string, unknown>;
    const hidden = ['stagePending', 'stagePendingAt', 'stageSynced', 'stagePendingBaseEditedTime', 'stagePendingPullRequest', 'pullRequestUrl'];
    for (const payload of [clientTask, clientSnap, clientDetail]) {
      assert.equal(payload?.stage, 'Planning');
      for (const key of hidden) assert.equal(key in (payload ?? {}), false, key);
    }
    const names = clientList.map((task) => task.name);
    assert.equal(names.includes('Secret draft'), false);
    assert.equal(names.includes('Studio ops'), false);
    assert.equal(names.includes('Hidden launch task'), false);
    assert.equal(JSON.stringify(clientSnapshot).includes('Parked'), false);
    assert.equal(JSON.stringify(clientSnapshot).includes('Hidden launch task'), false);

    const staffList = (await runStaff(listTasksForStaff)) as Array<Record<string, unknown>>;
    const staffTask = staffList.find((task) => task.name === 'Homepage');
    assert.equal(staffTask?.stagePending, true);
    assert.equal(staffTask?.stage, 'Planning');
    for (const key of ['stagePendingAt', 'stageSynced', 'stagePendingBaseEditedTime', 'stagePendingPullRequest']) {
      assert.equal(key in (staffTask ?? {}), false, key);
    }
    const staffSnapshot = (await runStaff(getSnapshot)) as { tasks: Array<Record<string, unknown>> };
    const staffSnap = staffSnapshot.tasks.find((task) => task.name === 'Homepage');
    assert.equal(staffSnap?.stagePending, true);
    assert.equal(staffSnap?.stage, 'Planning');
    for (const key of hidden.filter((key) => key !== 'stagePending')) {
      assert.equal(key in (staffSnap ?? {}), false, key);
    }
    assert.equal(JSON.stringify(clientList).includes('pending-pr-secret'), false);
    assert.equal(JSON.stringify(clientSnapshot).includes('pending-pr-secret'), false);
    assert.equal(JSON.stringify(clientDetail).includes('pending-pr-secret'), false);
  });

  it('shows a Disabled prospect on the staff snapshot and keeps it off the client read', async () => {
    const disabled = world({ portalAccess: 'Disabled' });
    const staffSnapshot = (await disabled.runStaff(getSnapshot)) as {
      projects: Array<{ name: string }>;
      tasks: Array<{ name: string }>;
    };
    assert.equal(staffSnapshot.projects.some((project) => project.name === 'Northwind site'), true);
    assert.equal(staffSnapshot.tasks.some((task) => task.name === 'Homepage'), true);
    assert.equal(staffSnapshot.projects.some((project) => project.name === 'warehaus.studio'), false);
    assert.equal(staffSnapshot.tasks.some((task) => task.name === 'Secret draft'), false);

    await assert.rejects(disabled.run(getSnapshot), (err: unknown) => {
      assert.ok(err instanceof PortalAuthError);
      assert.equal(err.message, 'Client portal access is disabled');
      return true;
    });

    const concealed = world({ portalAccess: 'Disabled', syncHiddenAt: 4 });
    const hiddenSnapshot = (await concealed.runStaff(getSnapshot)) as {
      projects: unknown[];
      tasks: unknown[];
    };
    assert.equal(hiddenSnapshot.projects.length, 0);
    assert.equal(hiddenSnapshot.tasks.length, 0);
  });

  it('shows internal work and the task description to staff', async () => {
    const w = world();
    const { runStaff } = w;
    const feed = text(await runStaff(listActivityForStaff));
    const tasks = text(await runStaff(listTasksForStaff));
    const timeline = text(await runStaff(activityForStaff, { taskId: w.taskInternal }));
    assert.match(feed, /warehaus.studio/);
    assert.match(feed, /sync noise/);
    assert.match(feed, /Staff only task copy/);
    assert.match(tasks, /Staff only task copy/);
    assert.match(timeline, /Studio ops/);
  });

  it('returns role and portal access, and derives a pending invite for this org only', async () => {
    const w = world();
    const { t, org, otherOrg, run } = w;
    seedContact(t, org, {
      name: 'Bea Admin',
      email: 'Bea@Northwind.test',
      role: 'Client Admin',
      portalAccess: 'Disabled',
      notionPageId: 'admin-contact',
      lastSyncedAt: 1,
    });
    seedContact(t, otherOrg, {
      name: 'Quinn Other',
      email: 'quinn@lumen.test',
      role: 'Client Admin',
      portalAccess: 'Enabled',
      notionPageId: 'other-contact',
      lastSyncedAt: 1,
    });
    const invite = (fields: Fields) => t.seed('pendingInvites', { lastSyncedAt: 1, ...fields });
    invite({
      orgId: org,
      email: 'bea@northwind.test',
      name: 'Bea Admin',
      role: 'Client Admin',
      inviteStatus: 'Pending',
      notionPageId: 'invite-bea',
    });
    invite({
      orgId: org,
      email: 'ada@northwind.test',
      name: 'Ada Client',
      role: 'Client Member',
      inviteStatus: 'Accepted',
      notionPageId: 'invite-ada',
    });
    invite({
      orgId: otherOrg,
      email: 'ada@northwind.test',
      name: 'Ada Client',
      role: 'Client Member',
      inviteStatus: 'Pending',
      notionPageId: 'invite-foreign',
    });
    const people = (await run(listPeopleForClient)) as Array<{
      id: string;
      name: string;
      email: string;
      role: string;
      portalAccess: string;
      invitePending: boolean;
      joinedAt: number | null;
    }>;
    assert.deepEqual(
      people.map((person) => person.name),
      ['Ada Client', 'Bea Admin'],
    );
    const ada = people[0];
    const bea = people[1];
    assert.ok(ada);
    assert.ok(bea);
    assert.deepEqual(Object.keys(ada).sort(), ['email', 'id', 'invitePending', 'joinedAt', 'name', 'portalAccess', 'role']);
    assert.equal(ada.joinedAt, null);
    assert.equal(ada.role, 'Client Member');
    assert.equal(ada.portalAccess, 'Enabled');
    assert.equal(ada.invitePending, false);
    assert.equal(bea.role, 'Client Admin');
    assert.equal(bea.portalAccess, 'Disabled');
    assert.equal(bea.invitePending, true);
    assert.equal(bea.email, 'Bea@Northwind.test');
    const bundled = text(people);
    assert.equal(bundled.includes('Maya Internal'), false);
    assert.equal(bundled.includes('Sam Studio'), false);
    assert.equal(bundled.includes('Quinn Other'), false);
    assert.equal(bundled.includes('Warehaus Staff'), false);
    assert.equal(bundled.includes('authUserId'), false);
    assert.equal(bundled.includes('notionPageId'), false);
    assert.equal(bundled.includes('Lumen Dental'), false);
  });

  it('does not return internal projects from the staff project queries', async () => {
    const { org, run } = world();
    for (const [query, args] of [
      [listForOrgAdmin, { orgId: org }],
      [listPublishedForStaff, {}],
      [listForStaff, {}],
    ] as const) {
      await assert.rejects(run(query, args), (err: unknown) => {
        assert.ok(err instanceof PortalAuthError);
        assert.equal(err.message, 'Staff role required');
        return true;
      });
    }
  });
});
