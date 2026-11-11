/**
 * Accept must wait until Convex has confirmed the Better Auth token.
 * signUp and signIn resolving is earlier than that.
 */

export const SESSION_NOT_ATTACHED_MESSAGE =
  'Your sign-in hasn’t reached the Portal yet. Wait a moment and try again.';

/** One round is 20 checks, 250ms apart (about 5 seconds). A miss refreshes and runs a second round. */
export const ACCEPT_AUTH_POLLS = 20;
export const ACCEPT_AUTH_INTERVAL_MS = 250;

/**
 * After sign-up has succeeded, a later click must not create the account again.
 * A timeout (already signed in) only waits and accepts. A sign-in error retries sign-in, then accept.
 */
export function planJoinSteps(input: { accountCreated: boolean; awaitingAccept: boolean }): Array<'sign-up' | 'sign-in' | 'accept'> {
  if (input.awaitingAccept) return ['accept'];
  if (input.accountCreated) return ['sign-in', 'accept'];
  return ['sign-up', 'sign-in', 'accept'];
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** A blank address is not a session. The signed-in line stays hidden. */
export function knownSessionEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim() ?? '';
  if (!trimmed.includes('@')) return null;
  return trimmed;
}

/** Convex’s unauthenticated failure is not copy. Replace it with the retry sentence. */
export function acceptFailureCopy(message: string): string {
  if (/unauthenticated/i.test(message)) return SESSION_NOT_ATTACHED_MESSAGE;
  return message;
}

/**
 * Poll until Convex auth is confirmed. If it is still missing, refresh the
 * session and token once and poll again. Accept is called only after that.
 */
export async function acceptOnceAuthenticated<T>(input: {
  readAuthenticated: () => boolean;
  refresh: () => Promise<void>;
  accept: () => Promise<T>;
  sleep?: (ms: number) => Promise<void>;
  polls?: number;
  intervalMs?: number;
}): Promise<{ ok: true; result: T } | { ok: false; message: string; refreshed: boolean }> {
  const polls = input.polls ?? ACCEPT_AUTH_POLLS;
  const intervalMs = input.intervalMs ?? ACCEPT_AUTH_INTERVAL_MS;
  const sleep = input.sleep ?? defaultSleep;

  const poll = async () => {
    for (let i = 0; i < polls; i++) {
      if (input.readAuthenticated()) return true;
      await sleep(intervalMs);
    }
    return input.readAuthenticated();
  };

  if (await poll()) return { ok: true, result: await input.accept() };
  await input.refresh();
  if (await poll()) return { ok: true, result: await input.accept() };
  return { ok: false, message: SESSION_NOT_ATTACHED_MESSAGE, refreshed: true };
}

type ConvexTokenClient = {
  getSession: () => Promise<unknown>;
  convex?: {
    token?: (args: { fetchOptions: { throw: boolean } }) => Promise<unknown>;
  };
};

/**
 * Re-read the Better Auth session, then ask the Convex plugin for a fresh token.
 * This relies on the session re-read to make the Convex provider fetch a new token.
 * Calling the token endpoint here does not attach that token. The provider does, after it sees the session again.
 */
export async function refreshConvexSession(client: ConvexTokenClient): Promise<void> {
  await client.getSession();
  if (client.convex?.token) {
    await client.convex.token({ fetchOptions: { throw: false } });
  }
}
