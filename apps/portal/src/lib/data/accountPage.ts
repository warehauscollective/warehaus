'use client';

/**
 * Account page data. One interface, two adapters:
 *
 * - live: the client directory, staff cross-org rows, contacts and client docs
 * - fixture: the Northwind fixtures
 *
 * The page picks neither for its rows. `useAccountPage` reads the fixture flag
 * once. `preview` stays on the result because the design-review screens
 * (`?clients=`, `?team=`, `?docs=`) and some child panels still need it.
 */

import { useEffect, useState } from 'react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import type { ClientPersonRow } from '@/components/clients/ClientScreens';
import type { DocRow } from '@/components/docs/DocsBlock';
import { useFixturePreview } from '@/components/providers/FixturePreviewProvider';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { useStaffCrossOrg } from '@/hooks/useStaffCrossOrg';
import { isConvexConfigured } from '@/lib/convex/client';
import { FIXTURE_CLIENTS, FIXTURE_CONTACTS, FIXTURE_DOCS, FIXTURE_PROJECTS, FIXTURE_TASKS } from '@/lib/data/fixtures';
import { isMissingConvexFunction, staffRosterQueriesDeployed } from '@/lib/data/staffRoster';
import type { PortalSnapshot } from '@/lib/data/view-models';

export type DirectoryRow = (typeof FIXTURE_CLIENTS)[number];
export type AccountContact = (typeof FIXTURE_CONTACTS)[number];
type ProjectRows = typeof FIXTURE_PROJECTS;
type TaskRows = typeof FIXTURE_TASKS;

export type AccountPage = {
  /** Design-review preview. Picks the URL screens; never set on a live page. */
  preview: boolean;
  /** Convex reads run. Child panels that read for themselves take this. */
  live: boolean;
  clients: DirectoryRow[];
  clientsLoading: boolean;
  clientsError: string | null;
  projects: ProjectRows;
  tasks: TaskRows;
  docs: DocRow[];
  /** Staff: the open client's people. Client: their own org's people. */
  contacts: AccountContact[];
  /** Client only: the Your team list. Keeps the last good list when a refetch fails. */
  team: { people: ClientPersonRow[]; loading: boolean; failed: boolean };
  /** Client only: the company view is still loading its rows. */
  companyLoading: boolean;
};

type Input = {
  isStaff: boolean;
  hostSlug: string | undefined;
  /** Staff: the open client. */
  clientId: string | null;
  /** Client: the viewer's org. */
  orgId: string | undefined;
  snapshot: Pick<PortalSnapshot, 'projects' | 'tasks'>;
  snapshotLoading: boolean;
};

/** Fixture adapter. Pure, so tests can read it without React. */
export function fixtureAccountPage(input: Pick<Input, 'isStaff' | 'clientId' | 'orgId'>): AccountPage {
  const org = input.isStaff ? input.clientId : input.orgId;
  const contacts = FIXTURE_CONTACTS.filter((contact) => contact.orgId === org);
  return {
    preview: true,
    live: false,
    clients: FIXTURE_CLIENTS,
    clientsLoading: false,
    clientsError: null,
    projects: FIXTURE_PROJECTS,
    tasks: FIXTURE_TASKS,
    docs: FIXTURE_DOCS as unknown as DocRow[],
    contacts,
    team: { people: contacts as unknown as ClientPersonRow[], loading: false, failed: false },
    companyLoading: false,
  };
}

function useLiveAccountPage(enabled: boolean, input: Input): AccountPage {
  const { isStaff, hostSlug, clientId, snapshot, snapshotLoading } = input;
  const on = enabled && isConvexConfigured();
  const isClient = !isStaff;
  const roster = staffRosterQueriesDeployed();

  const directory = useSafeQuery<DirectoryRow[]>(api.clients.listDirectory, on && isStaff ? { hostSlug } : 'skip');
  const staff = useStaffCrossOrg(on && isStaff, hostSlug);
  const people = useSafeQuery<AccountContact[]>(
    api.contacts.listForOrg,
    on && isStaff && roster && clientId ? { orgId: clientId as Id<'clients'>, hostSlug } : 'skip',
  );
  const peopleMissing = isMissingConvexFunction(people.error);
  const clientPeople = useSafeQuery<ClientPersonRow[]>(api.contacts.listForClient, on && isClient ? { hostSlug } : 'skip');
  const clientDocs = useSafeQuery<DocRow[]>(api.clientDocs.listForClient, on && isClient ? { hostSlug } : 'skip');

  const [peopleCache, setPeopleCache] = useState<ClientPersonRow[] | null>(null);
  useEffect(() => {
    if (clientPeople.data) setPeopleCache(clientPeople.data);
  }, [clientPeople.data]);
  const teamFailed = Boolean(clientPeople.error) && !clientPeople.data;

  return {
    preview: false,
    live: on,
    clients: directory.data ?? [],
    clientsLoading: directory.loading,
    clientsError: directory.error,
    projects: (isStaff ? staff.projects ?? [] : snapshot.projects) as ProjectRows,
    tasks: (staff.tasks ?? snapshot.tasks) as TaskRows,
    docs: (isStaff ? staff.docs ?? [] : clientDocs.data ?? []) as DocRow[],
    contacts: isStaff ? (peopleMissing ? [] : people.data ?? []) : ((clientPeople.data ?? []) as unknown as AccountContact[]),
    team: {
      people: clientPeople.data ?? (teamFailed ? peopleCache : null) ?? [],
      loading: clientPeople.loading && !clientPeople.data && !peopleCache,
      failed: teamFailed,
    },
    companyLoading: snapshotLoading || clientPeople.loading || clientDocs.loading,
  };
}

/** The page's one data seam. Fixture mode is read here and nowhere else on the page. */
export function useAccountPage(input: Input): AccountPage {
  const fixtures = useFixturePreview();
  const live = useLiveAccountPage(!fixtures, input);
  return fixtures ? fixtureAccountPage(input) : live;
}
