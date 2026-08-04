import { convexBetterAuthNextJs } from '@convex-dev/better-auth/nextjs';

/**
 * Next ↔ Convex Better Auth bridge.
 * Requires NEXT_PUBLIC_CONVEX_URL + NEXT_PUBLIC_CONVEX_SITE_URL once the
 * portal Convex project is provisioned.
 *
 * Lazy-init so `next build` can collect `/api/auth` route data without
 * throwing when Convex env vars are absent (CI / Vercel without secrets).
 */
function createAuth() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.trim() ?? '';
  const convexSiteUrl =
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL?.trim() ||
    process.env.CONVEX_SITE_URL?.trim() ||
    '';

  return convexBetterAuthNextJs({
    convexUrl,
    convexSiteUrl,
  });
}

type AuthBridge = ReturnType<typeof createAuth>;

let cached: AuthBridge | null = null;

function auth(): AuthBridge {
  if (!cached) {
    cached = createAuth();
  }
  return cached;
}

export const handler = {
  GET: (request: Request) => auth().handler.GET(request),
  POST: (request: Request) => auth().handler.POST(request),
};

export function getToken() {
  return auth().getToken();
}

export function isAuthenticated() {
  return auth().isAuthenticated();
}
