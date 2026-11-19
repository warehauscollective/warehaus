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
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const lockedRef = useRef(locked);
  const confirmRef = useRef(onConfirm);
  closeRef.current = onClose;
  lockedRef.current = locked;
  confirmRef.current = onConfirm;
  const placement = narrow ? sheet : 'center';

  useEffect(() => {
    if (hidden) return;
    const panel = panelRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    if (!cover) document.body.style.overflow = 'hidden';
    const field = panel?.querySelector<HTMLElement>('input, textarea, select');
    if (panel && !panel.contains(document.activeElement)) {
      (field ?? panel.querySelector<HTMLElement>('button'))?.focus();
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (lockedRef.current) return;
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
      if (event.shiftKey && document.activeElement === first) {
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
  }, [hidden, cover, confirmOnEnter]);

  const isSheet = placement !== 'center';
  const scrim: CSSProperties = {
    position: cover ? 'absolute' : 'fixed',
    inset: 0,
    zIndex: cover ? 2 : zIndex,
    display: 'flex',
    alignItems: isSheet ? 'flex-end' : 'center',
    justifyContent: 'center',
    padding: isSheet ? 0 : 24,
  };
  const node = (
    <div
      hidden={hidden || undefined}
      className={hidden ? undefined : 'ds-scope portal-modal-scrim'}
      data-portal-scrim={hidden ? undefined : ''}
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
        data-testid={hidden ? undefined : testId}
        className={hidden ? undefined : isSheet ? 'portal-modal-panel portal-modal-sheet' : 'portal-modal-panel'}
        onClick={(event) => event.stopPropagation()}
        style={hidden ? undefined : {
          width: narrow ? '100%' : width,
          maxWidth: '100%',
          height: maxHeight,
          maxHeight: maxHeight ?? (isSheet ? 'calc(100dvh - 12px)' : 'calc(100dvh - 48px)'),
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: isSheet ? '28px 28px 0 0' : 28,
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
          />
        ) : null}
        <div style={hidden ? undefined : { overflow: 'auto', minHeight: 0, flex: '1 1 auto', ...panelStyle }}>{children}</div>
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
}: {
  label: string;
  header: PortalModalHeader;
  narrow: boolean;
  showIcon: boolean;
  icon: PortalModalIcon;
  headerIcon?: ReactNode;
  onClose: () => void;
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
          className="focus-visible:[--tw-outline-style:solid] focus-visible:outline-2 focus-visible:outline-[var(--fg)] focus-visible:outline-offset-2"
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
      {narrow ? null : (
        <span className="ds-mono" style={{ fontSize: 12, lineHeight: '18px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
          ↵ to confirm · Esc to close
        </span>
      )}
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
