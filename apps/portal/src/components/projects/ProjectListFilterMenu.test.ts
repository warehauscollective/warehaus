import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import { defaultProjectListView, type ProjectListView, type ProjectListViewOptions } from '@/lib/data/projectList';

Object.assign(globalThis, { React });
const { ProjectListAppliedFilters, ProjectListFilterMenu } = await import('./ProjectListFilterMenu');
const { ProjectListFilters } = await import('./ProjectListStates');

const noop = () => {};
const options: ProjectListViewOptions = {
  status: ['Inbox', 'Planned', 'In progress'],
  clients: [
    { id: 'c-harbor', name: 'Harbor & Pine' },
    { id: 'c-north', name: 'Northwind Foods' },
  ],
  stack: ['Next.js'],
};

function setView(): ProjectListView {
  return { ...defaultProjectListView(), clientIds: ['c-north'], publish: 'published', updated: '30d' };
}

function menu(props: Record<string, unknown>) {
  return renderToStaticMarkup(
    createElement(ProjectListFilterMenu, {
      view: defaultProjectListView(),
      options,
      staff: true,
      onChange: noop,
      onClear: noop,
      ...props,
    }),
  );
}

describe('ProjectListFilterMenu', () => {
  it('shows closed controls with the current sort and no count when nothing is set', () => {
    const html = menu({});
    assert.match(html, /data-testid="project-filters-trigger"[^>]*aria-haspopup="dialog"[^>]*aria-expanded="false"/);
    assert.match(html, />Filters</);
    assert.match(html, />Sort</);
    assert.match(html, /Last updated · Newest first/);
    assert.equal(html.includes('project-filters-count'), false);
    assert.equal(html.includes('role="dialog"'), false);
  });

  it('counts filters, not values', () => {
    const view = { ...setView(), status: ['Inbox', 'Planned'] };
    const html = menu({ view });
    assert.match(html, /data-testid="project-filters-count"[^>]*>.*?<\/span>4<\/span>/);
  });

  it('opens the staff filter menu with every filter, summaries and the note', () => {
    const html = menu({ view: setView(), initialOpen: 'filters', initialExpanded: ['client', 'updated'] });
    assert.match(html, /role="dialog" aria-label="Filters"/);
    assert.match(html, /data-testid="project-filters-trigger"[^>]*aria-expanded="true"/);
    for (const label of ['Status', 'Client', 'Publish state', 'Stack', 'Start date', 'End date', 'Progress', 'Tasks', 'Last updated']) {
      assert.match(html, new RegExp(`>${label}<`));
    }
    assert.match(html, /Filters apply as you pick\. Saved to your account\./);
    assert.match(html, /data-testid="clear-filters-menu"[^>]*>Clear filters</);
    assert.match(html, /role="checkbox" aria-checked="true"[^>]*>.*?Northwind Foods/);
    assert.match(html, /role="checkbox" aria-checked="false"[^>]*>.*?Harbor &amp; Pine/);
    for (const label of ['Any time', 'Last 7 days', 'Last 30 days', 'Last 90 days']) {
      assert.match(html, new RegExp(`role="radio"[^>]*>.*?${label}`));
    }
    assert.match(html, /data-testid="project-filter-summary"[^>]*>Published</);
  });

  it('draws the date range with FROM, TO and Any date', () => {
    const html = menu({ initialOpen: 'filters', initialExpanded: ['startDate'] });
    assert.match(html, />FROM</);
    assert.match(html, />TO</);
    assert.match(html, />Any date</);
    assert.match(html, /type="date"[^>]*aria-label="Start date from"/);
    assert.equal(html.includes('clear-filters-menu'), false);
  });

  it('gives a client no client filter, publish filter or Client sort', () => {
    const filters = menu({ staff: false, initialOpen: 'filters' });
    assert.equal(filters.includes('>Client<'), false);
    assert.equal(filters.includes('Publish state'), false);
    assert.match(filters, />Status</);
    const sort = menu({ staff: false, initialOpen: 'sort' });
    assert.match(sort, /role="dialog" aria-label="Sort"/);
    assert.equal(sort.includes('>Client<'), false);
    assert.match(sort, />Name</);
  });

  it('opens the sort menu with the fields, the two directions and the note', () => {
    const html = menu({ initialOpen: 'sort' });
    assert.match(html, />Sort by</);
    assert.match(html, />DIRECTION</);
    assert.match(html, /Saved to your account\./);
    for (const label of ['Last updated', 'Name', 'Client', 'Status', 'Start date', 'End date', 'Progress', 'Tasks']) {
      assert.match(html, new RegExp(`role="radio"[^>]*>.*?${label}`));
    }
    assert.match(html, /role="radio" aria-checked="true"[^>]*>.*?Newest first/);
    assert.match(html, /role="radio" aria-checked="false"[^>]*>.*?Oldest first/);
    const byName = menu({ initialOpen: 'sort', view: { ...defaultProjectListView(), sort: { key: 'name', direction: 'desc' } } });
    assert.match(byName, /Name · Z to A/);
    assert.match(byName, /role="radio" aria-checked="true"[^>]*>.*?Z to A/);
  });
});

describe('ProjectListAppliedFilters', () => {
  it('renders nothing for an unfiltered list', () => {
    const html = renderToStaticMarkup(
      createElement(ProjectListAppliedFilters, {
        view: defaultProjectListView(),
        options,
        staff: true,
        onChange: noop,
        onClear: noop,
      }),
    );
    assert.equal(html, '');
  });

  it('shows one chip per value with a labelled remove, then Clear filters', () => {
    const html = renderToStaticMarkup(
      createElement(ProjectListAppliedFilters, { view: setView(), options, staff: true, onChange: noop, onClear: noop }),
    );
    assert.equal(html.match(/data-testid="project-filter-value"/g)?.length, 3);
    assert.match(html, />Client:<.*>Northwind Foods</);
    assert.match(html, />Publish state:<.*>Published</);
    assert.match(html, />Last updated:<.*>Last 30 days</);
    assert.match(html, /aria-label="Remove Client: Northwind Foods"/);
    assert.match(html, />Clear filters</);
  });

  it('offers Clear filters when only the quick filter is set', () => {
    const html = renderToStaticMarkup(
      createElement(ProjectListAppliedFilters, {
        view: { ...defaultProjectListView(), quick: 'active' },
        options,
        staff: true,
        onChange: noop,
        onClear: noop,
      }),
    );
    assert.equal(html.includes('project-filter-value'), false);
    assert.match(html, />Clear filters</);
  });
});

describe('ProjectListFilters with the menu', () => {
  const menuProps = { view: setView(), options, staff: true, onChange: noop, onClear: noop };

  it('puts the controls beside the chips and the set values under them', () => {
    const html = renderToStaticMarkup(
      createElement(ProjectListFilters, { loading: false, viewerCount: 4, menu: menuProps }, 'All 5'),
    );
    assert.match(html, /data-testid="project-list-toolbar"/);
    assert.match(html, /data-testid="project-filters"/);
    assert.match(html, /data-testid="project-list-controls"/);
    assert.match(html, /data-testid="project-applied-filters"/);
  });

  it('hides the controls while loading and when the viewer has no projects', () => {
    assert.equal(
      renderToStaticMarkup(createElement(ProjectListFilters, { loading: true, viewerCount: 4, menu: menuProps }, 'All 5')),
      '',
    );
    assert.equal(
      renderToStaticMarkup(createElement(ProjectListFilters, { loading: false, viewerCount: 0, menu: menuProps }, 'All 0')),
      '',
    );
  });
});
