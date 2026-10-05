'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { GhostButton, Pill, Surface } from '@/components/ui/primitives';
import { PortalTilePane, PortalWorkspace } from '@/components/layout/PortalWorkspace';
import { ThemeControl } from '@/components/account/ThemeControl';
import { DocsBlock, type DocRow } from '@/components/docs/DocsBlock';
import { PublishChip, SyncChip } from '@/components/sync/SyncChip';
import { usePortalView } from '@/components/providers/PortalViewProvider';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { tenantEyebrow, usePortalData } from '@/hooks/usePortalData';
import { getHostSlugFromLocation } from '@/lib/auth/host-slug';
import { isConvexConfigured } from '@/lib/convex/client';
import {
  FIXTURE_CLIENTS,
  FIXTURE_CONTACTS,
  FIXTURE_DOCS,
  FIXTURE_PROJECTS,
  FIXTURE_TASKS,
} from '@/lib/data/fixtures';
import { portalFixturesEnabled } from '@/lib/data/portalFixtures';
import { taskStatusColor } from '@/lib/data/view-models';

const SECTION_TITLE: Record<string, string> = {
  clients: 'Clients',
  profile: 'Profile',
  notifications: 'Notifications',
  team: 'Team & invites',
};

type DirectoryRow = (typeof FIXTURE_CLIENTS)[number];

export function AccountContent() {
  const router = useRouter();
  const fixtures = portalFixturesEnabled();
  const configured = isConvexConfigured();
  const { sectionFor, setSectionFor } = usePortalView();
  const { data, error } = usePortalData();
  const { portalSession, signOut } = usePortalAuth();
  const activeSection = sectionFor('account');
  const isStaff = Boolean(portalSession?.isStaff);
  const isClient = !isStaff;
  const hostSlug =
    typeof window !== 'undefined' ? getHostSlugFromLocation() ?? undefined : undefined;
  const [filter, setFilter] = useState<'all' | 'active' | 'internal' | 'sync'>('all');
  const [clientId, setClientId] = useState<string | null>(null);
  const [retryNote, setRetryNote] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const client = params.get('client');
    if (client) setClientId(client);
  }, []);

  useEffect(() => {
    if (isClient && (activeSection === 'clients' || activeSection === 'team')) {
      setSectionFor('account', 'profile');
    }
  }, [isClient, activeSection, setSectionFor]);

  const directory = useQuery(
    api.clients.listDirectory,
    !fixtures && configured && isStaff ? { hostSlug } : 'skip',
  );
  const staffProjects = useQuery(
    api.projects.listForStaff,
    !fixtures && configured && isStaff ? { hostSlug } : 'skip',
  );
  const staffTasks = useQuery(
    api.tasks.listForStaff,
    !fixtures && configured && isStaff ? { hostSlug } : 'skip',
  );
  const staffDocs = useQuery(
    api.clientDocs.listForStaff,
    !fixtures && configured && isStaff ? { hostSlug } : 'skip',
  );
  const people = useQuery(
    api.contacts.listForOrg,
    !fixtures && configured && isStaff && clientId
      ? { orgId: clientId as Id<'clients'>, hostSlug }
      : 'skip',
  );

  const clients = (fixtures ? FIXTURE_CLIENTS : directory ?? []) as DirectoryRow[];
  const projects = fixtures ? FIXTURE_PROJECTS : staffProjects ?? [];
  const tasks = fixtures ? FIXTURE_TASKS : staffTasks ?? [];
  const docs = (fixtures ? FIXTURE_DOCS : staffDocs ?? []) as DocRow[];
  const contacts = fixtures
    ? FIXTURE_CONTACTS.filter((contact) => contact.orgId === clientId)
    : people ?? [];

  const title = SECTION_TITLE[activeSection] ?? 'Account';
  const selected = clients.find((client) => client.id === clientId) ?? null;
  const filtered = clients.filter((client) => {
    if (filter === 'internal') return client.internal;
    if (filter === 'sync') return client.syncHidden;
    if (filter === 'active') return client.status.toLowerCase() === 'active' && !client.syncHidden;
    return true;
  });

  return (
    <PortalWorkspace eyebrow={tenantEyebrow(data.tenant, 'Account')} title={title}>
      {error && isStaff ? (
        <p style={{ color: 'var(--danger)', fontSize: 'var(--t-sm)', marginBottom: 12 }}>{error}</p>
      ) : null}
      {error && isClient ? (
        <p style={{ color: 'var(--danger)', fontSize: 'var(--t-sm)', marginBottom: 12 }}>
          We could not load your company
        </p>
      ) : null}

      {isStaff && activeSection === 'clients' && selected ? (
        <ClientDetail
          client={selected}
          projects={projects.filter((project) => project.orgId === selected.id)}
          tasks={tasks.filter((task) => task.orgId === selected.id)}
          docs={docs.filter((doc) => doc.orgId === selected.id)}
          contacts={contacts}
          onBack={() => setClientId(null)}
          retryNote={retryNote}
          onRetry={() =>
            setRetryNote('Write-back is off. Retry does not call Notion.')
          }
        />
      ) : null}

      {isStaff && activeSection === 'clients' && !selected ? (
        <PortalTilePane>
          <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto" data-testid="account-clients">
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
              Warehaus is the client when none applies.
            </p>
            <div className="flex flex-wrap gap-2">
              {(['all', 'active', 'internal', 'sync'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  aria-pressed={filter === key}
                  className="ds-mono"
                  style={{
                    fontSize: 'var(--t-xs)',
                    padding: '0.35rem 0.7rem',
                    borderRadius: 999,
                    border: '1px solid var(--border)',
                    background: filter === key ? 'var(--fg)' : 'transparent',
                    color: filter === key ? 'var(--bg)' : 'var(--muted)',
                    cursor: 'pointer',
                  }}
                >
                  {key === 'sync' ? 'Sync problem' : key[0].toUpperCase() + key.slice(1)}
                </button>
              ))}
            </div>
            {directory === undefined && !fixtures ? (
              <div className="flex flex-col gap-2" aria-busy="true">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="animate-pulse"
                    style={{ height: 64, borderRadius: 12, background: 'var(--bg)' }}
                  />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <Surface style={{ padding: 'var(--s-5)' }}>
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
                  No clients match these filters.
                </p>
              </Surface>
            ) : (
              filtered.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => setClientId(client.id)}
                  className="text-left"
                >
                  <Surface style={{ padding: 'var(--s-4)' }}>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600 }}>{client.name}</h3>
                      {client.internal ? <PublishChip published={false} /> : null}
                      <SyncChip
                        notionPageId={client.notionPageId}
                        syncHidden={client.syncHidden}
                        onRetry={
                          client.syncHidden
                            ? () => setRetryNote('Write-back is off. Retry does not call Notion.')
                            : undefined
                        }
                        retryNote={client.syncHidden ? retryNote : null}
                      />
                    </div>
                    <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)', marginTop: 8 }}>
                      {client.contactCount} people · {client.projectCount} projects · {client.openTaskCount} open items · Awaiting go —
                    </p>
                  </Surface>
                </button>
              ))
            )}
          </div>
        </PortalTilePane>
      ) : null}

      {activeSection === 'profile' && (
        <PortalTilePane>
          <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto">
            <Surface style={{ padding: 'var(--s-5)', maxWidth: 560 }}>
              <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
                Profile
              </p>
              <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, marginTop: 8 }}>
                {portalSession?.name ?? '—'}
              </h3>
              <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 4 }}>
                {portalSession?.email ?? '—'}
              </p>
              <div className="mt-5 flex justify-end">
                <GhostButton
                  onClick={() => {
                    void (async () => {
                      await signOut();
                      if (!fixtures) router.replace('/login');
                    })();
                  }}
                >
                  Sign out
                </GhostButton>
              </div>
            </Surface>
            <ThemeControl />
            {isClient ? (
              <Surface style={{ padding: 'var(--s-5)' }}>
                <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
                  Your contact
                </p>
                <p style={{ fontSize: 'var(--t-sm)', marginTop: 8 }}>
                  {portalSession?.name ?? data.tenant.clientName ?? '—'}
                </p>
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
                  {data.tenant.clientName ?? 'Your company'}
                </p>
              </Surface>
            ) : null}
          </div>
        </PortalTilePane>
      )}

      {activeSection === 'notifications' && (
        <PortalTilePane>
          <NotificationSettings staff={isStaff} />
        </PortalTilePane>
      )}

      {isStaff && activeSection === 'team' && (
        <PortalTilePane>
          <Surface style={{ padding: 'var(--s-5)', maxWidth: 560 }}>
            <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
              Team & invites
            </p>
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 8 }}>
              Invites stay on this screen. Sending them waits for a later batch, so this page does not
              create or revoke invites.
            </p>
          </Surface>
        </PortalTilePane>
      )}
    </PortalWorkspace>
  );
}

function ClientDetail({
  client,
  projects,
  tasks,
  docs,
  contacts,
  onBack,
  retryNote,
  onRetry,
}: {
  client: DirectoryRow;
  projects: Array<{ id: string; name: string; status: string }>;
  tasks: Array<{
    id: string;
    name: string;
    status: string;
    isDone: boolean;
    notionPageId?: string | null;
    syncHidden?: boolean;
  }>;
  docs: DocRow[];
  contacts: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    portalAccess: 'Enabled' | 'Disabled';
    notionPageId?: string | null;
    syncHidden?: boolean;
  }>;
  onBack: () => void;
  retryNote: string | null;
  onRetry: () => void;
}) {
  const clientDocs = docs;
  return (
    <PortalTilePane>
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto" data-testid="client-detail">
        <button
          type="button"
          onClick={onBack}
          className="ds-mono self-start"
          style={{ fontSize: 'var(--t-xs)', color: 'var(--accent)', background: 'none', border: 0, cursor: 'pointer' }}
        >
          All clients
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <h2 style={{ fontSize: 'var(--t-lg)', fontWeight: 600 }}>{client.name}</h2>
          <SyncChip
            notionPageId={client.notionPageId}
            syncHidden={client.syncHidden}
            onRetry={client.syncHidden ? onRetry : undefined}
            retryNote={client.syncHidden ? retryNote : null}
          />
        </div>
        <section>
          <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>Projects</p>
          {projects.length === 0 ? (
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 6 }}>No projects.</p>
          ) : (
            projects.map((project) => (
              <p key={project.id} style={{ fontSize: 'var(--t-sm)', marginTop: 6 }}>
                {project.name} · {project.status}
              </p>
            ))
          )}
        </section>
        <section>
          <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>People</p>
          <p style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)', marginTop: 4 }}>
            Contacts with portal access.
          </p>
          {contacts.length === 0 ? (
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 6 }}>No contacts.</p>
          ) : (
            contacts.map((contact) => (
              <div key={contact.id} className="mt-2 flex flex-wrap items-center gap-2">
                <span style={{ fontSize: 'var(--t-sm)', fontWeight: 600 }}>{contact.name}</span>
                <span style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>{contact.email}</span>
                <Pill>{contact.role}</Pill>
                <Pill color={contact.portalAccess === 'Enabled' ? 'var(--success)' : 'var(--muted)'}>
                  {contact.portalAccess === 'Enabled' ? 'Portal access' : 'No portal access'}
                </Pill>
                <SyncChip notionPageId={contact.notionPageId} syncHidden={contact.syncHidden} />
              </div>
            ))
          )}
        </section>
        <section>
          <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>Items</p>
          {tasks.length === 0 ? (
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 6 }}>No tasks.</p>
          ) : (
            tasks.map((task) => (
              <div key={task.id} className="mt-2 flex flex-wrap items-center gap-2">
                <span style={{ fontSize: 'var(--t-sm)', overflowWrap: 'anywhere' }}>{task.name}</span>
                <Pill color={taskStatusColor(task.status, task.isDone)}>{task.status}</Pill>
                <SyncChip notionPageId={task.notionPageId} syncHidden={task.syncHidden} />
              </div>
            ))
          )}
        </section>
        <DocsBlock docs={clientDocs} staff />
      </div>
    </PortalTilePane>
  );
}

function NotificationSettings({ staff }: { staff: boolean }) {
  const [flags, setFlags] = useState({
    awaitingGo: true,
    syncProblems: true,
    draftRecaps: false,
    inviteNotices: true,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('warehaus-notifications');
      if (raw) setFlags(JSON.parse(raw) as typeof flags);
    } catch {
      /* ignore */
    }
  }, []);

  const save = (next: typeof flags) => {
    setFlags(next);
    try {
      localStorage.setItem('warehaus-notifications', JSON.stringify(next));
      setError(null);
    } catch {
      setError('Could not save your settings');
    }
  };

  const rows: Array<[keyof typeof flags, string]> = [
    ['awaitingGo', 'Awaiting go'],
    ...(staff
      ? ([
          ['syncProblems', 'Sync problems'],
          ['draftRecaps', 'Draft recaps'],
          ['inviteNotices', 'Invite notices'],
        ] as Array<[keyof typeof flags, string]>)
      : []),
  ];

  return (
    <Surface style={{ padding: 'var(--s-5)', maxWidth: 560 }}>
      <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
        Notifications
      </p>
      <div className="mt-4 flex flex-col gap-3">
        {rows.map(([key, label]) => (
          <label key={key} className="flex items-center justify-between gap-3">
            <span style={{ fontSize: 'var(--t-sm)' }}>{label}</span>
            <input
              type="checkbox"
              checked={flags[key]}
              onChange={(event) => save({ ...flags, [key]: event.target.checked })}
            />
          </label>
        ))}
      </div>
      {error ? (
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)', marginTop: 12 }}>
          {error}. Try again.
        </p>
      ) : null}
    </Surface>
  );
}
