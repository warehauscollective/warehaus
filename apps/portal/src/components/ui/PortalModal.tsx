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

export function PortalModal({
  testId,
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
}: {
  testId?: string;
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
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const lockedRef = useRef(locked);
  closeRef.current = onClose;
  lockedRef.current = locked;
  const placement = narrow ? sheet : 'center';

  useEffect(() => {
    if (hidden) return;
    const panel = panelRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
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
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [hidden]);

  const isSheet = placement !== 'center';
  const scrim: CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex,
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
      onClick={() => {
        if (hidden || lockedRef.current) return;
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
        <div style={hidden ? undefined : { overflow: 'auto', minHeight: 0, ...panelStyle }}>{children}</div>
      </div>
    </div>
  );
  return mountLayer(node);
}

function mountLayer(node: ReactElement) {
  if (typeof document === 'undefined') return node;
  return createPortal(node, document.body);
}
