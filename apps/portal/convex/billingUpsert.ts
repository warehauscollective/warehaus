import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { isTerminalBillingEventStatus } from './_lib/billingEvent';

export const upsertSubscription = internalMutation({
  args: {
    orgId: v.id('clients'),
    stripeSubscriptionId: v.string(),
    status: v.string(),
    planName: v.string(),
    cancelAtPeriodEnd: v.boolean(),
    currentPeriodEnd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('billingSubscriptions')
      .withIndex('by_stripeSubscriptionId', (q) =>
        q.eq('stripeSubscriptionId', args.stripeSubscriptionId),
      )
      .unique();
    const patch = { ...args, lastSyncedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return ctx.db.insert('billingSubscriptions', patch);
  },
});

export const upsertInvoice = internalMutation({
  args: {
    orgId: v.id('clients'),
    stripeInvoiceId: v.string(),
    number: v.optional(v.string()),
    status: v.string(),
    amountDue: v.number(),
    currency: v.string(),
    hostedInvoiceUrl: v.optional(v.string()),
    invoicePdf: v.optional(v.string()),
    periodStart: v.optional(v.number()),
    periodEnd: v.optional(v.number()),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('billingInvoices')
      .withIndex('by_stripeInvoiceId', (q) =>
        q.eq('stripeInvoiceId', args.stripeInvoiceId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return ctx.db.insert('billingInvoices', args);
  },
});

export const resolveOrgByStripeCustomer = internalQuery({
  args: { stripeCustomerId: v.string() },
  handler: async (ctx, { stripeCustomerId }): Promise<Id<'clients'> | null> => {
    const client = await ctx.db
      .query('clients')
      .withIndex('by_stripeCustomerId', (q) =>
        q.eq('stripeCustomerId', stripeCustomerId),
      )
      .unique();
    return client?._id ?? null;
  },
});

export const setStripeCustomerId = internalMutation({
  args: {
    orgId: v.id('clients'),
    stripeCustomerId: v.string(),
  },
  handler: async (ctx, { orgId, stripeCustomerId }) => {
    const client = await ctx.db.get(orgId);
    if (!client) return { ok: false as const, reason: 'missing_org' as const };
    if (client.stripeCustomerId === stripeCustomerId) {
      return { ok: true as const, reason: 'already' as const };
    }
    if (client.stripeCustomerId && client.stripeCustomerId !== stripeCustomerId) {
      return { ok: false as const, reason: 'conflict' as const };
    }
    const other = await ctx.db
      .query('clients')
      .withIndex('by_stripeCustomerId', (q) => q.eq('stripeCustomerId', stripeCustomerId))
      .unique();
    if (other && other._id !== orgId) {
      return { ok: false as const, reason: 'conflict' as const };
    }
    await ctx.db.patch(orgId, { stripeCustomerId });
    return { ok: true as const, reason: 'set' as const };
  },
});

export const resolveOrgForStripeLink = internalQuery({
  args: {
    stripeCustomerId: v.string(),
    orgId: v.optional(v.string()),
    slug: v.optional(v.string()),
    externalId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const linked = await ctx.db
      .query('clients')
      .withIndex('by_stripeCustomerId', (q) =>
        q.eq('stripeCustomerId', args.stripeCustomerId),
      )
      .unique();
    if (linked) return { orgId: linked._id, alreadyLinked: true as const };

    let client: { _id: Id<'clients'>; stripeCustomerId?: string } | null = null;
    if (args.slug) {
      client = await ctx.db
        .query('clients')
        .withIndex('by_slug', (q) => q.eq('slug', args.slug!))
        .unique();
    }
    if (!client && args.externalId) {
      client = await ctx.db
        .query('clients')
        .withIndex('by_externalId', (q) => q.eq('externalId', args.externalId!))
        .unique();
    }
    if (!client && args.orgId) {
      try {
        const row = await ctx.db.get(args.orgId as Id<'clients'>);
        if (row && 'slug' in row && 'companyName' in row) client = row;
      } catch {
        client = null;
      }
    }
    if (!client) return null;
    if (client.stripeCustomerId && client.stripeCustomerId !== args.stripeCustomerId) {
      return { orgId: client._id, alreadyLinked: false as const, conflict: true as const };
    }
    return { orgId: client._id, alreadyLinked: false as const, conflict: false as const };
  },
});

export const beginBillingEvent = internalMutation({
  args: {
    eventId: v.string(),
    type: v.string(),
  },
  handler: async (ctx, { eventId, type }) => {
    const existing = await ctx.db
      .query('billingEvents')
      .withIndex('by_eventId', (q) => q.eq('eventId', eventId))
      .unique();
    if (existing) {
      if (isTerminalBillingEventStatus(existing.status)) {
        return { duplicate: true as const, status: existing.status };
      }
      return { duplicate: false as const, status: existing.status, retry: true as const };
    }
    await ctx.db.insert('billingEvents', {
      eventId,
      type,
      receivedAt: Date.now(),
      status: 'queued',
    });
    return { duplicate: false as const, status: 'queued' as const };
  },
});

export const finishBillingEvent = internalMutation({
  args: {
    eventId: v.string(),
    status: v.union(
      v.literal('done'),
      v.literal('error'),
      v.literal('ignored'),
    ),
    orgId: v.optional(v.id('clients')),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { eventId, status, orgId, error }) => {
    const row = await ctx.db
      .query('billingEvents')
      .withIndex('by_eventId', (q) => q.eq('eventId', eventId))
      .unique();
    if (!row) return;
    await ctx.db.patch(row._id, {
      status,
      processedAt: Date.now(),
      orgId,
      error,
    });
  },
});

/** Failure leaves the row retryable: status error, processedAt cleared. */
export const failBillingEvent = internalMutation({
  args: {
    eventId: v.string(),
    error: v.string(),
  },
  handler: async (ctx, { eventId, error }) => {
    const row = await ctx.db
      .query('billingEvents')
      .withIndex('by_eventId', (q) => q.eq('eventId', eventId))
      .unique();
    if (!row) return;
    await ctx.db.replace(row._id, {
      eventId: row.eventId,
      type: row.type,
      receivedAt: row.receivedAt,
      status: 'error',
      ...(row.orgId ? { orgId: row.orgId } : {}),
      error,
    });
  },
});
