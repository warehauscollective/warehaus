import { useEffect, useId, useState, type ReactNode } from 'react';
import { clientInitials } from '@/lib/data/clientList';

/** Fixture long-text row from Account / States (297:18927). Not a schema field. */
export const LONG_TEAM_NAME = 'Alexandria Montgomery-Featherstonehaugh';
export const LONG_TEAM_EMAIL = 'alexandria.montgomery-featherstonehaugh@northwind.example';
export const LONG_TEAM_ROLE = 'Client Member';

export const TEAM_STAFF_EMPTY = {
  title: 'No people yet',
  body: 'People you invite will show here.',
} as const;

export const TEAM_CLIENT_EMPTY = {
  title: 'No teammates yet',
  admin: 'Teammates you invite will show here.',
  member: 'Your Client Admin can invite teammates.',
} as const;

/** No-data load failure. A cached roster uses TEAM_STALE_COPY instead. */
export const TEAM_ERROR_COPY = {
  title: "We couldn't load your team",
  body: 'Try again in a moment.',
} as const;

export const TEAM_STALE_COPY = {
  title: 'Team list is out of date',
  body: 'Showing the last team we could load.',
} as const;

/** INVITE_EMAIL_ENABLED is off. These controls do not call a mutation. */
export const TEAM_SEND_HINT = 'Invites are coming soon. Ask Warehaus to add someone for now.';
export const TEAM_RESEND_HINT = 'Resending an invite is coming soon. Ask Warehaus to add someone for now.';
export const TEAM_REMOVE_HINT = 'Removing someone turns on with Notion write-back.';
export const TEAM_REVOKE_HINT = 'Revoking an invite turns on with Notion write-back.';

export type TeamScreen = 'ready' | 'empty' | 'loading' | 'error' | 'long' | 'stale';

const FIXTURE_TEAM_SCREENS = ['empty', 'loading', 'error', 'long'] as const;

/**
 * Fixture preview only. A live session always stays on the real roster,
 * even when the URL says `?teamState=`.
 */
export function readTeamScreen(value: string | null, fixtures: boolean): TeamScreen {
  if (!fixtures || !value) return 'ready';
  return (FIXTURE_TEAM_SCREENS as readonly string[]).includes(value) ? (value as TeamScreen) : 'ready';
}

/**
 * Fixture preview reads `?teamState`. A live session leaves the screen at
 * ready so the roster query is what renders.
 */
export function useTeamScreen(fixtures: boolean): [TeamScreen, (screen: TeamScreen) => void] {
  const [screen, setScreen] = useState<TeamScreen>('ready');
  useEffect(() => {
    if (!fixtures) return;
    const params = new URLSearchParams(window.location.search);
    setScreen(readTeamScreen(params.get('teamState'), true));
  }, [fixtures]);
  return [screen, setScreen];
}

/** Empty and error screens replace the roster. Every other screen keeps it. */
export function peopleForTeamScreen<T>(screen: TeamScreen, people: T[]): T[] {
  if (screen === 'empty' || screen === 'error') return [];
  return people;
}

/** Empty line depends on the viewer, not on who is already in the list. */
export function clientTeamEmptyBody(role?: string | null): string {
  return role === 'Client Admin' ? TEAM_CLIENT_EMPTY.admin : TEAM_CLIENT_EMPTY.member;
}

export function teamMemberStatus(portalAccess: string): { label: string; pending: boolean } {
  if (portalAccess === 'Enabled' || portalAccess === 'Active') return { label: 'Active', pending: false };
  return { label: 'No portal access', pending: false };
}

export function teamInviteStatus(inviteStatus: string): { label: string; pending: boolean } {
  if (/pending/i.test(inviteStatus)) return { label: 'Invite pending', pending: true };
  return { label: inviteStatus, pending: false };
}

/**
 * Fixture `screen` wins only while fixtures are on.
 * Live empty, loading, no-data errors, and cached failures come from the roster.
 */
export function teamView(input: {
  screen: TeamScreen;
  fixtures: boolean;
  loading: boolean;
  missing: boolean;
  failed: boolean;
  hasCache: boolean;
  count: number;
}): TeamScreen {
  if (input.fixtures && input.screen !== 'ready') return input.screen;
  if (!input.fixtures && input.loading && !input.hasCache) return 'loading';
  if (!input.fixtures && !input.missing && input.failed && input.hasCache) return 'stale';
  if (!input.fixtures && !input.missing && input.failed) return 'error';
  if (input.count === 0 && (input.fixtures || !input.loading)) return 'empty';
  return 'ready';
}

/** Local to the team cards. Does not change portal chrome or shared scroll. */
export const TEAM_CARD_CSS = `
.team-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 36px;
  padding: 25px;
  width: 100%;
  box-sizing: border-box;
}
.team-disabled-action:focus-visible {
  outline: 2px solid var(--fg);
  outline-offset: 3px;
}
@media (min-width: 768px) {
  .team-card { padding: 48px; }
}
`;

export function TeamEmpty({
  title,
  body,
  testId = 'team-empty',
}: {
  title: string;
  body: string;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="flex flex-col items-center text-center"
      style={{
        gap: 12,
        border: '1px dashed var(--border)',
        borderRadius: 18,
        background: 'var(--bg-2, var(--bg))',
        padding: '48px 24px',
      }}
    >
      {/* Asset root is 28×28. Do not stretch it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" src="/icons/team-empty.svg" width={28} height={28} />
      <p style={{ margin: 0, fontSize: 16, fontWeight: 500, lineHeight: '19px' }}>{title}</p>
      <p
        style={{
          margin: 0,
          maxWidth: 384,
          fontSize: 13,
          lineHeight: '19px',
          color: 'var(--muted)',
          textWrap: 'balance',
        }}
      >
        {body}
      </p>
    </div>
  );
}

export function TeamSkeletonRows({ testId = 'team-loading' }: { testId?: string }) {
  return (
    <div data-testid={testId} role="status" className="flex flex-col" style={{ gap: 24 }}>
      <span className="sr-only">Loading team</span>
      {[0, 1, 2].map((row) => (
        <div key={row} data-testid="team-skeleton-row" className="flex items-center" style={{ gap: 16 }}>
          <span
            className="animate-pulse shrink-0"
            style={{ width: 32, height: 32, borderRadius: 999, background: 'var(--surface-2)' }}
          />
          <span className="flex min-w-0 flex-1 flex-col" style={{ gap: 8 }}>
            <span
              className="animate-pulse"
              style={{ height: 12, width: '100%', borderRadius: 999, background: 'var(--surface-2)' }}
            />
            <span
              className="animate-pulse"
              style={{ height: 10, width: 160, borderRadius: 999, background: 'var(--surface-2)' }}
            />
          </span>
          <span
            className="animate-pulse shrink-0"
            style={{ width: 64, height: 22, borderRadius: 999, background: 'var(--surface-2)' }}
          />
        </div>
      ))}
    </div>
  );
}

export function TeamStateNotice({
  title,
  body,
  testId = 'team-state-notice',
  action,
}: {
  title: string;
  body: string;
  testId?: string;
  action?: ReactNode;
}) {
  return (
    <div
      role="alert"
      data-testid={testId}
      className="flex w-full flex-col"
      style={{
        gap: 16,
        border: '1px solid var(--danger)',
        borderRadius: 18,
        background: 'var(--surface)',
        padding: '16px 24px',
        boxSizing: 'border-box',
      }}
    >
      <div className="flex items-start" style={{ gap: 12 }}>
        <span
          aria-hidden
          className="inline-flex shrink-0 items-center justify-center"
          style={{
            width: 20,
            height: 20,
            borderRadius: 999,
            border: '1.25px solid var(--danger)',
            color: 'var(--danger)',
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          !
        </span>
        <span className="min-w-0 flex-1">
          <p style={{ margin: 0, color: 'var(--danger)', fontWeight: 600, fontSize: 14, lineHeight: '20px' }}>{title}</p>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13, lineHeight: '19px' }}>{body}</p>
        </span>
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export function TeamOutlineButton({
  children,
  onClick,
  testId,
}: {
  children: ReactNode;
  onClick?: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="inline-flex items-center justify-center"
      style={{
        background: 'transparent',
        color: 'var(--fg)',
        border: '1px solid var(--border-2, var(--border))',
        borderRadius: 9,
        fontSize: 14,
        fontWeight: 500,
        lineHeight: '18px',
        padding: '12px 16px',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

/** Outline control kept on screen while email or write-back is off. No role=group. */
export function TeamDisabledAction({
  label,
  hint,
  testId,
  hintId,
}: {
  label: string;
  hint: string;
  testId: string;
  /** When set, the visible hint elsewhere owns this id. */
  hintId?: string;
}) {
  const generated = useId();
  const describedBy = hintId ?? generated;
  return (
    <span
      tabIndex={0}
      aria-disabled="true"
      aria-describedby={describedBy}
      title={hint}
      data-testid={`${testId}-wrap`}
      className="team-disabled-action inline-flex"
      style={{ cursor: 'not-allowed' }}
    >
      <button
        type="button"
        disabled
        aria-disabled="true"
        tabIndex={-1}
        data-testid={testId}
        style={{
          pointerEvents: 'none',
          background: 'transparent',
          color: 'var(--fg)',
          border: '1px solid var(--border-2, var(--border))',
          borderRadius: 9,
          fontSize: 14,
          fontWeight: 500,
          padding: '12px 16px',
          cursor: 'not-allowed',
          opacity: 0.4,
        }}
      >
        {label}
      </button>
      {hintId ? null : (
        <span id={describedBy} className="sr-only">
          {hint}
        </span>
      )}
    </span>
  );
}

export function TeamPersonIdentity({
  name,
  email,
  role,
  status,
  pending = false,
  actions,
  index = 0,
}: {
  name: string;
  email: string;
  role: string;
  status: string;
  pending?: boolean;
  actions?: ReactNode;
  index?: number;
}) {
  const statusColor = pending ? 'var(--warning)' : 'var(--muted)';
  return (
    <div
      data-testid="team-person-row"
      className="flex flex-wrap items-center lg:flex-nowrap"
      style={{
        gap: 12,
        borderTop: index === 0 ? 'none' : '1px solid var(--border)',
        padding: '16px 0',
      }}
    >
      <span className="flex min-w-0 items-center" style={{ flex: '1 1 180px', gap: 12 }}>
        <span
          className="ds-mono inline-flex shrink-0 items-center justify-center"
          data-testid="team-person-avatar"
          style={{
            width: 32,
            height: 32,
            borderRadius: 999,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            fontSize: 11,
            color: 'var(--muted)',
          }}
        >
          {clientInitials(name)}
        </span>
        <span className="min-w-0">
          <span data-testid="team-person-name" className="block" style={{ fontSize: 16, fontWeight: 500, overflowWrap: 'anywhere' }}>
            {name}
          </span>
          {email ? (
            <span className="ds-mono block" style={{ fontSize: 12, lineHeight: '18px', color: 'var(--muted)', overflowWrap: 'anywhere' }}>
              {email}
            </span>
          ) : null}
        </span>
      </span>
      <span
        data-testid="team-person-role"
        className="ds-mono"
        style={{ width: 140, flex: '0 0 140px', fontSize: 12, color: 'var(--muted)', textAlign: 'left' }}
      >
        {role}
      </span>
      <span
        data-testid="team-person-status"
        className="ds-mono"
        style={{ width: 120, flex: '0 0 120px', fontSize: 12, color: statusColor, textAlign: 'left', whiteSpace: 'nowrap' }}
      >
        {status}
      </span>
      <span
        data-testid="team-person-actions"
        className="flex flex-nowrap items-center justify-end"
        style={{ width: 220, flex: '0 0 220px', gap: 8, marginLeft: 'auto' }}
      >
        {actions}
      </span>
    </div>
  );
}
