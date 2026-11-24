'use client';

/**
 * Resources page data. One interface, two adapters:
 *
 * - live: Convex queries (staff roster or the client's own lists)
 * - fixture: the Northwind fixtures, for preview and design review
 *
 * The page picks neither. `useResourcesPage` reads the fixture flag once and
 * returns one shape, so the page carries no fixture branches. Row types come
 * from the Convex return types, and the fixtures must satisfy them, so a
 * server shape change that the fixtures miss fails `tsc`.
 */

import { useMutation } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useState } from 'react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { clientMayOpenGranolaRecap } from '@warehaus/portal-sync';
import type { ResourceTaskRow } from '@/components/resources/ResourceDetail';
import { useFixturePreview } from '@/components/providers/FixturePreviewProvider';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { useStaffCrossOrg } from '@/hooks/useStaffCrossOrg';
import { isConvexConfigured } from '@/lib/convex/client';
import { isStudioProjectName, withoutClientLeaks } from '@/lib/data/clientDetail';
import { FIXTURE_DOCS, FIXTURE_PROJECTS, FIXTURE_RESOURCES, FIXTURE_TASKS, FIXTURE_TASK_RESOURCES } from '@/lib/data/fixtures';
import { resourceAttachmentMeta, resourceSourceLabel } from '@/lib/data/resourceList';
import { staffRosterQueriesDeployed } from '@/lib/data/staffRoster';

type StaffResource = FunctionReturnType<typeof api.sharedResources.listForStaff>[number];
type ClientResource = FunctionReturnType<typeof api.sharedResources.listForClient>[number];
type StaffDoc = FunctionReturnType<typeof api.clientDocs.listForStaff>[number];
type ClientDoc = FunctionReturnType<typeof api.clientDocs.listForClient>[number];

/** A resource row as the page reads it. Staff rows carry the staff-only fields. */
export type ResourceRow = ClientResource & Partial<Omit<StaffResource, keyof ClientResource>> & { attachedCount?: number };
export type DocRow = ClientDoc & Partial<Omit<StaffDoc, keyof ClientDoc>>;

// Fixture drift guard: the fixtures must keep the staff server shape.
FIXTURE_RESOURCES satisfies readonly (StaffResource & { attachedCount?: number })[];
FIXTURE_DOCS satisfies readonly StaffDoc[];

export type ResourcesPage = {
  rows: ResourceRow[];
  docs: DocRow[];
  /** The resource list has not arrived yet. */
  loading: boolean;
  /** Staff only: the roster query failed. */
  error: string | null;
  docsPending: boolean;
  /** Staff only: the last Granola import failed. */
  importFailed: boolean;
  retryImport: () => void;
  retrying: boolean;
  /** Tasks that use a resource. Live reads cover only the open resource. */
  tasksFor: (resourceId: string) => { data: ResourceTaskRow[]; loading: boolean };
  attachmentCount: (row: ResourceRow) => number | undefined;
  attachmentCopy: (row: ResourceRow) => string;
};

type Input = {
  isStaff: boolean;
  hostSlug: string | undefined;
  tenantOk: boolean;
  openResourceId: string | null;
};

export function clientMayOpenResource(row: ResourceRow): boolean {
  if (row.publishToWarehaus === false || row.syncHidden) return false;
  if (isStudioProjectName(row.projectName)) return false;
  return clientMayOpenGranolaRecap({
    notionPageId: row.notionPageId,
    source: (row as { source?: string | null }).source,
    publishToWarehaus: row.publishToWarehaus,
    description: row.description,
  });
}

function forViewer(rows: readonly ResourceRow[], isStaff: boolean): ResourceRow[] {
  if (isStaff) return [...rows];
  return rows.filter(clientMayOpenResource).map((row) => withoutClientLeaks(row));
}

function liveCopy(row: ResourceRow): string {
  const source = resourceSourceLabel(row.type);
  const count = typeof row.attachedCount === 'number' ? row.attachedCount : 0;
  if (row.projectName) return resourceAttachmentMeta(source, row.projectName, Math.max(0, count - 1));
  return source;
}

/** Fixture tasks linked to a resource, filtered the way a client would see them. */
export function fixtureTasksFor(resourceId: string, staff: boolean): ResourceTaskRow[] {
  const ids = new Set(
    FIXTURE_TASK_RESOURCES.filter((link) => link.resourceId === resourceId).map((link) => link.taskId),
  );
  return FIXTURE_TASKS.filter((task) => ids.has(task.id)).flatMap((task) => {
    const project = FIXTURE_PROJECTS.find((item) => item.id === task.projectId);
    if (!staff) {
      if (task.syncHidden || task.publishToWarehaus === false) return [];
      if (!project || project.internal || project.publishToWarehaus === false || isStudioProjectName(project.name)) {
        return [];
      }
    }
    const row: ResourceTaskRow = {
      id: task.id,
      name: task.name,
      status: task.status,
      isDone: task.isDone,
      stage: task.stage,
      category: task.category,
      projectName: project?.name ?? task.projectName,
      projectInternal: Boolean(project?.internal || isStudioProjectName(project?.name)),
      date: task.date,
      ...(staff ? { publishToWarehaus: task.publishToWarehaus } : {}),
    };
    return [staff ? row : withoutClientLeaks(row)];
  });
}

/** Fixture adapter. Pure, so tests can read it without React. */
export function fixtureResourcesPage(isStaff: boolean): ResourcesPage {
  return {
    rows: forViewer(FIXTURE_RESOURCES, isStaff),
    docs: [...FIXTURE_DOCS],
    loading: false,
    error: null,
    docsPending: false,
    importFailed: false,
    retryImport: () => {},
    retrying: false,
    tasksFor: (resourceId) => ({ data: fixtureTasksFor(resourceId, isStaff), loading: false }),
    attachmentCount: (row) => {
      const linked = fixtureTasksFor(row.id, isStaff).length;
      if (!isStaff) return linked;
      return Math.max(linked, row.attachedCount ?? 0);
    },
    attachmentCopy: (row) => {
      const tasks = fixtureTasksFor(row.id, isStaff);
      if (tasks.length > 0) return resourceAttachmentMeta(resourceSourceLabel(row.type), tasks[0]?.name, tasks.length - 1);
      return liveCopy(row);
    },
  };
}

function useLiveResourcesPage(input: Input & { enabled: boolean }): ResourcesPage {
  const { enabled, isStaff, hostSlug, tenantOk, openResourceId } = input;
  const on = enabled && isConvexConfigured();
  const staffArgs = on && isStaff && tenantOk ? { hostSlug } : 'skip';
  const clientArgs = on && !isStaff && tenantOk ? { hostSlug } : 'skip';
  const resourceArgs = openResourceId ? { hostSlug, resourceId: openResourceId as Id<'sharedResources'> } : null;

  const staff = useStaffCrossOrg(on && isStaff, hostSlug);
  const clientRows = useSafeQuery<ResourceRow[]>(api.sharedResources.listForClient, clientArgs);
  const clientDocs = useSafeQuery<DocRow[]>(api.clientDocs.listForClient, clientArgs);
  const liveSync = useSafeQuery<{ granola?: { lastError: string | null } }>(api.portalData.getSyncHealth, staffArgs);
  const staffUsed = useSafeQuery<ResourceTaskRow[]>(
    api.sharedResources.usedInTasks,
    on && isStaff && resourceArgs ? resourceArgs : 'skip',
  );
  const clientUsed = useSafeQuery<ResourceTaskRow[]>(
    api.sharedResources.usedInTasksForClient,
    on && !isStaff && resourceArgs ? resourceArgs : 'skip',
  );
  const retry = useMutation(api.sync.granola.retryImport);
  const [retrying, setRetrying] = useState(false);

  const source = (isStaff ? staff.resources ?? [] : clientRows.data ?? []) as ResourceRow[];
  const used = isStaff ? staffUsed : clientUsed;
  return {
    rows: forViewer(source, isStaff),
    docs: (isStaff ? staff.docs ?? [] : clientDocs.data ?? []) as DocRow[],
    loading: isStaff ? staff.resourcesLoading : clientRows.loading,
    error: isStaff ? staff.resourcesError ?? null : null,
    docsPending: isStaff ? staffRosterQueriesDeployed() && staff.docs == null : clientDocs.loading,
    importFailed: isStaff && Boolean(liveSync.data?.granola?.lastError),
    retryImport: () => {
      if (!on || retrying) return;
      setRetrying(true);
      void retry({ hostSlug }).finally(() => setRetrying(false));
    },
    retrying,
    tasksFor: (resourceId) =>
      resourceId === openResourceId ? { data: used.data ?? [], loading: used.loading } : { data: [], loading: false },
    attachmentCount: (row) => (typeof row.attachedCount === 'number' ? row.attachedCount : undefined),
    attachmentCopy: liveCopy,
  };
}

/** The page's one data seam. Fixture mode is read here and nowhere else on the page. */
export function useResourcesPage(input: Input): ResourcesPage {
  const fixtures = useFixturePreview();
  const live = useLiveResourcesPage({ ...input, enabled: !fixtures });
  return fixtures ? fixtureResourcesPage(input.isStaff) : live;
}
