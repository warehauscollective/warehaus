'use client';

import { useCallback, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useConvexAuth, useMutation } from 'convex/react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Circle, CircleCheck, Clock, Lock, LogOut, Mail, ShieldCheck } from 'lucide-react';
import { api } from '@convex/_generated/api';
import { authClient } from '@/lib/auth-client';
import {
  acceptFailureCopy,
  acceptOnceAuthenticated,
  knownSessionEmail,
  lockedInviteEmail,
  planJoinSteps,
  refreshConvexSession,
} from '@/lib/acceptSession';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { isConvexConfigured } from '@/lib/convex/client';
import { STAFF_ACCESS_CONFLICT_MESSAGE, renewRequestMessage } from '@convex/_lib/inviteFlow';
import { inviteEmailMarkup } from '@convex/_lib/inviteEmailTemplate';
import { userFacingErrorMessage } from '@convex/_lib/userFacingError';
import { rememberStaffJoined } from '@/lib/staffJoined';
import { useStaffLinkWait } from '@/lib/staffLinkWait';
import { StaffLinkFinish } from '@/components/auth/StaffLinkFinish';

type Preview = {
  status:
    | 'sign-in'
    | 'create-account'
    | 'ready'
    | 'different-email'
    | 'unverified'
    | 'unusable'
    | 'expired'
    | 'used'
    | 'revoked'
    | 'off'
    | 'already'
    | 'error';
  invitedEmail?: string;
  signedInEmail?: string;
  inviterName?: string | null;
  inviterEmail?: string | null;
  inviteeName?: string | null;
  expiresAt?: number | null;
  usedAt?: number | null;
  sentAtLabel?: string | null;
};

/** Stable across the server render and hydration. A random id mismatches and shows the dev issue badge. */
export function inviteReference(token: string): string {
  if (!token) return 'INV-7F3C-0921';
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `INV-${(hash >>> 0).toString(16).slice(0, 8).toUpperCase().padStart(8, '0')}`;
}

const FIXTURES: Record<string, Preview> = {
  new: { status: 'create-account', invitedEmail: 'jordan@warehaus.studio', inviteeName: 'Jordan Blake', inviterName: 'Peter Roquemore', inviterEmail: 'peter@warehaus.studio' },
  existing: { status: 'sign-in', invitedEmail: 'jordan@warehaus.studio', inviteeName: 'Jordan Blake', inviterName: 'Peter Roquemore', inviterEmail: 'peter@warehaus.studio' },
  expired: {
    status: 'expired',
    invitedEmail: 'jordan@warehaus.studio',
    inviterName: 'Peter Roquemore', inviterEmail: 'peter@warehaus.studio',
    expiresAt: Date.UTC(2026, 10, 2),
  },
  used: { status: 'used', invitedEmail: 'jordan@warehaus.studio', inviteeName: 'Jordan Blake', inviterName: 'Peter Roquemore', inviterEmail: 'peter@warehaus.studio', usedAt: Date.UTC(2026, 10, 9) },
  revoked: { status: 'revoked', invitedEmail: 'jordan@warehaus.studio', inviterName: 'Peter Roquemore', inviterEmail: 'peter@warehaus.studio' },
  invalid: { status: 'unusable' },
  unavailable: { status: 'off', inviterName: 'Peter Roquemore', inviterEmail: 'peter@warehaus.studio' },
  'signed-in': { status: 'ready', invitedEmail: 'jordan@warehaus.studio', inviterName: 'Peter Roquemore', inviterEmail: 'peter@warehaus.studio' },
  different: {
    status: 'different-email',
    invitedEmail: 'jordan@warehaus.studio',
    signedInEmail: 'jordan.blake@gmail.com',
    inviterName: 'Peter Roquemore', inviterEmail: 'peter@warehaus.studio',
  },
  already: { status: 'already', invitedEmail: 'avery@warehaus.studio', inviterName: 'Peter Roquemore', inviterEmail: 'peter@warehaus.studio' },
  unverified: { status: 'unverified', invitedEmail: 'jordan@warehaus.studio', inviteeName: 'Jordan Blake', inviterName: 'Peter Roquemore', inviterEmail: 'peter@warehaus.studio', sentAtLabel: '10:42 AM' },
  generic: { status: 'error', invitedEmail: 'jordan@warehaus.studio', inviterName: 'Peter Roquemore', inviterEmail: 'peter@warehaus.studio' },
  'wrong-password': { status: 'sign-in', invitedEmail: 'jordan@warehaus.studio', inviteeName: 'Jordan Blake', inviterName: 'Peter Roquemore', inviterEmail: 'peter@warehaus.studio' },
};

function rules(password: string, confirm: string) {
  return {
    length: password.length >= 8,
    mix: /[A-Za-z]/.test(password) && /\d/.test(password),
    match: password.length > 0 && password === confirm,
  };
}

function dayLabel(ms: number | null | undefined): string {
  if (!ms) return '';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(ms);
}

const INVITER_FALLBACK = 'A Warehaus team member';
const WRONG_PASSWORD = "That password doesn't match this email.";

function firstName(name: string | null | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed || trimmed === INVITER_FALLBACK) return 'them';
  return trimmed.split(/\s+/)[0] || 'them';
}

function asScreen(status: string | undefined): Preview['status'] | null {
  switch (status) {
    case 'sign-in':
    case 'create-account':
    case 'ready':
    case 'different-email':
    case 'unverified':
    case 'unusable':
    case 'expired':
    case 'used':
    case 'revoked':
    case 'off':
    case 'already':
    case 'error':
      return status;
    default:
      return null;
  }
}

function joinedName(email: string): string {
  const local = email.split('@')[0]?.replace(/[._-]+/g, ' ').trim() || 'there';
  return local.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function SignedInLockedEmail({
  invitedEmail,
  sessionEmail,
}: {
  invitedEmail?: string | null;
  sessionEmail?: string | null;
}) {
  return <LockedEmail email={lockedInviteEmail({ invitedEmail, sessionEmail })} />;
}

export function SignedInAcceptCopy({ email }: { email: string | null | undefined }) {
  const known = knownSessionEmail(email);
  if (!known) {
    return (
      <p style={lede} data-testid="accept-session-pending">
        Checking your sign-in…
      </p>
    );
  }
  return (
    <p style={lede} data-testid="accept-signed-in">
      You’re signed in as {known}. There’s no password step. Accept to join Warehaus as staff.
    </p>
  );
}

type AcceptResult = { ok: boolean; status?: string; message?: string; signedInEmail?: string };

export type AcceptInviteIO = {
  token: string;
  previewKey: string | null;
  forced: Preview | undefined;
  preview: (Preview & { portalName?: string }) | null;
  previewLoading: boolean;
  configured: boolean;
  sessionEmail: string | null;
  readAuthenticated: () => boolean;
  refreshSession: () => Promise<void>;
  accept: (args: { token: string }) => Promise<AcceptResult>;
  requestRenew: (args: { token: string }) => Promise<unknown>;
  signUpEmail: (args: {
    email: string;
    password: string;
    name: string;
    callbackURL: string;
    inviteToken: string;
  }) => Promise<{ error: { message?: string } | null }>;
  signInEmail: (args: { email: string; password: string }) => Promise<{ error: { message?: string } | null }>;
  sendVerification: (args: { email: string; callbackURL: string }) => Promise<unknown>;
  replace: (path: string) => void;
  refresh: () => void;
  link: { state: string; isStaff?: boolean } | null | undefined;
  conflicted: boolean;
  /** When set, tests replace the staff-link wait. Production leaves it unset. */
  begin?: (value: { name: string; passwordSet: boolean }) => Promise<void>;
};

export function AcceptInvite({ io }: { io?: AcceptInviteIO }) {
  if (io) return <AcceptInviteBody io={io} />;
  if (!isConvexConfigured()) return <AcceptInviteLive />;
  return <AcceptInviteAuthed />;
}

function AcceptInviteAuthed() {
  const { isAuthenticated } = useConvexAuth();
  const authenticated = useRef(isAuthenticated);
  authenticated.current = isAuthenticated;
  const readAuthenticated = useCallback(() => authenticated.current, []);
  const refreshSession = useCallback(() => refreshConvexSession(authClient), []);
  return <AcceptInviteLive readAuthenticated={readAuthenticated} refreshSession={refreshSession} />;
}

function AcceptInviteLive({
  readAuthenticated = () => false,
  refreshSession = async () => {},
}: {
  readAuthenticated?: () => boolean;
  refreshSession?: () => Promise<void>;
}) {
  const router = useRouter();
  // First server and client render both see an empty query. The layout effect
  // reads the real URL before paint, so useState is never seeded from a
  // search param that can differ during hydration.
  const [query, setQuery] = useState({ token: '', previewKey: null as string | null });
  useLayoutEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fixtures =
      process.env.NEXT_PUBLIC_PORTAL_FIXTURES === '1' && window.__WH_FIXTURE_PREVIEW === true;
    setQuery({
      token: params.get('token') ?? '',
      previewKey: fixtures ? params.get('invitePreview') : null,
    });
  }, []);
  const { token, previewKey } = query;
  const forced = previewKey ? FIXTURES[previewKey] : undefined;
  const configured = isConvexConfigured();
  const live = useSafeQuery<Preview & { portalName?: string }>(
    api.invites.previewAccept,
    !forced && configured && token ? { token } : 'skip',
  );
  const accept = useMutation(api.invites.accept);
  const requestRenew = useMutation(api.invites.requestRenew);
  const linkState = useSafeQuery<{ state: string; isStaff?: boolean }>(
    api.contacts.getLinkStatus,
    !forced && configured ? {} : 'skip',
  );
  const inviteProgress = useSafeQuery<{ inProgress: boolean; conflicted?: boolean }>(
    api.contacts.staffInviteInProgress,
    !forced && configured ? {} : 'skip',
  );
  const { data: authSession } = authClient.useSession();
  const replace = useCallback((path: string) => {
    router.replace(path);
  }, [router]);
  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);
  return (
    <AcceptInviteBody
      io={{
        token,
        previewKey,
        forced,
        preview: forced ?? live.data ?? null,
        previewLoading: live.loading,
        configured,
        sessionEmail: knownSessionEmail(authSession?.user?.email),
        readAuthenticated,
        refreshSession,
        accept,
        requestRenew,
        signUpEmail: (args) => authClient.signUp.email(args as never),
        signInEmail: (args) => authClient.signIn.email(args),
        sendVerification: (args) => authClient.sendVerificationEmail(args),
        replace,
        refresh,
        link: linkState.data,
        conflicted: inviteProgress.data?.conflicted === true,
      }}
    />
  );
}

function AcceptInviteBody({ io }: { io: AcceptInviteIO }) {
  const token = io.token;
  const previewKey = io.previewKey;
  const forced = io.forced;
  const configured = io.configured;
  const preview = io.preview;
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [signInMode, setSignInMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useLayoutEffect(() => {
    if (previewKey !== 'wrong-password') return;
    setPassword((current) => current || 'wrongpass1');
    setError((current) => current ?? WRONG_PASSWORD);
  }, [previewKey]);
  const [busy, setBusy] = useState(false);
  const [renewed, setRenewed] = useState(false);
  const reference = inviteReference(token);
  const [screen, setScreen] = useState<Preview['status'] | null>(null);
  const [accountCreated, setAccountCreated] = useState(false);
  const [awaitingAccept, setAwaitingAccept] = useState(false);
  const [held, setHeld] = useState(false);
  const state = rules(password, confirm);
  const ready = state.length && state.mix && state.match;
  const replace = io.replace;
  const wait = useStaffLinkWait({ token, link: io.link, replace });
  const begin = io.begin ?? wait.begin;
  const pendingFinish = useRef<{ name: string; passwordSet: boolean; inviterName?: string } | null>(null);
  const sessionEmail = io.sessionEmail ?? knownSessionEmail(preview?.signedInEmail);

  if (previewKey === 'email') return <InviteEmailPreview />;
  if (previewKey === 'finishing' || previewKey === 'finishing-slow') {
    return (
      <AcceptShell status="finishing" subtitle="Staff invite">
        <StaffLinkFinish slow={previewKey === 'finishing-slow'} onRetry={() => undefined} />
      </AcceptShell>
    );
  }

  async function join(event: FormEvent) {
    event.preventDefault();
    if (!ready || !preview?.invitedEmail) return;
    if (forced) {
      rememberStaffJoined({
        name: preview.inviteeName?.trim() || 'Jordan Blake',
        passwordSet: true,
        inviterName: preview.inviterName?.trim() || 'Peter Roquemore',
      });
      replace('/preview');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const steps = planJoinSteps({ accountCreated, awaitingAccept });
      if (steps.includes('sign-up')) {
        const signed = await io.signUpEmail({
          email: preview.invitedEmail,
          password,
          name: preview.invitedEmail.split('@')[0] ?? 'Staff',
          callbackURL: `/accept?token=${encodeURIComponent(token)}`,
          inviteToken: token,
        });
        if (signed.error) {
          setError(signed.error.message ?? 'We couldn’t finish joining');
          return;
        }
        setAccountCreated(true);
      }
      if (steps.includes('sign-in')) {
        const signedIn = await io.signInEmail({ email: preview.invitedEmail, password });
        if (signedIn.error) {
          setError(WRONG_PASSWORD);
          return;
        }
      }
      setAwaitingAccept(true);
      await finishAccept(preview.invitedEmail, true);
    } catch (err) {
      setError(acceptFailureCopy(userFacingErrorMessage(err, 'We couldn’t finish joining')));
    } finally {
      setBusy(false);
    }
  }

  async function retryAccept() {
    if (!preview?.invitedEmail) return;
    setBusy(true);
    setError(null);
    try {
      await finishAccept(preview.invitedEmail, true);
    } catch (err) {
      setError(acceptFailureCopy(userFacingErrorMessage(err, 'We couldn’t finish joining')));
    } finally {
      setBusy(false);
    }
  }

  async function finishAccept(nameEmail: string, passwordSet: boolean) {
    const gate = await acceptOnceAuthenticated({
      readAuthenticated: io.readAuthenticated,
      refresh: io.refreshSession,
      accept: () => io.accept({ token }),
    });
    if (!gate.ok) {
      setError(gate.message);
      return;
    }
    const result = gate.result;
    if (!result.ok) {
      const next = asScreen(result.status);
      if (next) setScreen(next);
      else setError(acceptFailureCopy(result.message ?? 'We couldn’t finish joining'));
      return;
    }
    const profile = preview?.inviteeName?.trim() || joinedName(nameEmail);
    const value = {
      name: profile,
      passwordSet,
      ...(preview?.inviterName?.trim() ? { inviterName: preview.inviterName.trim() } : {}),
    };
    pendingFinish.current = value;
    try {
      // join, confirmSignedIn, and signIn all await this, so a failed begin stays here.
      await begin(value);
      setHeld(false);
    } catch {
      setHeld(true);
    }
  }

  async function confirmSignedIn() {
    const nameEmail = sessionEmail ?? knownSessionEmail(preview?.invitedEmail);
    if (!nameEmail) return;
    if (forced) {
      rememberStaffJoined({
        name: preview?.inviteeName?.trim() || 'Jordan Blake',
        passwordSet: false,
        inviterName: preview?.inviterName?.trim() || 'Peter Roquemore',
      });
      replace('/preview');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await finishAccept(nameEmail, false);
    } catch (err) {
      setError(acceptFailureCopy(userFacingErrorMessage(err, 'We couldn’t finish joining')));
    } finally {
      setBusy(false);
    }
  }

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!preview?.invitedEmail || !password) return;
    if (forced) {
      rememberStaffJoined({
        name: preview.inviteeName?.trim() || 'Jordan Blake',
        passwordSet: false,
        inviterName: preview.inviterName?.trim() || 'Peter Roquemore',
      });
      replace('/preview');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const signed = await io.signInEmail({ email: preview.invitedEmail, password });
      if (signed.error) {
        setError(WRONG_PASSWORD);
        return;
      }
      await finishAccept(preview.invitedEmail, false);
    } catch (err) {
      setError(acceptFailureCopy(userFacingErrorMessage(err, 'Check your password and try again.')));
    } finally {
      setBusy(false);
    }
  }

  async function renew() {
    setRenewed(true);
    if (forced || !configured || !token) return;
    try {
      await io.requestRenew({ token });
    } catch {
      setRenewed(true);
    }
  }

  const status = screen ?? (signInMode && preview?.status === 'create-account' ? 'sign-in' : preview?.status);
  const email = preview?.invitedEmail ?? '';
  const readyEmail = sessionEmail ?? (forced ? knownSessionEmail(email) : null);
  const inviter = preview?.inviterName || INVITER_FALLBACK;
  const inviterEmail = preview?.inviterEmail ?? null;
  const subtitle =
    status === 'create-account' || status === 'sign-in' || status === 'ready'
      ? 'You’ve been invited to the Warehaus Portal'
      : 'Staff invite';

  const shellStatus = io.conflicted && !previewKey ? 'conflict' : wait.waiting || held ? 'finishing' : (status ?? 'loading');

  return (
    <AcceptShell status={shellStatus} subtitle={subtitle}>
        {io.conflicted && !previewKey ? (
          <ErrorCard
            icon={<AlertTriangle size={20} />}
            kicker="Staff invite"
            title="Setup didn’t finish"
            body={STAFF_ACCESS_CONFLICT_MESSAGE}
            action="Stay on this page"
            onAction={() => undefined}
          />
        ) : wait.waiting || held ? (
          <StaffLinkFinish
            slow={wait.slow || held}
            onRetry={() => {
              if (wait.waiting) {
                wait.retry();
                return;
              }
              const value = pendingFinish.current;
              if (!value) return;
              void begin(value).then(() => setHeld(false), () => setHeld(true));
            }}
          />
        ) : !preview ? (
          io.previewLoading ? (
            <Card>
              <p style={{ margin: 0, color: 'var(--accept-muted)' }}>Checking this invite…</p>
            </Card>
          ) : (
            <InvalidCard />
          )
        ) : status === 'create-account' ? (
          <Card>
            <div className="accept-stack">
              <Kicker>Staff invite</Kicker>
              <h1 style={title}>Join Warehaus as staff</h1>
              <p style={lede}>Set a password to finish. Opening this link from your email confirms your address, so there’s no separate verification step.</p>
            </div>
            <Inviter name={inviter} email={inviterEmail} />
            <LockedEmail email={email} hint={`This is the address ${firstName(inviter)} invited. It can’t be changed here.`} />
            {awaitingAccept ? (
              <div className="flex flex-col gap-4">
                {error ? <p style={{ margin: 0, color: 'var(--danger)', fontSize: 14 }}>{error}</p> : null}
                <div className="accept-actions">
                  <button type="button" disabled={busy} onClick={() => void retryAccept()} className="accept-primary" style={{ ...primary, opacity: busy ? 0.5 : 1 }}>
                    {busy ? 'Joining…' : 'Try again'}
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={(event) => void join(event)} className="flex flex-col gap-4">
                <Field label="Password" value={password} onChange={setPassword} />
                <Field label="Confirm password" value={confirm} onChange={setConfirm} />
                <Rule met={state.length} label="At least 8 characters" />
                <Rule met={state.mix} label="Includes a letter and a number" />
                <Rule met={state.match} label="Passwords match" />
                <Actions link="Already have an account? Sign in" onLink={() => setSignInMode(true)} label={busy ? 'Joining…' : accountCreated ? 'Try again' : 'Join Warehaus'} disabled={!ready || busy} />
                {ready ? null : (
                  <p className="accept-hint" style={{ margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--accept-muted)' }}>Join turns on when every rule is met.</p>
                )}
                {error ? <p style={{ margin: 0, color: 'var(--danger)', fontSize: 14 }}>{error}</p> : null}
              </form>
            )}
          </Card>
        ) : status === 'ready' ? (
          <Card>
            <div className="accept-stack">
              <Kicker>Staff invite</Kicker>
              <h1 style={title}>Accept your invite</h1>
              <SignedInAcceptCopy email={readyEmail} />
            </div>
            <Inviter name={inviter} email={inviterEmail} />
            <SignedInLockedEmail invitedEmail={preview?.invitedEmail} sessionEmail={sessionEmail ?? readyEmail} />
            <div className="accept-actions">
              <button type="button" disabled={busy || !readyEmail} onClick={() => void confirmSignedIn()} className="accept-primary" style={{ ...primary, opacity: busy || !readyEmail ? 0.5 : 1 }}>
                {busy ? 'Joining…' : 'Accept invite'}
              </button>
            </div>
            {error ? <p style={{ margin: 0, color: 'var(--danger)', fontSize: 14 }}>{error}</p> : null}
          </Card>
        ) : status === 'sign-in' ? (
          <Card>
            <div className="accept-stack">
              <Kicker>Staff invite</Kicker>
              <h1 style={title}>Sign in to accept</h1>
              <p style={lede}>{email || 'This address'} already has a Portal account. Sign in with it to join Warehaus as staff.</p>
            </div>
            <Inviter name={inviter} email={inviterEmail} />
            <LockedEmail email={email} />
            <form onSubmit={(event) => void signIn(event)} className="flex flex-col gap-4">
              <Field label="Password" value={password} onChange={setPassword} error={error} />
              <Actions link="Forgot password?" href="/forgot-password" label={busy ? 'Signing in…' : 'Sign in and join'} disabled={!password || busy} />
            </form>
          </Card>
        ) : status === 'expired' ? (
          <ErrorCard
            icon={<Clock size={20} />}
            phoneGap="expired"
            kicker="Invite expired"
            title="This invite has expired"
            body={`Invite links work for 7 days. This one expired on ${dayLabel(preview.expiresAt) || 'its expiry date'}. Request a new one and we’ll let ${firstName(inviter)} know.`}
            rows={[
              ['Invited', email],
              ['By', inviter],
            ]}
            link="Sign in instead"
            href="/login"
            action={renewed ? 'Request sent' : 'Request a new invite'}
            onAction={() => void renew()}
            note={renewed ? renewRequestMessage() : null}
          />
        ) : status === 'used' ? (
          <ErrorCard
            icon={<CircleCheck size={20} />}
            kicker="Invite already used"
            title="This invite has already been used"
            body={`It was accepted on ${dayLabel(preview.usedAt) || 'an earlier date'}. If that was you, sign in to continue.`}
            link="Forgot password?"
            href="/forgot-password"
            action="Sign in"
            actionHref="/login"
          />
        ) : status === 'revoked' ? (
          <ErrorCard
            icon={<AlertTriangle size={20} />}
            kicker="Invite revoked"
            title="This invite was revoked"
            body="It can’t be used. Ask the person who invited you to send a new one."
            action="Sign in"
            actionHref="/login"
          />
        ) : status === 'unusable' ? (
          <InvalidCard />
        ) : status === 'off' ? (
          <ErrorCard
            icon={<AlertTriangle size={20} />}
            kicker="Unavailable"
            title="Invites are unavailable"
            body="This link can’t be accepted right now. Nothing was changed."
            action="Sign in"
            actionHref="/login"
          />
        ) : status === 'different-email' ? (
          <ErrorCard
            icon={<LogOut size={20} />}
            kicker="Different account"
            title="You’re signed in as someone else"
            body="This invite is for a different email. Switch accounts to accept it."
            rows={[
              ['Invite for', email],
              ['Signed in as', knownSessionEmail(preview.signedInEmail) ?? 'Checking your sign-in…'],
            ]}
            link="Stay signed in"
            href="/"
            action="Switch account"
            actionHref="/login"
          />
        ) : status === 'already' ? (
          <ErrorCard
            icon={<ShieldCheck size={20} />}
            kicker="Already staff"
            title="You’re already on the Warehaus team"
            body={`${email || 'This email'} is already Warehaus Staff, so there’s nothing to accept.`}
            action="Go to the Portal"
            actionHref="/"
          />
        ) : status === 'unverified' ? (
          <ErrorCard
            icon={<Mail size={20} />}
            kicker="Verify your email"
            title="Confirm your email to finish"
            body={`Your account’s email isn’t verified yet. We sent a link to ${email || 'you'}. Open it, then come back to this invite.`}
            callout={preview.sentAtLabel ? `Sent at ${preview.sentAtLabel}` : 'Sent just now'}
            note="It can take a minute to arrive. Check spam if you don’t see it."
            link="Use a different account"
            href="/login"
            action="Resend verification email"
            onAction={() => void io.sendVerification({ email, callbackURL: `/accept?token=${encodeURIComponent(token)}` })}
          />
        ) : (
          <ErrorCard
            tone="danger"
            icon={<AlertTriangle size={20} />}
            kicker="Something went wrong"
            title="We couldn’t finish joining"
            body={`Your invite still works. Try again in a moment. If it keeps happening, send ${firstName(inviter)} the reference below.`}
            rows={[['Reference', reference]]}
            link="Back to sign in"
            href="/login"
            action="Try again"
            onAction={() => io.refresh()}
          />
        )}
    </AcceptShell>
  );
}

function InviteEmailPreview() {
  const html = inviteEmailMarkup({
    acceptUrl: 'https://portal.warehaus.studio/accept?token=preview',
    who: 'Peter Roquemore (peter@warehaus.studio)',
    action: 'Accept the invite to set your password and confirm your email in one step.',
    button: 'Accept invite',
    expiryDetail: 'It works once and stops working on Nov 16, 2026. If it expires, ask Peter for a new invite.',
    because: 'You’re getting this because Peter Roquemore invited jordan@warehaus.studio to the Warehaus Portal.',
    wordmarkSrc: '/icons/wordmark-ink.png',
  });
  return (
    <main
      data-testid="invite-email"
      data-theme="light"
      style={{ background: '#fdfdfe', color: '#0a0a0b', colorScheme: 'light', minHeight: '100dvh' }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function AcceptShell({
  status,
  subtitle,
  children,
}: {
  status: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <main
      className="accept-invite ds-scope flex min-h-[100dvh] items-start justify-center px-6 pb-12 pt-12 md:items-center md:py-16"
      data-testid="accept-invite"
      data-status={status}
    >
      <div className="flex w-full flex-col gap-8" style={{ width: '100%', maxWidth: 480 }}>
        <header style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="Warehaus"
            src="/icons/wordmark.svg"
            width={260}
            height={35}
            className="portal-wordmark accept-wordmark"
          />
          <p style={{ margin: 0, fontSize: 14, lineHeight: '21px', textAlign: 'center', color: 'var(--accept-muted)' }}>{subtitle}</p>
        </header>
        {children}
      </div>
    </main>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <section className="accept-card">{children}</section>;
}

function Kicker({ children }: { children: ReactNode }) {
  return (
    <p className="ds-mono" style={{ margin: 0, fontSize: 12, lineHeight: '18px', letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--accept-muted)' }}>
      {children}
    </p>
  );
}

function Inviter({ name, email }: { name: string; email?: string | null }) {
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const detail = email ? `${email}  ·  Joining as Warehaus Staff` : 'Joining as Warehaus Staff';
  return (
    <div className="accept-inset" style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 16, borderRadius: 10, border: '1px solid var(--border)' }}>
      <span style={{ width: 40, height: 40, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'var(--surface-2)', border: '1px solid var(--border-2)', fontSize: 13, fontWeight: 500 }}>{initials}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, lineHeight: '21px', fontWeight: 500 }}>{name} invited you</span>
        <span style={{ display: 'block', fontSize: 13, lineHeight: '20px', color: 'var(--accept-muted)' }}>{detail}</span>
      </span>
    </div>
  );
}

function LockedEmail({ email, hint }: { email: string; hint?: string }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={fieldLabel}>Email</span>
      <span data-testid="locked-email" style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 52, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', padding: '0 16px', fontSize: 16, lineHeight: '24px' }}>
        <Lock size={16} className="notice-icon" />
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</span>
      </span>
      {hint ? <span style={{ fontSize: 13, lineHeight: '20px', color: 'var(--accept-muted)' }}>{hint}</span> : null}
    </label>
  );
}

function Field({ label, value, onChange, error }: { label: string; value: string; onChange: (value: string) => void; error?: string | null }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={fieldLabel}>{label}</span>
      <input
        type="password"
        value={value}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="new-password"
        style={{ minHeight: 52, borderRadius: 10, border: `1px solid ${error ? 'var(--danger)' : 'var(--border)'}`, background: 'var(--bg-2)', color: 'var(--fg)', padding: '0 16px', fontSize: 16, lineHeight: '24px' }}
      />
      {error ? <span data-testid="accept-field-error" style={{ color: 'var(--danger)', fontSize: 13, lineHeight: '20px' }}>{error}</span> : null}
    </label>
  );
}

function Rule({ met, label }: { met: boolean; label: string }) {
  return (
    <p data-rule={label} data-met={met ? 'true' : 'false'} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, lineHeight: '20px', color: met ? 'var(--fg)' : 'var(--accept-muted)' }}>
      {met ? <Check size={16} strokeWidth={2.75} className="notice-icon" aria-hidden /> : <Circle size={16} className="notice-icon" aria-hidden />}
      {label}
    </p>
  );
}

function InvalidCard() {
  return (
    <ErrorCard
      icon={<AlertTriangle size={20} />}
      kicker="Invalid link"
      title="This invite link can’t be used"
      body="The link is missing or not a valid invite. Ask for a new one."
      action="Sign in"
      actionHref="/login"
    />
  );
}

function Actions({
  link,
  href,
  onLink,
  label,
  disabled,
}: {
  link: string;
  href?: string;
  onLink?: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="accept-actions">
      {href ? (
        <a href={href} className="accept-link">{link}</a>
      ) : (
        <button type="button" onClick={onLink} className="accept-link">{link}</button>
      )}
      <button type="submit" disabled={disabled} className="accept-primary" style={{ ...primary, opacity: disabled ? 0.5 : 1 }}>{label}</button>
    </div>
  );
}

function ErrorCard({
  icon,
  kicker,
  title: heading,
  body,
  rows,
  callout,
  note,
  link,
  href,
  action,
  actionHref,
  onAction,
  tone,
  phoneGap,
}: {
  icon: ReactNode;
  kicker: string;
  title: string;
  body: string;
  rows?: Array<[string, string]>;
  callout?: string | null;
  note?: string | null;
  link?: string;
  href?: string;
  action: string;
  actionHref?: string;
  onAction?: () => void;
  tone?: 'danger';
  phoneGap?: 'expired';
}) {
  const danger = tone === 'danger';
  const accent = danger ? 'var(--danger)' : 'var(--accept-muted)';
  return (
    <Card>
      <div className={phoneGap === 'expired' ? 'accept-stack accept-stack-expired' : 'accept-stack'}>
        <span className="accept-icon" style={{ width: 44, height: 44, minWidth: 44, minHeight: 44, flexShrink: 0, borderRadius: 999, border: `1px solid ${danger ? 'var(--danger)' : 'var(--border)'}`, background: danger ? 'color-mix(in oklab, var(--danger) 12%, transparent)' : 'var(--surface-2)', color: danger ? 'var(--danger)' : 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
        <p className="ds-mono" style={{ margin: 0, fontSize: 12, lineHeight: '18px', letterSpacing: '0.8px', textTransform: 'uppercase', color: accent }}>{kicker}</p>
        <h1 style={title}>{heading}</h1>
        <p style={lede}>{body}</p>
      </div>
      {rows ? (
        <div className="accept-inset" style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map(([label, value]) => (
            <div key={label} style={{ display: 'flex', gap: 12, minWidth: 0 }}>
              <span className="ds-mono" style={{ width: 96, flexShrink: 0, color: 'var(--accept-muted)', fontSize: 11, lineHeight: '17px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</span>
              <span style={{ flex: '1 1 auto', minWidth: 0, overflowWrap: 'anywhere', fontSize: 13, lineHeight: '20px' }}>{value}</span>
            </div>
          ))}
        </div>
      ) : null}
      {callout ? (
        <div data-testid="accept-callout" className="accept-inset" style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 16, borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, lineHeight: '21px' }}>
          <Clock size={16} className="notice-icon" />
          <span>{callout}</span>
        </div>
      ) : null}
      {note ? <p style={{ margin: 0, fontSize: 14, lineHeight: '22px', color: 'var(--accept-muted)' }}>{note}</p> : null}
      <div className="accept-actions">
        {link && href ? <a href={href} className="accept-link">{link}</a> : null}
        {actionHref ? (
          <a href={actionHref} className="accept-primary" style={{ ...primary, textDecoration: 'none' }}>{action}</a>
        ) : (
          <button type="button" onClick={onAction} className="accept-primary" style={primary}>{action}</button>
        )}
      </div>
    </Card>
  );
}

const title = { margin: 0, fontSize: 24, lineHeight: '32px', fontWeight: 600 } as const;
const fieldLabel = { fontSize: 14, lineHeight: '21px', fontWeight: 500, color: 'var(--accept-muted)' } as const;
const lede = { margin: 0, fontSize: 14, lineHeight: '22px', color: 'var(--accept-muted)' } as const;
const primary = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--accent)',
  color: 'var(--accent-fg)',
  border: 0,
  borderRadius: 9,
  minHeight: 42,
  padding: '0 16px',
  fontSize: 14,
  fontWeight: 600,
  lineHeight: '18px',
  cursor: 'pointer',
} as const;
