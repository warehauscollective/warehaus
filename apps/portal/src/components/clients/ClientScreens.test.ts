import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import type { ClientPersonRow, ClientTaskRow, DirectoryClient } from './ClientScreens';

Object.assign(globalThis, { React });
const { ClientCompany, ClientDetail } = await import('./ClientScreens');

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
    assert.match(html, /ada@northwind\.example · Client Admin/);
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
    assert.match(html, /data-testid="client-person-role"/);
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
    assert.match(html, /data-testid="client-person-meta"[^>]*>ada@northwind\.example · Client Admin</);
    assert.match(html, /data-testid="client-person-meta"[^>]*>sam@northwind\.example · Client Member</);
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
    assert.equal(detail.includes('···'), false);
    assert.equal(detail.includes('Not available yet'), false);
  });
});
