import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createInNotion, prepare } from '../projectCreate';
import { PortalAuthError } from './identity';

type Row = Record<string, unknown> & { _id: string };

type Handler = (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>;

function run(fn: object, ctx: unknown, args: Record<string, unknown>) {
  return (fn as { _handler: Handler })._handler(ctx, args);
}

function memoryDb(tables: Record<string, Row[]>, lookedUp: string[]) {
  return {
    async get(id: string) {
      lookedUp.push(id);
      for (const rows of Object.values(tables)) {
        const found = rows.find((row) => row._id === id);
        if (found) return found;
      }
      return null;
    },
    query(table: string) {
      const chain = (rows: Row[]) => ({
        withIndex(_name: string, build?: (q: { eq: (field: string, value: unknown) => unknown }) => unknown) {
          const eqs: Array<[string, unknown]> = [];
          const query = {
            eq(field: string, value: unknown) {
              eqs.push([field, value]);
              return query;
            },
          };
          build?.(query);
          return chain(rows.filter((row) => eqs.every(([field, value]) => row[field] === value)));
        },
        unique: async () => (rows.length > 1 ? Promise.reject(new Error('Expected a unique row')) : rows[0] ?? null),
      });
      return chain(tables[table] ?? []);
    },
  };
}

function clientTables(role: 'Client Admin' | 'Client Member'): Record<string, Row[]> {
  return {
    contacts: [
      {
        _id: 'contact-client',
        orgId: 'org-client',
        name: 'Ada North',
        email: 'ada@northwind.example',
        authUserId: 'user-client',
        role,
        portalAccess: 'Enabled',
      },
    ],
    clients: [
      {
        _id: 'org-client',
        slug: 'northwind',
        companyName: 'Northwind',
        portalAccess: 'Enabled',
      },
    ],
  };
}

describe('project create permissions', () => {
  for (const role of ['Client Admin', 'Client Member'] as const) {
    it(`rejects ${role} with FORBIDDEN before reading the target client`, async () => {
      const lookedUp: string[] = [];
      const ctx = { db: memoryDb(clientTables(role), lookedUp) };
      const args = {
        authUserId: 'user-client',
        orgId: 'target-client',
        name: 'Harbor',
        externalId: 'wh_prj_harbor',
        publish: false,
      };
      await assert.rejects(
        () => run(prepare, ctx, args),
        (err: unknown) => {
          assert.ok(err instanceof PortalAuthError);
          assert.equal(err.code, 'FORBIDDEN');
          assert.match(err.message, /Staff role required/);
          return true;
        },
      );
      assert.equal(lookedUp.includes('target-client'), false);

      const denied = await run(createInNotion, {
        auth: { getUserIdentity: async () => ({ subject: 'user-client' }) },
        runQuery: async (_ref: unknown, queryArgs: Record<string, unknown>) => run(prepare, ctx, queryArgs),
      }, {
        orgId: 'target-client',
        name: 'Harbor',
        externalId: 'wh_prj_harbor',
      });
      assert.deepEqual(denied, { ok: false, error: 'Staff role required' });
      assert.equal(lookedUp.includes('target-client'), false);
    });
  }
});
