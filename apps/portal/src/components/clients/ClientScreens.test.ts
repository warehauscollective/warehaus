import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import type { ClientPersonRow, ClientTaskRow, DirectoryClient } from './ClientScreens';

Object.assign(globalThis, { React });
const { ClientCompany, ClientDetail, ClientDirectory } = await import('./ClientScreens');

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
    assert.match(html, /data-testid="client-person-email"[^>]*style="[^"]*white-space:nowrap[^"]*"[^>]*>ada@northwind\.example</);
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
    assert.match(html, /data-testid="client-person-status"[^>]*style="[^"]*margin-left:24px[^"]*text-align:left/);
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
    assert.match(company, /border-radius:10px/);
    assert.match(detail, /grid-cols-1/);
    assert.equal(detail.includes('col-span-2'), false);
    assert.match(detail, /data-testid="person-avatar"/);
    assert.match(detail, /border-radius:10px/);
    assert.match(detail, /class="clamp-two"/);
    assert.match(detail, /Client since March 2026/);
    assert.match(detail, /data-testid="edit-client"/);
    assert.match(detail, /font-family:var\(--font-body\)/);
    assert.match(detail, /opacity:0.4/);
    assert.match(detail, /Editing turns on with Notion write-back/);
    assert.equal(detail.includes('role="group"'), false);
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

function directoryMarkup(screen: 'ready' | 'empty' | 'loading' | 'error' | 'long') {
  return renderToStaticMarkup(
    createElement(ClientDirectory, {
      clients: [
        {
          id: 'c-long',
          name: screen === 'long' ? longName : 'Northwind',
          status: 'Active',
          internal: false,
          syncHidden: false,
          projectCount: 2,
          openTaskCount: 12,
          awaitingGoCount: 3,
          contactCount: 4,
        },
      ],
      filter: 'all',
      onFilter: () => {},
      onOpen: () => {},
      loading: false,
      error: null,
      screen,
    }),
  );
}

describe('client states', () => {
  it('shows the dashed empty card and a disabled New client control', () => {
    const html = directoryMarkup('empty');
    assert.match(html, /No clients yet/);
    assert.match(html, /Add a client to start a project\. Warehaus \(internal\) always exists\./);
    assert.match(html, /task-layers\.svg/);
    assert.match(html, /data-testid="new-client"/);
    assert.match(html, /font-family:var\(--font-body\)/);
    assert.match(html, /opacity:0.4/);
    assert.match(html, /Creating a client turns on with Notion write-back/);
    assert.equal(html.includes('role="group"'), false);
    assert.equal(html.includes('Not available yet'), false);
    assert.equal(html.includes('text-transform:uppercase'), false);
  });

  it('renders three skeleton rows while the directory is loading', () => {
    const html = directoryMarkup('loading');
    assert.match(html, /data-testid="client-loading"/);
    assert.equal(html.match(/border-radius:10px/g)?.length, 3);
    assert.equal(html.match(/width:64px;height:22px/g)?.length, 3);
    assert.equal(html.includes('data-testid="client-row-name"'), false);
  });

  it('puts Retry sync under the danger notice', () => {
    const html = directoryMarkup('error');
    assert.match(html, /Client list is out of date/);
    assert.match(html, /Last synced 22 minutes ago\. Lumen Dental has a sync problem\./);
    assert.match(html, /data-testid="client-state-notice"/);
    assert.match(html, /data-testid="retry-sync"/);
    assert.match(html, /Retrying a sync turns on with Notion write-back/);
    assert.equal(html.includes('role="group"'), false);
    const noticeAt = html.indexOf('data-testid="client-state-notice"');
    const retryAt = html.indexOf('data-testid="retry-sync"');
    const bang = html.indexOf('!', noticeAt);
    assert.ok(noticeAt >= 0 && bang > noticeAt && bang < retryAt);
  });

  it('wraps a long client name instead of truncating it', () => {
    const html = directoryMarkup('long');
    assert.match(html, /data-testid="client-row-name"[^>]*style="[^"]*overflow-wrap:break-word[^"]*"[^>]*>Northwind Foods and Northwind Kitchen Holdings International</);
    assert.equal(html.includes('class="block truncate"'), false);
  });

  it('uses the same empty, loading, and error treatment on the company page', () => {
    const empty = renderToStaticMarkup(
      createElement(ClientCompany, {
        name: 'Northwind',
        projects: [],
        tasks: [],
        docs: [],
        people: [],
        showTeam: false,
        onShowTeam: () => {},
        onBack: () => {},
        screen: 'empty',
      }),
    );
    assert.match(empty, /No projects shared with you yet/);
    assert.match(empty, /Warehaus will publish projects here when they are ready\./);
    assert.match(empty, /task-layers\.svg/);
    assert.equal(empty.includes('New client'), false);

    const loading = renderToStaticMarkup(
      createElement(ClientCompany, {
        name: 'Northwind',
        projects: [],
        tasks: [],
        docs: [],
        people: [],
        showTeam: false,
        onShowTeam: () => {},
        onBack: () => {},
        screen: 'loading',
      }),
    );
    assert.match(loading, /data-testid="client-loading"/);
    assert.equal(loading.match(/width:64px;height:22px/g)?.length, 3);

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
        screen: 'error',
      }),
    );
    assert.match(error, /We could not load your company/);
    assert.match(error, /Try again in a moment\./);
    assert.match(error, /data-testid="client-state-notice"/);
    assert.equal(error.includes('retry-sync'), false);

    const long = renderToStaticMarkup(
      createElement(ClientCompany, {
        name: 'Northwind',
        projects: [{ id: 'p-long', name: longProject, status: 'In Progress', progress: 0.45 }],
        tasks: [],
        docs: [],
        people: [],
        showTeam: false,
        onShowTeam: () => {},
        onBack: () => {},
        screen: 'long',
      }),
    );
    assert.match(long, new RegExp(`${longProject}`));
    assert.match(long, /45% of items/);
    assert.equal(long.includes('45% shipped'), false);
    assert.equal(long.includes('class="block truncate"'), false);
  });
});
