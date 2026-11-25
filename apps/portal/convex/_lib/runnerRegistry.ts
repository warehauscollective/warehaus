/**
 * Runner registrations and pairing (ADR-0005, amendment of 2026-11-24). Pure.
 * No Convex imports.
 *
 * `npm run runner -- setup` makes a secret and a poll key on the Mac and
 * sends only their SHA-256 hashes. The Portal hands back an 8-character
 * code. Staff type that code into the RunnerStatus modal and confirm the
 * runner id. From then on the runner's bearer token is checked against the
 * stored hash. The secret itself never reaches Convex or the screen.
 */

import { RUNNER_PROTOCOL_MIN } from '@warehaus/runner-protocol';
import { RUNNER_ID_PATTERN } from './agentRun';
import { timingSafeEqualUtf8 } from './constantTime';

/** No 0/O, 1/I/L: a code is read off one screen and typed into another. */
export const PAIRING_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const PAIRING_CODE_LENGTH = 8;
/** A code lasts this long. */
export const PAIRING_TTL_MS = 10 * 60_000;
/** Open pairings allowed at once on one deployment. */
export const PAIRING_MAX_OPEN = 5;
/** Pairing rows one read looks at. */
export const PAIRING_SCAN = 25;
/** Expired pairings one sweep deletes. */
export const PAIRING_SWEEP = 50;
/** Registered runners one read looks at. */
export const REGISTERED_RUNNER_SCAN = 10;

export const PAIRING_TOO_MANY = 'Too many runner set-ups are open. Wait 10 minutes and try again.';
export const PAIRING_BAD_REQUEST = 'Pairing needs a runner id and the hashes the runner CLI sends';
export const PAIRING_NOT_FOUND = 'No open pairing has that code. Codes expire after 10 minutes.';
export const RUNNER_ID_TAKEN = 'A runner with that id is already registered. Revoke it first or choose another id.';
export const RUNNER_NOT_REGISTERED = 'No registered runner has that id';
export const RUNNER_OUT_OF_DATE = 'This runner is out of date. Run git pull and reinstall it.';

const HASH = /^[0-9a-f]{64}$/;

export function isSha256Hex(value: unknown): value is string {
  return typeof value === 'string' && HASH.test(value);
}

/** A new code from random bytes. Each byte picks one letter; the slight bias is harmless for a 10-minute code. */
export function pairingCodeFrom(bytes: Uint8Array): string {
  if (bytes.length < PAIRING_CODE_LENGTH) throw new Error('pairingCodeFrom needs 8 random bytes');
  let code = '';
  for (let i = 0; i < PAIRING_CODE_LENGTH; i += 1) code += PAIRING_CODE_ALPHABET[bytes[i]! % PAIRING_CODE_ALPHABET.length];
  return code;
}

/** `K7QM4XPA` as staff read it: `K7QM-4XPA`. */
export function formatPairingCode(code: string): string {
  return code.length === PAIRING_CODE_LENGTH ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

/** What staff typed, as stored: upper case, no dash or spaces. Null when it cannot be a code. */
export function normalizePairingCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const code = input.replace(/[\s-]/g, '').toUpperCase();
  if (code.length !== PAIRING_CODE_LENGTH) return null;
  for (const char of code) if (!PAIRING_CODE_ALPHABET.includes(char)) return null;
  return code;
}

/** A runner id as staff typed it, or null when it breaks the id rule. */
export function normalizeRunnerId(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const id = input.trim().toLowerCase();
  return RUNNER_ID_PATTERN.test(id) ? id : null;
}

/** The id the CLI proposes, cleaned to the id rule; falls back to `runner`. */
export function proposedRunnerIdFrom(input: unknown): string {
  const raw = typeof input === 'string' ? input.toLowerCase() : '';
  const cleaned = raw.replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  return RUNNER_ID_PATTERN.test(cleaned) ? cleaned : 'runner';
}

export type RunnerRegistration = {
  tokenHash?: string | null;
  registeredAt?: number | null;
} | null | undefined;

const DUMMY_HASH = '0'.repeat(64);

/**
 * How a runner call is allowed: by its registration, by the `RUNNER_TOKENS`
 * fallback, or not at all. The hash compare is constant time and runs even
 * when the id has no registration, so timing does not name registered ids.
 */
export function runnerAccess(input: {
  row: RunnerRegistration;
  tokenHash: string | null | undefined;
  envAuthorized: boolean;
}): 'registered' | 'env' | null {
  const stored = input.row?.registeredAt != null && input.row.tokenHash ? input.row.tokenHash : null;
  const same = timingSafeEqualUtf8(input.tokenHash ?? '', stored ?? DUMMY_HASH);
  if (stored && input.tokenHash && same) return 'registered';
  return input.envAuthorized ? 'env' : null;
}

/** `X-Runner-Protocol` as a number. A missing or odd header is version 1. */
export function runnerProtocolVersion(header: string | null | undefined): number {
  const value = Number.parseInt(header ?? '', 10);
  return Number.isInteger(value) && value > 0 && value < 1000 ? value : 1;
}

export function runnerOutOfDate(version: number | null | undefined): boolean {
  return (version ?? 1) < RUNNER_PROTOCOL_MIN;
}

export type PairingRow = {
  status: 'open' | 'confirmed';
  expiresAt: number;
};

export function pairingOpen(row: PairingRow | null | undefined, now: number): boolean {
  return row != null && row.status === 'open' && row.expiresAt > now;
}

/** What the CLI's poll sees. It never carries a secret. */
export type PairingPoll =
  | { status: 'open'; expiresAt: number }
  | { status: 'confirmed'; runnerId: string }
  | { status: 'expired' };

export function pairingPoll(
  row: (PairingRow & { runnerId?: string | null }) | null | undefined,
  now: number,
): PairingPoll {
  if (!row) return { status: 'expired' };
  if (row.status === 'confirmed' && row.runnerId) return { status: 'confirmed', runnerId: row.runnerId };
  if (row.expiresAt <= now) return { status: 'expired' };
  return { status: 'open', expiresAt: row.expiresAt };
}

/** A milestone Building this long with no runner online gets a "needs Peter" note (ADR-0005 amendment). */
export const NO_RUNNER_AFTER_MS = 30 * 60_000;
/** Building milestones the sweep checks for a missing runner. */
export const NO_RUNNER_SCAN = 10;
/** Open notes read to find the no-runner ones. */
export const NO_RUNNER_NOTE_SCAN = 50;

export const NO_REGISTERED_RUNNER_NOTE =
  'No runner is set up on this deployment, so this milestone cannot build. Set one up from Runner status on the project page.';
export const NO_RUNNER_ONLINE_NOTE =
  'This milestone has been Building for 30 minutes and no runner is online. Start one, or check its log.';

export function isNoRunnerNote(body: unknown): boolean {
  return body === NO_REGISTERED_RUNNER_NOTE || body === NO_RUNNER_ONLINE_NOTE;
}

/** True when any registered runner was seen inside the window. */
export function anyRunnerOnline(runners: readonly { lastSeenAt?: number | null }[], now: number, windowMs: number): boolean {
  return runners.some((runner) => runner.lastSeenAt != null && now - runner.lastSeenAt < windowMs);
}

/**
 * The note a Building milestone should carry, or null. Only a milestone that
 * has a repository and has waited 30 minutes, while no runner is online.
 */
export function noRunnerNoteFor(input: {
  online: boolean;
  registeredCount: number;
  hasRepo: boolean;
  buildingSince: number;
  now: number;
}): string | null {
  if (input.online || !input.hasRepo) return null;
  if (input.now - input.buildingSince < NO_RUNNER_AFTER_MS) return null;
  return input.registeredCount === 0 ? NO_REGISTERED_RUNNER_NOTE : NO_RUNNER_ONLINE_NOTE;
}
