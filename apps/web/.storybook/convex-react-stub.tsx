import type { ReactNode } from 'react';

export class ConvexReactClient {
  constructor(_url?: string) {}
}

export function ConvexProvider({ children }: { children: ReactNode }) {
  return children;
}

export function useConvexAuth() {
  return { isLoading: false, isAuthenticated: false };
}

export function useMutation(_ref?: unknown) {
  return async () => ({ ok: true as const });
}

export function useAction(_ref?: unknown) {
  return async () => ({ ok: true as const, clientId: 'story-client', notionPageId: 'story-page', reused: false });
}

export function useQuery_experimental() {
  return { status: 'pending' as const };
}
