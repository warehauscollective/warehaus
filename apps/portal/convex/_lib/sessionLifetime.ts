/**
 * Signed-in Better Auth session lifetime.
 *
 * Better Auth copies `expiresIn` onto the session cookie `maxAge`.
 * Sliding renewal stays at the framework default (refresh after 1 day)
 * and must not shorten this window.
 */
export const SESSION_EXPIRES_IN_SECONDS = 90 * 24 * 60 * 60;

export function portalSessionConfig(): { expiresIn: number } {
  return { expiresIn: SESSION_EXPIRES_IN_SECONDS };
}
