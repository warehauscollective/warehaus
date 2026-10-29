import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';

Object.assign(globalThis, { React });
const {
  NewProjectButton,
  ProjectListEmptyState,
  ProjectListFilters,
  ProjectListLoadNotice,
  ProjectListOutcome,
  ProjectListScreen,
  ProjectListSkeleton,
  ProjectKpiSkeleton,
} = await import('./ProjectListStates');

const noop = () => {};

describe('ProjectListEmptyState', () => {
  it('shows the staff dashed card and a disabled New project while create is off', () => {
    const html = renderToStaticMarkup(
      createElement(ProjectListEmptyState, { viewerCount: 0, staff: true, onCreate: noop, createEnabled: false }),
    );
    assert.match(html, /No projects yet/);
    assert.match(html, /Create a project under a client, or under Warehaus for internal work\./);
    assert.match(html, /New project/);
    assert.match(html, /task-layers\.svg/);
    assert.match(html, /max-width:440px/);
    assert.match(html, /text-wrap:balance/);
    assert.match(html, /data-testid="new-project-hint"/);
    assert.match(html, /Creating a project turns on with Notion write-back/);
    assert.match(html, /opacity:0\.4/);
    assert.match(html, /cursor:not-allowed/);
    assert.match(html, /tabindex="0"/);
    assert.match(html, /tabindex="-1"/);
    assert.equal(html.includes('role="group"'), false);
  });

  it('wires an enabled New project without the hint wrapper', () => {
    const html = renderToStaticMarkup(
      createElement(ProjectListEmptyState, { viewerCount: 0, staff: true, onCreate: noop, createEnabled: true }),
    );
    assert.match(html, /data-testid="new-project"/);
    assert.equal(html.includes('new-project-hint'), false);
    assert.equal(html.includes('opacity:0.4'), false);
  });

  it('hides New project from the client empty card', () => {
    const html = renderToStaticMarkup(
      createElement(ProjectListEmptyState, { viewerCount: 0, staff: false, onCreate: noop, createEnabled: true }),
    );
    assert.match(html, /No projects shared with you yet/);
    assert.match(html, /Warehaus will publish projects here when they are ready\./);
    assert.equal(html.includes('New project'), false);
  });

  it('keeps a filtered list as one line', () => {
    const html = renderToStaticMarkup(
      createElement(ProjectListEmptyState, { viewerCount: 4, staff: true, onCreate: noop, createEnabled: true }),
    );
    assert.match(html, /No projects match these filters\./);
    assert.equal(html.includes('New project'), false);
  });
});

describe('NewProjectButton', () => {
  it('keeps the header control focusable for the hint while create is off', () => {
    const html = renderToStaticMarkup(createElement(NewProjectButton, { enabled: false, onCreate: noop, variant: 'primary' }));
    assert.match(html, /data-testid="new-project-hint"/);
    assert.match(html, /opacity:0\.4/);
    assert.match(html, /cursor:not-allowed/);
    assert.match(html, /pointer-events:none/);
    assert.match(html, /tabindex="-1"/);
    assert.equal(html.includes('role="group"'), false);
  });
});

describe('ProjectListLoadNotice', () => {
  it('gives both audiences Try again and a muted staff error line', () => {
    const staff = renderToStaticMarkup(
      createElement(ProjectListLoadNotice, { staff: true, message: 'Network error', onRetry: noop }),
    );
    assert.match(staff, /Couldn(?:'|&#x27;)t load projects/);
    assert.match(staff, /Try again/);
    assert.match(staff, /Network error/);
    assert.match(staff, /ds-mono/);
    assert.match(staff, /text-overflow:ellipsis/);
    assert.match(staff, /white-space:nowrap/);
    assert.equal(staff.includes('Retry now'), false);
    assert.equal(staff.includes('14:05'), false);
    const client = renderToStaticMarkup(
      createElement(ProjectListLoadNotice, { staff: false, message: 'ignored', onRetry: noop }),
    );
    assert.match(client, /We couldn(?:'|&#x27;)t load your projects/);
    assert.match(client, /Try again in a moment\./);
    assert.match(client, /Try again/);
    assert.equal(client.includes('Retry now'), false);
    assert.equal(client.includes('ds-mono'), false);
  });
});

describe('ProjectListSkeleton', () => {
  it('renders three rows and KPI skeletons pulse', () => {
    const html = renderToStaticMarkup(createElement(ProjectListSkeleton));
    assert.equal(html.match(/animate-pulse shrink-0/g)?.length, 6);
    const kpi = renderToStaticMarkup(createElement(ProjectKpiSkeleton));
    assert.match(kpi, /data-testid="project-kpi-skeleton"/);
    assert.match(kpi, /animate-pulse/);
  });
});

describe('ProjectListOutcome', () => {
  const base = {
    loading: false,
    staff: true,
    onCreate: noop,
    createEnabled: false,
  };

  it('renders rows, the empty card, or a filtered line with clear', () => {
    const list = renderToStaticMarkup(
      createElement(
        ProjectListOutcome,
        { ...base, viewerCount: 2, visibleCount: 2 },
        createElement('li', { 'data-testid': 'project-row' }, 'Northwind'),
      ),
    );
    assert.equal(list.includes('projects-load-error'), false);
    assert.match(list, /data-testid="project-row"/);
    assert.match(list, /Northwind/);

    const empty = renderToStaticMarkup(
      createElement(ProjectListOutcome, { ...base, viewerCount: 0, visibleCount: 0 }),
    );
    assert.equal(empty.includes('projects-load-error'), false);
    assert.match(empty, /data-testid="projects-empty"/);
    assert.match(empty, /No projects yet/);

    const filtered = renderToStaticMarkup(
      createElement(ProjectListOutcome, {
        ...base,
        staff: false,
        viewerCount: 4,
        visibleCount: 0,
        onClear: noop,
      }),
    );
    assert.equal(filtered.includes('projects-load-error'), false);
    assert.match(filtered, /No projects match these filters/);
    assert.match(filtered, /data-testid="clear-filters"/);
    assert.match(filtered, /Clear filters/);
  });
});

describe('ProjectListFilters', () => {
  it('hides chips and their counts while loading', () => {
    const loading = renderToStaticMarkup(
      createElement(ProjectListFilters, { loading: true, viewerCount: 4 }, 'All 5'),
    );
    assert.equal(loading, '');
    const ready = renderToStaticMarkup(
      createElement(ProjectListFilters, { loading: false, viewerCount: 4 }, 'All 5'),
    );
    assert.match(ready, /data-testid="project-filters"/);
    assert.match(ready, /All 5/);
    const empty = renderToStaticMarkup(
      createElement(ProjectListFilters, { loading: false, viewerCount: 0 }, 'All 0'),
    );
    assert.equal(empty, '');
  });
});

describe('ProjectListScreen', () => {
  const row = createElement('li', { 'data-testid': 'project-row' }, 'Northwind');
  const kpis = createElement('div', { 'data-testid': 'project-kpis' }, '0');

  it('replaces the KPIs and the list when nothing loaded', () => {
    const html = renderToStaticMarkup(
      createElement(
        ProjectListScreen,
        { staff: true, errorMode: 'empty', message: 'Network error', onRetry: noop },
        kpis,
        row,
      ),
    );
    assert.match(html, /data-testid="projects-load-error"/);
    assert.match(html, /Couldn(?:'|&#x27;)t load projects/);
    assert.match(html, /Network error/);
    assert.match(html, /Try again/);
    assert.equal(html.includes('project-kpis'), false);
    assert.equal(html.includes('project-row'), false);
    assert.equal(html.includes('No projects yet'), false);
  });

  it('puts the client line above a no-data banner', () => {
    const html = renderToStaticMarkup(
      createElement(
        ProjectListScreen,
        { staff: false, errorMode: 'empty', message: 'Network error', onRetry: noop },
        row,
      ),
    );
    const line = html.indexOf('projects-client-line');
    const notice = html.indexOf('projects-load-error');
    assert.ok(line >= 0 && line < notice);
    assert.match(html, /You only see what is shared with you\./);
    assert.match(html, /We couldn(?:'|&#x27;)t load your projects/);
    assert.equal(html.includes('project-row'), false);
  });

  it('keeps cached rows under a refresh banner', () => {
    const staff = renderToStaticMarkup(
      createElement(
        ProjectListScreen,
        { staff: true, errorMode: 'refresh', message: 'Network error', onRetry: noop },
        kpis,
        row,
      ),
    );
    assert.match(staff, /Couldn(?:'|&#x27;)t refresh projects/);
    assert.match(staff, /Network error/);
    assert.match(staff, /data-testid="project-row"/);
    assert.match(staff, /data-testid="project-kpis"/);

    const client = renderToStaticMarkup(
      createElement(
        ProjectListScreen,
        { staff: false, errorMode: 'refresh', message: 'Network error', onRetry: noop },
        row,
      ),
    );
    const line = client.indexOf('projects-client-line');
    const notice = client.indexOf('projects-load-error');
    assert.ok(line >= 0 && line < notice);
    assert.match(client, /We couldn(?:'|&#x27;)t refresh your projects/);
    assert.match(client, /Showing what was last loaded\./);
    assert.match(client, /data-testid="project-row"/);
    assert.equal(client.includes('ds-mono'), false);
  });
});
