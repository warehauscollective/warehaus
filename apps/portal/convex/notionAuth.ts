import { v } from 'convex/values';
import { internalAction } from './_generated/server';

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
    const token = process.env.NOTION_WAREHAUS_TOKEN;
    if (!token) {
      console.info(
        '[notionAuth] NOTION_WAREHAUS_TOKEN unset — skipped Auth User ID write',
        args.notionPageId,
      );
      return { ok: false as const, skipped: true as const };
    }

    // Skip fixture / seed pages that are not real Notion IDs
    if (args.notionPageId.startsWith('fixture-') || args.notionPageId.startsWith('seed-')) {
      return { ok: false as const, skipped: true as const };
    }

    const res = await fetch(`https://api.notion.com/v1/pages/${args.notionPageId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          'Auth User ID': {
            rich_text: [{ type: 'text', text: { content: args.authUserId } }],
          },
          'External ID': {
            rich_text: [{ type: 'text', text: { content: args.externalId } }],
          },
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error('[notionAuth] failed to patch contact', res.status, body);
      return { ok: false as const, skipped: false as const, status: res.status };
    }

    return { ok: true as const, skipped: false as const };
  },
});
