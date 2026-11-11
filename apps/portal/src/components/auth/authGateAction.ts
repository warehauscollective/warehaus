import { STAFF_ACCESS_CONFLICT_MESSAGE } from '@convex/_lib/inviteFlow';
import { safeRedirectPath } from '@convex/_lib/safeRedirect';

export { STAFF_ACCESS_CONFLICT_MESSAGE };

export type AuthGateInput = {
  configured: boolean;
  sessionPending: boolean;
  hasUser: boolean;
  joinError: string | null;
  linkStatus: string;
  joining: boolean;
  linking: boolean;
  staffInviteInProgress: boolean;
  staffInviteCheckPending: boolean;
  staffInviteConflicted: boolean;
  hasPortalSession: boolean;
  linkQueryError: boolean;
  pathname: string;
};

export type AuthGateAction =
  | { type: 'login'; href: string }
  | { type: 'sign-out'; href: string }
  | { type: 'link' }
  | { type: 'wait' }
  | { type: 'conflict' }
  | { type: 'ready' }
  | { type: 'checking' }
  | { type: 'unreachable' };

function loginHref(pathname: string): string {
  const nextPath = safeRedirectPath(pathname);
  const next = nextPath !== '/' ? `?next=${encodeURIComponent(nextPath)}` : '';
  return `/login${next}`;
}

/**
 * A staff invite that is accepted and still linking must not be signed out.
 * The check has to settle before a join error can send them to /login.
 */
export function authGateAction(input: AuthGateInput): AuthGateAction {
  if (!input.configured) return { type: 'login', href: '/login' };
  if (input.sessionPending || input.staffInviteCheckPending) return { type: 'checking' };
  if (!input.hasUser) return { type: 'login', href: loginHref(input.pathname) };
  if (input.staffInviteInProgress && input.linkStatus !== 'linked') return { type: 'wait' };
  if (input.staffInviteConflicted && input.linkStatus !== 'linked') return { type: 'conflict' };
  if (input.joinError && input.linkStatus !== 'linked') {
    return { type: 'sign-out', href: `/login?error=${encodeURIComponent(input.joinError)}` };
  }
  if (input.linkQueryError && input.linkStatus !== 'linked') return { type: 'unreachable' };
  if (input.linkStatus === 'unlinked' && !input.joining && !input.linking) return { type: 'link' };
  if (
    input.hasUser &&
    input.linkStatus === 'linked' &&
    input.hasPortalSession &&
    !input.joining &&
    !input.linkQueryError
  ) {
    return { type: 'ready' };
  }
  return { type: 'checking' };
}
