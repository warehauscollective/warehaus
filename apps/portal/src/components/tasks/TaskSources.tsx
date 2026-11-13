'use client';

import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import {
  sourceAddedByLabel,
  sourceKindLabel,
  sourceLinkHref,
  sourceStateChip,
  type SourceChipTone,
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
            const state = sourceStateChip(link.state) ?? { label: 'No status', tone: 'neutral' as const };
            const text = link.title?.trim() || link.url;
            return (
              <li key={link.id} data-testid="task-source-row" style={{ padding: '0.7rem 0', borderBottom: '1px solid var(--border)' }}>
                <div className="flex flex-wrap items-center gap-2">
                  <SourcePill label={sourceKindLabel(link.kind)} tone="neutral" />
                  <SourcePill label={state.label} tone={state.tone} />
                </div>
                <SourceTitle href={href} text={text} />
                <p className="ds-mono" data-testid="task-source-added" style={{ fontSize: 11, color: 'var(--faint)', margin: '4px 0 0' }}>
                  {sourceAddedByLabel(link.addedBy)}
                </p>
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

export function TaskSources({
  taskId,
  hostSlug,
  live,
}: {
  taskId: string;
  hostSlug?: string;
  live: boolean;
}) {
  const fixtureScreen = useFixtureSourceScreen(live);
  const rows = useSafeQuery<{ items: TaskSourceLink[]; truncated: boolean }>(
    api.tasks.linksForStaff,
    live ? { hostSlug, taskId: taskId as Id<'tasks'> } : 'skip',
  );
  if (fixtureScreen === 'loading') {
    return <TaskSourcesPanel links={[]} loading truncated={false} />;
  }
  if (fixtureScreen === 'error') {
    return <TaskSourcesPanel links={[]} loading={false} truncated={false} error="unavailable" />;
  }
  if (fixtureScreen === 'links') {
    return <TaskSourcesPanel links={SOURCE_PANEL_LINKS} loading={false} truncated />;
  }
  if (fixtureScreen === 'empty') {
    return <TaskSourcesPanel links={[]} loading={false} truncated={false} />;
  }
  return (
    <TaskSourcesPanel
      links={rows.data?.items ?? []}
      loading={live && rows.loading}
      truncated={rows.data?.truncated === true}
      error={rows.error}
    />
  );
}
