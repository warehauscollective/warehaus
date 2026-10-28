import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { listStaffNotices, markNoticeRead } from '../invitesSync';

type Row = Record<string, unknown> & { _id: string };

class EqBuilder {
  private eqs: Array<[string, unknown]> = [];
  eq(field: string, value: unknown): this {
    this.eqs.push([field, value]);
    return this;
  }
  matches(row: Row): boolean {
    return this.eqs.every(([field, value]) => row[field] === value);
  }
}

class MemoryIndex {
  constructor(private readonly rows: Row[]) {}
  order(direction: 'asc' | 'desc') {
    const sorted = [...this.rows].sort((a, b) => {
      const av = (a.timestamp ?? a.createdAt ?? 0) as number;
      const bv = (b.timestamp ?? b.createdAt ?? 0) as number;
      if (av === bv) return 0;
      const cmp = av < bv ? -1 : 1;
      return direction === 'desc' ? -cmp : cmp;
    });
    return {
      take: async (n: number) => sorted.slice(0, n),
    };
  }
  async unique() {
    if (this.rows.length > 1) throw new Error('Expected a unique row');
    return this.rows[0] ?? null;
  }
}

function memoryDb(tables: Record<string, Row[]>) {
  let seq = 1;
  return {
    async get(id: string) {
      for (const rows of Object.values(tables)) {
        const found = rows.find((row) => row._id === id);
        if (found) return found;
      }
      return null;
    },
    async insert(table: string, doc: Record<string, unknown>) {
      const row = { ...doc, _id: `${table}-${seq++}` } as Row;
      tables[table] = tables[table] ?? [];
      tables[table].push(row);
      return row._id;
    },
    query(table: string) {
      const rows = () => tables[table] ?? [];
      return {
        withIndex(_name: string, build?: (q: EqBuilder) => EqBuilder) {
          const matched = build ? rows().filter((row) => build(new EqBuilder()).matches(row)) : rows();
          return new MemoryIndex(matched);
        },
      };
    },
  };
}

const org = {
  _id: 'org-northwind',
  companyName: 'Northwind',
  slug: 'northwind',
  portalAccess: 'Enabled' as const,
};

const tables: Record<string, Row[]> = {
  clients: [org],
  contacts: [
    {
      _id: 'contact-a',
      orgId: org._id,
      name: 'Ada Staff',
      email: 'ada.staff@warehaus.test',
      authUserId: 'auth-a',
      role: 'Warehaus Staff',
      portalAccess: 'Enabled',
      notionPageId: 'staff-a',
    },
    {
      _id: 'contact-b',
      orgId: org._id,
      name: 'Bea Staff',
      email: 'bea.staff@warehaus.test',
      authUserId: 'auth-b',
      role: 'Warehaus Staff',
      portalAccess: 'Enabled',
      notionPageId: 'staff-b',
    },
  ],
  notices: [
    {
      _id: 'notice-1',
      orgId: org._id,
      audience: 'staff',
      message: 'Homepage: Stage "Mystery" is not a portal stage',
      edgeCase: 'unknown-stage:page-1',
      createdAt: 20,
    },
  ],
  noticeReads: [],
};

const db = memoryDb(tables);

function ctxFor(subject: string) {
  return {
    auth: { getUserIdentity: async () => ({ subject }) },
    db,
  };
}

type Handler = (ctx: ReturnType<typeof ctxFor>, args: Record<string, unknown>) => Promise<unknown>;

function run(fn: object, subject: string, args: Record<string, unknown> = {}) {
  return (fn as { _handler: Handler })._handler(ctxFor(subject), args);
}

describe('per-staff notice reads', () => {
  it('keeps staff B unread after staff A marks the notice read', async () => {
    const beforeA = (await run(listStaffNotices, 'auth-a')) as Array<{ unread: boolean }>;
    const beforeB = (await run(listStaffNotices, 'auth-b')) as Array<{ unread: boolean }>;
    assert.equal(beforeA[0]?.unread, true);
    assert.equal(beforeB[0]?.unread, true);

    const marked = await run(markNoticeRead, 'auth-a', { noticeId: 'notice-1' });
    assert.deepEqual(marked, { ok: true });

    const afterA = (await run(listStaffNotices, 'auth-a')) as Array<{ unread: boolean; readAt: number | null }>;
    const afterB = (await run(listStaffNotices, 'auth-b')) as Array<{ unread: boolean; readAt: number | null }>;
    assert.equal(afterA[0]?.unread, false);
    assert.ok(afterA[0]?.readAt);
    assert.equal(afterB[0]?.unread, true);
    assert.equal(afterB[0]?.readAt, null);
    assert.equal(tables.notices[0]?.readAt, undefined);
  });
});
