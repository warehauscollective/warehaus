/**
 * The Notion write policy (ADR-0002). The only code that reads the Notion
 * write flags and the deployment identity. Every write to Notion names a
 * write kind, and this decides whether it may run on this deployment.
 */

import { WRITEBACK_OFF_ERROR, isNotionWritebackEnabled as writebackFlagIsOn } from '@warehaus/portal-sync';
import { authMirrorAllowed } from '../../_lib/devAccess';

export type WriteKind = 'writeback' | 'auth-mirror' | 'resource-url';

export type SkipReason = 'writeback-off' | 'not-production' | 'not-configured';

export type NotionEnv = {
  token?: string;
  writebackFlag?: string;
  cloudUrl?: string;
  blobToken?: string;
};

export type WriteDecision = { allowed: true } | { allowed: false; reason: SkipReason };

export const SKIP_MESSAGES: Record<SkipReason, string> = {
  'writeback-off': WRITEBACK_OFF_ERROR,
  'not-production': 'Only production writes this to Notion.',
  'not-configured': 'Notion is not configured for write-back.',
};

export function readNotionEnv(env: Record<string, string | undefined> = process.env): NotionEnv {
  return {
    token: env.NOTION_WAREHAUS_TOKEN?.trim() || undefined,
    writebackFlag: env.NOTION_WRITEBACK_ENABLED,
    cloudUrl: env.CONVEX_CLOUD_URL,
    blobToken: env.BLOB_READ_WRITE_TOKEN?.trim() || undefined,
  };
}

/** Whether a write of this kind may run. The kind's own rule is checked before the token. */
export function decideWrite(kind: WriteKind, env: NotionEnv): WriteDecision {
  if (kind === 'auth-mirror') {
    if (!authMirrorAllowed({ cloudUrl: env.cloudUrl })) return { allowed: false, reason: 'not-production' };
  } else {
    if (!writebackFlagIsOn(env.writebackFlag)) return { allowed: false, reason: 'writeback-off' };
    if (kind === 'resource-url' && !env.blobToken) return { allowed: false, reason: 'not-configured' };
  }
  if (!env.token) return { allowed: false, reason: 'not-configured' };
  return { allowed: true };
}

/**
 * Whether write-back is on, for code that decides whether to queue a write.
 * Queueing needs only the flag; the token is checked when the write runs.
 */
export function writebackAllowed(env: NotionEnv = readNotionEnv()): boolean {
  return writebackFlagIsOn(env.writebackFlag);
}

/** Whether this deployment mirrors Auth User ID with Notion, in either direction. */
export function authMirrorAllowedHere(env: NotionEnv = readNotionEnv()): boolean {
  return authMirrorAllowed({ cloudUrl: env.cloudUrl });
}
