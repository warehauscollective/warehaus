'use client';

import { useSafeQuery } from '@/hooks/useSafeQuery';
import { api } from '@convex/_generated/api';
import { isMissingConvexFunction, staffRosterQueriesDeployed } from '@/lib/data/staffRoster';

type Args = { hostSlug?: string };

/**
 * Cross-org staff reads. Prefer the roster queries on this branch when
 * `NEXT_PUBLIC_PORTAL_STAFF_QUERIES=1`. Otherwise use functions that already
 * exist on the deployed Convex backend. A missing-function error falls back
 * instead of throwing.
 */
export function useStaffCrossOrg(enabled: boolean, hostSlug: string | undefined) {
  const roster = staffRosterQueriesDeployed();
  const args: Args | 'skip' = enabled ? { hostSlug } : 'skip';

  const newProjects = useSafeQuery<unknown[]>(
    api.projects.listForStaff,
    enabled && roster ? args : 'skip',
  );
  const projectsMissing = isMissingConvexFunction(newProjects.error);
  const oldProjects = useSafeQuery<unknown[]>(
    api.projects.listPublishedForStaff,
    enabled && (!roster || projectsMissing) ? args : 'skip',
  );

  const newTasks = useSafeQuery<unknown[]>(
    api.tasks.listForStaff,
    enabled && roster ? args : 'skip',
  );
  const tasksMissing = isMissingConvexFunction(newTasks.error);

  const newDocs = useSafeQuery<unknown[]>(
    api.clientDocs.listForStaff,
    enabled && roster ? args : 'skip',
  );
  const docsMissing = isMissingConvexFunction(newDocs.error);

  const newResources = useSafeQuery<unknown[]>(
    api.sharedResources.listForStaff,
    enabled && roster ? args : 'skip',
  );
  const resourcesMissing = isMissingConvexFunction(newResources.error);
  const oldResources = useSafeQuery<unknown[]>(
    api.sharedResources.listForClient,
    enabled && (!roster || resourcesMissing) ? args : 'skip',
  );

  const useNewProjects = roster && !projectsMissing && !newProjects.error;
  const projects = useNewProjects ? newProjects.data : oldProjects.data;
  const projectsLoading = useNewProjects ? newProjects.loading : oldProjects.loading;
  const projectsError = useNewProjects ? null : oldProjects.error;

  return {
    roster: roster && useNewProjects,
    projects,
    projectsLoading,
    projectsError,
    tasks: roster && !tasksMissing && !newTasks.error ? newTasks.data : undefined,
    tasksLoading: roster && !tasksMissing ? newTasks.loading : false,
    docs: roster && !docsMissing && !newDocs.error ? newDocs.data : undefined,
    resources: roster && !resourcesMissing && !newResources.error ? newResources.data : oldResources.data,
    resourcesLoading:
      roster && !resourcesMissing && !newResources.error ? newResources.loading : oldResources.loading,
    resourcesError:
      roster && !resourcesMissing && !newResources.error ? null : oldResources.error,
  };
}
