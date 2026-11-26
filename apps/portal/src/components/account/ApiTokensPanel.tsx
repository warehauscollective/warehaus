'use client';

import { useState, type CSSProperties, type FormEvent } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import { userFacingErrorMessage } from '@convex/_lib/userFacingError';
import { ACCOUNT_CARD_CSS } from '@/components/account/accountCardCss';
import { useSafeQuery } from '@/hooks/useSafeQuery';

export type ApiTokenRow = {
  id: string;
  name: string;
  prefix: string;
  scope: 'read' | 'read-write';
  revokedAt: number | null;
  lastUsedAt: number | null;
  createdAt: number;
  rateLimit: number;
};

function formatWhen(value: number | null): string {
  if (value == null) return 'Never';
  return new Date(value).toLocaleString();
}

/**
 * Staff token list. `revealed` is the raw token from the create response.
 * It is not part of the stored rows, and dismissing it removes it from the page.
 */
const KEY_STYLE: CSSProperties = {
  display: 'block',
  marginBottom: 8,
  fontSize: 11,
  lineHeight: '14px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
};

const INPUT_STYLE: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  height: 46,
  padding: '12px 16px',
  borderRadius: 18,
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--fg)',
  fontFamily: 'var(--font-body)',
  fontSize: 15,
  lineHeight: '20px',
};

const BUTTON_BASE: CSSProperties = {
  borderRadius: 9,
  fontFamily: 'var(--font-body)',
  fontSize: 14,
  fontWeight: 500,
  lineHeight: '18px',
  padding: '12px 16px',
  cursor: 'pointer',
};

const PRIMARY_BUTTON: CSSProperties = {
  ...BUTTON_BASE,
  background: 'var(--fg)',
  color: 'var(--bg)',
  border: '1px solid transparent',
};

const SECONDARY_BUTTON: CSSProperties = {
  ...BUTTON_BASE,
  background: 'transparent',
  color: 'var(--fg)',
  border: '1px solid var(--border-2)',
};

/**
 * Staff token list. `revealed` is the raw token from the create response.
 * It is not part of the stored rows, and dismissing it removes it from the page.
 * Layout follows Figma A08 · API tokens (Organism/API tokens).
 */
export function ApiTokensView({
  tokens,
  revealed,
  error,
  pending,
  onCreate,
  onRevoke,
  onDismiss,
}: {
  tokens: ApiTokenRow[];
  revealed: string | null;
  error: string | null;
  pending: boolean;
  onCreate: (input: { name: string; scope: 'read' | 'read-write' }) => void;
  onRevoke: (id: string) => void;
  onDismiss: () => void;
}) {
  return (
    <div className="account-profile flex h-full min-h-0 flex-col overflow-y-auto" data-testid="api-tokens" data-page-scroll="">
      <style>{ACCOUNT_CARD_CSS}</style>
      <section className="account-card" data-testid="api-tokens-card">
        <header>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, lineHeight: '26px', fontWeight: 700, margin: 0 }}>
            API tokens
          </h2>
          <p style={{ fontSize: 13, lineHeight: '19px', color: 'var(--muted)', margin: '4px 0 0' }}>
            One token per tool. A token is shown once, then only its prefix is kept.
          </p>
        </header>
        {revealed ? (
          <div
            data-testid="api-token-reveal"
            className="flex flex-col items-start"
            style={{ gap: 12, padding: 20, borderRadius: 18, border: '1px solid var(--border-2)' }}
          >
            <p style={{ margin: 0, fontSize: 15, lineHeight: '20px', fontWeight: 500 }}>
              Copy this token now. It will not be shown again.
            </p>
            <input
              data-testid="api-token-secret"
              readOnly
              value={revealed}
              aria-label="New API token"
              style={{ ...INPUT_STYLE, height: 'auto', fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}
            />
            <button type="button" data-testid="api-token-dismiss" onClick={onDismiss} className="account-sign-out" style={SECONDARY_BUTTON}>
              Done
            </button>
          </div>
        ) : null}
        <form
          data-testid="api-token-form"
          className="flex flex-col items-start"
          style={{ gap: 16 }}
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const name = String(data.get('name') ?? '');
            const scope = data.get('scope') === 'read' ? 'read' : 'read-write';
            onCreate({ name, scope });
            event.currentTarget.reset();
          }}
        >
          <label style={{ display: 'block', width: '100%' }}>
            <span className="ds-mono" style={KEY_STYLE}>Tool name</span>
            <input name="name" data-testid="api-token-name" required autoComplete="off" placeholder="cursor-portal" style={INPUT_STYLE} />
          </label>
          <label style={{ display: 'block', width: '100%' }}>
            <span className="ds-mono" style={KEY_STYLE}>Scope</span>
            <span className="relative block">
              <select
                name="scope"
                data-testid="api-token-scope"
                defaultValue="read-write"
                style={{ ...INPUT_STYLE, appearance: 'none', paddingRight: 44, cursor: 'pointer' }}
              >
                <option value="read">Read</option>
                <option value="read-write">Read and write</option>
              </select>
              <svg
                aria-hidden
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ position: 'absolute', right: 16, top: 15, pointerEvents: 'none', color: 'var(--muted)' }}
              >
                <path d="m19 9-7 7-7-7" />
              </svg>
            </span>
          </label>
          <button
            type="submit"
            data-testid="api-token-create"
            disabled={pending}
            className="account-sign-out"
            style={{ ...PRIMARY_BUTTON, opacity: pending ? 0.55 : 1, cursor: pending ? 'not-allowed' : 'pointer' }}
          >
            Create token
          </button>
        </form>
        {error ? (
          <p data-testid="api-token-error" style={{ color: 'var(--danger-text)', fontSize: 14, lineHeight: '19px', margin: 0 }}>
            {error}
          </p>
        ) : null}
        {tokens.length === 0 ? (
          <p data-testid="api-token-empty" style={{ margin: 0, fontSize: 15, lineHeight: '20px', color: 'var(--muted)' }}>
            No tokens yet.
          </p>
        ) : (
          <ul data-testid="api-token-list" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
            {tokens.map((token) => (
              <li
                key={token.id}
                data-testid="api-token-row"
                className="flex items-center"
                style={{ justifyContent: 'space-between', gap: 24, padding: '24px 0', borderBottom: '1px solid var(--border)' }}
              >
                <span className="min-w-0">
                  <span style={{ display: 'block', fontSize: 15, lineHeight: '20px', fontWeight: 500 }}>{token.name}</span>
                  <span style={{ display: 'block', marginTop: 4, fontSize: 13, lineHeight: '19px', color: 'var(--muted)' }}>
                    {token.prefix}… · {token.scope === 'read' ? 'Read' : 'Read and write'} · {token.rateLimit}/min · Last used {formatWhen(token.lastUsedAt)}
                    {token.revokedAt != null ? ' · Revoked' : ''}
                  </span>
                </span>
                {token.revokedAt == null ? (
                  <button type="button" data-testid="api-token-revoke" onClick={() => onRevoke(token.id)} className="shrink-0" style={SECONDARY_BUTTON}>
                    Revoke
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function ApiTokensPanel({ live, hostSlug }: { live: boolean; hostSlug?: string }) {
  const tokens = useSafeQuery<ApiTokenRow[]>(api.portalTokens.list, live ? { hostSlug } : 'skip');
  const createToken = useMutation(api.portalTokens.create);
  const revokeToken = useMutation(api.portalTokens.revoke);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!live) {
    return (
      <ApiTokensView
        tokens={[]}
        revealed={null}
        error={error}
        pending={false}
        onCreate={() => setError('Tokens are available on the live portal.')}
        onRevoke={() => undefined}
        onDismiss={() => undefined}
      />
    );
  }

  return (
    <ApiTokensView
      tokens={tokens.data ?? []}
      revealed={revealed}
      error={error ?? tokens.error}
      pending={pending || tokens.loading}
      onDismiss={() => setRevealed(null)}
      onCreate={(input) => {
        setPending(true);
        setError(null);
        void createToken({ ...input, hostSlug })
          .then((result) => setRevealed(result.token))
          .catch((cause: unknown) => setError(userFacingErrorMessage(cause, 'Could not create the token')))
          .finally(() => setPending(false));
      }}
      onRevoke={(tokenId) => {
        setError(null);
        void revokeToken({ tokenId: tokenId as never, hostSlug }).catch((cause: unknown) => {
          setError(userFacingErrorMessage(cause, 'Could not revoke the token'));
        });
      }}
    />
  );
}
