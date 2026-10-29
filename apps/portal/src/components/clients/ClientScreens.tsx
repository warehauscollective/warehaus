'use client';

import type { ReactNode } from 'react';
import { Pill, PortalCheckbox } from '@/components/ui/primitives';
import { useMaxWidth } from '@/lib/design/useMaxWidth';
import { DocsBlock, type DocRow } from '@/components/docs/DocsBlock';
import { SyncChip } from '@/components/sync/SyncChip';
import { brandLine, staffHeaderLine } from '@/lib/data/clientDetail';
import { clientInitials, clientListStats, clientMatchesFilter, singleOrAcross, type ClientListFilter, type ClientListRow } from '@/lib/data/clientList';
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
};

export type ClientTaskRow = {
  id: string;
  name: string;
  status: string;
  isDone: boolean;
  stage?: string | null;
  date?: string | null;
  projectName?: string | null;
  publishToWarehaus?: boolean;
  category?: string | null;
  projectInternal?: boolean;
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

function Panel({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <section
      data-testid={testId}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 28,
        padding: '1.25rem',
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
      <p style={{ fontSize: 'var(--t-sm)', color: tone ?? 'var(--muted)', marginTop: 6 }}>{hint}</p>
    </div>
  );
}

function Mark({ name }: { name: string }) {
  return (
    <span
      className="ds-mono inline-flex shrink-0 items-center justify-center"
      style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        fontSize: 12,
        color: 'var(--muted)',
      }}
    >
      {clientInitials(name)}
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

function Chevron() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt="" src="/icons/client-chev.svg" width={16} height={16} className="shrink-0 opacity-70" />
  );
}

function DisabledAction({ label }: { label: string }) {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      title="Not available yet"
      className="ds-mono"
      style={{
        fontSize: 'var(--t-xs)',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        padding: '0.45rem 0.8rem',
        borderRadius: 999,
        border: '1px solid var(--border)',
        background: 'transparent',
        color: 'var(--muted)',
        cursor: 'not-allowed',
      }}
    >
      {label}
    </button>
  );
}

function percent(value: number | null | undefined): number {
  if (value == null) return 0;
  const pct = value <= 1 ? value * 100 : value;
  return Math.min(100, Math.max(0, Math.round(pct)));
}

export type ClientScreen = 'ready' | 'empty' | 'loading' | 'error' | 'long';

export function ClientDirectory({
  clients,
  filter,
  onFilter,
  onOpen,
  loading,
  error,
  screen = 'ready',
}: {
  clients: DirectoryClient[];
  filter: ClientListFilter;
  onFilter: (filter: ClientListFilter) => void;
  onOpen: (id: string) => void;
  loading: boolean;
  error: string | null;
  screen?: ClientScreen;
}) {
  const phone = useMaxWidth(767);
  const narrow = useMaxWidth(480);
  const stats = clientListStats(clients);
  const shown = clients.filter((client) => clientMatchesFilter(client, filter));
  const counts: Record<ClientListFilter, number> = {
    all: stats.total,
    active: stats.active,
    internal: stats.internal,
    sync: stats.sync,
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto" data-testid="account-clients">
      <ClampStyle />
      <div
        className="grid w-full gap-3"
        data-testid="client-stats"
        style={{ gridTemplateColumns: phone ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fit, minmax(160px, 1fr))' }}
      >
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
      </div>

      <Panel>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--t-md)' }}>All clients</h2>
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 4 }}>
          Each client sees only what is published to them.
        </p>
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
        {screen === 'error' || error ? (
          <StateNotice
            title="Client list is out of date"
            body={screen === 'error' ? 'Last synced 22 minutes ago. Lumen Dental has a sync problem.' : error || 'Try again in a moment.'}
            action={<DisabledAction label="Retry sync" />}
          />
        ) : screen === 'loading' || loading ? (
          <div className="mt-4 flex flex-col gap-2" aria-busy="true" data-testid="client-loading">
            {[0, 1, 2].map((i) => (
              <div key={i} className="animate-pulse" style={{ height: 64, borderRadius: 12, background: 'var(--bg)' }} />
            ))}
          </div>
        ) : screen === 'empty' ? (
          <EmptyCopy
            title="No clients yet"
            body="Add a client to start a project. Warehaus (internal) always exists."
            action={<DisabledAction label="New client" />}
          />
        ) : shown.length === 0 ? (
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 16 }}>No clients match these filters.</p>
        ) : (
          <ul className="mt-2">
            {shown.map((client) => (
              <li key={client.id} style={{ borderTop: '1px solid var(--border)' }}>
                <button
                  type="button"
                  onClick={() => onOpen(client.id)}
                  className="flex w-full items-center gap-3 text-left"
                  style={{ background: 'none', border: 0, padding: '0.9rem 0.2rem', cursor: 'pointer', color: 'inherit' }}
                >
                  <Mark name={client.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate" style={{ fontWeight: 600 }}>
                      {client.internal ? `${client.name} (internal)` : client.name}
                    </span>
                    {narrow ? (
                      <>
                        <span className="block truncate" data-testid="client-row-meta" style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
                          {client.internal
                            ? `${client.contactCount} staff · admin-only`
                            : `${client.contactCount} ${client.contactCount === 1 ? 'person' : 'people'}`}
                          {` · ${client.projectCount} ${client.projectCount === 1 ? 'project' : 'projects'} · ${client.openTaskCount} open · ${client.awaitingGoCount ?? 0} awaiting go`}
                        </span>
                        <span className="mt-1 flex items-center gap-2 overflow-hidden">
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
                      <span className="ds-mono block truncate" style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
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
  if (screen === 'error') {
    return (
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto" data-testid="client-detail">
        <StateNotice title="We could not load this client" body="Try again in a moment." />
      </div>
    );
  }
  if (screen === 'loading') {
    return (
      <div className="flex h-full min-h-0 w-full flex-col gap-3 overflow-y-auto" data-testid="client-detail" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="w-full animate-pulse" style={{ height: 72, borderRadius: 18, background: 'var(--surface)' }} />
        ))}
      </div>
    );
  }
  const blank = screen === 'empty';
  const projectRows = blank ? [] : projects;
  const taskRows = blank ? [] : tasks;
  const contactRows = blank ? [] : contacts;
  const docRows = blank ? [] : docs;
  const awaiting = taskRows.filter((task) => !task.isDone && task.stage === 'Awaiting Go').length;
  const pending = contactRows.filter((person) => person.invitePending).length;
  const brand = brandName?.trim() || client.name;
  const header = staffHeaderLine(blank ? null : clientSince, blank ? null : leadName);
  const open = taskRows.filter((task) => !task.isDone);
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto" data-testid="client-detail">
      <ClampStyle />
      <Panel>
        <div className="flex items-center gap-4">
          <Mark name={client.name} />
          <div className="min-w-0 flex-1">
            <h2 className="client-card-title">{client.name}</h2>
            {header ? (
              <p className="clamp-one" data-testid="client-since-lead" style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 4 }}>
                {header}
              </p>
            ) : null}
          </div>
          <DisabledAction label="Edit client" />
        </div>
        <div className="mt-4 flex flex-wrap gap-4">
          <Dot tone={client.internal ? 'off' : 'on'}>{client.internal ? 'Not published' : 'Published'}</Dot>
          <SyncChip
            audience="staff"
            notionPageId={client.notionPageId}
            syncHidden={client.syncHidden}
            syncState={client.syncHidden ? 'failed' : undefined}
          />
        </div>
      </Panel>
      <div className="grid w-full grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="PROJECTS" value={String(projectRows.length)} hint={projectRows.length > 0 ? '1 active brand each' : 'No projects yet'} />
        <Stat label="PEOPLE" value={String(contactRows.length)} hint={pending > 0 ? `${pending} invite pending` : 'Contacts with portal access'} />
        <Stat label="OPEN ITEMS" value={String(open.length)} hint={awaiting > 0 ? `${awaiting} awaiting go` : 'None awaiting go'} tone={awaiting > 0 ? 'var(--danger)' : undefined} />
      </div>
      <div className="flex flex-wrap gap-2">
        {[
          ['client-projects', 'Projects', projectRows.length],
          ['client-people', 'People', contactRows.length],
          ['client-tasks', 'Tasks', taskRows.length],
        ].map(([id, label, count]) => (
          <a key={String(id)} href={`#${id}`} className="ds-mono" style={{ fontSize: 13, color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 999, padding: '6px 12px' }}>
            {label} {count}
          </a>
        ))}
      </div>
      <Panel>
        <h3 id="client-projects" style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--t-md)' }}>Projects</h3>
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 4 }}>Brand is attached to each project</p>
        {projectRows.length === 0 ? (
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 12 }}>No projects.</p>
        ) : (
          <ul className="mt-2">
            {projectRows.map((project) => {
              const pct = percent(project.progress);
              return (
                <li key={project.id} className="flex flex-col gap-3 sm:flex-row sm:items-center" style={{ borderTop: '1px solid var(--border)', padding: '0.85rem 0' }}>
                  <div className="flex w-full min-w-0 items-center gap-3 sm:flex-1">
                    <Mark name={project.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate" style={{ fontWeight: 600 }}>{project.name}</span>
                      <span className="block truncate" style={{ fontSize: 13, color: 'var(--muted)' }}>{brandLine(brand)}</span>
                    </span>
                  </div>
                  <span className="flex items-center gap-2">
                    <span style={{ height: 4, width: 88, borderRadius: 99, background: 'var(--border)', overflow: 'hidden' }}>
                      <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: 'var(--fg)' }} />
                    </span>
                    <span className="ds-mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{pct}%</span>
                    <Dot tone={project.internal || project.publishToWarehaus === false ? 'off' : 'on'}>
                      {project.internal || project.publishToWarehaus === false ? 'Not published' : 'Published'}
                    </Dot>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      <Panel>
        <h3 id="client-people" style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--t-md)' }}>People</h3>
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 4 }}>
          Contacts with portal access. Invites stay on Account → Team.
        </p>
        {contactRows.length === 0 ? (
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 12 }}>No contacts.</p>
        ) : (
          <ul className="mt-2">
            {contactRows.map((person) => (
              <li key={person.id} className="flex flex-wrap items-center gap-3" style={{ borderTop: '1px solid var(--border)', padding: '0.85rem 0' }}>
                <Mark name={person.name} />
                <span className="min-w-0 flex-1">
                  <span className="clamp-one block" style={{ fontWeight: 600 }}>{person.name}</span>
                  <span className="block truncate" style={{ fontSize: 13, color: 'var(--muted)' }}>{person.email}</span>
                </span>
                {person.role ? <span style={{ fontSize: 13, color: 'var(--muted)' }}>{person.role}</span> : null}
                <span style={{ fontSize: 13, color: person.invitePending ? 'var(--warn)' : 'var(--muted)' }}>
                  {person.invitePending ? 'Invite pending' : person.portalAccess === 'Enabled' ? 'Active' : 'No portal access'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel>
        <h3 id="client-tasks" style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--t-md)' }}>Tasks</h3>
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 4 }}>Published and unpublished, live Status.</p>
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
              return (
                <li key={task.id} className="flex flex-wrap items-center gap-2" style={{ borderTop: '1px solid var(--border)', padding: '0.85rem 0' }}>
                  <PortalCheckbox checked={task.isDone} disabled />
                  <span className="min-w-0 flex-1 basis-40">
                    <span className="block truncate" style={{ fontWeight: 600 }}>{task.name}</span>
                    {meta ? <span className="block truncate" style={{ fontSize: 13, color: 'var(--muted)' }}>{meta}</span> : null}
                  </span>
                  <span className="flex max-w-full flex-wrap items-center gap-2">
                    {task.stage ? <Pill color={task.stage === 'Awaiting Go' ? 'var(--danger)' : undefined}>{task.stage}</Pill> : null}
                    <Pill color={taskStatusColor(task.status, task.isDone)}>{task.status}</Pill>
                    {task.category ? <Pill>{task.category}</Pill> : null}
                    {task.publishToWarehaus != null && !task.projectInternal ? (
                      <Dot tone={task.publishToWarehaus ? 'on' : 'off'}>{task.publishToWarehaus ? 'Published' : 'Not published'}</Dot>
                    ) : null}
                  </span>
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
  screen = 'ready',
}: {
  name: string;
  leadName?: string | null;
  projects: ClientProjectRow[];
  tasks: ClientTaskRow[];
  docs: DocRow[];
  people: ClientPersonRow[];
  showTeam: boolean;
  onShowTeam: () => void;
  onBack: () => void;
  screen?: ClientScreen;
}) {
  const open = tasks.filter((task) => !task.isDone);
  const awaiting = open.filter((task) => task.stage === 'Awaiting Go');
  if (showTeam) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto" data-testid="client-team">
        <ClampStyle />
        <Panel>
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
            People at {name} with portal access.
          </p>
          {people.length === 0 ? (
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 12 }}>No people shared yet.</p>
          ) : (
            <ul className="mt-2">
              {people.map((person) => (
                <li key={person.id} className="flex items-center gap-3" style={{ borderTop: '1px solid var(--border)', padding: '0.85rem 0' }}>
                  <Mark name={person.name} />
                  <span className="min-w-0">
                    <span className="clamp-one block" style={{ fontWeight: 600 }}>{person.name}</span>
                    <span className="block truncate" style={{ fontSize: 13, color: 'var(--muted)' }}>{person.email}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--t-md)' }}>Waiting on you</h3>
          {awaiting.length === 0 ? (
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 8 }}>Nothing is waiting on your approval.</p>
          ) : (
            <ul className="mt-2">
              {awaiting.map((task) => (
                <li key={task.id} className="flex flex-wrap items-center gap-2" style={{ borderTop: '1px solid var(--border)', padding: '0.85rem 0' }}>
                  <span className="min-w-0 flex-1">
                    <span className="block" style={{ fontWeight: 600 }}>{task.name}</span>
                    <span className="block" style={{ fontSize: 13, color: 'var(--muted)' }}>{task.projectName ?? name}</span>
                  </span>
                  <Pill color="var(--danger)">Awaiting Go</Pill>
                  <Pill color={taskStatusColor(task.status, task.isDone)}>{task.status}</Pill>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    );
  }

  if (screen === 'error') {
    return (
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto" data-testid="client-company">
        <StateNotice title="We could not load your company" body="Try again in a moment." />
      </div>
    );
  }
  if (screen === 'loading') {
    return (
      <div className="flex h-full min-h-0 w-full flex-col gap-3 overflow-y-auto" data-testid="client-company" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="w-full animate-pulse" style={{ height: 72, borderRadius: 18, background: 'var(--surface)' }} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto" data-testid="client-company">
      <ClampStyle />
      <Panel>
        <div className="flex items-center gap-4">
          <Mark name={name} />
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
                    <Mark name={person.name} />
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
      <div className="grid w-full grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="ACTIVE PROJECTS" value={String(projects.length)} hint={projects[0] ? projects[0].name : 'None shared yet'} />
        <Stat label="OPEN ITEMS" value={String(open.length)} hint={`${open.filter((task) => /progress/i.test(task.status)).length} in progress`} />
        <Stat label="NEEDS YOUR ATTENTION" value={String(awaiting.length)} hint={awaiting.length > 0 ? 'Waiting on your approval' : 'Nothing waiting'} tone={awaiting.length > 0 ? 'var(--danger)' : undefined} />
      </div>
      <Panel>
        <h3 id="your-brands" data-testid="your-brands" style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--t-md)' }}>Your brands</h3>
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 4 }}>
          {name} is the brand on each project shared with you.
        </p>
        {screen === 'empty' || projects.length === 0 ? (
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
                    <span className="block" style={{ fontWeight: 600, overflowWrap: 'break-word' }}>{project.name}</span>
                    <span className="block" style={{ fontSize: 13, color: 'var(--muted)' }}>{brandLine(name)}</span>
                  </span>
                  <span className="ds-mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{pct}% of items</span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      <div data-testid="client-docs">
        <DocsBlock docs={screen === 'empty' ? [] : docs} staff={false} />
      </div>
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
      @media (max-width: 480px) {
        .clamp-one { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .client-card-title {
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          overflow: hidden;
        }
      }
    `}</style>
  );
}

function StateNotice({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div
      role="alert"
      className="mt-4 flex flex-col items-start gap-3"
      style={{ border: '1px solid var(--danger)', borderRadius: 18, padding: '1rem 1.25rem' }}
    >
      <p style={{ color: 'var(--danger)', fontWeight: 600, fontSize: 14 }}>{title}</p>
      <p style={{ color: 'var(--muted)', fontSize: 13 }}>{body}</p>
      {action}
    </div>
  );
}

function EmptyCopy({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div
      className="mt-4 flex flex-col items-center gap-2 text-center"
      style={{ border: '1px dashed var(--border)', borderRadius: 18, padding: '2.5rem 1.25rem' }}
    >
      <p style={{ fontWeight: 500 }}>{title}</p>
      <p style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 360 }}>{body}</p>
      {action}
    </div>
  );
}
