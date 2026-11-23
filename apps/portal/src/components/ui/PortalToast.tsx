'use client';

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { TaskGlyph } from '@/components/tasks/TaskGlyph';

/**
 * Figma PortalToast 744:2763. One toast, inside the screen, for 3 seconds.
 * done 1036:8229, archived 1036:8241 and restored 1036:8253 are the close-out kinds. Each carries Undo.
 */
export type PortalToastKind = 'success' | 'error' | 'moved' | 'invite-sent' | 'done' | 'archived' | 'restored';

/** Kinds that show Undo when the caller passes `onUndo`. */
const UNDO_KINDS: ReadonlySet<PortalToastKind> = new Set(['moved', 'done', 'archived', 'restored']);

export type PortalToastPlacement = 'above-dock' | 'below-board' | 'created' | 'flow';

/** One polite live region for the life of the page. Error toasts use role="alert" instead. */
export function PortalToastLive() {
  return (
    <div
      id="portal-toast-live"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
      data-testid="portal-toast-live"
    />
  );
}

const DEFAULT_MESSAGE: Record<PortalToastKind, string> = {
  success: 'Project created',
  error: 'Couldn’t save the change. Nothing moved.',
  moved: 'Moved to In Progress',
  'invite-sent': 'Invite sent',
  done: 'Task marked Done',
  archived: 'Milestone archived',
  restored: 'Milestone restored',
};

export function PortalToast({
  kind,
  message,
  onRetry,
  onUndo,
  onOpen,
  openLabel = 'Open',
  onDismiss,
  testId = 'portal-toast',
  placement = 'above-dock',
  autoHideMs = 3000,
}: {
  kind: PortalToastKind;
  message?: string;
  onRetry?: () => void;
  onUndo?: () => void;
  onOpen?: () => void;
  openLabel?: string;
  onDismiss?: () => void;
  testId?: string;
  placement?: PortalToastPlacement;
  /** 0 keeps the toast up. The spec hides a visible toast after 3s. */
  autoHideMs?: number;
}) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const nodeRef = useRef<HTMLDivElement>(null);
  const dismissible = onDismiss != null && autoHideMs > 0;

  useEffect(() => {
    if (!dismissible) return;
    const node = nodeRef.current;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let remaining = autoHideMs;
    let started = 0;
    let done = false;
    let paused = false;
    let pointer = false;
    let within = false;

    const clear = () => {
      if (timer == null) return;
      clearTimeout(timer);
      timer = null;
    };
    const finish = () => {
      if (done) return;
      done = true;
      clear();
      onDismissRef.current?.();
    };
    const arm = (ms: number) => {
      clear();
      remaining = ms;
      started = Date.now();
      timer = setTimeout(finish, ms);
    };
    const pause = () => {
      if (paused || timer == null) return;
      remaining = Math.max(0, remaining - (Date.now() - started));
      clear();
      paused = true;
    };
    const resume = () => {
      if (!paused || done) return;
      paused = false;
      if (remaining <= 0) {
        finish();
        return;
      }
      arm(remaining);
    };
    const sync = () => {
      if (pointer || within) pause();
      else resume();
    };
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      if (next instanceof Node && node?.contains(next)) return;
      within = false;
      sync();
    };

    arm(autoHideMs);
    const onEnter = () => {
      pointer = true;
      sync();
    };
    const onLeave = () => {
      pointer = false;
      sync();
    };
    const onFocusIn = () => {
      within = true;
      sync();
    };
    node?.addEventListener('mouseenter', onEnter);
    node?.addEventListener('mouseleave', onLeave);
    node?.addEventListener('focusin', onFocusIn);
    node?.addEventListener('focusout', onFocusOut);
    return () => {
      clear();
      node?.removeEventListener('mouseenter', onEnter);
      node?.removeEventListener('mouseleave', onLeave);
      node?.removeEventListener('focusin', onFocusIn);
      node?.removeEventListener('focusout', onFocusOut);
    };
  }, [dismissible, autoHideMs, kind, message]);

  const text = message ?? DEFAULT_MESSAGE[kind];
  useEffect(() => {
    if (kind === 'error' || typeof document === 'undefined' || typeof document.getElementById !== 'function') return;
    const live = document.getElementById('portal-toast-live');
    if (live) live.textContent = text;
  }, [kind, text]);
  const fixed = placement === 'above-dock';
  const style: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    width: 'fit-content',
    maxWidth: 'calc(100vw - 32px)',
    boxSizing: 'border-box',
    background: 'var(--surface-2)',
    color: 'var(--fg)',
    border: kind === 'error' ? '1px solid var(--danger)' : '1px solid var(--border-2)',
    borderRadius: 18,
    padding: '12px 16px',
    boxShadow: placement === 'below-board' ? 'none' : '0 8px 24px rgb(0 0 0 / 18%)',
    fontSize: 14,
    lineHeight: '21px',
    position: fixed ? 'fixed' : placement === 'created' ? undefined : 'relative',
    left: fixed ? 16 : undefined,
    right: fixed ? 16 : undefined,
    bottom: fixed ? 'calc(1.25rem + 3.5rem + 16px)' : undefined,
    zIndex: fixed ? 60 : undefined,
    margin: fixed ? '0 auto' : placement === 'below-board' ? '16px auto 0' : undefined,
  };
  const node = (
    <div
      ref={nodeRef}
      role={kind === 'error' ? 'alert' : undefined}
      data-testid={testId}
      data-kind={kind}
      data-placement={placement}
      className={placement === 'created' ? 'ds-scope portal-toast portal-created-toast' : 'ds-scope portal-toast'}
      style={style}
    >
      <TaskGlyph src={kind === 'error' ? '/icons/docs-alert.svg' : '/icons/docs-check.svg'} size={16} />
      <p style={{ margin: 0, minWidth: 0 }}>{text}</p>
      {kind === 'error' && onRetry ? (
        <button type="button" data-testid="portal-toast-retry" onClick={onRetry} style={retryStyle}>
          Retry
        </button>
      ) : null}
      {UNDO_KINDS.has(kind) && onUndo ? (
        <button type="button" data-testid="portal-toast-undo" onClick={onUndo} style={undoStyle}>
          Undo
        </button>
      ) : null}
      {onOpen ? (
        <button type="button" data-testid="portal-toast-open" onClick={onOpen} style={openStyle}>
          {openLabel}
        </button>
      ) : null}
    </div>
  );
  return placement === 'below-board' || placement === 'flow' ? node : portalNode(node);
}

const retryStyle: CSSProperties = {
  flex: '0 0 auto',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxSizing: 'border-box',
  minWidth: 44,
  minHeight: 44,
  border: '1px solid var(--border-2)',
  borderRadius: 9,
  background: 'transparent',
  color: 'var(--fg)',
  font: 'inherit',
  fontWeight: 500,
  fontSize: 14,
  lineHeight: 'normal',
  padding: '0 12px',
  cursor: 'pointer',
};

const undoStyle: CSSProperties = {
  flex: '0 0 auto',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxSizing: 'border-box',
  minWidth: 44,
  minHeight: 44,
  border: 0,
  background: 'none',
  color: 'var(--muted)',
  padding: '0 12px',
  cursor: 'pointer',
  font: 'inherit',
  fontWeight: 500,
  fontSize: 14,
  lineHeight: '21px',
};

const openStyle: CSSProperties = {
  ...undoStyle,
  color: 'var(--fg)',
  fontWeight: 600,
};

function portalNode(node: ReactNode) {
  if (typeof document === 'undefined') return node;
  return createPortal(node, document.body);
}
