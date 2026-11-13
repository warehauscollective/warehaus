import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { portalApiRoutes } from '../http';
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

  it('registers the staff catalog routes', () => {
    const paths = new Set(portalApiRoutes.map((route) => `${route.method} ${route.path}`));
    for (const route of [
      'GET /api/v1/session',
      'GET /api/v1/clients',
      'GET /api/v1/clients/item',
      'POST /api/v1/clients',
      'GET /api/v1/projects',
      'GET /api/v1/projects/item',
      'POST /api/v1/projects',
      'POST /api/v1/milestones/attach',
    ]) {
      assert.equal(paths.has(route), true, route);
    }
  });
});
