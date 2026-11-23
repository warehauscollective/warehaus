/**
 * The Notion client (ADR-0002). Every outbound call to Notion goes through
 * `notionClient()`. Writes name a write kind and pass the write policy.
 */

import { createHttpNotionClient } from './http';
import { readNotionEnv } from './policy';
import type { NotionClient } from './types';

let testClient: NotionClient | null = null;

/** The client for this deployment, built from env at call time. */
export function notionClient(): NotionClient {
  return testClient ?? createHttpNotionClient(readNotionEnv());
}

/**
 * Tests only: route every `notionClient()` call to this client, usually the
 * in-memory adapter. Pass null to go back to HTTP.
 */
export function setNotionClientForTests(client: NotionClient | null): void {
  testClient = client;
}

export { authMirrorAllowedHere, writebackAllowed, SKIP_MESSAGES } from './policy';
export type { SkipReason, WriteKind } from './policy';
export { NotionError } from './types';
export type { NotionClient, NotionRawBlock, NotionRawPage, NotionWriteResult, QueryOptions } from './types';
