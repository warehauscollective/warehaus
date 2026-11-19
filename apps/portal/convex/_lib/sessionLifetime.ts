/**
 * Signed-in portal auth lifetime: 90 days.
 *
 * Better Auth copies `expiresIn` onto the session cookie `maxAge`.
 * The Convex plugin copies `JWT_EXPIRES_IN_SECONDS` onto the JWT `exp`
 * and the `convex_jwt` cookie `maxAge`. The plugin default is 15 minutes,
 * which asks for sign-in again while the session is still valid.
 * Sliding session renewal stays at the framework default (refresh after 1 day)
 * and must not shorten this window.
 */
export const SESSION_EXPIRES_IN_SECONDS = 90 * 24 * 60 * 60;

/** Convex JWT lifetime and `convex_jwt` cookie maxAge. Same 90-day window as the session. */
export const JWT_EXPIRES_IN_SECONDS = SESSION_EXPIRES_IN_SECONDS;

export function portalSessionConfig(): { expiresIn: number } {
  return { expiresIn: SESSION_EXPIRES_IN_SECONDS };
}
