'use client';

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { PortalModal } from '@/components/ui/PortalModal';
import { PortalToast } from '@/components/ui/PortalToast';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import {
  boardColumns,
  dropSlotIndex,
  resolveBoardDrop,
  WRITEBACK_OFF_ERROR,
  type BoardDropDecision,
  type MoveActor,
  type MoveRule,
} from '@warehaus/portal-sync';
import { boardLaneTasks } from '@/components/projects/milestoneGuards';
import { NEW_TASK_HINT } from '@/components/tasks/itemStates';
import { OutlineButton, Pill, PrimaryButton } from '@/components/ui/primitives';
import { SyncChip } from '@/components/sync/SyncChip';
import { formatPortalDate, taskStatusColor, type PortalTask } from '@/lib/data/view-models';
import { displayedTaskStatus } from '@/lib/data/taskStatus';
import { scrollActiveIntoView, sectionEdgeFades, sectionEdgeMask, type EdgeFade } from '@/components/layout/sectionEdgeFade';
import { TaskGlyph } from './TaskGlyph';

export type BoardMode = 'status' | 'stage';

export type BoardRules = {
  actor: 'staff' | 'client';
  statuses: Array<{ status: string; rule: MoveRule }>;
  stages: Array<{ stage: string; rule: MoveRule }>;
};

type MoveRequest = {
  task: PortalTask;
  mode: BoardMode;
  value: string;
  pullRequestLink?: string;
  /** The answer to the board's ask. The milestone board saves it as the next action. */
  answer?: string;
};

/** Copy for a NeedsDialog that asks one question other than the pull request link. */
export type NeedsCopy = {
  title: string;
  body: (taskName: string) => string;
  label: string;
  placeholder: string;
  /** Shown when the answer is empty. */
  required: string;
  submit: string;
  maxLength?: number;
};

/** A status column that asks one question before a card lands in it. The milestone board asks on Blocked. */
export type BoardAsk = { status: string; copy: NeedsCopy };

/** The ask a move to `value` raises, or null. Status columns only. */
export function boardAskFor(ask: BoardAsk | undefined, mode: BoardMode, value: string): BoardAsk | null {
  return ask && mode === 'status' && ask.status === value ? ask : null;
}

/** Phone columns on a framed board: fixed width, side by side, scrolled sideways. */
export const PHONE_LANE_WIDTH = 220;

const GROUP_KEY = 'wh-task-board-group';

/** The column under the pointer wins. The card rect often still overlaps the source column. */
const columnCollision: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  if (pointerHits.length > 0) return pointerHits;
  return rectIntersection(args);
};

/** A desktop drag must reach dnd-kit. A phone long-press is a separate move sheet. */
export function cardDragPointerDown<E>(
  event: E,
  drag: ((event: E) => void) | undefined,
  beginLongPress: (() => void) | undefined,
): void {
  drag?.(event);
  beginLongPress?.();
}

export const MOVE_NOT_SAVED = 'Not saved. Moving cards to Notion is turned off for now.';

/** Success toast for a drop that patched. Undo sends the previous column value. */
export function stageSavedFeedback(input: {
  task: PortalTask;
  mode: BoardMode;
  value: string;
  previous: string;
  onUndo: (request: MoveRequest) => void;
}): { message: string; undo: () => void } {
  return {
    message: `Moved “${input.task.name}” to ${input.value}`,
    undo: () => {
      const task = {
        ...input.task,
        ...(input.mode === 'stage' ? { stage: input.value } : { status: input.value }),
      };
      input.onUndo({ task, mode: input.mode, value: input.previous });
    },
  };
}

/** Equal tracks. Emptying a column does not change the template, so the row does not jump. */
export function boardColumnTemplate(count: number, phone: boolean, framed = false): string {
  // The milestone board keeps every lane on a phone and scrolls sideways. Other boards show one lane per tab.
  if (phone) return framed ? `repeat(${Math.max(count, 1)}, ${PHONE_LANE_WIDTH}px)` : 'minmax(0, 1fr)';
  // 12rem is the milestone frame, so five lanes fit that board. Other boards keep 12.75rem.
  const track = framed ? '12rem' : '12.75rem';
  return `repeat(${Math.max(count, 1)}, minmax(${track}, 1fr))`;
}

/** Right-edge hint only while horizontal lane content is still out of view. */
export function boardShowsEdgeFade(input: {
  wide: boolean;
  scrollWidth: number;
  clientWidth: number;
  scrollLeft: number;
}): boolean {
  const overflow = input.scrollWidth - input.clientWidth > 1;
  const atEnd = input.scrollLeft + input.clientWidth >= input.scrollWidth - 1;
  return input.wide && overflow && !atEnd;
}

/** A drop stays in the new column only when enqueue accepts it. */
export function boardMovePersists(result: { ok: boolean }): boolean {
  return result.ok;
}

export function flagOffDropMessage(result: { ok: boolean; error?: string }): string | null {
  if (!result.ok && result.error === WRITEBACK_OFF_ERROR) return MOVE_NOT_SAVED;
  return null;
}

/**
 * The status columns a board asked for, in that order. A board that names its
 * statuses shows those lanes and no others, so it has no Inbox lane and no
 * lane for a status it did not name.
 */
export function pickStatusColumns<T extends { key: string; label: string }>(
  columns: readonly T[],
  statuses: readonly string[] | undefined,
): T[] {
  if (!statuses) return [...columns];
  return statuses.flatMap((status) => columns.filter((column) => column.key === status));
}

/** Moves and adds need staff, the staff move rules, and a board that is not read-only. */
export function boardCanChange(input: { staff: boolean; actor: 'staff' | 'client' | undefined; readOnly: boolean }): boolean {
  return input.staff && input.actor === 'staff' && !input.readOnly;
}

/** One column whose cards staff move up and down. The milestone board names To Do: its order is the run order. */
export type BoardReorder = {
  status: string;
  /** The order holds still. Cards still move between columns. */
  locked: boolean;
  /** Shown in the column header while locked. */
  lockedLabel: string;
  /** `ids` is the column's cards in their new order, top first. */
  onReorder: (input: { task: PortalTask; ids: string[] }) => Promise<{ ok: boolean; error?: string }>;
};

/**
 * The milestone card face. The run number shows in `runStatus` only, top
 * first. The origin badge and the PR chip are staff only. A board without it
 * keeps the default face.
 */
export type BoardCard = {
  runStatus: string;
  origin?: (task: PortalTask) => string | null;
  pullRequest?: (task: PortalTask) => string | null;
  /** A mark before the card's name, such as the Building indicator on the task being built. */
  leading?: (task: PortalTask) => ReactNode | null;
};

/** What one card shows beyond its name and child count. */
export type CardFace = { run: string | null; origin: string | null; pullRequest: string | null; leading?: ReactNode | null };

/** `01`, `02`, … by place in the run column. */
export function runNumbers(ids: readonly string[]): Map<string, string> {
  return new Map(ids.map((id, index) => [id, String(index + 1).padStart(2, '0')] as const));
}

export const ORDER_NOT_SAVED = 'Couldn’t save the order. Moved back.';

/** Each column's cards in the order the board was given them, in place of due date order. */
export function columnsInGivenOrder<T extends { id: string }, C extends { tasks: T[] }>(columns: readonly C[], given: readonly T[]): C[] {
  const position = new Map(given.map((task, index) => [task.id, index] as const));
  const at = (task: T) => position.get(task.id) ?? Number.MAX_SAFE_INTEGER;
  return columns.map((column) => ({ ...column, tasks: [...column.tasks].sort((a, b) => at(a) - at(b)) }));
}

/** Where a card from another column lands when columns keep the given order. */
export function givenOrderSlot<T extends { id: string }>(resting: readonly T[], card: T, given: readonly T[]): number {
  const position = new Map(given.map((task, index) => [task.id, index] as const));
  const own = position.get(card.id) ?? Number.MAX_SAFE_INTEGER;
  const index = resting.findIndex((task) => (position.get(task.id) ?? Number.MAX_SAFE_INTEGER) > own);
  return index === -1 ? resting.length : index;
}

/** The slot under a lifted card: how many resting cards have their middle above the card's middle. */
export function reorderSlot(restingMiddles: readonly number[], liftedMiddle: number): number {
  return restingMiddles.filter((middle) => middle < liftedMiddle).length;
}

/** The column's ids with one card moved to a slot among the others. Null when nothing moves. */
export function movedOrder(ids: readonly string[], id: string, slot: number): string[] | null {
  if (!ids.includes(id)) return null;
  const rest = ids.filter((item) => item !== id);
  const next = [...rest];
  next.splice(Math.max(0, Math.min(slot, rest.length)), 0, id);
  return next.every((item, index) => item === ids[index]) ? null : next;
}

/** A column's cards in an order still being saved. A card the order does not name stays last. */
export function applyPendingOrder<T extends { id: string }>(tasks: readonly T[], ids: readonly string[] | null): T[] {
  if (!ids) return [...tasks];
  const position = new Map(ids.map((id, index) => [id, index] as const));
  const at = (task: T) => position.get(task.id) ?? Number.MAX_SAFE_INTEGER;
  return [...tasks].sort((a, b) => at(a) - at(b));
}

export function readBoardMode(): BoardMode {
  if (typeof window === 'undefined') return 'status';
  return window.localStorage.getItem(GROUP_KEY) === 'stage' ? 'stage' : 'status';
}

export function TaskBoard({
  tasks,
  staff,
  loading,
  rules,
  onOpen,
  onMove,
  onQuickAdd,
  quickAddEnabled = true,
  showQuickAdd = true,
  hideGroupToggle = false,
  framed = false,
  statuses,
  quickAddStatuses,
  readOnly = false,
  keepOrder = false,
  reorder,
  ask,
  card,
}: {
  tasks: PortalTask[];
  staff: boolean;
  loading: boolean;
  rules: BoardRules | null;
  onOpen: (task: PortalTask) => void;
  /** A task change result (ADR-0003). `pending` is the older shape, kept for fixtures. */
  onMove: (request: MoveRequest) => Promise<{ ok: boolean; error?: string; notion?: 'queued' | 'portal' | 'off'; pending?: boolean }>;
  onQuickAdd: (input: { name: string; status: string; stage?: string }) => Promise<{ ok: boolean; error?: string }>;
  /** When write-back is off the column control stays disabled and never calls onQuickAdd. */
  quickAddEnabled?: boolean;
  /** Milestone tasks hide column add. The milestone menu is the only create path. */
  showQuickAdd?: boolean;
  /** Milestone tasks stay on status columns. */
  hideGroupToggle?: boolean;
  /** Shared lane surface, equal heights, and the inset fade. Only the milestone board turns this on. */
  framed?: boolean;
  /** Status columns to show, in order. Unset shows every live status. The milestone board names four. */
  statuses?: readonly string[];
  /** Status columns that take a new task. Unset means every column. */
  quickAddStatuses?: readonly string[];
  /** Cards still open. Nothing moves and nothing is added. Clients and Shipped milestones. */
  readOnly?: boolean;
  /** Columns keep the order of `tasks`, not due date order. The milestone board passes milestone order. */
  keepOrder?: boolean;
  /** The status column staff reorder by drag. Status mode only, and never on a phone. */
  reorder?: BoardReorder;
  /** A status column that asks one question before a card lands in it. The answer rides on the move. */
  ask?: BoardAsk;
  /** The milestone card face: run number, origin badge, child count, PR chip. */
  card?: BoardCard;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [slot, setSlot] = useState<number | null>(null);
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);
  const [mode, setMode] = useState<BoardMode>('status');
  const [phone, setPhone] = useState(false);
  const framedSurface = framed;
  /** A framed board keeps every lane on a phone. Other boards show one lane per tab. */
  const phoneTabs = phone && !framed;
  const [overrides, setOverrides] = useState<Record<string, { mode: BoardMode; value: string; pending?: boolean }>>({});
  const [failed, setFailed] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ message: string; retry?: () => void; undo?: () => void } | null>(null);
  const [live, setLive] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [liftedHeight, setLiftedHeight] = useState<number | null>(null);
  const liftedHeightRef = useRef<number | null>(null);
  const [tab, setTab] = useState<string | null>(null);
  const [moveTask, setMoveTask] = useState<PortalTask | null>(null);
  const [needs, setNeeds] = useState<{ task: PortalTask; value: string; rule: MoveRule } | null>(null);
  const [asking, setAsking] = useState<{ task: PortalTask; value: string; copy: NeedsCopy } | null>(null);
  const [quick, setQuick] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    setMode(hideGroupToggle ? 'status' : readBoardMode());
    const media = window.matchMedia('(max-width: 767px)');
    const apply = () => setPhone(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [hideGroupToggle]);

  const viewTasks = useMemo(
    () =>
      tasks.map((task) => {
        const override = overrides[task.id];
        if (!override) return task;
        if (override.mode === 'status') return { ...task, status: override.value, isDone: override.value === 'Done' };
        return {
          ...task,
          stage: override.value,
          stagePending: override.pending === true ? true : override.pending === false ? false : task.stagePending,
        };
      }),
    [tasks, overrides],
  );
  const columns = useMemo(() => {
    const lanes = boardLaneTasks(viewTasks);
    const sorted = boardColumns(lanes, mode, staff ? 'staff' : 'client');
    const all = keepOrder ? columnsInGivenOrder(sorted, lanes) : sorted;
    const picked = mode === 'status' ? pickStatusColumns(all, statuses) : all;
    if (mode !== 'status' || !reorder || !pendingOrder) return picked;
    return picked.map((column) =>
      column.key === reorder.status ? { ...column, tasks: applyPendingOrder(column.tasks, pendingOrder) } : column,
    );
  }, [viewTasks, mode, staff, statuses, keepOrder, reorder, pendingOrder]);
  const canChange = boardCanChange({ staff, actor: rules?.actor, readOnly });
  const activeTab = tab && columns.some((column) => column.key === tab) ? tab : columns[0]?.key ?? null;
  const shown = phoneTabs ? columns.filter((column) => column.key === activeTab) : columns;
  const canDrag = canChange && !phone;
  const cardFace = useMemo(() => {
    if (!card) return undefined;
    const runColumn = mode === 'status' ? columns.find((column) => column.key === card.runStatus) : undefined;
    const runs = runNumbers((runColumn?.tasks ?? []).map((task) => task.id));
    return (task: PortalTask): CardFace => ({
      run: runs.get(task.id) ?? null,
      origin: staff ? card.origin?.(task) ?? null : null,
      pullRequest: staff ? card.pullRequest?.(task) ?? null : null,
      leading: card.leading?.(task) ?? null,
    });
  }, [card, columns, mode, staff]);
  const reorderStatus = mode === 'status' && reorder ? reorder.status : null;
  const canReorder = canDrag && reorderStatus != null && reorder != null && !reorder.locked;

  const chooseMode = (next: BoardMode) => {
    setMode(next);
    setTab(null);
    window.localStorage.setItem(GROUP_KEY, next);
  };

  const actor = (): MoveActor => (canChange ? 'staff' : 'client');

  const dropFrom = (task: PortalTask) => (mode === 'stage' ? task.stage ?? '' : task.status);

  const decide = (task: PortalTask, value: string): BoardDropDecision =>
    resolveBoardDrop({ actor: actor(), mode, from: dropFrom(task), to: value });

  const rejectMove = (reason: string) => {
    setLive(reason);
    setToast({ message: reason });
  };

  const commit = async (task: PortalTask, value: string, pullRequestLink?: string, answer?: string) => {
    const previous = mode === 'stage' ? task.stage ?? '' : task.status;
    if (previous === value) return;
    setOverrides((current) => ({ ...current, [task.id]: { mode, value } }));
    setFailed((current) => {
      const next = { ...current };
      delete next[task.id];
      return next;
    });
    setLive(`Moved ${task.name} to ${value}. Saving.`);
    const result = await onMove({ task, mode, value, pullRequestLink, ...(answer !== undefined ? { answer } : {}) });
    const clearOverride = () => {
      setOverrides((current) => {
        const next = { ...current };
        delete next[task.id];
        return next;
      });
    };
    const notSaved = flagOffDropMessage(result);
    if (notSaved) {
      clearOverride();
      setToast({ message: notSaved });
      setLive(notSaved);
      return;
    }
    if (!boardMovePersists(result)) {
      clearOverride();
      setFailed((current) => ({ ...current, [task.id]: result.error ?? 'Couldn’t save. Moved back.' }));
      setToast({
        message: result.error ?? 'Couldn’t save. Moved back.',
        retry: () => void commit(task, value, pullRequestLink, answer),
      });
      setLive(`${task.name} moved back. ${result.error ?? 'Couldn’t save.'}`);
      return;
    }
    if (mode === 'stage') {
      setOverrides((current) => ({
        ...current,
        [task.id]: { mode, value, pending: result.notion !== undefined ? result.notion === 'queued' : result.pending !== false },
      }));
    }
    const saved = stageSavedFeedback({
      task,
      mode,
      value,
      previous,
      onUndo: (request) => void commit(request.task, request.value, request.pullRequestLink),
    });
    setToast({ message: saved.message, undo: saved.undo });
    setLive(`${saved.message}.`);
  };

  /** A move the rules allow. A column with an ask opens its dialog first, and the answer saves with the move. */
  const move = (task: PortalTask, value: string) => {
    const question = boardAskFor(ask, mode, value);
    if (question) setAsking({ task, value, copy: question.copy });
    else void commit(task, value);
  };

  const commitOrder = async (task: PortalTask, ids: string[]) => {
    if (!reorder) return;
    setPendingOrder(ids);
    const place = `${ids.indexOf(task.id) + 1} of ${ids.length}`;
    setLive(`Moved ${task.name} to ${place} in ${reorder.status}. Saving.`);
    const result = await reorder.onReorder({ task, ids });
    setPendingOrder(null);
    if (result.ok) {
      setLive(`${task.name} is ${place} in ${reorder.status}.`);
      return;
    }
    const message = result.error ?? ORDER_NOT_SAVED;
    setToast({ message, retry: () => void commitOrder(task, ids) });
    setLive(`${task.name} moved back. ${message}`);
  };

  /** A card dropped, or stepped with the arrow keys, inside the reorder column. */
  const reorderTo = (task: PortalTask, slotFor: (ids: string[]) => number) => {
    if (!reorder || !canReorder || pendingOrder) return;
    const column = columns.find((item) => item.key === reorder.status);
    if (!column) return;
    const current = column.tasks.map((item) => item.id);
    const ids = movedOrder(current, task.id, slotFor(current));
    if (ids) void commitOrder(task, ids);
  };

  const onDragMove = (event: DragMoveEvent) => {
    const lifted = event.active.rect.current.translated;
    const dragged = viewTasks.find((item) => item.id === String(event.active.id));
    const over = event.over ? String(event.over.id) : '';
    if (!canReorder || !lifted || !dragged || dragged.status !== reorderStatus || over !== `column:${reorderStatus}`) {
      setSlot(null);
      return;
    }
    const lanes = boardRef.current?.querySelectorAll<HTMLElement>('[data-testid="task-column"]') ?? [];
    const lane = [...lanes].find((node) => node.dataset.columnKey === reorderStatus);
    if (!lane) return;
    const middles = [...lane.querySelectorAll<HTMLElement>('[data-testid="task-card"][data-collapsed="rest"]')].map((card) => {
      const rect = card.getBoundingClientRect();
      return rect.top + rect.height / 2;
    });
    setSlot(reorderSlot(middles, lifted.top + lifted.height / 2));
  };

  const onDragEnd = (event: DragEndEvent) => {
    const droppedSlot = slot;
    setActiveId(null);
    setOverKey(null);
    setLiftedHeight(null);
    setSlot(null);
    const task = tasks.find((item) => item.id === String(event.active.id));
    const viewed = viewTasks.find((item) => item.id === String(event.active.id));
    const over = event.over ? String(event.over.id) : '';
    if (!task || !viewed || !over.startsWith('column:')) return;
    const value = over.slice('column:'.length);
    if (reorder && value === reorderStatus && viewed.status === value) {
      if (reorder.locked) setLive(`${reorder.lockedLabel}.`);
      else if (droppedSlot != null) reorderTo(viewed, () => droppedSlot);
      return;
    }
    const decision = decide(viewed, value);
    if (decision.kind === 'ignore') return;
    if (decision.kind === 'reject') {
      rejectMove(decision.reason);
      return;
    }
    if (decision.kind === 'needs') {
      setNeeds({ task, value, rule: decision.rule });
      return;
    }
    move(viewed, decision.value);
  };

  const onDragOver = (event: DragOverEvent) => {
    const over = event.over ? String(event.over.id) : '';
    setOverKey(over.startsWith('column:') ? over.slice('column:'.length) : null);
  };

  return (
    <div ref={boardRef} className="flex min-w-0 flex-col gap-3" data-testid="task-board">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {hideGroupToggle ? null : <GroupToggle mode={mode} onChange={chooseMode} />}
        <p className="sr-only" aria-live="polite">{live}</p>
      </div>
      {phoneTabs ? (
        <PhoneColumnTabs
          label={mode === 'stage' ? 'Stages' : 'Statuses'}
          columns={columns}
          activeTab={activeTab}
          onSelect={setTab}
        />
      ) : null}
      <DndContext
        sensors={sensors}
        collisionDetection={columnCollision}
        onDragStart={(event) => {
          setActiveId(String(event.active.id));
          setLiftedHeight(liftedHeightRef.current);
        }}
        onDragOver={onDragOver}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveId(null);
          setOverKey(null);
          setLiftedHeight(null);
          setSlot(null);
          setLive('Move cancelled.');
        }}
      >
        <BoardScroller tracks={boardColumnTemplate(shown.length, phone, framed)} shared={framedSurface}>
          {shown.map((column) => {
            const dragging = activeId ? viewTasks.find((task) => task.id === activeId) : undefined;
            const hover = dragging && overKey === column.key ? decide(dragging, column.key) : null;
            const accepting = hover?.kind === 'move' || hover?.kind === 'needs';
            const resting = dragging ? column.tasks.filter((task) => task.id !== dragging.id) : column.tasks;
            const ordering = column.key === reorderStatus;
            // A To Do card over To Do: the slot follows the pointer. Any other drop lands where the column's order puts it.
            const reordering = dragging != null && canReorder && ordering && dragging.status === column.key && overKey === column.key;
            const landing = !dragging || !accepting ? null : keepOrder ? givenOrderSlot(resting, dragging, viewTasks) : dropSlotIndex(resting, dragging);
            return (
            <Column
              key={column.key}
              columnKey={column.key}
              label={column.label}
              tasks={column.tasks}
              allTasks={viewTasks}
              cardFace={cardFace}
              staff={staff}
              loading={loading}
              canDrag={canDrag}
              failed={failed}
              locked={hover?.kind === 'reject'}
              activeTarget={accepting}
              draggingId={activeId}
              dropIndex={reordering ? slot : landing}
              headerNote={ordering && reorder?.locked && canChange ? reorder.lockedLabel : null}
              onKeyOrder={
                ordering && canReorder
                  ? (task, direction) => reorderTo(task, (ids) => ids.indexOf(task.id) + direction)
                  : undefined
              }
              dropHeight={liftedHeight}
              canMoveSheet={phone && canChange}
              shared={framedSurface}
              mode={mode}
              emptyClient={!staff}
              onLiftSize={(height) => {
                liftedHeightRef.current = height;
              }}
              onOpen={onOpen}
              onRetry={(task) => {
                const value = mode === 'stage' ? task.stage ?? '' : task.status;
                void commit(tasks.find((item) => item.id === task.id) ?? task, value);
              }}
              onMoveSheet={setMoveTask}
              quick={quick === column.key}
              quickAddEnabled={quickAddEnabled}
              showQuickAdd={showQuickAdd && canChange && (!quickAddStatuses || quickAddStatuses.includes(column.key))}
              onQuick={() => {
                if (!quickAddEnabled) return;
                setQuick(column.key);
              }}
              onQuickClose={() => setQuick(null)}
              onQuickAdd={async (name) => {
                const status = mode === 'status' && !column.key.startsWith('unknown') ? column.label : 'To Do';
                const stage = mode === 'stage' && !column.key.startsWith('unknown') ? column.label : undefined;
                return onQuickAdd({ name, status, stage });
              }}
              onKeyMove={(task, direction) => {
                const index = columns.findIndex((item) => item.key === column.key);
                const next = columns[index + direction];
                if (!next || !canDrag) return;
                const decision = decide(task, next.key);
                if (decision.kind === 'ignore') return;
                if (decision.kind === 'reject') {
                  rejectMove(decision.reason);
                  return;
                }
                if (decision.kind === 'needs') setNeeds({ task, value: next.key, rule: decision.rule });
                else move(task, decision.value);
              }}
            />
            );
          })}
        </BoardScroller>
        <DragOverlay dropAnimation={null} style={{ cursor: 'grabbing' }}>
          {activeId ? (
            <div style={{ height: '100%', transform: 'rotate(2deg) scale(1.03)', transformOrigin: 'center center', cursor: 'grabbing' }}>
              <LiftedFace task={viewTasks.find((task) => task.id === activeId) ?? tasks[0]} mode={mode} allTasks={viewTasks} staff={staff} cardFace={cardFace} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      {toast ? (
        <BoardToast
          message={toast.message}
          retry={toast.retry}
          undo={toast.undo ? () => { toast.undo?.(); setToast(null); } : undefined}
          onDismiss={() => setToast(null)}
          pinned={!phone || toast.message === MOVE_NOT_SAVED}
        />
      ) : null}
      {moveTask ? (
        <MoveSheet
          task={moveTask}
          showName={framed}
          columns={columns.filter((column) => !column.key.startsWith('unknown'))}
          current={dropFrom(moveTask)}
          decisionFor={(value) => decide(moveTask, value)}
          onClose={() => setMoveTask(null)}
          onPick={(value) => {
            const decision = decide(moveTask, value);
            setMoveTask(null);
            if (decision.kind === 'needs') setNeeds({ task: moveTask, value, rule: decision.rule });
            else if (decision.kind === 'move') move(moveTask, decision.value);
            else if (decision.kind === 'reject') rejectMove(decision.reason);
          }}
        />
      ) : null}
      {needs && needs.rule.kind === 'needs' ? (
        <NeedsDialog
          taskName={needs.task.name}
          rule={needs.rule}
          onCancel={() => {
            setNeeds(null);
            setLive('Move cancelled.');
          }}
          onSave={(pullRequestLink) => {
            const pending = needs;
            setNeeds(null);
            void commit(pending.task, pending.value, pullRequestLink);
          }}
        />
      ) : null}
      {asking ? (
        <NeedsDialog
          taskName={asking.task.name}
          copy={asking.copy}
          initialValue={asking.task.nextAction ?? ''}
          onCancel={() => {
            setAsking(null);
            setLive('Move cancelled.');
          }}
          onSave={(answer) => {
            const pending = asking;
            setAsking(null);
            void commit(pending.task, pending.value, undefined, answer);
          }}
        />
      ) : null}
    </div>
  );
}

function GroupToggle({ mode, onChange }: { mode: BoardMode; onChange: (mode: BoardMode) => void }) {
  return (
    <div role="tablist" aria-label="Group by" className="inline-flex" style={{ padding: 4, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)' }}>
      {(['status', 'stage'] as const).map((key) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={mode === key}
          onClick={() => onChange(key)}
          className="ds-mono"
          style={{
            minHeight: 33,
            padding: '0.35rem 0.8rem',
            border: 0,
            borderRadius: 9,
            cursor: 'pointer',
            background: mode === key ? 'var(--fg)' : 'transparent',
            color: mode === key ? 'var(--bg)' : 'var(--muted)',
          }}
        >
          {key === 'status' ? 'Status' : 'Stage'}
        </button>
      ))}
    </div>
  );
}

function Column({
  columnKey,
  label,
  tasks,
  allTasks,
  cardFace,
  staff,
  loading,
  canDrag,
  failed,
  locked,
  activeTarget,
  draggingId,
  dropIndex,
  dropHeight,
  canMoveSheet,
  shared,
  mode,
  emptyClient,
  onLiftSize,
  onOpen,
  onRetry,
  onMoveSheet,
  quick,
  onQuick,
  onQuickClose,
  onQuickAdd,
  quickAddEnabled,
  showQuickAdd,
  onKeyMove,
  headerNote,
  onKeyOrder,
}: {
  columnKey: string;
  label: string;
  tasks: PortalTask[];
  allTasks: PortalTask[];
  cardFace?: (task: PortalTask) => CardFace;
  staff: boolean;
  loading: boolean;
  canDrag: boolean;
  failed: Record<string, string>;
  locked: boolean;
  activeTarget: boolean;
  draggingId: string | null;
  dropIndex: number | null;
  dropHeight: number | null;
  canMoveSheet: boolean;
  shared: boolean;
  mode: BoardMode;
  emptyClient: boolean;
  onLiftSize: (height: number) => void;
  onOpen: (task: PortalTask) => void;
  onRetry: (task: PortalTask) => void;
  onMoveSheet: (task: PortalTask) => void;
  quick: boolean;
  onQuick: () => void;
  onQuickClose: () => void;
  onQuickAdd: (name: string) => Promise<{ ok: boolean; error?: string }>;
  quickAddEnabled: boolean;
  showQuickAdd: boolean;
  onKeyMove: (task: PortalTask, direction: -1 | 1) => void;
  /** Beside the count, with a lock. The milestone board's To Do reads Order locked while Building. */
  headerNote: string | null;
  /** Arrow up and down move a card one place. Only the reorder column passes it. */
  onKeyOrder?: (task: PortalTask, direction: -1 | 1) => void;
}) {
  const { setNodeRef } = useDroppable({ id: `column:${columnKey}` });
  const dashed = columnKey.startsWith('unknown-stage');
  const restingCount = tasks.filter((task) => task.id !== draggingId).length;
  const cards = boardDropNodes({
    tasks,
    draggingId,
    dropIndex,
    dropHeight,
    renderTask: (task, collapsed) => (
      <BoardCard
        key={task.id}
        task={task}
        mode={mode}
        allTasks={allTasks}
        face={cardFace?.(task)}
        canDrag={canDrag}
        canMoveSheet={canMoveSheet}
        staff={staff}
        collapsed={collapsed}
        error={failed[task.id]}
        onLiftSize={onLiftSize}
        onOpen={() => onOpen(task)}
        onRetry={() => onRetry(task)}
        onMoveSheet={() => onMoveSheet(task)}
        onKeyMove={onKeyMove}
        onKeyOrder={onKeyOrder}
      />
    ),
  });
  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      data-testid="task-column"
      data-column-key={columnKey}
      className="flex min-w-0 w-full flex-col"
      style={{
        position: 'relative',
        minWidth: 0,
        boxSizing: 'border-box',
        height: shared ? '100%' : undefined,
        minHeight: shared ? 560 : undefined,
        padding: 12,
        gap: 12,
        borderRadius: shared ? 12 : 16,
        border: locked
          ? '2px dashed var(--danger)'
          : dashed
            ? '1px dashed var(--border)'
            : activeTarget
              ? '2px solid var(--accent)'
              : shared
                ? '1px solid transparent'
                : '1px solid var(--border)',
        background: activeTarget ? 'var(--accent-tint)' : shared ? 'transparent' : 'var(--bg)',
      }}
    >
      <header className="flex items-center gap-2">
        <h3 className="ds-mono whitespace-nowrap" style={{ fontSize: 11, letterSpacing: '0.08em' }}>{label.toUpperCase()}</h3>
        <span className="ds-mono" style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--surface)', borderRadius: 999, padding: '0 0.45rem' }}>{restingCount}</span>
        <span className="flex-1" />
        {headerNote ? (
          <span
            className="ds-mono inline-flex items-center gap-1 whitespace-nowrap"
            data-testid="column-order-locked"
            style={{ fontSize: 11, color: 'var(--muted)' }}
          >
            <TaskGlyph src="/icons/task-lock.svg" size={12} />
            {headerNote}
          </span>
        ) : null}
        {showQuickAdd && staff && !columnKey.startsWith('unknown') ? (
          quickAddEnabled ? (
            <button type="button" aria-label={`Add task to ${label}`} onClick={onQuick} style={{ color: 'var(--muted)', background: 'none', border: 0, cursor: 'pointer' }}>+</button>
          ) : (
            <DisabledQuickAdd label="+" testId="column-quick-add" labelText={`Add task to ${label}`} />
          )
        ) : null}
      </header>
      <div className="flex flex-col gap-3">
        {loading ? <div className="animate-pulse" style={{ height: 72, borderRadius: 18, background: 'var(--surface)' }} /> : null}
        {cards}
        {quick && quickAddEnabled ? <QuickAdd onClose={onQuickClose} onSave={onQuickAdd} /> : null}
        {!loading && restingCount === 0 && dropIndex == null && !dashed ? (
          <p style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)', border: '1px dashed var(--border)', borderRadius: 12, padding: '0.75rem' }}>
            {emptyClient ? 'Nothing here yet.' : mode === 'stage' ? 'No tasks at this stage. Drag a card here.' : 'No tasks'}
          </p>
        ) : null}
        {showQuickAdd && staff && !columnKey.startsWith('unknown') ? (
          quickAddEnabled ? (
            <button type="button" onClick={onQuick} className="text-left" style={{ border: '1px dashed var(--border)', borderRadius: 18, padding: '0.7rem 0.85rem', color: 'var(--muted)', background: 'transparent' }}>
              + Add task
            </button>
          ) : (
            <DisabledQuickAdd label="+ Add task" testId="column-add-task" block />
          )
        ) : null}
      </div>
    </section>
  );
}

function DisabledQuickAdd({
  label,
  testId,
  block = false,
  labelText,
}: {
  label: string;
  testId: string;
  block?: boolean;
  labelText?: string;
}) {
  const hintId = useId();
  return (
    <span
      tabIndex={0}
      aria-disabled="true"
      aria-describedby={hintId}
      title={NEW_TASK_HINT}
      data-testid={`${testId}-wrap`}
      className={block ? 'item-state-btn flex' : 'item-state-btn inline-flex'}
      style={{ cursor: 'not-allowed' }}
    >
      <button
        type="button"
        disabled
        aria-disabled="true"
        aria-label={labelText}
        tabIndex={-1}
        data-testid={testId}
        style={{
          pointerEvents: 'none',
          opacity: 0.4,
          background: 'transparent',
          color: 'var(--muted)',
          border: block ? '1px dashed var(--border)' : 0,
          borderRadius: block ? 18 : 0,
          padding: block ? '0.7rem 0.85rem' : 0,
          width: block ? '100%' : undefined,
          textAlign: 'left',
          cursor: 'not-allowed',
        }}
      >
        {label}
      </button>
      <span id={hintId} className="sr-only">{NEW_TASK_HINT}</span>
    </span>
  );
}

export function DropPlaceholder({ height }: { height?: number | null }) {
  return (
    <div
      data-testid="drop-placeholder"
      aria-hidden
      className="ds-mono flex items-center justify-center"
      style={{
        height: height && height > 0 ? height : 112,
        background: 'var(--drop-slot-bg, var(--accent-tint))',
        border: 'var(--drop-slot-border, 1.5px dashed var(--border-2))',
        borderRadius: 18,
        color: 'var(--muted)',
        fontSize: 12,
        lineHeight: '18px',
      }}
    >
      Drop here
    </div>
  );
}

export type DragOrigin = { top: number; left: number; width: number; height: number };

/** Pointer drags pin the source at the measured rect. KeyboardSensor has no origin. */
export function collapsedSourceStyle(origin: DragOrigin | null): CSSProperties {
  if (origin) {
    return {
      position: 'fixed',
      top: origin.top,
      left: origin.left,
      width: origin.width,
      height: origin.height,
      opacity: 0,
      pointerEvents: 'none',
      background: 'transparent',
      border: 0,
      padding: 0,
    };
  }
  return {
    height: 0,
    minHeight: 0,
    overflow: 'hidden',
    opacity: 0,
    visibility: 'hidden',
    pointerEvents: 'none',
    background: 'transparent',
    border: 0,
    padding: 0,
    margin: 0,
  };
}

export function collapsedCardBox(origin: DragOrigin | null): CSSProperties {
  return {
    position: 'absolute',
    width: origin ? 0 : '100%',
    height: 0,
    minHeight: 0,
    margin: 0,
    overflow: origin ? 'visible' : 'hidden',
    pointerEvents: 'none',
  };
}

/** Cards plus the Drop here slot. A collapsed source does not count toward the slot index. */
export function BoardDropStack({
  tasks,
  draggingId,
  dropIndex,
  dropHeight,
  renderTask,
}: {
  tasks: PortalTask[];
  draggingId: string | null;
  dropIndex: number | null;
  dropHeight?: number | null;
  renderTask: (task: PortalTask, collapsed: boolean) => ReactNode;
}) {
  return <>{boardDropNodes({ tasks, draggingId, dropIndex, dropHeight, renderTask })}</>;
}

function boardDropNodes({
  tasks,
  draggingId,
  dropIndex,
  dropHeight,
  renderTask,
}: {
  tasks: PortalTask[];
  draggingId: string | null;
  dropIndex: number | null;
  dropHeight?: number | null;
  renderTask: (task: PortalTask, collapsed: boolean) => ReactNode;
}): ReactNode[] {
  const cards: ReactNode[] = [];
  let seen = 0;
  for (const task of tasks) {
    const collapsed = task.id === draggingId;
    if (!collapsed && dropIndex === seen) {
      cards.push(<DropPlaceholder key="drop-here" height={dropHeight} />);
    }
    cards.push(renderTask(task, collapsed));
    if (!collapsed) seen += 1;
  }
  if (dropIndex === seen) cards.push(<DropPlaceholder key="drop-here" height={dropHeight} />);
  return cards;
}

export function BoardToast({
  message,
  retry,
  undo,
  onDismiss,
  pinned = false,
  autoHideMs = 3000,
}: {
  message: string;
  retry?: () => void;
  undo?: () => void;
  onDismiss: () => void;
  /** Desktop: fixed, centered, 16px above the dock. Phone stays in the board flow.
   * The flag-off “Not saved” toast is always pinned so the dock cannot cover it. */
  pinned?: boolean;
  /** Fixture captures pass 0. Live toasts hide after 3s. */
  autoHideMs?: number;
}) {
  const aboveDock = pinned || message === MOVE_NOT_SAVED;
  return (
    <PortalToast
      kind={undo ? 'moved' : 'error'}
      message={message}
      onRetry={retry}
      onUndo={undo}
      onDismiss={onDismiss}
      testId="board-toast"
      placement={aboveDock ? 'above-dock' : 'below-board'}
      autoHideMs={autoHideMs}
    />
  );
}

function PhoneColumnTabs({
  label,
  columns,
  activeTab,
  onSelect,
}: {
  label: string;
  columns: Array<{ key: string; label: string; tasks: unknown[] }>;
  activeTab: string | null;
  onSelect: (key: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState<EdgeFade>({ leading: 0, trailing: 0 });
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    scrollActiveIntoView(node, { activeSelector: '[aria-selected="true"]' });
  }, [activeTab]);
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const update = () => {
      setFade(sectionEdgeFades(node, { activeSelector: '[aria-selected="true"]' }));
    };
    update();
    node.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(node);
    window.addEventListener('resize', update);
    return () => {
      node.removeEventListener('scroll', update);
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [columns, activeTab]);
  const mask = sectionEdgeMask(fade);
  return (
    <div className="relative min-w-0">
      <div
        ref={scroller}
        role="tablist"
        aria-label={label}
        className="flex gap-2 overflow-x-auto pb-1"
        style={{
          scrollbarWidth: 'none',
          ...(mask
            ? {
                maskImage: mask,
                WebkitMaskImage: mask,
              }
            : null),
        }}
      >
        {columns.map((column) => (
          <button
            key={column.key}
            type="button"
            role="tab"
            aria-selected={column.key === activeTab}
            onClick={() => onSelect(column.key)}
            className="ds-mono shrink-0"
            style={{
              minHeight: 44,
              padding: '0.4rem 0.75rem',
              borderRadius: 999,
              border: '1px solid var(--border)',
              background: column.key === activeTab ? 'var(--fg)' : 'transparent',
              color: column.key === activeTab ? 'var(--bg)' : 'var(--muted)',
            }}
          >
            {column.label} {column.tasks.length}
          </button>
        ))}
      </div>
      {fade.leading > 0 ? (
        <div
          aria-hidden
          data-testid="stage-edge-fade-leading"
          className="pointer-events-none absolute inset-y-0 left-0"
          style={{ width: fade.leading, background: 'linear-gradient(to left, transparent, var(--bg) 45%)' }}
        />
      ) : null}
      {fade.trailing > 0 ? (
        <div
          aria-hidden
          data-testid="stage-edge-fade"
          className="pointer-events-none absolute inset-y-0 right-0"
          style={{ width: fade.trailing, background: 'linear-gradient(to right, transparent, var(--bg) 45%)' }}
        />
      ) : null}
    </div>
  );
}

function BoardCard({
  task,
  mode,
  allTasks,
  face,
  canDrag,
  canMoveSheet,
  staff,
  collapsed = false,
  error,
  onLiftSize,
  onOpen,
  onRetry,
  onMoveSheet,
  onKeyMove,
  onKeyOrder,
}: {
  task: PortalTask;
  mode: BoardMode;
  allTasks: PortalTask[];
  face?: CardFace;
  canDrag: boolean;
  /** Press and hold opens the move sheet. Phone only, and never on a read-only board. */
  canMoveSheet: boolean;
  staff: boolean;
  collapsed?: boolean;
  error?: string;
  onLiftSize: (height: number) => void;
  onOpen: () => void;
  onRetry: () => void;
  onMoveSheet: () => void;
  onKeyMove: (task: PortalTask, direction: -1 | 1) => void;
  onKeyOrder?: (task: PortalTask, direction: -1 | 1) => void;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: task.id, disabled: !canDrag });
  const timer = useRef<number | null>(null);
  /** True once a press and hold opened the move sheet, so the release does not also open the task. */
  const held = useRef(false);
  const endPress = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const press = useRef<{ x: number; y: number } | null>(null);
  const origin = useRef<{ top: number; left: number; width: number; height: number } | null>(null);
  const onKeyDown = (event: KeyboardEvent) => {
    if (!canDrag) return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      onKeyMove(task, 1);
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      onKeyMove(task, -1);
    }
    if (onKeyOrder && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      onKeyOrder(task, event.key === 'ArrowUp' ? -1 : 1);
    }
  };
  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    origin.current = { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
    onLiftSize(rect.height);
    press.current = { x: event.clientX, y: event.clientY };
    held.current = false;
    endPress();
    cardDragPointerDown(
      event,
      canDrag ? (pointer) => listeners?.onPointerDown?.(pointer) : undefined,
      canMoveSheet
        ? () => {
            timer.current = window.setTimeout(() => {
              timer.current = null;
              held.current = true;
              onMoveSheet();
            }, LONG_PRESS_MS);
          }
        : undefined,
    );
  };
  const onClick = (event: MouseEvent<HTMLButtonElement>) => {
    const start = press.current;
    press.current = null;
    if (held.current) {
      held.current = false;
      event.preventDefault();
      return;
    }
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) {
      event.preventDefault();
      return;
    }
    onOpen();
  };
  return (
    <article
      className="text-left"
      data-testid="task-card"
      data-task-name={task.name}
      data-collapsed={collapsed ? (origin.current ? 'origin' : 'fallback') : 'rest'}
      style={collapsed ? collapsedCardBox(origin.current) : {
        opacity: 1,
        border: error ? '2px solid var(--danger)' : undefined,
        borderRadius: 12,
      }}
    >
      <button
        ref={setNodeRef}
        type="button"
        {...(canDrag ? attributes : {})}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerUp={endPress}
        onPointerLeave={endPress}
        // A sideways swipe scrolls the lanes. The browser cancels the pointer, and the hold ends with it.
        onPointerCancel={endPress}
        onPointerMove={(event) => {
          const start = press.current;
          if (timer.current && start && pressMoved(start, { x: event.clientX, y: event.clientY })) endPress();
        }}
        onContextMenu={canMoveSheet ? (event) => event.preventDefault() : undefined}
        className="w-full text-left"
        style={collapsed ? collapsedSourceStyle(origin.current) : {
          background: 'transparent',
          border: 0,
          padding: 0,
          cursor: canDrag ? 'grab' : 'pointer',
          touchAction: canDrag ? 'none' : undefined,
          userSelect: canDrag || canMoveSheet ? 'none' : undefined,
          WebkitUserSelect: canMoveSheet ? 'none' : undefined,
          WebkitTouchCallout: canMoveSheet ? 'none' : undefined,
        }}
      >
        <TaskCardFace task={task} mode={mode} allTasks={allTasks} staff={staff} face={face} />
      </button>
      {error ? (
        <p style={{ fontSize: 'var(--t-xs)', color: 'var(--fg)', padding: '0.35rem 0.2rem' }}>
          Couldn’t save. Moved back.{' '}
          <button type="button" onClick={onRetry} style={{ color: 'var(--accent)' }}>Retry</button>
        </p>
      ) : null}
    </article>
  );
}

/** How long a press is held before the move sheet opens. */
export const LONG_PRESS_MS = 400;

/** A finger that travels this far is scrolling, not holding. */
export function pressMoved(start: { x: number; y: number }, now: { x: number; y: number }): boolean {
  return Math.hypot(now.x - start.x, now.y - start.y) > 8;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

/** The card that follows the pointer. It keeps the face the resting card had. */
function LiftedFace({
  task,
  mode,
  allTasks,
  staff,
  cardFace,
}: {
  task?: PortalTask;
  mode: BoardMode;
  allTasks: PortalTask[];
  staff: boolean;
  cardFace?: (task: PortalTask) => CardFace;
}) {
  return <TaskCardFace task={task} lifted mode={mode} allTasks={allTasks} staff={staff} face={task ? cardFace?.(task) : undefined} />;
}

const BADGE_TEXT: CSSProperties = { fontSize: 10.56, lineHeight: '15.84px', letterSpacing: '0.22em', textTransform: 'uppercase', whiteSpace: 'nowrap' };
const BADGE_BOX: CSSProperties = { border: '1px solid var(--border-2)', borderRadius: 999, padding: '2px 8px' };

export function TaskCardFace({
  task,
  lifted = false,
  mode = 'status',
  allTasks = [],
  staff = false,
  face,
}: {
  task?: PortalTask;
  lifted?: boolean;
  mode?: BoardMode;
  allTasks?: PortalTask[];
  staff?: boolean;
  /** The milestone card face. Unset keeps the default face. */
  face?: CardFace;
}) {
  if (!task) return null;
  const children = allTasks.filter((item) => item.parentTaskId === task.id);
  const subLabel = children.length > 0 ? `${children.filter((item) => item.isDone).length}/${children.length}` : null;
  const resources = task.resourceCount ?? 0;
  if (face) {
    const waiting = staff && task.status === 'Blocked' && task.nextAction ? task.nextAction : null;
    return (
      <div
        data-card-face="milestone"
        style={{
          background: lifted ? 'var(--surface-2)' : 'var(--surface)',
          border: `1px solid ${lifted ? 'var(--border-2)' : 'var(--border)'}`,
          borderRadius: 18,
          padding: '14px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          boxShadow: lifted ? '0 16px 32px rgb(0 0 0 / 45%)' : undefined,
          cursor: lifted ? 'grabbing' : undefined,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          {face.leading ? (
            <span data-testid="card-leading" className="inline-flex items-center" style={{ flex: '0 0 auto', height: 21 }}>
              {face.leading}
            </span>
          ) : null}
          {face.run ? (
            <span className="ds-mono" data-testid="card-run" style={{ flex: '0 0 auto', fontSize: 12, lineHeight: '18px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
              {face.run}
            </span>
          ) : null}
          <p
            style={{
              flex: '1 1 0',
              minWidth: 0,
              fontSize: 14,
              fontWeight: 500,
              lineHeight: '21px',
              overflowWrap: 'anywhere',
              color: task.isDone ? 'var(--muted)' : 'var(--fg)',
            }}
          >
            {task.name}
          </p>
          {lifted ? (
            <span style={{ color: 'var(--muted)' }}>
              <TaskGlyph src="/icons/sidebar-menu.svg" size={16} />
            </span>
          ) : null}
        </div>
        {face.origin || subLabel || face.pullRequest ? (
          <div className="flex flex-wrap items-center" style={{ gap: '6px 8px' }}>
            {face.origin ? (
              <span className="ds-mono" data-testid="card-origin" style={{ ...BADGE_BOX, ...BADGE_TEXT, color: 'var(--muted)' }}>
                {face.origin}
              </span>
            ) : null}
            {subLabel ? (
              <span className="ds-mono inline-flex items-center gap-1" data-testid="card-children" style={{ fontSize: 12, lineHeight: '18px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                <TaskGlyph src="/icons/task-checklist.svg" />
                {subLabel}
              </span>
            ) : null}
            {face.pullRequest ? (
              <span className="ds-mono inline-flex items-center" data-testid="card-pr" style={{ ...BADGE_BOX, ...BADGE_TEXT, gap: 6, color: 'var(--fg)' }}>
                <span className="inline-flex" style={{ color: 'var(--muted)' }}>
                  <TaskGlyph src="/icons/task-pull-request.svg" size={12} />
                </span>
                {face.pullRequest}
              </span>
            ) : null}
          </div>
        ) : null}
        {waiting ? (
          <p className="ds-mono" data-testid="card-waiting-on" style={{ minWidth: 0, fontSize: 12, lineHeight: '18px', color: 'var(--danger-text)', overflowWrap: 'anywhere' }}>
            {waiting}
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <div
      style={{
        background: lifted ? 'var(--surface-2)' : 'var(--surface)',
        border: `1px solid ${lifted ? 'var(--border-2)' : 'var(--border)'}`,
        borderRadius: 18,
        padding: '14px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        boxShadow: lifted ? '0 16px 32px rgb(0 0 0 / 45%)' : undefined,
        cursor: lifted ? 'grabbing' : undefined,
      }}
    >
      {lifted ? (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <p style={{ flex: '1 1 auto', minWidth: 0, fontSize: 14, fontWeight: 500, lineHeight: '21px', overflowWrap: 'anywhere' }}>{task.name}</p>
          <span style={{ color: 'var(--muted)' }}>
            <TaskGlyph src="/icons/sidebar-menu.svg" size={16} />
          </span>
        </div>
      ) : (
        <p style={{ minWidth: 0, fontSize: 14, fontWeight: 500, lineHeight: '21px', overflowWrap: 'anywhere' }}>{task.name}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {mode === 'stage' ? <Pill color={taskStatusColor(displayedTaskStatus(task.status, task.stage), task.isDone)}>{displayedTaskStatus(task.status, task.stage)}</Pill> : null}
        {mode === 'status' && task.stage ? (
          <span
            className="ds-mono inline-flex items-center gap-1"
            style={{
              border: '1px solid var(--border)',
              borderRadius: 999,
              padding: '2px 8px',
              fontSize: 11,
              color: 'var(--fg)',
            }}
          >
            <TaskGlyph src="/icons/task-stage.svg" size={12} />
            {task.stage}
          </span>
        ) : null}
        {task.assigneeName ? (
          <span
            aria-label={task.assigneeName}
            title={task.assigneeName}
            className="inline-flex items-center justify-center"
            style={{
              width: 24,
              height: 24,
              borderRadius: 999,
              background: 'var(--surface-2, var(--border))',
              color: 'var(--fg)',
              fontSize: 10,
              fontWeight: 600,
            }}
          >
            {initials(task.assigneeName)}
          </span>
        ) : null}
        {staff && task.stagePending ? (
          <span
            className="ds-mono"
            data-testid="stage-pending"
            style={{
              border: '1px solid var(--border)',
              borderRadius: 999,
              padding: '2px 8px',
              fontSize: 11,
              color: 'var(--warn)',
            }}
          >
            Not in Notion yet
          </span>
        ) : null}
        {staff && task.syncNotice ? <SyncChip audience="staff" syncNotice={task.syncNotice} /> : null}
      </div>
      {staff && mode === 'status' && task.status === 'Blocked' && task.nextAction ? (
        <p data-testid="card-waiting-on" style={{ minWidth: 0, fontSize: 12, lineHeight: '18px', color: 'var(--danger-text)', overflowWrap: 'anywhere' }}>
          {task.nextAction}
        </p>
      ) : null}
      <p className="ds-mono flex flex-wrap items-center gap-3" style={{ fontSize: 12, color: 'var(--muted)' }}>
        <span className="inline-flex items-center gap-1">
          <TaskGlyph src="/icons/task-calendar.svg" />
          {formatPortalDate(task.date)}
        </span>
        {subLabel ? (
          <span className="inline-flex items-center gap-1">
            <TaskGlyph src="/icons/task-list.svg" />
            {subLabel}
          </span>
        ) : null}
        {resources > 0 ? (
          <span className="inline-flex items-center gap-1">
            <TaskGlyph src="/icons/task-link.svg" />
            {resources}
          </span>
        ) : null}
      </p>
    </div>
  );
}

function QuickAdd({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (name: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [name, setName] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    const result = await onSave(name.trim());
    if (!result.ok) {
      setNote(result.error ?? 'Could not save.');
      return;
    }
    setName('');
    setNote(null);
  };
  return (
    <form onSubmit={onSubmit} style={{ border: '2px solid var(--accent)', borderRadius: 12, padding: 10, background: 'var(--surface)' }}>
      <label className="sr-only" htmlFor="quick-add-title">Task title</label>
      <input
        id="quick-add-title"
        autoFocus
        value={name}
        placeholder="Task title"
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
        style={{ width: '100%', border: 0, background: 'transparent', color: 'var(--fg)', outline: 'none' }}
      />
      {note ? <p style={{ fontSize: 'var(--t-xs)', color: 'var(--fg)' }}>{note}</p> : null}
    </form>
  );
}

export function MoveSheet({
  task,
  columns,
  current,
  decisionFor,
  onClose,
  onPick,
  showName = false,
}: {
  task: PortalTask;
  /** The task's name above the rows. The milestone board shows it. Other boards read it to screen readers only. */
  showName?: boolean;
  columns: Array<{ key: string; label: string }>;
  current: string;
  decisionFor: (value: string) => BoardDropDecision;
  onClose: () => void;
  onPick: (value: string) => void;
}) {
  return (
    <Sheet title="Move to" onClose={onClose}>
      <p
        className={showName ? undefined : 'sr-only'}
        data-testid="move-sheet-task"
        style={showName ? { margin: '0 0 12px', fontSize: 14, lineHeight: '21px', color: 'var(--muted)', overflowWrap: 'anywhere' } : undefined}
      >
        {task.name}
      </p>
      <ul className="flex flex-col gap-2">
        {columns.map((column) => {
          const decision = decisionFor(column.key);
          const locked = decision.kind !== 'move' && decision.kind !== 'needs';
          return (
            <li key={column.key}>
              <button
                type="button"
                disabled={locked}
                aria-disabled={locked}
                onClick={() => onPick(column.key)}
                className="flex w-full items-center justify-between text-left"
                style={{ minHeight: 44, border: '1px solid var(--border)', borderRadius: 12, padding: '0.7rem 0.85rem', background: 'var(--surface)', color: 'var(--fg)' }}
              >
                <span>{column.label}{column.key === current ? ' · Current' : ''}</span>
                {decision.kind === 'reject' ? <span style={{ color: 'var(--muted)', fontSize: 'var(--t-xs)' }}>{decision.reason}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

export function NeedsDialog({
  taskName,
  rule,
  onCancel,
  onSave,
  initialValue = '',
  initialNote = '',
  initialError = null,
  copy,
}: {
  taskName: string;
  /** The pull request rule. Absent when `copy` asks its own question. */
  rule?: Extract<MoveRule, { kind: 'needs' }>;
  /** Asks one question in place of the pull request link, with no note for the client. */
  copy?: NeedsCopy;
  onCancel: () => void;
  onSave: (value: string) => void;
  /** Fixture captures only. Live moves start empty. */
  initialValue?: string;
  initialNote?: string;
  initialError?: string | null;
}) {
  const [value, setValue] = useState(initialValue);
  const [clientNote, setClientNote] = useState(initialNote);
  const [error, setError] = useState<string | null>(initialError);
  const field = rule?.fields[0];
  const title = copy?.title ?? 'Move to Ready to Ship';
  return (
    <Modal title={title} onClose={onCancel} labelledBy="needs-title">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!value.trim()) {
            setError(copy?.required ?? 'Pull request link is required.');
            return;
          }
          onSave(value.trim());
        }}
      >
        <p style={{ fontSize: 14, lineHeight: '21px', color: 'var(--muted)', margin: 0 }}>
          {copy ? copy.body(taskName) : `“${taskName}” needs a linked pull request before it can be Ready to Ship. Add it now to move it.`}
        </p>
        <label htmlFor="pr-link" className="flex flex-col gap-2" style={{ fontSize: 14 }}>
          <span>{copy?.label ?? field?.label ?? 'Pull request link'} <span aria-hidden style={{ color: 'var(--danger-text)' }}>*</span></span>
          <span className="needs-field flex items-center gap-2" style={{ border: error ? '2px solid var(--danger)' : '2px solid var(--accent)', borderRadius: 18, background: 'var(--surface-2, var(--bg))', padding: '0.7rem 0.85rem' }}>
            {copy ? null : <span aria-hidden style={{ color: 'var(--muted)' }}>🔗</span>}
            <input
              id="pr-link"
              autoFocus
              required
              value={value}
              maxLength={copy?.maxLength}
              placeholder={copy?.placeholder ?? field?.placeholder ?? 'github.com/…/pull/123'}
              onChange={(event) => setValue(event.target.value)}
              style={{ flex: 1, border: 0, background: 'transparent', color: 'var(--fg)', outline: 'none' }}
            />
          </span>
        </label>
        {copy ? null : <label htmlFor="client-note" className="flex flex-col gap-2" style={{ fontSize: 14 }}>
          Note for the client
          <span className="needs-field block" style={{ borderRadius: 18 }}>
            <textarea
              id="client-note"
              value={clientNote}
              onChange={(event) => setClientNote(event.target.value)}
              rows={3}
              style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 18, background: 'var(--surface-2, var(--bg))', color: 'var(--fg)', padding: '0.7rem 0.85rem', outline: 'none' }}
            />
          </span>
        </label>}
        {error ? <p style={{ color: 'var(--danger-text)', fontSize: 14, margin: 0 }}>{error}</p> : null}
        <div className="flex justify-end gap-2">
          <OutlineButton onClick={onCancel}>Cancel</OutlineButton>
          <PrimaryButton type="submit">{copy?.submit ?? 'Move to Ready to Ship'}</PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <PortalModal testId="task-move-sheet" label={title} onClose={onClose} narrow sheet="bottom" width={640} blueFocus panelStyle={{ padding: '0 16px 16px' }}>
      <div className="mb-3 flex items-center justify-between">
        <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--t-md)' }}>{title}</h2>
        <button type="button" aria-label="Close" onClick={onClose}>Close</button>
      </div>
      {children}
    </PortalModal>
  );
}

function Modal({ title, onClose, labelledBy, children }: { title: string; onClose: () => void; labelledBy: string; children: React.ReactNode }) {
  return (
    <PortalModal testId="task-needs-dialog" label={title} onClose={onClose} width={640} zIndex={85} blueFocus panelStyle={{ padding: 24 }}>
      <h2 id={labelledBy} style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--t-md)', margin: '0 0 12px' }}>{title}</h2>
      {children}
    </PortalModal>
  );
}

function BoardScroller({ children, tracks, shared }: { children: ReactNode; tracks: string; shared: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => {
      const wide = window.matchMedia('(min-width: 1024px)').matches;
      setFade(
        boardShowsEdgeFade({
          wide,
          scrollWidth: node.scrollWidth,
          clientWidth: node.clientWidth,
          scrollLeft: node.scrollLeft,
        }),
      );
    };
    update();
    node.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(node);
    window.addEventListener('resize', update);
    return () => {
      node.removeEventListener('scroll', update);
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [children]);
  const columns = (
    <div
      ref={ref}
      data-testid="task-board-columns"
      className={shared ? 'grid h-full items-stretch gap-3 overflow-x-auto' : 'grid items-start gap-3 overflow-x-auto pb-2'}
      style={{ gridTemplateColumns: tracks, minHeight: shared ? 596 : undefined }}
    >
      {children}
    </div>
  );
  return (
    <div
      className="relative min-w-0"
      data-testid={shared ? 'task-board-surface' : undefined}
      style={
        shared
          ? {
              border: '1px solid var(--border)',
              borderRadius: 16,
              background: 'var(--surface)',
              padding: 12,
              minHeight: 620,
              overflow: 'hidden',
            }
          : undefined
      }
    >
      {columns}
      {shared && fade ? (
        <div
          aria-hidden
          data-testid="board-edge-fade"
          className="pointer-events-none absolute"
          style={{
            top: 12,
            bottom: 12,
            right: 12,
            width: 72,
            background: 'linear-gradient(to right, transparent, var(--surface))',
          }}
        />
      ) : null}
    </div>
  );
}
