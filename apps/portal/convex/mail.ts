import { v } from 'convex/values';
import { internalAction } from './_generated/server';
import { sendPortalEmail } from './_lib/email';

/** Sends portal mail off the request path so signup does not wait on Resend. */
export const deliver = internalAction({
  args: {
    to: v.string(),
    subject: v.string(),
    html: v.string(),
    text: v.string(),
  },
  handler: async (_ctx, args) => {
    await sendPortalEmail(args);
  },
});
