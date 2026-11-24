import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import schema from '../schema';
import { createInNotion, prepare } from '../projectCreate';
import { enqueue } from '../sync/outbox';
import { PortalAuthError } from './identity';
import { memoryCtx, type Actor, type MemoryCtx, type Respond } from './memoryCtx.testkit';
import { seedContact, seedOrg } from './seedRows.testkit';

const TARGET_PAGE = '5165ca6e-352e-45af-8918-98779fd76e61';

/** Every row of every table, to prove a refused call wrote nothing. */
const everything = (t: MemoryCtx) =>
  Object.keys((schema as unknown as { tables: Record<string, unknown> }).tables).map((table) => t.rows(table));

async function withWriteback(fn: () => Promise<void>) {
  const previous = process.env.NOTION_WRITEBACK_ENABLED;
  process.env.NOTION_WRITEBACK_ENABLED = 'true';
  try {
    await fn();
  } finally {
    if (previous === undefined) delete process.env.NOTION_WRITEBACK_ENABLED;
    else process.env.NOTION_WRITEBACK_ENABLED = previous;
  }
}

/** The prepare query and the outbox enqueue really run; the Notion worker answers with a created page. */
function respondFor(t: MemoryCtx): Respond {
  return (run) => {
    if (run.name === 'projectCreate:prepare') return t.call(prepare, run.args);
    if (run.name === 'sync/outbox:enqueue') return t.call(enqueue, run.args);
    if (run.name === 'sync/outboxWork:processOne') return { ok: true, notionPageId: 'page-new', projectId: 'proj-new', reused: false };
    throw new Error(`unexpected ${run.kind} ${run.name}`);
  };
}

/** A signed-in client contact with the given role, in its own org. */
function clientCaller(t: MemoryCtx, role: 'Client Admin' | 'Client Member'): { as: Actor; authUserId: string } {
  if (role === 'Client Admin') return { as: 'client', authUserId: t.actor('client') };
  const orgId = seedOrg(t, { slug: 'northwind-members', companyName: 'Northwind' });
  const authUserId = 'auth-client-member';
  seedContact(t, orgId, { role: 'Client Member', authUserId, name: 'Ada North', email: 'ada@northwind.example' });
  return { as: { authUserId }, authUserId };
}

describe('project create permissions', () => {
  for (const role of ['Client Admin', 'Client Member'] as const) {
    // The refusal is the same whether the target org exists or not, so a client cannot probe for orgs.
    for (const target of ['an existing client', 'a missing client'] as const) {
      it(`rejects ${role} with FORBIDDEN for ${target} and writes nothing`, async () => {
        await withWriteback(async () => {
          const t = memoryCtx();
          const caller = clientCaller(t, role);
          const orgId = target === 'an existing client' ? seedOrg(t, { notionPageId: TARGET_PAGE, slug: 'harbor' }) : 'clients:999';
          const before = everything(t);

          await assert.rejects(
            () => t.call(prepare, { authUserId: caller.authUserId, orgId, name: 'Harbor', externalId: 'wh_prj_harbor', publish: false }),
            (err: unknown) => {
              assert.ok(err instanceof PortalAuthError);
              assert.equal(err.code, 'FORBIDDEN');
              assert.match(err.message, /Staff role required/);
              return true;
            },
          );

          const denied = await t.call(
            createInNotion,
            { orgId, name: 'Harbor', externalId: 'wh_prj_harbor' },
            { as: caller.as, respond: respondFor(t) },
          );
          assert.deepEqual(denied, { ok: false, error: 'Staff role required' });
          assert.deepEqual(
            t.runs.map((run) => run.name),
            ['projectCreate:prepare'],
          );
          assert.deepEqual(everything(t), before);
          assert.deepEqual(t.scheduled, []);
          // The role check comes first: the target client is never read.
          assert.equal(t.reads.gets.includes(orgId), false);
          assert.deepEqual(t.reads.all.filter((read) => read.table === 'clients' && read.index !== 'by_authUserId'), []);
        });
      });
    }
  }

  it('refuses a signed-out caller before any read or write', async () => {
    await withWriteback(async () => {
      const t = memoryCtx();
      const orgId = seedOrg(t, { notionPageId: TARGET_PAGE, slug: 'harbor' });
      const before = everything(t);
      const denied = await t.call(createInNotion, { orgId, name: 'Harbor', externalId: 'wh_prj_harbor' }, { respond: respondFor(t) });
      assert.deepEqual(denied, { ok: false, error: 'Not authenticated' });
      assert.deepEqual(t.runs, []);
      assert.deepEqual(everything(t), before);
    });
  });

  it('lets Warehaus Staff create the project through the outbox', async () => {
    await withWriteback(async () => {
      const t = memoryCtx();
      const orgId = seedOrg(t, { notionPageId: TARGET_PAGE, slug: 'harbor' });
      const created = await t.call(
        createInNotion,
        { orgId, name: 'Harbor', externalId: 'wh_prj_harbor' },
        { as: 'staff', respond: respondFor(t) },
      );
      assert.deepEqual(created, { ok: true, projectId: 'proj-new', notionPageId: 'page-new', reused: false });
      const [row] = t.rows('notionOutbox');
      assert.equal(row?.kind, 'project-create');
      assert.equal(row?.orgId, orgId);
      assert.equal(row?.idempotencyKey, 'project-create:wh_prj_harbor');
      assert.equal(row?.actor, 'staff');
    });
  });
});
