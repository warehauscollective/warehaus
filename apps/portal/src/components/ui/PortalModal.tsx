'use client';

import { useEffect, useRef, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type ModalFrame = {
  key: string;
  open: boolean;
  node: ReactNode;
};

/** Renders the top open frame. A modal opened from a modal swaps in place. */
export function PortalModalStack({ frames }: { frames: readonly ModalFrame[] }) {
  const active = [...frames].reverse().find((frame) => frame.open);
  if (!active) return null;
  return <>{active.node}</>;
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
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const lockedRef = useRef(locked);
  closeRef.current = onClose;
  lockedRef.current = locked;
  const placement = narrow ? sheet : 'center';

  useEffect(() => {
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
  }, []);

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
      className="ds-scope portal-modal-scrim"
      data-portal-scrim=""
      onClick={() => {
        if (!lockedRef.current) closeRef.current();
      }}
      style={scrim}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        data-testid={testId}
        className={isSheet ? 'portal-modal-panel portal-modal-sheet' : 'portal-modal-panel'}
        onClick={(event) => event.stopPropagation()}
        style={{
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
        {isSheet ? (
          <div className="portal-modal-grabber" data-testid="modal-grabber" aria-hidden="true">
            <span />
          </div>
        ) : null}
        <div style={{ overflow: 'auto', minHeight: 0, ...panelStyle }}>{children}</div>
      </div>
    </div>
  );
  return mountLayer(node);
}

function mountLayer(node: ReactElement) {
  if (typeof document === 'undefined') return node;
  return createPortal(node, document.body);
}
