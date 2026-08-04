'use client';

import { ConvexReactClient } from 'convex/react';

let client: ConvexReactClient | null = null;

export function getConvexUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_CONVEX_URL;
}

export function isConvexConfigured(): boolean {
  return Boolean(getConvexUrl());
}

export function getConvexClient(): ConvexReactClient | null {
  const url = getConvexUrl();
  if (!url) return null;
  if (!client) {
    client = new ConvexReactClient(url);
  }
  return client;
}
