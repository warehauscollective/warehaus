import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import {
  TEAM_ERROR_COPY,
  TEAM_STAFF_EMPTY,
  TeamEmpty,
  TeamOutlineButton,
  TeamPersonIdentity,
  TeamSkeletonRows,
  TeamStateNotice,
  teamView,
} from './teamStates';

Object.assign(globalThis, { React });

describe('account team states', () => {
  it('derives empty, loading, and error from the roster and lets a fixture screen win', () => {
    assert.equal(teamView({ screen: 'ready', fixtures: false, loading: true, missing: false, failed: false, count: -1 }), 'loading');
    assert.equal(teamView({ screen: 'ready', fixtures: false, loading: false, missing: false, failed: true, count: -1 }), 'error');
    assert.equal(teamView({ screen: 'ready', fixtures: false, loading: false, missing: true, failed: true, count: -1 }), 'ready');
    assert.equal(teamView({ screen: 'ready', fixtures: false, loading: false, missing: false, failed: false, count: 0 }), 'empty');
    assert.equal(teamView({ screen: 'ready', fixtures: true, loading: false, missing: false, failed: false, count: 2 }), 'ready');
    assert.equal(teamView({ screen: 'long', fixtures: true, loading: false, missing: false, failed: false, count: 2 }), 'long');
    assert.equal(teamView({ screen: 'empty', fixtures: true, loading: true, missing: false, failed: false, count: 2 }), 'empty');
  });

  it('renders the staff empty card, skeletons, error notice, and a wrapping person row', () => {
    const empty = renderToStaticMarkup(
      createElement(TeamEmpty, {
        title: TEAM_STAFF_EMPTY.title,
        body: TEAM_STAFF_EMPTY.body,
        action: createElement(TeamOutlineButton, { testId: 'team-invite-someone', children: 'Invite someone' }),
      }),
    );
    assert.match(empty, /No pending invites/);
    assert.match(empty, /Invites you send to client contacts will show here/);
    assert.match(empty, /src="\/icons\/team-empty.svg"/);
    assert.match(empty, /width="28"/);
    assert.match(empty, /height="28"/);
    assert.match(empty, /type="button"[^>]*data-testid="team-invite-someone"/);
    assert.equal(empty.includes('type="submit"'), false);

    const loading = renderToStaticMarkup(createElement(TeamSkeletonRows, null));
    assert.equal(loading.match(/data-testid="team-skeleton-row"/g)?.length, 3);
    assert.match(loading, /width:36px/);
    assert.match(loading, /border-radius:18px/);
    assert.match(loading, /width:64px/);

    const error = renderToStaticMarkup(
      createElement(TeamStateNotice, { title: TEAM_ERROR_COPY.title, body: TEAM_ERROR_COPY.body }),
    );
    assert.match(error, /Could not save your settings/);
    assert.match(error, /Check your connection and try again/);
    assert.equal(error.includes('Try again'), false);

    const row = renderToStaticMarkup(
      createElement(TeamPersonIdentity, {
        name: 'Alexandria Montgomery-Featherstonehaugh',
        email: 'alexandria.montgomery-featherstonehaugh@northwind.example',
        role: 'Client Member',
        status: 'Active',
      }),
    );
    assert.match(row, /overflow-wrap:anywhere/);
    assert.match(row, /Alexandria Montgomery-Featherstonehaugh/);
    assert.match(row, /alexandria\.montgomery-featherstonehaugh@northwind\.example · Client Member/);
    assert.match(row, />AM</);
    assert.match(row, />Active</);
  });
});
