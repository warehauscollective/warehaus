'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import { ACCOUNT_CARD_CSS } from '@/components/account/accountCardCss';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { isMissingConvexFunction } from '@/lib/data/staffRoster';
import {
  DEFAULT_NOTIFICATION_PREFS,
  mergeNotificationPrefs,
  notificationKeysFor,
  readLegacyNotificationPrefs,
  type NotificationPrefKey,
  type NotificationPrefs,
} from '@convex/_lib/notificationPrefs';

/** Older builds kept staff toggles here. Read once to seed a first save. */
const LEGACY_KEY = 'warehaus-notifications';

export const NOTIFICATION_COPY: Record<NotificationPrefKey, { label: string; body: string }> = {
  awaitingGo: { label: 'Awaiting go', body: 'Tell me when an item reaches Awaiting Go' },
  syncProblems: { label: 'Sync problems', body: 'Tell me when a write to Notion fails' },
  draftRecaps: { label: 'Draft recaps', body: 'Tell me when a Granola recap is ready to review' },
  inviteNotices: { label: 'Invite notices', body: 'Staff notices about client invites' },
  needsAttention: { label: 'Needs your attention', body: 'Tasks waiting for your go-ahead' },
  sharedRecaps: { label: 'Shared recaps', body: 'When Warehaus shares a meeting recap' },
  weeklySummary: { label: 'Weekly summary', body: 'A short email every Monday' },
};

type SavedPrefs = NotificationPrefs & { persisted?: boolean };

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

/**
 * Per-user toggles saved to Convex `notificationPrefs` for the signed-in contact.
 * Fixture preview, and a deployment without the functions, stay on localStorage.
 * Nothing here sends email.
 */
export function NotificationSettings({
  staff,
  live,
  hostSlug,
}: {
  staff: boolean;
  /** Signed-in Convex session. Fixture preview stays local. */
  live: boolean;
  hostSlug?: string;
}) {
  const remote = useSafeQuery<SavedPrefs>(api.notificationPrefs.getMine, live ? { hostSlug } : 'skip');
  const saveMine = useMutation(api.notificationPrefs.saveMine);
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const dirty = useRef(false);
  const hydrated = useRef(false);
  const missing = isMissingConvexFunction(remote.error);

  useEffect(() => {
    if (!live) {
      const legacy = readLegacy();
      if (legacy) setPrefs(mergeNotificationPrefs(DEFAULT_NOTIFICATION_PREFS, legacy));
      return;
    }
    if (hydrated.current || dirty.current || remote.loading) return;
    if (remote.data) {
      hydrated.current = true;
      const { persisted, ...row } = remote.data;
      setPrefs(persisted ? mergeNotificationPrefs(null, row) : mergeNotificationPrefs(row, readLegacy() ?? {}));
      return;
    }
    if (missing) {
      hydrated.current = true;
      const legacy = readLegacy();
      if (legacy) setPrefs(mergeNotificationPrefs(DEFAULT_NOTIFICATION_PREFS, legacy));
    }
  }, [live, missing, remote.data, remote.loading]);

  const keys = notificationKeysFor(staff);
  const initialLoading = live && remote.loading && !remote.data;
  const loadFailed = live && Boolean(remote.error) && !missing;

  const save = async () => {
    setSaving(true);
    setError(false);
    try {
      if (live && !missing) {
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
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <style>{ACCOUNT_CARD_CSS}</style>
      <section className="account-card" id="account-notifications" data-testid="account-notifications">
        <header>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, lineHeight: '26px', fontWeight: 700, margin: 0 }}>
            Notifications
          </h2>
          <p style={{ fontSize: 15, lineHeight: '19px', color: 'var(--muted)', margin: '4px 0 0' }}>
            {staff ? 'Email and in-portal' : 'Choose what reaches your inbox'}
          </p>
        </header>
        {initialLoading ? (
          <div data-testid="account-notifications-loading" className="flex flex-col" style={{ gap: 24 }}>
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center" style={{ gap: 16, padding: '12px 0' }}>
                <span className="min-w-0 flex-1">
                  <span className="block animate-pulse" style={{ height: 12, width: '46%', borderRadius: 999, background: 'var(--surface-2)' }} />
                  <span className="mt-2 block animate-pulse" style={{ height: 10, width: '72%', borderRadius: 999, background: 'var(--surface-2)' }} />
                </span>
                <span className="animate-pulse" style={{ width: 40, height: 22, borderRadius: 999, background: 'var(--surface-2)' }} />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="flex flex-col">
              {keys.map((key) => (
                <NotificationRow
                  key={key}
                  prefKey={key}
                  on={prefs[key]}
                  disabled={saving}
                  onToggle={() => {
                    dirty.current = true;
                    setPrefs((current) => ({ ...current, [key]: !current[key] }));
                    setError(false);
                    setSaved(false);
                  }}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              data-testid="account-save-notifications"
              className="account-sign-out inline-flex items-center justify-center self-start"
              style={{
                background: 'var(--fg)',
                color: 'var(--bg)',
                border: '1px solid transparent',
                borderRadius: 9,
                fontFamily: 'var(--font-body)',
                fontSize: 14,
                fontWeight: 500,
                padding: '12px 16px',
                opacity: saving ? 0.55 : 1,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </>
        )}
        {saved && !error ? (
          <p data-testid="account-save-success" role="status" style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
            Settings saved
          </p>
        ) : null}
        {error ? (
          <p data-testid="account-save-error" role="alert" style={{ fontSize: 14, fontWeight: 600, color: 'var(--danger)', margin: 0 }}>
            Could not save your settings. Try again.
          </p>
        ) : null}
        {loadFailed ? (
          <p data-testid="account-notifications-load-error" style={{ fontSize: 14, color: 'var(--danger)', margin: 0 }}>
            We could not load your notification settings. Try again.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function NotificationRow({
  prefKey,
  on,
  disabled,
  onToggle,
}: {
  prefKey: NotificationPrefKey;
  on: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const copy = NOTIFICATION_COPY[prefKey];
  return (
    <div className="flex items-center" style={{ gap: 16, padding: '12px 0' }}>
      <div className="min-w-0 flex-1">
        <p style={{ fontSize: 15, lineHeight: '20px', fontWeight: 600, margin: 0 }}>{copy.label}</p>
        <p style={{ fontSize: 13, lineHeight: '16px', color: 'var(--muted)', margin: '4px 0 0' }}>{copy.body}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={copy.label}
        disabled={disabled}
        data-testid={`notify-${prefKey}`}
        onClick={onToggle}
        className="account-theme-toggle relative shrink-0"
        style={{
          width: 40,
          height: 22,
          borderRadius: 999,
          border: on ? '1px solid transparent' : '1px solid var(--border-2)',
          background: on ? 'var(--fg)' : 'var(--surface-2)',
          padding: 0,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.55 : 1,
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
}
