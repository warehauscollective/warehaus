import { ConvexError } from 'convex/values';

/**
 * The sentence a person should read. ConvexError.data is that sentence.
 * The Error message around it is the Convex wrapper, which is not the copy.
 */
export function userFacingErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ConvexError && typeof err.data === 'string' && err.data.trim()) {
    return err.data;
  }
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  return fallback;
}

/**
 * The sentence inside a nested Convex failure.
 * `ctx.runMutation` rethrows a PortalAuthError as a plain Error whose message
 * starts with "Uncaught PortalAuthError:". The data string does not survive
 * that hop, so callers must read this text instead of requiring ConvexError.
 */
export function convexFailureText(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data;
    if (typeof data === 'string' && data.trim()) return data.trim();
    if (data && typeof data === 'object' && 'message' in data) {
      const message = (data as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) return message.trim();
    }
  }
  if (error instanceof Error && error.message.trim()) {
    const line = error.message.split('\n').find((part) => part.trim()) ?? error.message;
    const cleaned = line.trim().replace(/^Uncaught\s+(?:[A-Za-z0-9_]+:\s*)+/, '');
    return cleaned.trim() || line.trim();
  }
  if (typeof error === 'string' && error.trim()) return error.trim();
  return 'Request failed';
}
