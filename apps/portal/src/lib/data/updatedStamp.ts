/**
 * The "Updated …" stamp on a live milestone header. Pure: the caller passes
 * the clock, so the server render never guesses the reader's time.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function shortDate(at: number, now: number, timeZone?: string): string {
  const sameYear =
    new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone }).format(at) ===
    new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone }).format(now);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone,
  }).format(at);
}

/**
 * "just now" under a minute, then "5m ago", "2h ago", "yesterday" for the
 * second day, then a short date like "Nov 20". A time ahead of the clock
 * reads as "just now". `timeZone` is for tests. The browser's zone is the default.
 */
export function updatedRelative(at: number, now: number, timeZone?: string): string {
  const age = Math.max(0, now - at);
  if (age < MINUTE) return 'just now';
  if (age < HOUR) return `${Math.floor(age / MINUTE)}m ago`;
  if (age < DAY) return `${Math.floor(age / HOUR)}h ago`;
  if (age < 2 * DAY) return 'yesterday';
  return shortDate(at, now, timeZone);
}

/** "Updated 5m ago". Null when there is no real time to show. */
export function updatedStampText(at: number | null | undefined, now: number, timeZone?: string): string | null {
  if (typeof at !== 'number' || !Number.isFinite(at)) return null;
  return `Updated ${updatedRelative(at, now, timeZone)}`;
}

/** How often a mounted stamp re-reads the clock. */
export const UPDATED_STAMP_TICK_MS = MINUTE;
