'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { boardColumns, isTaskStage, unstagedMoveAllowed, type MoveRule } from '@warehaus/portal-sync';
import { OutlineButton, Pill, PrimaryButton } from '@/components/ui/primitives';
import { SyncChip } from '@/components/sync/SyncChip';
import { formatPortalDate, taskStatusColor, type PortalTask } from '@/lib/data/view-models';
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
  onMove: (request: MoveRequest) => Promise<{ ok: boolean; error?: string }>;
  onQuickAdd: (input: { name: string; status: string; stage?: string }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [mode, setMode] = useState<BoardMode>('status');
  const [phone, setPhone] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, { mode: BoardMode; value: string }>>({});
  const [failed, setFailed] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ message: string; retry?: () => void; undo?: () => void } | null>(null);
  const [live, setLive] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
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
        return { ...task, stage: override.value };
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

  const ruleFor = (value: string): MoveRule => {
    if (!rules || rules.actor !== 'staff') return { kind: 'denied', reason: 'Clients cannot move tasks.' };
    const list = mode === 'stage' ? rules.stages : rules.statuses;
    const found = list.find((item) => ('stage' in item ? item.stage : item.status) === value);
    return found?.rule ?? { kind: 'denied', reason: mode === 'stage' ? 'Unknown stage' : 'Unknown status' };
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
    if (!result.ok) {
      setOverrides((current) => {
        const next = { ...current };
        delete next[task.id];
        return next;
      });
      setFailed((current) => ({ ...current, [task.id]: result.error ?? 'Couldn’t save. Moved back.' }));
      setToast({
        message: result.error ?? 'Couldn’t save. Moved back.',
        retry: () => void commit(task, value, pullRequestLink),
      });
      setLive(`${task.name} moved back. ${result.error ?? 'Couldn’t save.'}`);
      return;
    }
    setToast({
      message: `Moved ${task.name} to ${value}`,
      undo: () => void commit({ ...task, ...(mode === 'stage' ? { stage: value } : { status: value }) }, previous),
    });
    setLive(`Moved ${task.name} to ${value}.`);
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    setOverKey(null);
    const task = tasks.find((item) => item.id === String(event.active.id));
    const viewed = viewTasks.find((item) => item.id === String(event.active.id));
    const over = event.over ? String(event.over.id) : '';
    if (!task || !over.startsWith('column:')) return;
    const value = over.slice('column:'.length);
    if (value.startsWith('unknown')) {
      setLive('That column is not a destination.');
      return;
    }
    if (mode === 'stage' && !isTaskStage(viewed?.stage ?? '') && !unstagedMoveAllowed(value)) {
      const message = 'Tasks with no stage can move to Idea or Planning.';
      setLive(message);
      setToast({ message });
      return;
    }
    const current = mode === 'stage' ? viewed?.stage ?? task.stage : task.status;
    if (current === value) return;
    const rule = ruleFor(value);
    if (rule.kind === 'locked' || rule.kind === 'denied') {
      setLive(rule.reason);
      setToast({ message: rule.reason });
      return;
    }
    if (rule.kind === 'needs') {
      setNeeds({ task, value, rule });
      return;
    }
    void commit(task, value);
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
        <div role="tablist" aria-label={mode === 'stage' ? 'Stages' : 'Statuses'} className="flex gap-2 overflow-x-auto pb-1">
          {columns.map((column) => (
            <button
              key={column.key}
              type="button"
              role="tab"
              aria-selected={column.key === activeTab}
              onClick={() => setTab(column.key)}
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
      ) : null}
      <DndContext
        sensors={sensors}
        onDragStart={(event) => setActiveId(String(event.active.id))}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveId(null);
          setOverKey(null);
          setLive('Move cancelled.');
        }}
      >
        <BoardScroller>
          {shown.map((column) => (
            <Column
              key={column.key}
              columnKey={column.key}
              label={column.label}
              tasks={column.tasks}
              allTasks={viewTasks}
              width={phone ? undefined : undefined}
              staff={staff}
              loading={loading}
              canDrag={canDrag}
              failed={failed}
              locked={overKey === column.key && ruleFor(column.key).kind === 'locked'}
              activeTarget={overKey === column.key && ruleFor(column.key).kind === 'allowed'}
              phone={phone}
              mode={mode}
              emptyClient={!staff}
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
                if (!next || next.key.startsWith('unknown') || !canDrag) return;
                if (mode === 'stage' && !isTaskStage(task.stage ?? '') && !unstagedMoveAllowed(next.key)) {
                  setLive('Tasks with no stage can move to Idea or Planning.');
                  return;
                }
                const rule = ruleFor(next.key);
                if (rule.kind === 'needs') setNeeds({ task, value: next.key, rule });
                else if (rule.kind === 'allowed') void commit(task, next.key);
                else setLive(rule.reason);
              }}
            />
          ))}
        </BoardScroller>
        <DragOverlay>
          {activeId ? (
            <div style={{ transform: 'rotate(2deg) scale(1.03)', cursor: 'grabbing' }}>
              <TaskCardFace task={viewTasks.find((task) => task.id === activeId) ?? tasks[0]} lifted mode={mode} allTasks={viewTasks} />
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
        <div
          role="status"
          className="fixed bottom-24 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-3"
          style={{
            background: 'var(--surface)',
            color: 'var(--fg)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '0.75rem 1rem',
            maxWidth: 'min(36rem, calc(100% - 2rem))',
          }}
        >
          <span style={{ fontSize: 'var(--t-sm)' }}>{toast.message}</span>
          {toast.retry ? (
            <button type="button" onClick={toast.retry} style={{ color: 'var(--accent)' }}>Retry</button>
          ) : null}
          {toast.undo ? (
            <button type="button" onClick={() => { toast.undo?.(); setToast(null); }} style={{ color: 'var(--accent)' }}>Undo</button>
          ) : null}
          <button type="button" aria-label="Dismiss" onClick={() => setToast(null)} style={{ color: 'var(--muted)' }}>✕</button>
        </div>
      ) : null}
      {moveTask ? (
        <MoveSheet
          task={moveTask}
          columns={columns.filter((column) => !column.key.startsWith('unknown'))}
          current={mode === 'stage' ? moveTask.stage ?? '' : moveTask.status}
          fromUnstaged={mode === 'stage' && !isTaskStage(moveTask.stage ?? '')}
          ruleFor={ruleFor}
          onClose={() => setMoveTask(null)}
          onPick={(value, rule) => {
            setMoveTask(null);
            if (rule.kind === 'needs') setNeeds({ task: moveTask, value, rule });
            else if (rule.kind === 'allowed') void commit(moveTask, value);
            else setLive(rule.reason);
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
  width,
  staff,
  loading,
  canDrag,
  failed,
  locked,
  activeTarget,
  phone,
  mode,
  emptyClient,
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
  width?: number;
  staff: boolean;
  loading: boolean;
  canDrag: boolean;
  failed: Record<string, string>;
  locked: boolean;
  activeTarget: boolean;
  phone: boolean;
  mode: BoardMode;
  emptyClient: boolean;
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
  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      className="flex shrink-0 flex-col"
      style={{
        width: phone ? '100%' : width,
        minWidth: phone ? 0 : '12.75rem',
        flex: phone ? '1 1 auto' : '0 0 auto',
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
        background: activeTarget ? 'color-mix(in oklab, var(--accent) 12%, var(--bg))' : 'var(--bg)',
      }}
    >
      <header className="flex items-center gap-2">
        <h3 className="ds-mono whitespace-nowrap" style={{ fontSize: 11, letterSpacing: '0.08em' }}>{label.toUpperCase()}</h3>
        <span className="ds-mono" style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--surface)', borderRadius: 999, padding: '0 0.45rem' }}>{tasks.length}</span>
        <span className="flex-1" />
        {staff && !columnKey.startsWith('unknown') ? (
          <button type="button" aria-label={`Add task to ${label}`} onClick={onQuick} style={{ color: 'var(--muted)', background: 'none', border: 0, cursor: 'pointer' }}>+</button>
        ) : null}
      </header>
      <div className="flex flex-col gap-3">
        {loading ? <div className="animate-pulse" style={{ height: 72, borderRadius: 18, background: 'var(--surface)' }} /> : null}
        {tasks.map((task) => (
          <BoardCard
            key={task.id}
            task={task}
            mode={mode}
            allTasks={allTasks}
            canDrag={canDrag}
            phone={phone}
            error={failed[task.id]}
            onOpen={() => onOpen(task)}
            onRetry={() => onRetry(task)}
            onMoveSheet={() => onMoveSheet(task)}
            onKeyMove={onKeyMove}
          />
        ))}
        {quick ? <QuickAdd onClose={onQuickClose} onSave={onQuickAdd} /> : null}
        {!loading && tasks.length === 0 && !dashed ? (
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

function BoardCard({
  task,
  mode,
  allTasks,
  canDrag,
  phone,
  error,
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
  error?: string;
  onOpen: () => void;
  onRetry: () => void;
  onMoveSheet: () => void;
  onKeyMove: (task: PortalTask, direction: -1 | 1) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, disabled: !canDrag });
  const timer = useRef<number | null>(null);
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
  return (
    <article
      className="text-left"
      style={{ opacity: isDragging ? 0.35 : 1, border: error ? '2px solid var(--danger)' : undefined, borderRadius: 12 }}
    >
      <button
        ref={setNodeRef}
        type="button"
        {...(canDrag ? attributes : {})}
        {...(canDrag ? listeners : {})}
        onClick={onOpen}
        onKeyDown={onKeyDown}
        onPointerDown={() => {
          if (!phone) return;
          timer.current = window.setTimeout(() => onMoveSheet(), 400);
        }}
        onPointerUp={() => {
          if (timer.current) window.clearTimeout(timer.current);
        }}
        onPointerLeave={() => {
          if (timer.current) window.clearTimeout(timer.current);
        }}
        className="w-full text-left"
        style={{ background: 'transparent', border: 0, padding: 0, cursor: canDrag ? 'grab' : 'pointer' }}
      >
        <TaskCardFace task={task} mode={mode} allTasks={allTasks} />
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

function TaskCardFace({
  task,
  lifted = false,
  mode = 'status',
  allTasks = [],
}: {
  task?: PortalTask;
  lifted?: boolean;
  mode?: BoardMode;
  allTasks?: PortalTask[];
}) {
  if (!task) return null;
  const children = allTasks.filter((item) => item.parentTaskId === task.id);
  const subLabel = children.length > 0 ? `${children.filter((item) => item.isDone).length}/${children.length}` : null;
  const resources = task.resourceCount ?? 0;
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 18,
        padding: '14px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        boxShadow: lifted ? '0 16px 32px rgb(0 0 0 / 45%)' : undefined,
      }}
    >
      <p style={{ fontSize: 14, fontWeight: 500, lineHeight: '21px' }}>{task.name}</p>
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
        {task.syncNotice ? <SyncChip syncNotice={task.syncNotice} /> : null}
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
  fromUnstaged,
  ruleFor,
  onClose,
  onPick,
}: {
  task: PortalTask;
  columns: Array<{ key: string; label: string }>;
  current: string;
  fromUnstaged: boolean;
  ruleFor: (value: string) => MoveRule;
  onClose: () => void;
  onPick: (value: string, rule: MoveRule) => void;
}) {
  return (
    <Sheet title="Move to" onClose={onClose}>
      <p className="sr-only">{task.name}</p>
      <ul className="flex flex-col gap-2">
        {columns.map((column) => {
          const rule = fromUnstaged && !unstagedMoveAllowed(column.key)
            ? { kind: 'denied' as const, reason: 'Choose Idea or Planning.' }
            : ruleFor(column.key);
          const locked = rule.kind === 'locked' || rule.kind === 'denied';
          return (
            <li key={column.key}>
              <button
                type="button"
                disabled={locked}
                aria-disabled={locked}
                onClick={() => onPick(column.key, rule)}
                className="flex w-full items-center justify-between text-left"
                style={{ minHeight: 44, border: '1px solid var(--border)', borderRadius: 12, padding: '0.7rem 0.85rem', background: 'var(--surface)', color: 'var(--fg)' }}
              >
                <span>{column.label}{column.key === current ? ' · Current' : ''}</span>
                {locked ? <span style={{ color: 'var(--muted)', fontSize: 'var(--t-xs)' }}>{rule.reason}</span> : null}
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

function BoardScroller({ children }: { children: ReactNode }) {
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
      <div ref={ref} className="flex items-start gap-3 overflow-x-auto pb-2">
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
