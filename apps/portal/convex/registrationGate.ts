import { v } from 'convex/values';
import { internal } from './_generated/api';
import { action } from './_generated/server';
import { signupScreenForDecision, type SelfServeDecision } from './_lib/registration';

/**
 * Signup UI gate. Returns a screen only — never which rule failed.
 * Check-email is used both when a client contact can register and when no contact exists.
 */
export const prepareRegistration = action({
  args: { email: v.string() },
  handler: async (ctx, { email }): Promise<{ screen: 'check-email' | 'cant-register' }> => {
    try {
      const decision: SelfServeDecision = await ctx.runQuery(
        internal.contacts.selfServeEligibility,
        { email },
      );
      return { screen: signupScreenForDecision(decision) };
    } catch (err) {
      console.error('[prepareRegistration]', err instanceof Error ? err.message : 'failed');
      return { screen: 'cant-register' };
    }
  },
});
