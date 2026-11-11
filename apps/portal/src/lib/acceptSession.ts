/**
 * Accept must wait until Convex has confirmed the Better Auth token.
 * signUp and signIn resolving is earlier than that.
 */

export const SESSION_NOT_ATTACHED_MESSAGE =
  'Your sign-in hasn’t reached the Portal yet. Wait a moment and try again.';

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
  const polls = input.polls ?? 8;
  const intervalMs = input.intervalMs ?? 100;
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

/** Re-read the Better Auth session, then ask the Convex plugin for a fresh token. */
export async function refreshConvexSession(client: ConvexTokenClient): Promise<void> {
  await client.getSession();
  if (client.convex?.token) {
    await client.convex.token({ fetchOptions: { throw: false } });
  }
}
