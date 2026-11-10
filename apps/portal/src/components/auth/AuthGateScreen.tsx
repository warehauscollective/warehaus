'use client';

import { type ReactNode, useEffect } from 'react';
import { authGateAction, type AuthGateInput } from './authGateAction';

export function AuthGateScreen({
  snapshot,
  replace,
  signOut,
  onLink,
  children,
}: {
  snapshot: AuthGateInput;
  replace: (href: string) => void;
  signOut: () => Promise<void> | void;
  onLink: () => void;
  children?: ReactNode;
}) {
  const action = authGateAction(snapshot);
  const href = 'href' in action ? action.href : '';

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
      : action.type === 'wait'
        ? 'Finishing setup. We’re linking your staff access.'
        : action.type === 'unreachable'
          ? 'Could not reach the portal session. Refresh to try again.'
          : 'Checking access…';

  return (
    <div className="ds-scope flex h-[100dvh] items-center justify-center" data-testid="auth-gate" data-action={action.type}>
      <p className="ds-mono" style={{ fontSize: 'var(--t-sm)', color: action.type === 'unreachable' ? 'var(--danger)' : 'var(--muted)' }}>
        {message}
      </p>
    </div>
  );
}
