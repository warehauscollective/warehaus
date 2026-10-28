'use client';

import { createAuthClient } from 'better-auth/react';
import { convexClient } from '@convex-dev/better-auth/client/plugins';

declare global {
  interface Window {
    __WH_FIXTURE_PREVIEW?: boolean;
  }
}

/** Fixture preview has no auth backend. Answer get-session locally. */
const fixtureAwareFetch: typeof fetch = (input, init) => {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (
    typeof window !== 'undefined' &&
    window.__WH_FIXTURE_PREVIEW === true &&
    url.includes('/get-session')
  ) {
    return Promise.resolve(
      new Response('null', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  }
  return fetch(input, init);
};

export const authClient = createAuthClient({
  plugins: [convexClient()],
  fetchOptions: {
    customFetchImpl: fixtureAwareFetch,
  },
});
