'use client';

import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { scrollActiveIntoView } from '@/components/layout/sectionEdgeFade';
import { NavBreadcrumb } from '@/components/nav/NavBreadcrumb';
import { TaskGlyph } from '@/components/tasks/TaskGlyph';
import {
  dialogTabBoundary,
  focusShouldReturnToDialog,
  isolateOutsideDialog,
  MENU_ERROR_ID,
  nextTabIndex,
  tabIds,
} from './milestoneGuards';

export function Panel({
  children,
  testId,
}: {
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section
      data-testid={testId}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--panel-radius, 12px)',
        padding: 24,
      }}
    >
      {children}
    </section>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <p className="ds-mono" style={{ fontSize: 10, lineHeight: '15px', color: 'var(--muted)' }}>
      {children}
    </p>
  );
}

export function FieldValue({ children }: { children: ReactNode }) {
  return (
    <p style={{ marginTop: 4, fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 400, lineHeight: '21px', color: 'var(--fg)' }}>
      {children}
    </p>
  );
}

/** Work status chip. The glyph follows the existing status; the label stays the status value. */
export function StatusChip({ label, glyph = '/icons/task-stage.svg' }: { label: string; glyph?: string }) {
  return (
    <span
      className="ds-mono inline-flex items-center self-start"
      data-testid="milestone-status-chip"
      style={{
        boxSizing: 'border-box',
        width: 'auto',
        height: 24,
        gap: 8,
        border: '1px solid var(--border-2)',
        borderRadius: 999,
        padding: '4px 12px',
        fontSize: 11,
        lineHeight: 'normal',
        letterSpacing: '0.44px',
        color: 'var(--fg)',
      }}
    >
      <TaskGlyph src={glyph} size={12} />
      {label}
    </span>
  );
}

export function TabRow({
  tabs,
  active,
  onChange,
  label,
  idPrefix,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
  label: string;
  idPrefix: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const tabKey = tabs.map((tab) => tab.id).join('|');
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    scrollActiveIntoView(node, { activeSelector: '[aria-selected="true"]' });
  }, [active, tabKey]);
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((tab) => tab.id === active);
    const next = nextTabIndex(index, tabs.length, event.key);
    if (next == null) return;
    event.preventDefault();
    const nextTab = tabs[next];
    onChange(nextTab.id);
    scroller.current?.querySelector<HTMLButtonElement>(`#${tabIds(idPrefix, nextTab.id).tab}`)?.focus();
  };
  return (
    <div className="min-w-0 max-w-full">
      <div
        ref={scroller}
        className="flex flex-nowrap gap-2 overflow-x-auto"
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        style={{ scrollbarWidth: 'none' }}
      >
      {tabs.map((tab) => {
        const selected = tab.id === active;
        const ids = tabIds(idPrefix, tab.id);
        return (
          <button
            key={tab.id}
            id={ids.tab}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={ids.panel}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className="shrink-0 whitespace-nowrap"
            style={{
              boxSizing: 'border-box',
              height: 42,
              background: selected ? 'var(--accent)' : 'transparent',
              color: selected ? 'var(--accent-fg)' : 'var(--muted)',
              border: 0,
              borderRadius: 9,
              padding: '12px 16px',
              fontFamily: 'var(--font-geist), var(--font-body)',
              fontSize: 14,
              fontWeight: 500,
              lineHeight: 'normal',
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        );
      })}
      </div>
    </div>
  );
}

export function PageHeading({
  title,
  subtitle,
  action,
  testId,
  measure = false,
  alignAction = false,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
  testId?: string;
  /** Desktop title column from the 1440 milestone list. The action sits 24px after it. */
  measure?: boolean;
  /** Keep the 30px title and place the action 24px after the 820px column. */
  alignAction?: boolean;
}) {
  const column = measure || alignAction;
  return (
    <div className={column ? 'flex flex-col items-start gap-6 lg:flex-row lg:items-start' : 'flex flex-col items-start gap-4 md:flex-row md:items-start md:justify-between'}>
      <div className={measure ? 'flex min-w-0 w-full flex-col gap-6 lg:w-[820px] lg:gap-1' : alignAction ? 'flex min-w-0 w-full flex-col lg:w-[820px]' : 'min-w-0 flex-1'}>
        <h1
          data-testid={testId}
          style={{
            fontFamily: 'var(--font-geist), var(--font-body)',
            fontSize: measure ? undefined : 30,
            lineHeight: measure ? undefined : '45px',
            fontWeight: 600,
            color: 'var(--fg)',
          }}
          className={measure ? 'text-[28px] leading-[42px] lg:text-[30px] lg:leading-[45px]' : undefined}
        >
          {title}
        </h1>
        <p style={{ marginTop: measure ? 0 : 4, fontFamily: 'var(--font-geist), var(--font-body)', fontSize: 14, lineHeight: '21px', color: 'var(--muted)' }}>{subtitle}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Filled and outline controls from the milestone list. 14px medium, 12×16, radius 9. */
export function MilestoneListButton({
  children,
  onClick,
  tone = 'fill',
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: 'fill' | 'outline';
}) {
  const fill = tone === 'fill';
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center justify-center"
      style={{
        background: fill ? 'var(--accent)' : 'transparent',
        color: fill ? 'var(--accent-fg)' : 'var(--fg)',
        boxSizing: 'border-box',
        height: fill ? 42 : 44,
        border: fill ? 0 : '1px solid var(--border-2)',
        borderRadius: 9,
        padding: '12px 16px',
        fontFamily: 'var(--font-geist), var(--font-body)',
        fontSize: 14,
        fontWeight: 500,
        lineHeight: 'normal',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  disabled,
  testId,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      style={{
        background: 'transparent',
        color: 'var(--muted)',
        border: 0,
        borderRadius: 9,
        padding: '12px 16px',
        fontFamily: 'var(--font-body)',
        fontSize: 14,
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {children}
    </button>
  );
}

export function StateCard({
  kicker,
  title,
  body,
  action,
  tone = 'neutral',
  testId,
}: {
  kicker: string;
  title: string;
  body: string;
  action?: ReactNode;
  tone?: 'neutral' | 'danger' | 'warning';
  testId?: string;
}) {
  const background =
    tone === 'danger'
      ? 'color-mix(in oklab, var(--danger) 14%, var(--surface))'
      : tone === 'warning'
        ? 'color-mix(in oklab, var(--warning) 14%, var(--surface))'
        : 'var(--surface)';
  return (
    <article
      data-testid={testId}
      className="flex flex-col items-start gap-4"
      style={{
        background,
        border: '1px solid var(--border)',
        borderRadius: 'var(--panel-radius, 12px)',
        padding: 24,
        minHeight: 220,
      }}
    >
      <p className="ds-mono" style={{ fontSize: 10, lineHeight: '15px', letterSpacing: '0.06em', color: 'var(--muted)' }}>
        {kicker}
      </p>
      <h2 style={{ fontSize: 23, lineHeight: '35px', fontWeight: 500 }}>{title}</h2>
      <p style={{ fontSize: 15, lineHeight: '23px', color: 'var(--muted)', maxWidth: 520 }}>{body}</p>
      {action}
    </article>
  );
}

export function MilestoneDialog({
  title,
  onClose,
  children,
  testId,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  testId?: string;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const overlay = overlayRef.current;
    const node = dialogRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const release = overlay ? isolateOutsideDialog(overlay) : () => undefined;
    const focusable = () =>
      node
        ? [...node.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href]')].filter(
            (element) => !element.hasAttribute('disabled'),
          )
        : [];
    const first = focusable()[0];
    (first ?? node)?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !node) return;
      const items = focusable();
      if (items.length === 0) return;
      const boundary = dialogTabBoundary({
        shiftKey: event.shiftKey,
        atFirst: document.activeElement === items[0],
        atLast: document.activeElement === items[items.length - 1],
      });
      if (boundary === 'first') {
        event.preventDefault();
        items[0].focus({ preventScroll: true });
      } else if (boundary === 'last') {
        event.preventDefault();
        items[items.length - 1].focus({ preventScroll: true });
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!overlay) return;
      const target = event.target;
      const inside = target instanceof Node && overlay.contains(target);
      if (!focusShouldReturnToDialog({ targetInsideDialog: inside })) return;
      const items = focusable();
      (items[0] ?? node)?.focus({ preventScroll: true });
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocusIn);
      release();
      previous?.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 flex items-start justify-center overflow-y-auto md:px-4 md:py-16"
      style={{ zIndex: 80, background: 'color-mix(in oklab, var(--bg) 72%, transparent)', pointerEvents: 'auto' }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        data-testid={testId}
        className="min-h-full w-full rounded-none md:min-h-0 md:max-w-[760px] md:rounded-[var(--panel-radius,12px)]"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          padding: 24,
        }}
      >
        <div className="flex items-center justify-between gap-4 md:items-start">
          <GhostButton testId="milestone-dialog-close" onClick={onClose}>
            <span className="md:hidden">Cancel</span>
            <span className="hidden md:inline">Close</span>
          </GhostButton>
          <h2 className="md:order-first md:mr-auto" style={{ fontSize: 30, lineHeight: '39px', fontWeight: 600 }}>
            {title}
          </h2>
        </div>
        {children}
      </div>
    </div>
  );
}

export function MissingMilestoneApi({
  projectName,
  onBack,
  children,
}: {
  projectName: string;
  onBack?: () => void;
  children: ReactNode;
}) {
  return (
    <section data-testid="project-body" className="flex flex-col gap-6">
      {onBack ? (
        <NavBreadcrumb
          back="always"
          onBack={onBack}
          parent={{ label: 'Projects', onClick: onBack }}
          current={projectName}
        />
      ) : null}
      {children}
    </section>
  );
}

export function MenuActionError({
  error,
  onDismiss,
}: {
  error: string;
  onDismiss: () => void;
}) {
  return (
    <div id={MENU_ERROR_ID} role="alert" data-testid="milestone-error" className="flex flex-col items-start gap-2">
      <p style={{ fontSize: 13, color: 'var(--danger)' }}>{error}</p>
      <button type="button" onClick={onDismiss} style={{ font: 'inherit', fontSize: 13, color: 'var(--fg)', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>
        Dismiss
      </button>
    </div>
  );
}

export const fieldStyle = {
  width: '100%',
  border: '1px solid var(--border)',
  borderRadius: 9,
  background: 'var(--surface-2)',
  color: 'var(--fg)',
  font: 'inherit',
  fontSize: 14,
  lineHeight: '21px',
  padding: '12px 14px',
} as const;
