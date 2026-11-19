'use client';

import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { TaskGlyph } from '@/components/tasks/TaskGlyph';

/** Figma PortalToast 744:2763. One toast, inside the screen, for 3 seconds. */
export type PortalToastKind = 'success' | 'error' | 'moved' | 'invite-sent';

export type PortalToastPlacement = 'above-dock' | 'below-board' | 'created' | 'flow';

const DEFAULT_MESSAGE: Record<PortalToastKind, string> = {
  success: 'Project created',
  error: 'Couldn’t save the change. Nothing moved.',
  moved: 'Moved to In Progress',
  'invite-sent': 'Invite sent',
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
  useEffect(() => {
    if (!onDismiss || autoHideMs <= 0) return;
    const timer = window.setTimeout(onDismiss, autoHideMs);
    return () => window.clearTimeout(timer);
  }, [onDismiss, autoHideMs, kind, message]);

  const text = message ?? DEFAULT_MESSAGE[kind];
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
    boxShadow: placement === 'below-board' ? 'none' : '0 8px 12px rgb(0 0 0 / 35%)',
    fontSize: 14,
    lineHeight: '21px',
    position: fixed ? 'fixed' : placement === 'created' ? undefined : 'relative',
    left: fixed ? '50%' : undefined,
    bottom: fixed ? 'calc(1.25rem + 3.5rem + 16px)' : undefined,
    transform: fixed ? 'translateX(-50%)' : undefined,
    zIndex: fixed ? 60 : undefined,
    marginTop: placement === 'below-board' ? 16 : undefined,
  };
  const node = (
    <div
      role="status"
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
      {kind === 'moved' && onUndo ? (
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
  border: '1px solid var(--border-2)',
  borderRadius: 9,
  background: 'transparent',
  color: 'var(--fg)',
  font: 'inherit',
  fontWeight: 500,
  fontSize: 14,
  lineHeight: 'normal',
  padding: '6px 12px',
  cursor: 'pointer',
};

const undoStyle: CSSProperties = {
  flex: '0 0 auto',
  border: 0,
  background: 'none',
  color: 'var(--muted)',
  padding: '6px 4px',
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
