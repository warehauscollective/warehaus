import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import {
  TEAM_ERROR_COPY,
  TEAM_SEND_HINT,
  TEAM_STAFF_EMPTY,
  TEAM_STALE_COPY,
  TeamEmpty,
  TeamPersonIdentity,
  TeamSkeletonRows,
  TeamStateNotice,
  clientTeamEmptyBody,
  readTeamScreen,
  teamView,
} from './teamStates';

Object.assign(globalThis, { React });

const base = { screen: 'ready' as const, fixtures: false, loading: false, missing: false, failed: false, hasCache: false, count: 0 };

describe('account team states', () => {
  it('derives empty, loading, error, and a cached roster from the live query', () => {
    assert.equal(teamView({ ...base, loading: true, count: -1 }), 'loading');
    assert.equal(teamView({ ...base, failed: true, count: -1 }), 'error');
    assert.equal(teamView({ ...base, missing: true, failed: true, count: -1 }), 'ready');
    assert.equal(teamView({ ...base, count: 0 }), 'empty');
    assert.equal(teamView({ ...base, fixtures: true, count: 2 }), 'ready');
    assert.equal(teamView({ ...base, screen: 'long', fixtures: true, count: 2 }), 'long');
    assert.equal(teamView({ ...base, screen: 'empty', fixtures: true, loading: true, count: 2 }), 'empty');
    assert.equal(teamView({ ...base, failed: true, hasCache: true, count: 2 }), 'stale');
    assert.equal(teamView({ ...base, loading: true, hasCache: true, count: 2 }), 'ready');
  });

  it('a live session ignores ?teamState', () => {
    assert.equal(readTeamScreen('long', false), 'ready');
    assert.equal(readTeamScreen('error', false), 'ready');
    assert.equal(readTeamScreen('empty', false), 'ready');
    assert.equal(readTeamScreen('loading', false), 'ready');
    assert.equal(readTeamScreen('long', true), 'long');
    assert.equal(readTeamScreen('nope', true), 'ready');
    assert.equal(teamView({ ...base, screen: 'long', fixtures: false, count: 2 }), 'ready');
    assert.equal(teamView({ ...base, screen: 'error', fixtures: false, count: 2 }), 'ready');
    const account = readFileSync(new URL('../pages/AccountContent.tsx', import.meta.url), 'utf8');
    const invites = readFileSync(new URL('../pages/TeamInvites.tsx', import.meta.url), 'utf8');
    assert.match(account, /readTeamScreen\(params\.get\('teamState'\), true\)/);
    assert.match(account, /if \(!fixtures\) return;/);
    assert.match(account, /fixtures && teamPreview === 'long'/);
    assert.equal(invites.includes('useMutation'), false);
    assert.equal(invites.includes('getElementById'), false);
    assert.equal(invites.includes('Invite someone'), false);
    assert.match(invites, /TEAM_SEND_HINT/);
    assert.match(invites, /TEAM_REMOVE_HINT/);
    assert.match(invites, /TEAM_REVOKE_HINT/);
  });

  it('renders the staff empty card, skeletons, error notice, and a person row', () => {
    const empty = renderToStaticMarkup(
      createElement(TeamEmpty, {
        title: TEAM_STAFF_EMPTY.title,
        body: TEAM_STAFF_EMPTY.body,
      }),
    );
    assert.match(empty, /No pending invites/);
    assert.match(empty, /Invites you send to client contacts will show here/);
    assert.match(empty, /src="\/icons\/team-empty.svg"/);
    assert.match(empty, /width="28"/);
    assert.match(empty, /height="28"/);
    assert.equal(empty.includes('Invite someone'), false);
    assert.equal(empty.includes('team-invite-someone'), false);

    const loading = renderToStaticMarkup(createElement(TeamSkeletonRows, null));
    assert.equal(loading.match(/data-testid="team-skeleton-row"/g)?.length, 3);
    assert.match(loading, /role="status"/);
    assert.match(loading, /Loading team/);
    assert.equal(loading.includes('aria-busy'), false);
    assert.equal(loading.includes('aria-hidden'), false);
    assert.match(loading, /width:32px/);
    assert.match(loading, /border-radius:999px/);
    assert.match(loading, /width:64px/);

    const error = renderToStaticMarkup(
      createElement(TeamStateNotice, {
        title: TEAM_ERROR_COPY.title,
        body: TEAM_ERROR_COPY.body,
        action: createElement('button', { type: 'button', 'data-testid': 'team-try-again' }, 'Try again'),
      }),
    );
    assert.match(error, /We couldn(?:'|&#x27;)t load your team/);
    assert.match(error, /Try again in a moment/);
    assert.match(error, /data-testid="team-try-again"/);
    assert.match(error, /Try again/);
    assert.match(TEAM_STALE_COPY.title, /Team list is out of date/);
    assert.equal(clientTeamEmptyBody('Client Admin'), 'Teammates you invite will show here.');
    assert.equal(clientTeamEmptyBody('Client Member'), 'Your Client Admin can invite teammates.');
    assert.equal(clientTeamEmptyBody(null), 'Your Client Admin can invite teammates.');
    assert.match(TEAM_SEND_HINT, /Invites are coming soon/);

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
    assert.match(row, /alexandria\.montgomery-featherstonehaugh@northwind\.example/);
    assert.equal(row.includes('· Client Member'), false);
    assert.match(row, /data-testid="team-person-role"[^>]*>Client Member</);
    assert.match(row, /width:140px/);
    assert.match(row, /text-align:left/);
    assert.match(row, />AM</);
    assert.match(row, />Active</);

    const pending = renderToStaticMarkup(
      createElement(TeamPersonIdentity, {
        name: 'Sam North',
        email: 'sam@northwind.example',
        role: 'Client Member',
        status: 'Invite pending',
        pending: true,
      }),
    );
    assert.match(pending, /color:var\(--warning\)/);
    assert.match(pending, /Invite pending/);
  });
});
