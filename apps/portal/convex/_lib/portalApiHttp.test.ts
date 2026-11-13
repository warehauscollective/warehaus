import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { portalApiHttp } from '../portalApi';

describe('portalApiHttp', () => {
  it('rejects a missing bearer before any Convex call', async () => {
    const http = portalApiHttp as unknown as {
      invokeHttpAction: (request: Request) => Promise<Response>;
    };
    const response = await http.invokeHttpAction(new Request('https://portal.test/api/v1/tasks'));
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'Unauthorized' });
  });
});
