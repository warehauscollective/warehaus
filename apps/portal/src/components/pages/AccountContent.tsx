'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { TeamInvites } from '@/components/pages/TeamInvites';
import { PortalCheckbox, Surface } from '@/components/ui/primitives';
import { PortalTilePane, PortalWorkspace } from '@/components/layout/PortalWorkspace';
import { AccountProfile } from '@/components/account/AccountProfile';
import { DocsStatesGallery, type DocRow } from '@/components/docs/DocsBlock';
import {
  ClientCompany,
  ClientDetail,
  ClientDirectory,
  EditClientButton,
  NewClientButton,
  type ClientPersonRow,
  type ClientProjectRow,
  type ClientScreen,
  type ClientTaskRow,
  type DirectoryClient,
} from '@/components/clients/ClientScreens';
import { NavBreadcrumb } from '@/components/nav/NavBreadcrumb';
import { useRetryPortalData } from '@/components/providers/PortalDataRetry';
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
import { clientTeamCrumbs, clientVisiblePerson, formatClientSince, isStudioProjectName, warehausLead, withoutClientLeaks } from '@/lib/data/clientDetail';
import { openPortalHref } from '@/lib/nav/openPortalHref';
import { useMaxWidth } from '@/lib/design/useMaxWidth';
import { type ClientListFilter } from '@/lib/data/clientList';
import { clearSearchParam } from '@/lib/nav/clearSearchParam';

const LONG_CLIENT = 'Northwind Foods and Northwind Kitchen Holdings International';
const LONG_PROJECT = 'Spring menu launch for all Northwind Foods locations';

function staffProjects(rows: ClientProjectRow[], screen: ClientScreen): ClientProjectRow[] {
  return rows.map((project, index) => (screen === 'long' && index === 0 ? { ...project, name: LONG_PROJECT } : project));
}

function clientProjects(
  rows: Array<ClientProjectRow & { orgId?: string }>,
  orgId: string | undefined,
  screen: ClientScreen,
): ClientProjectRow[] {
  const visible = rows.filter((project) => {
    if (project.internal || project.publishToWarehaus === false || isStudioProjectName(project.name)) return false;
    return !orgId || !project.orgId || project.orgId === orgId;
  });
  return visible.map((project, index) =>
    withoutClientLeaks({
      ...project,
      name: screen === 'long' && index === 0 ? LONG_PROJECT : project.name,
    }),
  );
}

function clientTasks(
  rows: Array<ClientTaskRow & { orgId?: string; projectId?: string | null; syncHidden?: boolean; publishToWarehaus?: boolean }>,
  projects: Array<ClientProjectRow & { id: string; orgId?: string }>,
  orgId: string | undefined,
): ClientTaskRow[] {
  return rows.flatMap((task) => {
    if (task.syncHidden || task.publishToWarehaus === false) return [];
    const project = projects.find((item) => item.id === task.projectId);
    if (!project || project.internal || project.publishToWarehaus === false || isStudioProjectName(project.name)) return [];
    if (orgId && task.orgId && task.orgId !== orgId) return [];
    return [withoutClientLeaks(task)];
  });
}

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
  const { data, error, loading: portalLoading } = usePortalData();
  const retryPortalData = useRetryPortalData();
  const { portalSession, signOut } = usePortalAuth();
  const activeSection = sectionFor('account');
  const isStaff = Boolean(portalSession?.isStaff);
  const isClient = !isStaff;
  const hostSlug =
    typeof window !== 'undefined' ? getHostSlugFromLocation() ?? undefined : undefined;
  const [filter, setFilter] = useState<ClientListFilter>('all');
  const [clientId, setClientId] = useState<string | null>(null);
  const [showTeam, setShowTeam] = useState(false);
  const teamPhone = useMaxWidth(1023);
  const teamTrail = clientTeamCrumbs(teamPhone);
  const [docsPreview, setDocsPreview] = useState<string | null>(null);
  const [clientScreen, setClientScreen] = useState<ClientScreen>('ready');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const client = params.get('client');
    if (client) setClientId(client);
    if (params.get('team') === '1') setShowTeam(true);
    if (params.get('docs') === 'states') setDocsPreview('states');
    const clients = params.get('clients');
    if (
      clients === 'empty' ||
      clients === 'loading' ||
      clients === 'error' ||
      clients === 'long' ||
      clients === 'filtered' ||
      clients === 'refresh'
    ) {
      setClientScreen(clients);
      if (clients === 'filtered') setFilter('internal');
    }
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
  const longClient = clientScreen === 'long' ? LONG_CLIENT : null;
  const title = clientOpen && selected
    ? longClient ?? selected.name
    : companyOpen
      ? showTeam
        ? 'Your team'
        : longClient ?? data.tenant.clientName ?? 'Clients'
      : SECTION_TITLE[activeSection] ?? 'Account';
  const titleLines = longClient && (clientOpen || (companyOpen && !showTeam)) ? 2 : 1;
  const showNewClient = isStaff && activeSection === 'clients' && !selected && docsPreview !== 'states';
  const retryClientScreen = () => {
    if (fixtures) {
      setClientScreen('ready');
      setFilter('all');
      return;
    }
    retryPortalData();
  };
  const directoryRows: DirectoryClient[] =
    clientScreen === 'empty' || clientScreen === 'error'
      ? []
      : clientScreen === 'filtered'
        ? directory.filter((client) => !client.internal)
        : clientScreen === 'long'
          ? directory.map((client, index) => (index === 0 ? { ...client, name: LONG_CLIENT } : client))
          : directory;
  const directoryError =
    clientScreen === 'error'
      ? 'Try again in a moment.'
      : clientScreen === 'refresh'
        ? 'Last synced 22 minutes ago. Lumen Dental has a sync problem.'
        : directoryState.error;
  const companyProjects =
    clientScreen === 'empty' || clientScreen === 'error'
      ? []
      : clientProjects(projects, portalSession?.orgId, clientScreen);
  const companyDocs =
    clientScreen === 'empty'
      ? []
      : docs
          .filter((doc) => doc.publishToWarehaus !== false && doc.status !== 'Draft')
          .map((doc) => withoutClientLeaks(doc));
  const companyError =
    clientScreen === 'error'
      ? "We couldn't load your company"
      : clientScreen === 'refresh'
        ? 'Network error'
        : error;
  // Fixture screens set `clientScreen`. Live data uses the snapshot and the
  // client queries, so a still-loading company cannot render as true-empty.
  const companyLoading =
    clientScreen === 'loading' ||
    (!fixtures && (portalLoading || clientPeopleState.loading || clientDocsState.loading));

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
      onBack={showTeam && teamTrail.back === 'account' ? goAccountRoot : showTeam ? () => setShowTeam(false) : goAccountRoot}
      parent={{
        label: showTeam ? teamTrail.parent : 'Account',
        onClick: showTeam && teamTrail.parent === 'Company' ? () => setShowTeam(false) : goAccountRoot,
      }}
      middle={
        showTeam && teamTrail.middle
          ? { label: teamTrail.middle, onClick: () => setShowTeam(false) }
          : undefined
      }
      current={showTeam ? teamTrail.current : 'Your company'}
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
      titleLines={titleLines}
      breadcrumb={breadcrumb ?? undefined}
      actions={
        showNewClient ? <NewClientButton /> : clientOpen ? <EditClientButton /> : undefined
      }
    >
      {fixtures && docsPreview === 'states' ? (
        <PortalTilePane>
          <DocsStatesGallery />
        </PortalTilePane>
      ) : null}

      {error && isStaff && docsPreview !== 'states' ? (
        <p style={{ color: 'var(--danger)', fontSize: 'var(--t-sm)', marginBottom: 12 }}>{error}</p>
      ) : null}
      {error && isClient && !companyOpen ? (
        <p style={{ color: 'var(--danger)', fontSize: 'var(--t-sm)', marginBottom: 12 }}>
          We could not load your company
        </p>
      ) : null}

      {docsPreview !== 'states' && isStaff && activeSection === 'clients' && selected ? (
        <PortalTilePane>
          <ClientDetail
            client={{
              ...(directory.find((client) => client.id === selected.id) ?? (selected as DirectoryClient)),
              name: clientScreen === 'long' ? LONG_CLIENT : selected.name,
            }}
            projects={staffProjects(projects.filter((project) => project.orgId === selected.id), clientScreen) as ClientProjectRow[]}
            tasks={tasks
              .filter((task) => task.orgId === selected.id)
              .map((task) => {
                const project = projects.find((item) => item.id === task.projectId);
                return {
                  ...task,
                  projectInternal: Boolean(project?.internal || isStudioProjectName(project?.name ?? task.projectName)),
                };
              })}
            docs={docs.filter((doc) => doc.orgId === selected.id)}
            contacts={contacts as ClientPersonRow[]}
            leadName={warehausLead(contacts)}
            clientSince={formatClientSince(
              projects.filter((project) => project.orgId === selected.id).map((project) => project.startDate),
            )}
            brandName={clientScreen === 'long' ? LONG_CLIENT : selected.name}
            screen={clientScreen}
          />
        </PortalTilePane>
      ) : null}

      {docsPreview !== 'states' && isStaff && activeSection === 'clients' && !selected ? (
        <PortalTilePane>
          <ClientDirectory
            clients={directoryRows}
            filter={filter}
            onFilter={(next) => {
              setFilter(next);
              if (clientScreen === 'filtered' && next === 'all') setClientScreen('ready');
            }}
            onOpen={(id) => setClientId(id)}
            loading={clientScreen === 'loading' || (directoryState.loading && !fixtures)}
            error={directoryError}
            errorTitle={clientScreen === 'refresh' ? 'Client list is out of date' : undefined}
            onRetry={retryClientScreen}
          />
        </PortalTilePane>
      ) : null}

      {docsPreview !== 'states' && companyOpen ? (
        <PortalTilePane>
          <ClientCompany
            name={clientScreen === 'long' ? LONG_CLIENT : data.tenant.clientName ?? portalSession?.name ?? 'Your company'}
            leadName={data.leadName ?? null}
            projects={companyProjects}
            tasks={clientTasks(tasks, projects, portalSession?.orgId)}
            docs={companyDocs}
            people={contacts.filter(clientVisiblePerson).map((person) => withoutClientLeaks(person)) as ClientPersonRow[]}
            showTeam={showTeam}
            onShowTeam={() => setShowTeam(true)}
            onOpenTask={(taskId) => openPortalHref(`/tasks/${taskId}`)}
            onBack={() => setShowTeam(false)}
            loading={companyLoading}
            error={companyError}
            onRetry={retryClientScreen}
          />
        </PortalTilePane>
      ) : null}

      {activeSection === 'profile' && (
        <PortalTilePane>
          <AccountProfile
            name={portalSession?.name ?? ''}
            email={portalSession?.email ?? ''}
            role={portalSession?.role}
            orgName={data.tenant.clientName}
            ownerLane={fixtures && isStaff ? 'Dream, Design, Develop' : null}
            onSignOut={() => {
              void (async () => {
                await signOut();
                if (!fixtures) router.replace('/login');
              })();
            }}
          />
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
            <PortalCheckbox
              checked={flags[key]}
              onChange={(checked) => save({ ...flags, [key]: checked })}
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
