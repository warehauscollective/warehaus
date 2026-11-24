import { clientMaySeeProject } from './taskBoard';

/**
 * Client visibility, read straight off database rows.
 *
 * Every client surface asks the same three questions: may this client see
 * this project, this task, or this project-scoped item (doc, resource,
 * milestone)? The answer folds in the org gate (portal access Enabled and the
 * client row not concealed), the row's own publish flag, archive, sync-hidden
 * (`syncHiddenAt`), and the staff-only project rule (Warehaus Studio and
 * Internal projects). Callers pass rows as stored; nothing is pre-shaped.
 *
 * `orgVisible` is `isOrgVisibleToClients(client)`, computed once per query.
 */

export type VisibilityProjectRow = {
  name?: string | null;
  type?: readonly string[] | null;
  publishToWarehaus?: boolean | null;
  archive?: boolean | null;
  syncHiddenAt?: number | null;
};

export type VisibilityTaskRow = {
  publishToWarehaus?: boolean | null;
  syncHiddenAt?: number | null;
};

export type VisibilityItemRow = {
  publishToWarehaus?: boolean | null;
  archive?: boolean | null;
  syncHiddenAt?: number | null;
  projectId?: string | null;
};

/** A missing project is never visible. */
export function clientSeesProject(
  project: VisibilityProjectRow | null | undefined,
  orgVisible: boolean,
): boolean {
  if (!project) return false;
  return clientMaySeeProject({
    name: project.name,
    types: project.type,
    publishToWarehaus: project.publishToWarehaus ?? false,
    archive: project.archive ?? false,
    hidden: project.syncHiddenAt != null,
    orgVisible,
  });
}

/**
 * A task needs its own publish flag, no sync-hide, and a visible project.
 * Task archive is not part of this rule: the board drops archived tasks,
 * while history surfaces still show them.
 */
export function clientSeesTask(
  task: VisibilityTaskRow | null | undefined,
  project: VisibilityProjectRow | null | undefined,
  orgVisible: boolean,
): boolean {
  if (!task || !task.publishToWarehaus || task.syncHiddenAt != null) return false;
  return clientSeesProject(project, orgVisible);
}

/**
 * Docs, shared resources and other items that may sit on a project or on the
 * org itself. An org-level item (no `projectId`) needs only the org gate.
 * An item whose project row is missing is not visible.
 */
export function clientSeesProjectItem(
  item: VisibilityItemRow | null | undefined,
  project: VisibilityProjectRow | null | undefined,
  orgVisible: boolean,
): boolean {
  if (!item || !orgVisible || !item.publishToWarehaus || item.archive || item.syncHiddenAt != null) return false;
  if (!item.projectId) return true;
  return clientSeesProject(project, orgVisible);
}
