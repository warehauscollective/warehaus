import { v } from 'convex/values';
import { anyApi } from 'convex/server';
import { internalAction } from './_generated/server';
import { devMailboxEnabled, sendPortalEmail } from './_lib/email';

/** Sends portal mail off the request path so signup does not wait on Resend. */
export const deliver = internalAction({
  args: {
    to: v.string(),
    subject: v.string(),
    html: v.string(),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    if (devMailboxEnabled()) {
      await ctx.runMutation(anyApi.devMailbox.record, args);
      return;
    }
    await sendPortalEmail(args);
  },
});
