'use client';

import { useState, type CSSProperties, type FormEvent } from 'react';
import type { Id } from '@convex/_generated/dataModel';
import type { MilestoneRoadmapView, RoadmapChild } from '@convex/_lib/milestones';
import {
  addTaskDecision,
  checklistDetailText,
  checklistState,
  checklistSummary,
  isToDoTask,
  originLabel,
  type ChecklistState,
} from '@convex/_lib/milestoneTasks';
import { userFacingErrorMessage } from '@convex/_lib/userFacingError';
import { OutlineButton, PrimaryButton } from '@/components/ui/primitives';
import { Panel } from './milestoneChrome';

export const CHECKLIST_INTRO =
  'Tasks come from the brief, review feedback, or a manual add. Review happens on the milestone, never on a task.';
export const CHECKLIST_FOOTER = 'Tasks run top to bottom. Staff can add, edit or reorder while a task is To do.';
export const CHECKLIST_SHIPPED = 'This milestone has shipped. Its task list is closed.';
export const CHECKLIST_EMPTY_CLIENT = 'No tasks are listed on this milestone yet.';
export const CHECKLIST_SAVE_ERROR = 'Couldn’t save the task list. Nothing changed.';

type Row = RoadmapChild & { nested: boolean };

/** The four task writes. The live page passes Convex mutations. Fixture previews pass none. */
export type ChecklistActions = {
  addTask: (args: { hostSlug?: string; milestoneId: Id<'milestones'>; title: string; detail?: string }) => Promise<unknown>;
  editTask: (args: {
    hostSlug?: string;
    milestoneId: Id<'milestones'>;
    taskId: Id<'tasks'>;
    title: string;
    detail?: string;
  }) => Promise<unknown>;
  removeTask: (args: { hostSlug?: string; milestoneId: Id<'milestones'>; taskId: Id<'tasks'> }) => Promise<unknown>;
  reorderTasks: (args: { hostSlug?: string; milestoneId: Id<'milestones'>; taskIds: Id<'tasks'>[] }) => Promise<unknown>;
};

/** Top-level rows are numbered. A subtask sits under its parent and is not numbered. */
export function checklistRows(rows: MilestoneRoadmapView['rows']): Row[] {
  return rows.flatMap((row) => [
    { ...row, nested: false },
    ...row.children.map((child) => ({ ...child, nested: true })),
  ]);
}

export function checklistNumber(index: number): string {
  return String(index + 1).padStart(2, '0');
}

function StateGlyph({ state }: { state: ChecklistState }) {
  const label = state === 'done' ? 'Done' : state === 'progress' ? 'In progress' : state === 'blocked' ? 'Blocked' : 'To do';
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      role="img"
      aria-label={label}
      data-state={state}
      style={{ flex: '0 0 auto', color: state === 'todo' ? 'var(--muted)' : state === 'blocked' ? 'var(--danger)' : 'var(--fg)' }}
    >
      {state === 'done' ? (
        <circle cx="7" cy="7" r="6.25" fill="currentColor" />
      ) : (
        <circle
          cx="7"
          cy="7"
          r="6.25"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray={state === 'progress' ? '2.4 2.4' : undefined}
        />
      )}
    </svg>
  );
}

const monoMuted: CSSProperties = { fontSize: 11, lineHeight: '17px', color: 'var(--muted)' };

const focusRing =
  'focus-visible:[--tw-outline-style:solid] focus-visible:outline-2 focus-visible:outline-[var(--info)] focus-visible:outline-offset-2';

function RowAction({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`ds-mono rounded-md ${focusRing}`}
      style={{
        minWidth: 28,
        height: 28,
        padding: '0 6px',
        border: '1px solid var(--border)',
        borderRadius: 8,
        background: 'transparent',
        color: 'var(--muted)',
        fontSize: 12,
        lineHeight: '17px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  );
}

/**
 * The milestone's ordered task list. Staff add, edit, remove and reorder
 * here. No preview, pull request or approve control sits on a row: review
 * happens on the milestone.
 */
export function MilestoneChecklist({
  milestone,
  staff,
  fixtures,
  hostSlug,
  actions,
  onOpenTask,
}: {
  milestone: MilestoneRoadmapView;
  staff: boolean;
  fixtures: boolean;
  hostSlug?: string;
  actions?: ChecklistActions;
  onOpenTask?: (taskId: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; title: string; detail: string } | null>(null);
  // Fixture previews have no Convex. Adds, edits, removes and moves stay in this component.
  const [localRows, setLocalRows] = useState<MilestoneRoadmapView['rows'] | null>(null);
  const sourceRows = fixtures && localRows ? localRows : milestone.rows;
  const rows = checklistRows(sourceRows);
  const top = sourceRows;
  const shipped = milestone.status === 'Shipped';
  const canChange = staff && !shipped && (fixtures || actions != null);
  const milestoneId = milestone.id as Id<'milestones'>;

  const run = async (action: () => Promise<unknown>) => {
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (err) {
      setError(userFacingErrorMessage(err, CHECKLIST_SAVE_ERROR));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submitAdd = async (event: FormEvent) => {
    event.preventDefault();
    const decision = addTaskDecision({ staff, milestoneStatus: milestone.status, title: draft });
    if (!decision.ok) {
      setError(decision.reason);
      return;
    }
    if (fixtures) {
      setLocalRows([
        ...top,
        {
          id: `fixture-task-${top.length + 1}`,
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
      setDraft('');
      setError(null);
      return;
    }
    if (!actions) return;
    const saved = await run(() => actions.addTask({ hostSlug, milestoneId, title: decision.title }));
    if (saved) setDraft('');
  };

  const move = (index: number, by: -1 | 1) => {
    const target = index + by;
    if (target < 0 || target >= top.length) return;
    const next = [...top];
    const [row] = next.splice(index, 1);
    if (!row) return;
    next.splice(target, 0, row);
    if (fixtures) {
      setLocalRows(next);
      return;
    }
    if (!actions) return;
    void run(() => actions.reorderTasks({ hostSlug, milestoneId, taskIds: next.map((item) => item.id as Id<'tasks'>) }));
  };

  const remove = (id: string) => {
    if (fixtures) {
      setLocalRows(top.filter((row) => row.id !== id));
      return;
    }
    if (!actions) return;
    void run(() => actions.removeTask({ hostSlug, milestoneId, taskId: id as Id<'tasks'> }));
  };

  const saveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    if (fixtures) {
      setLocalRows(
        top.map((row) =>
          row.id === editing.id
            ? { ...row, name: editing.title.trim() || row.name, ...(editing.detail.trim() ? { detail: editing.detail.trim() } : {}) }
            : row,
        ),
      );
      setEditing(null);
      return;
    }
    if (!actions) return;
    const saved = await run(() =>
      actions.editTask({
        hostSlug,
        milestoneId,
        taskId: editing.id as Id<'tasks'>,
        title: editing.title,
        detail: editing.detail,
      }),
    );
    if (saved) setEditing(null);
  };

  if (!staff && rows.length === 0) {
    return (
      <Panel testId="milestone-checklist">
        <p data-testid="milestone-tasks-empty" style={{ margin: 0, fontSize: 14, lineHeight: '21px', color: 'var(--muted)' }}>
          {CHECKLIST_EMPTY_CLIENT}
        </p>
      </Panel>
    );
  }

  let number = -1;
  return (
    <div className="flex flex-col gap-4">
      {staff ? (
        <Panel>
          <p data-testid="milestone-checklist-intro" style={{ margin: 0, fontSize: 14, lineHeight: '21px', color: 'var(--muted)' }}>
            {CHECKLIST_INTRO}
          </p>
        </Panel>
      ) : null}
      <Panel testId="milestone-checklist">
        <div className="flex flex-wrap items-center justify-between gap-2" style={{ paddingBottom: 12 }}>
          <p className="ds-mono" data-testid="milestone-board-count" style={{ ...monoMuted, margin: 0 }}>
            {`TASKS · ${top.length}`}
          </p>
          <p className="ds-mono" data-testid="milestone-checklist-summary" style={{ ...monoMuted, margin: 0 }}>
            {checklistSummary(rows)}
          </p>
        </div>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {rows.map((row) => {
            if (!row.nested) number += 1;
            const index = number;
            const state = checklistState(row);
            const badge = staff ? originLabel(row.origin, row.round) : null;
            const editable = canChange && !row.nested && row.portalOwned === true && isToDoTask(row);
            const movable = canChange && !row.nested && isToDoTask(row);
            const isEditing = editing?.id === row.id;
            return (
              <li
                key={row.id}
                data-testid="milestone-checklist-row"
                data-state={state}
                style={{ borderTop: '1px solid var(--border)', padding: '14px 0', paddingLeft: row.nested ? 40 : 0 }}
              >
                {isEditing && editing ? (
                  <form onSubmit={saveEdit} className="flex flex-col gap-2" data-testid="milestone-checklist-edit">
                    <input
                      autoFocus
                      aria-label="Task title"
                      value={editing.title}
                      onChange={(event) => setEditing({ ...editing, title: event.target.value })}
                      className={focusRing}
                      style={fieldStyle}
                    />
                    <textarea
                      aria-label="Task detail"
                      placeholder="Detail (optional)"
                      rows={3}
                      value={editing.detail}
                      onChange={(event) => setEditing({ ...editing, detail: event.target.value })}
                      className={focusRing}
                      style={fieldStyle}
                    />
                    <div className="flex flex-wrap justify-end gap-2">
                      <OutlineButton onClick={() => setEditing(null)} disabled={busy}>Cancel</OutlineButton>
                      <PrimaryButton type="submit" disabled={busy || !editing.title.trim()}>
                        {busy ? 'Saving…' : 'Save task'}
                      </PrimaryButton>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <StateGlyph state={state} />
                      {row.nested ? null : (
                        <span className="ds-mono" style={{ ...monoMuted, flex: '0 0 auto' }}>
                          {checklistNumber(index)}
                        </span>
                      )}
                      {onOpenTask ? (
                        <button
                          type="button"
                          data-testid="milestone-checklist-open"
                          onClick={() => onOpenTask(row.id)}
                          className={`min-w-0 rounded-sm text-left ${focusRing}`}
                          style={{
                            ...titleStyle,
                            background: 'none',
                            border: 0,
                            padding: 0,
                            cursor: 'pointer',
                            color: state === 'done' ? 'var(--muted)' : 'var(--fg)',
                          }}
                        >
                          {row.name}
                        </button>
                      ) : (
                        <span className="min-w-0" style={{ ...titleStyle, color: state === 'done' ? 'var(--muted)' : 'var(--fg)' }}>
                          {row.name}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pl-[26px] md:pl-0">
                      {badge ? (
                        <span
                          className="ds-mono"
                          data-testid="milestone-checklist-origin"
                          style={{
                            ...monoMuted,
                            border: '1px solid var(--border-2)',
                            borderRadius: 999,
                            padding: '2px 8px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {badge}
                        </span>
                      ) : null}
                      <span
                        className="ds-mono"
                        data-testid="milestone-checklist-status"
                        style={{
                          ...monoMuted,
                          overflowWrap: 'anywhere',
                          ...(state === 'blocked' ? { color: 'var(--danger-text)' } : {}),
                        }}
                      >
                        {checklistDetailText(staff ? row : { status: row.status, isDone: row.isDone })}
                      </span>
                      {movable || editable ? (
                        <span className="flex items-center gap-1" data-testid="milestone-checklist-actions">
                          {movable ? (
                            <>
                              <RowAction label={`Move ${row.name} up`} disabled={busy || index === 0} onClick={() => move(index, -1)}>
                                ↑
                              </RowAction>
                              <RowAction
                                label={`Move ${row.name} down`}
                                disabled={busy || index === top.length - 1}
                                onClick={() => move(index, 1)}
                              >
                                ↓
                              </RowAction>
                            </>
                          ) : null}
                          {editable ? (
                            <>
                              <RowAction
                                label={`Edit ${row.name}`}
                                disabled={busy}
                                onClick={() => {
                                  setError(null);
                                  setEditing({ id: row.id, title: row.name, detail: row.detail ?? '' });
                                }}
                              >
                                Edit
                              </RowAction>
                              <RowAction label={`Remove ${row.name}`} disabled={busy} onClick={() => remove(row.id)}>
                                Remove
                              </RowAction>
                            </>
                          ) : null}
                        </span>
                      ) : null}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        {canChange ? (
          <form
            onSubmit={submitAdd}
            data-testid="milestone-checklist-add"
            className="flex items-center gap-3"
            style={{
              marginTop: rows.length > 0 ? 12 : 0,
              border: '1px solid var(--border)',
              borderRadius: 10,
              background: 'var(--surface-2)',
              padding: '4px 14px',
            }}
          >
            <span aria-hidden style={{ color: 'var(--muted)', fontSize: 16 }}>+</span>
            <input
              aria-label="Add a task to this milestone"
              placeholder="Add a task to this milestone"
              value={draft}
              disabled={busy}
              onChange={(event) => {
                setDraft(event.target.value);
                if (error) setError(null);
              }}
              className="min-w-0 flex-1 outline-none"
              style={{ background: 'transparent', border: 0, color: 'var(--fg)', font: 'inherit', fontSize: 14, lineHeight: '21px', minHeight: 36 }}
            />
            <span className="ds-mono hidden md:inline" style={{ ...monoMuted, whiteSpace: 'nowrap' }}>
              ↵ to add · Manual
            </span>
            <button type="submit" className="sr-only" disabled={busy}>
              Add task
            </button>
          </form>
        ) : null}
        {staff && shipped ? (
          <p data-testid="milestone-checklist-shipped" style={{ margin: '12px 0 0', fontSize: 13, lineHeight: '20px', color: 'var(--muted)' }}>
            {CHECKLIST_SHIPPED}
          </p>
        ) : null}
        {error ? (
          <p role="alert" data-testid="milestone-checklist-error" style={{ margin: '12px 0 0', fontSize: 13, lineHeight: '20px', color: 'var(--danger-text)' }}>
            {error}
          </p>
        ) : null}
      </Panel>
      {staff && !shipped ? (
        <p style={{ margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>{CHECKLIST_FOOTER}</p>
      ) : null}
    </div>
  );
}

const titleStyle: CSSProperties = { font: 'inherit', fontSize: 14, lineHeight: '21px', overflowWrap: 'anywhere' };

const fieldStyle: CSSProperties = {
  width: '100%',
  border: '1px solid var(--border)',
  borderRadius: 10,
  background: 'var(--surface-2)',
  color: 'var(--fg)',
  padding: '10px 12px',
  font: 'inherit',
  fontSize: 14,
  lineHeight: '21px',
};
