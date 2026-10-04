/** Terminal billing webhook rows are not retried. Failures stay open. */
export function isTerminalBillingEventStatus(status: string): boolean {
  return status === 'done' || status === 'ignored';
}

export type StripeOrgHint = {
  orgId?: string;
  slug?: string;
  externalId?: string;
};

function hintString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

/** Org locator carried on a Stripe Customer / Subscription / Invoice metadata bag. */
export function stripeCustomerOrgHint(metadata: unknown): StripeOrgHint {
  if (!metadata || typeof metadata !== 'object') return {};
  const bag = metadata as Record<string, unknown>;
  return {
    orgId: hintString(bag.orgId) ?? hintString(bag.clientId),
    slug: hintString(bag.slug) ?? hintString(bag.clientSlug),
    externalId: hintString(bag.externalId),
  };
}

export function mergeStripeOrgHints(...hints: StripeOrgHint[]): StripeOrgHint {
  const merged: StripeOrgHint = {};
  for (const hint of hints) {
    merged.orgId ??= hint.orgId;
    merged.slug ??= hint.slug;
    merged.externalId ??= hint.externalId;
  }
  return merged;
}
