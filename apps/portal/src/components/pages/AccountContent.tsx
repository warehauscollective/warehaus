'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { TeamInvites } from '@/components/pages/TeamInvites';
import { GhostButton, Surface } from '@/components/ui/primitives';
import { PortalTilePane, PortalWorkspace } from '@/components/layout/PortalWorkspace';
import { ThemeControl } from '@/components/account/ThemeControl';
import { type DocRow } from '@/components/docs/DocsBlock';
import {
  ClientCompany,
  ClientDetail,
  ClientDirectory,
  type ClientPersonRow,
  type ClientProjectRow,
  type ClientTaskRow,
  type DirectoryClient,
} from '@/components/clients/ClientScreens';
import { NavBreadcrumb } from '@/components/nav/NavBreadcrumb';
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
import { useFixturePreview } from '@/components/providers/FixturePreviewProvider';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { useStaffCrossOrg } from '@/hooks/useStaffCrossOrg';
import { isMissingConvexFunction, staffRosterQueriesDeployed } from '@/lib/data/staffRoster';
import { type ClientListFilter } from '@/lib/data/clientList';
import { clearSearchParam } from '@/lib/nav/clearSearchParam';

const SECTION_TITLE: Record<string, string> = {
  clients: 'Clients',
  profile: 'Profile',
  notifications: 'Notifications',
  team: 'Team & invites',
};

type DirectoryRow = (typeof FIXTURE_CLIENTS)[number];

export function AccountContent() {
  const router = useRouter();
  const fixtures = useFixturePreview();
  const configured = isConvexConfigured();
  const { sectionFor, setSectionFor, linkedClientId, clearLinkedClient } = usePortalView();
  const { data, error } = usePortalData();
  const { portalSession, signOut } = usePortalAuth();
  const activeSection = sectionFor('account');
  const isStaff = Boolean(portalSession?.isStaff);
  const isClient = !isStaff;
  const hostSlug =
    typeof window !== 'undefined' ? getHostSlugFromLocation() ?? undefined : undefined;
  const [filter, setFilter] = useState<ClientListFilter>('all');
  const [clientId, setClientId] = useState<string | null>(null);
  const [showTeam, setShowTeam] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const client = params.get('client');
    if (client) setClientId(client);
    if (params.get('team') === '1') setShowTeam(true);
  }, []);

  useEffect(() => {
    if (!linkedClientId) return;
    setClientId(linkedClientId);
    setSectionFor('account', 'clients');
    clearLinkedClient();
  }, [linkedClientId, setSectionFor, clearLinkedClient]);

  useEffect(() => {
    if (isClient && activeSection === 'team') {
      setSectionFor('account', 'profile');
    }
  }, [isClient, activeSection, setSectionFor]);

  const directoryState = useSafeQuery<DirectoryRow[]>(
    api.clients.listDirectory,
    !fixtures && configured && isStaff ? { hostSlug } : 'skip',
  );
  const staff = useStaffCrossOrg(!fixtures && configured && isStaff, hostSlug);
  const roster = staffRosterQueriesDeployed();
  const peopleState = useSafeQuery<Array<(typeof FIXTURE_CONTACTS)[number]>>(
    api.contacts.listForOrg,
    !fixtures && configured && isStaff && roster && clientId
      ? { orgId: clientId as Id<'clients'>, hostSlug }
      : 'skip',
  );
  const peopleMissing = isMissingConvexFunction(peopleState.error);
  const clientPeopleState = useSafeQuery<ClientPersonRow[]>(
    api.contacts.listForClient,
    !fixtures && configured && isClient ? { hostSlug } : 'skip',
  );
  const clientDocsState = useSafeQuery<DocRow[]>(
    api.clientDocs.listForClient,
    !fixtures && configured && isClient ? { hostSlug } : 'skip',
  );

  const clients = (fixtures ? FIXTURE_CLIENTS : directoryState.data ?? []) as DirectoryRow[];
  const projects = (
    fixtures ? FIXTURE_PROJECTS : isStaff ? staff.projects ?? [] : data.projects
  ) as typeof FIXTURE_PROJECTS;
  const tasks = (fixtures ? FIXTURE_TASKS : staff.tasks ?? data.tasks) as typeof FIXTURE_TASKS;
  const docs = (
    fixtures ? FIXTURE_DOCS : isStaff ? staff.docs ?? [] : clientDocsState.data ?? []
  ) as DocRow[];
  const contacts = fixtures
    ? FIXTURE_CONTACTS.filter((contact) => contact.orgId === (isStaff ? clientId : portalSession?.orgId))
    : isStaff
      ? peopleMissing
        ? []
        : peopleState.data ?? []
      : clientPeopleState.data ?? [];

  const selected = clients.find((client) => client.id === clientId) ?? null;
  const directory: DirectoryClient[] = clients.map((client) => {
    const row = client as DirectoryClient;
    return {
      ...row,
      awaitingGoCount:
        row.awaitingGoCount ??
        tasks.filter((task) => task.orgId === client.id && !task.isDone && task.stage === 'Awaiting Go').length,
    };
  });
  const clientOpen = Boolean(isStaff && activeSection === 'clients' && selected);
  const companyOpen = Boolean(isClient && activeSection === 'clients');
  const title = clientOpen && selected
    ? selected.name
    : companyOpen
      ? showTeam
        ? 'Your team'
        : data.tenant.clientName ?? 'Clients'
      : SECTION_TITLE[activeSection] ?? 'Account';

  const leaveClient = () => {
    setClientId(null);
    clearSearchParam('client');
  };
  const goAccountRoot = () => {
    leaveClient();
    setShowTeam(false);
    setSectionFor('account', 'clients');
  };
  const goClients = () => {
    leaveClient();
    setSectionFor('account', 'clients');
  };

  const breadcrumb = clientOpen && selected ? (
    <NavBreadcrumb
      back="always"
      onBack={goAccountRoot}
      parent={{ label: 'Account', onClick: goAccountRoot }}
      middle={{ label: 'Clients', onClick: goClients }}
      current={selected.name}
    />
  ) : companyOpen ? (
    <NavBreadcrumb
      back={showTeam ? 'always' : 'mobile'}
      onBack={showTeam ? () => setShowTeam(false) : goAccountRoot}
      parent={{ label: 'Account', onClick: goAccountRoot }}
      middle={
        showTeam
          ? { label: data.tenant.clientName ?? 'Clients', onClick: () => setShowTeam(false) }
          : undefined
      }
      current={showTeam ? 'Your team' : 'Clients'}
    />
  ) : isStaff && activeSection === 'clients' ? (
    <NavBreadcrumb
      back="mobile"
      onBack={goAccountRoot}
      parent={{ label: 'Account', onClick: goAccountRoot }}
      current="Clients"
    />
  ) : activeSection === 'profile' ? (
    <NavBreadcrumb
      back="mobile"
      onBack={goAccountRoot}
      parent={{ label: 'Account', onClick: goAccountRoot }}
      current="Profile"
    />
  ) : null;
  return (
    <PortalWorkspace
      eyebrow={tenantEyebrow(data.tenant, 'Account')}
      title={title}
      breadcrumb={breadcrumb ?? undefined}
    >
      {error && isStaff ? (
        <p style={{ color: 'var(--danger)', fontSize: 'var(--t-sm)', marginBottom: 12 }}>{error}</p>
      ) : null}
      {error && isClient ? (
        <p style={{ color: 'var(--danger)', fontSize: 'var(--t-sm)', marginBottom: 12 }}>
          We could not load your company
        </p>
      ) : null}

      {isStaff && activeSection === 'clients' && selected ? (
        <PortalTilePane>
          <ClientDetail
            client={directory.find((client) => client.id === selected.id) ?? (selected as DirectoryClient)}
            projects={projects.filter((project) => project.orgId === selected.id) as ClientProjectRow[]}
            tasks={tasks.filter((task) => task.orgId === selected.id) as ClientTaskRow[]}
            docs={docs.filter((doc) => doc.orgId === selected.id)}
            contacts={contacts as ClientPersonRow[]}
          />
        </PortalTilePane>
      ) : null}

      {isStaff && activeSection === 'clients' && !selected ? (
        <PortalTilePane>
          <ClientDirectory
            clients={directory}
            filter={filter}
            onFilter={setFilter}
            onOpen={(id) => setClientId(id)}
            loading={directoryState.loading && !fixtures}
            error={directoryState.error}
          />
        </PortalTilePane>
      ) : null}

      {companyOpen ? (
        <PortalTilePane>
          <ClientCompany
            name={data.tenant.clientName ?? portalSession?.name ?? 'Your company'}
            contactName={portalSession?.name ?? '—'}
            contactEmail={portalSession?.email ?? '—'}
            projects={
              projects.filter((project) => {
                if (project.internal || project.publishToWarehaus === false) return false;
                return !portalSession?.orgId || project.orgId === portalSession.orgId;
              }) as ClientProjectRow[]
            }
            tasks={
              tasks.filter((task) => {
                if (task.syncHidden || task.publishToWarehaus === false) return false;
                const project = projects.find((item) => item.id === task.projectId);
                if (!project || project.internal || project.publishToWarehaus === false) return false;
                return !portalSession?.orgId || task.orgId === portalSession.orgId || !task.orgId;
              }) as ClientTaskRow[]
            }
            docs={docs.filter((doc) => doc.publishToWarehaus !== false && doc.status !== 'Draft')}
            people={contacts as ClientPersonRow[]}
            showTeam={showTeam}
            onShowTeam={() => setShowTeam(true)}
            onBack={() => setShowTeam(false)}
          />
        </PortalTilePane>
      ) : null}

      {activeSection === 'profile' && (
        <PortalTilePane>
          <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto" data-testid="account-profile">
            <Surface style={{ padding: 'var(--s-5)' }}>
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
        <TeamInvites hostSlug={hostSlug} configured={configured && !fixtures} fixtures={fixtures} />
      )}
    </PortalWorkspace>
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
    <Surface style={{ padding: 'var(--s-5)' }}>
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
