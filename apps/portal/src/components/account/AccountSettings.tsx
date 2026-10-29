'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import { TeamDirectory } from '@/components/account/TeamDirectory';
import { ThemeControl } from '@/components/account/ThemeControl';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { authClient } from '@/lib/auth-client';
import { isMissingConvexFunction } from '@/lib/data/staffRoster';
import {
  DEFAULT_NOTIFICATION_PREFS,
  mergeNotificationPrefs,
  notificationKeysFor,
  readLegacyNotificationPrefs,
  type NotificationPrefKey,
  type NotificationPrefs,
} from '@convex/_lib/notificationPrefs';

const LEGACY_KEY = 'warehaus-notifications';

const COPY: Record<
  NotificationPrefKey,
  { label: string; body: string }
> = {
  awaitingGo: {
    label: 'Awaiting go',
    body: 'Tell me when an item reaches Awaiting Go',
  },
  syncProblems: {
    label: 'Sync problems',
    body: 'Tell me when a write to Notion fails',
  },
  draftRecaps: {
    label: 'Draft recaps',
    body: 'Tell me when a Granola recap is ready to review',
  },
  inviteNotices: {
    label: 'Invite notices',
    body: 'Staff notices about client invites',
  },
  needsAttention: {
    label: 'Needs your attention',
    body: 'Tasks waiting for your go-ahead',
  },
  sharedRecaps: {
    label: 'Shared recaps',
    body: 'When Warehaus shares a meeting recap',
  },
  weeklySummary: {
    label: 'Weekly summary',
    body: 'A short email every Monday',
  },
};

type SavedPrefs = NotificationPrefs & { persisted?: boolean };

export type AccountSavePreview = 'success' | 'error' | 'loading' | null;

type PasswordClient = {
  changePassword: (input: {
    currentPassword: string;
    newPassword: string;
    revokeOtherSessions?: boolean;
  }) => Promise<{ error: { message?: string } | null }>;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0 || name === '—') return '·';
  const letters = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '');
  return letters.join('') || '·';
}

function readLegacy(): Partial<NotificationPrefs> | null {
  try {
    return readLegacyNotificationPrefs(localStorage.getItem(LEGACY_KEY));
  } catch {
    return null;
  }
}

function writeLegacy(prefs: NotificationPrefs) {
  try {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function AccountSettings({
  staff,
  name,
  email,
  orgLabel,
  role,
  focus,
  live,
  hostSlug,
  onSignOut,
  onOpenTeam,
  onInvite,
  savePreview = null,
}: {
  staff: boolean;
  name: string;
  email: string;
  orgLabel: string;
  role: string;
  focus: 'profile' | 'notifications' | 'team';
  /** Signed-in Convex session. Fixture preview stays local. */
  live: boolean;
  hostSlug?: string;
  onSignOut: () => void;
  onOpenTeam?: () => void;
  onInvite?: () => void;
  savePreview?: AccountSavePreview;
}) {
  const notificationsRef = useRef<HTMLElement | null>(null);
  const teamRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const target = focus === 'notifications' ? notificationsRef.current : focus === 'team' ? teamRef.current : null;
    target?.scrollIntoView({ block: 'nearest' });
  }, [focus]);

  return (
    <div className="flex flex-col gap-8 lg:gap-12" data-testid="account-profile">
      <ProfileCard
        staff={staff}
        name={name}
        email={email}
        orgLabel={orgLabel}
        role={role}
        live={live}
        onSignOut={onSignOut}
      />
      <ThemeControl />
      <NotificationSettings
        refTarget={notificationsRef}
        staff={staff}
        live={live}
        hostSlug={hostSlug}
        savePreview={savePreview}
      />
      {staff ? (
        <div ref={teamRef}>
          <TeamDirectory
            live={live}
            hostSlug={hostSlug}
            self={{ name, email }}
            onInvite={() => onInvite?.()}
          />
        </div>
      ) : (
        <TeammateNotice onOpenTeam={() => onOpenTeam?.()} />
      )}
    </div>
  );
}

function ProfileCard({
  staff,
  name,
  email,
  orgLabel,
  role,
  live,
  onSignOut,
}: {
  staff: boolean;
  name: string;
  email: string;
  orgLabel: string;
  role: string;
  live: boolean;
  onSignOut: () => void;
}) {
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordNote, setPasswordNote] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const roleLine = staff ? `${orgLabel} · Owner` : `${orgLabel} · ${role}`;

  const submitPassword = async () => {
    setPasswordSaving(true);
    setPasswordError(null);
    setPasswordNote(null);
    try {
      if (!live) {
        setPasswordNote('Password changes stay off in this preview.');
        return;
      }
      const { error } = await (authClient as unknown as PasswordClient).changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (error) {
        setPasswordError(error.message ?? 'Could not change your password');
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setPasswordOpen(false);
      setPasswordNote('Password changed');
    } catch {
      setPasswordError('Could not change your password');
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <section style={cardStyle} data-testid="account-identity">
      <header>
        <h2 style={cardTitle}>Profile</h2>
        <p style={cardSubtitle}>How you appear in the portal</p>
      </header>
      <div className="flex items-center" style={{ gap: 24 }}>
        <div
          className="flex shrink-0 items-center justify-center"
          aria-hidden
          style={{
            width: 56,
            height: 56,
            borderRadius: 999,
            background: 'var(--surface-2)',
            border: '1px solid var(--border-2)',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {initials(name)}
        </div>
        <div className="min-w-0">
          <p style={{ fontSize: 20, fontWeight: 600, lineHeight: '24px' }}>{name}</p>
          <p className="ds-mono" data-testid="account-role-line" style={{ marginTop: 4, fontSize: 12, color: 'var(--muted)' }}>
            {roleLine}
          </p>
        </div>
      </div>
      <Field label="Display name" value={name} testId="account-display-name" />
      <Field
        label="Email"
        value={email}
        testId="account-email"
        help={
          staff
            ? 'Your Warehaus sign-in email.'
            : 'Your sign-in email. Contact Warehaus to change it.'
        }
      />
      {staff ? (
        <Field label="Owner lane" value="Dream, Design, Develop" testId="account-areas" />
      ) : null}
      <div className="flex flex-wrap" style={{ gap: 12 }}>
        <button
          type="button"
          data-testid="account-change-password"
          onClick={() => {
            setPasswordOpen((open) => !open);
            setPasswordError(null);
          }}
          style={outlineButton}
        >
          Change password
        </button>
        <button type="button" onClick={onSignOut} data-testid="account-sign-out" style={outlineButton}>
          Sign out
        </button>
      </div>
      {passwordOpen ? (
        <form
          data-testid="account-password-form"
          className="flex flex-col"
          style={{ gap: 12 }}
          onSubmit={(event) => {
            event.preventDefault();
            void submitPassword();
          }}
        >
          <label className="flex flex-col" style={{ gap: 8 }}>
            <span className="ds-mono" style={fieldLabel}>
              Current password
            </span>
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
              style={fieldInput}
            />
          </label>
          <label className="flex flex-col" style={{ gap: 8 }}>
            <span className="ds-mono" style={fieldLabel}>
              New password
            </span>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
              minLength={8}
              style={fieldInput}
            />
          </label>
          <button type="submit" disabled={passwordSaving} style={{ ...solidButton, opacity: passwordSaving ? 0.55 : 1 }}>
            {passwordSaving ? 'Saving…' : 'Update password'}
          </button>
        </form>
      ) : null}
      {passwordNote ? <p style={{ fontSize: 13, color: 'var(--muted)' }}>{passwordNote}</p> : null}
      {passwordError ? <p style={errorStyle}>{passwordError}</p> : null}
    </section>
  );
}

function Field({
  label,
  value,
  help,
  testId,
}: {
  label: string;
  value: string;
  help?: string;
  testId: string;
}) {
  const id = testId;
  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      <label htmlFor={id} className="ds-mono" style={fieldLabel}>
        {label}
      </label>
      <input
        id={id}
        data-testid={testId}
        value={value}
        readOnly
        type={label === 'Email' ? 'email' : 'text'}
        autoComplete="off"
        style={fieldInput}
      />
      {help ? <p style={{ fontSize: 12, lineHeight: '16px', color: 'var(--muted)' }}>{help}</p> : null}
    </div>
  );
}

function NotificationSettings({
  refTarget,
  staff,
  live,
  hostSlug,
  savePreview,
}: {
  refTarget: RefObject<HTMLElement | null>;
  staff: boolean;
  live: boolean;
  hostSlug?: string;
  savePreview: AccountSavePreview;
}) {
  const remote = useSafeQuery<SavedPrefs>(
    api.notificationPrefs.getMine,
    live ? { hostSlug } : 'skip',
  );
  const saveMine = useMutation(api.notificationPrefs.saveMine);
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const dirty = useRef(false);
  const hydrated = useRef(false);

  useEffect(() => {
    if (!live) {
      const legacy = readLegacy();
      if (legacy) setPrefs(mergeNotificationPrefs(DEFAULT_NOTIFICATION_PREFS, legacy));
      return;
    }
    if (hydrated.current || dirty.current) return;
    if (remote.loading) return;
    if (remote.data) {
      hydrated.current = true;
      const { persisted, ...row } = remote.data;
      if (persisted) {
        setPrefs(mergeNotificationPrefs(null, row));
        return;
      }
      const legacy = readLegacy();
      setPrefs(mergeNotificationPrefs(row, legacy ?? {}));
      return;
    }
    if (remote.error && isMissingConvexFunction(remote.error)) {
      hydrated.current = true;
      const legacy = readLegacy();
      if (legacy) setPrefs(mergeNotificationPrefs(DEFAULT_NOTIFICATION_PREFS, legacy));
    }
  }, [live, remote.data, remote.error, remote.loading]);

  const keys = notificationKeysFor(staff);
  const showLoading = savePreview === 'loading' || (live && remote.loading && !remote.data);
  const showError = savePreview === 'error' || Boolean(error);
  const showSaved = savePreview === 'success' || saved;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (live && !isMissingConvexFunction(remote.error)) {
        const patch: Partial<NotificationPrefs> = {};
        for (const key of keys) patch[key] = prefs[key];
        const next = await saveMine({ ...patch, hostSlug });
        setPrefs(mergeNotificationPrefs(prefs, next));
        dirty.current = false;
      }
      writeLegacy(prefs);
      setSaved(true);
    } catch {
      setSaved(false);
      setError('Could not save your settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section ref={refTarget} id="account-notifications" data-testid="account-notifications" style={cardStyle}>
      <header>
        <h2 style={cardTitle}>Notifications</h2>
        <p style={cardSubtitle}>{staff ? 'Email and in-portal' : 'Choose what reaches your inbox'}</p>
      </header>
      {showLoading ? (
        <div data-testid="account-notifications-loading" className="flex flex-col" style={{ gap: 24 }}>
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex items-center" style={{ gap: 16, padding: '12px 0' }}>
              <span className="min-w-0 flex-1">
                <span className="animate-pulse block" style={{ height: 12, width: '46%', borderRadius: 999, background: 'var(--surface-2)' }} />
                <span className="animate-pulse mt-2 block" style={{ height: 10, width: '72%', borderRadius: 999, background: 'var(--surface-2)' }} />
              </span>
              <span className="animate-pulse" style={{ width: 40, height: 22, borderRadius: 999, background: 'var(--surface-2)' }} />
            </div>
          ))}
        </div>
      ) : (
      keys.map((key) => {
        const on = prefs[key];
        const copy = COPY[key];
        return (
          <div key={key} style={settingRow}>
            <div className="min-w-0 flex-1">
              <p style={settingTitle}>{copy.label}</p>
              <p style={settingBody}>{copy.body}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={copy.label}
              data-testid={`notify-${key}`}
              onClick={() => {
                dirty.current = true;
                setPrefs((current) => ({ ...current, [key]: !current[key] }));
                setError(null);
                setSaved(false);
              }}
              className="relative shrink-0"
              style={{
                width: 40,
                height: 22,
                borderRadius: 999,
                border: on ? '1px solid transparent' : '1px solid var(--border-2)',
                background: on ? 'var(--fg)' : 'var(--surface-2)',
                padding: 0,
                cursor: 'pointer',
              }}
            >
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  top: 2,
                  left: on ? 20 : 2,
                  width: 16,
                  height: 16,
                  borderRadius: 999,
                  background: on ? 'var(--bg)' : 'var(--muted)',
                }}
              />
            </button>
          </div>
        );
      })
      )}
      {showLoading ? null : (
      <button
        type="button"
        onClick={() => {
          void save();
        }}
        disabled={saving}
        data-testid="account-save-notifications"
        style={{
          ...solidButton,
          opacity: saving ? 0.55 : 1,
          cursor: saving ? 'not-allowed' : 'pointer',
        }}
      >
        Save changes
      </button>
      )}
      {showSaved && !showError ? (
        <div data-testid="account-save-success" className="flex items-start" style={noticeStyle}>
          <p style={{ fontSize: 14, fontWeight: 600, lineHeight: '20px' }}>Settings saved</p>
        </div>
      ) : null}
      {showError ? (
        <div data-testid="account-save-error" className="flex flex-col items-start" style={{ gap: 12 }}>
          <div className="flex items-start" style={noticeStyle}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, lineHeight: '20px' }}>Could not save your settings</p>
              <p style={{ marginTop: 4, ...errorStyle }}>Try again.</p>
            </div>
          </div>
          <button type="button" onClick={() => void save()} data-testid="account-save-retry" style={outlineButton}>
            Try again
          </button>
        </div>
      ) : null}
      {remote.error && !isMissingConvexFunction(remote.error) && savePreview !== 'error' ? (
        <p style={errorStyle}>We could not load your notification settings. Try again.</p>
      ) : null}
    </section>
  );
}

function TeammateNotice({ onOpenTeam }: { onOpenTeam: () => void }) {
  return (
    <div
      className="flex items-start"
      data-testid="account-teammate-notice"
      style={{
        gap: 12,
        padding: '16px 24px',
        borderRadius: 18,
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
      }}
    >
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
      <div>
        <p style={{ fontSize: 14, fontWeight: 600, lineHeight: '20px' }}>Need to add a teammate?</p>
        <p style={{ marginTop: 4, fontSize: 13, lineHeight: '19px', color: 'var(--muted)' }}>
          Client Admins can invite Client Members from the{' '}
          <button
            type="button"
            onClick={onOpenTeam}
            data-testid="account-open-team"
            style={{
              background: 'none',
              border: 0,
              padding: 0,
              color: 'inherit',
              font: 'inherit',
              textDecoration: 'underline',
              cursor: 'pointer',
            }}
          >
            Team page
          </button>
          .
        </p>
      </div>
    </div>
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

const fieldLabel = {
  fontSize: 11,
  letterSpacing: '0.88px',
  textTransform: 'uppercase' as const,
  color: 'var(--faint)',
};

const fieldInput = {
  width: '100%',
  background: 'var(--bg-2)',
  border: '1px solid var(--border)',
  borderRadius: 18,
  padding: '12px 16px',
  fontSize: 15,
  lineHeight: '20px',
  color: 'var(--fg)',
  fontFamily: 'var(--font-body)',
};

const outlineButton = {
  alignSelf: 'flex-start' as const,
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
};

const solidButton = {
  alignSelf: 'flex-start' as const,
  background: 'var(--accent)',
  color: 'var(--accent-fg)',
  border: 0,
  borderRadius: 9,
  fontFamily: 'var(--font-body)',
  fontSize: 14,
  fontWeight: 500,
  lineHeight: 'normal',
  padding: '12px 16px',
};

const settingRow = {
  display: 'flex',
  alignItems: 'center',
  gap: 24,
  paddingTop: 24,
  paddingBottom: 24,
  borderBottom: '1px solid var(--border)',
};

const settingTitle = {
  fontSize: 15,
  fontWeight: 500,
  color: 'var(--fg)',
};

const settingBody = {
  marginTop: 4,
  fontSize: 13,
  lineHeight: '19px',
  color: 'var(--muted)',
};

const errorStyle = {
  fontSize: 13,
  lineHeight: '19px',
  color: 'var(--danger)',
};

const noticeStyle = {
  gap: 12,
  width: '100%',
  padding: '16px 24px',
  borderRadius: 18,
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
};
