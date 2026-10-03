/**
 * Verification resend cooldown. The decision does not take an account flag:
 * every address uses the same window so timing cannot reveal a contact.
 */

export const VERIFICATION_EXPIRES_IN_SECONDS = 30 * 60;

export const RESEND_COOLDOWN_MS = 45_000;

export const CHECK_EMAIL_BODY =
  "If this address can use the portal, we've sent a link to verify it. It expires in 30 minutes.";

export function formatResendCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `Resend in ${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function decideResendCooldown(input: {
  now: number;
  lastAttemptAt: number | null;
  cooldownMs?: number;
}): { allowed: boolean; retryAfterMs: number } {
  const cooldownMs = input.cooldownMs ?? RESEND_COOLDOWN_MS;
  if (input.lastAttemptAt == null || !Number.isFinite(input.lastAttemptAt)) {
    return { allowed: true, retryAfterMs: 0 };
  }
  const elapsed = input.now - input.lastAttemptAt;
  if (!Number.isFinite(elapsed) || elapsed >= cooldownMs) {
    return { allowed: true, retryAfterMs: 0 };
  }
  return { allowed: false, retryAfterMs: cooldownMs - elapsed };
}
