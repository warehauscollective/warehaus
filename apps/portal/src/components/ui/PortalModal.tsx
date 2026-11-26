'use client';

import { useEffect, useRef, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type ModalFrame = {
  key: string;
  open: boolean;
  node: ReactNode;
  /** Stay mounted while another frame is open, so its state is still there on the way back. */
  keep?: boolean;
};

/** Renders the top open frame. A kept frame stays mounted without its shell. */
export function PortalModalStack({ frames }: { frames: readonly ModalFrame[] }) {
  const active = [...frames].reverse().find((frame) => frame.open);
  if (!active && !frames.some((frame) => frame.keep)) return null;
  return (
    <>
      {frames.map((frame) => {
        if (!frame.keep && frame !== active) return null;
        return <span key={frame.key} style={{ display: 'contents' }}>{frame.node}</span>;
      })}
    </>
  );
}

type Sheet = 'center' | 'top' | 'bottom';

/**
 * What takes focus as a dialog opens: Cancel on a confirm, else the first
 * field, else the first button. With `focusPanel` a dialog with no field
 * focuses the panel itself, so Close does not open wearing a focus ring.
 */
export function openingFocus<T>({ cancel, field, button, panel, focusPanel }: {
  cancel?: T | null;
  field?: T | null;
  button?: T | null;
  panel: T;
  focusPanel: boolean;
}): T | null {
  return cancel ?? field ?? (focusPanel ? panel : button ?? null);
}

export type PortalModalHeader = 'default' | 'compact';
export type PortalModalIcon = 'spinner' | 'check' | 'alert';

export function PortalModal({
  testId,
  scrimTestId,
  label,
  onClose,
  children,
  narrow = false,
  sheet = 'center',
  width = 640,
  zIndex = 80,
  locked = false,
  panelStyle,
  maxHeight,
  hidden = false,
  header,
  showFooter = false,
  showIcon = false,
  icon = 'spinner',
  headerIcon,
  confirmLabel = 'Confirm',
  onConfirm,
  confirmOnEnter = false,
  cover = false,
  focusCancel = false,
  focusPanel = false,
  footer,
  blueFocus = false,
  align = 'center',
  scroll = true,
  dockLayer,
  sheetClearance,
}: {
  testId?: string;
  scrimTestId?: string;
  label: string;
  onClose: () => void;
  children: ReactNode;
  narrow?: boolean;
  sheet?: Sheet;
  width?: number;
  zIndex?: number;
  locked?: boolean;
  panelStyle?: CSSProperties;
  maxHeight?: string;
  /** Keep the children mounted without a scrim or dialog. */
  hidden?: boolean;
  /**
   * Spec chrome. Omit it when the body already draws its own title.
   * default is the 132px header with Close. compact is the 58px confirm header with no Close.
   */
  header?: PortalModalHeader;
  /** The standard footer. Leave it off when the body brings its own actions. */
  showFooter?: boolean;
  showIcon?: boolean;
  icon?: PortalModalIcon;
  headerIcon?: ReactNode;
  confirmLabel?: string;
  onConfirm?: () => void;
  confirmOnEnter?: boolean;
  /** Stay inside a positioned parent instead of covering the page. */
  cover?: boolean;
  /** Confirms open on Cancel, not the first field or Close. */
  focusCancel?: boolean;
  /** With no field, open with focus on the dialog, not on Close. Tab then reaches Close first. */
  focusPanel?: boolean;
  /**
   * Pinned under the scroll body. Stays on screen while the body scrolls,
   * and a centered dialog shortens so this row sits above the dock.
   */
  footer?: ReactNode;
  /** Keyboard ring uses the blue --info token. New milestone and edit fields. */
  blueFocus?: boolean;
  /** Search sits under the header. Center is the default dialog. */
  align?: 'center' | 'start';
  /** Search scrolls its own results. Other dialogs scroll the body. */
  scroll?: boolean;
  /**
   * Set only on the task dialog. The dock rises above that one scrim.
   * Every other dialog leaves the dock under the blur.
   */
  dockLayer?: 'task';
  /** Phone sheet sits this far above the dock. Desktop dialogs ignore it. */
  sheetClearance?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const lockedRef = useRef(locked);
  const confirmRef = useRef(onConfirm);
  closeRef.current = onClose;
  lockedRef.current = locked;
  confirmRef.current = onConfirm;
  const topAligned = align === 'start';
  const placement = topAligned ? 'center' : (narrow ? sheet : 'center');

  useEffect(() => {
    if (hidden) return;
    const panel = panelRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    if (!cover) document.body.style.overflow = 'hidden';
    const cancel = focusCancel
      ? [...(panel?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find((button) => button.textContent?.trim() === 'Cancel')
      : null;
    const field = panel?.querySelector<HTMLElement>('input, textarea, select');
    const sheetOpen = !topAligned && narrow && sheet !== 'center';
    if (panel && !panel.contains(document.activeElement)) {
      // A phone sheet focuses the name field on open. preventScroll keeps the
      // intro and label below the header instead of sliding them under it.
      openingFocus({ cancel, field, button: panel.querySelector<HTMLElement>('button'), panel, focusPanel })?.focus(
        sheetOpen || topAligned ? { preventScroll: true } : undefined,
      );
      if (sheetOpen) {
        const reset = () => {
          const body = panel.querySelector<HTMLElement>('[data-portal-modal-body]');
          if (body) body.scrollTop = 0;
        };
        reset();
        requestAnimationFrame(reset);
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // A portaled field menu calls preventDefault before this listener.
        // That closes the menu and leaves this dialog open.
        if (event.defaultPrevented || lockedRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (confirmOnEnter && event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey) {
        const target = event.target;
        if (target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && target.type !== 'button' && target.type !== 'submit')) return;
        event.preventDefault();
        confirmRef.current?.();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const nodes = [...panel.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
        .filter((el) => !el.hasAttribute('disabled'));
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      // Focus on the panel itself (focusPanel) sits before the first control.
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (!cover) document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [hidden, cover, confirmOnEnter, focusCancel, focusPanel, narrow, sheet, topAligned]);

  const isSheet = !topAligned && placement !== 'center';
  const pinned = Boolean(footer) || showFooter;
  /** Dock track plus its bottom offset. Centered dialogs stop above it. */
  const dockClearance = 'calc(82px + env(safe-area-inset-bottom, 0px))';
  const scrim: CSSProperties = {
    position: cover ? 'absolute' : 'fixed',
    inset: 0,
    zIndex: cover ? 2 : isSheet ? Math.max(zIndex, 140) : zIndex,
    transform: cover ? undefined : 'translateZ(0)',
    display: 'flex',
    alignItems: isSheet ? 'flex-end' : topAligned ? 'flex-start' : 'center',
    justifyContent: 'center',
    padding: isSheet ? (sheetClearance ? `0 0 ${sheetClearance} 0` : 0) : topAligned ? (narrow ? '56px 20px 24px' : '72px 20px 24px') : pinned ? `24px 24px ${dockClearance}` : 24,
  };
  const node = (
    <div
      hidden={hidden || undefined}
      className={hidden ? undefined : 'ds-scope portal-modal-scrim'}
      data-portal-scrim={hidden ? undefined : ''}
      data-dock-layer={hidden || !dockLayer ? undefined : dockLayer}
      data-sheet-layer={hidden || cover || !isSheet ? undefined : 'viewport'}
      data-testid={hidden ? undefined : scrimTestId}
      onClick={() => {
        if (hidden || lockedRef.current) return;
        closeRef.current();
      }}
      onKeyDown={(event) => {
        if (hidden || event.key !== 'Escape' || lockedRef.current) return;
        event.preventDefault();
        closeRef.current();
      }}
      style={hidden ? { display: 'none' } : scrim}
    >
      <div
        ref={panelRef}
        role={hidden ? undefined : 'dialog'}
        aria-modal={hidden ? undefined : true}
        aria-label={hidden ? undefined : label}
        tabIndex={hidden || !focusPanel ? undefined : -1}
        data-testid={hidden ? undefined : testId}
        data-focus-ring={hidden || !blueFocus ? undefined : 'info'}
        className={hidden ? undefined : isSheet ? 'portal-modal-panel portal-modal-sheet' : 'portal-modal-panel'}
        onClick={(event) => event.stopPropagation()}
        style={hidden ? undefined : {
          width: narrow ? '100%' : width,
          maxWidth: '100%',
          minHeight: 0,
          height: maxHeight,
          maxHeight: maxHeight ?? (isSheet
            ? 'calc(100dvh - 12px)'
            : topAligned
              ? (narrow ? 'calc(100dvh - 80px)' : 'min(780px, calc(100dvh - 96px))')
              : pinned
                ? 'calc(100dvh - 24px - 82px - env(safe-area-inset-bottom, 0px))'
                : 'calc(100dvh - 48px)'),
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: isSheet ? '28px 28px 0 0' : 28,
          outline: focusPanel ? 'none' : undefined,
        }}
      >
        {!hidden && isSheet ? (
          <div className="portal-modal-grabber" data-testid="modal-grabber" aria-hidden="true">
            <span />
          </div>
        ) : null}
        {!hidden && header ? (
          <ModalHeader
            label={label}
            header={header}
            narrow={isSheet}
            showIcon={showIcon}
            icon={icon}
            headerIcon={headerIcon}
            onClose={onClose}
            blueFocus={blueFocus}
          />
        ) : null}
        <div data-portal-modal-body="" style={hidden ? undefined : {
          overflow: scroll ? 'auto' : 'hidden',
          minHeight: 0,
          flex: '1 1 auto',
          display: scroll ? undefined : 'flex',
          flexDirection: scroll ? undefined : 'column',
          ...panelStyle,
        }}>{children}</div>
        {!hidden && footer ? (
          <div data-testid="portal-modal-footer" style={{ flex: '0 0 auto', borderTop: '1px solid var(--border)', padding: isSheet ? '16px 24px 24px' : '16px 24px' }}>
            {footer}
          </div>
        ) : null}
        {!hidden && showFooter ? (
          <ModalFooter narrow={isSheet} confirmLabel={confirmLabel} onClose={onClose} onConfirm={onConfirm} />
        ) : null}
      </div>
    </div>
  );
  return cover ? node : mountLayer(node);
}

function ModalHeader({
  label,
  header,
  narrow,
  showIcon,
  icon,
  headerIcon,
  onClose,
  blueFocus = false,
}: {
  label: string;
  header: PortalModalHeader;
  narrow: boolean;
  showIcon: boolean;
  icon: PortalModalIcon;
  headerIcon?: ReactNode;
  onClose: () => void;
  blueFocus?: boolean;
}) {
  const compact = header === 'compact';
  const phoneCompact = compact && narrow;
  return (
    <div
      data-modal-header={header}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: phoneCompact ? 8 : 12,
        flex: '0 0 auto',
        boxSizing: 'border-box',
        minHeight: compact ? undefined : 132,
        padding: phoneCompact ? '8px 16px 0' : compact ? '20px 24px 8px' : '16px 24px',
      }}
    >
      {showIcon || headerIcon ? <HeaderGlyph icon={icon} headerIcon={headerIcon} /> : null}
      <h2
        style={{
          margin: 0,
          flex: '1 1 auto',
          minWidth: 0,
          fontSize: phoneCompact ? 16 : 20,
          lineHeight: phoneCompact ? '24px' : '30px',
          fontWeight: compact ? 500 : 600,
        }}
      >
        {label}
      </h2>
      {compact ? null : (
        <button
          type="button"
          data-testid="portal-modal-close"
          onClick={onClose}
          className={blueFocus
            ? 'focus-visible:[--tw-outline-style:solid] focus-visible:outline-2 focus-visible:outline-[var(--info)] focus-visible:outline-offset-2'
            : 'focus-visible:[--tw-outline-style:solid] focus-visible:outline-2 focus-visible:outline-[var(--fg)] focus-visible:outline-offset-2'}
          style={{
            flex: '0 0 auto',
            background: 'none',
            border: 0,
            borderRadius: 9,
            color: 'var(--muted)',
            font: 'inherit',
            fontSize: 14,
            fontWeight: 500,
            lineHeight: '21px',
            padding: '12px 16px',
            cursor: 'pointer',
          }}
        >
          Close
        </button>
      )}
    </div>
  );
}

function HeaderGlyph({ icon, headerIcon }: { icon: PortalModalIcon; headerIcon?: ReactNode }) {
  if (headerIcon) {
    return <span style={{ width: 20, height: 20, flex: '0 0 auto', display: 'inline-flex' }}>{headerIcon}</span>;
  }
  if (icon === 'spinner') return <span className="portal-modal-spinner" aria-hidden="true" />;
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" style={{ flex: '0 0 auto' }}>
      {icon === 'check' ? (
        <path d="M5 10.5 8.2 14 15 6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      ) : (
        <>
          <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10 6.5v4.5" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="10" cy="13.6" r="0.8" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

function ModalFooter({
  narrow,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  narrow: boolean;
  confirmLabel: string;
  onClose: () => void;
  onConfirm?: () => void;
}) {
  const button: CSSProperties = {
    flex: '0 0 auto',
    borderRadius: 9,
    padding: '12px 16px',
    font: 'inherit',
    fontSize: 14,
    fontWeight: 500,
    lineHeight: '20px',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  };
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'nowrap',
        alignItems: 'center',
        gap: 8,
        flex: '0 0 auto',
        borderTop: '1px solid var(--border)',
        padding: narrow ? '16px 24px 24px' : '16px 24px',
      }}
    >
      <span style={{ flex: '1 1 auto' }} />
      <button type="button" onClick={onClose} style={{ ...button, background: 'transparent', color: 'var(--fg)', border: '2px solid var(--border-2)' }}>
        Cancel
      </button>
      <button type="button" onClick={onConfirm} style={{ ...button, background: 'var(--accent)', color: 'var(--accent-fg)', border: 0 }}>
        {confirmLabel}
      </button>
    </div>
  );
}

function mountLayer(node: ReactElement) {
  if (typeof document === 'undefined') return node;
  return createPortal(node, document.body);
}
