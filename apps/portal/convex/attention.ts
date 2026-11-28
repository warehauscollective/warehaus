import { loadAttentionFeed, type AttentionFeed } from './_lib/attentionFeed';
import { clientQuery } from './_lib/wrappers';

/**
 * The attention feed for the signed-in person (GLOSSARY.md, ADR-0006
 * multi-platform point 5): their open Asks plus Ready to Ship alerts,
 * filtered by their notification preferences and without their own actions.
 * At most 20 alerts, newest first. The rules are in `_lib/attentionFeed.ts`.
 *
 * Any signed-in person may call it, so the shell can mount one subscription
 * for everyone. Only staff ever get alerts.
 */
export const feed = clientQuery({
  args: {},
  handler: async (ctx): Promise<AttentionFeed> => loadAttentionFeed(ctx, ctx.identity),
});
