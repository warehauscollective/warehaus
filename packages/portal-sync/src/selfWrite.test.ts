import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isPortalSelfWrite, observedFromNotionPage } from './selfWrite';

describe('self-write detection', () => {
  it('matches the values the portal wrote, ignoring timestamp differences', () => {
    const lastWritten = {
      'Portal Access': 'Disabled',
      'Invite Status': 'Pending',
      'Client Company': ['b', 'a'],
    };
    assert.equal(
      isPortalSelfWrite({
        observed: {
          'Portal Access': 'Disabled',
          'Invite Status': 'Pending',
          'Client Company': ['a', 'b'],
        },
        lastWritten,
      }),
      true,
    );
    assert.equal(
      isPortalSelfWrite({
        observed: { ...lastWritten, 'Portal Access': 'Enabled' },
        lastWritten,
      }),
      false,
    );
  });

  it('reads plain values back from Notion property objects', () => {
    const observed = observedFromNotionPage(
      {
        'Portal Access': { type: 'select', select: { name: 'Disabled' } },
        Email: { type: 'email', email: 'ada@example.com' },
      },
      ['Portal Access', 'Email'],
    );
    assert.deepEqual(observed, {
      'Portal Access': 'Disabled',
      Email: 'ada@example.com',
    });
    assert.equal(
      isPortalSelfWrite({
        observed,
        lastWritten: { 'Portal Access': 'Disabled', Email: 'ada@example.com' },
      }),
      true,
    );
  });
});
