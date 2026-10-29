'use client';

import { useEffect, useState } from 'react';
import { api } from '@convex/_generated/api';
import { PortalRadio, Surface } from '@/components/ui/primitives';
import { PortalTilePane } from '@/components/layout/PortalWorkspace';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { isMissingConvexFunction } from '@/lib/data/staffRoster';
import {
  LONG_TEAM_EMAIL,
  LONG_TEAM_NAME,
  LONG_TEAM_ROLE,
  TEAM_CARD_CSS,
  TEAM_ERROR_COPY,
  TEAM_REMOVE_HINT,
  TEAM_RESEND_HINT,
  TEAM_REVOKE_HINT,
  TEAM_SEND_HINT,
  TEAM_STAFF_EMPTY,
  TEAM_STALE_COPY,
  TeamDisabledAction,
  TeamEmpty,
  TeamOutlineButton,
  TeamPersonIdentity,
  TeamSkeletonRows,
  TeamStateNotice,
  teamInviteStatus,
  teamMemberStatus,
  teamView,
} from '@/components/account/teamStates';
import type { TeamScreen } from '@/components/account/teamStates';

type TeamRow = {
  canInvite: boolean;
  members: Array<{
    notionPageId: string;
    name: string;
    email: string;
    role: string;
    portalAccess: string;
  }>;
  invites: Array<{
    notionPageId: string;
    name: string;
    email: string;
    role: string;
    inviteStatus: string;
  }>;
};

export type InviteDraft = { name: string; email: string };

const FIXTURE_TEAM: TeamRow = {
  canInvite: true,
  members: [
    {
      notionPageId: 'ct-ada',
      name: 'Ada North',
      email: 'ada@northwind.example',
      role: 'Client Admin',
      portalAccess: 'Enabled',
    },
  ],
  invites: [
    {
      notionPageId: 'ct-sam',
      name: 'Sam North',
      email: 'sam@northwind.example',
      role: 'Client Member',
      inviteStatus: 'Pending',
    },
  ],
};

function withLongMember(roster: TeamRow): TeamRow {
  const [first, ...rest] = roster.members;
  if (!first) return roster;
  return {
    ...roster,
    members: [
      {
        ...first,
        name: LONG_TEAM_NAME,
        email: LONG_TEAM_EMAIL,
        role: LONG_TEAM_ROLE,
        portalAccess: 'Active',
      },
      ...rest,
    ],
  };
}

export function TeamInvites({
  hostSlug,
  configured,
  fixtures = false,
  screen = 'ready',
  draft,
  onDraftChange,
  onRetry,
}: {
  hostSlug?: string;
  configured: boolean;
  fixtures?: boolean;
  screen?: TeamScreen;
  draft: InviteDraft;
  onDraftChange: (draft: InviteDraft) => void;
  onRetry?: () => void;
}) {
  const team = useSafeQuery<TeamRow>(api.invites.listTeam, configured ? { hostSlug } : 'skip');
  const [cached, setCached] = useState<TeamRow | null>(null);
  useEffect(() => {
    if (team.data) setCached(team.data);
  }, [team.data]);
  const missing = isMissingConvexFunction(team.error);
  const failed = Boolean(team.error) && !team.data;
  const roster = fixtures ? FIXTURE_TEAM : team.data ?? (failed ? cached : null);
  const count = (roster?.members.length ?? 0) + (roster?.invites.length ?? 0);
  const view = teamView({
    screen,
    fixtures,
    loading: team.loading,
    missing,
    failed,
    hasCache: Boolean(cached),
    count: roster ? count : -1,
  });
  const shown = roster && view === 'long' && fixtures ? withLongMember(roster) : roster;
  const showPeople =
    view === 'loading' ||
    view === 'empty' ||
    view === 'stale' ||
    ((view === 'ready' || view === 'long') && Boolean(shown));

  return (
    <PortalTilePane>
      <style>{TEAM_CARD_CSS}</style>
      <div className="flex h-full min-h-0 flex-col gap-8 overflow-auto" data-testid="team-invites" data-state={view}>
        {fixtures ? null : missing && (
          <Surface style={{ padding: 'var(--s-5)' }}>
            <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
              Team & invites
            </p>
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 8 }}>
              Invites stay on this screen. The Convex functions for this batch were not pushed, so
              this deployment cannot list or send them yet.
            </p>
          </Surface>
        )}
        <section className="team-card" data-testid="team-invite-card">
          <header>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, lineHeight: '26px', fontWeight: 700, margin: 0 }}>
              Invite a teammate
            </h2>
            <p style={{ fontSize: 15, lineHeight: '19px', color: 'var(--muted)', margin: '4px 0 0' }}>
              Name and email for a Client Member.
            </p>
          </header>
          <form
            className="mt-6 flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
            }}
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span style={{ fontSize: 14, color: 'var(--muted)' }}>Name</span>
                <input
                  id="team-invite-name"
                  value={draft.name}
                  onChange={(event) => onDraftChange({ ...draft, name: event.target.value })}
                  style={fieldStyle}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span style={{ fontSize: 14, color: 'var(--muted)' }}>Email</span>
                <input
                  type="email"
                  value={draft.email}
                  onChange={(event) => onDraftChange({ ...draft, email: event.target.value })}
                  style={fieldStyle}
                />
              </label>
            </div>
            <fieldset className="flex flex-col gap-2" style={{ border: 0, margin: 0, padding: 0 }}>
              <legend style={{ fontSize: 14, color: 'var(--muted)' }}>Role</legend>
              <label className="flex items-center gap-2" style={{ fontSize: 14 }}>
                <PortalRadio name="role" checked /> Client Member
              </label>
              <label className="flex items-start gap-2" style={{ fontSize: 14, color: 'var(--muted)' }}>
                <PortalRadio name="role" disabled />
                <span>
                  Client Admin
                  <span style={{ display: 'block', fontSize: 13 }}>Only Warehaus can add admins for now</span>
                </span>
              </label>
            </fieldset>
            <div className="flex flex-col items-start gap-2">
              <TeamDisabledAction label="Send invite" hint={TEAM_SEND_HINT} testId="team-send-invite" hintId="team-invite-hint" />
              <p id="team-invite-hint" data-testid="team-invite-hint" style={{ margin: 0, fontSize: 13, lineHeight: '19px', color: 'var(--muted)' }}>
                {TEAM_SEND_HINT}
              </p>
            </div>
          </form>
        </section>
        {view === 'error' && (
          <TeamStateNotice
            title={TEAM_ERROR_COPY.title}
            body={TEAM_ERROR_COPY.body}
            action={
              <TeamOutlineButton testId="team-try-again" onClick={onRetry}>
                Try again
              </TeamOutlineButton>
            }
          />
        )}
        {showPeople && (
          <section className="team-card" data-testid="team-people">
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, lineHeight: '26px', fontWeight: 700, margin: 0 }}>
              People
            </h2>
            <p style={{ fontSize: 15, lineHeight: '19px', color: 'var(--muted)', margin: '4px 0 16px' }}>
              People with portal access.
            </p>
            {view === 'loading' ? <TeamSkeletonRows /> : null}
            {view === 'empty' ? <TeamEmpty title={TEAM_STAFF_EMPTY.title} body={TEAM_STAFF_EMPTY.body} /> : null}
            {view === 'stale' ? (
              <div className="mb-4">
                <TeamStateNotice
                  title={TEAM_STALE_COPY.title}
                  body={TEAM_STALE_COPY.body}
                  action={
                    <TeamOutlineButton testId="team-try-again" onClick={onRetry}>
                      Try again
                    </TeamOutlineButton>
                  }
                />
              </div>
            ) : null}
            {shown && (view === 'ready' || view === 'long' || view === 'stale') ? (
              <div>
                {shown.members.map((member, index) => {
                  const status = teamMemberStatus(member.portalAccess);
                  return (
                    <TeamPersonIdentity
                      key={member.notionPageId}
                      index={index}
                      name={member.name}
                      email={member.email}
                      role={member.role}
                      status={status.label}
                      pending={status.pending}
                      actions={
                        <TeamDisabledAction
                          label="Remove"
                          hint={TEAM_REMOVE_HINT}
                          testId={`team-remove-${member.notionPageId}`}
                        />
                      }
                    />
                  );
                })}
                {shown.invites.map((invite, index) => {
                  const status = teamInviteStatus(invite.inviteStatus);
                  return (
                    <TeamPersonIdentity
                      key={invite.notionPageId}
                      index={shown.members.length + index}
                      name={invite.name}
                      email={invite.email}
                      role={invite.role}
                      status={status.label}
                      pending={status.pending}
                      actions={
                        <>
                          <TeamDisabledAction
                            label="Resend"
                            hint={TEAM_RESEND_HINT}
                            testId={`team-resend-${invite.notionPageId}`}
                          />
                          <TeamDisabledAction
                            label="Revoke"
                            hint={TEAM_REVOKE_HINT}
                            testId={`team-revoke-${invite.notionPageId}`}
                          />
                        </>
                      }
                    />
                  );
                })}
              </div>
            ) : null}
          </section>
        )}
      </div>
    </PortalTilePane>
  );
}

const fieldStyle = {
  background: 'transparent',
  color: 'var(--foreground)',
  border: '1px solid var(--border)',
  borderRadius: 9,
  padding: '12px 14px',
  fontSize: 14,
  width: '100%',
  boxSizing: 'border-box' as const,
};
