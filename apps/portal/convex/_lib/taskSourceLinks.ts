/**
 * Keep Notion-sourced task links aligned with the three stored fields.
 * Tool-added links are left in place. Reads one task's links, not the table.
 */

import { isSourceLinkKind, sourceLinksFromFields } from '@warehaus/portal-sync';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

const LINK_CAP = 50;

export async function ensureSourceLinks(
  ctx: MutationCtx,
  input: {
    orgId: Id<'clients'>;
    taskId: Id<'tasks'>;
    pullRequestUrl?: string | null;
    figmaFrame?: string | null;
    repoBranch?: string | null;
  },
): Promise<void> {
  const wanted = sourceLinksFromFields(input);
  const existing = await ctx.db
    .query('taskLinks')
    .withIndex('by_taskId', (q) => q.eq('taskId', input.taskId))
    .take(LINK_CAP);
  const wantedKey = new Set(wanted.map((link) => `${link.kind}\n${link.url}`));
  const now = Date.now();
  for (const link of wanted) {
    const found = existing.some((row) => row.kind === link.kind && row.url === link.url);
    if (found) continue;
    await ctx.db.insert('taskLinks', {
      orgId: input.orgId,
      taskId: input.taskId,
      kind: link.kind,
      url: link.url,
      addedBy: 'notion',
      createdAt: now,
    });
  }
  for (const row of existing) {
    if (row.addedBy !== 'notion' || !isSourceLinkKind(row.kind)) continue;
    if (wantedKey.has(`${row.kind}\n${row.url}`)) continue;
    await ctx.db.delete(row._id);
  }
}
