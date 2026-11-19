import { ConvexError } from 'convex/values';

/** Shown when the only text is a Convex function name, request id, or server wrapper. */
export const CONVEX_FAILURE_GENERIC = 'Something went wrong. Try again.';

/**
 * Drop the Convex transport wrapper. A real sentence on the same line stays.
 * A line that is only the function name or request id becomes null.
 */
function staffSentence(line: string): string | null {
  let text = line.trim().replace(/^Uncaught\s+(?:[A-Za-z0-9_]+:\s*)+/, '').trim();
  if (!text) return null;
  text = text.replace(/\[CONVEX\s+[A-Z]\([^)]*\)\]/g, ' ').replace(/\[Request ID:[^\]]+\]/gi, ' ').replace(/\s+/g, ' ').trim();
  if (!text || /^Server Error$/i.test(text)) return null;
  return text;
}

/**
 * The sentence inside a nested Convex failure.
 * `ctx.runMutation` rethrows a PortalAuthError as a plain Error whose message
 * starts with "Uncaught PortalAuthError:". A first line that is only the
 * function name or request id is not shown to staff.
 */
export function convexFailureText(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data;
    if (typeof data === 'string' && data.trim()) return staffSentence(data) ?? CONVEX_FAILURE_GENERIC;
    if (data && typeof data === 'object' && 'message' in data) {
      const message = (data as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) return staffSentence(message) ?? CONVEX_FAILURE_GENERIC;
    }
  }
  if (error instanceof Error && error.message.trim()) {
    for (const line of error.message.split('\n')) {
      const sentence = staffSentence(line);
      if (sentence) return sentence;
    }
    return CONVEX_FAILURE_GENERIC;
  }
  if (typeof error === 'string' && error.trim()) return staffSentence(error) ?? CONVEX_FAILURE_GENERIC;
  return 'Request failed';
}

/**
 * The sentence a person should read. ConvexError.data is that sentence.
 * The Error message around it is the Convex wrapper, which is not the copy.
 */
export function userFacingErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error) && typeof err !== 'string') return fallback;
  const text = convexFailureText(err);
  if (text === CONVEX_FAILURE_GENERIC || text === 'Request failed') return fallback;
  return text;
}
