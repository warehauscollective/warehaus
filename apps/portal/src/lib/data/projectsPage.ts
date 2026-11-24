'use client';

/**
 * Projects page data. One interface, two adapters:
 *
 * - live: the snapshot, staff cross-org reads, the client directory, client
 *   docs, and the open task's subtasks and attached resources
 * - fixture: the Northwind fixtures, plus the task dialog's design-review
 *   screens (`?stageConfirm=`, `?confirm=`, `?menu=`, `?fieldError=`,
 *   `?sourceError=`, `?assignee=`)
 *
 * The page picks neither for its rows. `useProjectsPage` reads the fixture flag
 * once. `preview` stays on the result because the list screens (`?list=`),
 * fixture task routing and some child panels still need it.
 */

import { useEffect, useMemo, useState } from 'react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import type { DocRow } from '@/components/docs/DocsBlock';
import { useFixturePreview } from '@/components/providers/FixturePreviewProvider';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { useStaffCrossOrg } from '@/hooks/useStaffCrossOrg';
import { isConvexConfigured } from '@/lib/convex/client';
import { warehausLead } from '@/lib/data/clientDetail';
import {
  FIXTURE_CLIENTS,
  FIXTURE_CONTACTS,
  FIXTURE_DOCS,
  FIXTURE_PROJECTS,
  FIXTURE_RESOURCES,
  FIXTURE_TASKS,
} from '@/lib/data/fixtures';
import { projectsForViewer, viewerIsStaff } from '@/lib/data/portalSnapshotCache';
import { attachKnownSync, type PortalProject, type PortalSnapshot, type PortalTask } from '@/lib/data/view-models';

export type ProjectRow = PortalProject & {
  clientName?: string | null;
  internal?: boolean;
  taskCount?: number;
  publishToWarehaus?: boolean;
  /** Staff only. Absent for clients. */
  agentRepo?: string | null;
  agentDriver?: 'claude_code' | 'cursor' | null;
};

export type ResourceOption = {
  id: string;
  name: string;
  type: string | null;
  projectId?: string | null;
  notionPageId?: string | null;
  publishToWarehaus?: boolean;
  updatedAt?: number | null;
  lastSyncedAt?: number | null;
  attachedCount?: number | null;
};

/** A client row as the project list's client filter reads it. */
export type ProjectClientRow = { id: string; name: string; projectCount?: number; internal?: boolean };

export type ProjectsPage = {
  /** Design-review preview. Never set on a live page. */
  preview: boolean;
  /** Convex reads run. Child panels that read for themselves take this. */
  live: boolean;
  /** Auth is still settling, so the viewer's tier is not known yet. */
  settling: boolean;
  isStaff: boolean;
  projects: ProjectRow[];
  tasks: PortalTask[];
  docs: DocRow[];
  clients: ProjectClientRow[];
  resources: ResourceOption[];
  loading: boolean;
  /** Staff only: the project list query failed. */
  error: string | null;
};

type Auth = {
  portalSession: { isStaff?: boolean } | null | undefined;
  sessionPending: boolean;
  joining: boolean;
  linkStatus: string;
};

type Input = {
  auth: Auth;
  hostSlug: string | undefined;
  snapshot: PortalSnapshot;
  snapshotLoading: boolean;
  /** Fixture only: tasks archived in this preview session. */
  archivedIds: readonly string[];
};

/** Fixture adapter. Pure, so tests can read it without React. */
export function fixtureProjectsPage(input: {
  isStaff: boolean;
  snapshot: Pick<PortalSnapshot, 'projects'>;
  archivedIds: readonly string[];
}): ProjectsPage {
  const { isStaff, archivedIds } = input;
  return {
    preview: true,
    live: false,
    settling: false,
    isStaff,
    projects: attachKnownSync(FIXTURE_PROJECTS as unknown as ProjectRow[], input.snapshot.projects),
    tasks: FIXTURE_TASKS.filter(
      (task) => (isStaff || (task.publishToWarehaus && !task.syncHidden)) && !archivedIds.includes(task.id),
    ) as unknown as PortalTask[],
    docs: FIXTURE_DOCS as unknown as DocRow[],
    clients: FIXTURE_CLIENTS,
    resources: FIXTURE_RESOURCES as unknown as ResourceOption[],
    loading: false,
    error: null,
  };
}

function useLiveProjectsPage(enabled: boolean, input: Input, isStaff: boolean, settling: boolean): ProjectsPage {
  const { hostSlug, snapshot, snapshotLoading } = input;
  const on = enabled && isConvexConfigured();
  const staff = useStaffCrossOrg(on && isStaff, hostSlug);
  const directory = useSafeQuery<ProjectClientRow[]>(api.clients.listDirectory, on && isStaff ? { hostSlug } : 'skip');
  const clientDocs = useSafeQuery<DocRow[]>(
    api.clientDocs.listForClient,
    on && !isStaff && snapshot.tenant.ok ? { hostSlug } : 'skip',
  );
  const projects = useMemo(
    () =>
      attachKnownSync(
        projectsForViewer({ isStaff, staffProjects: staff.projects, clientProjects: snapshot.projects }) as ProjectRow[],
        snapshot.projects,
      ),
    [isStaff, staff.projects, snapshot.projects],
  );
  return {
    preview: false,
    live: on && !settling,
    settling,
    isStaff,
    projects,
    tasks: (isStaff ? staff.tasks ?? snapshot.tasks : snapshot.tasks) as PortalTask[],
    docs: (isStaff ? staff.docs ?? [] : clientDocs.data ?? []) as DocRow[],
    clients: directory.data ?? [],
    resources: (staff.resources ?? []) as ResourceOption[],
    loading: settling || (isStaff ? staff.projectsLoading : snapshotLoading),
    error: isStaff ? staff.projectsError ?? null : null,
  };
}

/** The page's one data seam. Fixture mode is read here and nowhere else on the page. */
export function useProjectsPage(input: Input): ProjectsPage {
  const fixtures = useFixturePreview();
  const { portalSession, sessionPending, joining, linkStatus } = input.auth;
  const settling = !fixtures && (sessionPending || joining || linkStatus === 'loading');
  const isStaff = viewerIsStaff(portalSession, settling);
  const live = useLiveProjectsPage(!fixtures, input, isStaff, settling);
  const fixturePage = useMemo(
    () => (fixtures ? fixtureProjectsPage({ isStaff, snapshot: input.snapshot, archivedIds: input.archivedIds }) : null),
    [fixtures, isStaff, input.snapshot, input.archivedIds],
  );
  return fixturePage ?? live;
}

/** Warehaus lead for the open project. Clients read it from their snapshot. */
export function useProjectLead(
  page: ProjectsPage,
  orgId: string | undefined,
  snapshot: Pick<PortalSnapshot, 'leadName'>,
  hostSlug: string | undefined,
): string | null {
  const people = useSafeQuery<Array<{ name: string; role?: string | null }>>(
    api.contacts.listForOrg,
    page.live && page.isStaff && orgId ? { orgId: orgId as Id<'clients'>, hostSlug } : 'skip',
  );
  if (!page.isStaff) return snapshot.leadName ?? null;
  if (page.preview) return warehausLead(FIXTURE_CONTACTS.filter((contact) => contact.orgId === orgId));
  return warehausLead(people.data ?? []);
}

type TaskMenu = 'assignee' | 'due' | 'project' | 'add-source';
type TaskField = 'assignee' | 'due' | 'project';

/** Design-review screens for the task dialog. All null on a live page. */
export type TaskReview = {
  stageConfirm: string | null;
  archive: boolean;
  menu: TaskMenu | null;
  fieldError: TaskField | null;
  sourceError: string | null;
  assignee: 'contact' | null;
};

const NO_REVIEW: TaskReview = {
  stageConfirm: null,
  archive: false,
  menu: null,
  fieldError: null,
  sourceError: null,
  assignee: null,
};

export function parseTaskReview(search: string): TaskReview {
  const params = new URLSearchParams(search);
  const menu = params.get('menu');
  const field = params.get('fieldError');
  return {
    stageConfirm: params.get('stageConfirm'),
    archive: params.get('confirm') === 'archive',
    menu: menu === 'assignee' || menu === 'due' || menu === 'project' || menu === 'add-source' ? menu : null,
    fieldError: field === 'assignee' || field === 'due' || field === 'project' ? field : null,
    sourceError: params.get('sourceError'),
    assignee: params.get('assignee') === 'contact' ? 'contact' : null,
  };
}

export type ProjectTaskData = {
  task: PortalTask | null;
  subtasks: PortalTask[];
  attached: ResourceOption[];
  /** Fixture only: staff the assignee menu offers. Live menus read their own. */
  people: Array<{ id: string; name: string }>;
  /** Fixture only: projects the move menu offers. Live menus read their own. */
  projects: Array<{ id: string; name: string }>;
  review: TaskReview;
};

/** Fixture task dialog data. Pure, so tests can read it without React. */
export function fixtureProjectTask(input: {
  taskId: string;
  tasks: readonly PortalTask[];
  staff: boolean;
  resources: readonly ResourceOption[];
  review: TaskReview;
}): ProjectTaskData {
  const { taskId, tasks, staff, resources, review } = input;
  const found = tasks.find((item) => item.id === taskId) ?? null;
  const task = found && review.assignee === 'contact' ? { ...found, assigneeContactId: 'ct-maya', assigneeName: 'Maya Chen' } : found;
  return {
    task,
    subtasks: staff ? tasks.filter((item) => item.parentTaskId === taskId) : [],
    attached:
      staff && task
        ? resources.filter((resource) => resource.projectId === task.projectId)
        : [],
    people: task
      ? FIXTURE_CONTACTS.filter(
          (contact) => contact.orgId === task.orgId && contact.role === 'Warehaus Staff' && contact.portalAccess === 'Enabled',
        ).map((contact) => ({ id: contact.id, name: contact.name }))
      : [],
    projects: task
      ? FIXTURE_PROJECTS.filter((project) => project.orgId === task.orgId && !project.internal && !project.syncHidden).map(
          (project) => ({ id: project.id, name: project.name }),
        )
      : [],
    review,
  };
}

/** The task dialog's one data seam on the Projects page. */
export function useProjectTask(input: {
  page: Pick<ProjectsPage, 'preview'>;
  taskId: string;
  tasks: PortalTask[];
  staff: boolean;
  hostSlug: string | undefined;
  resources: ResourceOption[];
}): ProjectTaskData {
  const { page, taskId, tasks, staff, hostSlug, resources } = input;
  const found = tasks.find((item) => item.id === taskId) ?? null;
  const taskKey = !page.preview && found ? (found.id as Id<'tasks'>) : null;
  const clientSubs = useSafeQuery<PortalTask[]>(
    api.tasks.listSubtasksForClient,
    taskKey && !staff ? { hostSlug, taskId: taskKey } : 'skip',
  );
  const staffAttached = useSafeQuery<ResourceOption[]>(
    api.sharedResources.listAttachedForStaff,
    taskKey && staff ? { hostSlug, taskId: taskKey } : 'skip',
  );
  const clientAttached = useSafeQuery<ResourceOption[]>(
    api.sharedResources.listAttachedForClient,
    taskKey && !staff ? { hostSlug, taskId: taskKey } : 'skip',
  );
  const [review, setReview] = useState<TaskReview>(NO_REVIEW);
  useEffect(() => {
    if (!page.preview) return;
    setReview(parseTaskReview(window.location.search));
  }, [page.preview]);

  if (page.preview) return fixtureProjectTask({ taskId, tasks, staff, resources, review });
  return {
    task: found,
    subtasks: staff
      ? tasks.filter((item) => item.parentTaskId === taskId)
      : (clientSubs.data ?? []).filter((item) => item.publishToWarehaus !== false),
    attached: staff ? staffAttached.data ?? [] : clientAttached.data ?? [],
    people: [],
    projects: [],
    review: NO_REVIEW,
  };
}
