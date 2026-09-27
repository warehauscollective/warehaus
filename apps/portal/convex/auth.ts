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
  signupOutbound,
  signupStampsCooldown,
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
            if (signupStampsCooldown(decision)) {
              await runResendMutation(ctx, 'stamp', user.email);
            }
            if (signupOutbound(decision) === 'blocked-notice') {
              await deliverBlockedSignupEmail(ctx, user.email);
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
