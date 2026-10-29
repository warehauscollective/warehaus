import type { ReactNode } from 'react';
import { clientInitials } from '@/lib/data/clientList';

/** Fixture long-text row from Account / States (297:18927). Not a schema field. */
export const LONG_TEAM_NAME = 'Alexandria Montgomery-Featherstonehaugh';
export const LONG_TEAM_EMAIL = 'alexandria.montgomery-featherstonehaugh@northwind.example';
export const LONG_TEAM_ROLE = 'Client Member';

export const TEAM_STAFF_EMPTY = {
  title: 'No pending invites',
  body: 'Invites you send to client contacts will show here.',
} as const;

export const TEAM_CLIENT_EMPTY = {
  title: 'No teammates yet',
  body: 'Client Admins can invite Client Members from the Team page.',
} as const;

export const TEAM_ERROR_COPY = {
  title: 'Could not save your settings',
  body: 'Check your connection and try again.',
} as const;

export type TeamScreen = 'ready' | 'empty' | 'loading' | 'error' | 'long';

/** Fixture `screen` wins. Live empty, loading, and no-data errors come from the roster. */
export function teamView(input: {
  screen: TeamScreen;
  fixtures: boolean;
  loading: boolean;
  missing: boolean;
  failed: boolean;
  count: number;
}): TeamScreen {
  if (input.screen !== 'ready') return input.screen;
  if (!input.fixtures && input.loading) return 'loading';
  if (!input.fixtures && !input.missing && input.failed) return 'error';
  if (input.count === 0 && (input.fixtures || !input.loading)) return 'empty';
  return 'ready';
}

/** Local to the team roster. Does not change portal chrome or shared scroll. */
export const TEAM_ROSTER_CSS = `
.team-roster-cards { display: flex; flex-direction: column; }
.team-roster-table { display: none; }
@media (min-width: 768px) {
  .team-roster-cards { display: none; }
  .team-roster-table { display: block; }
}
`;

export function TeamEmpty({
  title,
  body,
  action,
  testId = 'team-empty',
}: {
  title: string;
  body: string;
  action?: ReactNode;
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
      {action}
    </div>
  );
}

export function TeamSkeletonRows({ testId = 'team-loading' }: { testId?: string }) {
  return (
    <div data-testid={testId} className="flex flex-col" style={{ gap: 24 }} aria-busy="true" aria-hidden>
      {[0, 1, 2].map((row) => (
        <div key={row} data-testid="team-skeleton-row" className="flex items-center" style={{ gap: 16 }}>
          <span
            className="animate-pulse shrink-0"
            style={{ width: 36, height: 36, borderRadius: 18, background: 'var(--surface-2)' }}
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
}: {
  title: string;
  body: string;
  testId?: string;
}) {
  return (
    <div
      role="alert"
      data-testid={testId}
      className="flex items-start"
      style={{
        gap: 12,
        border: '1px solid var(--danger)',
        borderRadius: 18,
        background: 'var(--surface)',
        padding: '16px 24px',
      }}
    >
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

export function TeamPersonIdentity({
  name,
  email,
  role,
  status,
}: {
  name: string;
  email: string;
  role: string;
  status: string;
}) {
  const meta = [email, role].filter(Boolean).join(' · ');
  return (
    <div
      data-testid="team-person-row"
      className="flex items-center"
      style={{ gap: 12, borderBottom: '1px solid var(--border)', padding: '24px 0' }}
    >
      <span
        className="ds-mono inline-flex shrink-0 items-center justify-center"
        style={{
          width: 36,
          height: 36,
          borderRadius: 999,
          background: 'var(--surface-2)',
          border: '1px solid var(--border-2, var(--border))',
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        {clientInitials(name)}
      </span>
      <span className="min-w-0 flex-1">
        <span data-testid="team-person-name" className="block" style={{ fontSize: 16, fontWeight: 500, overflowWrap: 'anywhere' }}>
          {name}
        </span>
        {meta ? (
          <span className="ds-mono block" style={{ fontSize: 12, lineHeight: '18px', color: 'var(--muted)', overflowWrap: 'anywhere' }}>
            {meta}
          </span>
        ) : null}
      </span>
      <span className="ds-mono shrink-0" style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
        {status}
      </span>
    </div>
  );
}
