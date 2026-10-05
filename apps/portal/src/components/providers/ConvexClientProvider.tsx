'use client';

import { type ReactNode } from 'react';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import {
  ConvexBetterAuthProvider,
  type AuthClient,
} from '@convex-dev/better-auth/react';
import { authClient } from '@/lib/auth-client';
import { getConvexClient, isConvexConfigured } from '@/lib/convex/client';
import { portalFixturesEnabled } from '@/lib/data/portalFixtures';

let fixtureClient: ConvexReactClient | null = null;

function getFixtureClient() {
  if (!fixtureClient) {
    fixtureClient = new ConvexReactClient('https://fixture-not-deployed.convex.cloud');
  }
  return fixtureClient;
}

/**
 * Wraps the portal when NEXT_PUBLIC_CONVEX_URL is set.
 * Without Convex env, children render but portal data hooks surface a config error.
 */
export function ConvexClientProvider({
  children,
  initialToken,
}: {
  children: ReactNode;
  initialToken?: string | null;
}) {
  if (portalFixturesEnabled()) {
    return <ConvexProvider client={getFixtureClient()}>{children}</ConvexProvider>;
  }

  const client = getConvexClient();
  if (!isConvexConfigured() || !client) {
    return <>{children}</>;
  }

  return (
    <ConvexBetterAuthProvider
      client={client}
      authClient={authClient as unknown as AuthClient}
      initialToken={initialToken}
    >
      {children}
    </ConvexBetterAuthProvider>
  );
}
