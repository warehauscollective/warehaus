import { v } from 'convex/values';
import { internalAction } from './_generated/server';
import { notionClient } from './sync/notion';

/**
 * Single-field Notion write from the auth join flow.
 * Never used for client-driven writes — Auth User ID (+ External ID backfill) only.
 */
export const pushContactAuthFields = internalAction({
  args: {
    notionPageId: v.string(),
    authUserId: v.string(),
    externalId: v.string(),
  },
  handler: async (_ctx, args) => {
    // Skip fixture / seed pages that are not real Notion IDs
    if (args.notionPageId.startsWith('fixture-') || args.notionPageId.startsWith('seed-')) {
      return { ok: false as const, skipped: true as const };
    }

    // An auth-mirror write: production only, whatever the flags say (ADR-0002).
    // Auth ids belong to one deployment and shared dev holds the live Notion token.
    const result = await notionClient().patchProperties('auth-mirror', args.notionPageId, {
      'Auth User ID': {
        rich_text: [{ type: 'text', text: { content: args.authUserId } }],
      },
      'External ID': {
        rich_text: [{ type: 'text', text: { content: args.externalId } }],
      },
    });

    if (result.skipped) {
      console.info('[notionAuth] skipped Auth User ID write:', result.skipped, args.notionPageId);
      return { ok: false as const, skipped: true as const };
    }
    if (!result.ok) {
      console.error('[notionAuth] failed to patch contact', result.status, result.error);
      return { ok: false as const, skipped: false as const, status: result.status };
    }

    return { ok: true as const, skipped: false as const };
  },
});
