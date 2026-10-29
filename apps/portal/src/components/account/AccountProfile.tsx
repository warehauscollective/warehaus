'use client';

import { useId } from 'react';
import { clientInitials } from '@/lib/data/clientList';
import { ACCOUNT_CARD_CSS } from '@/components/account/accountCardCss';
import { ThemeControl } from '@/components/account/ThemeControl';

const PASSWORD_HINT =
  'Password changes are coming soon. Use Forgot password on the sign-in page for now.';

/** Drop a leading "Warehaus" so the org prefix is not repeated in the role. */
export function profileRoleLabel(role: string | null | undefined): string {
  const text = role?.trim() ?? '';
  return text.replace(/^Warehaus\s+/i, '').trim();
}

export function profileRoleLine(orgName: string | null | undefined, role: string | null | undefined): string | null {
  const org = orgName?.trim() ?? '';
  const roleText = profileRoleLabel(role);
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
          <ReadOnlyField label="Display name" value={displayName} testId="account-display-name" help="Set by Warehaus." />
          <ReadOnlyField
            label="Email"
            value={displayEmail}
            testId="account-email"
            help="Your sign-in email. Contact Warehaus to change it."
          />
          {lane ? <ReadOnlyField label="Owner lane" value={lane} testId="account-owner-lane" /> : null}
        </div>
        <PasswordButton />
      </section>
      <ThemeControl />
      <button
        type="button"
        data-testid="account-sign-out"
        onClick={onSignOut}
        className="account-sign-out inline-flex items-center justify-center self-start"
        style={{
          background: 'transparent',
          color: 'var(--fg)',
          border: '1px solid var(--border-2)',
          borderRadius: 9,
          fontFamily: 'var(--font-body)',
          fontSize: 14,
          fontWeight: 500,
          padding: '12px 16px',
          cursor: 'pointer',
        }}
      >
        Sign out
      </button>
    </div>
  );
}

function ReadOnlyField({
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
  return (
    <div className="flex flex-col" data-testid={testId} style={{ gap: 8 }}>
      <p
        className="ds-mono"
        style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', margin: 0 }}
      >
        {label}
      </p>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, lineHeight: '20px', margin: 0 }}>{value}</p>
      {help ? (
        <p style={{ fontSize: 13, lineHeight: '16px', color: 'var(--muted)', margin: 0 }}>{help}</p>
      ) : null}
    </div>
  );
}

function PasswordButton() {
  const hintId = useId();
  return (
    <div className="flex flex-col items-start" style={{ gap: 8 }}>
      <span
        tabIndex={0}
        aria-disabled="true"
        aria-describedby={hintId}
        title={PASSWORD_HINT}
        className="account-password-hint inline-flex"
        style={{ cursor: 'not-allowed', borderRadius: 9 }}
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
      </span>
      <p id={hintId} data-testid="account-change-password-hint" style={{ fontSize: 13, lineHeight: '16px', color: 'var(--muted)', margin: 0 }}>
        {PASSWORD_HINT}
      </p>
    </div>
  );
}
