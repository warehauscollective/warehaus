'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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
import { OutlineButton, Pill, PrimaryButton } from '@/components/ui/primitives';
import { SyncChip } from '@/components/sync/SyncChip';
import { formatPortalDate, taskStatusColor, type PortalTask } from '@/lib/data/view-models';
import { scrollActiveIntoView, sectionEdgeFadePx } from '@/components/layout/sectionEdgeFade';
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
};

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
export function boardColumnTemplate(count: number, phone: boolean): string {
  if (phone) return 'minmax(0, 1fr)';
  return `repeat(${Math.max(count, 1)}, minmax(12.75rem, 1fr))`;
}

/** A drop stays in the new column only when enqueue accepts it. */
export function boardMovePersists(result: { ok: boolean }): boolean {
  return result.ok;
}

export function flagOffDropMessage(result: { ok: boolean; error?: string }): string | null {
  if (!result.ok && result.error === WRITEBACK_OFF_ERROR) return MOVE_NOT_SAVED;
  return null;
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
}: {
  tasks: PortalTask[];
  staff: boolean;
  loading: boolean;
  rules: BoardRules | null;
  onOpen: (task: PortalTask) => void;
  onMove: (request: MoveRequest) => Promise<{ ok: boolean; error?: string; pending?: boolean }>;
  onQuickAdd: (input: { name: string; status: string; stage?: string }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [mode, setMode] = useState<BoardMode>('status');
  const [phone, setPhone] = useState(false);
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
  const [quick, setQuick] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    setMode(readBoardMode());
    const media = window.matchMedia('(max-width: 767px)');
    const apply = () => setPhone(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

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
  const columns = useMemo(
    () => boardColumns(viewTasks.filter((task) => !task.parentTaskId), mode, staff ? 'staff' : 'client'),
    [viewTasks, mode, staff],
  );
  const activeTab = tab && columns.some((column) => column.key === tab) ? tab : columns[0]?.key ?? null;
  const shown = phone ? columns.filter((column) => column.key === activeTab) : columns;
  const canDrag = staff && !phone && rules?.actor === 'staff';

  const chooseMode = (next: BoardMode) => {
    setMode(next);
    setTab(null);
    window.localStorage.setItem(GROUP_KEY, next);
  };

  const actor = (): MoveActor => (staff && rules?.actor === 'staff' ? 'staff' : 'client');

  const dropFrom = (task: PortalTask) => (mode === 'stage' ? task.stage ?? '' : task.status);

  const decide = (task: PortalTask, value: string): BoardDropDecision =>
    resolveBoardDrop({ actor: actor(), mode, from: dropFrom(task), to: value });

  const rejectMove = (reason: string) => {
    setLive(reason);
    setToast({ message: reason });
  };

  const commit = async (task: PortalTask, value: string, pullRequestLink?: string) => {
    const previous = mode === 'stage' ? task.stage ?? '' : task.status;
    if (previous === value) return;
    setOverrides((current) => ({ ...current, [task.id]: { mode, value } }));
    setFailed((current) => {
      const next = { ...current };
      delete next[task.id];
      return next;
    });
    setLive(`Moved ${task.name} to ${value}. Saving.`);
    const result = await onMove({ task, mode, value, pullRequestLink });
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
        retry: () => void commit(task, value, pullRequestLink),
      });
      setLive(`${task.name} moved back. ${result.error ?? 'Couldn’t save.'}`);
      return;
    }
    if (mode === 'stage') {
      setOverrides((current) => ({
        ...current,
        [task.id]: { mode, value, pending: result.pending !== false },
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

  const onDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    setOverKey(null);
    setLiftedHeight(null);
    const task = tasks.find((item) => item.id === String(event.active.id));
    const viewed = viewTasks.find((item) => item.id === String(event.active.id));
    const over = event.over ? String(event.over.id) : '';
    if (!task || !viewed || !over.startsWith('column:')) return;
    const value = over.slice('column:'.length);
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
    void commit(viewed, decision.value);
  };

  const onDragOver = (event: DragOverEvent) => {
    const over = event.over ? String(event.over.id) : '';
    setOverKey(over.startsWith('column:') ? over.slice('column:'.length) : null);
  };

  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="task-board">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <GroupToggle mode={mode} onChange={chooseMode} />
        <p className="sr-only" aria-live="polite">{live}</p>
      </div>
      {phone ? (
        <PhoneColumnTabs
          label={mode === 'stage' ? 'Stages' : 'Statuses'}
          columns={columns}
          activeTab={activeTab}
          inset={!staff}
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
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveId(null);
          setOverKey(null);
          setLiftedHeight(null);
          setLive('Move cancelled.');
        }}
      >
        <BoardScroller tracks={boardColumnTemplate(shown.length, phone)}>
          {shown.map((column) => {
            const dragging = activeId ? viewTasks.find((task) => task.id === activeId) : undefined;
            const hover = dragging && overKey === column.key ? decide(dragging, column.key) : null;
            const accepting = hover?.kind === 'move' || hover?.kind === 'needs';
            const resting = dragging ? column.tasks.filter((task) => task.id !== dragging.id) : column.tasks;
            return (
            <Column
              key={column.key}
              columnKey={column.key}
              label={column.label}
              tasks={column.tasks}
              allTasks={viewTasks}
              staff={staff}
              loading={loading}
              canDrag={canDrag}
              failed={failed}
              locked={hover?.kind === 'reject'}
              activeTarget={accepting}
              draggingId={activeId}
              dropIndex={dragging && accepting ? dropSlotIndex(resting, dragging) : null}
              dropHeight={liftedHeight}
              phone={phone}
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
              onQuick={() => setQuick(column.key)}
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
                else void commit(task, decision.value);
              }}
            />
            );
          })}
        </BoardScroller>
        <DragOverlay dropAnimation={null} style={{ cursor: 'grabbing' }}>
          {activeId ? (
            <div style={{ height: '100%', transform: 'rotate(2deg) scale(1.03)', transformOrigin: 'center center', cursor: 'grabbing' }}>
              <TaskCardFace task={viewTasks.find((task) => task.id === activeId) ?? tasks[0]} lifted mode={mode} allTasks={viewTasks} staff={staff} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      {tasks.length === 0 && !loading ? (
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
          {staff ? 'No tasks yet. Add one from a column.' : 'Nothing here yet.'}
        </p>
      ) : null}
      {toast ? (
        <BoardToast
          message={toast.message}
          retry={toast.retry}
          undo={toast.undo ? () => { toast.undo?.(); setToast(null); } : undefined}
          onDismiss={() => setToast(null)}
          pinned={!phone}
        />
      ) : null}
      {moveTask ? (
        <MoveSheet
          task={moveTask}
          columns={columns.filter((column) => !column.key.startsWith('unknown'))}
          current={dropFrom(moveTask)}
          decisionFor={(value) => decide(moveTask, value)}
          onClose={() => setMoveTask(null)}
          onPick={(value) => {
            const decision = decide(moveTask, value);
            setMoveTask(null);
            if (decision.kind === 'needs') setNeeds({ task: moveTask, value, rule: decision.rule });
            else if (decision.kind === 'move') void commit(moveTask, decision.value);
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
  staff,
  loading,
  canDrag,
  failed,
  locked,
  activeTarget,
  draggingId,
  dropIndex,
  dropHeight,
  phone,
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
  onKeyMove,
}: {
  columnKey: string;
  label: string;
  tasks: PortalTask[];
  allTasks: PortalTask[];
  staff: boolean;
  loading: boolean;
  canDrag: boolean;
  failed: Record<string, string>;
  locked: boolean;
  activeTarget: boolean;
  draggingId: string | null;
  dropIndex: number | null;
  dropHeight: number | null;
  phone: boolean;
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
  onKeyMove: (task: PortalTask, direction: -1 | 1) => void;
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
        canDrag={canDrag}
        phone={phone}
        staff={staff}
        collapsed={collapsed}
        error={failed[task.id]}
        onLiftSize={onLiftSize}
        onOpen={() => onOpen(task)}
        onRetry={() => onRetry(task)}
        onMoveSheet={() => onMoveSheet(task)}
        onKeyMove={onKeyMove}
      />
    ),
  });
  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      data-testid="task-column"
      className="flex min-w-0 w-full flex-col"
      style={{
        position: 'relative',
        minWidth: 0,
        boxSizing: 'border-box',
        padding: 12,
        gap: 12,
        borderRadius: 16,
        border: locked
          ? '2px dashed var(--danger)'
          : dashed
            ? '1px dashed var(--border)'
            : activeTarget
              ? '2px solid var(--accent)'
              : '1px solid var(--border)',
        background: activeTarget ? 'var(--accent-tint)' : 'var(--bg)',
      }}
    >
      <header className="flex items-center gap-2">
        <h3 className="ds-mono whitespace-nowrap" style={{ fontSize: 11, letterSpacing: '0.08em' }}>{label.toUpperCase()}</h3>
        <span className="ds-mono" style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--surface)', borderRadius: 999, padding: '0 0.45rem' }}>{restingCount}</span>
        <span className="flex-1" />
        {staff && !columnKey.startsWith('unknown') ? (
          <button type="button" aria-label={`Add task to ${label}`} onClick={onQuick} style={{ color: 'var(--muted)', background: 'none', border: 0, cursor: 'pointer' }}>+</button>
        ) : null}
      </header>
      <div className="flex flex-col gap-3">
        {loading ? <div className="animate-pulse" style={{ height: 72, borderRadius: 18, background: 'var(--surface)' }} /> : null}
        {cards}
        {quick ? <QuickAdd onClose={onQuickClose} onSave={onQuickAdd} /> : null}
        {!loading && restingCount === 0 && dropIndex == null && !dashed ? (
          <p style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)', border: '1px dashed var(--border)', borderRadius: 12, padding: '0.75rem' }}>
            {emptyClient ? 'Nothing here yet.' : mode === 'stage' ? 'No tasks at this stage. Drag a card here.' : 'No tasks'}
          </p>
        ) : null}
        {staff && !columnKey.startsWith('unknown') ? (
          <button type="button" onClick={onQuick} className="text-left" style={{ border: '1px dashed var(--border)', borderRadius: 18, padding: '0.7rem 0.85rem', color: 'var(--muted)', background: 'transparent' }}>
            + Add task
          </button>
        ) : null}
      </div>
    </section>
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
    overflow: 'hidden',
    opacity: 0,
    visibility: 'hidden',
    pointerEvents: 'none',
    background: 'transparent',
    border: 0,
    padding: 0,
  };
}

export function collapsedCardBox(origin: DragOrigin | null): CSSProperties {
  return {
    position: 'absolute',
    width: origin ? 0 : '100%',
    height: 0,
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
}: {
  message: string;
  retry?: () => void;
  undo?: () => void;
  onDismiss: () => void;
  /** Desktop: fixed, centered, 16px above the dock. Phone stays in the board flow. */
  pinned?: boolean;
}) {
  const quiet = {
    color: 'var(--muted)',
    background: 'none',
    border: 0,
    padding: 0,
    cursor: 'pointer',
    fontWeight: 500,
    fontSize: 14,
    lineHeight: '21px',
  } as const;
  const node = (
    <div
      role="status"
      data-testid="board-toast"
      data-placement={pinned ? 'above-dock' : 'below-board'}
      className="ds-scope mx-auto flex w-fit max-w-full items-center"
      style={{
        position: pinned ? 'fixed' : 'relative',
        left: pinned ? '50%' : undefined,
        bottom: pinned ? 'calc(1.25rem + 3.5rem + 16px)' : undefined,
        transform: pinned ? 'translateX(-50%)' : undefined,
        zIndex: pinned ? 45 : undefined,
        marginTop: pinned ? 0 : 16,
        gap: 12,
        background: 'var(--surface-2)',
        color: 'var(--fg)',
        border: retry ? '1px solid var(--danger)' : '1px solid var(--border-2)',
        borderRadius: 18,
        padding: '12px 16px',
        boxShadow: pinned ? '0 8px 12px rgb(0 0 0 / 35%)' : 'none',
        fontSize: 14,
        lineHeight: '21px',
        maxWidth: pinned ? 'calc(100vw - 32px)' : undefined,
      }}
    >
      {undo ? <TaskGlyph src="/icons/docs-check.svg" size={16} /> : null}
      <span>{message}</span>
      {retry ? (
        <button type="button" onClick={retry} style={{ color: 'var(--accent)', background: 'none', border: 0, cursor: 'pointer' }}>Retry</button>
      ) : null}
      {undo ? (
        <button type="button" onClick={undo} style={quiet}>Undo</button>
      ) : null}
      <button type="button" aria-label="Dismiss" onClick={onDismiss} style={quiet}>✕</button>
    </div>
  );
  return pinned ? portalNode(node) : node;
}

function PhoneColumnTabs({
  label,
  columns,
  activeTab,
  inset,
  onSelect,
}: {
  label: string;
  columns: Array<{ key: string; label: string; tasks: unknown[] }>;
  activeTab: string | null;
  inset: boolean;
  onSelect: (key: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [fadePx, setFadePx] = useState(0);
  useEffect(() => {
    const node = scroller.current;
    if (!node || !inset) return;
    scrollActiveIntoView(node, { inset: true, activeSelector: '[aria-selected="true"]' });
  }, [activeTab, inset]);
  useEffect(() => {
    const node = scroller.current;
    if (!node || !inset) return;
    const update = () => {
      setFadePx(sectionEdgeFadePx(node, { inset: true, activeSelector: '[aria-selected="true"]' }));
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
  }, [columns, activeTab, inset]);
  const fade = fadePx > 0;
  return (
    <div className="relative min-w-0">
      <div
        ref={scroller}
        role="tablist"
        aria-label={label}
        className="flex gap-2 overflow-x-auto pb-1"
        style={{
          paddingLeft: inset ? 20 : undefined,
          scrollPaddingLeft: inset ? 20 : undefined,
          scrollbarWidth: inset ? 'none' : undefined,
          ...(fade
            ? {
                maskImage: `linear-gradient(to right, #000 0, #000 calc(100% - ${fadePx}px), transparent calc(100% - ${Math.round(fadePx * 0.45)}px))`,
                WebkitMaskImage: `linear-gradient(to right, #000 0, #000 calc(100% - ${fadePx}px), transparent calc(100% - ${Math.round(fadePx * 0.45)}px))`,
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
      {fade ? (
        <div
          aria-hidden
          data-testid="stage-edge-fade"
          className="pointer-events-none absolute inset-y-0 right-0"
          style={{ width: fadePx, background: 'linear-gradient(to right, transparent, var(--bg) 45%)' }}
        />
      ) : null}
    </div>
  );
}

function BoardCard({
  task,
  mode,
  allTasks,
  canDrag,
  phone,
  staff,
  collapsed = false,
  error,
  onLiftSize,
  onOpen,
  onRetry,
  onMoveSheet,
  onKeyMove,
}: {
  task: PortalTask;
  mode: BoardMode;
  allTasks: PortalTask[];
  canDrag: boolean;
  phone: boolean;
  staff: boolean;
  collapsed?: boolean;
  error?: string;
  onLiftSize: (height: number) => void;
  onOpen: () => void;
  onRetry: () => void;
  onMoveSheet: () => void;
  onKeyMove: (task: PortalTask, direction: -1 | 1) => void;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: task.id, disabled: !canDrag });
  const timer = useRef<number | null>(null);
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
  };
  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    origin.current = { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
    onLiftSize(rect.height);
    press.current = { x: event.clientX, y: event.clientY };
    cardDragPointerDown(
      event,
      canDrag ? (pointer) => listeners?.onPointerDown?.(pointer) : undefined,
      phone
        ? () => {
            timer.current = window.setTimeout(() => onMoveSheet(), 400);
          }
        : undefined,
    );
  };
  const onClick = (event: MouseEvent<HTMLButtonElement>) => {
    const start = press.current;
    press.current = null;
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
        onPointerUp={() => {
          if (timer.current) window.clearTimeout(timer.current);
        }}
        onPointerLeave={() => {
          if (timer.current) window.clearTimeout(timer.current);
        }}
        className="w-full text-left"
        style={collapsed ? collapsedSourceStyle(origin.current) : {
          background: 'transparent',
          border: 0,
          padding: 0,
          cursor: canDrag ? 'grab' : 'pointer',
          touchAction: canDrag ? 'none' : undefined,
          userSelect: canDrag ? 'none' : undefined,
        }}
      >
        <TaskCardFace task={task} mode={mode} allTasks={allTasks} staff={staff} />
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

export function TaskCardFace({
  task,
  lifted = false,
  mode = 'status',
  allTasks = [],
  staff = false,
}: {
  task?: PortalTask;
  lifted?: boolean;
  mode?: BoardMode;
  allTasks?: PortalTask[];
  staff?: boolean;
}) {
  if (!task) return null;
  const children = allTasks.filter((item) => item.parentTaskId === task.id);
  const subLabel = children.length > 0 ? `${children.filter((item) => item.isDone).length}/${children.length}` : null;
  const resources = task.resourceCount ?? 0;
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
          <p style={{ flex: '1 1 auto', minWidth: 0, fontSize: 14, fontWeight: 500, lineHeight: '21px' }}>{task.name}</p>
          <span style={{ color: 'var(--muted)' }}>
            <TaskGlyph src="/icons/sidebar-menu.svg" size={16} />
          </span>
        </div>
      ) : (
        <p style={{ fontSize: 14, fontWeight: 500, lineHeight: '21px' }}>{task.name}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {mode === 'stage' ? <Pill color={taskStatusColor(task.status, task.isDone)}>{task.status}</Pill> : null}
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

function MoveSheet({
  task,
  columns,
  current,
  decisionFor,
  onClose,
  onPick,
}: {
  task: PortalTask;
  columns: Array<{ key: string; label: string }>;
  current: string;
  decisionFor: (value: string) => BoardDropDecision;
  onClose: () => void;
  onPick: (value: string) => void;
}) {
  return (
    <Sheet title="Move to" onClose={onClose}>
      <p className="sr-only">{task.name}</p>
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

function NeedsDialog({
  taskName,
  rule,
  onCancel,
  onSave,
}: {
  taskName: string;
  rule: Extract<MoveRule, { kind: 'needs' }>;
  onCancel: () => void;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState('');
  const [clientNote, setClientNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const field = rule.fields[0];
  return (
    <Modal title="Move to Ready to Ship" onClose={onCancel} labelledBy="needs-title">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!value.trim()) {
            setError('Pull request link is required.');
            return;
          }
          onSave(value.trim());
        }}
      >
        <p style={{ fontSize: 14, lineHeight: '21px', color: 'var(--muted)', margin: 0 }}>
          “{taskName}” needs a linked pull request before it can be Ready to Ship. Add it now to move it.
        </p>
        <label htmlFor="pr-link" className="flex flex-col gap-2" style={{ fontSize: 14 }}>
          <span>{field?.label ?? 'Pull request link'} <span aria-hidden style={{ color: 'var(--danger)' }}>*</span></span>
          <span className="flex items-center gap-2" style={{ border: error ? '2px solid var(--danger)' : '2px solid var(--accent)', borderRadius: 18, background: 'var(--surface-2, var(--bg))', padding: '0.7rem 0.85rem' }}>
            <span aria-hidden style={{ color: 'var(--muted)' }}>🔗</span>
            <input
              id="pr-link"
              autoFocus
              required
              value={value}
              placeholder={field?.placeholder ?? 'github.com/…/pull/123'}
              onChange={(event) => setValue(event.target.value)}
              style={{ flex: 1, border: 0, background: 'transparent', color: 'var(--fg)', outline: 'none' }}
            />
          </span>
        </label>
        <label htmlFor="client-note" className="flex flex-col gap-2" style={{ fontSize: 14 }}>
          Note for the client
          <textarea
            id="client-note"
            value={clientNote}
            onChange={(event) => setClientNote(event.target.value)}
            rows={3}
            style={{ border: '1px solid var(--border)', borderRadius: 18, background: 'var(--surface-2, var(--bg))', color: 'var(--fg)', padding: '0.7rem 0.85rem' }}
          />
        </label>
        {error ? <p style={{ color: 'var(--danger)', fontSize: 14, margin: 0 }}>{error}</p> : null}
        <div className="flex justify-end gap-2">
          <OutlineButton onClick={onCancel}>Cancel</OutlineButton>
          <PrimaryButton type="submit">Move to Ready to Ship</PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return portalNode(
    <div className="ds-scope" role="presentation" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgb(0 0 0 / 55%)', display: 'flex', alignItems: 'flex-end' }}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()} style={{ width: '100%', background: 'var(--surface)', borderRadius: '16px 16px 0 0', padding: 16, maxHeight: '80dvh', overflow: 'auto' }}>
        <div className="mb-3 flex items-center justify-between">
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--t-md)' }}>{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Modal({ title, onClose, labelledBy, children }: { title: string; onClose: () => void; labelledBy: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => [...(node?.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href]') ?? [])];
    focusable()[0]?.focus({ preventScroll: true });
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
      if (event.key !== 'Tab' || !node) return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus({ preventScroll: true });
    };
  }, [onClose]);
  return portalNode(
    <div className="ds-scope" role="presentation" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 85, background: 'rgb(0 0 0 / 55%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={labelledBy} onClick={(event) => event.stopPropagation()} style={{ width: 'min(100%, 480px)', background: 'var(--surface)', borderRadius: 16, padding: 24 }}>
        <h2 id={labelledBy} style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--t-md)', marginBottom: 12 }}>{title}</h2>
        {children}
      </div>
    </div>,
  );
}

function portalNode(node: ReactNode) {
  if (typeof document === 'undefined') return node;
  return createPortal(node, document.body);
}

function BoardScroller({ children, tracks }: { children: ReactNode; tracks: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => {
      const wide = window.matchMedia('(min-width: 1024px)').matches;
      const overflow = node.scrollWidth - node.clientWidth > 1;
      const atEnd = node.scrollLeft + node.clientWidth >= node.scrollWidth - 1;
      setFade(wide && overflow && !atEnd);
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
  return (
    <div className="relative min-w-0">
      <div
        ref={ref}
        data-testid="task-board-columns"
        className="grid items-start gap-3 overflow-x-auto pb-2"
        style={{ gridTemplateColumns: tracks }}
      >
        {children}
      </div>
      {fade ? (
        <div
          aria-hidden
          data-testid="board-edge-fade"
          className="pointer-events-none absolute inset-y-0 right-0"
          style={{ width: 72, background: 'linear-gradient(to right, transparent, var(--bg))' }}
        />
      ) : null}
    </div>
  );
}
