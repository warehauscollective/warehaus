'use client';

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { OutlineButton, Pill, PortalCheckbox } from '@/components/ui/primitives';
import { TaskGlyph } from '@/components/tasks/TaskGlyph';
import { useMaxWidth } from '@/lib/design/useMaxWidth';
import { DocsBlock, type DocRow } from '@/components/docs/DocsBlock';
import { SyncChip } from '@/components/sync/SyncChip';
import {
  brandLine,
  clientBrandMeta,
  projectItemCount,
  sortTasksNewestFirst,
  syncLine,
  CLIENT_TEAM_STAGE_LABEL,
  clientDueLabel,
  clientPersonStatus,
  clientTeamInviteCopy,
  clientUpdatedLabel,
  clientVisiblePerson,
  staffHeaderLine,
} from '@/lib/data/clientDetail';
import { EDIT_PROJECT_WRITEBACK_HINT } from '@/lib/data/projectList';
import {
  clientDirectoryErrorMode,
  clientDirectoryShowsFilters,
  clientDirectoryShowsKpis,
  clientInitials,
  clientListStats,
  clientMatchesFilter,
  singleOrAcross,
  type ClientListFilter,
  type ClientListRow,
} from '@/lib/data/clientList';
import { taskStatusColor } from '@/lib/data/view-models';

export type DirectoryClient = ClientListRow & {
  slug?: string | null;
  portalAccess?: 'Enabled' | 'Disabled';
  notionPageId?: string | null;
  lastSyncedAt?: number | null;
};

export type ClientProjectRow = {
  id: string;
  name: string;
  status: string;
  progress?: number | null;
  description?: string | null;
  publishToWarehaus?: boolean;
  internal?: boolean;
  endDate?: string | null;
  /** Set only when a project brand differs from the company. There is no brand table. */
  brand?: string | null;
  taskCount?: number | null;
};

export type ClientTaskRow = {
  id: string;
  name: string;
  status: string;
  isDone: boolean;
  stage?: string | null;
  date?: string | null;
  lastEditedTime?: string | null;
  projectName?: string | null;
  publishToWarehaus?: boolean;
  category?: string | null;
  projectInternal?: boolean;
  projectId?: string | null;
};

export type ClientPersonRow = {
  id: string;
  name: string;
  email: string;
  role?: string;
  portalAccess?: 'Enabled' | 'Disabled';
  invitePending?: boolean;
};

const FILTERS: Array<{ key: ClientListFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'internal', label: 'Internal' },
  { key: 'sync', label: 'Sync problem' },
];

function Panel({
  children,
  testId,
  className,
  padded = true,
}: {
  children: ReactNode;
  testId?: string;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      data-testid={testId}
      className={className}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 28,
        ...(padded ? { padding: '1.25rem' } : {}),
      }}
    >
      {children}
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
  size = 32,
  display = false,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: string;
  size?: number;
  /** List KPIs. Uses the shared `.kpi-figure` display token. */
  display?: boolean;
}) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 22,
        padding: '1rem 1.1rem',
        minHeight: 112,
      }}
    >
      <p className="ds-mono" style={{ fontSize: 11, letterSpacing: '0.08em', color: 'var(--faint)' }}>
        {label}
      </p>
      {display ? (
        <p className="kpi-figure">{value}</p>
      ) : (
        <p style={{ fontFamily: 'var(--font-display)', fontSize: size, lineHeight: 1, marginTop: 8 }}>{value}</p>
      )}
      <p className="kpi-caption" style={{ fontSize: 'var(--t-sm)', color: tone ?? 'var(--muted)', marginTop: 6 }}>{hint}</p>
    </div>
  );
}

function PersonMark({ name }: { name: string }) {
  return (
    <span
      className="ds-mono inline-flex shrink-0 items-center justify-center"
      data-testid="person-avatar"
      style={{
        width: 32,
        height: 32,
        borderRadius: 999,
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        fontSize: 11,
        color: 'var(--muted)',
      }}
    >
      {clientInitials(name)}
    </span>
  );
}

function Mark({
  name,
  size = 36,
  testId,
  raised = false,
}: {
  name: string;
  size?: number;
  testId?: string;
  raised?: boolean;
}) {
  return (
    <span
      className="ds-mono inline-flex shrink-0 items-center justify-center"
      data-testid={testId}
      style={{
        width: size,
        height: size,
        borderRadius: 10,
        background: raised ? 'var(--surface-2)' : 'var(--bg)',
        border: raised ? '1px solid var(--border-2, var(--border))' : '1px solid var(--border)',
        fontSize: 12,
        color: 'var(--muted)',
      }}
    >
      {clientInitials(name)}
    </span>
  );
}

function SourceChip() {
  return (
    <span
      className="ds-mono inline-flex items-center gap-1"
      data-testid="client-source"
      style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '4px 8px', fontSize: 11 }}
    >
      <span style={{ fontSize: 10, letterSpacing: '0.8px', color: 'var(--faint)' }}>SOURCE</span>
      <span style={{ color: 'var(--muted)' }}>Notion</span>
    </span>
  );
}

function Dot({ tone, children }: { tone: 'on' | 'bad' | 'off'; children: ReactNode }) {
  const color = tone === 'bad' ? 'var(--danger)' : tone === 'off' ? 'var(--muted)' : 'var(--fg)';
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" style={{ color, fontSize: 13 }}>
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: 99,
          background: tone === 'off' ? 'transparent' : color,
          border: tone === 'off' ? '1.5px solid var(--muted)' : '0',
          display: 'inline-block',
        }}
      />
      {children}
    </span>
  );
}

function Chevron({ className = '' }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt="" src="/icons/client-chev.svg" width={16} height={16} className={`shrink-0 opacity-70 ${className}`.trim()} />
  );
}

function personRowStyle(index: number): CSSProperties {
  return {
    borderTop: index === 0 ? 'none' : '1px solid var(--border)',
    padding: '24px 0',
  };
}

function TeamPersonRow({
  person,
  index,
  nameWeight = 500,
  pendingColor = 'var(--muted)',
}: {
  person: ClientPersonRow;
  index: number;
  nameWeight?: number;
  pendingColor?: string;
}) {
  const status = clientPersonStatus(person);
  const statusColor = person.invitePending ? pendingColor : 'var(--muted)';
  return (
    <li className="flex items-start lg:items-center" style={personRowStyle(index)}>
      <PersonMark name={person.name} />
      <span className="min-w-0 flex-1" style={{ marginLeft: 12 }}>
        <span className="flex items-start justify-between gap-3 lg:block">
          <span className="block min-w-0" style={{ fontWeight: nameWeight, overflowWrap: 'break-word' }}>{person.name}</span>
          <span
            className="ds-mono shrink-0 lg:hidden"
            data-testid="client-person-status"
            style={{ fontSize: 12, color: statusColor, textAlign: 'left' }}
          >
            {status}
          </span>
        </span>
        <span className="ds-mono hidden lg:block" style={{ fontSize: 12, color: 'var(--muted)' }}>{person.email}</span>
        <span className="ds-mono block lg:hidden" data-testid="client-person-meta" style={{ fontSize: 12, color: 'var(--muted)' }}>
          {person.email ? (
            <span data-testid="client-person-email" style={{ overflowWrap: 'anywhere' }}>{person.email}</span>
          ) : null}
          {person.role ? (
            <span data-testid="client-person-role-phone" style={{ whiteSpace: 'nowrap' }}>{` · ${person.role}`}</span>
          ) : null}
        </span>
      </span>
      <span
        className="ds-mono hidden shrink-0 lg:block"
        data-testid="client-person-role"
        style={{ width: 140, marginLeft: 12, fontSize: 12, color: 'var(--muted)', textAlign: 'left' }}
      >
        {person.role ?? ''}
      </span>
      <span
        className="ds-mono hidden shrink-0 lg:block"
        data-testid="client-person-status"
        style={{ width: 140, marginLeft: 24, fontSize: 12, color: statusColor, textAlign: 'left' }}
      >
        {status}
      </span>
    </li>
  );
}

export function EditClientButton() {
  const hintId = useId();
  return (
    <span
      tabIndex={0}
      aria-disabled="true"
      aria-describedby={hintId}
      title={EDIT_PROJECT_WRITEBACK_HINT}
      data-testid="edit-client-hint"
      className="inline-flex shrink-0"
      style={{ cursor: 'not-allowed' }}
    >
      <button
        type="button"
        disabled
        aria-disabled="true"
        tabIndex={-1}
        data-testid="edit-client"
        style={{
          pointerEvents: 'none',
          background: 'transparent',
          color: 'var(--fg)',
          border: '1px solid var(--border)',
          borderRadius: 9,
          fontFamily: 'var(--font-body)',
          fontSize: 13,
          fontWeight: 500,
          padding: '6px 10px',
          cursor: 'not-allowed',
          opacity: 0.4,
        }}
      >
        Edit client
      </button>
      <span id={hintId} className="sr-only">
        {EDIT_PROJECT_WRITEBACK_HINT}
      </span>
    </span>
  );
}

function FilledStatus({ children }: { children: ReactNode }) {
  return (
    <span
      data-testid="client-team-status"
      className="ds-mono inline-flex items-center"
      style={{
        background: 'var(--surface-2)',
        color: 'var(--muted)',
        border: 'none',
        borderRadius: 999,
        padding: '4px 12px',
        fontSize: 11,
        letterSpacing: '0.44px',
      }}
    >
      {children}
    </span>
  );
}

function StageBadge() {
  return (
    <span
      className="ds-mono inline-flex items-center gap-2"
      data-testid="client-team-stage"
      style={{ border: '1px solid var(--danger)', borderRadius: 999, padding: '4px 12px', fontSize: 11, letterSpacing: '0.44px', color: 'var(--danger)' }}
    >
      <TaskGlyph src="/icons/task-stage.svg" size={12} />
      {CLIENT_TEAM_STAGE_LABEL}
    </span>
  );
}

const CLIENT_CREATE_HINT = 'Creating a client turns on with Notion write-back';
const CLIENT_SYNC_RETRY_HINT = 'Retrying a sync turns on with Notion write-back';

/** Outlined control kept on screen while write-back is off. No role=group. */
function ClientOutlineAction({ label, hint, testId }: { label: string; hint: string; testId: string }) {
  const hintId = useId();
  return (
    <span
      tabIndex={0}
      aria-disabled="true"
      aria-describedby={hintId}
      title={hint}
      data-testid={`${testId}-hint`}
      className="inline-flex"
      style={{ cursor: 'not-allowed' }}
    >
      <button
        type="button"
        disabled
        aria-disabled="true"
        tabIndex={-1}
        data-testid={testId}
        style={{
          pointerEvents: 'none',
          background: 'transparent',
          color: 'var(--fg)',
          border: '1px solid var(--border-2)',
          borderRadius: 9,
          fontFamily: 'var(--font-body)',
          fontSize: 14,
          fontWeight: 500,
          padding: '12px 16px',
          cursor: 'not-allowed',
          opacity: 0.4,
        }}
      >
        {label}
      </button>
      <span id={hintId} className="sr-only">
        {hint}
      </span>
    </span>
  );
}

/** Three list rows: mark, two bars, a short pill. Clients / States (Figma 297:18207). */
function ClientListSkeleton() {
  return (
    <div className="mt-4 flex flex-col" aria-busy="true" data-testid="client-loading" style={{ gap: 24 }}>
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex items-center" style={{ gap: 16, minHeight: 36 }}>
          <span className="animate-pulse shrink-0" style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-2)' }} />
          <span className="flex min-w-0 flex-1 flex-col" style={{ gap: 8 }}>
            <span className="animate-pulse" style={{ height: 12, width: '100%', maxWidth: 302, borderRadius: 6, background: 'var(--surface-2)' }} />
            <span className="animate-pulse" style={{ height: 10, width: 160, maxWidth: '40%', borderRadius: 6, background: 'var(--surface-2)' }} />
          </span>
          <span className="animate-pulse shrink-0" style={{ width: 64, height: 22, borderRadius: 999, background: 'var(--surface-2)' }} />
        </div>
      ))}
    </div>
  );
}

export function NewClientButton() {
  const hintId = useId();
  return (
    <span
      tabIndex={0}
      aria-disabled="true"
      aria-describedby={hintId}
      title={CLIENT_CREATE_HINT}
      data-testid="new-client-header"
      className="inline-flex shrink-0"
      style={{ cursor: 'not-allowed' }}
    >
      <button
        type="button"
        disabled
        aria-disabled="true"
        tabIndex={-1}
        data-testid="new-client-header-button"
        style={{
          pointerEvents: 'none',
          background: 'transparent',
          color: 'var(--fg)',
          border: '1px solid var(--border-2)',
          borderRadius: 9,
          fontFamily: 'var(--font-body)',
          fontSize: 14,
          fontWeight: 500,
          padding: '12px 16px',
          cursor: 'not-allowed',
          opacity: 0.4,
        }}
      >
        New client
      </button>
      <span id={hintId} className="sr-only">
        {CLIENT_CREATE_HINT}
      </span>
    </span>
  );
}

function ClientKpiSkeleton() {
  return (
    <div
      aria-hidden
      data-testid="client-kpi-skeleton"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 22,
        padding: '1rem 1.1rem',
        minHeight: 112,
      }}
    >
      <span className="animate-pulse block" style={{ height: 12, width: 72, borderRadius: 6, background: 'var(--surface-2)' }} />
      <span className="animate-pulse mt-4 block" style={{ height: 28, width: 48, borderRadius: 8, background: 'var(--surface-2)' }} />
      <span className="animate-pulse mt-3 block" style={{ height: 12, width: 96, borderRadius: 6, background: 'var(--surface-2)' }} />
    </div>
  );
}

function TryAgain({ onRetry }: { onRetry?: () => void }) {
  return (
    <OutlineButton onClick={onRetry}>
      <span data-testid="client-try-again">Try again</span>
    </OutlineButton>
  );
}

function percent(value: number | null | undefined): number {
  if (value == null) return 0;
  const pct = value <= 1 ? value * 100 : value;
  return Math.min(100, Math.max(0, Math.round(pct)));
}

export type ClientScreen = 'ready' | 'empty' | 'loading' | 'error' | 'long' | 'filtered' | 'refresh';

export function ClientDirectory({
  clients,
  filter,
  onFilter,
  onOpen,
  loading,
  error,
  errorTitle,
  onRetry,
}: {
  clients: DirectoryClient[];
  filter: ClientListFilter;
  onFilter: (filter: ClientListFilter) => void;
  onOpen: (id: string) => void;
  loading: boolean;
  error: string | null;
  /** Designed sync-problem title. A plain query failure uses the load/refresh titles. */
  errorTitle?: string;
  onRetry?: () => void;
}) {
  const narrow = useMaxWidth(480);
  const count = clients.length;
  const showKpis = clientDirectoryShowsKpis(count, loading);
  const showFilters = clientDirectoryShowsFilters(count, loading);
  const errorMode = loading ? 'none' : clientDirectoryErrorMode(error, count);
  const stats = clientListStats(clients);
  const shown = clients.filter((client) => clientMatchesFilter(client, filter));
  const counts: Record<ClientListFilter, number> = {
    all: stats.total,
    active: stats.active,
    internal: stats.internal,
    sync: stats.sync,
  };
  const trueEmpty = !loading && errorMode === 'none' && count === 0;
  const filteredEmpty = !loading && errorMode !== 'empty' && count > 0 && shown.length === 0;
  const noticeTitle = errorMode === 'refresh'
    ? errorTitle ?? 'Client list is out of date'
    : "We couldn't load clients";
  const noticeBody =
    errorMode === 'empty' || (errorMode === 'refresh' && !errorTitle)
      ? 'Try again in a moment.'
      : error ?? '';
  const syncProblem = errorMode === 'refresh' && Boolean(errorTitle);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto" data-testid="account-clients">
      <ClampStyle />
      {showKpis ? (
        <div className="client-directory-kpis grid w-full gap-3" data-testid="client-stats">
          {loading ? (
            [0, 1, 2, 3].map((item) => <ClientKpiSkeleton key={item} />)
          ) : (
            <>
              <Stat display label="CLIENTS" value={String(stats.total)} hint={`${stats.active} active · ${stats.internal} internal`} />
              <Stat display label="ACTIVE PROJECTS" value={String(stats.projects)} hint={stats.withProjects === 1 ? 'Across 1 client' : `Across ${stats.withProjects} clients`} />
              <Stat
                display
                label="AWAITING GO"
                value={String(stats.awaiting)}
                hint={singleOrAcross(stats.awaitingNames, 'None waiting')}
                tone={stats.awaiting > 0 ? 'var(--danger)' : undefined}
              />
              <Stat
                display
                label="SYNC PROBLEMS"
                value={String(stats.sync)}
                hint={singleOrAcross(stats.syncNames, 'None')}
                tone={stats.sync > 0 ? 'var(--danger)' : undefined}
              />
            </>
          )}
        </div>
      ) : null}

      <Panel>
        {trueEmpty ? null : (
          <>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--t-md)' }}>All clients</h2>
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 4 }}>
              Each client sees only what is published to them.
            </p>
          </>
        )}
        {showFilters ? (
          <div
            className="mt-4 flex gap-2"
            data-testid="client-filters"
            style={
              narrow
                ? { overflowX: 'auto', flexWrap: 'nowrap', scrollbarWidth: 'none' }
                : { flexWrap: 'wrap' }
            }
          >
            {FILTERS.map((item) => {
              const active = filter === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onFilter(item.key)}
                  className="ds-mono shrink-0"
                  style={{
                    fontSize: 'var(--t-xs)',
                    padding: '0.35rem 0.75rem',
                    borderRadius: 999,
                    border: '1px solid var(--border)',
                    background: active ? 'var(--fg)' : 'transparent',
                    color: active ? 'var(--bg)' : 'var(--muted)',
                    cursor: 'pointer',
                  }}
                >
                  {item.label} {counts[item.key]}
                </button>
              );
            })}
          </div>
        ) : null}
        {errorMode !== 'none' && error ? (
          <StateNotice
            title={noticeTitle}
            body={noticeBody}
            action={
              syncProblem ? (
                <ClientOutlineAction label="Retry sync" hint={CLIENT_SYNC_RETRY_HINT} testId="retry-sync" />
              ) : (
                <TryAgain onRetry={onRetry} />
              )
            }
          />
        ) : null}
        {errorMode === 'empty' ? null : loading ? (
          <ClientListSkeleton />
        ) : trueEmpty ? (
          <EmptyCopy
            title="No clients yet"
            body="Add a client to start a project. Warehaus (internal) always exists."
            action={<ClientOutlineAction label="New client" hint={CLIENT_CREATE_HINT} testId="new-client" />}
          />
        ) : filteredEmpty ? (
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 16 }}>
            No clients match these filters.{' '}
            <button
              type="button"
              data-testid="clear-filters"
              onClick={() => onFilter('all')}
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
          </p>
        ) : (
          <ul className="mt-2">
            {shown.map((client) => (
              <li key={client.id} style={{ borderTop: '1px solid var(--border)' }}>
                <button
                  type="button"
                  onClick={() => onOpen(client.id)}
                  className="flex w-full items-start gap-3 text-left"
                  style={{ background: 'none', border: 0, padding: '0.9rem 0.2rem', cursor: 'pointer', color: 'inherit' }}
                >
                  <Mark name={client.name} />
                  <span className="min-w-0 flex-1">
                    <span className="client-row-clamp block" data-testid="client-row-name" style={{ fontWeight: 600, overflowWrap: 'break-word' }}>
                      {client.internal ? `${client.name} (internal)` : client.name}
                    </span>
                    {narrow ? (
                      <>
                        <span className="block" data-testid="client-row-meta" style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2, overflowWrap: 'break-word' }}>
                          {client.internal
                            ? `${client.contactCount} staff · admin-only`
                            : `${client.contactCount} ${client.contactCount === 1 ? 'person' : 'people'}`}
                          {` · ${client.projectCount} ${client.projectCount === 1 ? 'project' : 'projects'} · ${client.openTaskCount} open · ${client.awaitingGoCount ?? 0} awaiting go`}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-2">
                          <SyncChip
                            audience="staff"
                            notionPageId={client.notionPageId}
                            syncHidden={client.syncHidden}
                            syncState={client.syncHidden ? 'failed' : undefined}
                          />
                          <Dot tone={client.internal ? 'off' : 'on'}>{client.internal ? 'Not published' : 'Published'}</Dot>
                        </span>
                      </>
                    ) : (
                      <span className="ds-mono block" style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, overflowWrap: 'break-word' }}>
                        {client.internal
                          ? `${client.contactCount} staff · admin-only`
                          : `${client.contactCount} ${client.contactCount === 1 ? 'person' : 'people'}`}
                      </span>
                    )}
                  </span>
                  {narrow ? null : (
                    <span className="flex shrink-0 flex-wrap items-center justify-end gap-x-4 gap-y-1">
                      <span style={{ fontSize: 13, color: 'var(--muted)' }}>{client.projectCount} {client.projectCount === 1 ? 'project' : 'projects'}</span>
                      <span style={{ fontSize: 13, color: 'var(--muted)' }}>{client.openTaskCount} open</span>
                      <span style={{ fontSize: 13, color: 'var(--muted)' }}>{client.awaitingGoCount ?? 0} awaiting go</span>
                      <SyncChip
                        audience="staff"
                        notionPageId={client.notionPageId}
                        syncHidden={client.syncHidden}
                        syncState={client.syncHidden ? 'failed' : undefined}
                      />
                      <Dot tone={client.internal ? 'off' : 'on'}>{client.internal ? 'Not published' : 'Published'}</Dot>
                    </span>
                  )}
                  <Chevron />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div
          className="mt-3 flex gap-3"
          style={{ background: 'var(--bg)', borderRadius: 16, padding: '0.85rem 1rem' }}
        >
          <span aria-hidden style={{ color: 'var(--muted)' }}>ⓘ</span>
          <span>
            <strong style={{ fontSize: 'var(--t-sm)' }}>Warehaus is the client when none applies</strong>
            <span className="mt-1 block" style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
              Work with no client or project sits under the internal Warehaus project. Internal items are admin-only and never appear in client views.
            </span>
          </span>
        </div>
      </Panel>
    </div>
  );
}

const DETAIL_SECTIONS = ['client-projects', 'client-people', 'client-tasks'] as const;

function useDetailSection(screen: string) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pinned = useRef<string | null>(null);
  const expectedTop = useRef<number | null>(null);
  const [active, setActive] = useState<string>(DETAIL_SECTIONS[0]);

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    let frame = 0;
    const read = () => {
      if (pinned.current) {
        const max = Math.max(0, root.scrollHeight - root.clientHeight);
        const landed = expectedTop.current == null ? root.scrollTop : Math.min(expectedTop.current, max);
        if (Math.abs(root.scrollTop - landed) <= 2) {
          setActive(pinned.current);
          return;
        }
        pinned.current = null;
      }
      const top = root.getBoundingClientRect().top;
      const probe = top + Math.max(72, root.clientHeight * 0.28);
      let current: string = DETAIL_SECTIONS[0];
      for (const id of DETAIL_SECTIONS) {
        const node = document.getElementById(id);
        if (node && node.getBoundingClientRect().top <= probe) current = id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        read();
      });
    };
    read();
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      root.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [screen]);

  const choose = (id: string) => {
    pinned.current = id;
    setActive(id);
    const root = scrollerRef.current;
    const node = document.getElementById(id);
    if (!root || !node) return;
    const top = node.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop - 8;
    expectedTop.current = Math.max(0, top);
    root.scrollTo({ top: expectedTop.current });
  };

  return { scrollerRef, active, choose };
}

export function ClientDetail({
  client,
  projects,
  tasks,
  docs,
  contacts,
  leadName = null,
  clientSince = null,
  brandName,
  screen = 'ready',
}: {
  client: DirectoryClient;
  projects: ClientProjectRow[];
  tasks: ClientTaskRow[];
  docs: DocRow[];
  contacts: ClientPersonRow[];
  leadName?: string | null;
  clientSince?: string | null;
  brandName?: string | null;
  screen?: ClientScreen;
}) {
  const { scrollerRef, active, choose } = useDetailSection(screen);
  if (screen === 'error') {
    return (
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto" data-testid="client-detail">
        <StateNotice title="We could not load this client" body="Try again in a moment." />
      </div>
    );
  }
  if (screen === 'loading') {
    return (
      <div className="flex h-full min-h-0 w-full flex-col overflow-y-auto" data-testid="client-detail" aria-busy="true">
        <ClientListSkeleton />
      </div>
    );
  }
  const blank = screen === 'empty';
  const projectRows = blank ? [] : projects;
  const taskRows = blank ? [] : sortTasksNewestFirst(tasks);
  const contactRows = blank ? [] : contacts;
  const docRows = blank ? [] : docs;
  const awaiting = taskRows.filter((task) => !task.isDone && task.stage === 'Awaiting Go').length;
  const pending = contactRows.filter((person) => person.invitePending).length;
  const brand = brandName?.trim() || client.name;
  const header = staffHeaderLine(blank ? null : clientSince, blank ? null : leadName);
  const open = taskRows.filter((task) => !task.isDone);
  const synced = syncLine(client.lastSyncedAt);
  const jumps = [
    ['client-projects', 'Projects', projectRows.length],
    ['client-people', 'People', contactRows.length],
    ['client-tasks', 'Tasks', taskRows.length],
  ] as const;
  return (
    <div ref={scrollerRef} className="client-detail flex h-full min-h-0 flex-col overflow-y-auto" data-testid="client-detail">
      <ClampStyle />
      <Panel padded={false} className="client-detail-card">
        <div className="flex items-center gap-6">
          <Mark name={client.name} size={64} testId="client-header-mark" raised />
          <div className="min-w-0 flex-1">
            <h2 className="client-card-title">{client.name}</h2>
            {header ? (
              <p className="clamp-two" data-testid="client-since-lead" style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 4 }}>
                {header}
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Dot tone={client.internal ? 'off' : 'on'}>{client.internal ? 'Not published' : 'Published'}</Dot>
          {client.notionPageId ? <SourceChip /> : null}
          {client.syncHidden ? (
            <SyncChip
              audience="staff"
              notionPageId={client.notionPageId}
              syncHidden={client.syncHidden}
              syncState="failed"
            />
          ) : (
            <span
              data-testid="client-sync-line"
              data-sync={synced.stale ? 'stale' : 'fresh'}
              style={{ fontSize: 13, color: synced.stale ? 'var(--warning)' : 'var(--muted)' }}
            >
              {synced.text}
            </span>
          )}
        </div>
      </Panel>
      <div className="client-detail-kpis grid w-full grid-cols-1 md:grid-cols-3" data-testid="client-stats">
        <Stat display label="PROJECTS" value={String(projectRows.length)} hint={projectRows.length > 0 ? '1 active brand each' : 'No projects yet'} />
        <Stat display label="PEOPLE" value={String(contactRows.length)} hint={pending > 0 ? `${pending} invite pending` : 'Contacts with portal access'} />
        <Stat display label="OPEN ITEMS" value={String(open.length)} hint={awaiting > 0 ? `${awaiting} awaiting go` : 'None awaiting go'} tone={awaiting > 0 ? 'var(--danger)' : undefined} />
      </div>
      <div className="flex flex-wrap gap-2" data-testid="client-jumps">
        {jumps.map(([id, label, count]) => {
          const on = active === id;
          return (
            <a
              key={id}
              href={`#${id}`}
              data-testid="client-section-jump"
              aria-current={on ? 'true' : undefined}
              onClick={(event) => {
                event.preventDefault();
                choose(id);
              }}
              className="inline-flex items-center"
              style={{
                gap: 6,
                fontFamily: 'var(--font-body)',
                fontSize: 14,
                fontWeight: 500,
                lineHeight: '20px',
                borderRadius: 999,
                padding: '6px 12px',
                border: on ? '1px solid var(--fg)' : '1px solid var(--border)',
                background: on ? 'var(--fg)' : 'transparent',
                color: on ? 'var(--bg)' : 'var(--fg)',
                textDecoration: 'none',
              }}
            >
              {label}
              <span style={{ color: on ? 'var(--bg)' : 'var(--muted)', opacity: on ? 0.72 : 1 }}>{count}</span>
            </a>
          );
        })}
      </div>
      <Panel padded={false} className="client-detail-card">
        <h3 id="client-projects" style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--t-md)', scrollMarginTop: 8 }}>Projects</h3>
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 4 }}>Brand is attached to each project</p>
        {projectRows.length === 0 ? (
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 12 }}>No projects.</p>
        ) : (
          <ul className="mt-2">
            {projectRows.map((project) => {
              const pct = percent(project.progress);
              const items = projectItemCount(project, taskRows);
              const unpublished = project.internal || project.publishToWarehaus === false;
              return (
                <li
                  key={project.id}
                  data-testid="client-project-row"
                  className="client-project-row grid grid-cols-[minmax(0,1fr)_16px] items-center gap-x-3 gap-y-2 md:grid-cols-[minmax(0,1fr)_176px_80px_140px_16px] md:gap-4"
                  style={{ borderTop: '1px solid var(--border)' }}
                >
                  <div className="col-span-2 flex min-w-0 items-center gap-3 md:col-span-1">
                    <Mark name={project.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate" style={{ fontWeight: 600 }}>{project.name}</span>
                      <span className="block truncate" style={{ fontSize: 13, color: 'var(--muted)' }}>{brandLine(brand)}</span>
                    </span>
                  </div>
                  <span className="col-span-2 flex min-w-0 flex-col gap-1.5 md:col-span-1 md:w-[176px]">
                    <span style={{ height: 4, width: '100%', borderRadius: 99, background: 'var(--border)', overflow: 'hidden' }}>
                      <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: 'var(--fg)' }} />
                    </span>
                    <span data-testid="client-project-caption" style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {pct}% of items shipped
                    </span>
                  </span>
                  <span
                    data-testid="client-project-count"
                    className="hidden min-w-0 whitespace-nowrap md:block md:w-[80px]"
                    style={{ fontSize: 13, color: 'var(--muted)' }}
                  >
                    {items} {items === 1 ? 'item' : 'items'}
                  </span>
                  <span className="min-w-0 md:w-[140px]">
                    <Dot tone={unpublished ? 'off' : 'on'}>{unpublished ? 'Not published' : 'Published'}</Dot>
                  </span>
                  <Chevron />
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      <Panel padded={false} className="client-detail-card">
        <h3 id="client-people" style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--t-md)', scrollMarginTop: 8 }}>People</h3>
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 4 }}>
          Contacts with portal access. Invites are managed by the client&apos;s admins.
        </p>
        {contactRows.length === 0 ? (
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 12 }}>No contacts.</p>
        ) : (
          <ul style={{ marginTop: 16 }}>
            {contactRows.map((person, index) => (
              <TeamPersonRow key={person.id} person={person} index={index} nameWeight={600} pendingColor="var(--warn)" />
            ))}
          </ul>
        )}
      </Panel>
      <Panel padded={false} className="client-detail-card">
        <h3 id="client-tasks" style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--t-md)', scrollMarginTop: 8 }}>Tasks</h3>
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 4 }}>Published and unpublished, newest first.</p>
        {taskRows.length === 0 ? (
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 12 }}>No tasks.</p>
        ) : (
          <ul className="mt-2">
            {taskRows.map((task) => {
              const dueTime = task.date ? Date.parse(`${task.date}T00:00:00Z`) : Number.NaN;
              const due = Number.isNaN(dueTime)
                ? null
                : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(dueTime);
              const meta = [task.projectName, due ? `Due ${due}` : null]
                .filter(Boolean)
                .join(' · ');
              const pills: ReactNode[] = [];
              if (task.stage) {
                pills.push(
                  <Pill key="stage" color={task.stage === 'Awaiting Go' ? 'var(--danger)' : undefined}>
                    {task.stage}
                  </Pill>,
                );
              }
              pills.push(
                <Pill key="status" color={taskStatusColor(task.status, task.isDone)}>
                  {task.status}
                </Pill>,
              );
              if (task.category) pills.push(<Pill key="category">{task.category}</Pill>);
              const publish =
                task.publishToWarehaus != null && !task.projectInternal ? (
                  <Dot tone={task.publishToWarehaus ? 'on' : 'off'}>
                    {task.publishToWarehaus ? 'Published' : 'Not published'}
                  </Dot>
                ) : null;
              // Pair the publish status with the last pill so a wrap keeps them together
              // when that pair fits on one line.
              const withStatus = publish ? pills.pop() : null;
              return (
                <li key={task.id} data-testid="client-task-row" className="client-task-row flex flex-wrap items-center gap-2 lg:flex-nowrap" style={{ borderTop: '1px solid var(--border)' }}>
                  <PortalCheckbox checked={task.isDone} disabled />
                  <span className="min-w-0 flex-1 basis-[calc(100%-2rem)] lg:basis-40">
                    <span data-testid="client-task-title" className="block lg:truncate" style={{ fontWeight: 600 }}>{task.name}</span>
                    {meta ? <span className="block lg:truncate" style={{ fontSize: 13, color: 'var(--muted)' }}>{meta}</span> : null}
                  </span>
                  <span data-testid="client-task-pills" className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
                    {pills}
                    {publish ? (
                      <span data-testid="client-task-publish" className="inline-flex max-w-full shrink-0 flex-nowrap items-center gap-2">
                        {withStatus}
                        {publish}
                      </span>
                    ) : (
                      withStatus
                    )}
                  </span>
                  <Chevron className="hidden lg:block" />
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      <div data-testid="client-docs">
        <DocsBlock docs={docRows} staff />
      </div>
    </div>
  );
}

export function ClientCompany({
  name,
  leadName,
  projects,
  tasks,
  docs,
  people,
  showTeam,
  onShowTeam,
  onOpenTask,
  loading = false,
  error = null,
  onRetry,
}: {
  name: string;
  leadName?: string | null;
  projects: ClientProjectRow[];
  tasks: ClientTaskRow[];
  docs: DocRow[];
  people: ClientPersonRow[];
  showTeam: boolean;
  onShowTeam: () => void;
  onOpenTask?: (taskId: string) => void;
  onBack: () => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  const open = tasks.filter((task) => !task.isDone);
  const awaiting = open.filter((task) => task.stage === 'Awaiting Go');
  if (showTeam) {
    const visiblePeople = people.filter(clientVisiblePerson);
    const invite = clientTeamInviteCopy(name, visiblePeople);
    return (
      <div className="flex h-full min-h-0 w-full flex-col gap-4 overflow-y-auto" data-testid="client-team">
        <ClampStyle />
        <Panel testId="client-team-people">
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--t-md)', margin: 0 }}>Your team</h3>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            People at {name} with portal access
          </p>
          {visiblePeople.length === 0 ? (
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 12 }}>No people shared yet.</p>
          ) : (
            <ul style={{ marginTop: 16 }}>
              {visiblePeople.map((person, index) => (
                <TeamPersonRow key={person.id} person={person} index={index} />
              ))}
            </ul>
          )}
          <div
            data-testid="client-team-invite"
            className="mt-4 flex items-start gap-3"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 18, padding: '16px 24px' }}
          >
            <span aria-hidden className="inline-flex shrink-0 items-center justify-center" style={{ width: 20, height: 20, borderRadius: 999, border: '1.25px solid var(--muted)', color: 'var(--muted)', fontSize: 11, fontWeight: 600 }}>i</span>
            <span className="min-w-0">
              <span className="block" style={{ fontSize: 14, fontWeight: 600 }}>{invite.title}</span>
              <span className="mt-1 block" style={{ fontSize: 13, color: 'var(--muted)' }}>{invite.body}</span>
            </span>
          </div>
        </Panel>
        <Panel testId="client-team-waiting">
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--t-md)', margin: 0 }}>Waiting on you</h3>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            Tasks published to you at Awaiting Go
          </p>
          {awaiting.length === 0 ? (
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 8 }}>Nothing is waiting on your approval.</p>
          ) : (
            <ul style={{ marginTop: 16 }}>
              {awaiting.map((task, index) => {
                const due = clientDueLabel(task.date);
                const meta = [task.projectName ?? name, due].filter(Boolean).join(' · ');
                const updated = clientUpdatedLabel(task);
                const body = (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block" style={{ fontWeight: 500 }}>{task.name}</span>
                      <span className="ds-mono block" style={{ fontSize: 12, color: 'var(--muted)' }}>{meta}</span>
                      <span className="mt-2 flex flex-wrap items-center gap-2 lg:hidden">
                        <StageBadge />
                        <FilledStatus>{task.status}</FilledStatus>
                      </span>
                    </span>
                    <span className="hidden shrink-0 items-center gap-3 lg:flex">
                      <StageBadge />
                      <FilledStatus>{task.status}</FilledStatus>
                      {updated ? (
                        <span className="ds-mono" data-testid="client-team-updated" style={{ fontSize: 12, color: 'var(--muted)' }}>
                          {updated}
                        </span>
                      ) : null}
                    </span>
                    {onOpenTask ? <Chevron /> : null}
                  </>
                );
                return (
                  <li key={task.id} style={personRowStyle(index)}>
                    {onOpenTask ? (
                      <button
                        type="button"
                        data-testid="client-team-open"
                        onClick={() => onOpenTask(task.id)}
                        className="flex w-full items-start gap-3 text-left lg:items-center"
                        style={{ background: 'none', border: 0, padding: 0, color: 'inherit', cursor: 'pointer' }}
                      >
                        {body}
                      </button>
                    ) : (
                      <div className="flex w-full items-start gap-3 lg:items-center">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    );
  }

  if (!loading && error && projects.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto" data-testid="client-company">
        <StateNotice
          title="We couldn't load your company"
          body="Try again in a moment."
          action={<TryAgain onRetry={onRetry} />}
        />
      </div>
    );
  }

  const trueEmpty = !loading && projects.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto" data-testid="client-company" aria-busy={loading || undefined}>
      <ClampStyle />
      {!loading && error ? (
        <StateNotice
          title="We couldn't refresh your company"
          body="Showing what was last loaded."
          action={<TryAgain onRetry={onRetry} />}
        />
      ) : null}
      {loading ? <CompanyCardSkeleton /> : (
      <Panel>
        <div className="flex items-center gap-4">
          <Mark name={name} size={64} testId="company-mark" raised />
          <div className="min-w-0 flex-1">
            <h2 className="client-card-title">{name}</h2>
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 4 }}>
              {people.length} {people.length === 1 ? 'person' : 'people'}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="ds-mono" style={{ fontSize: 11, color: 'var(--faint)' }}>YOUR CONTACT</span>
          <span data-testid="your-contact" style={{ fontSize: 'var(--t-sm)' }}>{leadName?.trim() || '—'}</span>
        </div>
        <div className="mt-4">
          <p className="ds-mono" style={{ fontSize: 11, color: 'var(--faint)' }}>YOUR TEAM</p>
          {people.length === 0 ? (
            <button type="button" onClick={onShowTeam} style={{ background: 'none', border: 0, padding: 0, color: 'var(--accent)', cursor: 'pointer', marginTop: 8 }}>
              Your team
            </button>
          ) : (
            <ul className="mt-2">
              {people.map((person) => (
                <li key={person.id}>
                  <button type="button" onClick={onShowTeam} className="flex w-full items-center gap-3 text-left" style={{ background: 'none', border: 0, padding: '0.45rem 0', color: 'inherit', cursor: 'pointer' }}>
                    <PersonMark name={person.name} />
                    <span className="min-w-0">
                      <span className="clamp-one block" style={{ fontWeight: 600 }}>{person.name}</span>
                      <span className="block truncate" style={{ fontSize: 13, color: 'var(--muted)' }}>{person.email}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>
      )}
      {trueEmpty ? null : (
      <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-3" data-testid="client-stats">
        {loading ? (
          [0, 1, 2].map((item) => <ClientKpiSkeleton key={item} />)
        ) : (
          <>
            <Stat label="ACTIVE PROJECTS" value={String(projects.length)} hint={projects[0] ? projects[0].name : 'None shared yet'} />
            <Stat label="OPEN ITEMS" value={String(open.length)} hint={`${open.filter((task) => /progress/i.test(task.status)).length} in progress`} />
            <Stat label="NEEDS YOUR ATTENTION" value={String(awaiting.length)} hint={awaiting.length > 0 ? 'Waiting on your approval' : 'Nothing waiting'} tone={awaiting.length > 0 ? 'var(--danger)' : undefined} />
          </>
        )}
      </div>
      )}
      <Panel>
        <h3 id="your-brands" data-testid="your-brands" style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--t-md)' }}>Your brands</h3>
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 4 }}>
          {name} is the brand on each project shared with you.
        </p>
        {loading ? (
          <ClientListSkeleton />
        ) : projects.length === 0 ? (
          <EmptyCopy
            title="No projects shared with you yet"
            body="Warehaus will publish projects here when they are ready."
          />
        ) : (
          <ul className="mt-2">
            {projects.map((project) => {
              const pct = percent(project.progress);
              return (
                <li key={project.id} className="flex flex-wrap items-center gap-3" style={{ borderTop: '1px solid var(--border)', padding: '0.85rem 0' }}>
                  <Mark name={project.name} />
                  <span className="min-w-0 flex-1">
                    <span className="brand-row-name block" data-testid="brand-row-name" style={{ fontWeight: 600, overflowWrap: 'break-word' }}>{project.name}</span>
                    {clientBrandMeta(name, project.brand) ? (
                      <span className="brand-row-meta block" data-testid="brand-row-meta" style={{ fontSize: 13, color: 'var(--muted)' }}>
                        {clientBrandMeta(name, project.brand)}
                      </span>
                    ) : null}
                  </span>
                  <span className="ds-mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{pct}% of items</span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      {loading ? null : (
        <div data-testid="client-docs">
          <DocsBlock docs={docs} staff={false} />
        </div>
      )}
    </div>
  );
}

function ClampStyle() {
  return (
    <style>{`
      .client-card-title {
        min-width: 0;
        max-width: 100%;
        font-family: var(--font-display);
        font-size: var(--t-lg);
        overflow-wrap: normal;
        word-break: normal;
      }
      @media (min-width: 481px) {
        .client-card-title {
          overflow: hidden;
          overflow-wrap: break-word;
        }
      }
      .kpi-caption {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .client-detail { gap: 16px; }
      .client-detail-card { padding: 20px 16px; }
      .client-detail-kpis { gap: 16px; }
      .client-project-row { padding: 12px 0; }
      .client-task-row { padding: 14px 0; }
      .client-directory-kpis {
        grid-template-columns: minmax(0, 1fr);
      }
      @media (min-width: 768px) {
        .client-detail { gap: 32px; }
        .client-detail-card { padding: 32px; }
        .client-detail-kpis { gap: 32px; }
        .client-project-row { min-height: 96px; padding: 16px 0; }
        .client-task-row { padding: 20px 0; }
        .client-directory-kpis {
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        }
      }
      @media (max-width: 480px) {
        .clamp-one { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .clamp-two {
          white-space: normal;
          overflow: visible;
        }
        .client-card-title {
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          overflow: hidden;
        }
        .client-row-clamp {
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          overflow: hidden;
        }
        .brand-row-name {
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          overflow: hidden;
        }
        .brand-row-meta {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      }
    `}</style>
  );
}

function CompanyCardSkeleton() {
  return (
    <section
      data-testid="client-company-card"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 28, padding: '1.25rem' }}
    >
      <div className="flex items-center" style={{ gap: 16 }}>
        <span className="animate-pulse shrink-0" style={{ width: 64, height: 64, borderRadius: 10, background: 'var(--surface-2)' }} />
        <span className="flex min-w-0 flex-1 flex-col" style={{ gap: 8 }}>
          <span className="animate-pulse" style={{ height: 16, width: '60%', maxWidth: 240, borderRadius: 6, background: 'var(--surface-2)' }} />
          <span className="animate-pulse" style={{ height: 10, width: 120, borderRadius: 6, background: 'var(--surface-2)' }} />
        </span>
      </div>
    </section>
  );
}

function StateNotice({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div
      role="alert"
      data-testid="client-state-notice"
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
        }}
      >
        !
      </span>
      <span className="min-w-0 flex-1">
        <p style={{ margin: 0, color: 'var(--danger)', fontWeight: 600, fontSize: 14, lineHeight: '20px' }}>{title}</p>
        <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13, lineHeight: '19px' }}>{body}</p>
        {action ? <span className="mt-2 block">{action}</span> : null}
      </span>
    </div>
  );
}

function EmptyCopy({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div
      className="mt-4 flex flex-col items-center text-center"
      data-testid="client-empty"
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
      <p style={{ margin: 0, fontSize: 16, fontWeight: 500, lineHeight: '19px' }}>{title}</p>
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
        {body}
      </p>
      {action}
    </div>
  );
}
