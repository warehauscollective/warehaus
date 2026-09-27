/**
 * Self-serve signup decisions. Every refusal uses the same sentence.
 * The check-your-email screen is one model: a missing contact and an
 * allowed contact do not change its layout, wording, or timing inputs.
 */

import { CANT_REGISTER_MESSAGE, normalizeEmail, type JoinContactCandidate } from './contactJoin';

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
  resendLabel: string;
  resendPendingLabel: string;
  resendDoneLabel: string;
};

/** `contactExists` is ignored on purpose — the screen must not vary. */
export function checkEmailModel(_contactExists?: boolean): CheckEmailModel {
  return {
    title: 'Check your email',
    body: 'Check your email for a verification link. It expires in about an hour.',
    resendLabel: 'Resend email',
    resendPendingLabel: 'Sending…',
    resendDoneLabel: 'Sent. Check your inbox.',
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
