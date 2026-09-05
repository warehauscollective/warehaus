import { createClient, type GenericCtx } from '@convex-dev/better-auth';
import { convex } from '@convex-dev/better-auth/plugins';
import { betterAuth } from 'better-auth/minimal';
import { components } from './_generated/api';
import type { DataModel } from './_generated/dataModel';
import { query } from './_generated/server';
import authConfig from './auth.config';

/**
 * Better Auth on the portal Convex deployment (separate from Motoko).
 *
 * Tenancy join is Contacts.authUserId → Better Auth user subject.
 * Better Auth `organization` plugin (local install + schema gen) is the next
 * auth hardening step once the Convex project is provisioned; Contact.orgId
 * remains the authorization source for clientQuery wrappers.
 */
export const authComponent = createClient<DataModel>(components.betterAuth);

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
      requireEmailVerification: false,
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
