'use client';

import { useState, type FormEvent } from 'react';
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
          <p style={{ fontSize: 15, lineHeight: '19px', color: 'var(--muted)', margin: '4px 0 0' }}>
            One token per tool. A token is shown once, then only its prefix is kept.
          </p>
        </header>
        {revealed ? (
          <div data-testid="api-token-reveal">
            <p style={{ margin: '0 0 8px', fontSize: 15 }}>Copy this token now. It will not be shown again.</p>
            <input
              data-testid="api-token-secret"
              readOnly
              value={revealed}
              aria-label="New API token"
              style={{ width: '100%', fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}
            />
            <button type="button" data-testid="api-token-dismiss" onClick={onDismiss} style={{ marginTop: 12 }}>
              Done
            </button>
          </div>
        ) : null}
        <form
          data-testid="api-token-form"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const name = String(data.get('name') ?? '');
            const scope = data.get('scope') === 'read' ? 'read' : 'read-write';
            onCreate({ name, scope });
            event.currentTarget.reset();
          }}
        >
          <label style={{ display: 'block', marginBottom: 12 }}>
            <span style={{ display: 'block', marginBottom: 4 }}>Tool name</span>
            <input name="name" data-testid="api-token-name" required autoComplete="off" placeholder="cursor-portal" />
          </label>
          <label style={{ display: 'block', marginBottom: 12 }}>
            <span style={{ display: 'block', marginBottom: 4 }}>Scope</span>
            <select name="scope" data-testid="api-token-scope" defaultValue="read-write">
              <option value="read">Read</option>
              <option value="read-write">Read and write</option>
            </select>
          </label>
          <button type="submit" data-testid="api-token-create" disabled={pending}>
            Create token
          </button>
        </form>
        {error ? (
          <p data-testid="api-token-error" style={{ color: 'var(--danger, #9b2c2c)', margin: 0 }}>
            {error}
          </p>
        ) : null}
        {tokens.length === 0 ? (
          <p data-testid="api-token-empty" style={{ margin: 0, color: 'var(--muted)' }}>
            No tokens yet.
          </p>
        ) : (
          <ul data-testid="api-token-list" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {tokens.map((token) => (
              <li key={token.id} data-testid="api-token-row" style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span>
                  <strong>{token.name}</strong>
                  <span style={{ display: 'block', color: 'var(--muted)' }}>
                    {token.prefix}… · {token.scope === 'read' ? 'Read' : 'Read and write'} · {token.rateLimit}/min · Last used {formatWhen(token.lastUsedAt)}
                    {token.revokedAt != null ? ' · Revoked' : ''}
                  </span>
                </span>
                {token.revokedAt == null ? (
                  <button type="button" data-testid="api-token-revoke" onClick={() => onRevoke(token.id)}>
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
