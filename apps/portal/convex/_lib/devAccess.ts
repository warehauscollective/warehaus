/**
 * Guards for paths that are open by design on shared dev: the dev mailbox
 * read, and the Auth User ID mirror to and from Notion.
 */

import { timingSafeEqualUtf8 } from './constantTime';
import { PRODUCTION_DEPLOYMENT } from './reviewPreview';

/** Shorter keys are refused so a guessable value cannot open the inbox. */
export const DEV_MAILBOX_KEY_MIN_LENGTH = 24;

/**
 * The dev mailbox holds verification, reset, and invite mail. Reading it needs
 * the key set on the deployment. An unset or short key keeps the inbox closed.
 */
export function devMailboxKeyAccepted(
  expected: string | undefined,
  given: string | undefined,
): boolean {
  const want = expected?.trim() ?? '';
  if (want.length < DEV_MAILBOX_KEY_MIN_LENGTH) return false;
  if (!given) return false;
  return timingSafeEqualUtf8(want, given);
}

function isProductionCloudUrl(cloudUrl: string | undefined): boolean {
  if (!cloudUrl) return false;
  try {
    return new URL(cloudUrl).hostname === `${PRODUCTION_DEPLOYMENT}.convex.cloud`;
  } catch {
    return false;
  }
}

/**
 * Auth ids belong to one deployment, and every deployment reads the same Notion
 * contact. Only production mirrors Auth User ID with Notion. The write-back flag
 * does not open this on shared dev: it is on there, and a dev auth id on a live
 * Notion contact locks that person out of production.
 */
export function authMirrorAllowed(input: { cloudUrl: string | undefined }): boolean {
  return isProductionCloudUrl(input.cloudUrl);
}

/**
 * Which Auth User ID a pulled contact keeps. Auth ids belong to one deployment.
 * Where the mirror is allowed, Notion's value wins and the local link fills a
 * blank, as before. Everywhere else Notion holds another deployment's id, so
 * only the local link is kept and Notion's value is never taken.
 */
export function pulledAuthUserId(input: {
  notionValue: string | undefined;
  localValue: string | undefined;
  mirrorAllowed: boolean;
}): string | undefined {
  const local = input.localValue || undefined;
  if (!input.mirrorAllowed) return local;
  return input.notionValue || local;
}
