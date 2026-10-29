'use client';

import { useId, type ReactNode } from 'react';
import { TaskGlyph } from '@/components/tasks/TaskGlyph';
import { OutlineButton, PrimaryButton } from '@/components/ui/primitives';
import {
  PROJECT_CREATE_HINT,
  projectListEmptyCopy,
  projectListLoadNotice,
  projectListShowsFilters,
} from '@/lib/data/projectList';

/** Dashed empty card from Projects / States (Figma 297:18354). */
export function ProjectListEmptyState({
  viewerCount,
  staff,
  onCreate,
  onClear,
  createEnabled = false,
}: {
  viewerCount: number;
  staff: boolean;
  onCreate?: () => void;
  onClear?: () => void;
  createEnabled?: boolean;
}) {
  const copy = projectListEmptyCopy(viewerCount, staff);
  if (!copy.detail) {
    return (
      <p className="mt-4" data-testid="projects-empty" style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
        {copy.title}
        {onClear ? (
          <>
            {' '}
            <button
              type="button"
              data-testid="clear-filters"
              onClick={onClear}
              style={{
                background: 'none',
                border: 0,
                padding: 0,
                color: 'var(--fg)',
                font: 'inherit',
                textDecoration: 'underline',
                cursor: 'pointer',
              }}
            >
              Clear filters
            </button>
          </>
        ) : null}
      </p>
    );
  }
  return (
    <div
      className="mt-4 flex flex-col items-center text-center"
      data-testid="projects-empty"
      style={{
        gap: 12,
        border: '1px dashed var(--border)',
        borderRadius: 18,
        background: 'var(--bg-2, var(--bg))',
        padding: '48px 24px',
      }}
    >
      <span style={{ color: 'var(--muted)' }}>
        <TaskGlyph src="/icons/task-layers.svg" size={28} />
      </span>
      <p style={{ margin: 0, fontSize: 16, fontWeight: 500, lineHeight: '19px' }}>{copy.title}</p>
      <p
        style={{
          margin: 0,
          maxWidth: 440,
          fontSize: 13,
          lineHeight: '19px',
          color: 'var(--muted)',
          textWrap: 'balance',
        }}
      >
        {copy.detail}
      </p>
      {staff && onCreate ? (
        <NewProjectButton variant="outline" enabled={createEnabled} onCreate={onCreate} />
      ) : null}
    </div>
  );
}

/**
 * Header and empty-state New project. While create is off the control stays
 * on screen, dimmed, and the hint is what keyboard users land on.
 */
export function NewProjectButton({
  enabled,
  onCreate,
  variant,
}: {
  enabled: boolean;
  onCreate: () => void;
  variant: 'primary' | 'outline';
}) {
  const hintId = useId();
  if (enabled) {
    return variant === 'primary' ? (
      <PrimaryButton onClick={onCreate}>
        <span data-testid="new-project">New project</span>
      </PrimaryButton>
    ) : (
      <OutlineButton onClick={onCreate}>
        <span data-testid="new-project">New project</span>
      </OutlineButton>
    );
  }
  const button = (
    <button
      type="button"
      disabled
      aria-disabled="true"
      tabIndex={-1}
      data-testid="new-project"
      style={{
        pointerEvents: 'none',
        background: variant === 'primary' ? 'var(--accent)' : 'transparent',
        color: variant === 'primary' ? 'var(--accent-fg)' : 'var(--fg)',
        border: variant === 'primary' ? 0 : '1px solid var(--border)',
        borderRadius: 9,
        fontFamily: 'var(--font-body)',
        fontSize: variant === 'primary' ? 'var(--t-sm)' : 14,
        fontWeight: variant === 'primary' ? 600 : 500,
        padding: variant === 'primary' ? '0.65rem 1.1rem' : '0.65rem 1rem',
        cursor: 'not-allowed',
        opacity: 0.4,
      }}
    >
      New project
    </button>
  );
  return (
    <span
      tabIndex={0}
      aria-disabled="true"
      aria-describedby={hintId}
      title={PROJECT_CREATE_HINT}
      data-testid="new-project-hint"
      className="inline-flex"
      style={{ cursor: 'not-allowed' }}
    >
      {button}
      <span id={hintId} className="sr-only">
        {PROJECT_CREATE_HINT}
      </span>
    </span>
  );
}

/** Three list rows: icon tile, two bars, a short pill. */
export function ProjectListSkeleton() {
  return (
    <div className="mt-4 flex flex-col" aria-busy="true" data-testid="projects-loading" style={{ gap: 24 }}>
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex items-center" style={{ gap: 16, minHeight: 36 }}>
          <span className="animate-pulse shrink-0" style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-2)' }} />
          <span className="flex min-w-0 flex-1 flex-col" style={{ gap: 8 }}>
            <span className="animate-pulse" style={{ height: 12, width: '70%', maxWidth: 302, borderRadius: 6, background: 'var(--surface-2)' }} />
            <span className="animate-pulse" style={{ height: 10, width: 160, maxWidth: '40%', borderRadius: 6, background: 'var(--surface-2)' }} />
          </span>
          <span className="animate-pulse shrink-0" style={{ width: 64, height: 22, borderRadius: 999, background: 'var(--surface-2)' }} />
        </div>
      ))}
    </div>
  );
}

/** One KPI card with no figures, used while the projects query is in flight. */
export function ProjectKpiSkeleton() {
  return (
    <div
      aria-hidden
      data-testid="project-kpi-skeleton"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 28,
        padding: 'clamp(1.25rem, 2vw, 2rem)',
      }}
    >
      <span className="animate-pulse block" style={{ height: 12, width: 72, borderRadius: 6, background: 'var(--surface-2)' }} />
      <span className="animate-pulse mt-4 block" style={{ height: 28, width: 48, borderRadius: 8, background: 'var(--surface-2)' }} />
      <span className="animate-pulse mt-3 block" style={{ height: 12, width: 96, borderRadius: 6, background: 'var(--surface-2)' }} />
    </div>
  );
}

export function ProjectListFilters({
  loading,
  viewerCount,
  children,
}: {
  loading: boolean;
  viewerCount: number;
  children?: ReactNode;
}) {
  if (!projectListShowsFilters(viewerCount, loading)) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Project filters" data-testid="project-filters">
      {children}
    </div>
  );
}

export function ProjectListLoadNotice({
  staff,
  message,
  onRetry,
  cached = false,
}: {
  staff: boolean;
  message: string;
  onRetry: () => void;
  cached?: boolean;
}) {
  const copy = projectListLoadNotice(staff, message, cached);
  return (
    <div
      role="alert"
      data-testid="projects-load-error"
      className="mt-4 flex items-start"
      style={{
        gap: 12,
        border: '1px solid var(--danger)',
        borderRadius: 18,
        background: 'var(--surface)',
        padding: '16px 24px',
      }}
    >
      <span
        aria-hidden
        className="inline-flex shrink-0 items-center justify-center"
        style={{
          width: 20,
          height: 20,
          borderRadius: 999,
          border: '1.25px solid var(--danger)',
          color: 'var(--danger)',
          fontSize: 11,
          fontWeight: 600,
          lineHeight: '20px',
        }}
      >
        !
      </span>
      <span className="flex min-w-0 flex-1 flex-col" style={{ gap: 4 }}>
        <span style={{ color: 'var(--danger)', fontSize: 14, fontWeight: 600, lineHeight: '20px' }}>{copy.title}</span>
        <span
          className={copy.mono ? 'ds-mono' : undefined}
          style={{
            color: 'var(--muted)',
            fontSize: 13,
            lineHeight: '19px',
            ...(copy.mono
              ? { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
              : {}),
          }}
        >
          {copy.body}
        </span>
        {copy.retry ? (
          <span style={{ marginTop: 8 }}>
            <OutlineButton onClick={onRetry}>Try again</OutlineButton>
          </span>
        ) : null}
      </span>
    </div>
  );
}

/**
 * Page body under the projects header. A no-data error replaces the KPIs and the list.
 * A refresh error keeps `children` and changes the notice copy.
 */
export function ProjectListScreen({
  staff,
  errorMode,
  message,
  onRetry,
  children,
}: {
  staff: boolean;
  errorMode: 'none' | 'empty' | 'refresh';
  message: string | null;
  onRetry: () => void;
  children?: ReactNode;
}) {
  return (
    <>
      {!staff ? (
        <p data-testid="projects-client-line" style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
          You only see what is shared with you.
        </p>
      ) : null}
      {errorMode !== 'none' && message ? (
        <ProjectListLoadNotice staff={staff} message={message} cached={errorMode === 'refresh'} onRetry={onRetry} />
      ) : null}
      {errorMode === 'empty' ? null : children}
    </>
  );
}

/** Card body for the projects list. Query failures are handled by ProjectListScreen. */
export function ProjectListOutcome({
  loading,
  viewerCount,
  visibleCount,
  staff,
  onCreate,
  onClear,
  createEnabled,
  children,
}: {
  loading: boolean;
  viewerCount: number;
  visibleCount: number;
  staff: boolean;
  onCreate: () => void;
  onClear?: () => void;
  createEnabled: boolean;
  children?: ReactNode;
}) {
  if (loading) return <ProjectListSkeleton />;
  if (visibleCount === 0) {
    return (
      <ProjectListEmptyState
        viewerCount={viewerCount}
        staff={staff}
        onCreate={onCreate}
        onClear={onClear}
        createEnabled={createEnabled}
      />
    );
  }
  return <>{children}</>;
}
