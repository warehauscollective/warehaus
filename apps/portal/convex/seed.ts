import { mutation } from './_generated/server';

/**
 * Local/dev seed for login + Contact join testing.
 * Run: `npx convex run seed:seedDemoTenants`
 *
 * Demo client login: demo@northbay.test / (create password on /login)
 * Staff login:       peter@warehaus.co or team@warehaus.co
 *
 * Safe to re-run (idempotent upsert by slug/email).
 */
export const seedDemoTenants = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const existingClient = await ctx.db
      .query('clients')
      .withIndex('by_slug', (q) => q.eq('slug', 'client-portal'))
      .unique();

    const clientId =
      existingClient?._id ??
      (await ctx.db.insert('clients', {
        notionPageId: 'seed-client-portal',
        externalId: 'wh_cli_north_bay',
        companyName: 'North Bay Collective',
        slug: 'client-portal',
        status: 'Active',
        portalAccess: 'Enabled',
        primaryEmail: 'ops@northbay.test',
        source: 'portal',
        lastSyncedAt: now,
      }));

    // Prefer Notion slug `warehaus-internal` (Warehaus Internal client).
    const existingStaffOrg =
      (await ctx.db
        .query('clients')
        .withIndex('by_slug', (q) => q.eq('slug', 'warehaus-internal'))
        .unique()) ??
      (await ctx.db
        .query('clients')
        .withIndex('by_slug', (q) => q.eq('slug', 'warehaus'))
        .unique());

    const staffOrgId =
      existingStaffOrg?._id ??
      (await ctx.db.insert('clients', {
        notionPageId: 'seed-warehaus-org',
        externalId: 'wh_cli_warehaus-internal',
        companyName: 'Warehaus (Internal)',
        slug: 'warehaus-internal',
        status: 'Active',
        portalAccess: 'Enabled',
        primaryEmail: 'peter@warehaus.co',
        source: 'portal',
        lastSyncedAt: now,
      }));

    if (existingStaffOrg) {
      await ctx.db.patch(existingStaffOrg._id, {
        companyName: 'Warehaus (Internal)',
        slug: 'warehaus-internal',
        externalId: existingStaffOrg.externalId ?? 'wh_cli_warehaus-internal',
        primaryEmail: 'peter@warehaus.co',
        portalAccess: 'Enabled',
        lastSyncedAt: now,
      });
    }

    async function ensureContact(input: {
      email: string;
      name: string;
      orgId: typeof clientId;
      role: 'Client Admin' | 'Client Member' | 'Warehaus Staff';
      notionPageId: string;
      externalId: string;
    }) {
      const email = input.email.toLowerCase();
      const existing = await ctx.db
        .query('contacts')
        .withIndex('by_email', (q) => q.eq('email', email))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          orgId: input.orgId,
          name: input.name,
          role: input.role,
          portalAccess: 'Enabled',
          externalId: input.externalId,
          notionPageId: input.notionPageId,
          lastSyncedAt: now,
        });
        return existing._id;
      }
      return ctx.db.insert('contacts', {
        orgId: input.orgId,
        notionPageId: input.notionPageId,
        externalId: input.externalId,
        name: input.name,
        email,
        role: input.role,
        portalAccess: 'Enabled',
        source: 'portal',
        lastSyncedAt: now,
      });
    }

    const demoContactId = await ensureContact({
      email: 'demo@northbay.test',
      name: 'North Bay Demo',
      orgId: clientId,
      role: 'Client Admin',
      notionPageId: 'seed-contact-northbay-demo',
      externalId: 'wh_con_northbay_demo',
    });

    const staffContactId = await ensureContact({
      email: 'team@warehaus.co',
      name: 'Warehaus Team',
      orgId: staffOrgId,
      role: 'Warehaus Staff',
      notionPageId: 'seed-contact-warehaus-team',
      externalId: 'wh_con_warehaus_team',
    });

    const peterContactId = await ensureContact({
      email: 'peter@warehaus.co',
      name: 'Peter Roquemore',
      orgId: staffOrgId,
      role: 'Warehaus Staff',
      notionPageId: '3b1ffd60-316b-81cc-929a-f818abc377be',
      externalId: 'wh_con_peter_warehaus',
    });

    // Sample published project for the demo client
    const existingProject = await ctx.db
      .query('projects')
      .withIndex('by_orgId', (q) => q.eq('orgId', clientId))
      .first();

    if (!existingProject) {
      await ctx.db.insert('projects', {
        orgId: clientId,
        notionPageId: 'seed-project-northbay',
        externalId: 'wh_prj_northbay_portal',
        name: 'North Bay Portal',
        description: 'Client portal pilot for North Bay Collective.',
        status: 'In progress',
        progress: 0.4,
        type: ['Website'],
        archive: false,
        publishToWarehaus: true,
        stack: ['Next.js', 'Convex'],
        source: 'portal',
        lastSyncedAt: now,
      });
    }

    return {
      clientId,
      staffOrgId,
      demoContactId,
      staffContactId,
      peterContactId,
      demoEmail: 'demo@northbay.test',
      staffEmail: 'team@warehaus.co',
      peterEmail: 'peter@warehaus.co',
    };
  },
});

/**
 * Demo Stripe-shaped billing rows (no live Stripe required).
 * Run: `npx convex run seed:seedDemoBilling`
 */
export const seedDemoBilling = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const monthMs = 30 * 24 * 60 * 60 * 1000;

    async function seedOrg(slug: string, planName: string, amountCents: number) {
      const client = await ctx.db
        .query('clients')
        .withIndex('by_slug', (q) => q.eq('slug', slug))
        .unique();
      if (!client) return null;

      const stripeCustomerId =
        client.stripeCustomerId ?? `cus_seed_${slug.replace(/-/g, '_')}`;
      if (!client.stripeCustomerId) {
        await ctx.db.patch(client._id, { stripeCustomerId });
      }

      const subKey = `sub_seed_${slug}`;
      const existingSub = await ctx.db
        .query('billingSubscriptions')
        .withIndex('by_stripeSubscriptionId', (q) =>
          q.eq('stripeSubscriptionId', subKey),
        )
        .unique();
      if (existingSub) {
        await ctx.db.patch(existingSub._id, {
          orgId: client._id,
          status: 'active',
          planName,
          cancelAtPeriodEnd: false,
          currentPeriodEnd: now + monthMs,
          lastSyncedAt: now,
        });
      } else {
        await ctx.db.insert('billingSubscriptions', {
          orgId: client._id,
          stripeSubscriptionId: subKey,
          status: 'active',
          planName,
          cancelAtPeriodEnd: false,
          currentPeriodEnd: now + monthMs,
          lastSyncedAt: now,
        });
      }

      const invoices = [
        {
          stripeInvoiceId: `in_seed_${slug}_prev`,
          number: `WH-${slug.slice(0, 4).toUpperCase()}-001`,
          status: 'paid',
          amountDue: amountCents,
          createdAt: now - monthMs,
          periodStart: now - 2 * monthMs,
          periodEnd: now - monthMs,
        },
        {
          stripeInvoiceId: `in_seed_${slug}_open`,
          number: `WH-${slug.slice(0, 4).toUpperCase()}-002`,
          status: 'open',
          amountDue: amountCents,
          createdAt: now - 2 * 24 * 60 * 60 * 1000,
          periodStart: now - monthMs,
          periodEnd: now + monthMs,
        },
      ];

      for (const inv of invoices) {
        const existing = await ctx.db
          .query('billingInvoices')
          .withIndex('by_stripeInvoiceId', (q) =>
            q.eq('stripeInvoiceId', inv.stripeInvoiceId),
          )
          .unique();
        const row = {
          orgId: client._id,
          stripeInvoiceId: inv.stripeInvoiceId,
          number: inv.number,
          status: inv.status,
          amountDue: inv.amountDue,
          currency: 'usd',
          hostedInvoiceUrl: `https://invoice.stripe.com/i/acct_seed/${inv.stripeInvoiceId}`,
          invoicePdf: undefined as string | undefined,
          periodStart: inv.periodStart,
          periodEnd: inv.periodEnd,
          createdAt: inv.createdAt,
        };
        if (existing) await ctx.db.patch(existing._id, row);
        else await ctx.db.insert('billingInvoices', row);
      }

      return { orgId: client._id, slug, stripeCustomerId, planName };
    }

    const northBay = await seedOrg('client-portal', 'Client plan', 250_000);
    const warehaus = await seedOrg('warehaus-internal', 'Workspace', 0);

    return { northBay, warehaus };
  },
});

