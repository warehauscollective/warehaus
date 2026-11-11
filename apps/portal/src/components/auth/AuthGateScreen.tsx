'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { STAFF_LINK_WAIT_MS } from '@/lib/staffLinkWait';
import { STAFF_ACCESS_CONFLICT_MESSAGE, authGateAction, type AuthGateInput } from './authGateAction';

export function AuthGateScreen({
  snapshot,
  replace,
  signOut,
  onLink,
  children,
  timeoutMs = STAFF_LINK_WAIT_MS,
  retrySignal = 0,
}: {
  snapshot: AuthGateInput;
  replace: (href: string) => void;
  signOut: () => Promise<void> | void;
  onLink: () => void;
  children?: ReactNode;
  timeoutMs?: number;
  retrySignal?: number;
}) {
  const action = authGateAction(snapshot);
  const href = 'href' in action ? action.href : '';
  const [slow, setSlow] = useState(false);
  const [waits, setWaits] = useState(0);

  useEffect(() => {
    setWaits(retrySignal);
  }, [retrySignal]);

  useEffect(() => {
    if (action.type !== 'wait') {
      setSlow(false);
      return;
    }
    setSlow(false);
    const id = setTimeout(() => setSlow(true), timeoutMs);
    return () => clearTimeout(id);
  }, [action.type, timeoutMs, waits]);

  useEffect(() => {
    if (action.type === 'login') {
      replace(href);
      return;
    }
    if (action.type === 'sign-out') {
      void (async () => {
        await signOut();
        replace(href);
      })();
      return;
    }
    if (action.type === 'link') onLink();
  }, [action.type, href, replace, signOut, onLink]);

  if (action.type === 'ready') return <>{children}</>;

  const message =
    action.type === 'sign-out'
      ? 'Access denied — redirecting…'
      : action.type === 'conflict'
        ? STAFF_ACCESS_CONFLICT_MESSAGE
        : action.type === 'wait'
          ? 'Finishing setup. We’re linking your staff access.'
          : action.type === 'unreachable'
            ? 'Could not reach the portal session. Refresh to try again.'
            : 'Checking access…';

  return (
    <div className="ds-scope flex h-[100dvh] items-center justify-center" data-testid="auth-gate" data-action={action.type}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start', maxWidth: 420 }}>
        <p className="ds-mono" style={{ fontSize: 'var(--t-sm)', color: action.type === 'unreachable' ? 'var(--danger)' : 'var(--muted)', margin: 0 }}>
          {message}
        </p>
        {action.type === 'wait' && slow ? (
          <>
            <p data-testid="finishing-slow" style={{ margin: 0, fontSize: 14, lineHeight: '22px', color: 'var(--muted)' }}>
              This is taking longer than usual. Your invite is still accepted. Stay on this page and try again.
            </p>
            <button type="button" onClick={() => setWaits((value) => value + 1)} style={{ minHeight: 42 }}>
              Try again
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
