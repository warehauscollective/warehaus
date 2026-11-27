import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { portalApiPrefixRoutes, portalApiRoutes } from '../http';
import { portalApiHttp } from '../portalApi';
import { memoryCtx } from './memoryCtx.testkit';

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
      'GET /api/v1/milestones/asks',
      'GET /api/v1/milestones/needs-peter',
      'POST /api/v1/milestones/attach',
      'POST /api/v1/milestones/detach',
      'GET /api/v1/context',
      'GET /api/v1/context/grilling',
      'POST /api/v1/context/brief',
      'POST /api/v1/context/terms',
      'POST /api/v1/context/decisions',
    ]) {
      assert.equal(paths.has(route), true, route);
    }
    assert.deepEqual(portalApiPrefixRoutes, [{ pathPrefix: '/api/v1/milestones/', method: 'POST' }]);
  });

  it('routes the Asks list with an optional person, and the old needs-peter path to Peter', async () => {
    const asked: Array<Record<string, unknown>> = [];
    const get = async (path: string) => {
      const t = memoryCtx();
      const response = await t.callHttp(
        portalApiHttp,
        new Request(`https://portal.test${path}`, { headers: { authorization: 'Bearer whp_testtokenvalue0001' } }),
        {
          respond: (call) => {
            if (call.name.endsWith('consumeToken')) {
              return { ok: true, tokenId: 'apiTokens:token', name: 'grok-bot', scope: 'read' };
            }
            asked.push({ name: call.name, ...(call.args as Record<string, unknown>) });
            return { status: 200, body: { items: [] } };
          },
        },
      );
      return response.status;
    };
    assert.equal(await get('/api/v1/milestones/asks'), 200);
    assert.equal(await get('/api/v1/milestones/asks?person=maya%40warehaus.test'), 200);
    assert.equal(await get('/api/v1/milestones/needs-peter'), 200);
    assert.equal(await get(`/api/v1/milestones/asks?person=${'a'.repeat(321)}`), 400);
    assert.deepEqual(
      asked.map(({ name, ...args }) => ({ list: String(name).endsWith('listOpenAsks'), args })),
      [
        { list: true, args: {} },
        { list: true, args: { person: 'maya@warehaus.test' } },
        { list: true, args: { person: 'peter', personOptional: true } },
      ],
    );
  });
});
