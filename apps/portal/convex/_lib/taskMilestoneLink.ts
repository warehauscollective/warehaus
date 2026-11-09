/**
 * Portal-only milestone on a task created through the outbox.
 * Notion properties never include this id. The task row gets it here.
 */

export function milestoneIdFromPayload(payload: string): string | null {
  try {
    const parsed = JSON.parse(payload) as { milestoneId?: unknown };
    return typeof parsed.milestoneId === 'string' && parsed.milestoneId.length > 0 ? parsed.milestoneId : null;
  } catch {
    return null;
  }
}

type TaskLinkRow = {
  _id: string;
  orgId: string;
  projectId: string;
  parentTaskId?: string | null;
  milestoneId?: string | null;
};

type MilestoneLinkRow = {
  _id: string;
  orgId: string;
  projectId: string;
};

/** Patch for a top-level task on the same project. An existing link is left alone. */
export function createdTaskMilestonePatch(input: {
  task: TaskLinkRow;
  milestone: MilestoneLinkRow | null;
}): { milestoneId: string } | null {
  const { task, milestone } = input;
  if (!milestone) return null;
  if (task.milestoneId) return null;
  if (task.parentTaskId) return null;
  if (task.orgId !== milestone.orgId || task.projectId !== milestone.projectId) return null;
  return { milestoneId: milestone._id };
}

type LinkCtx = {
  db: {
    get: (id: string) => Promise<MilestoneLinkRow | TaskLinkRow | null>;
    patch: (id: string, value: { milestoneId: string }) => Promise<unknown>;
  };
};

export async function linkTaskToCreateMilestone(
  ctx: LinkCtx,
  task: TaskLinkRow,
  milestoneId: string,
): Promise<boolean> {
  const milestone = (await ctx.db.get(milestoneId)) as MilestoneLinkRow | null;
  const patch = createdTaskMilestonePatch({ task, milestone });
  if (!patch) return false;
  await ctx.db.patch(task._id, patch);
  return true;
}
