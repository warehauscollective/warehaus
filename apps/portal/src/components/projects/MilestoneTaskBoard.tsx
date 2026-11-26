'use client';

import { useMemo, useState } from 'react';
import type { Id } from '@convex/_generated/dataModel';
import type { MilestoneRoadmapView } from '@convex/_lib/milestones';
import { addTaskDecision, runOrderLocked } from '@convex/_lib/milestoneTasks';
import { userFacingErrorMessage } from '@convex/_lib/userFacingError';
import { ArchivedChip } from '@/components/closeout/CloseoutControls';
import type { TaskCloseoutActions } from '@/components/closeout/closeoutActions';
import { TaskBoard, type BoardReorder, type BoardRules } from '@/components/tasks/TaskBoard';
import type { PortalTask } from '@/lib/data/view-models';
import { ArchivedTaskRow, type ArchivedTask } from './ArchivedView';
import type { ChecklistActions } from './MilestoneChecklist';
import { Panel } from './milestoneChrome';
import {
  BOARD_BUILDING,
  BOARD_FOOTER,
  BOARD_INTRO,
  BOARD_SAVE_ERROR,
  BOARD_SHIPPED,
  MILESTONE_BOARD_STATUSES,
  ORDER_LOCKED,
  RUN_ORDER_STATUS,
  milestoneBoardCards,
  milestoneBoardReadOnly,
  runOrderAfterReorder,
} from './milestoneBoard';
import type { RoadmapProject } from './milestoneTile';

/** A status move on one task. The live page passes `tasks.moveStatus`. Fixture previews pass none. */
export type MoveTaskStatus = (args: {
  hostSlug?: string;
  taskId: Id<'tasks'>;
  status: string;
  expectedLastEditedTime: string;
}) => Promise<{ ok: boolean; error?: string; notion?: 'queued' | 'portal' | 'off' }>;

const STAFF_RULES: BoardRules = { actor: 'staff', statuses: [], stages: [] };
const CLIENT_RULES: BoardRules = { actor: 'client', statuses: [], stages: [] };
const ADD_TO: readonly string[] = ['To Do'];

/**
 * The milestone's tasks as a board: To Do, In Progress, Blocked, Done. Staff
 * move a card to change its status and add a task under To Do. Every column is
 * in milestone order, and To Do is the run order, top first: staff drag within
 * it to reorder, except while the milestone is Building. Clients, and everyone
 * on a Shipped milestone, get the same board read-only.
 */
export function MilestoneTaskBoard({
  milestone,
  project,
  tasks,
  staff,
  fixtures,
  hostSlug,
  actions,
  moveStatus,
  onOpenTask,
  archivedTasks = [],
  taskCloseout,
}: {
  milestone: MilestoneRoadmapView;
  project: RoadmapProject;
  /** The project's tasks. A milestone row with no task here is built from the row. */
  tasks: readonly PortalTask[];
  staff: boolean;
  fixtures: boolean;
  hostSlug?: string;
  actions?: Pick<ChecklistActions, 'addTask' | 'reorderTasks'>;
  moveStatus?: MoveTaskStatus;
  onOpenTask?: (taskId: string) => void;
  /** This milestone's archived tasks. Staff only. */
  archivedTasks?: readonly ArchivedTask[];
  /** Restore for an archived task. Absent in fixture previews. */
  taskCloseout?: (taskId: string) => TaskCloseoutActions;
}) {
  const [showArchived, setShowArchived] = useState(false);
  // Fixture previews have no Convex. Added tasks and a new order stay in this component.
  const [localRows, setLocalRows] = useState<MilestoneRoadmapView['rows']>([]);
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const shipped = milestone.status === 'Shipped';
  const orderLocked = runOrderLocked(milestone.status);
  const readOnly = milestoneBoardReadOnly({ staff, status: milestone.status }) || !(fixtures || moveStatus != null);
  const canAdd = !readOnly && (fixtures || actions != null);
  const rows = useMemo(() => {
    if (!fixtures) return milestone.rows;
    const all = [...milestone.rows, ...localRows];
    if (!localOrder) return all;
    // A task added after the reorder is not in it, and stays last.
    const place = (id: string) => (localOrder.includes(id) ? localOrder.indexOf(id) : localOrder.length);
    return [...all].sort((a, b) => place(a.id) - place(b.id));
  }, [fixtures, milestone.rows, localRows, localOrder]);
  const cards = useMemo(() => milestoneBoardCards(rows, tasks, project), [rows, tasks, project]);
  const reorderTasks = actions?.reorderTasks;
  const milestoneId = milestone.id;
  const reorder = useMemo<BoardReorder>(
    () => ({
      status: RUN_ORDER_STATUS,
      locked: orderLocked,
      lockedLabel: ORDER_LOCKED,
      onReorder: async ({ ids }) => {
        const taskIds = runOrderAfterReorder(rows, ids);
        if (!taskIds) return { ok: false, error: BOARD_SAVE_ERROR };
        if (fixtures) {
          setLocalOrder(taskIds);
          return { ok: true };
        }
        if (!reorderTasks) return { ok: false, error: BOARD_SAVE_ERROR };
        try {
          await reorderTasks({ hostSlug, milestoneId: milestoneId as Id<'milestones'>, taskIds: taskIds as Id<'tasks'>[] });
          return { ok: true };
        } catch (err) {
          return { ok: false, error: userFacingErrorMessage(err, BOARD_SAVE_ERROR) };
        }
      },
    }),
    [orderLocked, rows, fixtures, reorderTasks, hostSlug, milestoneId],
  );
  const archivedView = staff && showArchived && archivedTasks.length > 0;

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="milestone-task-board">
      {staff ? (
        <Panel>
          <p data-testid="milestone-board-intro" style={{ margin: 0, fontSize: 14, lineHeight: '21px', color: 'var(--muted)' }}>
            {BOARD_INTRO}
          </p>
        </Panel>
      ) : null}
      {staff && archivedTasks.length > 0 ? (
        <ArchivedChip active={archivedView} count={archivedTasks.length} onClick={() => setShowArchived((shown) => !shown)} />
      ) : null}
      {archivedView ? (
        <Panel testId="milestone-board-archived">
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {archivedTasks.map((task, index) => {
              const taskActions = taskCloseout ? taskCloseout(task.id) : null;
              return taskActions ? <ArchivedTaskRow key={task.id} task={task} first={index === 0} actions={taskActions} /> : null;
            })}
          </ul>
        </Panel>
      ) : (
        <TaskBoard
          tasks={cards}
          staff={staff}
          loading={false}
          rules={staff ? STAFF_RULES : CLIENT_RULES}
          statuses={MILESTONE_BOARD_STATUSES}
          quickAddStatuses={ADD_TO}
          readOnly={readOnly}
          keepOrder
          reorder={reorder}
          showQuickAdd={canAdd}
          hideGroupToggle
          framed
          onOpen={(task) => onOpenTask?.(task.id)}
          onMove={async ({ task, value }) => {
            if (fixtures) return { ok: true };
            if (!moveStatus) return { ok: false, error: BOARD_SAVE_ERROR };
            try {
              return await moveStatus({
                hostSlug,
                taskId: task.id as Id<'tasks'>,
                status: value,
                expectedLastEditedTime: task.lastEditedTime ?? '',
              });
            } catch (err) {
              return { ok: false, error: userFacingErrorMessage(err, BOARD_SAVE_ERROR) };
            }
          }}
          onQuickAdd={async ({ name }) => {
            const decision = addTaskDecision({ staff, milestoneStatus: milestone.status, title: name });
            if (!decision.ok) return { ok: false, error: decision.reason };
            if (fixtures) {
              setLocalRows((rows) => [
                ...rows,
                {
                  id: `fixture-task-${milestone.rows.length + rows.length + 1}`,
                  name: decision.title,
                  status: 'To Do',
                  isDone: false,
                  stage: decision.stage,
                  resourceCount: 0,
                  origin: 'manual',
                  portalOwned: true,
                  onMilestone: true,
                  children: [],
                },
              ]);
              return { ok: true };
            }
            if (!actions) return { ok: false, error: BOARD_SAVE_ERROR };
            try {
              await actions.addTask({ hostSlug, milestoneId: milestone.id as Id<'milestones'>, title: decision.title });
              return { ok: true };
            } catch (err) {
              return { ok: false, error: userFacingErrorMessage(err, BOARD_SAVE_ERROR) };
            }
          }}
        />
      )}
      {staff && !archivedView ? (
        <p data-testid="milestone-board-footer" style={{ margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>
          {shipped ? BOARD_SHIPPED : orderLocked ? BOARD_BUILDING : BOARD_FOOTER}
        </p>
      ) : null}
    </div>
  );
}
