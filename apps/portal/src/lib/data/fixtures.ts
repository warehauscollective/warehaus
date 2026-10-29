import { isStudioProjectName, withoutClientLeaks } from '@/lib/data/clientDetail';
import type { PortalSnapshot } from '@/lib/data/view-models';
import { FIXTURE_CLIENT_SESSION, FIXTURE_SESSION } from '@/lib/data/portalFixtures';
import {
  buildActivityFeed,
  isClientVisibleFeedItem,
  type FeedActivity,
  type FeedProject,
} from '@convex/_lib/activityFeed';

const SYNCED_AT = Date.parse('2026-10-05T15:00:00Z');

function fixtureFeedProject(projectId: string | null): FeedProject | undefined {
  if (!projectId) return undefined;
  const project = FIXTURE_PROJECTS.find((row) => row.id === projectId);
  if (!project) return undefined;
  return {
    _id: project.id,
    name: project.name,
    type: project.internal ? ['Internal'] : [],
    publishToWarehaus: project.publishToWarehaus,
    archive: false,
    syncHiddenAt: project.syncHidden ? 1 : undefined,
    notionPageId: project.notionPageId,
  };
}

function fixtureClientVisible(row: { type: string; projectId: string | null }): boolean {
  return isClientVisibleFeedItem({
    source: 'activity',
    type: row.type,
    project: fixtureFeedProject(row.projectId),
    task: undefined,
    orgVisible: true,
  });
}

export const FIXTURE_CLIENTS = [
  {
    id: 'c-north',
    name: 'Northwind',
    slug: 'northwind',
    status: 'Active',
    portalAccess: 'Enabled' as const,
    projectCount: 2,
    openTaskCount: 4,
    resourceCount: 2,
    uploadNeedsReview: 0,
    lastActivityAt: SYNCED_AT,
    contactCount: 2,
    syncHidden: false,
    notionPageId: 'notion-client-north',
    lastSyncedAt: SYNCED_AT,
    internal: false,
  },
  {
    id: 'c-warehaus',
    name: 'Warehaus',
    slug: 'warehaus-internal',
    status: 'Active',
    portalAccess: 'Enabled' as const,
    projectCount: 1,
    openTaskCount: 1,
    resourceCount: 0,
    uploadNeedsReview: 0,
    lastActivityAt: SYNCED_AT,
    contactCount: 1,
    syncHidden: false,
    notionPageId: 'notion-client-warehaus',
    lastSyncedAt: SYNCED_AT,
    internal: true,
  },
  {
    id: 'c-hidden',
    name: 'Gate Off Co',
    slug: 'gate-off',
    status: 'Paused',
    portalAccess: 'Disabled' as const,
    projectCount: 0,
    openTaskCount: 0,
    resourceCount: 0,
    uploadNeedsReview: 0,
    lastActivityAt: null,
    contactCount: 0,
    syncHidden: true,
    notionPageId: 'notion-client-hidden',
    lastSyncedAt: SYNCED_AT,
    internal: false,
  },
];

export const FIXTURE_PROJECTS = [
  {
    id: 'p-site',
    orgId: 'c-north',
    name: 'Northwind site',
    description: 'Marketing site',
    status: 'In Progress',
    progress: 0.4,
    startDate: '2026-09-01',
    endDate: '2026-11-20',
    liveUrl: null,
    figmaLink: null,
    docsUrl: null,
    stack: ['Next.js'],
    clientName: 'Northwind',
    clientSlug: 'northwind',
    publishToWarehaus: true,
    internal: false,
    notionPageId: 'notion-project-site',
    lastSyncedAt: SYNCED_AT,
    syncHidden: false,
    taskCount: 5,
  },
  {
    id: 'p-shipped',
    orgId: 'c-north',
    name: 'Northwind brand',
    description: 'Shipped identity',
    status: 'Shipped',
    progress: 1,
    startDate: '2026-01-04',
    endDate: '2026-03-01',
    liveUrl: null,
    figmaLink: null,
    docsUrl: null,
    stack: [],
    clientName: 'Northwind',
    clientSlug: 'northwind',
    publishToWarehaus: false,
    internal: false,
    notionPageId: 'notion-project-brand',
    lastSyncedAt: SYNCED_AT,
    syncHidden: false,
    taskCount: 1,
  },
  {
    id: 'p-internal',
    orgId: 'c-warehaus',
    name: 'warehaus.studio',
    description: 'Internal',
    status: 'In Progress',
    progress: 0.2,
    startDate: null,
    endDate: null,
    liveUrl: null,
    figmaLink: null,
    docsUrl: null,
    stack: [],
    clientName: 'Warehaus',
    clientSlug: 'warehaus-internal',
    publishToWarehaus: true,
    internal: true,
    notionPageId: 'notion-project-ops',
    lastSyncedAt: SYNCED_AT,
    syncHidden: false,
    taskCount: 1,
  },
];

export const FIXTURE_TASKS = [
  task('t-inbox', 'p-site', 'Capture homepage notes', 'Inbox', false, { category: 'Design' }),
  task('t-todo', 'p-site', 'Write the launch checklist', 'To Do', false, { stage: 'Awaiting Go', category: 'Design' }),
  task('t-blocked', 'p-site', 'Waiting on photography', 'Blocked', false, { stage: 'Building', category: 'Design' }),
  task('t-doing', 'p-site', 'Build the project page', 'In Progress', false, {
    stage: 'Building',
    assigneeName: 'Alex Bauer',
    resourceCount: 3,
    category: 'Design',
  }),
  task('t-sub', 'p-site', 'Check the type scale', 'To Do', false, { stage: 'Building', parentTaskId: 't-doing', category: 'Design' }),
  task('t-done', 'p-site', 'Approve the type ramp', 'Done', true, { category: 'Design' }),
  task('t-hidden', 'p-site', 'Row the pull hid', 'To Do', false, { syncHidden: true, category: 'Design' }),
  task('t-local', 'p-site', 'Not confirmed yet', 'To Do', false, { notionPageId: 'portal:task:local', category: 'Design' }),
  task('t-planning', 'p-site', 'Stage is not a status', 'Planning', false, { category: 'Design' }),
  task('t-shipped', 'p-shipped', 'Archive the old deck', 'Done', true, { category: 'Design' }),
  task('t-internal', 'p-internal', 'Internal ops task', 'Inbox', false),
];

export const FIXTURE_RESOURCES = [
  {
    id: 'r-notes',
    orgId: 'c-north',
    projectId: 'p-site',
    projectName: 'Northwind site',
    clientName: 'Northwind',
    name: 'Kickoff recap',
    description: 'Decisions from the kickoff.',
    type: 'Meeting notes',
    url: 'https://example.com/recap',
    hasFile: false,
    mimeType: null,
    byteSize: null,
    externalId: 'wh_res_notes',
    lastSyncedAt: SYNCED_AT,
    updatedAt: Date.parse('2026-09-29T00:00:00Z'),
    attachedCount: 2,
    publishToWarehaus: true,
    notionPageId: 'notion-resource-notes',
    syncHidden: false,
  },
  {
    id: 'r-file',
    orgId: 'c-north',
    projectId: 'p-site',
    projectName: 'Northwind site',
    clientName: 'Northwind',
    name: 'Logo pack',
    description: 'SVG and PDF.',
    type: 'File',
    url: 'https://example.com/logo.zip',
    hasFile: true,
    mimeType: 'application/zip',
    byteSize: 240_000,
    externalId: 'wh_res_logo',
    lastSyncedAt: SYNCED_AT,
    updatedAt: Date.parse('2026-10-02T00:00:00Z'),
    attachedCount: 1,
    publishToWarehaus: false,
    notionPageId: 'notion-resource-logo',
    syncHidden: false,
  },
  {
    id: 'r-draft-recap',
    orgId: 'c-north',
    projectId: 'p-site',
    projectName: 'Northwind site',
    clientName: 'Northwind',
    name: 'Workshop recap',
    description: 'Unpublished notes from the workshop.',
    type: 'Meeting notes',
    url: null,
    hasFile: false,
    mimeType: null,
    byteSize: null,
    externalId: 'wh_res_workshop',
    lastSyncedAt: SYNCED_AT,
    updatedAt: Date.parse('2026-09-29T00:00:00Z'),
    attachedCount: 1,
    publishToWarehaus: false,
    notionPageId: 'notion-resource-workshop',
    syncHidden: false,
  },
];

export const FIXTURE_DOCS = [
  {
    id: 'd-brief',
    orgId: 'c-north',
    projectId: 'p-site',
    title: 'Project brief',
    summary: 'Goals, audience, and how we will know the site is working.',
    docType: 'Brief',
    order: 1,
    status: 'Published',
    publishToWarehaus: true,
    notionPageId: 'notion-doc-brief',
    lastSyncedAt: Date.parse('2026-10-24T12:00:00Z'),
    updatedAt: Date.parse('2026-10-24T12:00:00Z'),
    syncHidden: false,
    syncState: 'synced' as const,
  },
  {
    id: 'd-scope',
    orgId: 'c-north',
    projectId: 'p-site',
    title: 'Scope of work',
    summary: 'What is included, what is parked, and how changes get approved.',
    docType: 'Scope',
    order: 2,
    status: 'Published',
    publishToWarehaus: true,
    notionPageId: 'notion-doc-scope',
    lastSyncedAt: Date.parse('2026-10-21T12:00:00Z'),
    updatedAt: Date.parse('2026-10-21T12:00:00Z'),
    syncHidden: false,
    syncState: 'synced' as const,
  },
  {
    id: 'd-guide',
    orgId: 'c-north',
    projectId: 'p-site',
    title: 'Client onboarding guide',
    summary: 'How to sign in, follow your tasks and leave feedback on each stage.',
    docType: 'Guide',
    order: 3,
    status: 'Draft',
    publishToWarehaus: false,
    notionPageId: 'notion-doc-guide',
    lastSyncedAt: Date.parse('2026-10-27T12:00:00Z'),
    updatedAt: Date.parse('2026-10-27T12:00:00Z'),
    syncHidden: false,
    syncState: 'synced' as const,
  },
  {
    id: 'd-contract',
    orgId: 'c-north',
    projectId: 'p-site',
    title: 'Services agreement',
    summary: 'Signed agreement covering fees, timelines and ownership of the work.',
    docType: 'Contract',
    order: 4,
    status: 'Draft',
    publishToWarehaus: false,
    notionPageId: 'notion-doc-contract',
    lastSyncedAt: Date.parse('2026-10-12T12:00:00Z'),
    updatedAt: Date.parse('2026-10-12T12:00:00Z'),
    syncHidden: false,
    syncState: 'synced' as const,
  },
  {
    id: 'd-draft',
    orgId: 'c-north',
    projectId: null,
    title: 'Account notes',
    summary: 'Draft for the client record.',
    docType: 'Note',
    order: 5,
    status: 'Draft',
    publishToWarehaus: false,
    notionPageId: 'notion-doc-notes',
    lastSyncedAt: SYNCED_AT,
    updatedAt: SYNCED_AT,
    syncHidden: false,
  },
];

export const FIXTURE_CONTACTS = [
  {
    id: 'ct-maya',
    orgId: 'c-north',
    name: 'Maya Chen',
    email: 'maya@warehaus.co',
    role: 'Warehaus Staff' as const,
    portalAccess: 'Enabled' as const,
    notionPageId: 'notion-contact-maya',
    lastSyncedAt: SYNCED_AT,
    syncHidden: false,
  },
  {
    id: 'ct-ada',
    orgId: 'c-north',
    name: 'Ada North',
    email: 'ada@northwind.example',
    role: 'Client Admin',
    portalAccess: 'Enabled' as const,
    notionPageId: 'notion-contact-ada',
    lastSyncedAt: SYNCED_AT,
    syncHidden: false,
  },
  {
    id: 'ct-sam',
    orgId: 'c-north',
    name: 'Sam North',
    email: 'sam@northwind.example',
    role: 'Client Member',
    portalAccess: 'Disabled' as const,
    invitePending: true,
    notionPageId: 'notion-contact-sam',
    lastSyncedAt: SYNCED_AT,
    syncHidden: false,
  },
];

export const FIXTURE_SNAPSHOT: PortalSnapshot = {
  clients: FIXTURE_CLIENTS.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
  projects: FIXTURE_PROJECTS.filter((p) => p.publishToWarehaus && !p.internal).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    status: p.status,
    progress: p.progress,
    startDate: p.startDate,
    endDate: p.endDate,
    liveUrl: p.liveUrl,
    figmaLink: p.figmaLink,
    docsUrl: p.docsUrl,
    stack: p.stack,
    notionPageId: p.notionPageId,
    lastSyncedAt: p.lastSyncedAt,
    publishToWarehaus: p.publishToWarehaus,
    clientName: p.clientName,
    orgId: p.orgId,
    taskCount: p.taskCount,
  })),
  tasks: FIXTURE_TASKS.filter((t) => t.publishToWarehaus && !t.syncHidden && t.projectId === 'p-site').map(
    (t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      isDone: t.isDone,
      date: t.date,
      projectId: t.projectId,
      projectName: t.projectName,
      projectStatus: 'In Progress',
      projectEndDate: '2026-11-20',
      notionPageId: t.notionPageId,
      lastSyncedAt: t.lastSyncedAt,
      publishToWarehaus: true,
      stage: t.stage,
      parentTaskId: t.parentTaskId,
      assigneeName: t.assigneeName,
      resourceCount: t.resourceCount,
    }),
  ),
  activity: [
    {
      id: 'a-1',
      name: 'Task moved',
      type: 'task',
      summary: 'Build the project page is in progress',
      timestamp: new Date(SYNCED_AT).toISOString(),
      tone: 'accent',
      projectId: 'p-site',
      taskId: 't-doing',
      clientVisible: fixtureClientVisible({ type: 'task', projectId: 'p-site' }),
    },
    {
      id: 'a-2',
      name: 'Pull finished',
      type: 'sync',
      summary: 'Notion pull completed',
      timestamp: new Date(SYNCED_AT - 60_000).toISOString(),
      tone: 'success',
      projectId: null,
      clientVisible: fixtureClientVisible({ type: 'sync', projectId: null }),
    },
  ],
  syncMeta: {
    lastSyncedAt: new Date(SYNCED_AT).toISOString(),
    lastError: null,
    mode: 'convex',
  },
  tenant: {
    mode: 'team',
    slug: FIXTURE_SESSION.orgSlug,
    clientExternalId: 'c-warehaus',
    clientName: 'Warehaus',
    ok: true,
  },
};

/** Tasks linked to a shared resource in the fixture preview. Not a second database. */
export const FIXTURE_TASK_RESOURCES = [
  { resourceId: 'r-notes', taskId: 't-todo' },
  { resourceId: 'r-notes', taskId: 't-doing' },
  { resourceId: 'r-file', taskId: 't-inbox' },
  { resourceId: 'r-notes', taskId: 't-internal' },
];

export const FIXTURE_CLIENT_SNAPSHOT: PortalSnapshot = {
  ...FIXTURE_SNAPSHOT,
  clients: FIXTURE_SNAPSHOT.clients.filter(
    (client) => client.slug === 'northwind' && !client.name.startsWith('Warehaus'),
  ),
  projects: FIXTURE_SNAPSHOT.projects
    .filter((project) => !project.internal && !isStudioProjectName(project.name))
    .map((project) => withoutClientLeaks(project)),
  tasks: FIXTURE_SNAPSHOT.tasks
    .filter((task) => task.projectId !== 'p-internal' && task.publishToWarehaus !== false && !task.syncHidden)
    .map((task) => withoutClientLeaks(task)),
  syncMeta: { lastSyncedAt: null, lastError: null, mode: 'convex' },
  activity: FIXTURE_SNAPSHOT.activity
    .filter((item) => fixtureClientVisible({ type: item.type, projectId: item.projectId }))
    .map((item) => {
      const rest = { ...item };
      delete rest.clientVisible;
      return rest;
    }),
  leadName: 'Maya Chen',
  tenant: {
    mode: 'client',
    slug: FIXTURE_CLIENT_SESSION.orgSlug,
    clientExternalId: FIXTURE_CLIENT_SESSION.orgId,
    clientName: 'Northwind',
    ok: true,
  },
};

const PAGE_HOUR = 60 * 60 * 1000;
const pageNow = Date.now();
const pageDay = Date.UTC(
  new Date(pageNow).getUTCFullYear(),
  new Date(pageNow).getUTCMonth(),
  new Date(pageNow).getUTCDate(),
);
/** Stay on today's UTC date even when the clock is only a few hours past midnight. */
function pageToday(slot: number): number {
  const elapsed = Math.max(pageNow - pageDay, 15 * 60 * 1000);
  const fraction = slot <= 2 ? 0.2 : slot === 4 ? 0.45 : 0.75;
  const lookback = Math.min(Math.max(Math.round(elapsed * fraction), 60 * 1000), elapsed - 30 * 1000);
  return pageNow - lookback;
}

/** Activity page preview. Built by the shared feed so publish marks match the client list. */
const PAGE_ACTIVITY_CONTACTS = [
  { name: 'Maya Chen' },
  { name: 'Sam Lee' },
  { name: 'Dana Okafor' },
];

const PAGE_ACTIVITY: FeedActivity[] = [
  {
    _id: 'act-wire',
    name: 'Homepage wireframes moved to Awaiting Go',
    summary: 'Maya Chen · Northwind · Source: Notion',
    type: 'project',
    timestamp: pageToday(2),
    projectId: 'p-site',
  },
  {
    _id: 'act-recap',
    name: 'Recap drafted: Kickoff call',
    summary: 'Meeting notes · Northwind site',
    type: 'resource',
    timestamp: pageToday(4),
    projectId: 'p-site',
  },
  {
    _id: 'act-sync',
    name: 'Sync retry queued for Lumen Dental',
    summary: 'System · 1 write to Notion failed',
    type: 'sync',
    timestamp: pageToday(5),
    projectId: 'p-site',
  },
  {
    _id: 'act-brand',
    name: 'Brand guidelines v2 shipped',
    summary: 'Sam Lee · Northwind site',
    type: 'project',
    tone: 'resource',
    timestamp: pageDay - 12 * PAGE_HOUR,
    projectId: 'p-site',
  },
  {
    _id: 'act-intake',
    name: 'Intake form copy added',
    summary: 'Priya Shah · Northwind site · Source: portal',
    type: 'task',
    timestamp: pageDay - 36 * PAGE_HOUR,
    projectId: 'p-site',
  },
  {
    _id: 'act-checklist',
    name: 'Warehaus: intake checklist updated',
    summary: 'Peter · internal',
    type: 'project',
    timestamp: pageDay - 40 * PAGE_HOUR,
    projectId: 'p-internal',
  },
  {
    _id: 'act-review',
    name: 'Wireframe review recap published',
    summary: 'Maya Chen · Northwind',
    type: 'resource',
    timestamp: pageDay - 60 * PAGE_HOUR,
    projectId: 'p-site',
  },
  {
    _id: 'act-invite',
    name: 'Jordan Rivera invited to Northwind',
    summary: 'Dana Okafor · invite pending',
    type: 'project',
    tone: 'people',
    timestamp: pageDay - 48 * PAGE_HOUR,
    projectId: 'p-site',
  },
];

function pageActivity(audience: 'staff' | 'client') {
  const projects = ['p-site', 'p-internal']
    .map((id) => fixtureFeedProject(id))
    .filter((project): project is FeedProject => project != null);
  return buildActivityFeed({
    audience,
    orgVisible: true,
    activity: PAGE_ACTIVITY,
    audits: [],
    outbox: [],
    projects,
    tasks: [],
    contacts: PAGE_ACTIVITY_CONTACTS,
  }).map((item) => ({
    id: item.id,
    name: item.name,
    type: item.type,
    summary: item.summary,
    timestamp: item.timestamp,
    tone: item.tone,
    projectId: item.projectId,
    taskId: item.taskId,
    ...(item.lane ? { lane: item.lane } : {}),
    ...(audience === 'staff' ? { clientVisible: item.clientVisible === true } : {}),
  }));
}

export const FIXTURE_STAFF_ACTIVITY_PAGE = pageActivity('staff');
export const FIXTURE_CLIENT_ACTIVITY_PAGE = pageActivity('client');

export const FIXTURE_NOTICES = [
  {
    id: 'notice-raw-key',
    message: 'task-stage:notion-t-doing:Building::2026-10-28T00:00:00.000Z',
    createdAt: SYNCED_AT,
    readAt: null,
    edgeCase: 'sync',
    unread: true,
  },
  {
    id: 'notice-conflict',
    message: 'Homepage conflicted with a newer edit',
    createdAt: SYNCED_AT,
    readAt: null,
    edgeCase: 'conflict',
    unread: true,
  },
  {
    id: 'notice-stage',
    message: 'Homepage: Stage "Brainstorm" is not a portal stage',
    createdAt: SYNCED_AT - 60_000,
    readAt: null,
    edgeCase: 'unknown-stage:page-1',
    unread: true,
  },
  {
    id: 'notice-invite',
    message: 'Invite email already belongs to another client',
    createdAt: SYNCED_AT - 120_000,
    readAt: null,
    edgeCase: 'invite-state',
    unread: true,
  },
];

function task(
  id: string,
  projectId: string,
  name: string,
  status: string,
  isDone: boolean,
  extra: {
    syncHidden?: boolean;
    notionPageId?: string;
    stage?: string | null;
    parentTaskId?: string;
    assigneeName?: string;
    resourceCount?: number;
    category?: string | null;
  } = {},
) {
  const project = FIXTURE_PROJECTS.find((p) => p.id === projectId);
  return {
    id,
    orgId: project?.orgId ?? 'c-north',
    projectId,
    projectName: project?.name ?? null,
    projectStatus: project?.status ?? null,
    projectEndDate: project?.endDate ?? null,
    name,
    status,
    isDone,
    stage: extra.stage ?? null,
    parentTaskId: extra.parentTaskId,
    assigneeName: extra.assigneeName,
    resourceCount: extra.resourceCount,
    category: extra.category ?? null,
    date: '2026-10-20',
    publishToWarehaus: true,
    estimate: null,
    priority: null,
    source: 'notion',
    notionPageId: extra.notionPageId ?? `notion-${id}`,
    lastSyncedAt: SYNCED_AT,
    syncHidden: extra.syncHidden ?? false,
  };
}
