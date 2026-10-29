import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import type { ClientPersonRow, ClientTaskRow, DirectoryClient } from './ClientScreens';

Object.assign(globalThis, { React });
const { ClientCompany, ClientDetail, ClientDirectory, EditClientButton, NewClientButton } = await import('./ClientScreens');

const people: ClientPersonRow[] = [
  { id: 'maya', name: 'Maya Chen', email: 'maya@warehaus.co', role: 'Warehaus Staff', portalAccess: 'Enabled' },
  { id: 'ada', name: 'Ada North', email: 'ada@northwind.example', role: 'Client Admin', portalAccess: 'Enabled' },
  { id: 'sam', name: 'Sam North', email: 'sam@northwind.example', role: 'Client Member', portalAccess: 'Disabled', invitePending: true },
];

const tasks: ClientTaskRow[] = [
  {
    id: 't-todo',
    name: 'Write the launch checklist',
    status: 'To Do',
    isDone: false,
    stage: 'Awaiting Go',
    date: '2026-10-20',
    lastEditedTime: '2026-10-05',
    projectName: 'Northwind site',
  },
  {
    id: 't-build',
    name: 'Build the project page',
    status: 'In Progress',
    isDone: false,
    stage: 'Building',
    projectName: 'Northwind site',
  },
];

function teamMarkup(rows: ClientPersonRow[] = people): string {
  return renderToStaticMarkup(
    createElement(ClientCompany, {
      name: 'Northwind',
      projects: [],
      tasks,
      docs: [],
      people: rows,
      showTeam: true,
      onShowTeam: () => {},
      onOpenTask: () => {},
      onBack: () => {},
    }),
  );
}

const staffClient: DirectoryClient = {
  id: 'c-north',
  name: 'Northwind',
  status: 'Active',
  internal: false,
  syncHidden: false,
  projectCount: 1,
  openTaskCount: 1,
  contactCount: 1,
};

describe('client team page', () => {
  it('matches the team card, hides staff, and labels awaiting work for the client', () => {
    const html = teamMarkup();
    assert.match(html, /Your team/);
    assert.match(html, /People at Northwind with portal access/);
    assert.equal(html.includes('Maya Chen'), false);
    assert.match(html, /data-testid="client-person-email"[^>]*style="[^"]*overflow-wrap:anywhere[^"]*"[^>]*>ada@northwind\.example</);
    assert.match(html, /data-testid="client-person-role-phone"[^>]*style="[^"]*white-space:nowrap[^"]*"[^>]*> · Client Admin</);
    assert.match(html, /Invite pending/);
    assert.match(html, /Client Admins can invite teammates/);
    assert.match(html, /Ada can invite new Client Members from Account › Team/);
    assert.equal(html.includes('← Company'), false);
    assert.match(html, /Waiting on you/);
    assert.match(html, /Tasks published to you at Awaiting Go/);
    assert.match(html, /Write the launch checklist/);
    assert.equal(html.includes('Build the project page'), false);
    assert.match(html, /Northwind site · Due Oct 20/);
    assert.match(html, /Pending approval/);
    assert.equal(html.includes('>Awaiting Go<'), false);
    assert.match(html, /data-testid="client-team-open"/);
    assert.match(html, /Updated Oct 5/);
    assert.match(html, /data-testid="client-person-role"[^>]*style="[^"]*width:140px[^"]*text-align:left/);
    assert.match(html, /data-testid="client-person-status"[^>]*style="[^"]*width:140px;margin-left:24px[^"]*text-align:left/);
    assert.equal(html.includes('class="clamp-one"'), false);
    assert.match(html, /border-radius:999px/);
    assert.equal(html.includes('ds-pill'), false);
    assert.equal(html.includes('client-chev.svg'), true);
  });

  it('renders role and portal status from the listForClient row shape', () => {
    const live: ClientPersonRow[] = [
      {
        id: 'contact-ada',
        name: 'Ada North',
        email: 'ada@northwind.example',
        role: 'Client Admin',
        portalAccess: 'Enabled',
        invitePending: false,
      },
      {
        id: 'contact-sam',
        name: 'Sam North',
        email: 'sam@northwind.example',
        role: 'Client Member',
        portalAccess: 'Disabled',
        invitePending: true,
      },
    ];
    for (const row of live) {
      assert.deepEqual(Object.keys(row).sort(), ['email', 'id', 'invitePending', 'name', 'portalAccess', 'role']);
    }
    const html = teamMarkup(live);
    assert.match(html, /class="ds-mono hidden lg:block"[^>]*>ada@northwind\.example</);
    assert.match(html, /data-testid="client-person-role"[^>]*>Client Admin</);
    assert.match(html, /data-testid="client-person-email"[^>]*>ada@northwind\.example</);
    assert.match(html, /data-testid="client-person-role-phone"[^>]*> · Client Admin</);
    assert.match(html, /data-testid="client-person-email"[^>]*>sam@northwind\.example</);
    assert.match(html, /data-testid="client-person-role-phone"[^>]*> · Client Member</);
    assert.match(html, /Active/);
    assert.match(html, /Invite pending/);
    assert.equal(html.includes('No portal access'), false);
  });

  it('stacks company and staff stat cards and keeps project marks square', () => {
    const company = renderToStaticMarkup(
      createElement(ClientCompany, {
        name: 'Northwind',
        projects: [{ id: 'p-site', name: 'Northwind site', status: 'In Progress', progress: 0.4 }],
        tasks: [],
        docs: [],
        people,
        showTeam: false,
        onShowTeam: () => {},
        onBack: () => {},
      }),
    );
    const detail = renderToStaticMarkup(
      createElement(ClientDetail, {
        client: staffClient,
        projects: [{ id: 'p-site', name: 'Northwind site', status: 'In Progress', progress: 0.4 }],
        tasks: [],
        docs: [],
        contacts: people,
        leadName: 'Maya Chen',
        clientSince: 'March 2026',
      }),
    );
    assert.match(company, /grid-cols-1/);
    assert.equal(company.includes('col-span-2'), false);
    assert.match(company, /data-testid="company-mark"[^>]*style="[^"]*width:64px[^"]*border-radius:10px/);
    assert.equal(company.includes('border-radius:999px'), true);
    assert.match(detail, /grid-cols-1/);
    assert.equal(detail.includes('col-span-2'), false);
    assert.match(detail, /data-testid="person-avatar"/);
    assert.match(detail, /border-radius:10px/);
    assert.match(detail, /class="clamp-two"/);
    assert.match(detail, /Client since March 2026/);
    assert.match(detail, /data-testid="client-header-mark"[^>]*style="[^"]*width:64px[^"]*border-radius:10px/);
    assert.match(detail, /data-testid="client-sync-line"/);
    assert.match(detail, /Invites are managed by the client/);
    assert.match(detail, /newest first/);
    assert.equal(detail.includes('data-testid="edit-client"'), false);
    const edit = renderToStaticMarkup(createElement(EditClientButton));
    const headerNew = renderToStaticMarkup(createElement(NewClientButton));
    assert.match(edit, /data-testid="edit-client"/);
    assert.match(edit, /font-family:var\(--font-body\)/);
    assert.match(edit, /opacity:0.4/);
    assert.match(edit, /Editing turns on with Notion write-back/);
    assert.equal(edit.includes('role="group"'), false);
    assert.match(headerNew, /background:transparent/);
    assert.match(headerNew, /border:1px solid var\(--border-2\)/);
    assert.match(headerNew, /opacity:0.4/);
    assert.equal(headerNew.includes('var(--accent)'), false);
    assert.match(detail, /Sam North/);
    assert.match(detail, /data-testid="client-person-email"[^>]*>sam@northwind\.example</);
    assert.match(detail, /data-testid="client-person-role-phone"[^>]*> · Client Member</);
    assert.match(detail, /text-align:left/);
    assert.match(detail, /width:140px/);
    assert.equal(detail.includes('class="clamp-one"'), false);
    assert.equal(detail.includes('···'), false);
    assert.equal(detail.includes('Not available yet'), false);
  });
});

const longName = 'Northwind Foods and Northwind Kitchen Holdings International';
const longProject = 'Spring menu launch for all Northwind Foods locations';

const northwind: DirectoryClient = {
  id: 'c-long',
  name: 'Northwind',
  status: 'Active',
  internal: false,
  syncHidden: false,
  projectCount: 2,
  openTaskCount: 12,
  awaitingGoCount: 3,
  contactCount: 4,
};

function directoryMarkup(options: {
  clients?: DirectoryClient[];
  loading?: boolean;
  error?: string | null;
  errorTitle?: string;
  filter?: 'all' | 'internal';
} = {}) {
  return renderToStaticMarkup(
    createElement(ClientDirectory, {
      clients: options.clients ?? [northwind],
      filter: options.filter ?? 'all',
      onFilter: () => {},
      onOpen: () => {},
      loading: options.loading ?? false,
      error: options.error ?? null,
      errorTitle: options.errorTitle,
      onRetry: () => {},
    }),
  );
}

describe('client states', () => {
  it('shows the dashed empty card from an empty client array and hides KPIs and chips', () => {
    const html = directoryMarkup({ clients: [] });
    assert.match(html, /No clients yet/);
    assert.match(html, /Add a client to start a project\. Warehaus \(internal\) always exists\./);
    assert.match(html, /Warehaus is the client when none applies/);
    assert.match(html, /task-layers\.svg/);
    assert.match(html, /data-testid="new-client"/);
    assert.match(html, /minmax\(0, 1fr\)/);
    assert.equal(html.includes('repeat(2'), false);
    assert.equal(html.includes('data-testid="client-stats"'), false);
    assert.equal(html.includes('data-testid="client-filters"'), false);
    assert.equal(html.includes('All clients'), false);
    assert.equal(html.includes('role="group"'), false);
  });

  it('keeps KPIs and chips when a filter matches nothing', () => {
    const html = directoryMarkup({ filter: 'internal' });
    assert.match(html, /No clients match these filters\./);
    assert.match(html, /data-testid="clear-filters"/);
    assert.match(html, /data-testid="client-stats"/);
    assert.match(html, /data-testid="client-filters"/);
    assert.match(html, />1</);
    assert.equal(html.includes('No clients yet'), false);
  });

  it('renders KPI and row skeletons while loading and hides the chips', () => {
    const html = directoryMarkup({ loading: true });
    assert.match(html, /data-testid="client-loading"/);
    assert.equal(html.match(/data-testid="client-kpi-skeleton"/g)?.length, 4);
    assert.equal(html.match(/width:64px;height:22px/g)?.length, 3);
    assert.equal(html.includes('data-testid="client-filters"'), false);
    assert.equal(html.includes('data-testid="client-row-name"'), false);
    assert.equal(html.includes('>2<'), false);
  });

  it('replaces the list when an error has no cached clients', () => {
    const html = directoryMarkup({
      clients: [],
      error: 'Network error',
    });
    assert.match(html, /We couldn(?:'|&#x27;)t load clients/);
    assert.match(html, /Try again in a moment\./);
    assert.match(html, /data-testid="client-state-notice"[\s\S]*data-testid="client-try-again"/);
    assert.equal(html.includes('Client list is out of date'), false);
    assert.equal(html.includes('data-testid="retry-sync"'), false);
    assert.equal(html.includes('data-testid="client-stats"'), false);
    assert.equal(html.includes('data-testid="client-row-name"'), false);
    assert.equal(html.includes('No clients yet'), false);
  });

  it('keeps cached rows under the out-of-date banner', () => {
    const html = directoryMarkup({
      error: 'Last synced 22 minutes ago. Lumen Dental has a sync problem.',
      errorTitle: 'Client list is out of date',
    });
    assert.match(html, /Client list is out of date/);
    assert.match(html, /Last synced 22 minutes ago\. Lumen Dental has a sync problem\./);
    assert.match(html, /data-testid="client-state-notice"[\s\S]*data-testid="retry-sync"/);
    assert.match(html, /data-testid="client-row-name"[^>]*>Northwind</);
    assert.match(html, /data-testid="client-stats"/);
    assert.equal(html.includes('No clients yet'), false);
    assert.equal(/We couldn(?:'|&#x27;)t load clients/.test(html), false);
  });

  it('clamps a long directory name to two lines on a phone', () => {
    const html = directoryMarkup({ clients: [{ ...northwind, name: longName }] });
    assert.match(html, /class="client-row-clamp block"/);
    assert.match(html, new RegExp(longName));
    assert.match(html, /\.client-row-clamp \{[^}]*-webkit-line-clamp: 2/);
    assert.match(html, /\.kpi-caption \{[^}]*text-overflow: ellipsis/);
    assert.equal(html.includes('class="block truncate"'), false);
  });

  it('derives the company empty, loading, and error states from the data', () => {
    const empty = renderToStaticMarkup(
      createElement(ClientCompany, {
        name: 'Northwind',
        projects: [],
        tasks: [],
        docs: [],
        people,
        showTeam: false,
        onShowTeam: () => {},
        onBack: () => {},
      }),
    );
    assert.match(empty, /No projects shared with you yet/);
    assert.match(empty, /Warehaus will publish projects here when they are ready\./);
    assert.match(empty, /data-testid="person-avatar"/);
    assert.match(empty, /border-radius:999px/);
    assert.equal(empty.includes('data-testid="client-stats"'), false);
    assert.equal(empty.includes('New client'), false);

    const loading = renderToStaticMarkup(
      createElement(ClientCompany, {
        name: 'Northwind',
        projects: [{ id: 'p-site', name: 'Northwind site', status: 'In Progress', progress: 0.4 }],
        tasks: [],
        docs: [],
        people: [],
        showTeam: false,
        onShowTeam: () => {},
        onBack: () => {},
        loading: true,
      }),
    );
    assert.match(loading, /data-testid="client-company-card"/);
    assert.match(loading, /data-testid="client-loading"/);
    assert.equal(loading.match(/data-testid="client-kpi-skeleton"/g)?.length, 3);
    assert.match(loading, /grid-cols-1/);
    assert.equal(loading.includes('Northwind site'), false);

    const error = renderToStaticMarkup(
      createElement(ClientCompany, {
        name: 'Northwind',
        projects: [],
        tasks: [],
        docs: [],
        people: [],
        showTeam: false,
        onShowTeam: () => {},
        onBack: () => {},
        error: 'Network error',
        onRetry: () => {},
      }),
    );
    assert.match(error, /We couldn(?:'|&#x27;)t load your company/);
    assert.match(error, /Try again in a moment\./);
    assert.match(error, /data-testid="client-state-notice"[\s\S]*data-testid="client-try-again"/);
    assert.equal(error.includes('data-testid="client-stats"'), false);

    const long = renderToStaticMarkup(
      createElement(ClientCompany, {
        name: longName,
        projects: [{ id: 'p-long', name: longProject, status: 'In Progress', progress: 0.45 }],
        tasks: [],
        docs: [],
        people: [],
        showTeam: false,
        onShowTeam: () => {},
        onBack: () => {},
      }),
    );
    assert.match(long, new RegExp(longProject));
    assert.match(long, /45% of items/);
    assert.match(long, /class="kpi-caption"/);
    assert.match(long, /class="brand-row-name block"/);
    assert.match(long, /\.brand-row-name \{[^}]*-webkit-line-clamp: 2/);
    assert.match(long, /\.brand-row-meta \{[^}]*text-overflow: ellipsis/);
    assert.equal(long.includes('data-testid="brand-row-meta"'), false);
    assert.equal(long.includes('45% shipped'), false);

    const branded = renderToStaticMarkup(
      createElement(ClientCompany, {
        name: 'Northwind',
        projects: [{ id: 'p-long', name: longProject, status: 'In Progress', progress: 0.45, brand: 'Northwind Kitchen' }],
        tasks: [],
        docs: [],
        people: [],
        showTeam: false,
        onShowTeam: () => {},
        onBack: () => {},
      }),
    );
    assert.match(branded, /data-testid="brand-row-meta"[^>]*>Brand: Northwind Kitchen</);
  });
});
