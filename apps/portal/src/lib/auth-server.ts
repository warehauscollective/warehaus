import { convexBetterAuthNextJs } from '@convex-dev/better-auth/nextjs';

/**
 * Next ↔ Convex Better Auth bridge.
 * Requires NEXT_PUBLIC_CONVEX_URL + NEXT_PUBLIC_CONVEX_SITE_URL once the
 * portal Convex project is provisioned.
 */
export const {
  handler,
  preloadAuthQuery,
  isAuthenticated,
  getToken,
  fetchAuthQuery,
  fetchAuthMutation,
  fetchAuthAction,
} = convexBetterAuthNextJs({
  convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL ?? '',
  convexSiteUrl: process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? '',
});
