import { createClient, type GenericCtx } from '@convex-dev/better-auth';
import { convex } from '@convex-dev/better-auth/plugins';
import { createAuthMiddleware } from '@better-auth/core/api';
import { APIError } from '@better-auth/core/error';
import { betterAuth } from 'better-auth/minimal';
import { anyApi } from 'convex/server';
import { components } from './_generated/api';
import type { DataModel } from './_generated/dataModel';
import { query } from './_generated/server';
import authConfig from './auth.config';
import {
  blockedSignupDelivery,
  passwordResetEmail,
  rewriteVerificationCallback,
  sendPortalEmail,
  verificationEmail,
} from './_lib/email';
import {
  CANT_REGISTER_MESSAGE,
  existingUserSignupAction,
  genericSignupBody,
  signupOutbound,
  signupRequestCanShortCircuit,
  signupStampsCooldown,
  shouldSendAfterCooldownClaim,
  type SelfServeDecision,
} from './_lib/registration';
import { VERIFICATION_EXPIRES_IN_SECONDS } from './_lib/resendCooldown';

/**
 * Better Auth on the portal Convex deployment (separate from Motoko).
 *
 * Tenancy join is Contacts.authUserId → Better Auth user subject.
 * Self-serve signup is limited to a single enabled client contact.
 * Staff contacts are not claimable here. Operators run `staffProvision.provisionStaffUser`.
 */
export const authComponent = createClient<DataModel>(components.betterAuth);

function refuseRegistration(): never {
  throw APIError.from('BAD_REQUEST', {
    message: CANT_REGISTER_MESSAGE,
    code: 'CANT_REGISTER',
  });
}

type ResendDecision = { allowed: boolean; retryAfterMs: number };

type PortalEmail = { to: string; subject: string; html: string; text: string };

async function deliverPortalEmail(
  ctx: GenericCtx<DataModel>,
  message: PortalEmail,
  delayMs = 0,
): Promise<void> {
  if ('scheduler' in ctx) {
    await ctx.scheduler.runAfter(delayMs, anyApi.mail.deliver, message);
    return;
  }
  await sendPortalEmail(message);
}

async function sendBlockedSignupNotice(ctx: GenericCtx<DataModel>, email: string): Promise<void> {
  const action = existingUserSignupAction();
  const claim = await runResendMutation(ctx, action.cooldown, email);
  if (!action.sendNotice || !shouldSendAfterCooldownClaim(claim)) return;
  await deliverBlockedSignupEmail(ctx, email);
}

async function deliverBlockedSignupEmail(ctx: GenericCtx<DataModel>, email: string): Promise<void> {
  const delivery = blockedSignupDelivery(email);
  await deliverPortalEmail(
    ctx,
    {
      to: delivery.to,
      subject: delivery.subject,
      html: delivery.html,
      text: delivery.text,
    },
    delivery.delayMs,
  );
}

async function readEligibility(
  ctx: GenericCtx<DataModel>,
  email: string,
): Promise<SelfServeDecision | null> {
  if (!('runQuery' in ctx)) return null;
  try {
    return (await ctx.runQuery(anyApi.contacts.selfServeEligibility, { email })) as SelfServeDecision;
  } catch (err) {
    console.error(
      '[auth] self-serve eligibility check failed',
      err instanceof Error ? err.message : 'failed',
    );
    return null;
  }
}

async function runResendMutation(
  ctx: GenericCtx<DataModel>,
  name: 'stamp' | 'claim',
  email: string,
): Promise<ResendDecision | null> {
  if (!('runMutation' in ctx)) return null;
  try {
    return (await ctx.runMutation(anyApi.verificationResend[name], { email })) as ResendDecision;
  } catch (err) {
    console.error(
      '[auth] verification resend cooldown failed',
      err instanceof Error ? err.message : 'failed',
    );
    return null;
  }
}

type SignupHookCtx = {
  body?: unknown;
  context?: {
    internalAdapter?: {
      findUserByEmail?: (email: string) => Promise<{ user?: unknown } | null>;
    };
    password?: { hash?: (password: string) => Promise<string> };
    generateId?: (input: { model: string }) => string | false | undefined;
  };
};

function signupFields(body: unknown): { email: string; password: string; name: string } | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as { email?: unknown; password?: unknown; name?: unknown };
  if (typeof record.email !== 'string' || typeof record.password !== 'string') return null;
  if (typeof record.name !== 'string') return null;
  return { email: record.email, password: record.password, name: record.name };
}

/** True when an account already exists, or when the lookup failed (let Better Auth decide). */
async function authUserExists(baCtx: SignupHookCtx, email: string): Promise<boolean> {
  try {
    const found = await baCtx.context?.internalAdapter?.findUserByEmail?.(email.trim().toLowerCase());
    return Boolean(found?.user);
  } catch (err) {
    console.error(
      '[auth] existing user lookup failed',
      err instanceof Error ? err.message : 'failed',
    );
    return true;
  }
}

/**
 * Blocked and unknown addresses never become users. Return the same 200
 * `{ token: null, user }` envelope Better Auth uses when verification is
 * required, so the status does not reveal eligibility. An address that already
 * has an account falls through: Better Auth returns that envelope itself and
 * `onExistingUserSignUp` sends the notice.
 */
async function uniformBlockedSignup(
  ctx: GenericCtx<DataModel>,
  baCtx: SignupHookCtx,
): Promise<ReturnType<typeof genericSignupBody> | undefined> {
  const fields = signupFields(baCtx.body);
  if (!fields || !signupRequestCanShortCircuit(fields)) return;
  const eligibility = await readEligibility(ctx, fields.email);
  if (!eligibility || eligibility.allowed) return;
  if (await authUserExists(baCtx, fields.email)) return;
  if (signupOutbound(eligibility) === 'blocked-notice') {
    await sendBlockedSignupNotice(ctx, fields.email);
  } else if (signupStampsCooldown(eligibility)) {
    await runResendMutation(ctx, 'stamp', fields.email);
  }
  await baCtx.context?.password?.hash?.(fields.password);
  const generated = baCtx.context?.generateId?.({ model: 'user' });
  const id = typeof generated === 'string' && generated ? generated : crypto.randomUUID();
  return genericSignupBody({ email: fields.email, name: fields.name.trim(), id });
}

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  const siteUrl = process.env.SITE_URL ?? process.env.BETTER_AUTH_URL ?? '';
  return betterAuth({
    appName: 'Warehaus Portal',
    baseURL: siteUrl,
    secret: process.env.BETTER_AUTH_SECRET,
    database: authComponent.adapter(ctx),
    trustedOrigins: [
      siteUrl,
      'https://warehaus-portal.vercel.app',
      // Preview aliases + per-deployment hosts (Better Auth accepts `*` labels).
      'https://*.vercel.app',
      'http://localhost:3100',
      'http://portal.localhost:3100',
      'http://client-portal.localhost:3100',
    ].filter(Boolean),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      onExistingUserSignUp: async ({ user }) => {
        await sendBlockedSignupNotice(ctx, user.email);
      },
      sendResetPassword: async ({ user, url }) => {
        const content = passwordResetEmail({
          name: user.name,
          resetUrl: url,
        });
        await sendPortalEmail({
          to: user.email,
          subject: content.subject,
          html: content.html,
          text: content.text,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: VERIFICATION_EXPIRES_IN_SECONDS,
      sendVerificationEmail: async ({ user, url }) => {
        await runResendMutation(ctx, 'stamp', user.email);
        const verifyUrl = rewriteVerificationCallback(url);
        const content = verificationEmail({
          name: user.name,
          verifyUrl,
        });
        await deliverPortalEmail(ctx, {
          to: user.email,
          subject: content.subject,
          html: content.html,
          text: content.text,
        });
      },
    },
    hooks: {
      before: createAuthMiddleware(async (baCtx) => {
        const path = baCtx.path ?? '';
        if (path.endsWith('/sign-up/email')) {
          return await uniformBlockedSignup(ctx, baCtx as SignupHookCtx);
        }
        if (!path.endsWith('/send-verification-email')) return;
        const email =
          baCtx.body && typeof baCtx.body === 'object' && 'email' in baCtx.body
            ? String((baCtx.body as { email?: unknown }).email ?? '')
            : '';
        if (!email.trim()) return;
        const cooldown = await runResendMutation(ctx, 'claim', email);
        if (!cooldown?.allowed) return { status: true };
        const eligibility = await readEligibility(ctx, email);
        if (!eligibility || signupOutbound(eligibility) === 'none') return { status: true };
        if (signupOutbound(eligibility) === 'blocked-notice') {
          await deliverBlockedSignupEmail(ctx, email);
          return { status: true };
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const decision = await readEligibility(ctx, user.email);
            if (!decision) refuseRegistration();
            if (decision.allowed) return { data: user };
            if (signupOutbound(decision) === 'blocked-notice') {
              await sendBlockedSignupNotice(ctx, user.email);
            } else if (signupStampsCooldown(decision)) {
              await runResendMutation(ctx, 'stamp', user.email);
            }
            refuseRegistration();
          },
        },
      },
    },
    plugins: [convex({ authConfig })],
  });
};

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return authComponent.getAuthUser(ctx);
  },
});
