'use client';

import { useEffect, type ReactNode } from 'react';
import { TaskGlyph } from '@/components/tasks/TaskGlyph';

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
    <p className="ds-mono" style={{ fontSize: 10, lineHeight: '15px', letterSpacing: '0.06em', color: 'var(--muted)' }}>
      {children}
    </p>
  );
}

export function FieldValue({ children }: { children: ReactNode }) {
  return <p style={{ marginTop: 4, fontSize: 14, lineHeight: '21px', color: 'var(--fg)' }}>{children}</p>;
}

/** Work status chip. Milestones have no stage field. */
export function StatusChip({ label }: { label: string }) {
  return (
    <span
      className="ds-mono inline-flex items-center gap-2"
      data-testid="milestone-status-chip"
      style={{
        border: '1px solid var(--border-2)',
        borderRadius: 999,
        padding: '4px 12px',
        fontSize: 11,
        letterSpacing: '0.04em',
        color: 'var(--fg)',
      }}
    >
      <TaskGlyph src="/icons/task-stage.svg" size={12} />
      {label}
    </span>
  );
}

export function TabRow({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
  label: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label={label}>
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            style={{
              background: selected ? 'var(--accent)' : 'transparent',
              color: selected ? 'var(--accent-fg)' : 'var(--muted)',
              border: 0,
              borderRadius: 9,
              padding: '12px 16px',
              fontFamily: 'var(--font-body)',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function PageHeading({
  title,
  subtitle,
  action,
  testId,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
  testId?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <h1 data-testid={testId} style={{ fontSize: 30, lineHeight: '45px', fontWeight: 600, color: 'var(--fg)' }}>{title}</h1>
        <p style={{ marginTop: 4, fontSize: 14, lineHeight: '21px', color: 'var(--muted)' }}>{subtitle}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
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
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 flex items-start justify-center overflow-y-auto md:px-4 md:py-16"
      style={{ zIndex: 80, background: 'color-mix(in oklab, var(--bg) 72%, transparent)' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
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
