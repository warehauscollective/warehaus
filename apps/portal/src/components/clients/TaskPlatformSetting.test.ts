import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import { toTaskPlatformView, type TaskPlatform } from '@warehaus/portal-sync';
import type { TaskPlatformPanelModel } from './TaskPlatformSetting';
import type { DirectoryClient } from './ClientScreens';

Object.assign(globalThis, { React });
const { TaskPlatformSetting } = await import('./TaskPlatformSetting');
const { ClientCompany, ClientDetail } = await import('./ClientScreens');

function panel(platform: TaskPlatform, canChange: boolean): TaskPlatformPanelModel {
  const view = toTaskPlatformView({ platform, tasks: [], canChange, env: {} });
  return { ...view, canChange, saving: false, error: null, onChange: canChange ? () => {} : undefined };
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

describe('task platform setting', () => {
  it('gives staff the control and gives the client a read-only value', () => {
    const staff = renderToStaticMarkup(createElement(TaskPlatformSetting, panel('notion', true)));
    assert.match(staff, /data-testid="task-platform"/);
    assert.match(staff, /data-can-change="true"/);
    assert.match(staff, /data-testid="task-platform-notion"[^>]*aria-pressed="true"/);
    assert.match(staff, /data-testid="task-platform-linear"[^>]*aria-pressed="false"/);
    assert.match(staff, /leaves Notion tasks/);
    assert.equal(staff.includes('data-testid="task-platform-value"'), false);

    const client = renderToStaticMarkup(createElement(TaskPlatformSetting, panel('linear', false)));
    assert.match(client, /data-can-change="false"/);
    assert.match(client, /data-platform="linear"/);
    assert.match(client, /data-testid="task-platform-value"/);
    assert.match(client, /Linear is not configured/);
    assert.match(client, /Only Warehaus staff can change this/);
    assert.equal(client.includes('task-platform-notion'), false);
    assert.equal(client.includes('task-platform-linear'), false);
    assert.equal(client.includes('<button'), false);
  });

  it('places the control on the staff client page and the read-only line on the company page', () => {
    const detail = renderToStaticMarkup(
      createElement(ClientDetail, {
        client: staffClient,
        projects: [],
        tasks: [],
        docs: [],
        contacts: [],
        taskPlatform: panel('notion', true),
      }),
    );
    assert.match(detail, /data-testid="client-detail"[\s\S]*data-testid="task-platform-linear"/);

    const company = renderToStaticMarkup(
      createElement(ClientCompany, {
        name: 'Northwind',
        projects: [{ id: 'p-site', name: 'Northwind site', status: 'In Progress' }],
        tasks: [],
        docs: [],
        people: [],
        showTeam: false,
        onShowTeam: () => {},
        onBack: () => {},
        taskPlatform: panel('notion', true),
      }),
    );
    assert.match(company, /data-testid="client-company"[\s\S]*data-testid="task-platform"/);
    assert.match(company, /data-can-change="false"/);
    assert.equal(company.includes('task-platform-linear'), false);
    assert.match(company, /Only Warehaus staff can change this/);
  });
});
