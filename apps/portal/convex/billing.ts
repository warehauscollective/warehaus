import { clientQuery } from './_lib/wrappers';

function formatMoney(amountCents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase() || 'USD',
    }).format(amountCents / 100);
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

/**
 * Org-scoped billing snapshot for the signed-in portal (CLIENT-safe fields only).
 */
export const getSummary = clientQuery({
  args: {},
  handler: async (ctx) => {
    const orgId = ctx.orgId;
    const subscription = await ctx.db
      .query('billingSubscriptions')
      .withIndex('by_orgId', (q) => q.eq('orgId', orgId))
      .first();

    const invoices = await ctx.db
      .query('billingInvoices')
      .withIndex('by_orgId_createdAt', (q) => q.eq('orgId', orgId))
      .order('desc')
      .take(1);

    const next = invoices[0] ?? null;
    const openInvoice =
      next && (next.status === 'open' || next.status === 'draft') ? next : null;
    const latestPaid =
      next && next.status === 'paid'
        ? next
        : (
            await ctx.db
              .query('billingInvoices')
              .withIndex('by_orgId_createdAt', (q) => q.eq('orgId', orgId))
              .order('desc')
              .take(12)
          ).find((i) => i.status === 'paid') ?? null;

    const highlight = openInvoice ?? latestPaid ?? next;

    return {
      hasBilling: Boolean(subscription || highlight),
      subscription: subscription
        ? {
            status: subscription.status,
            planName: subscription.planName,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            currentPeriodEnd: subscription.currentPeriodEnd ?? null,
          }
        : null,
      nextInvoice: highlight
        ? {
            id: highlight._id,
            number: highlight.number ?? null,
            status: highlight.status,
            amountLabel: formatMoney(highlight.amountDue, highlight.currency),
            amountDue: highlight.amountDue,
            currency: highlight.currency,
            periodEnd: highlight.periodEnd ?? null,
            createdAt: highlight.createdAt,
            hostedInvoiceUrl: highlight.hostedInvoiceUrl ?? null,
            invoicePdf: highlight.invoicePdf ?? null,
          }
        : null,
    };
  },
});

export const listForClient = clientQuery({
  args: {},
  handler: async (ctx) => {
    const orgId = ctx.orgId;
    const subscription = await ctx.db
      .query('billingSubscriptions')
      .withIndex('by_orgId', (q) => q.eq('orgId', orgId))
      .first();

    const invoices = await ctx.db
      .query('billingInvoices')
      .withIndex('by_orgId_createdAt', (q) => q.eq('orgId', orgId))
      .order('desc')
      .take(50);

    return {
      subscription: subscription
        ? {
            status: subscription.status,
            planName: subscription.planName,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            currentPeriodEnd: subscription.currentPeriodEnd ?? null,
            lastSyncedAt: subscription.lastSyncedAt,
          }
        : null,
      invoices: invoices.map((inv) => ({
        id: inv._id,
        number: inv.number ?? null,
        status: inv.status,
        amountDue: inv.amountDue,
        amountLabel: formatMoney(inv.amountDue, inv.currency),
        currency: inv.currency,
        hostedInvoiceUrl: inv.hostedInvoiceUrl ?? null,
        invoicePdf: inv.invoicePdf ?? null,
        periodStart: inv.periodStart ?? null,
        periodEnd: inv.periodEnd ?? null,
        createdAt: inv.createdAt,
      })),
    };
  },
});
