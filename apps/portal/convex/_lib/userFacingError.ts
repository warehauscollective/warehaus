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
