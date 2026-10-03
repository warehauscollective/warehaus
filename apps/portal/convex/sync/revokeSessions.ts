import { v } from 'convex/values';
import { components } from '../_generated/api';
import { internalAction } from '../_generated/server';
import { sessionDeleteArgs, sessionDeleteCursor } from '../_lib/sessionRevoke';

/**
 * End every Better Auth session for one user.
 * Used when a contact loses portal access. Does not delete the user or the contact.
 */
export const revokeUserSessions = internalAction({
  args: { authUserId: v.string() },
  handler: async (ctx, { authUserId }) => {
    let cursor: string | null = null;
    for (let page = 0; page < 20; page++) {
      const deleted = (await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
        paginationOpts: { numItems: 100, cursor },
        input: sessionDeleteArgs(authUserId),
      })) as { isDone: boolean; continueCursor: string | null };
      cursor = sessionDeleteCursor(deleted);
      if (!cursor) return { ok: true as const };
    }
    throw new Error('Could not delete all sessions for that user');
  },
});
