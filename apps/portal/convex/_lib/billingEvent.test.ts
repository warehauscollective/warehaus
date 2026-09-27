import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isTerminalBillingEventStatus,
  mergeStripeOrgHints,
  stripeCustomerOrgHint,
} from './billingEvent';

describe('billing webhook retry', () => {
  it('retries failed and in-flight events and keeps done or ignored terminal', () => {
    assert.equal(isTerminalBillingEventStatus('done'), true);
    assert.equal(isTerminalBillingEventStatus('ignored'), true);
    assert.equal(isTerminalBillingEventStatus('error'), false);
    assert.equal(isTerminalBillingEventStatus('queued'), false);
  });

  it('reads the org hint from the first Stripe metadata that names one', () => {
    assert.deepEqual(
      stripeCustomerOrgHint({ orgId: ' org_1 ', slug: '', externalId: 'ext-9' }),
      { orgId: 'org_1', slug: undefined, externalId: 'ext-9' },
    );
    assert.deepEqual(
      mergeStripeOrgHints(
        stripeCustomerOrgHint({ clientSlug: 'sugar-shark' }),
        stripeCustomerOrgHint({ orgId: 'org_1' }),
      ),
      { orgId: 'org_1', slug: 'sugar-shark', externalId: undefined },
    );
    assert.deepEqual(stripeCustomerOrgHint(null), {});
  });
});
