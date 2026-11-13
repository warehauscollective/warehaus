'use client';

import { sourceKindLabel, sourceLinkHref, sourceStateChip, type SourceChipTone } from '@warehaus/portal-sync';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { useSafeQuery } from '@/hooks/useSafeQuery';

export type TaskSourceLink = {
  id: string;
  kind: string;
  url: string;
  title: string | null;
  addedBy: string;
  createdAt: number;
  state: string | null;
};

const TONE_COLOR: Record<SourceChipTone, string> = {
  neutral: 'var(--muted)',
  good: 'var(--success)',
  warn: 'var(--warn)',
  bad: 'var(--danger)',
};

function Chip({ label, tone }: { label: string; tone: SourceChipTone }) {
  const color = TONE_COLOR[tone];
  return (
    <span
      className="ds-mono inline-flex items-center whitespace-nowrap"
      data-testid="task-source-chip"
      style={{
        border: `1px solid ${tone === 'neutral' ? 'var(--border)' : color}`,
        borderRadius: 999,
        padding: '4px 10px',
        fontSize: 11,
        color,
      }}
    >
      {label}
    </span>
  );
}

/**
 * Read-only staff list of task links. Clients never mount this.
 */
export function TaskSourcesPanel({
  links,
  loading,
  truncated,
  error,
}: {
  links: TaskSourceLink[];
  loading: boolean;
  truncated: boolean;
  error?: string | null;
}) {
  return (
    <section aria-label="Sources" data-testid="task-sources" className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 className="ds-mono" style={{ fontSize: 12, letterSpacing: '2.64px', color: 'var(--fg)', margin: 0 }}>
          SOURCES
        </h3>
        <span className="ds-mono" style={{ fontSize: 12, color: 'var(--muted)' }}>staff only</span>
      </div>
      {loading ? (
        <p style={{ color: 'var(--muted)', fontSize: 'var(--t-sm)', margin: 0 }}>Loading sources…</p>
      ) : null}
      {!loading && error ? (
        <p role="alert" data-testid="task-sources-error" style={{ color: 'var(--danger)', fontSize: 'var(--t-sm)', margin: 0 }}>
          We could not load sources.
        </p>
      ) : null}
      {!loading && !error && links.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 'var(--t-sm)', margin: 0 }}>No sources yet.</p>
      ) : null}
      {!error && links.length > 0 ? (
        <ul className="flex flex-col" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {links.map((link) => {
            const href = sourceLinkHref(link.url);
            const state = sourceStateChip(link.state);
            const text = link.title?.trim() || link.url;
            return (
              <li key={link.id} data-testid="task-source-row" style={{ padding: '0.7rem 0', borderBottom: '1px solid var(--border)' }}>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip label={sourceKindLabel(link.kind)} tone="neutral" />
                  {state ? <Chip label={state.label} tone={state.tone} /> : null}
                </div>
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer noopener"
                    style={{ display: 'block', marginTop: 6, fontSize: 'var(--t-sm)', color: 'var(--fg)', overflowWrap: 'anywhere' }}
                  >
                    {text}
                  </a>
                ) : (
                  <p style={{ margin: '6px 0 0', fontSize: 'var(--t-sm)', color: 'var(--fg)', overflowWrap: 'anywhere' }}>{text}</p>
                )}
                <p className="ds-mono" style={{ fontSize: 11, color: 'var(--faint)', margin: '4px 0 0' }}>{link.addedBy}</p>
              </li>
            );
          })}
        </ul>
      ) : null}
      {truncated ? (
        <p className="ds-mono" style={{ fontSize: 11, color: 'var(--faint)', margin: 0 }}>Showing the first 50.</p>
      ) : null}
    </section>
  );
}

export function TaskSources({
  taskId,
  hostSlug,
  live,
}: {
  taskId: string;
  hostSlug?: string;
  live: boolean;
}) {
  const rows = useSafeQuery<{ items: TaskSourceLink[]; truncated: boolean }>(
    api.tasks.linksForStaff,
    live ? { hostSlug, taskId: taskId as Id<'tasks'> } : 'skip',
  );
  return (
    <TaskSourcesPanel
      links={rows.data?.items ?? []}
      loading={live && rows.loading}
      truncated={rows.data?.truncated === true}
      error={rows.error}
    />
  );
}
