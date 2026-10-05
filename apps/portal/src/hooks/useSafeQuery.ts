'use client';

import { useQuery_experimental } from 'convex/react';
import type { FunctionReference } from 'convex/server';

/**
 * `useQuery` throws the server error into React and blanks the shell.
 * This returns the error instead so one Convex failure stays on the section.
 */
export function useSafeQuery<T>(
  query: FunctionReference<'query'>,
  args: Record<string, unknown> | 'skip',
): { data: T | undefined; error: string | null; loading: boolean } {
  const state = useQuery_experimental({
    query,
    args,
    throwOnError: false,
  });

  if (args === 'skip') {
    return { data: undefined, error: null, loading: false };
  }
  if (state.status === 'error') {
    return { data: undefined, error: state.error.message, loading: false };
  }
  if (state.status === 'pending') {
    return { data: undefined, error: null, loading: true };
  }
  return { data: state.data as T, error: null, loading: false };
}
