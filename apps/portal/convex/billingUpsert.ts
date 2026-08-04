import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';
import type { Id } from './_generated/dataModel';

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
    await ctx.db.patch(orgId, { stripeCustomerId });
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
      return { duplicate: true as const, status: existing.status };
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
