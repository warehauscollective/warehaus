/**
 * Staff screen for API tokens. The raw token is returned once from `create`
 * and is not stored. Later reads return the prefix only.
 */

import { ConvexError, v } from 'convex/values';
import {
  API_RATE_LIMIT_DEFAULT,
  API_RATE_WINDOW_MS,
  apiRateLimit,
  apiTokenNameError,
  apiTokenScope,
  toPortalTokenListItem,
} from '@warehaus/portal-sync';
import type { Id } from './_generated/dataModel';
import { adminMutation, adminQuery } from './_lib/wrappers';
import { newPortalToken, sha256Hex } from './_lib/tokenCrypto';

function tokenRow(row: {
  _id: Id<'apiTokens'>;
  name: string;
  tokenPrefix: string;
  scope: 'read' | 'read-write';
  revokedAt?: number;
  lastUsedAt?: number;
  createdAt: number;
  rateLimit: number;
}) {
  return toPortalTokenListItem({
    id: row._id,
    name: row.name,
    prefix: row.tokenPrefix,
    scope: row.scope,
    revokedAt: row.revokedAt ?? null,
    lastUsedAt: row.lastUsedAt ?? null,
    createdAt: row.createdAt,
    rateLimit: row.rateLimit,
  });
}

export const list = adminQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query('apiTokens').withIndex('by_createdAt').order('desc').take(50);
    return rows.map(tokenRow);
  },
});

export const create = adminMutation({
  args: {
    name: v.string(),
    scope: v.string(),
    rateLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nameError = apiTokenNameError(args.name);
    if (nameError) throw new ConvexError(nameError);
    const scope = apiTokenScope(args.scope);
    if (!scope) throw new ConvexError('Scope must be read or read-write');
    const rateLimit = apiRateLimit(args.rateLimit ?? API_RATE_LIMIT_DEFAULT);
    if (rateLimit == null) throw new ConvexError('Rate limit must be from 1 to 600 per minute');
    const existing = await ctx.db
      .query('apiTokens')
      .withIndex('by_name', (q) => q.eq('name', args.name))
      .unique();
    if (existing) throw new ConvexError('A token with that name already exists');
    const minted = newPortalToken();
    const tokenHash = await sha256Hex(minted.token);
    const now = Date.now();
    const id = await ctx.db.insert('apiTokens', {
      name: args.name,
      tokenHash,
      tokenPrefix: minted.prefix,
      scope,
      createdAt: now,
      createdByContactId: ctx.identity.contactId as Id<'contacts'>,
      rateLimit,
      rateWindowMs: API_RATE_WINDOW_MS,
      windowStartedAt: now,
      windowCount: 0,
    });
    return {
      token: minted.token,
      ...tokenRow({
        _id: id,
        name: args.name,
        tokenPrefix: minted.prefix,
        scope,
        createdAt: now,
        rateLimit,
      }),
    };
  },
});

export const revoke = adminMutation({
  args: { tokenId: v.id('apiTokens') },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.tokenId);
    if (!row) throw new ConvexError('Token not found');
    if (row.revokedAt == null) await ctx.db.patch(row._id, { revokedAt: Date.now() });
    return { ok: true as const };
  },
});
