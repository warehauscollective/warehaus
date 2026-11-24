/**
 * The in-memory Notion adapter with this deployment's write policy. Tests
 * only: Convex skips this file because its name has more than one dot.
 */

import {
  createMemoryNotionClient as createStrictMemoryClient,
  type MemoryNotion,
  type MemoryNotionOptions,
} from '@warehaus/portal-sync/notion-memory';
import { decideWrite, type NotionEnv } from './policy';

export type { MemoryNotion, MemoryPage } from '@warehaus/portal-sync/notion-memory';

/** Write-back on, a token, and shared dev. */
export const DEFAULT_MEMORY_ENV: NotionEnv = {
  token: 'memory-token',
  writebackFlag: 'true',
  cloudUrl: 'https://graceful-mastiff-960.convex.cloud',
};

export function createMemoryNotionClient(
  options: Omit<MemoryNotionOptions, 'policy' | 'configured'> & { env?: NotionEnv },
): MemoryNotion {
  const env = options.env ?? DEFAULT_MEMORY_ENV;
  return createStrictMemoryClient({
    ...options,
    policy: (kind) => decideWrite(kind, env),
    configured: Boolean(env.token),
  });
}
