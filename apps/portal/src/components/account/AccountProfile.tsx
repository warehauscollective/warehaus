'use client';

import { useId, type ReactNode } from 'react';
import { clientInitials } from '@/lib/data/clientList';
import { ACCOUNT_CARD_CSS } from '@/components/account/accountCardCss';
import { ThemeControl } from '@/components/account/ThemeControl';

const PASSWORD_HINT = 'Changing your password is not available here yet.';

export function profileRoleLine(orgName: string | null | undefined, role: string | null | undefined): string | null {
  const org = orgName?.trim() ?? '';
  const roleText = role?.trim() ?? '';
  if (org && roleText) return `${org} · ${roleText}`;
  return org || roleText || null;
}

export function AccountProfile({
  name,
  email,
  role,
  orgName,
  ownerLane,
  onSignOut,
}: {
  name: string;
  email: string;
  role?: string | null;
  orgName?: string | null;
  /** Shown only when a value exists. There is no owner-lane field in the session. */
  ownerLane?: string | null;
  onSignOut?: () => void;
}) {
  const displayName = name.trim() || '—';
  const displayEmail = email.trim() || '—';
  const roleLine = profileRoleLine(orgName, role);
  const lane = ownerLane?.trim() ?? '';
  return (
    <div className="account-profile flex h-full min-h-0 flex-col overflow-y-auto" data-testid="account-profile">
      <style>{ACCOUNT_CARD_CSS}</style>
      <section className="account-card" data-testid="account-profile-card">
        <header>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, lineHeight: '26px', fontWeight: 700, margin: 0 }}>
            Profile
          </h2>
          <p style={{ fontSize: 15, lineHeight: '19px', color: 'var(--muted)', margin: '4px 0 0' }}>
            How you appear in the portal
          </p>
        </header>
        <div className="flex items-center" style={{ gap: 24 }}>
          <span
            data-testid="account-avatar"
            className="ds-mono inline-flex shrink-0 items-center justify-center"
            style={{
              width: 56,
              height: 56,
              borderRadius: 999,
              background: 'var(--surface-2)',
              border: '1px solid var(--border-2, var(--border))',
              fontSize: 14,
              color: 'var(--muted)',
            }}
          >
            {clientInitials(displayName)}
          </span>
          <div className="min-w-0">
            <p style={{ fontSize: 18, lineHeight: '24px', fontWeight: 600, margin: 0 }}>{displayName}</p>
            {roleLine ? (
              <p className="ds-mono" data-testid="account-role" style={{ fontSize: 12, lineHeight: '16px', color: 'var(--muted)', margin: '4px 0 0' }}>
                {roleLine}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col" style={{ gap: 32 }}>
          <ReadOnlyField id="account-display-name" label="Display name" value={displayName} testId="account-display-name" />
          <ReadOnlyField
            id="account-email"
            label="Email"
            value={displayEmail}
            testId="account-email"
            help="Your sign-in email. Contact Warehaus to change it."
          />
          {lane ? <ReadOnlyField id="account-owner-lane" label="Owner lane" value={lane} testId="account-owner-lane" /> : null}
        </div>
        <PasswordButton />
      </section>
      <ThemeControl />
      <div className="flex justify-end">
        <button
          type="button"
          data-testid="account-sign-out"
          onClick={onSignOut}
          className="inline-flex items-center justify-center"
          style={{
            background: 'transparent',
            color: 'var(--muted)',
            border: '1px solid var(--border)',
            borderRadius: 9,
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--t-sm)',
            padding: '0.65rem 1.1rem',
            cursor: 'pointer',
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="ds-mono"
      style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}
    >
      {children}
    </label>
  );
}

function ReadOnlyField({
  id,
  label,
  value,
  help,
  testId,
}: {
  id: string;
  label: string;
  value: string;
  help?: string;
  testId: string;
}) {
  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <input id={id} className="account-field" readOnly value={value} data-testid={testId} aria-readonly="true" />
      {help ? (
        <p style={{ fontSize: 13, lineHeight: '16px', color: 'var(--muted)', margin: 0 }}>{help}</p>
      ) : null}
    </div>
  );
}

function PasswordButton() {
  const hintId = useId();
  return (
    <span
      tabIndex={0}
      aria-disabled="true"
      aria-describedby={hintId}
      title={PASSWORD_HINT}
      data-testid="account-change-password-hint"
      className="inline-flex self-start"
      style={{ cursor: 'not-allowed' }}
    >
      <button
        type="button"
        disabled
        aria-disabled="true"
        tabIndex={-1}
        data-testid="account-change-password"
        style={{
          pointerEvents: 'none',
          background: 'transparent',
          color: 'var(--fg)',
          border: '1px solid var(--border-2)',
          borderRadius: 9,
          fontFamily: 'var(--font-body)',
          fontSize: 14,
          fontWeight: 500,
          padding: '12px 16px',
          cursor: 'not-allowed',
          opacity: 0.4,
        }}
      >
        Change password
      </button>
      <span id={hintId} className="sr-only">
        {PASSWORD_HINT}
      </span>
    </span>
  );
}
