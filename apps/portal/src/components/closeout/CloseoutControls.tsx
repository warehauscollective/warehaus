'use client';

import { useState, type ReactNode } from 'react';
import type { ArchiveTaskChoice, LeftoverChoice } from '@convex/_lib/closeout';
import { userFacingErrorMessage } from '@convex/_lib/userFacingError';
import { CloseoutConfirm, type ConfirmChoice } from './CloseoutConfirm';
import type { MilestoneCloseoutActions, TaskCloseoutActions } from './closeoutActions';
import {
  ARCHIVED_CHIP,
  CLOSEOUT_SAVE_ERROR,
  TOAST_MILESTONE_ARCHIVED,
  TOAST_MILESTONE_DONE,
  TOAST_MILESTONE_RESTORED,
  TOAST_TASK_ARCHIVED,
  TOAST_TASK_DONE,
  TOAST_TASK_RESTORED,
  markCompleteKind,
  type ConfirmKind,
} from './closeoutCopy';
import { showCloseoutToast } from './closeoutToast';
import { OverflowMenu, type OverflowAction, type OverflowState } from './OverflowMenu';

/**
 * Close-out for one milestone. Mark complete and Archive confirm first.
 * Restore does not. Each ends with a toast that carries Undo.
 */
export function useMilestoneCloseout({
  open,
  total,
  parkedMilestone,
  actions,
  onDone,
}: {
  /** Open tasks: not Done, not Parked, not archived. */
  open: number;
  /** Tasks of any state. Zero picks the "No tasks in this milestone." confirm. */
  total: number;
  /** The project has a milestone named "Parked for later". Read from the list already loaded. */
  parkedMilestone: boolean;
  actions: MilestoneCloseoutActions;
  onDone?: (action: OverflowAction) => void;
}) {
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async (action: OverflowAction, write: () => Promise<(() => Promise<unknown>) | null>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const undo = await write();
      setConfirm(null);
      showCloseoutToast(
        action === 'complete'
          ? { kind: 'done', message: TOAST_MILESTONE_DONE, undo }
          : action === 'archive'
            ? { kind: 'archived', message: TOAST_MILESTONE_ARCHIVED, undo }
            : { kind: 'restored', message: TOAST_MILESTONE_RESTORED, undo },
      );
      onDone?.(action);
    } catch (err) {
      const message = userFacingErrorMessage(err, CLOSEOUT_SAVE_ERROR);
      if (action === 'restore') showCloseoutToast({ kind: 'error', message });
      else setError(message);
    } finally {
      setBusy(false);
    }
  };

  const start = (action: OverflowAction) => {
    setError(null);
    if (action === 'restore') {
      void finish('restore', actions.restore);
      return;
    }
    setConfirm(action === 'archive' ? 'archive-milestone' : markCompleteKind({ total, open }));
  };

  const onConfirm = (choice: ConfirmChoice) => {
    if (confirm === 'archive-milestone') {
      void finish('archive', () => actions.archive((choice as ArchiveTaskChoice | null) ?? 'archive'));
      return;
    }
    void finish('complete', () => actions.markComplete(confirm === 'mark-complete-open' ? ((choice as LeftoverChoice | null) ?? 'done') : null));
  };

  const overlay: ReactNode = confirm ? (
    <CloseoutConfirm
      key={confirm}
      kind={confirm}
      open={open}
      parkedMilestone={parkedMilestone}
      busy={busy}
      error={error}
      onCancel={() => {
        setConfirm(null);
        setError(null);
      }}
      onConfirm={onConfirm}
    />
  ) : null;

  return { start, busy, overlay, confirming: confirm != null };
}

/** The "…" control and its confirms for one milestone. */
export function MilestoneCloseout({
  name,
  state,
  open,
  total,
  parkedMilestone,
  actions,
  onDone,
  testId = 'milestone-overflow',
}: {
  name: string;
  state: OverflowState;
  open: number;
  total: number;
  parkedMilestone: boolean;
  actions: MilestoneCloseoutActions;
  onDone?: (action: OverflowAction) => void;
  testId?: string;
}) {
  const closeout = useMilestoneCloseout({ open, total, parkedMilestone, actions, onDone });
  return (
    <>
      <OverflowMenu target="milestone" state={state} label={name} disabled={closeout.busy} onAction={closeout.start} testId={testId} />
      {closeout.overlay}
    </>
  );
}

/**
 * Close-out for one task. Mark complete sets Done with no confirm. Archive
 * confirms. Each ends with a toast that carries Undo.
 */
export function useTaskCloseout({
  actions,
  onDone,
}: {
  actions: TaskCloseoutActions;
  onDone?: (action: OverflowAction) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async (action: OverflowAction, write: () => Promise<(() => Promise<unknown>) | null>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const undo = await write();
      setConfirm(false);
      showCloseoutToast(
        action === 'complete'
          ? { kind: 'done', message: TOAST_TASK_DONE, undo }
          : action === 'archive'
            ? { kind: 'archived', message: TOAST_TASK_ARCHIVED, undo }
            : { kind: 'restored', message: TOAST_TASK_RESTORED, undo },
      );
      onDone?.(action);
    } catch (err) {
      const message = userFacingErrorMessage(err, CLOSEOUT_SAVE_ERROR);
      if (action === 'archive') setError(message);
      else showCloseoutToast({ kind: 'error', message });
    } finally {
      setBusy(false);
    }
  };

  const start = (action: OverflowAction) => {
    setError(null);
    if (action === 'archive') {
      setConfirm(true);
      return;
    }
    void finish(action, action === 'complete' ? actions.markDone : actions.restore);
  };

  const cancel = () => {
    setConfirm(false);
    setError(null);
  };

  const overlay: ReactNode = confirm ? (
    <CloseoutConfirm kind="archive" busy={busy} error={error} onCancel={cancel} onConfirm={() => void finish('archive', actions.archive)} />
  ) : null;

  return { start, busy, overlay, confirming: confirm, cancel };
}

/** The "…" control and the archive confirm for one task. */
export function TaskCloseout({
  name,
  state,
  actions,
  onDone,
  testId = 'task-overflow',
}: {
  name: string;
  state: OverflowState;
  actions: TaskCloseoutActions;
  onDone?: (action: OverflowAction) => void;
  testId?: string;
}) {
  const closeout = useTaskCloseout({ actions, onDone });
  return (
    <>
      <OverflowMenu target="task" state={state} label={name} disabled={closeout.busy} onAction={closeout.start} testId={testId} />
      {closeout.overlay}
    </>
  );
}

/** Filter chip, Active, with count. The Archived view toggle on the project page and the task list. */
export function ArchivedChip({ active, count, onClick }: { active: boolean; count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid="archived-filter"
      className="inline-flex items-center gap-2 self-start whitespace-nowrap"
      style={{
        fontSize: 13,
        fontWeight: 500,
        lineHeight: 'normal',
        padding: '8px 16px',
        borderRadius: 999,
        border: active ? '1px solid var(--border-2)' : '1px solid var(--border)',
        background: active ? 'var(--surface-2)' : 'transparent',
        color: active ? 'var(--fg)' : 'var(--muted)',
        cursor: 'pointer',
      }}
    >
      {ARCHIVED_CHIP}
      <span className="ds-mono" data-testid="archived-filter-count" style={{ fontSize: 11, fontWeight: 400, color: 'var(--faint)' }}>
        {count}
      </span>
    </button>
  );
}

/** Ghost Restore on an archived row. */
export function RestoreButton({ onClick, disabled, label }: { onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      data-testid="archived-restore"
      aria-label={`Restore ${label}`}
      disabled={disabled}
      onClick={onClick}
      style={{
        flex: '0 0 auto',
        background: 'transparent',
        color: 'var(--muted)',
        border: 0,
        borderRadius: 9,
        padding: '8px 12px',
        font: 'inherit',
        fontSize: 14,
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      Restore
    </button>
  );
}
