'use client';

import { useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import type { ArchiveTaskChoice, LeftoverChoice } from '@convex/_lib/closeout';
import type { TaskSnapshot } from '@convex/_lib/closeoutStore';
import type { MilestoneStatus } from '@convex/_lib/milestoneStatus';
import { CLOSEOUT_SAVE_ERROR } from './closeoutCopy';
import type { CloseoutUndo } from './closeoutToast';

/** Each write resolves with its Undo: the inverse mutation, or null when nothing was written. */
export type MilestoneCloseoutActions = {
  markComplete: (leftovers: LeftoverChoice | null) => Promise<CloseoutUndo>;
  archive: (openTasks: ArchiveTaskChoice) => Promise<CloseoutUndo>;
  restore: () => Promise<CloseoutUndo>;
};

export type TaskCloseoutActions = {
  markDone: () => Promise<CloseoutUndo>;
  archive: () => Promise<CloseoutUndo>;
  restore: () => Promise<CloseoutUndo>;
};

/** Live milestone writes. Staff only: the mutations refuse anyone else. */
export function useMilestoneCloseoutActions(hostSlug?: string) {
  const markComplete = useMutation(api.milestones.markComplete);
  const archive = useMutation(api.milestones.archive);
  const restore = useMutation(api.milestones.restore);
  const undo = useMutation(api.milestones.undoCloseout);
  return (milestone: { id: string; status: MilestoneStatus }): MilestoneCloseoutActions => {
    const milestoneId = milestone.id as Id<'milestones'>;
    return {
      markComplete: async (leftovers) => {
        const result = await markComplete({
          hostSlug,
          milestoneId,
          expectedStatus: milestone.status,
          ...(leftovers ? { leftovers } : {}),
        });
        if (!result.wrote && result.tasks.length === 0) return null;
        return () => undo({ hostSlug, milestoneId, status: result.previous, tasks: result.tasks });
      },
      archive: async (openTasks) => {
        const result = await archive({ hostSlug, milestoneId, openTasks });
        if (!result.wrote) return null;
        return () => undo({ hostSlug, milestoneId, archivedAt: null, tasks: result.tasks });
      },
      restore: async () => {
        const result = await restore({ hostSlug, milestoneId });
        if (!result.wrote) return null;
        return () =>
          undo({
            hostSlug,
            milestoneId,
            ...(result.restored === 'completed' ? { status: result.previous } : {}),
            ...(result.restored === 'archived' ? { archivedAt: result.archivedAt } : {}),
            tasks: result.tasks,
          });
      },
    };
  };
}

type TaskResult = { ok: boolean; error?: string; wrote?: boolean; previous?: TaskSnapshot[] };

/** Live task writes. A refused write throws, so the caller shows the error and no toast. */
export function useTaskCloseoutActions(hostSlug?: string) {
  const markDone = useMutation(api.tasks.markDone);
  const archive = useMutation(api.tasks.archiveTask);
  const restore = useMutation(api.tasks.restoreTask);
  const undo = useMutation(api.tasks.undoTaskChange);
  const settle = (result: TaskResult): CloseoutUndo => {
    if (!result.ok) throw new Error(result.error || CLOSEOUT_SAVE_ERROR);
    const previous = result.previous ?? [];
    if (!result.wrote || previous.length === 0) return null;
    return async () => {
      const undone = await undo({ hostSlug, tasks: previous });
      if (!undone.ok) throw new Error(undone.error || CLOSEOUT_SAVE_ERROR);
    };
  };
  return (taskId: string): TaskCloseoutActions => {
    const id = taskId as Id<'tasks'>;
    return {
      markDone: async () => settle(await markDone({ hostSlug, taskId: id })),
      archive: async () => settle(await archive({ hostSlug, taskId: id })),
      restore: async () => settle(await restore({ hostSlug, taskId: id })),
    };
  };
}
