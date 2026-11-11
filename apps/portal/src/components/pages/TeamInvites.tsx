'use client';

import { useEffect, useState } from 'react';
import { useMutation } from 'convex/react';
import { useSearchParams } from 'next/navigation';
import { Check, Clock, Lock, Mail, MoreHorizontal, ShieldCheck, X } from 'lucide-react';
import { api } from '@convex/_generated/api';
import { teamInviteActions } from '@convex/_lib/inviteFlow';
import { userFacingErrorMessage } from '@convex/_lib/userFacingError';
import { PortalTilePane } from '@/components/layout/PortalWorkspace';
import { usePortalView } from '@/components/providers/PortalViewProvider';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { isMissingConvexFunction } from '@/lib/data/staffRoster';
import {
  TEAM_ERROR_COPY,
  TeamOutlineButton,
  TeamSkeletonRows,
  TeamStateNotice,
  asTeamInviteRole,
  teamView,
  teamWritesLive,
} from '@/components/account/teamStates';
import type { TeamScreen } from '@/components/account/teamStates';

type InviteRow = {
  notionPageId: string;
  name: string;
  email: string;
  role: string;
  inviteStatus: string;
  invitedAt?: number | null;
  expiresAt?: number | null;
};

type TeamRow = {
  canInvite: boolean;
  members: Array<{
    notionPageId: string;
    name: string;
    email: string;
    role: string;
    portalAccess: string;
    joinedAt?: number | null;
  }>;
  invites: InviteRow[];
};

export type InviteDraft = { name: string; email: string };

const INVITED = Date.UTC(2026, 10, 9);
const EXPIRES = Date.UTC(2026, 10, 16);
const EXPIRED_ON = Date.UTC(2026, 10, 2);

const FIXTURE_TEAM: TeamRow = {
  canInvite: true,
  members: [
    {
      notionPageId: 'ct-peter',
      name: 'Peter Roquemore',
      email: 'peter@warehaus.studio',
      role: 'Warehaus Staff',
      portalAccess: 'Enabled',
      joinedAt: Date.UTC(2026, 9, 2),
    },
    {
      notionPageId: 'ct-avery',
      name: 'Avery Chen',
      email: 'avery@warehaus.studio',
      role: 'Warehaus Staff',
      portalAccess: 'Enabled',
      joinedAt: Date.UTC(2026, 10, 2),
    },
  ],
  invites: [
    {
      notionPageId: 'ct-jordan',
      name: 'Jordan Blake',
      email: 'jordan@warehaus.studio',
      role: 'Warehaus Staff',
      inviteStatus: 'Pending',
      invitedAt: INVITED,
      expiresAt: EXPIRES,
    },
    {
      notionPageId: 'ct-sam',
      name: 'Sam Ortiz',
      email: 'sam@warehaus.studio',
      role: 'Warehaus Staff',
      inviteStatus: 'Expired',
      invitedAt: Date.UTC(2026, 9, 26),
      expiresAt: EXPIRED_ON,
    },
  ],
};

type ModalMode = 'closed' | 'edit' | 'sending' | 'sent' | 'invalid' | 'invited' | 'staff';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function dayLabel(ms: number | null | undefined): string {
  if (!ms) return '';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(ms);
}

function nameFromEmail(email: string): string {
  const local = email.split('@')[0]?.replace(/[._-]+/g, ' ').trim();
  if (!local) return 'New staff';
  return local.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function modeFromPreview(value: string | null): ModalMode {
  if (value === 'sending' || value === 'sent' || value === 'invalid' || value === 'invited' || value === 'staff') {
    return value;
  }
  if (value === 'modal' || value === 'sheet' || value === 'empty') return 'edit';
  return 'closed';
}

function composeExpiry(fixtures: boolean): number {
  return fixtures ? EXPIRES : Date.now() + 7 * 24 * 60 * 60 * 1000;
}

function seededEmail(previewUi: string | null): string {
  if (previewUi === 'invalid') return 'jordan';
  if (previewUi === 'staff') return 'avery@warehaus.studio';
  if (previewUi && previewUi !== 'empty' && previewUi !== 'menu') return 'jordan@warehaus.studio';
  return '';
}

export function TeamInvites({
  configured,
  fixtures = false,
  screen = 'ready',
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
  const params = useSearchParams();
  const previewUi = fixtures ? params.get('inviteUi') : null;
  const { setSectionFor } = usePortalView();
  const live = teamWritesLive({ configured, fixtures });
  const team = useSafeQuery<TeamRow>(api.invites.listTeam, configured ? {} : 'skip');
  const createInvite = useMutation(api.invites.create);
  const revokeInvite = useMutation(api.invites.revoke);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [cached, setCached] = useState<TeamRow | null>(null);
  const [mode, setMode] = useState<ModalMode>(modeFromPreview(previewUi));
  const [email, setEmail] = useState(seededEmail(previewUi));
  const [revokeId, setRevokeId] = useState<string | null>(previewUi === 'revoke' ? 'ct-jordan' : null);
  const [menuId, setMenuId] = useState<string | null>(previewUi === 'menu' ? 'ct-jordan' : null);
  const [sentOn, setSentOn] = useState<number | null>(null);
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

  function openModal() {
    setMode('edit');
    setEmail('');
    setNote(null);
  }

  function closeModal() {
    setMode('closed');
    setEmail('');
  }

  async function send(address: string) {
    const normalized = address.trim().toLowerCase();
    if (!EMAIL_RE.test(normalized)) {
      setEmail(address);
      setMode('invalid');
      return;
    }
    const member = roster?.members.find((row) => row.email.toLowerCase() === normalized);
    if (member) {
      setEmail(normalized);
      setMode('staff');
      return;
    }
    const pending = roster?.invites.find(
      (row) => row.email.toLowerCase() === normalized && row.inviteStatus === 'Pending',
    );
    if (pending && mode !== 'invited') {
      setEmail(normalized);
      setMode('invited');
      return;
    }
    if (!live) {
      setNote('Invites send when this portal is connected.');
      return;
    }
    setMode('sending');
    setBusy('send');
    try {
      const result = await createInvite({
        name: nameFromEmail(normalized),
        email: normalized,
        inviteRole: 'Warehaus Staff',
        requestId: crypto.randomUUID(),
      });
      if (!result.ok) {
        setNote(result.message ?? "We couldn't send this invite");
        setMode('edit');
        return;
      }
      onDraftChange({ name: '', email: '' });
      setSentOn(Date.now() + 7 * 24 * 60 * 60 * 1000);
      setMode('sent');
    } catch (err) {
      setNote(userFacingErrorMessage(err, "We couldn't send this invite"));
      setMode('edit');
    } finally {
      setBusy(null);
    }
  }

  async function resend(invite: InviteRow) {
    if (!asTeamInviteRole(invite.role)) return;
    if (!live) return;
    setBusy(invite.notionPageId);
    setNote(null);
    try {
      const result = await createInvite({
        name: invite.name,
        email: invite.email,
        inviteRole: 'Warehaus Staff',
        requestId: crypto.randomUUID(),
      });
      setNote(result.ok ? 'Resend pending. The old link stops working.' : (result.message ?? "We couldn't send this invite"));
      if (mode === 'invited' && result.ok) setMode('sent');
    } catch (err) {
      setNote(userFacingErrorMessage(err, "We couldn't send this invite"));
    } finally {
      setBusy(null);
    }
  }

  async function confirmRevoke() {
    if (!revokeId || !live) {
      setRevokeId(null);
      return;
    }
    setBusy(revokeId);
    try {
      const result = await revokeInvite({ contactNotionPageId: revokeId });
      setNote(result.ok ? 'Revoke pending.' : (result.message ?? "We couldn't revoke this invite"));
    } catch (err) {
      setNote(userFacingErrorMessage(err, "We couldn't revoke this invite"));
    } finally {
      setBusy(null);
      setRevokeId(null);
    }
  }

  const people = roster;
  const revokeTarget = people?.invites.find((row) => row.notionPageId === revokeId) ?? null;

  return (
    <PortalTilePane>
      <div className="flex h-full min-h-0 flex-col gap-6 overflow-auto" data-testid="team-invites" data-page-scroll="" data-state={view}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <p style={{ margin: 0, maxWidth: 520, fontSize: 14, lineHeight: '21px', color: 'var(--muted)' }}>
            Who can sign in to the Portal. Staff are invited here.
          </p>
          <button type="button" className="team-page-cta" data-testid="team-open-invite" onClick={openModal} style={primaryButton}>
            Invite staff
          </button>
        </div>
        <div className="flex gap-2" role="tablist">
          <button type="button" style={tabOn} aria-selected="true">
            Staff
          </button>
          <button type="button" style={tabOff} onClick={() => setSectionFor('account', 'clients')}>
            Clients
          </button>
        </div>
        {fixtures ? null : missing && (
          <TeamStateNotice title="Team & invites" body="The Convex functions for this batch were not pushed, so this deployment cannot list or send invites yet." />
        )}
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
        {view === 'loading' ? <TeamSkeletonRows /> : null}
        {people && (view === 'ready' || view === 'long' || view === 'stale' || view === 'empty') ? (
          <section data-testid="team-people" style={panel}>
            <header style={{ padding: '24px 24px 12px' }}>
              <h2 style={{ margin: 0, fontSize: 20, lineHeight: '30px', fontWeight: 600 }}>
                Warehaus Staff · {count}
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: 14, lineHeight: '21px', color: 'var(--muted)' }}>
                Staff sign in with their own email. Pending invites expire after 7 days.
              </p>
            </header>
            <div className="invite-columns" style={columns}>
              <span>NAME</span>
              <span>EMAIL</span>
              <span>ROLE</span>
              <span>STATUS</span>
              <span>ACTIONS</span>
            </div>
            {people.members.map((member) => (
              <MemberRow
                key={member.notionPageId}
                name={member.name}
                email={member.email}
                role={member.role}
                status="Active"
                detail={member.joinedAt ? `Joined ${dayLabel(member.joinedAt)}` : 'Joined'}
              />
            ))}
            {people.invites.map((invite) => {
              const expired = invite.inviteStatus === 'Expired';
              const actions = teamInviteActions(invite.inviteStatus);
              const detail = `Invited ${dayLabel(invite.invitedAt) || '—'} · ${expired ? 'expired' : 'expires'} ${dayLabel(invite.expiresAt) || '—'}`;
              return (
                <MemberRow
                  key={invite.notionPageId}
                  name={invite.name}
                  email={invite.email}
                  role={invite.role}
                  status={expired ? 'Expired' : 'Pending'}
                  detail={detail}
                  actions={
                    <span style={{ position: 'relative', display: 'inline-flex' }}>
                      <button
                        type="button"
                        aria-haspopup="menu"
                        aria-expanded={menuId === invite.notionPageId}
                        aria-label={`Actions for ${invite.email}`}
                        data-testid={`team-invite-menu-${invite.notionPageId}`}
                        disabled={busy !== null}
                        style={iconButton}
                        onClick={() => setMenuId((current) => (current === invite.notionPageId ? null : invite.notionPageId))}
                      >
                        <MoreHorizontal size={16} className="notice-icon" />
                      </button>
                      {menuId === invite.notionPageId ? (
                        <span
                          role="menu"
                          data-testid="team-invite-menu"
                          style={{
                            position: 'absolute',
                            right: 0,
                            bottom: 'calc(100% + 6px)',
                            zIndex: 30,
                            minWidth: 168,
                            padding: 4,
                            display: 'flex',
                            flexDirection: 'column',
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: 10,
                            boxShadow: '0 12px 32px rgb(0 0 0 / 18%)',
                          }}
                        >
                          <button
                            type="button"
                            role="menuitem"
                            data-testid={`team-resend-${invite.notionPageId}`}
                            disabled={busy !== null}
                            style={menuItem}
                            onClick={() => {
                              setMenuId(null);
                              void resend(invite);
                            }}
                          >
                            Resend
                          </button>
                          {actions.revoke ? (
                            <button
                              type="button"
                              role="menuitem"
                              data-testid={`team-revoke-${invite.notionPageId}`}
                              disabled={busy !== null}
                              style={{ ...menuItem, color: 'var(--danger)' }}
                              onClick={() => {
                                setMenuId(null);
                                setRevokeId(invite.notionPageId);
                              }}
                            >
                              Revoke
                            </button>
                          ) : null}
                        </span>
                      ) : null}
                    </span>
                  }
                />
              );
            })}
          </section>
        ) : null}
        <p style={{ margin: 0, fontSize: 13, lineHeight: '20px', color: 'var(--muted)' }}>
          Only Warehaus Staff can invite staff. Client Members and Client Admins are invited from the Clients tab.
        </p>
        {note ? (
          <p role="status" data-testid="team-invite-hint" style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
            {note}
          </p>
        ) : null}
      </div>
      {mode !== 'closed' ? (
        <InviteDialog
          mode={mode}
          email={email}
          busy={busy === 'send'}
          pending={people?.invites.find((row) => row.email.toLowerCase() === email.trim().toLowerCase())}
          onEmail={setEmail}
          onClose={closeModal}
          onSend={() => void send(email)}
          onResend={() => {
            const row = people?.invites.find((invite) => invite.email.toLowerCase() === email.trim().toLowerCase());
            if (row) void resend(row);
            else if (fixtures) setMode('sent');
          }}
          sentOn={sentOn}
          expiresOn={composeExpiry(fixtures)}
          onAnother={() => {
            setEmail('');
            setMode('edit');
          }}
        />
      ) : null}
      {revokeTarget || (fixtures && revokeId) ? (
        <ConfirmDialog
          title="Revoke this invite?"
          body={`${revokeTarget?.email ?? 'jordan@warehaus.studio'} won’t be able to use the current link. You can send a new invite later.`}
          confirmLabel="Revoke invite"
          onCancel={() => setRevokeId(null)}
          onConfirm={() => void confirmRevoke()}
        />
      ) : null}
      <style>{`
        .invite-columns { display: none; }
        .invite-row:has([role='menu']) { position: relative; z-index: 4; }
        @media (min-width: 800px) {
          .invite-columns { display: grid; }
          .invite-row { display: grid !important; grid-template-columns: minmax(140px, 1.1fr) minmax(160px, 1.3fr) 140px 180px 160px; align-items: center; height: 77px; min-height: 77px; box-sizing: border-box; overflow: visible; }
          .invite-card-meta { display: none; }
        }
        @media (max-width: 720px) {
          .team-page-cta { width: 100%; }
        }
        .invite-grab { display: none; }
        .invite-dialog input:focus-visible {
          outline: 2px solid var(--fg);
          outline-offset: 2px;
          border-color: var(--fg);
        }
        @media (max-width: 720px) {
          .invite-grab {
            display: block;
            width: 36px;
            height: 4px;
            border-radius: 999px;
            background: var(--border-2, var(--border));
            margin: -8px auto 4px;
          }
          .invite-dialog {
            top: auto !important;
            bottom: 0 !important;
            left: 0 !important;
            right: 0 !important;
            width: 100% !important;
            max-width: none !important;
            max-height: 100dvh !important;
            overflow: auto !important;
            transform: none !important;
            border-radius: 16px 16px 0 0 !important;
            padding-bottom: 24px !important;
          }
          .invite-actions { flex-direction: column !important; align-items: stretch !important; }
          .invite-actions button { width: 100%; }
          .invite-actions .invite-primary { order: 1; }
          .invite-actions .invite-cancel { order: 2; }
        }
      `}</style>
    </PortalTilePane>
  );
}

function MemberRow({
  name,
  email,
  role,
  status,
  detail,
  actions,
}: {
  name: string;
  email: string;
  role: string;
  status: string;
  detail: string | null;
  actions?: React.ReactNode;
}) {
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toUpperCase();
  return (
    <div className="invite-row" style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '16px 24px', borderTop: '1px solid var(--border)' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span aria-hidden style={{ width: 32, height: 32, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'var(--bg-2)', border: '1px solid var(--border)', fontSize: 12, fontWeight: 600 }}>{initials}</span>
        <strong style={{ fontSize: 14 }}>{name}</strong>
      </span>
      <span style={{ fontSize: 14, color: 'var(--muted)' }}>{email}</span>
      <span style={{ fontSize: 14 }}>{role}</span>
      <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
        <StatusPill label={status} />
        {detail ? <span style={{ fontSize: 12, color: 'var(--muted)' }}>{detail}</span> : null}
      </span>
      {actions ? <span style={{ display: 'flex', gap: 12 }}>{actions}</span> : <span />}
    </div>
  );
}

function StatusPill({ label }: { label: string }) {
  const danger = label === 'Expired';
  const active = label === 'Active';
  const pending = label === 'Pending';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        width: 'fit-content',
        borderRadius: 999,
        border: `1px solid ${danger ? 'var(--danger)' : active ? 'transparent' : 'var(--border)'}`,
        background: active ? 'var(--fg)' : 'transparent',
        padding: '2px 8px',
        fontSize: 12,
        lineHeight: '18px',
        color: danger ? 'var(--danger)' : active ? 'var(--bg)' : 'var(--foreground)',
      }}
    >
      {pending ? <Clock size={14} aria-hidden className="notice-icon" style={{ width: 14, height: 14, minWidth: 14, minHeight: 14 }} /> : null}
      {label}
    </span>
  );
}

function InviteDialog({
  mode,
  email,
  busy,
  pending,
  sentOn,
  expiresOn,
  onEmail,
  onClose,
  onSend,
  onResend,
  onAnother,
}: {
  mode: ModalMode;
  email: string;
  busy: boolean;
  pending?: InviteRow;
  sentOn?: number | null;
  expiresOn: number;
  onEmail: (value: string) => void;
  onClose: () => void;
  onSend: () => void;
  onResend: () => void;
  onAnother: () => void;
}) {
  const locked = mode === 'sending';
  return (
    <div role="presentation" className="invite-scrim" style={scrim} onClick={onClose}>
      <div
        className="invite-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-staff-title"
        data-testid="invite-staff-dialog"
        data-mode={mode}
        style={dialog}
        onClick={(event) => event.stopPropagation()}
      >
        <span className="invite-grab" aria-hidden />
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div>
            {mode === 'sent' ? (
              <span style={iconBadge}>
                <Check size={18} />
              </span>
            ) : null}
            <h2 id="invite-staff-title" style={{ margin: mode === 'sent' ? '12px 0 0' : 0, fontSize: 24, lineHeight: '32px' }}>
              {mode === 'sent' ? 'Invite sent' : 'Invite staff'}
            </h2>
            <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: '21px', color: 'var(--muted)' }}>
              {mode === 'sent'
                ? `We emailed ${email || 'them'}. They show as Pending in your staff list until they accept.`
                : `They’ll get an email with a link to set a password and join Warehaus. The link works once and expires ${dayLabel(expiresOn)}.`}
            </p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} style={iconButton}>
            <X size={16} />
          </button>
        </div>
        {mode === 'sent' ? (
          <div style={notice}>
            <Mail size={16} className="notice-icon" />
            <div>
              <p style={{ margin: 0, fontSize: 14 }}>Pending · expires {dayLabel(pending?.expiresAt ?? sentOn) || 'in 7 days'}</p>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
                You can resend or revoke the invite from the staff list at any time.
              </p>
            </div>
          </div>
        ) : (
          <>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 14 }}>Email</span>
              <input
                type="email"
                value={email}
                disabled={locked}
                onChange={(event) => onEmail(event.target.value)}
                placeholder="name@warehaus.studio"
                data-testid="team-invite-email"
                style={{ ...field, borderColor: mode === 'invalid' ? 'var(--danger)' : 'var(--border)', opacity: locked ? 0.5 : 1 }}
              />
              {mode === 'invalid' ? (
                <span style={{ color: 'var(--danger)', fontSize: 14 }}>
                  Enter a valid email address, like name@warehaus.studio.
                </span>
              ) : null}
            </label>
            {mode === 'invited' ? (
              <div style={notice}>
                <Clock size={16} className="notice-icon" />
                <div>
                  <p style={{ margin: 0, fontSize: 14 }}>Already invited</p>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
                    {email} has a pending invite from {dayLabel(pending?.invitedAt) || 'earlier'}. It expires {dayLabel(pending?.expiresAt) || 'in 7 days'}. Resending sends a fresh link and restarts the 7 days.
                  </p>
                </div>
              </div>
            ) : null}
            {mode === 'staff' ? (
              <div style={notice}>
                <ShieldCheck size={16} className="notice-icon" />
                <div>
                  <p style={{ margin: 0, fontSize: 14 }}>Already on the team</p>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
                    {email} is already Warehaus Staff. There’s nothing to send.
                  </p>
                </div>
              </div>
            ) : null}
            <div data-testid="team-role-staff">
              <span style={{ fontSize: 14 }}>Role</span>
              <div style={{ ...field, display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, opacity: locked ? 0.5 : 1 }}>
                <Lock size={16} className="notice-icon" />
                <span style={{ flex: 1 }}>Warehaus Staff</span>
                <span className="ds-mono" style={{ fontSize: 11, letterSpacing: '0.08em', color: 'var(--muted)' }}>FIXED</span>
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: '20px', color: 'var(--muted)' }}>
                Invites from this screen always join as Warehaus Staff.
              </p>
            </div>
          </>
        )}
        <div className="invite-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {mode === 'sent' ? (
            <>
              <button type="button" className="invite-cancel" style={ghostButton} onClick={onAnother}>Invite another</button>
              <button type="button" className="invite-primary" style={primaryButton} onClick={onClose}>Done</button>
            </>
          ) : mode === 'invited' ? (
            <>
              <button type="button" className="invite-cancel" style={ghostButton} onClick={onClose}>Cancel</button>
              <button type="button" className="invite-primary" data-testid="team-send-invite" style={primaryButton} onClick={onResend}>Resend invite</button>
            </>
          ) : mode === 'staff' ? (
            <>
              <button type="button" className="invite-cancel" style={ghostButton} onClick={onClose}>Close</button>
              <button type="button" className="invite-primary" data-testid="team-edit-email" style={secondaryButton} onClick={() => onEmail('')}>Edit email</button>
            </>
          ) : (
            <>
              <button type="button" className="invite-cancel" style={ghostButton} onClick={onClose} disabled={locked}>Cancel</button>
              <button type="button" className="invite-primary" data-testid="team-send-invite" style={locked || busy ? sendingButton : primaryButton} disabled={locked || busy} onClick={onSend}>
                {mode === 'sending' || busy ? 'Sending…' : 'Send invite'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div role="presentation" style={scrim} onClick={onCancel}>
      <div role="dialog" aria-modal="true" data-testid="revoke-confirm" style={{ ...dialog, width: 'min(440px, 100%)' }} onClick={(event) => event.stopPropagation()}>
        <h2 style={{ margin: 0, fontSize: 22 }}>{title}</h2>
        <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: '21px', color: 'var(--muted)' }}>{body}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" style={secondaryButton} onClick={onCancel}>Cancel</button>
          <button type="button" data-testid="revoke-confirm-submit" style={{ ...primaryButton, background: 'var(--danger)', color: '#fff' }} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const panel = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 12,
} as const;

const primaryButton = {
  background: 'var(--foreground)',
  color: 'var(--background)',
  border: 0,
  borderRadius: 9,
  minHeight: 42,
  padding: '0 16px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
} as const;

const ghostButton = {
  background: 'transparent',
  color: 'var(--foreground)',
  border: 0,
  borderRadius: 9,
  minHeight: 42,
  padding: '0 16px',
  fontSize: 14,
  cursor: 'pointer',
} as const;

const sendingButton = {
  background: 'var(--bg-2)',
  color: 'var(--muted)',
  border: 0,
  borderRadius: 9,
  minHeight: 42,
  padding: '0 16px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'default',
} as const;

const secondaryButton = {
  background: 'transparent',
  color: 'var(--foreground)',
  border: '1px solid var(--border)',
  borderRadius: 9,
  minHeight: 42,
  padding: '0 16px',
  fontSize: 14,
  cursor: 'pointer',
} as const;

const menuItem = {
  background: 'transparent',
  border: 0,
  borderRadius: 8,
  minHeight: 36,
  padding: '0 12px',
  color: 'var(--foreground)',
  fontSize: 14,
  textAlign: 'left' as const,
  cursor: 'pointer',
} as const;

const tabOn = { ...primaryButton, minHeight: 36 } as const;
const tabOff = { ...secondaryButton, minHeight: 36 } as const;

const field = {
  width: '100%',
  minHeight: 52,
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--bg-2)',
  color: 'var(--foreground)',
  padding: '0 14px',
  fontSize: 15,
} as const;

const scrim = {
  position: 'fixed' as const,
  inset: 0,
  background: 'color-mix(in oklab, black 55%, transparent)',
  zIndex: 60,
};

const dialog = {
  position: 'fixed' as const,
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 'min(520px, calc(100% - 32px))',
  background: 'var(--surface)',
  color: 'var(--foreground)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 32,
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 20,
  zIndex: 61,
};

const iconButton = {
  background: 'transparent',
  border: 0,
  color: 'var(--foreground)',
  width: 28,
  height: 28,
  cursor: 'pointer',
} as const;

const iconBadge = {
  display: 'inline-flex',
  width: 40,
  height: 40,
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 999,
  border: '1px solid var(--border)',
} as const;

const notice = {
  display: 'flex',
  alignItems: 'flex-start' as const,
  gap: 12,
  padding: 16,
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: 'color-mix(in oklab, var(--foreground) 4%, transparent)',
} as const;

const columns = {
  gridTemplateColumns: 'minmax(140px, 1.1fr) minmax(160px, 1.3fr) 140px 180px 160px',
  gap: 8,
  padding: '8px 24px',
  fontSize: 11,
  letterSpacing: '0.08em',
  color: 'var(--muted)',
} as const;
