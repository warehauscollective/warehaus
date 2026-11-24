import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fixtureAccountPage } from './accountPage';
import { fixtureActivityPage } from './activityPage';
import { parseFixtureParam } from './fixtureParam';
import { FIXTURE_CLIENT_SNAPSHOT, FIXTURE_PROJECTS, FIXTURE_SNAPSHOT, FIXTURE_TASKS } from './fixtures';
import { fixtureHomePage, liveHomeDashboard } from './homePage';
import { fixtureProjectTask, fixtureProjectsPage, parseTaskReview } from './projectsPage';

describe('fixture param', () => {
  it('reads only allowed values', () => {
    assert.equal(parseFixtureParam('?dash=blank', 'dash', ['blank', 'capped']), 'blank');
    assert.equal(parseFixtureParam('?dash=nope', 'dash', ['blank', 'capped']), null);
    assert.equal(parseFixtureParam('', 'dash', ['blank']), null);
  });
});

describe('activity page fixture adapter', () => {
  it('maps design-review screens to loading and failed', () => {
    assert.equal(fixtureActivityPage(true, 'loading').loading, true);
    assert.equal(fixtureActivityPage(true, 'error').failed, true);
    const ready = fixtureActivityPage(false, null);
    assert.equal(ready.loading || ready.failed, false);
    assert.ok(ready.items.length > 0);
  });
});

describe('home page adapters', () => {
  const base = { activity: [], loading: false };
  it('gives staff the fixture rows and clients their snapshot', () => {
    const staff = fixtureHomePage({ ...base, isStaff: true, preview: null, snapshot: FIXTURE_SNAPSHOT });
    assert.equal(staff.dashboard.projects.length, FIXTURE_PROJECTS.length);
    assert.equal(staff.dashboard.tasks.length, FIXTURE_TASKS.length);
    assert.ok(staff.dashboard.granola);
    const client = fixtureHomePage({ ...base, isStaff: false, preview: null, snapshot: FIXTURE_CLIENT_SNAPSHOT });
    assert.equal(client.dashboard.projects, FIXTURE_CLIENT_SNAPSHOT.projects);
    assert.equal('granola' in client.dashboard, false);
    assert.equal(client.dashboard.pull.lastSyncedAt, null);
  });

  it('blanks everything for ?dash=blank and fills the outbox for ?dash=capped', () => {
    const blank = fixtureHomePage({ ...base, isStaff: true, preview: 'blank', snapshot: FIXTURE_SNAPSHOT, loading: true });
    assert.equal(blank.dashboard.projects.length, 0);
    assert.equal(blank.loading, false);
    const capped = fixtureHomePage({ ...base, isStaff: true, preview: 'capped', snapshot: FIXTURE_SNAPSHOT });
    assert.equal(capped.dashboard.writebackEnabled, true);
    assert.ok(capped.dashboard.outbox.counts.failed > 0);
    const clientCapped = fixtureHomePage({ ...base, isStaff: false, preview: 'capped', snapshot: FIXTURE_CLIENT_SNAPSHOT });
    assert.equal(clientCapped.dashboard.writebackEnabled, false);
  });

  it('falls back to syncMeta until sync health arrives, and never shows clients staff health', () => {
    const args = { snapshot: FIXTURE_SNAPSHOT, staffProjects: undefined, staffTasks: undefined, sync: undefined, activity: [] };
    const staff = liveHomeDashboard({ ...args, isStaff: true });
    assert.equal(staff.pull.lastSyncedAt, FIXTURE_SNAPSHOT.syncMeta.lastSyncedAt);
    assert.equal(staff.writebackEnabled, false);
    const client = liveHomeDashboard({ ...args, isStaff: false, staffProjects: [{ id: 'x' }] });
    assert.equal(client.projects, FIXTURE_SNAPSHOT.projects);
    assert.equal(client.notices.length, 0);
  });
});

describe('account page fixture adapter', () => {
  it('scopes contacts to the open client for staff and the own org for clients', () => {
    const staff = fixtureAccountPage({ isStaff: true, clientId: 'c-north', orgId: undefined });
    assert.ok(staff.contacts.length > 0);
    assert.ok(staff.contacts.every((contact) => contact.orgId === 'c-north'));
    const none = fixtureAccountPage({ isStaff: true, clientId: null, orgId: 'c-north' });
    assert.equal(none.contacts.length, 0);
    assert.equal(staff.preview && !staff.live, true);
  });
});

describe('projects page fixture adapters', () => {
  it('hides unpublished tasks from clients and drops archived ones', () => {
    const staff = fixtureProjectsPage({ isStaff: true, snapshot: FIXTURE_SNAPSHOT, archivedIds: [] });
    const client = fixtureProjectsPage({ isStaff: false, snapshot: FIXTURE_CLIENT_SNAPSHOT, archivedIds: [] });
    assert.ok(client.tasks.length <= staff.tasks.length);
    assert.ok(client.tasks.every((task) => task.publishToWarehaus !== false));
    const first = staff.tasks[0]!.id;
    const archived = fixtureProjectsPage({ isStaff: true, snapshot: FIXTURE_SNAPSHOT, archivedIds: [first] });
    assert.equal(archived.tasks.some((task) => task.id === first), false);
  });

  it('reads task dialog review screens and applies the contact assignee', () => {
    const review = parseTaskReview('?confirm=archive&menu=due&fieldError=bogus&assignee=contact');
    assert.equal(review.archive, true);
    assert.equal(review.menu, 'due');
    assert.equal(review.fieldError, null);
    const page = fixtureProjectsPage({ isStaff: true, snapshot: FIXTURE_SNAPSHOT, archivedIds: [] });
    const task = page.tasks[0]!;
    const data = fixtureProjectTask({ taskId: task.id, tasks: page.tasks, staff: true, resources: page.resources, review });
    assert.equal(data.task?.assigneeName, 'Maya Chen');
    assert.ok(data.attached.every((resource) => resource.projectId === task.projectId));
    const client = fixtureProjectTask({ taskId: task.id, tasks: page.tasks, staff: false, resources: page.resources, review });
    assert.equal(client.attached.length, 0);
  });
});
