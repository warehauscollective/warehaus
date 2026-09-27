/**
 * Self-serve signup decisions. Every refusal uses the same sentence.
 * The check-your-email screen is one model: a missing contact and an
 * allowed contact do not change its layout, wording, or timing inputs.
 */

import { CANT_REGISTER_MESSAGE, normalizeEmail, type JoinContactCandidate } from './contactJoin';
import { CHECK_EMAIL_BODY } from './resendCooldown';

export { CANT_REGISTER_MESSAGE };

/** Minimum time before the signup UI reveals check-email or the refusal. */
export const REGISTRATION_UI_FLOOR_MS = 1200;

export const VERIFY_EMAIL_PATH = '/verify-email';

export type RegistrationBlockReason =
  | 'invalid_email'
  | 'no_contact'
  | 'ambiguous'
  | 'staff'
  | 'disabled'
  | 'already_linked'
  | 'client_disabled';

export type SelfServeDecision =
  | { allowed: true }
  | { allowed: false; reason: RegistrationBlockReason };

export function registrationBlockMessage(_reason: RegistrationBlockReason): string {
  return CANT_REGISTER_MESSAGE;
}

export function isCantRegisterError(message: string | null | undefined): boolean {
  return Boolean(message && message.includes(CANT_REGISTER_MESSAGE));
}

export type VerifyEmailView =
  | 'checking'
  | 'check-email'
  | 'expired'
  | 'cant-register'
  | 'verified'
  | 'error';

const EXPIRED_TOKEN_ERRORS = new Set(['TOKEN_EXPIRED', 'INVALID_TOKEN', 'USER_NOT_FOUND']);

/** A link opened on another device has no address in this browser. */
export function needsTypedVerifyEmail(storedEmail: string): boolean {
  return storedEmail.trim().length === 0;
}

/**
 * Verify-page screen. A linking failure other than can't-register becomes
 * an error screen. A resolved visit with no session is an invalid link.
 */
export function verifyEmailView(input: {
  resentTo: string | null;
  tokenError: string | null;
  sessionPending: boolean;
  hasUser: boolean;
  linkStatus: string;
  joining: boolean;
  joinError: string | null;
  refused: boolean;
}): VerifyEmailView {
  if (input.resentTo) return 'check-email';
  if (input.tokenError && EXPIRED_TOKEN_ERRORS.has(input.tokenError)) return 'expired';
  if (input.refused || isCantRegisterError(input.joinError)) return 'cant-register';
  if (input.sessionPending || input.joining || input.linkStatus === 'loading') return 'checking';
  if (input.joinError) return 'error';
  if (input.hasUser && input.linkStatus === 'linked') return 'verified';
  if (input.hasUser && input.linkStatus === 'unlinked') return 'checking';
  if (!input.hasUser) return 'expired';
  return 'error';
}

/**
 * No matching contact uses the same check-email screen as an allowed contact.
 * Staff and every other refusal use the shared sentence.
 */
export function signupScreenForDecision(
  decision: SelfServeDecision,
): 'check-email' | 'cant-register' {
  if (decision.allowed || decision.reason === 'no_contact') return 'check-email';
  return 'cant-register';
}

export function registrationWaitMs(elapsedMs: number, floor = REGISTRATION_UI_FLOOR_MS): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return floor;
  return Math.max(0, floor - elapsedMs);
}

export type CheckEmailModel = {
  title: string;
  body: string;
  hint: string;
  resendLabel: string;
  resendPendingLabel: string;
  resendDoneLabel: string;
  differentEmailLabel: string;
};

/** `contactExists` is ignored on purpose — the screen must not vary. */
export function checkEmailModel(_contactExists?: boolean): CheckEmailModel {
  return {
    title: 'Check your email',
    body: CHECK_EMAIL_BODY,
    hint: "Didn't get it? Check spam or promotions, then resend.",
    resendLabel: 'Resend link',
    resendPendingLabel: 'Resend link',
    resendDoneLabel: 'Resend link',
    differentEmailLabel: 'Use a different email',
  };
}

export function decideSelfServeRegistration(input: {
  email: string;
  contacts: readonly JoinContactCandidate[];
  clientPortalAccess: 'Enabled' | 'Disabled' | null;
}): SelfServeDecision {
  const email = normalizeEmail(input.email);
  if (!email.includes('@')) return { allowed: false, reason: 'invalid_email' };

  const matches = input.contacts.filter((contact) => normalizeEmail(contact.email) === email);
  if (matches.length === 0) return { allowed: false, reason: 'no_contact' };
  if (matches.length > 1) return { allowed: false, reason: 'ambiguous' };

  const contact = matches[0]!;
  if (contact.role === 'Warehaus Staff') return { allowed: false, reason: 'staff' };
  if (contact.portalAccess !== 'Enabled') return { allowed: false, reason: 'disabled' };
  if (contact.authUserId) return { allowed: false, reason: 'already_linked' };
  if (input.clientPortalAccess !== 'Enabled') return { allowed: false, reason: 'client_disabled' };
  return { allowed: true };
}

/** Delete only this user's Better Auth sessions. Used before a staff password reset. */
export function staffSessionDeleteArgs(userId: string): {
  model: 'session';
  where: [{ field: 'userId'; operator: 'eq'; value: string }];
} {
  return {
    model: 'session',
    where: [{ field: 'userId', operator: 'eq', value: userId }],
  };
}

/** Next page cursor, or null when every matching session is gone. */
export function staffSessionDeleteCursor(page: {
  isDone: boolean;
  continueCursor: string | null;
}): string | null {
  if (page.isDone) return null;
  if (!page.continueCursor) {
    throw new Error('Staff session delete did not finish');
  }
  return page.continueCursor;
}

export function staffProvisionContactError(
  contact: JoinContactCandidate | null,
): string | null {
  if (!contact) return 'No contact for that email';
  if (contact.role !== 'Warehaus Staff') return 'Contact is not Warehaus Staff';
  if (contact.portalAccess !== 'Enabled') return 'Staff contact portal access is disabled';
  return null;
}

export function staffManualLinkError(input: {
  contact: JoinContactCandidate | null;
  authUser: { id: string; email: string; emailVerified: boolean } | null;
}): string | null {
  if (!input.contact) return 'No contact for that email';
  if (input.contact.role !== 'Warehaus Staff') return 'Contact is not Warehaus Staff';
  if (input.contact.portalAccess !== 'Enabled') return 'Staff contact portal access is disabled';
  if (!input.authUser) return 'Better Auth user not found';
  if (normalizeEmail(input.authUser.email) !== normalizeEmail(input.contact.email)) {
    return 'Auth user email does not match the staff contact';
  }
  if (!input.authUser.emailVerified) return 'Better Auth user email is not verified';
  return null;
}
