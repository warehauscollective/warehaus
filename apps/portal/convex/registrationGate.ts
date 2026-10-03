import { v } from 'convex/values';
import { internal } from './_generated/api';
import { action } from './_generated/server';
import { signupScreenForDecision, type SelfServeDecision } from './_lib/registration';

/**
 * Signup UI gate. Always the same screen — never which rule failed.
 * Eligible, missing, and blocked addresses all return check-email.
 */
export const prepareRegistration = action({
  args: { email: v.string() },
  handler: async (ctx, { email }): Promise<{ screen: 'check-email' }> => {
    try {
      const decision: SelfServeDecision = await ctx.runQuery(
        internal.contacts.selfServeEligibility,
        { email },
      );
      return { screen: signupScreenForDecision(decision) };
    } catch (err) {
      console.error('[prepareRegistration]', err instanceof Error ? err.message : 'failed');
      return { screen: 'check-email' };
    }
  },
});
