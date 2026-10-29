'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { AccountSettings, type AccountSavePreview } from '@/components/account/AccountSettings';
import { TeamInvites } from '@/components/pages/TeamInvites';
import { PortalTilePane, PortalWorkspace } from '@/components/layout/PortalWorkspace';
import { DocsStatesGallery, type DocRow } from '@/components/docs/DocsBlock';
import {
  ClientCompany,
  ClientDetail,
  ClientDirectory,
  type ClientPersonRow,
  type ClientProjectRow,
  type ClientScreen,
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
import { clientVisiblePerson, formatClientSince, isStudioProjectName, warehausLead, withoutClientLeaks } from '@/lib/data/clientDetail';
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
  const [inviteOpen, setInviteOpen] = useState(false);
  const [docsPreview, setDocsPreview] = useState<string | null>(null);
  const [clientScreen, setClientScreen] = useState<ClientScreen>('ready');
  const [savePreview, setSavePreview] = useState<AccountSavePreview>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const client = params.get('client');
    if (client) setClientId(client);
    if (params.get('team') === '1') setShowTeam(true);
    if (params.get('docs') === 'states') setDocsPreview('states');
    const clients = params.get('clients');
    if (clients === 'empty' || clients === 'loading' || clients === 'error' || clients === 'long') {
      setClientScreen(clients);
    }
    if (params.get('invite') === '1') setInviteOpen(true);
    const account = params.get('account');
    if (fixtures && (account === 'success' || account === 'error' || account === 'loading')) {
      setSavePreview(account);
    }
  }, [fixtures]);

  useEffect(() => {
    if (!linkedClientId) return;
    setClientId(linkedClientId);
    setSectionFor('account', 'clients');
    clearLinkedClient();
  }, [linkedClientId, setSectionFor, clearLinkedClient]);

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
  const clientTeam = Boolean(isClient && activeSection === 'team');
  const companyOpen = Boolean(isClient && (activeSection === 'clients' || clientTeam));
  const teamVisible = showTeam || clientTeam;
  const title = clientOpen && selected
    ? selected.name
    : companyOpen
      ? teamVisible
        ? 'Your team'
        : data.tenant.clientName ?? 'Clients'
      : inviteOpen
        ? 'Invite someone'
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
      back={teamVisible ? 'always' : 'mobile'}
      onBack={teamVisible ? () => { setShowTeam(false); setSectionFor('account', 'clients'); } : goAccountRoot}
      parent={{ label: 'Account', onClick: goAccountRoot }}
      middle={
        teamVisible
          ? { label: data.tenant.clientName ?? 'Your company', onClick: () => { setShowTeam(false); setSectionFor('account', 'clients'); } }
          : undefined
      }
      current={teamVisible ? 'Your team' : 'Your company'}
    />
  ) : isStaff && inviteOpen ? (
    <NavBreadcrumb
      back="always"
      onBack={() => {
        setInviteOpen(false);
        const url = new URL(window.location.href);
        url.searchParams.delete('invite');
        window.history.replaceState(window.history.state, '', url);
      }}
      parent={{ label: 'Account', onClick: () => { setInviteOpen(false); goAccountRoot(); } }}
      middle={{
        label: 'Team & invites',
        onClick: () => {
          setInviteOpen(false);
          const url = new URL(window.location.href);
          url.searchParams.delete('invite');
          window.history.replaceState(window.history.state, '', url);
        },
      }}
      current="Invite someone"
    />
  ) : isStaff && activeSection === 'clients' ? (
    <NavBreadcrumb
      back="mobile"
      onBack={goAccountRoot}
      parent={{ label: 'Account', onClick: goAccountRoot }}
      current="Clients"
    />
  ) : activeSection === 'profile' || activeSection === 'notifications' || (isStaff && activeSection === 'team') ? (
    <NavBreadcrumb
      back="mobile"
      onBack={goAccountRoot}
      parent={{ label: 'Account', onClick: goAccountRoot }}
      current={
        activeSection === 'notifications'
          ? 'Notifications'
          : activeSection === 'team'
            ? 'Team & invites'
            : 'Profile'
      }
    />
  ) : null;
  return (
    <PortalWorkspace
      eyebrow={tenantEyebrow(data.tenant, 'Account')}
      title={title}
      breadcrumb={breadcrumb ?? undefined}
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
          />
        </PortalTilePane>
      ) : null}

      {docsPreview !== 'states' && isStaff && activeSection === 'clients' && !selected ? (
        <PortalTilePane>
          <ClientDirectory
            clients={
              clientScreen === 'long'
                ? directory.map((client, index) => (index === 0 ? { ...client, name: LONG_CLIENT } : client))
                : directory
            }
            filter={filter}
            onFilter={setFilter}
            onOpen={(id) => setClientId(id)}
            loading={clientScreen === 'loading' || (directoryState.loading && !fixtures)}
            error={clientScreen === 'error' ? null : directoryState.error}
            screen={clientScreen}
          />
        </PortalTilePane>
      ) : null}

      {docsPreview !== 'states' && companyOpen ? (
        <PortalTilePane>
          <ClientCompany
            name={clientScreen === 'long' ? LONG_CLIENT : data.tenant.clientName ?? portalSession?.name ?? 'Your company'}
            leadName={data.leadName ?? null}
            projects={clientProjects(projects, portalSession?.orgId, clientScreen)}
            tasks={clientTasks(tasks, projects, portalSession?.orgId)}
            docs={docs
              .filter((doc) => doc.publishToWarehaus !== false && doc.status !== 'Draft')
              .map((doc) => withoutClientLeaks(doc))}
            people={contacts.filter(clientVisiblePerson).map((person) => withoutClientLeaks(person)) as ClientPersonRow[]}
            showTeam={teamVisible}
            onShowTeam={() => {
              setShowTeam(true);
              setSectionFor('account', 'team');
            }}
            onBack={() => {
              setShowTeam(false);
              setSectionFor('account', 'clients');
            }}
            screen={error ? 'error' : clientScreen}
          />
        </PortalTilePane>
      ) : null}

      {(activeSection === 'profile' || activeSection === 'notifications' || (isStaff && activeSection === 'team' && !inviteOpen)) && (
        <PortalTilePane>
          <AccountSettings
            staff={isStaff}
            name={portalSession?.name ?? '—'}
            email={portalSession?.email ?? '—'}
            orgLabel={isStaff ? 'Warehaus' : data.tenant.clientName ?? 'Your company'}
            role={portalSession?.role ?? (isStaff ? 'Warehaus Staff' : 'Client')}
            focus={
              activeSection === 'notifications' ? 'notifications' : activeSection === 'team' ? 'team' : 'profile'
            }
            live={configured && !fixtures}
            hostSlug={hostSlug}
            savePreview={savePreview}
            onInvite={() => {
              setSectionFor('account', 'team');
              setInviteOpen(true);
              const url = new URL(window.location.href);
              url.searchParams.set('tab', 'account');
              url.searchParams.set('section', 'team');
              url.searchParams.set('invite', '1');
              window.history.replaceState(window.history.state, '', url);
            }}
            onSignOut={() => {
              void (async () => {
                await signOut();
                if (!fixtures) router.replace('/login');
              })();
            }}
          />
        </PortalTilePane>
      )}

      {isStaff && activeSection === 'team' && inviteOpen && (
        <TeamInvites hostSlug={hostSlug} configured={configured && !fixtures} fixtures={fixtures} />
      )}
    </PortalWorkspace>
  );
}

