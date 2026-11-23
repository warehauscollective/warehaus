'use client';

import type { MilestoneRoadmapView } from '@convex/_lib/milestones';
import { listedTaskCount } from '@convex/_lib/closeout';
import { MilestoneCloseout, RestoreButton, TaskCloseout, useMilestoneCloseout, useTaskCloseout } from '@/components/closeout/CloseoutControls';
import type { MilestoneCloseoutActions, TaskCloseoutActions } from '@/components/closeout/closeoutActions';
import { ARCHIVED_OPACITY } from '@/components/closeout/closeoutCopy';

export type ArchivedTask = {
  id: string;
  name: string;
  status: string;
  isDone: boolean;
  stage: string | null;
  parentTaskId: string | null;
  /** The task's own milestone, or its parent's. */
  milestoneId: string | null;
  archivedAt: number | null;
};

/** What `milestones.listArchivedForProject` returns. */
export type ArchivedProjectView = {
  milestones: (MilestoneRoadmapView & { archivedAt: number | null })[];
  tasks: ArchivedTask[];
};

export function archivedTaskCountCopy(count: number): string {
  return count === 1 ? '1 task' : `${count} tasks`;
}

/**
 * An archived milestone in the Archived view. Muted to 0.55, with a Ghost
 * Restore and a "…" that offers Restore alone. The controls keep full opacity
 * so they stay readable.
 */
export function ArchivedMilestoneRow({
  milestone,
  actions,
}: {
  milestone: MilestoneRoadmapView;
  actions: MilestoneCloseoutActions;
}) {
  const total = listedTaskCount(milestone.rows);
  const restore = useMilestoneCloseout({ open: 0, total, parkedMilestone: false, actions });
  return (
    <article
      data-testid={`archived-milestone-${milestone.id}`}
      data-archived="true"
      className="flex items-start gap-3"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--panel-radius, 12px)',
        padding: 24,
      }}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2" data-testid="archived-muted" style={{ opacity: ARCHIVED_OPACITY }}>
        <h2 className="text-[21px] leading-[32px] lg:text-[20px] lg:leading-[30px]" style={{ fontFamily: 'var(--font-geist), var(--font-body)', fontWeight: 500 }}>
          {milestone.name}
        </h2>
        <p style={{ margin: 0, fontSize: 14, lineHeight: '21px', color: 'var(--muted)' }}>{milestone.objective}</p>
        <p className="ds-mono" style={{ margin: 0, fontSize: 11, lineHeight: '17px', color: 'var(--muted)' }}>
          {`${milestone.status} · ${archivedTaskCountCopy(total)}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <RestoreButton label={milestone.name} disabled={restore.busy} onClick={() => restore.start('restore')} />
        <MilestoneCloseout name={milestone.name} state="archived" open={0} total={total} parkedMilestone={false} actions={actions} />
      </div>
    </article>
  );
}

/** An archived task in the Archived view. Same muting and the same two controls. */
export function ArchivedTaskRow({
  task,
  actions,
  first = false,
}: {
  task: { id: string; name: string; status: string };
  actions: TaskCloseoutActions;
  first?: boolean;
}) {
  const restore = useTaskCloseout({ actions });
  return (
    <li
      data-testid="archived-task-row"
      data-archived="true"
      className="flex items-center gap-3"
      style={{ borderTop: first ? 0 : '1px solid var(--border)', padding: '14px 0' }}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1 md:flex-row md:items-center md:gap-3" data-testid="archived-muted" style={{ opacity: ARCHIVED_OPACITY }}>
        <span className="min-w-0 flex-1" style={{ fontSize: 14, lineHeight: '21px', overflowWrap: 'anywhere' }}>
          {task.name}
        </span>
        <span className="ds-mono" style={{ fontSize: 11, lineHeight: '17px', color: 'var(--muted)' }}>
          {task.status}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <RestoreButton label={task.name} disabled={restore.busy} onClick={() => restore.start('restore')} />
        <TaskCloseout name={task.name} state="archived" actions={actions} />
      </div>
    </li>
  );
}
