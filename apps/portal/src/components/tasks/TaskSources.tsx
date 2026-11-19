'use client';

import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import {
  TASK_LINK_KINDS,
  sourceAddedByLabel,
  sourceKindLabel,
  sourceLinkHref,
  sourceStateChip,
  type SourceChipTone,
  type TaskLinkKind,
} from '@warehaus/portal-sync';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { useFixturePreview } from '@/components/providers/FixturePreviewProvider';
import { Pill } from '@/components/ui/primitives';
import {
  readSourceScreen,
  SOURCE_PANEL_LINKS,
  type SourcePanelScreen,
  type TaskSourceLink,
} from './sourcePanelFixtures';

export type { TaskSourceLink };

const TONE_COLOR: Record<'good' | 'bad', string> = {
  good: 'var(--success)',
  bad: 'var(--danger)',
};

function SourcePill({ label, tone }: { label: string; tone: SourceChipTone }) {
  if (tone === 'warn') return <Pill className="task-source-warn">{label}</Pill>;
  const color = tone === 'neutral' ? undefined : TONE_COLOR[tone];
  return <Pill color={color}>{label}</Pill>;
}

function SourceTitle({ href, text }: { href: string | null; text: string }) {
  if (!href) {
    return (
      <p style={{ margin: '6px 0 0', fontSize: 'var(--t-sm)', color: 'var(--fg)', overflowWrap: 'anywhere' }}>{text}</p>
    );
  }
  return (
    <div style={{ marginTop: 6 }}>
      <a
        className="task-source-link"
        data-testid="task-source-link"
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        aria-label={`${text} (opens in a new tab)`}
        style={{ fontSize: 'var(--t-sm)', overflowWrap: 'anywhere' }}
      >
        {text}
        <ExternalLink aria-hidden size={14} strokeWidth={2} style={{ display: 'inline-block', marginLeft: 4, verticalAlign: '-2px' }} />
      </a>
    </div>
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
  onAdd,
  onRemove,
}: {
  links: TaskSourceLink[];
  loading: boolean;
  truncated: boolean;
  error?: string | null;
  onAdd?: () => void;
  onRemove?: (id: string) => void;
}) {
  return (
    <section aria-label="Sources" data-testid="task-sources" className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 className="ds-mono" style={{ fontSize: 12, letterSpacing: '2.64px', color: 'var(--fg)', margin: 0 }}>
          SOURCES
        </h3>
        <span className="ds-mono" style={{ fontSize: 12, color: 'var(--muted)' }}>staff only</span>
        {onAdd ? (
          <button
            type="button"
            data-testid="task-add-source"
            onClick={onAdd}
            className="ml-auto"
            style={{ background: 'none', border: 0, color: 'var(--fg)', cursor: 'pointer', fontSize: 13, padding: 0 }}
          >
            Add source
          </button>
        ) : null}
      </div>
      {loading ? (
        <p style={{ color: 'var(--muted)', fontSize: 'var(--t-sm)', margin: 0 }}>Loading sources…</p>
      ) : null}
      {!loading && error ? (
        <p role="alert" data-testid="task-sources-error" style={{ color: 'var(--danger-text)', fontSize: 'var(--t-sm)', margin: 0 }}>
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
            const state = sourceStateChip(link.state) ?? { label: 'No status', tone: 'neutral' as const };
            const text = link.title?.trim() || link.url;
            return (
              <li key={link.id} data-testid="task-source-row" style={{ padding: '0.7rem 0', borderBottom: '1px solid var(--border)' }}>
                <div className="flex flex-wrap items-center gap-2">
                  <SourcePill label={sourceKindLabel(link.kind)} tone="neutral" />
                  <SourcePill label={state.label} tone={state.tone} />
                </div>
                <SourceTitle href={href} text={text} />
                <div className="flex items-center justify-between gap-3">
                  <p className="ds-mono" data-testid="task-source-added" style={{ fontSize: 11, color: 'var(--faint)', margin: '4px 0 0' }}>
                    {sourceAddedByLabel(link.addedBy)}
                  </p>
                  {onRemove ? (
                    <button
                      type="button"
                      data-testid="task-remove-source"
                      onClick={() => onRemove(link.id)}
                      style={{ background: 'none', border: 0, color: 'var(--muted)', cursor: 'pointer', fontSize: 12, padding: 0 }}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {truncated ? (
        <p className="ds-mono" data-testid="task-sources-cap" style={{ fontSize: 11, color: 'var(--faint)', margin: 0 }}>
          Showing the first 50.
        </p>
      ) : null}
    </section>
  );
}

function useFixtureSourceScreen(live: boolean): SourcePanelScreen | null {
  const fixtures = useFixturePreview();
  const [screen, setScreen] = useState<SourcePanelScreen | null>(null);
  useEffect(() => {
    if (!fixtures || live || typeof window === 'undefined') {
      setScreen(null);
      return;
    }
    const value = new URLSearchParams(window.location.search).get('sources');
    setScreen(readSourceScreen(value, true));
  }, [fixtures, live]);
  return fixtures && !live ? screen : null;
}

function withEdits(links: TaskSourceLink[], extra: TaskSourceLink[], removedIds: readonly string[]): TaskSourceLink[] {
  const hidden = new Set(removedIds);
  const seen = new Set(links.map((link) => link.id));
  return [...links, ...extra.filter((link) => !seen.has(link.id))].filter((link) => !hidden.has(link.id));
}

export function AddSourceForm({
  busy,
  error,
  onSubmit,
}: {
  busy?: boolean;
  error?: string | null;
  onSubmit: (input: { kind: TaskLinkKind; url: string; title: string }) => void;
}) {
  const [kind, setKind] = useState<TaskLinkKind>('Notion page or doc');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  return (
    <form
      data-testid="task-add-source-form"
      className="grid gap-3"
      style={{ padding: 12 }}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ kind, url, title });
      }}
    >
      <h2 style={{ margin: 0, fontSize: 20, lineHeight: '30px', fontWeight: 600 }}>Add source</h2>
      <label className="grid gap-1" style={{ fontSize: 12, color: 'var(--muted)' }}>
        Kind
        <select
          data-menu-initial-focus=""
          aria-label="Source kind"
          value={kind}
          onChange={(event) => setKind(event.target.value as TaskLinkKind)}
          style={{ height: 36, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--fg)', font: 'inherit', fontSize: 14, padding: '0 8px' }}
        >
          {TASK_LINK_KINDS.map((item) => (
            <option key={item} value={item}>
              {sourceKindLabel(item)}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1" style={{ fontSize: 12, color: 'var(--muted)' }}>
        URL
        <input
          aria-label="Source URL"
          value={url}
          required
          onChange={(event) => setUrl(event.target.value)}
          style={{ height: 36, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--fg)', font: 'inherit', fontSize: 14, padding: '0 8px' }}
        />
      </label>
      <label className="grid gap-1" style={{ fontSize: 12, color: 'var(--muted)' }}>
        Label
        <input
          aria-label="Source label"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          style={{ height: 36, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--fg)', font: 'inherit', fontSize: 14, padding: '0 8px' }}
        />
      </label>
      {error ? <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--danger-text)' }}>{error}</p> : null}
      <button
        type="submit"
        disabled={busy}
        style={{ justifySelf: 'start', height: 36, borderRadius: 8, border: '1px solid var(--fg)', background: 'transparent', color: 'var(--fg)', font: 'inherit', fontSize: 14, padding: '0 12px', cursor: 'pointer' }}
      >
        Add source
      </button>
    </form>
  );
}

export function TaskSources({
  taskId,
  hostSlug,
  live,
  extra = [],
  removedIds = [],
  onAdd,
  onRemove,
}: {
  taskId: string;
  hostSlug?: string;
  live: boolean;
  extra?: TaskSourceLink[];
  removedIds?: readonly string[];
  onAdd?: () => void;
  onRemove?: (id: string) => void;
}) {
  const fixtureScreen = useFixtureSourceScreen(live);
  const rows = useSafeQuery<{ items: TaskSourceLink[]; truncated: boolean }>(
    api.tasks.linksForStaff,
    live ? { hostSlug, taskId: taskId as Id<'tasks'> } : 'skip',
  );
  const edit = { onAdd, onRemove };
  if (fixtureScreen === 'loading') {
    return <TaskSourcesPanel links={[]} loading truncated={false} />;
  }
  if (fixtureScreen === 'error') {
    return <TaskSourcesPanel links={[]} loading={false} truncated={false} error="unavailable" />;
  }
  if (fixtureScreen === 'links') {
    return <TaskSourcesPanel links={withEdits(SOURCE_PANEL_LINKS, extra, removedIds)} loading={false} truncated {...edit} />;
  }
  if (fixtureScreen === 'empty') {
    return <TaskSourcesPanel links={withEdits([], extra, removedIds)} loading={false} truncated={false} {...edit} />;
  }
  return (
    <TaskSourcesPanel
      links={withEdits(rows.data?.items ?? [], extra, removedIds)}
      loading={live && rows.loading}
      truncated={rows.data?.truncated === true}
      error={rows.error}
      {...edit}
    />
  );
}
