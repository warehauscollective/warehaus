'use client';

import type { ReactNode } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { Bevel } from '@warehaus/ui';
import { TaskGlyph } from '@/components/tasks/TaskGlyph';
import { PORTAL_SURFACE_RADIUS } from '@/lib/design/portal-chrome';
import {
  CLIENT_AWAITING_LABEL,
  type ActivityRow,
  type AwaitingRow,
  type DashboardModel,
  type ProjectRow,
  type StaffActivityRow,
  type StaffAwaitingRow,
  type StaffDashboard,
  type StatCard,
  type SyncHealth,
} from '@/lib/data/dashboard';

export type DashPreview = 'empty' | 'loading' | 'error' | 'long' | null;

const LONG_NAME =
  'Quarterly seasonal menu photography, packaging and in-store signage rollout for all twelve Northwind Foods locations';

export function DashboardHome({
  model,
  focus,
  loading,
  preview,
  showLoadError,
  billingMark,
  onOpenTask,
  onOpenProject,
}: {
  model: DashboardModel;
  focus: 'all' | 'awaiting' | 'sync' | 'activity';
  loading: boolean;
  preview: DashPreview;
  showLoadError: boolean;
  billingMark: 'on-file' | 'none';
  onOpenTask: (row: AwaitingRow) => void;
  onOpenProject: (row: ProjectRow) => void;
}) {
  const busy = loading || preview === 'loading';
  const awaiting = displayAwaiting(model, preview);
  const sync = model.audience === 'staff' ? displaySync(model, preview) : null;
  const stats =
    preview === 'error' && model.audience === 'staff'
      ? model.stats.map((stat) =>
          stat.label === 'Sync health'
            ? { ...stat, value: 'Issue', note: 'Pull failed', tone: 'danger' as const }
            : stat,
        )
      : model.stats;
  const showError = model.audience === 'client' && (showLoadError || preview === 'error');

  return (
    <div
      className="flex flex-col"
      data-testid="dashboard"
      data-audience={model.audience}
      data-billing={billingMark}
      data-state={preview ?? (busy ? 'loading' : 'ready')}
      style={{ gap: 32 }}
    >
      {showError ? (
        <ErrorNotice
          title="We could not load your dashboard"
          body="Check your connection and try again."
        />
      ) : null}

      {focus === 'all' ? <StatGrid stats={stats} loading={busy} /> : null}

      {focus === 'all' && model.audience === 'staff' ? (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
          <StagePanel stages={model.stages} loading={busy} />
          {sync ? <SyncPanel health={sync} /> : null}
        </div>
      ) : null}

      {focus === 'all' && model.audience === 'client' ? (
        <ProjectPanel projects={model.projects} loading={busy} onOpen={onOpenProject} />
      ) : null}

      {focus === 'sync' && sync ? <SyncPanel health={sync} /> : null}

      {focus === 'all' || focus === 'awaiting' ? (
        <AwaitingPanel
          audience={model.audience}
          rows={awaiting}
          loading={busy}
          onOpen={onOpenTask}
        />
      ) : null}

      {focus === 'all' || focus === 'activity' ? (
        <ActivityPanel audience={model.audience} rows={model.activity} loading={busy} />
      ) : null}
    </div>
  );
}

function displayAwaiting(model: DashboardModel, preview: DashPreview): readonly (AwaitingRow | StaffAwaitingRow)[] {
  if (preview === 'empty') return [];
  if (preview !== 'long') return model.awaiting;
  const sample: StaffAwaitingRow = {
    id: 'long-text',
    name: LONG_NAME,
    meta:
      model.audience === 'client'
        ? 'Spring menu launch · Due Oct 6'
        : 'Northwind Foods · Spring menu launch · Due Oct 6',
    stageLabel: model.audience === 'client' ? CLIENT_AWAITING_LABEL : 'Awaiting Go',
    status: 'In review',
    category: model.audience === 'staff' ? 'Design' : null,
    projectId: null,
    published: true,
  };
  if (model.audience === 'client') {
    return [
      {
        id: sample.id,
        name: sample.name,
        meta: 'Spring menu launch · Due Oct 6',
        stageLabel: CLIENT_AWAITING_LABEL,
        status: sample.status,
        category: null,
        projectId: null,
      },
      ...model.awaiting,
    ];
  }
  return [sample, ...model.awaiting];
}

function displaySync(model: StaffDashboard, preview: DashPreview): SyncHealth {
  if (preview !== 'error') return model.sync;
  return {
    ...model.sync,
    cardValue: 'Issue',
    cardNote: 'Pull failed',
    rows: model.sync.rows.map((row) =>
      row.key === 'pull' ? { ...row, value: 'Failed', tone: 'danger' } : row,
    ),
    notice: {
      title: 'Sync problem',
      body: 'Notion sync is behind by 14 minutes',
    },
  };
}

function Panel({
  title,
  subtitle,
  testId,
  children,
}: {
  title: string;
  subtitle: string;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <Bevel
      corners="br"
      radius={PORTAL_SURFACE_RADIUS}
      cut={2}
      shoulder={0.75}
      fill="var(--surface)"
      stroke="var(--border)"
      data-testid={testId}
      style={{ padding: 'clamp(1.25rem, 2vw, 2rem)', position: 'relative' }}
    >
      <h2 style={{ fontSize: 20, fontWeight: 600, lineHeight: '26px' }}>{title}</h2>
      <p style={{ marginTop: 4, fontSize: 13, lineHeight: '19px', color: 'var(--muted)' }}>{subtitle}</p>
      <div style={{ marginTop: 24 }}>{children}</div>
    </Bevel>
  );
}

function StatGrid({ stats, loading }: { stats: readonly StatCard[]; loading: boolean }) {
  return (
    <div
      className="grid gap-4"
      data-testid="dashboard-stats"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))' }}
    >
      {stats.map((stat) => (
        <Bevel
          key={stat.label}
          corners="br"
          radius={PORTAL_SURFACE_RADIUS}
          cut={1.5}
          shoulder={0.55}
          fill="var(--surface)"
          stroke="var(--border)"
          style={{ padding: 'clamp(1rem, 2vw, 1.5rem)' }}
        >
          <p
            className="ds-mono"
            style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}
          >
            {stat.label}
          </p>
          <p
            className="ds-mono"
            style={{
              marginTop: 8,
              fontSize: 'clamp(2.25rem, 4vw, 3.75rem)',
              lineHeight: 1,
              letterSpacing: '-0.03em',
              color: !loading && stat.tone === 'danger' ? 'var(--danger)' : 'var(--fg)',
            }}
          >
            {loading ? '…' : stat.value}
          </p>
          <p
            style={{
              marginTop: 12,
              fontSize: 14,
              color: !loading && stat.tone === 'danger' ? 'var(--danger)' : 'var(--fg)',
            }}
          >
            {loading ? 'Loading' : stat.note}
          </p>
        </Bevel>
      ))}
    </div>
  );
}

function StagePanel({
  stages,
  loading,
}: {
  stages: StaffDashboard['stages'];
  loading: boolean;
}) {
  return (
    <Panel title="Tasks by Status" subtitle="All clients" testId="stage-bars">
      <div className="flex flex-col gap-3">
        {stages.map((row) => (
          <div key={row.stage} className="flex items-center gap-3">
            <div className="w-[150px] shrink-0 sm:w-[170px]">
              <StageBadge label={row.stage} hot={row.stage === 'Awaiting Go'} />
            </div>
            <div
              className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full"
              style={{ background: 'var(--surface-2, var(--bg))' }}
            >
              <div
                className="h-1.5 rounded-full"
                style={{
                  width: loading ? '0%' : `${Math.max(row.count === 0 ? 0 : 8, row.share * 100)}%`,
                  background: 'var(--fg)',
                }}
              />
            </div>
            <span className="ds-mono w-7 shrink-0 text-right" style={{ fontSize: 13 }}>
              {loading ? '…' : row.count}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function SyncPanel({ health }: { health: SyncHealth }) {
  return (
    <Panel title="Sync health" subtitle="Notion is the source of truth" testId="sync-health">
      <div className="flex flex-col gap-4">
        {health.rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2" style={{ fontSize: 14 }}>
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ background: row.tone === 'danger' ? 'var(--danger)' : 'var(--fg)' }}
              />
              <span className="truncate">{row.label}</span>
            </span>
            <span
              className="shrink-0"
              style={{ fontSize: 13, color: row.tone === 'danger' ? 'var(--danger)' : 'var(--muted)' }}
            >
              {row.value}
            </span>
          </div>
        ))}
        {health.notice ? <ErrorNotice title={health.notice.title} body={health.notice.body} /> : null}
      </div>
    </Panel>
  );
}

function ProjectPanel({
  projects,
  loading,
  onOpen,
}: {
  projects: readonly ProjectRow[];
  loading: boolean;
  onOpen: (row: ProjectRow) => void;
}) {
  return (
    <Panel title="Your projects" subtitle="Everything Warehaus is working on" testId="client-projects">
      {loading ? (
        <SkeletonRows />
      ) : projects.length === 0 ? (
        <p style={{ fontSize: 14, color: 'var(--muted)' }}>No active projects yet.</p>
      ) : (
        projects.map((project) => (
          <button
            key={project.id}
            type="button"
            onClick={() => onOpen(project)}
            className="flex w-full flex-col gap-3 border-b py-5 text-left sm:flex-row sm:items-center"
            style={{ borderColor: 'var(--border)', background: 'transparent' }}
          >
            <span
              className="ds-mono flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
              style={{ background: 'var(--surface-2, var(--bg))', border: '1px solid var(--border)', fontSize: 11 }}
            >
              {initials(project.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block" style={{ fontSize: 16, fontWeight: 500 }}>
                {project.name}
              </span>
              <span className="ds-mono block" style={{ marginTop: 4, fontSize: 12, color: 'var(--muted)' }}>
                {project.brand}
              </span>
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-[220px]">
              <span className="h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--surface-2, var(--bg))' }}>
                <span
                  className="block h-1.5 rounded-full"
                  style={{ width: `${project.percent}%`, background: 'var(--fg)' }}
                />
              </span>
              <span className="ds-mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
                {project.percentLabel}
              </span>
            </span>
            <span className="ds-mono hidden shrink-0 sm:block" style={{ width: 72, fontSize: 12, color: 'var(--muted)' }}>
              {project.itemsLabel}
            </span>
            <span className="ds-mono hidden shrink-0 md:block" style={{ width: 120, fontSize: 12, color: 'var(--muted)' }}>
              {project.updatedLabel}
            </span>
            <ChevronRight className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden />
          </button>
        ))
      )}
    </Panel>
  );
}

function AwaitingPanel({
  audience,
  rows,
  loading,
  onOpen,
}: {
  audience: DashboardModel['audience'];
  rows: readonly (AwaitingRow | StaffAwaitingRow)[];
  loading: boolean;
  onOpen: (row: AwaitingRow) => void;
}) {
  const staff = audience === 'staff';
  return (
    <Panel
      title={staff ? 'Awaiting your go' : 'Needs your attention'}
      subtitle={
        staff
          ? 'Tasks at Awaiting Go. Staff move them on in Notion.'
          : 'These are waiting for your go-ahead.'
      }
      testId="awaiting-go"
    >
      {loading ? (
        <SkeletonRows />
      ) : rows.length === 0 ? (
        <EmptyAwaiting staff={staff} />
      ) : (
        rows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => onOpen(row)}
            className="flex w-full items-start gap-3 border-b py-5 text-left"
            style={{ borderColor: 'var(--border)', background: 'transparent' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" src="/icons/task-check-open.svg" width={20} height={20} className="mt-0.5 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block break-words" style={{ fontSize: 16, fontWeight: 500, lineHeight: 1.35 }}>
                {row.name}
              </span>
              <span
                className="ds-mono block break-words"
                style={{ marginTop: 4, fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}
              >
                {row.meta}
              </span>
              <span className="mt-2 flex flex-wrap items-center gap-2">
                <StageBadge label={row.stageLabel} hot />
                <StatusBadge status={row.status} />
                {staff && row.category ? (
                  <span className="ds-mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {row.category}
                  </span>
                ) : null}
                {staff && 'published' in row ? <PublishMark published={row.published} /> : null}
              </span>
            </span>
            <ChevronRight className="mt-1 h-4 w-4 shrink-0" aria-hidden />
          </button>
        ))
      )}
    </Panel>
  );
}

function ActivityPanel({
  audience,
  rows,
  loading,
}: {
  audience: DashboardModel['audience'];
  rows: readonly (ActivityRow | StaffActivityRow)[];
  loading: boolean;
}) {
  const staff = audience === 'staff';
  return (
    <Panel
      title={staff ? 'Recent activity' : 'Recent updates'}
      subtitle={staff ? 'All events, including ones not published to clients' : 'Only things shared with you'}
      testId="dashboard-activity"
    >
      {loading ? (
        <SkeletonRows />
      ) : rows.length === 0 ? (
        <p style={{ fontSize: 14, color: 'var(--muted)' }}>No recent updates.</p>
      ) : (
        rows.map((row) => (
          <div
            key={row.id}
            className="flex items-center gap-4 border-b py-5"
            style={{ borderColor: 'var(--border)' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" src="/icons/activity-row.svg" width={16} height={16} className="shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block truncate" style={{ fontSize: 16, fontWeight: 500 }}>
                {row.name}
              </span>
              <span className="ds-mono block truncate" style={{ marginTop: 4, fontSize: 12, color: 'var(--muted)' }}>
                {row.summary}
              </span>
            </span>
            {staff && 'published' in row && row.published != null ? (
              <PublishMark published={row.published} />
            ) : null}
            <span className="ds-mono shrink-0 text-right" style={{ width: 80, fontSize: 12, color: 'var(--faint)' }}>
              {row.when}
            </span>
          </div>
        ))
      )}
    </Panel>
  );
}

function EmptyAwaiting({ staff }: { staff: boolean }) {
  return (
    <div
      className="flex flex-col items-center gap-3 px-6 py-12 text-center"
      style={{
        borderRadius: 18,
        border: '1px dashed var(--border)',
        background: 'var(--bg)',
      }}
    >
      <Check aria-hidden className="h-7 w-7" style={{ color: 'var(--muted)' }} />
      <p style={{ fontSize: 16, fontWeight: 500 }}>
        {staff ? 'Nothing awaiting your go' : 'Nothing needs your attention'}
      </p>
      <p style={{ fontSize: 13, lineHeight: '19px', color: 'var(--muted)', maxWidth: 360 }}>
        {staff
          ? 'Tasks at Awaiting Go will show here.'
          : 'When Warehaus needs your go-ahead, it will show here.'}
      </p>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="flex flex-col gap-5" aria-hidden>
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex items-center gap-4">
          <div className="h-9 w-9 shrink-0 rounded-[18px]" style={{ background: 'var(--surface-2, var(--bg))' }} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="h-3 rounded-full" style={{ background: 'var(--surface-2, var(--bg))' }} />
            <div className="h-2.5 w-40 rounded-full" style={{ background: 'var(--surface-2, var(--bg))' }} />
          </div>
          <div className="h-[22px] w-16 rounded-full" style={{ background: 'var(--surface-2, var(--bg))' }} />
        </div>
      ))}
    </div>
  );
}

function ErrorNotice({ title, body }: { title: string; body: string }) {
  return (
    <div
      className="flex items-start gap-3"
      data-testid="dashboard-error"
      style={{
        border: '1px solid var(--danger)',
        borderRadius: 18,
        padding: '16px 24px',
      }}
    >
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
        style={{ border: '1.25px solid var(--danger)', color: 'var(--danger)', fontSize: 11, fontWeight: 600 }}
      >
        !
      </span>
      <span className="min-w-0">
        <span className="block" style={{ fontSize: 14, fontWeight: 600, lineHeight: '20px', color: 'var(--danger)' }}>
          {title}
        </span>
        <span className="mt-1 block" style={{ fontSize: 13, lineHeight: '19px', color: 'var(--muted)' }}>
          {body}
        </span>
      </span>
    </div>
  );
}

function StageBadge({ label, hot }: { label: string; hot: boolean }) {
  const quiet = label === 'Idea' || label === 'Parked';
  return (
    <span
      className="ds-mono inline-flex max-w-full items-center gap-2"
      style={{
        height: 28,
        padding: '0 12px',
        borderRadius: 999,
        border: `1px solid ${hot ? 'var(--danger)' : 'var(--border)'}`,
        color: hot ? 'var(--danger)' : quiet ? 'var(--muted)' : 'var(--fg)',
        fontSize: 11,
        letterSpacing: '0.04em',
      }}
    >
      <TaskGlyph src="/icons/task-stage.svg" size={12} />
      <span className="truncate">{label}</span>
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const accent = /review|progress/i.test(status);
  return (
    <span
      className="ds-mono inline-flex items-center"
      style={{
        height: 24,
        padding: '0 12px',
        borderRadius: 999,
        background: accent ? 'color-mix(in oklab, var(--fg) 12%, transparent)' : 'var(--surface-2, var(--bg))',
        color: accent ? 'var(--fg)' : 'var(--muted)',
        fontSize: 11,
        letterSpacing: '0.04em',
      }}
    >
      {status}
    </span>
  );
}

function PublishMark({ published }: { published: boolean }) {
  return (
    <span className="inline-flex items-center gap-2" data-testid="publish-state">
      {published ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" src="/icons/activity-published-dot.svg" width={8} height={8} />
      ) : (
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: 'var(--muted)' }} />
      )}
      <span className="ds-mono" style={{ fontSize: 11, letterSpacing: '0.04em', color: published ? 'var(--fg)' : 'var(--muted)' }}>
        {published ? 'Published' : 'Not published'}
      </span>
    </span>
  );
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  const letters = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
  return (letters || name.slice(0, 2)).toUpperCase();
}
