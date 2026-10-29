import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import type { ClientPersonRow, ClientTaskRow } from './ClientScreens';

Object.assign(globalThis, { React });
const { ClientCompany } = await import('./ClientScreens');

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

function teamMarkup(): string {
  return renderToStaticMarkup(
    createElement(ClientCompany, {
      name: 'Northwind',
      projects: [],
      tasks,
      docs: [],
      people,
      showTeam: true,
      onShowTeam: () => {},
      onBack: () => {},
    }),
  );
}

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
  });
});
