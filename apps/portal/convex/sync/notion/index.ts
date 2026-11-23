/**
 * The Notion client (ADR-0002). Every outbound call to Notion goes through
 * `notionClient()`. Writes name a write kind and pass the write policy.
 */

import { createHttpNotionClient } from './http';
import { readNotionEnv } from './policy';
import type { NotionClient } from './types';

/** The client for this deployment, built from env at call time. */
export function notionClient(): NotionClient {
  return createHttpNotionClient(readNotionEnv());
}

export { authMirrorAllowedHere, writebackAllowed, SKIP_MESSAGES } from './policy';
export type { SkipReason, WriteKind } from './policy';
export { NotionError } from './types';
export type { NotionClient, NotionRawBlock, NotionRawPage, NotionWriteResult, QueryOptions } from './types';
