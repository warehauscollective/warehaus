import { hashPassword } from 'better-auth/crypto';
import { v } from 'convex/values';
import { components, internal } from './_generated/api';
import { internalAction } from './_generated/server';
import type { JoinContactCandidate } from './_lib/contactJoin';
import { passwordRuleState } from './_lib/passwordRules';
import { staffProvisionContactError } from './_lib/registration';
import type { SelfServeDecision } from './_lib/registration';

type AuthUserDoc = { _id: string; email?: string; emailVerified?: boolean };
type AuthAccountDoc = { _id: string };

/**
 * Create or update a verified Better Auth user for one staff contact, then link it.
 * Internal only — `npx convex run staffProvision:provisionStaffUser`.
 * There is no HTTP header bypass. The password is a function argument; run this
 * from a private shell. Do not pass BETTER_AUTH_SECRET.
 */
export const provisionStaffUser = internalAction({
  args: {
    email: v.string(),
    password: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    authUserId: string;
    email: string;
    contactId: string;
    linked: true;
  }> => {
    const decision = (await ctx.runQuery(internal.contacts.selfServeEligibility, {
      email: args.email,
    })) as SelfServeDecision;
    if (decision.allowed || decision.reason !== 'staff') {
      throw new Error('That email is not a single Warehaus Staff contact');
    }

    const contact = (await ctx.runQuery(internal.contacts.staffContactForProvision, {
      email: args.email,
    })) as JoinContactCandidate | null;
    const contactError = staffProvisionContactError(contact);
    if (contactError || !contact) {
      throw new Error(contactError ?? 'No contact for that email');
    }
    if (!passwordRuleState(args.password).ready) {
      throw new Error('Password must be 12+ characters with mixed case and a number or symbol');
    }

    const email = contact.email.trim().toLowerCase();
    const name = args.name?.trim() || contact.name;
    const now = Date.now();
    const passwordHash = await hashPassword(args.password);

    const existing = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: 'user',
      where: [{ field: 'email', operator: 'eq', value: email }],
    })) as AuthUserDoc | null;

    let authUserId = existing?._id ?? '';
    if (!existing) {
      const created = (await ctx.runMutation(components.betterAuth.adapter.create, {
        input: {
          model: 'user',
          data: {
            name,
            email,
            emailVerified: true,
            createdAt: now,
            updatedAt: now,
          },
        },
      })) as AuthUserDoc;
      authUserId = created._id;
      await ctx.runMutation(components.betterAuth.adapter.create, {
        input: {
          model: 'account',
          data: {
            accountId: authUserId,
            providerId: 'credential',
            userId: authUserId,
            password: passwordHash,
            createdAt: now,
            updatedAt: now,
          },
        },
      });
    } else {
      await ctx.runMutation(components.betterAuth.adapter.updateOne, {
        input: {
          model: 'user',
          where: [{ field: '_id', operator: 'eq', value: existing._id }],
          update: { name, emailVerified: true, updatedAt: now },
        },
      });
      const account = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
        model: 'account',
        where: [
          { field: 'userId', operator: 'eq', value: existing._id },
          { field: 'providerId', operator: 'eq', value: 'credential' },
        ],
      })) as AuthAccountDoc | null;
      if (account) {
        await ctx.runMutation(components.betterAuth.adapter.updateOne, {
          input: {
            model: 'account',
            where: [{ field: '_id', operator: 'eq', value: account._id }],
            update: { password: passwordHash, updatedAt: now },
          },
        });
      } else {
        await ctx.runMutation(components.betterAuth.adapter.create, {
          input: {
            model: 'account',
            data: {
              accountId: existing._id,
              providerId: 'credential',
              userId: existing._id,
              password: passwordHash,
              createdAt: now,
              updatedAt: now,
            },
          },
        });
      }
    }

    if (contact.authUserId && contact.authUserId !== authUserId) {
      throw new Error('Staff contact is already linked to a different auth user');
    }

    const linked = (await ctx.runMutation(internal.contacts.linkStaffContact, {
      email,
      authUserId,
    })) as { email: string; contactId: string };
    return { authUserId, email: linked.email, contactId: linked.contactId, linked: true as const };
  },
});
