import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';

Object.assign(globalThis, { React });
const { ProjectListEmptyState, ProjectListLoadNotice, ProjectListSkeleton } = await import('./ProjectListStates');

describe('ProjectListEmptyState', () => {
  it('shows the staff dashed card and New project', () => {
    const html = renderToStaticMarkup(createElement(ProjectListEmptyState, { viewerCount: 0, staff: true, onCreate: () => {} }));
    assert.match(html, /No projects yet/);
    assert.match(html, /Create a project under a client, or under Warehaus for internal work\./);
    assert.match(html, /New project/);
    assert.match(html, /task-layers\.svg/);
  });

  it('hides New project from the client empty card', () => {
    const html = renderToStaticMarkup(createElement(ProjectListEmptyState, { viewerCount: 0, staff: false, onCreate: () => {} }));
    assert.match(html, /No projects shared with you yet/);
    assert.match(html, /Warehaus will publish projects here when they are ready\./);
    assert.equal(html.includes('New project'), false);
  });

  it('keeps a filtered list as one line', () => {
    const html = renderToStaticMarkup(createElement(ProjectListEmptyState, { viewerCount: 4, staff: true, onCreate: () => {} }));
    assert.match(html, /No projects match these filters\./);
    assert.equal(html.includes('New project'), false);
  });
});

describe('ProjectListLoadNotice', () => {
  it('gives staff Retry now and leaves the client notice without it', () => {
    const staff = renderToStaticMarkup(createElement(ProjectListLoadNotice, { staff: true, message: 'Network error' }));
    assert.match(staff, /Could not load projects/);
    assert.match(staff, /Retry now/);
    assert.equal(staff.includes('14:05'), false);
    const client = renderToStaticMarkup(createElement(ProjectListLoadNotice, { staff: false, message: 'ignored' }));
    assert.match(client, /We could not load your projects/);
    assert.match(client, /Try again in a moment\./);
    assert.equal(client.includes('Retry now'), false);
  });
});

describe('ProjectListSkeleton', () => {
  it('renders three rows', () => {
    const html = renderToStaticMarkup(createElement(ProjectListSkeleton));
    assert.equal(html.match(/animate-pulse shrink-0/g)?.length, 6);
  });
});
