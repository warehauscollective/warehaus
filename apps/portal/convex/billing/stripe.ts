import { internal } from '../_generated/api';
import { httpAction } from '../_generated/server';
import type { Id } from '../_generated/dataModel';

type StripeObject = Record<string, unknown>;

function asObject(value: unknown): StripeObject | null {
  return value && typeof value === 'object' ? (value as StripeObject) : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function customerIdFrom(obj: StripeObject | null): string | null {
  if (!obj) return null;
  const customer = obj.customer;
  if (typeof customer === 'string') return customer;
  const nested = asObject(customer);
  return asString(nested?.id);
}

function planNameFromSubscription(sub: StripeObject): string {
  const items = asObject(sub.items);
  const data = Array.isArray(items?.data) ? items.data : [];
  const first = asObject(data[0]);
  const price = asObject(first?.price);
  const product = price?.product;
  if (typeof product === 'string') return product;
  const productObj = asObject(product);
  if (asString(productObj?.name)) return productObj!.name as string;
  if (asString(price?.nickname)) return price!.nickname as string;
  if (asString(sub.description)) return sub.description as string;
  return 'Subscription';
}

/** Stripe webhook signature (HMAC SHA-256 of `${t}.${payload}`). */
async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!signatureHeader) return false;
  const parts = Object.fromEntries(
    signatureHeader.split(',').map((p) => {
      const [k, ...rest] = p.split('=');
      return [k.trim(), rest.join('=')];
    }),
  ) as Record<string, string>;
  const timestamp = parts.t;
  const v1 = parts.v1;
  if (!timestamp || !v1) return false;

  const ageSec = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSec) || ageSec > 60 * 5) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${rawBody}`),
  );
  const digest = [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Timing-safe-ish compare
  if (digest.length !== v1.length) return false;
  let ok = 0;
  for (let i = 0; i < digest.length; i += 1) {
    ok |= digest.charCodeAt(i) ^ v1.charCodeAt(i);
  }
  return ok === 0;
}

/**
 * POST /stripe/webhook — Stripe → Convex billing tables.
 * Requires STRIPE_WEBHOOK_SECRET in production; local anonymous may skip when unset.
 */
export const stripeWebhook = httpAction(async (ctx, req) => {
  const rawBody = await req.text();
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const isProd = process.env.CONVEX_CLOUD_URL?.includes('.convex.cloud');

  if (secret) {
    const ok = await verifyStripeSignature(
      rawBody,
      req.headers.get('stripe-signature'),
      secret,
    );
    if (!ok) {
      return new Response(JSON.stringify({ error: 'invalid_signature' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } else if (isProd) {
    return new Response(JSON.stringify({ error: 'webhook_secret_required' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let event: StripeObject;
  try {
    event = JSON.parse(rawBody) as StripeObject;
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const eventId = asString(event.id);
  const type = asString(event.type);
  if (!eventId || !type) {
    return new Response(JSON.stringify({ error: 'missing_event_fields' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const begin = await ctx.runMutation(internal.billingUpsert.beginBillingEvent, {
    eventId,
    type,
  });
  if (begin.duplicate) {
    return new Response(JSON.stringify({ ok: true, duplicate: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const data = asObject(event.data);
    const obj = asObject(data?.object);
    let orgId: Id<'clients'> | null = null;

    if (type.startsWith('customer.subscription.')) {
      const customerId = customerIdFrom(obj);
      if (!customerId || !obj) {
        await ctx.runMutation(internal.billingUpsert.finishBillingEvent, {
          eventId,
          status: 'ignored',
          error: 'missing customer/subscription',
        });
        return new Response(JSON.stringify({ ok: true, ignored: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      orgId = await ctx.runQuery(
        internal.billingUpsert.resolveOrgByStripeCustomer,
        { stripeCustomerId: customerId },
      );
      if (!orgId) {
        await ctx.runMutation(internal.billingUpsert.finishBillingEvent, {
          eventId,
          status: 'ignored',
          error: `unknown stripe customer ${customerId}`,
        });
        return new Response(JSON.stringify({ ok: true, ignored: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const subId = asString(obj.id);
      if (!subId) throw new Error('subscription missing id');
      const periodEnd = asNumber(obj.current_period_end);
      await ctx.runMutation(internal.billingUpsert.upsertSubscription, {
        orgId,
        stripeSubscriptionId: subId,
        status: asString(obj.status) ?? 'unknown',
        planName: planNameFromSubscription(obj),
        cancelAtPeriodEnd: Boolean(obj.cancel_at_period_end),
        currentPeriodEnd: periodEnd != null ? periodEnd * 1000 : undefined,
      });
    } else if (
      type === 'invoice.paid' ||
      type === 'invoice.payment_failed' ||
      type === 'invoice.finalized' ||
      type === 'invoice.updated'
    ) {
      const customerId = customerIdFrom(obj);
      if (!customerId || !obj) {
        await ctx.runMutation(internal.billingUpsert.finishBillingEvent, {
          eventId,
          status: 'ignored',
          error: 'missing customer/invoice',
        });
        return new Response(JSON.stringify({ ok: true, ignored: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      orgId = await ctx.runQuery(
        internal.billingUpsert.resolveOrgByStripeCustomer,
        { stripeCustomerId: customerId },
      );
      if (!orgId) {
        await ctx.runMutation(internal.billingUpsert.finishBillingEvent, {
          eventId,
          status: 'ignored',
          error: `unknown stripe customer ${customerId}`,
        });
        return new Response(JSON.stringify({ ok: true, ignored: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const invoiceId = asString(obj.id);
      if (!invoiceId) throw new Error('invoice missing id');
      const periodStart = asNumber(obj.period_start);
      const periodEnd = asNumber(obj.period_end);
      const created = asNumber(obj.created);
      await ctx.runMutation(internal.billingUpsert.upsertInvoice, {
        orgId,
        stripeInvoiceId: invoiceId,
        number: asString(obj.number) ?? undefined,
        status: asString(obj.status) ?? 'unknown',
        amountDue: asNumber(obj.amount_due) ?? 0,
        currency: asString(obj.currency) ?? 'usd',
        hostedInvoiceUrl: asString(obj.hosted_invoice_url) ?? undefined,
        invoicePdf: asString(obj.invoice_pdf) ?? undefined,
        periodStart: periodStart != null ? periodStart * 1000 : undefined,
        periodEnd: periodEnd != null ? periodEnd * 1000 : undefined,
        createdAt: created != null ? created * 1000 : Date.now(),
      });
    } else {
      await ctx.runMutation(internal.billingUpsert.finishBillingEvent, {
        eventId,
        status: 'ignored',
      });
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await ctx.runMutation(internal.billingUpsert.finishBillingEvent, {
      eventId,
      status: 'done',
      orgId: orgId ?? undefined,
    });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await ctx.runMutation(internal.billingUpsert.finishBillingEvent, {
      eventId,
      status: 'error',
      error: message,
    });
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
