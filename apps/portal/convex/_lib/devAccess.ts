/**
 * Guards for two paths that are open by design on shared dev:
 * the dev mailbox read, and the Auth User ID mirror write to Notion.
 */

import { timingSafeEqualUtf8 } from './constantTime';
import { PRODUCTION_DEPLOYMENT } from './reviewPreview';
import { isNotionWritebackEnabled } from './writeAuthz';

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
 * Production mirrors Auth User ID to Notion as before. Every other deployment
 * writes only while Notion write-back is switched on, so a sign-in on shared
 * dev does not put a dev auth id on a live Notion contact.
 */
export function authMirrorAllowed(input: {
  cloudUrl: string | undefined;
  writebackFlag: string | undefined;
}): boolean {
  return isProductionCloudUrl(input.cloudUrl) || isNotionWritebackEnabled(input.writebackFlag);
}
