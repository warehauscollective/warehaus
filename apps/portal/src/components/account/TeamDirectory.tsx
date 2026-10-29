'use client';

import { useMemo, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { isMissingConvexFunction } from '@/lib/data/staffRoster';

type Filter = 'all' | 'staff' | 'clients' | 'pending';

type TeamPerson = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  kind: 'staff' | 'client';
};

type TeamPayload = {
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

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'staff', label: 'Staff' },
  { key: 'clients', label: 'Clients' },
  { key: 'pending', label: 'Pending' },
];

/** Fixture stand-in for listTeam. No email is sent. */
const FIXTURE_PEOPLE: TeamPerson[] = [
  {
    id: 'staff-alex',
    name: 'Alex Staff',
    email: 'alex@warehaus.co',
    role: 'Owner',
    status: 'Active',
    kind: 'staff',
  },
  {
    id: 'staff-maya',
    name: 'Maya Chen',
    email: 'maya@warehaus.studio',
    role: 'Staff',
    status: 'Active',
    kind: 'staff',
  },
  {
    id: 'ct-ada',
    name: 'Ada North',
    email: 'ada@northwind.example',
    role: 'Client Admin',
    status: 'Active',
    kind: 'client',
  },
  {
    id: 'ct-sam',
    name: 'Sam North',
    email: 'sam@northwind.example',
    role: 'Client Member',
    status: 'Invite pending',
    kind: 'client',
  },
  {
    id: 'ct-paused',
    name: 'Jules Park',
    email: 'jules@northwind.example',
    role: 'Client Member',
    status: 'Paused',
    kind: 'client',
  },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '');
  return letters.join('') || '·';
}

function roleLabel(role: string): string {
  if (role === 'Warehaus Staff') return 'Staff';
  return role;
}

function kindFor(role: string): 'staff' | 'client' {
  if (role === 'Warehaus Staff' || role === 'Staff' || role === 'Owner') return 'staff';
  return 'client';
}

function memberStatus(portalAccess: string): string {
  return portalAccess === 'Enabled' ? 'Active' : 'Paused';
}

function inviteStatusLabel(status: string): string {
  if (status === 'Pending') return 'Invite pending';
  if (status === 'Paused') return 'Paused';
  return status;
}

function isPending(person: TeamPerson): boolean {
  return person.status === 'Invite pending' || person.status === 'Pending';
}

function fromPayload(payload: TeamPayload, self: { name: string; email: string }): TeamPerson[] {
  const people: TeamPerson[] = [
    {
      id: 'self',
      name: self.name,
      email: self.email,
      role: 'Owner',
      status: 'Active',
      kind: 'staff',
    },
  ];
  for (const member of payload.members) {
    if (member.email.trim().toLowerCase() === self.email.trim().toLowerCase()) continue;
    people.push({
      id: member.notionPageId,
      name: member.name,
      email: member.email,
      role: roleLabel(member.role),
      status: memberStatus(member.portalAccess),
      kind: kindFor(member.role),
    });
  }
  for (const invite of payload.invites) {
    people.push({
      id: invite.notionPageId,
      name: invite.name,
      email: invite.email,
      role: roleLabel(invite.role),
      status: inviteStatusLabel(invite.inviteStatus),
      kind: 'client',
    });
  }
  return people;
}

function matches(person: TeamPerson, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'staff') return person.kind === 'staff';
  if (filter === 'clients') return person.kind === 'client';
  return isPending(person);
}

export function TeamDirectory({
  live,
  hostSlug,
  self,
  onInvite,
}: {
  live: boolean;
  hostSlug?: string;
  self: { name: string; email: string };
  onInvite: () => void;
}) {
  const remote = useSafeQuery<TeamPayload>(api.invites.listTeam, live ? { hostSlug } : 'skip');
  const [filter, setFilter] = useState<Filter>('all');
  const missing = isMissingConvexFunction(remote.error);

  const people = useMemo(() => {
    if (!live) return FIXTURE_PEOPLE;
    if (!remote.data) return [];
    return fromPayload(remote.data, self);
  }, [live, remote.data, self]);

  const counts: Record<Filter, number> = {
    all: people.length,
    staff: people.filter((person) => person.kind === 'staff').length,
    clients: people.filter((person) => person.kind === 'client').length,
    pending: people.filter(isPending).length,
  };
  const shown = people.filter((person) => matches(person, filter));
  const paused = people.some((person) => person.status === 'Paused');
  const loading = live && remote.loading && !remote.data;

  return (
    <section id="account-team" data-testid="account-team" style={cardStyle}>
      <header className="flex flex-wrap items-start justify-between" style={{ gap: 16 }}>
        <div className="min-w-0 flex-1">
          <h2 style={cardTitle}>Team and invites</h2>
          <p style={cardSubtitle}>Staff and client contacts. Full invite screens are in Client invites.</p>
        </div>
        <button type="button" onClick={onInvite} data-testid="account-invite" style={outlineButton}>
          Invite someone
        </button>
      </header>
      <div className="flex flex-wrap" style={{ gap: 8 }} role="tablist" aria-label="Team filters">
        {FILTERS.map((item) => {
          const on = filter === item.key;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={on}
              data-testid={`account-team-filter-${item.key}`}
              onClick={() => setFilter(item.key)}
              className="inline-flex items-center"
              style={{
                gap: 8,
                padding: '8px 16px',
                borderRadius: 999,
                border: on ? '1px solid var(--border-2)' : '1px solid var(--border)',
                background: on ? 'var(--surface-2)' : 'transparent',
                color: on ? 'var(--fg)' : 'var(--muted)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {item.label}
              <span className="ds-mono" style={{ fontSize: 11, color: 'var(--faint)' }}>
                {counts[item.key]}
              </span>
            </button>
          );
        })}
      </div>
      {loading ? (
        <div data-testid="account-team-loading" className="flex flex-col" style={{ gap: 24 }}>
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex items-center" style={{ gap: 16 }}>
              <span className="animate-pulse" style={skeletonAvatar} />
              <span className="min-w-0 flex-1">
                <span className="animate-pulse block" style={{ ...skeletonLine, width: '70%' }} />
                <span className="animate-pulse mt-2 block" style={{ ...skeletonLine, width: '40%', height: 10 }} />
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {!loading && shown.length === 0 ? (
        <div data-testid="account-team-empty" style={emptyStyle}>
          <p style={{ fontSize: 16, fontWeight: 500, textAlign: 'center' }}>
            {filter === 'pending' ? 'No pending invites' : 'No people in this list'}
          </p>
          <p style={{ fontSize: 13, lineHeight: '19px', color: 'var(--muted)', textAlign: 'center' }}>
            {filter === 'pending'
              ? 'Invites you send to client contacts will show here.'
              : 'People you can see in this filter will show here.'}
          </p>
          {filter === 'pending' ? (
            <button type="button" onClick={onInvite} style={outlineButton}>
              Invite someone
            </button>
          ) : null}
        </div>
      ) : null}
      {!loading &&
        shown.map((person) => (
          <div
            key={person.id}
            data-testid={`account-team-row-${person.id}`}
            className="flex flex-wrap items-center"
            style={rowStyle}
          >
            <span aria-hidden style={avatarStyle}>
              {initials(person.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p style={{ fontSize: 16, fontWeight: 500, lineHeight: 'normal' }}>{person.name}</p>
              <p className="ds-mono" style={{ marginTop: 4, fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>
                {person.email}
              </p>
              <p className="ds-mono sm:hidden" style={{ marginTop: 4, fontSize: 12, color: 'var(--muted)' }}>
                {person.role} · {person.status}
              </p>
            </div>
            <p className="ds-mono hidden sm:block" style={metaStyle}>
              {person.role}
            </p>
            <p className="ds-mono hidden sm:block" style={{ ...metaStyle, width: 100 }}>
              {person.status}
            </p>
            <span aria-hidden className="ds-mono" style={{ fontSize: 16, color: 'var(--muted)', letterSpacing: 1 }}>
              ···
            </span>
          </div>
        ))}
      {paused ? (
        <div data-testid="account-team-paused" className="flex items-start" style={noticeStyle}>
          <InfoMark />
          <div>
            <p style={noticeTitle}>Paused</p>
            <p style={noticeBody}>This invite is paused. No email is sent.</p>
          </div>
        </div>
      ) : null}
      <div data-testid="account-team-reused" className="flex items-start" style={noticeStyle}>
        <InfoMark />
        <div>
          <p style={noticeTitle}>Reused from Client invites</p>
          <p style={noticeBody}>
            {missing
              ? 'Invites stay on the invite screen. This deployment cannot list them yet, and no email is sent.'
              : 'The invite list, form, and accept screens are in Client invites. Client Admins invite Client Members only. No email is sent from this card.'}
          </p>
        </div>
      </div>
    </section>
  );
}

function InfoMark() {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center"
      style={{
        width: 20,
        height: 20,
        borderRadius: 999,
        border: '1.25px solid var(--muted)',
        color: 'var(--muted)',
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1,
      }}
    >
      i
    </span>
  );
}

const cardStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: '2.25rem',
  padding: 'clamp(1.5625rem, 2vw, 3rem)',
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 32,
};

const cardTitle = {
  fontSize: 20,
  fontWeight: 600,
  lineHeight: '26px',
};

const cardSubtitle = {
  marginTop: 4,
  fontSize: 13,
  lineHeight: '19px',
  color: 'var(--muted)',
};

const outlineButton = {
  background: 'transparent',
  color: 'var(--fg)',
  border: '1px solid var(--border-2)',
  borderRadius: 9,
  fontFamily: 'var(--font-body)',
  fontSize: 14,
  fontWeight: 500,
  lineHeight: 'normal',
  padding: '12px 16px',
  cursor: 'pointer',
  whiteSpace: 'nowrap' as const,
};

const rowStyle = {
  gap: 16,
  paddingTop: 24,
  paddingBottom: 24,
  borderBottom: '1px solid var(--border)',
};

const avatarStyle = {
  width: 36,
  height: 36,
  borderRadius: 999,
  background: 'var(--surface-2)',
  border: '1px solid var(--border-2)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 12,
  fontWeight: 600,
  flexShrink: 0,
};

const metaStyle = {
  width: 130,
  fontSize: 12,
  color: 'var(--muted)',
  flexShrink: 0,
};

const noticeStyle = {
  gap: 12,
  padding: '16px 24px',
  borderRadius: 18,
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
};

const noticeTitle = {
  fontSize: 14,
  fontWeight: 600,
  lineHeight: '20px',
};

const noticeBody = {
  marginTop: 4,
  fontSize: 13,
  lineHeight: '19px',
  color: 'var(--muted)',
};

const emptyStyle = {
  background: 'var(--bg-2)',
  border: '1px dashed var(--border)',
  borderRadius: 18,
  padding: '48px 24px',
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  gap: 12,
};

const skeletonAvatar = {
  width: 36,
  height: 36,
  borderRadius: 999,
  background: 'var(--surface-2)',
  flexShrink: 0,
};

const skeletonLine = {
  height: 12,
  borderRadius: 999,
  background: 'var(--surface-2)',
};
