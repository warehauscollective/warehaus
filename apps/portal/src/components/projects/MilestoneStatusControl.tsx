'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react';
import { nextStatus, statusOptionLock, type MilestoneStatus } from '@convex/_lib/milestoneStatus';
import { userFacingErrorMessage } from '@convex/_lib/userFacingError';
import { TaskGlyph } from '@/components/tasks/TaskGlyph';
import { Icon } from '@/components/ui/Icon';
import { PortalToast } from '@/components/ui/PortalToast';

/** Shown on the control after a failed save. The status has already rolled back. */
export const STATUS_SAVE_ERROR = 'Couldn’t save. Nothing changed.';
/** The Undo toast stays this long. */
export const STATUS_TOAST_MS = 6000;

export function statusMovedMessage(status: MilestoneStatus): string {
  return `Moved to ${status}`;
}

/** Tooltip on the play button. */
export function statusPlayTip(next: MilestoneStatus): string {
  return `Next: ${next}`;
}

/** Accessible name of the play button. */
export function statusPlayLabel(next: MilestoneStatus): string {
  return `Move to ${next}`;
}

export function milestoneStatusGlyph(status: MilestoneStatus): string {
  if (status === 'Shipped') return '/icons/task-stage-shipped.svg';
  if (status === 'Planning' || status === 'Idea') return '/icons/item-stage.svg';
  return '/icons/task-stage.svg';
}

/**
 * Optimistic status moves for one milestone. The control shows the new status
 * at once. A failed save rolls back to the stored status and sets the error.
 * Play ends with an Undo toast. A menu pick does not.
 *
 * `onAdvance` and `onSet` receive the status the caller last saw, so the
 * server can reject a move made on a stale value.
 */
export function useMilestoneStatusMoves({
  status,
  onAdvance,
  onSet,
  canClose = false,
}: {
  status: MilestoneStatus;
  onAdvance: (expected: MilestoneStatus) => void | Promise<unknown>;
  onSet: (next: MilestoneStatus, expected: MilestoneStatus) => void | Promise<unknown>;
  /** True when every task that is not Parked is Done, so Shipped can be picked. */
  canClose?: boolean;
}) {
  const [optimistic, setOptimistic] = useState<MilestoneStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ from: MilestoneStatus; to: MilestoneStatus } | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (!busy.current) setOptimistic(null);
  }, [status]);

  /** Resolves true after a save, false when another save is in flight. Rejects on failure. */
  const run = async (next: MilestoneStatus, action: () => void | Promise<unknown>): Promise<boolean> => {
    if (busy.current) return false;
    busy.current = true;
    setSaving(true);
    setError(null);
    setOptimistic(next);
    try {
      await action();
      return true;
    } catch (err) {
      setError(userFacingErrorMessage(err, STATUS_SAVE_ERROR));
      throw err;
    } finally {
      busy.current = false;
      setSaving(false);
      setOptimistic(null);
    }
  };

  const play = () => {
    const next = nextStatus(status);
    if (!next) return;
    const from = status;
    setToast(null);
    void run(next, () => onAdvance(from))
      .then((saved) => {
        if (saved) setToast({ from, to: next });
      })
      .catch(() => undefined);
  };

  /** Menu pick. Shipped stays locked until the milestone can close. The current status does nothing. */
  const pick = (next: MilestoneStatus): Promise<boolean> => {
    if (statusOptionLock(next, canClose) || next === status) return Promise.resolve(false);
    setToast(null);
    return run(next, () => onSet(next, status));
  };

  const undo = () => {
    const last = toast;
    if (!last) return;
    setToast(null);
    void run(last.from, () => onSet(last.from, last.to)).catch(() => undefined);
  };

  const shown = optimistic ?? status;
  const toastNode: ReactNode = toast ? (
    <PortalToast
      kind="moved"
      testId="milestone-status-toast"
      message={statusMovedMessage(toast.to)}
      onUndo={undo}
      onDismiss={() => setToast(null)}
      autoHideMs={STATUS_TOAST_MS}
    />
  ) : null;

  return {
    /** The status on screen: the optimistic one while a save is in flight. */
    shown,
    saving,
    error,
    clearError: () => setError(null),
    /** The next status play moves to. Null hides the button. Hidden while saving. */
    playTo: saving ? null : nextStatus(shown),
    play,
    pick,
    toast: toastNode,
  };
}

/**
 * The play button. Its own target beside the menu trigger: 24px, and a 44px
 * hit area on phones (see `.milestone-play` in global.css). Enter and Space
 * advance, as on any button.
 */
export function StatusPlayButton({ next, onPlay }: { next: MilestoneStatus; onPlay: () => void }) {
  return (
    <span className="milestone-play-wrap">
      <button
        type="button"
        className="milestone-play"
        data-testid="milestone-status-play"
        aria-label={statusPlayLabel(next)}
        onClick={(event) => {
          event.stopPropagation();
          onPlay();
        }}
      >
        <span className="milestone-play-box">
          <Icon name="Play" size="2xs" />
        </span>
      </button>
      <span role="tooltip" className="milestone-play-tip ds-mono" data-testid="milestone-status-play-tip">
        {statusPlayTip(next)}
      </span>
    </span>
  );
}

const tileLabel: CSSProperties = {
  flex: '1 1 auto',
  minWidth: 0,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  height: '100%',
  border: 0,
  padding: 0,
  background: 'transparent',
  fontSize: 12,
  lineHeight: 1.2,
  letterSpacing: '0.48px',
  fontWeight: 500,
  textAlign: 'left',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
};

/**
 * Staff status control on the milestone tile. The label and chevron open the
 * menu. Play is a separate button. Clients never get this: they see the plain
 * pill (`StatusChip`).
 */
export function TileStatusControl({
  status,
  saving = false,
  open,
  onToggle,
  playTo,
  onPlay,
  buttonRef,
  bare = false,
}: {
  status: MilestoneStatus;
  saving?: boolean;
  open: boolean;
  onToggle: () => void;
  playTo: MilestoneStatus | null;
  onPlay: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
  /** Inside the status and approve box, which draws the outline itself. */
  bare?: boolean;
}) {
  return (
    <div
      className="milestone-status-control ds-mono w-full lg:ml-auto lg:w-max lg:min-w-[174px]"
      data-testid="milestone-status-control"
      data-status={status}
      style={{
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 34,
        padding: playTo ? '4px 6px 4px 12px' : '4px 12px',
        border: bare ? 0 : '1px solid var(--border-2)',
        borderRadius: bare ? 0 : 9,
        background: bare ? 'transparent' : 'var(--surface)',
      }}
    >
      <button
        type="button"
        ref={buttonRef}
        className="ds-mono"
        data-testid="milestone-status-chip"
        data-milestone-status-trigger=""
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={onToggle}
        style={{ ...tileLabel, color: status === 'Parked' ? 'var(--muted)' : 'var(--fg)' }}
      >
        <TaskGlyph src={milestoneStatusGlyph(status)} size={12} />
        <span style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {saving ? `${status}…` : status}
        </span>
        <span className="text-[var(--muted)]" aria-hidden style={{ display: 'inline-flex' }}>
          <Icon name="ArrowDown2" size="xs" />
        </span>
      </button>
      {playTo ? <StatusPlayButton next={playTo} onPlay={onPlay} /> : null}
    </div>
  );
}
