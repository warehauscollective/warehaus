'use client';

import { useCallback, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useConvexAuth, useMutation } from 'convex/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Check, Circle, Clock, Lock, Mail, Shield, UserRound } from 'lucide-react';
import { api } from '@convex/_generated/api';
import { authClient } from '@/lib/auth-client';
import {
  acceptFailureCopy,
  acceptOnceAuthenticated,
  knownSessionEmail,
  planJoinSteps,
  refreshConvexSession,
} from '@/lib/acceptSession';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { isConvexConfigured } from '@/lib/convex/client';
import { renewRequestMessage } from '@convex/_lib/inviteFlow';
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
  expiresAt?: number | null;
};

const FIXTURES: Record<string, Preview> = {
  new: { status: 'create-account', invitedEmail: 'jordan@warehaus.studio', inviterName: 'Peter Roquemore' },
  existing: { status: 'sign-in', invitedEmail: 'jordan@warehaus.studio', inviterName: 'Peter Roquemore' },
  expired: {
    status: 'expired',
    invitedEmail: 'jordan@warehaus.studio',
    inviterName: 'Peter Roquemore',
    expiresAt: Date.UTC(2026, 10, 2),
  },
  used: { status: 'used', invitedEmail: 'jordan@warehaus.studio', inviterName: 'Peter Roquemore' },
  revoked: { status: 'revoked', invitedEmail: 'jordan@warehaus.studio', inviterName: 'Peter Roquemore' },
  invalid: { status: 'unusable' },
  unavailable: { status: 'off', inviterName: 'Peter Roquemore' },
  'signed-in': { status: 'ready', invitedEmail: 'jordan@warehaus.studio', inviterName: 'Peter Roquemore' },
  different: {
    status: 'different-email',
    invitedEmail: 'jordan@warehaus.studio',
    signedInEmail: 'jordan.blake@gmail.com',
    inviterName: 'Peter Roquemore',
  },
  already: { status: 'already', invitedEmail: 'avery@warehaus.studio', inviterName: 'Peter Roquemore' },
  unverified: { status: 'unverified', invitedEmail: 'jordan@warehaus.studio', inviterName: 'Peter Roquemore' },
  generic: { status: 'error', invitedEmail: 'jordan@warehaus.studio', inviterName: 'Peter Roquemore' },
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

export function AcceptInvite() {
  if (!isConvexConfigured()) {
    return <AcceptInviteBody readAuthenticated={() => false} refreshSession={async () => {}} />;
  }
  return <AcceptInviteAuthed />;
}

function AcceptInviteAuthed() {
  const { isAuthenticated } = useConvexAuth();
  const authenticated = useRef(isAuthenticated);
  authenticated.current = isAuthenticated;
  const readAuthenticated = useCallback(() => authenticated.current, []);
  const refreshSession = useCallback(() => refreshConvexSession(authClient), []);
  return <AcceptInviteBody readAuthenticated={readAuthenticated} refreshSession={refreshSession} />;
}

function AcceptInviteBody({
  readAuthenticated,
  refreshSession,
}: {
  readAuthenticated: () => boolean;
  refreshSession: () => Promise<void>;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const previewKey = process.env.NEXT_PUBLIC_PORTAL_FIXTURES === '1' ? params.get('invitePreview') : null;
  const forced = previewKey ? FIXTURES[previewKey] : undefined;
  const configured = isConvexConfigured();
  const live = useSafeQuery<Preview & { portalName?: string }>(
    api.invites.previewAccept,
    !forced && configured && token ? { token } : 'skip',
  );
  const accept = useMutation(api.invites.accept);
  const requestRenew = useMutation(api.invites.requestRenew);
  const preview = forced ?? live.data ?? null;
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [signInMode, setSignInMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renewed, setRenewed] = useState(false);
  const [reference] = useState(() => `INV-${crypto.randomUUID().slice(0, 8).toUpperCase()}`);
  const [screen, setScreen] = useState<Preview['status'] | null>(null);
  const [accountCreated, setAccountCreated] = useState(false);
  const [awaitingAccept, setAwaitingAccept] = useState(false);
  const state = rules(password, confirm);
  const ready = state.length && state.mix && state.match;
  const replace = useCallback((path: string) => {
    router.replace(path);
  }, [router]);
  const linkState = useSafeQuery<{ state: string; isStaff?: boolean }>(
    api.contacts.getLinkStatus,
    !forced && configured ? {} : 'skip',
  );
  const wait = useStaffLinkWait({ token, link: linkState.data, replace });
  const { data: authSession } = authClient.useSession();
  const sessionEmail = knownSessionEmail(authSession?.user?.email) ?? knownSessionEmail(preview?.signedInEmail);

  if (previewKey === 'email') return <InviteEmailPreview />;
  if (previewKey === 'finishing' || previewKey === 'finishing-slow') {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center px-4 py-12" style={{ background: 'var(--background)', color: 'var(--foreground)' }} data-testid="accept-invite" data-status="finishing">
        <div className="flex w-full max-w-[480px] flex-col gap-8">
          <p className="font-display text-center" style={{ fontSize: 28, fontWeight: 650, letterSpacing: '-0.03em', margin: 0 }}>Warehaus</p>
          <StaffLinkFinish slow={previewKey === 'finishing-slow'} onRetry={() => undefined} />
        </div>
      </main>
    );
  }

  async function join(event: FormEvent) {
    event.preventDefault();
    if (!ready || !preview?.invitedEmail) return;
    if (forced) {
      rememberStaffJoined({ name: 'Jordan', passwordSet: true });
      router.replace('/preview');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const steps = planJoinSteps({ accountCreated, awaitingAccept });
      if (steps.includes('sign-up')) {
        const signed = await authClient.signUp.email({
          email: preview.invitedEmail,
          password,
          name: preview.invitedEmail.split('@')[0] ?? 'Staff',
          callbackURL: `/accept?token=${encodeURIComponent(token)}`,
          inviteToken: token,
        } as never);
        if (signed.error) {
          setError(signed.error.message ?? 'We couldn’t finish joining');
          return;
        }
        setAccountCreated(true);
      }
      if (steps.includes('sign-in')) {
        const signedIn = await authClient.signIn.email({ email: preview.invitedEmail, password });
        if (signedIn.error) {
          setError(signedIn.error.message ?? 'Check your password and try again.');
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
      readAuthenticated,
      refresh: refreshSession,
      accept: () => accept({ token }),
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
    wait.begin({ name: joinedName(nameEmail), passwordSet });
  }

  async function confirmSignedIn() {
    const nameEmail = sessionEmail ?? knownSessionEmail(preview?.invitedEmail);
    if (!nameEmail) return;
    if (forced) {
      rememberStaffJoined({ name: 'Jordan', passwordSet: false });
      router.replace('/preview');
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
      rememberStaffJoined({ name: 'Jordan', passwordSet: false });
      router.replace('/preview');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const signed = await authClient.signIn.email({ email: preview.invitedEmail, password });
      if (signed.error) {
        setError(signed.error.message ?? 'Check your password and try again.');
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
      await requestRenew({ token });
    } catch {
      setRenewed(true);
    }
  }

  const status = screen ?? (signInMode && preview?.status === 'create-account' ? 'sign-in' : preview?.status);
  const email = preview?.invitedEmail ?? '';
  const readyEmail = sessionEmail ?? (forced ? knownSessionEmail(email) : null);
  const inviter = preview?.inviterName || INVITER_FALLBACK;

  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-4 py-12" style={{ background: 'var(--background)', color: 'var(--foreground)' }} data-testid="accept-invite" data-status={wait.waiting ? 'finishing' : (status ?? 'loading')}>
      <div className="flex w-full max-w-[480px] flex-col gap-8">
        <p className="font-display text-center" style={{ fontSize: 28, fontWeight: 650, letterSpacing: '-0.03em', margin: 0 }}>
          Warehaus
        </p>
        {wait.waiting ? (
          <StaffLinkFinish slow={wait.slow} onRetry={wait.retry} />
        ) : !preview ? (
          live.loading ? (
            <Card>
              <p style={{ margin: 0, color: 'var(--muted)' }}>Checking this invite…</p>
            </Card>
          ) : (
            <InvalidCard />
          )
        ) : status === 'create-account' ? (
          <Card>
            <Kicker>Staff invite</Kicker>
            <h1 style={title}>Join Warehaus as staff</h1>
            <p style={lede}>Set a password to finish. Opening this link from your email confirms your address, so there’s no separate verification step.</p>
            <Inviter name={inviter} />
            <LockedEmail email={email} hint={`This is the address ${firstName(inviter)} invited. It can’t be changed here.`} />
            {awaitingAccept ? (
              <div className="flex flex-col gap-4">
                {error ? <p style={{ margin: 0, color: 'var(--danger)', fontSize: 14 }}>{error}</p> : null}
                <button type="button" disabled={busy} onClick={() => void retryAccept()} style={{ ...primary, opacity: busy ? 0.4 : 1, alignSelf: 'flex-start' }}>
                  {busy ? 'Joining…' : 'Try again'}
                </button>
              </div>
            ) : (
              <form onSubmit={(event) => void join(event)} className="flex flex-col gap-4">
                <Field label="Password" value={password} onChange={setPassword} />
                <Field label="Confirm password" value={confirm} onChange={setConfirm} />
                <Rule met={state.length} label="At least 8 characters" />
                <Rule met={state.mix} label="A letter and a number" />
                <Rule met={state.match} label="Passwords match" />
                <Actions link="Already have an account? Sign in" onLink={() => setSignInMode(true)} label={busy ? 'Joining…' : accountCreated ? 'Try again' : 'Join Warehaus'} disabled={!ready || busy} />
                <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Join turns on when every rule is met.</p>
                {error ? <p style={{ margin: 0, color: 'var(--danger)', fontSize: 14 }}>{error}</p> : null}
              </form>
            )}
          </Card>
        ) : status === 'ready' ? (
          <Card>
            <Kicker>Staff invite</Kicker>
            <h1 style={title}>Accept your invite</h1>
            <SignedInAcceptCopy email={readyEmail} />
            <Inviter name={inviter} />
            <LockedEmail email={email} />
            <button type="button" disabled={busy || !readyEmail} onClick={() => void confirmSignedIn()} style={{ ...primary, opacity: busy || !readyEmail ? 0.4 : 1, alignSelf: 'flex-start' }}>
              {busy ? 'Joining…' : 'Accept invite'}
            </button>
            {error ? <p style={{ margin: 0, color: 'var(--danger)', fontSize: 14 }}>{error}</p> : null}
          </Card>
        ) : status === 'sign-in' ? (
          <Card>
            <Kicker>Staff invite</Kicker>
            <h1 style={title}>Sign in to accept</h1>
            <p style={lede}>{email || 'This address'} already has a Portal account. Sign in with it to join Warehaus as staff.</p>
            <Inviter name={inviter} />
            <LockedEmail email={email} />
            <form onSubmit={(event) => void signIn(event)} className="flex flex-col gap-4">
              <Field label="Password" value={password} onChange={setPassword} />
              {error ? <p style={{ margin: 0, color: 'var(--danger)', fontSize: 14 }}>{error}</p> : null}
              <Actions link="Forgot password?" href="/forgot-password" label={busy ? 'Signing in…' : 'Sign in and join'} disabled={!password || busy} />
            </form>
          </Card>
        ) : status === 'expired' ? (
          <ErrorCard
            icon={<Clock size={20} />}
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
            icon={<Check size={20} />}
            kicker="Invite already used"
            title="This invite has already been used"
            body="It was already accepted. If that was you, sign in to continue."
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
            link="Back to sign in"
            href="/login"
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
            link="Back to sign in"
            href="/login"
            action="Sign in"
            actionHref="/login"
          />
        ) : status === 'different-email' ? (
          <ErrorCard
            icon={<UserRound size={20} />}
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
            icon={<Shield size={20} />}
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
            note="It can take a minute to arrive. Check spam if you don’t see it."
            link="Use a different account"
            href="/login"
            action="Resend verification email"
            onAction={() => void authClient.sendVerificationEmail({ email, callbackURL: `/accept?token=${encodeURIComponent(token)}` })}
          />
        ) : (
          <ErrorCard
            icon={<AlertTriangle size={20} />}
            kicker="Something went wrong"
            title="We couldn’t finish joining"
            body={`Your invite still works. Try again in a moment. If it keeps happening, send ${firstName(inviter)} the reference below.`}
            rows={[['Reference', reference]]}
            link="Back to sign in"
            href="/login"
            action="Try again"
            onAction={() => router.refresh()}
          />
        )}
      </div>
    </main>
  );
}

function InviteEmailPreview() {
  return (
    <main data-testid="invite-email" style={{ background: 'var(--background)', color: 'var(--foreground)', minHeight: '100dvh', padding: '48px 24px' }}>
      <article style={{ maxWidth: 640, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, lineHeight: '30px', margin: '0 0 16px' }}>Peter invited you to join Warehaus on the Portal</h1>
        <p style={meta}><span>FROM</span> Warehaus Portal &lt;portal@warehaus.studio&gt;</p>
        <p style={meta}><span>TO</span> jordan@warehaus.studio</p>
        <p style={meta}><span>PREVIEW</span> Accept within 7 days to set your password and join as staff.</p>
        <div style={{ marginTop: 32, padding: 32, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)' }}>
          <p className="font-display" style={{ margin: 0, fontSize: 20 }}>Warehaus</p>
          <p style={{ margin: '24px 0 0', fontSize: 12, letterSpacing: '0.08em', color: 'var(--muted)' }}>STAFF INVITE</p>
          <h2 style={{ margin: '8px 0 0', fontSize: 28, lineHeight: '36px' }}>Join Warehaus on the Portal</h2>
          <p style={{ fontSize: 15, lineHeight: '24px' }}>
            Peter Roquemore (peter@warehaus.studio) invited you to join Warehaus as staff. Accept the invite to set your password and confirm your email in one step.
          </p>
          <a href="/accept?invitePreview=new" style={{ ...primary, display: 'inline-flex', textDecoration: 'none' }}>Accept invite</a>
          <div style={{ display: 'flex', gap: 12, marginTop: 24, padding: 16, borderRadius: 12, border: '1px solid var(--border)' }}>
            <Clock size={16} />
            <div>
              <p style={{ margin: 0 }}>This link expires in 7 days</p>
              <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 14 }}>It works once and stops working on Nov 16, 2026. If it expires, ask Peter for a new invite.</p>
            </div>
          </div>
          <p style={{ marginTop: 24, fontSize: 14, color: 'var(--muted)' }}>Button not working? Paste this link into your browser:</p>
          <p style={{ fontSize: 13, wordBreak: 'break-all' }}>https://portal.warehaus.studio/accept?token=…</p>
          <p style={{ fontSize: 14, color: 'var(--muted)' }}>Weren’t expecting this? You can ignore this email. Nothing is created until you accept, and we never ask for your password by email.</p>
        </div>
        <p style={{ marginTop: 24, fontSize: 12, color: 'var(--muted)' }}>Warehaus · warehaus.studio</p>
        <p style={{ fontSize: 12, color: 'var(--muted)' }}>You’re getting this because Peter Roquemore invited jordan@warehaus.studio to the Warehaus Portal.</p>
      </article>
    </main>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {children}
    </section>
  );
}

function Kicker({ children }: { children: ReactNode }) {
  return <p style={{ margin: 0, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>{children}</p>;
}

function Inviter({ name }: { name: string }) {
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 16, borderRadius: 12, border: '1px solid var(--border)' }}>
      <span style={{ width: 40, height: 40, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in oklab, var(--foreground) 8%, transparent)', fontSize: 13 }}>{initials}</span>
      <span>
        <span style={{ display: 'block', fontSize: 14 }}>{name} invited you</span>
        <span style={{ display: 'block', fontSize: 13, color: 'var(--muted)' }}>Joining as Warehaus Staff</span>
      </span>
    </div>
  );
}

function LockedEmail({ email, hint }: { email: string; hint?: string }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 14 }}>Email</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 52, borderRadius: 10, border: '1px solid var(--border)', padding: '0 14px' }}>
        <Lock size={16} />
        {email}
      </span>
      {hint ? <span style={{ fontSize: 13, color: 'var(--muted)' }}>{hint}</span> : null}
    </label>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 14 }}>{label}</span>
      <input type="password" value={value} onChange={(event) => onChange(event.target.value)} autoComplete="new-password" style={{ minHeight: 52, borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--foreground)', padding: '0 14px' }} />
    </label>
  );
}

function Rule({ met, label }: { met: boolean; label: string }) {
  return (
    <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: met ? 'var(--foreground)' : 'var(--muted)' }}>
      {met ? <Check size={16} /> : <Circle size={16} />}
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
      link="Back to sign in"
      href="/login"
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
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      {href ? (
        <a href={href} style={{ color: 'var(--foreground)', fontSize: 14 }}>{link}</a>
      ) : (
        <button type="button" onClick={onLink} style={{ background: 'transparent', border: 0, color: 'var(--foreground)', fontSize: 14, padding: 0, cursor: 'pointer' }}>{link}</button>
      )}
      <button type="submit" disabled={disabled} style={{ ...primary, opacity: disabled ? 0.4 : 1 }}>{label}</button>
    </div>
  );
}

function ErrorCard({
  icon,
  kicker,
  title: heading,
  body,
  rows,
  note,
  link,
  href,
  action,
  actionHref,
  onAction,
}: {
  icon: ReactNode;
  kicker: string;
  title: string;
  body: string;
  rows?: Array<[string, string]>;
  note?: string | null;
  link?: string;
  href?: string;
  action: string;
  actionHref?: string;
  onAction?: () => void;
}) {
  return (
    <Card>
      <span style={{ width: 44, height: 44, borderRadius: 999, border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
      <Kicker>{kicker}</Kicker>
      <h1 style={title}>{heading}</h1>
      <p style={lede}>{body}</p>
      {rows ? (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map(([label, value]) => (
            <div key={label} style={{ display: 'flex', gap: 12, fontSize: 14 }}>
              <span style={{ width: 96, color: 'var(--muted)', fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
              <span>{value}</span>
            </div>
          ))}
        </div>
      ) : null}
      {note ? <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)' }}>{note}</p> : null}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {link && href ? <a href={href} style={{ color: 'var(--foreground)', fontSize: 14 }}>{link}</a> : <span />}
        {actionHref ? (
          <a href={actionHref} style={{ ...primary, textDecoration: 'none' }}>{action}</a>
        ) : (
          <button type="button" onClick={onAction} style={primary}>{action}</button>
        )}
      </div>
    </Card>
  );
}

const title = { margin: 0, fontSize: 24, lineHeight: '32px', fontWeight: 600 } as const;
const lede = { margin: 0, fontSize: 14, lineHeight: '22px', color: 'var(--muted)' } as const;
const meta = { margin: '4px 0', fontSize: 13, color: 'var(--muted)', display: 'flex', gap: 12 } as const;
const primary = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--foreground)',
  color: 'var(--background)',
  border: 0,
  borderRadius: 9,
  minHeight: 42,
  padding: '0 16px',
  fontSize: 14,
  fontWeight: 600,
  lineHeight: '18px',
  cursor: 'pointer',
} as const;
