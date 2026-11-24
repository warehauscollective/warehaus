/**
 * The in-memory Convex ctx for tests (see AGENTS.md, "Testing Convex
 * handlers"). Tests call a real query, mutation or action handler with
 * `call(fn, args, { as })` and assert the rows it left behind.
 *
 * It is strict where Convex is strict:
 * - Every `withIndex` names an index in `schema.ts`, and its `eq` fields are
 *   a leading prefix of that index, with at most one range on the next field.
 *   Anything else throws. Results come back in index order, then
 *   `_creationTime`.
 * - Arguments are checked against the function's own `args` validator, and
 *   every stored document against its table's validator.
 * - Ids are table scoped (`tasks:1`). `get` of an id from another table, or of
 *   a missing row, is null. `patch`, `replace` and `delete` of a missing row
 *   throw. `unique()` throws on more than one row.
 * - A handler that throws leaves no write behind.
 *
 * It does not enforce bounded reads. It records them: `reads.unbounded()`
 * lists every `.collect()` and async iteration, `reads.unindexed()` every
 * read with no index. A test on a path that should be bounded asserts both
 * are empty.
 *
 * The scheduler and `runQuery`, `runMutation`, `runAction` record each call
 * and run nothing. An action test answers them with `respond`.
 *
 * Convex skips this file: its name has more than one dot.
 */

import { getFunctionAddress, getFunctionName } from 'convex/server';
import schema from '../schema';
import { PETER_EMAILS } from './milestoneReview';

type Doc = Record<string, unknown> & { _id: string; _creationTime: number };
type Value = unknown;

type ValidatorJson =
  | { type: 'id'; tableName: string }
  | { type: 'string' | 'number' | 'bigint' | 'boolean' | 'null' | 'any' | 'bytes' }
  | { type: 'literal'; value: Value }
  | { type: 'array'; value: ValidatorJson }
  | { type: 'object'; value: Record<string, { fieldType: ValidatorJson; optional: boolean }> }
  | { type: 'record'; keys: ValidatorJson; values: { fieldType: ValidatorJson; optional: boolean } }
  | { type: 'union'; value: ValidatorJson[] };

type TableSchema = { indexes: { indexDescriptor: string; fields: string[] }[]; validator: { json: ValidatorJson } };

const TABLES = (schema as unknown as { tables: Record<string, TableSchema> }).tables;
const SYSTEM_TABLES = new Set(['_storage', '_scheduled_functions']);

// ---------------------------------------------------------------------------
// Validation

export class MemoryCtxError extends Error {}

function describe(value: Value): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (value instanceof ArrayBuffer) return 'bytes';
  return typeof value;
}

/** Check a value against a validator's JSON form. Returns the first problem, or null. */
export function checkValue(validator: ValidatorJson, value: Value, path = 'value'): string | null {
  switch (validator.type) {
    case 'any':
      return null;
    case 'id':
      if (typeof value !== 'string') return `${path}: expected an id of ${validator.tableName}, got ${describe(value)}`;
      if (tableOf(value) !== validator.tableName) return `${path}: expected an id of ${validator.tableName}, got "${value}"`;
      return null;
    case 'string':
    case 'boolean':
    case 'bigint':
      return typeof value === validator.type ? null : `${path}: expected ${validator.type}, got ${describe(value)}`;
    case 'number':
      return typeof value === 'number' ? null : `${path}: expected number, got ${describe(value)}`;
    case 'null':
      return value === null ? null : `${path}: expected null, got ${describe(value)}`;
    case 'bytes':
      return value instanceof ArrayBuffer ? null : `${path}: expected bytes, got ${describe(value)}`;
    case 'literal':
      return value === validator.value ? null : `${path}: expected ${JSON.stringify(validator.value)}, got ${JSON.stringify(value)}`;
    case 'array': {
      if (!Array.isArray(value)) return `${path}: expected array, got ${describe(value)}`;
      for (const [index, item] of value.entries()) {
        const problem = checkValue(validator.value, item, `${path}[${index}]`);
        if (problem) return problem;
      }
      return null;
    }
    case 'object': {
      if (describe(value) !== 'object') return `${path}: expected object, got ${describe(value)}`;
      const record = value as Record<string, Value>;
      for (const [key, field] of Object.entries(validator.value)) {
        if (record[key] === undefined) {
          if (!field.optional) return `${path}.${key}: required, got undefined`;
          continue;
        }
        const problem = checkValue(field.fieldType, record[key], `${path}.${key}`);
        if (problem) return problem;
      }
      for (const key of Object.keys(record)) {
        if (record[key] !== undefined && !(key in validator.value)) return `${path}.${key}: not in the validator`;
      }
      return null;
    }
    case 'record': {
      if (describe(value) !== 'object') return `${path}: expected record, got ${describe(value)}`;
      for (const [key, item] of Object.entries(value as Record<string, Value>)) {
        const keyProblem = checkValue(validator.keys, key, `${path} key`);
        if (keyProblem) return keyProblem;
        const problem = checkValue(validator.values.fieldType, item, `${path}.${key}`);
        if (problem) return problem;
      }
      return null;
    }
    case 'union': {
      const problems = validator.value.map((member) => checkValue(member, value, path));
      return problems.includes(null) ? null : `${path}: matches no member of the union (${problems[0]})`;
    }
  }
}

function tableOf(id: string): string | null {
  const at = id.indexOf(':');
  return at > 0 ? id.slice(0, at) : null;
}

function withoutSystemFields(doc: Record<string, Value>): Record<string, Value> {
  const fields = { ...doc };
  delete fields._id;
  delete fields._creationTime;
  return fields;
}

/** Check a value against a Convex validator (`v.object(...)` and so on). */
export function checkAgainst(validator: unknown, value: Value): string | null {
  return checkValue((validator as { json: ValidatorJson }).json, value);
}

function assertStorable(table: string, doc: Record<string, Value>) {
  const spec = TABLES[table];
  if (!spec) throw new MemoryCtxError(`Unknown table "${table}"`);
  const problem = checkValue(spec.validator.json, withoutSystemFields(doc), table);
  if (problem) throw new MemoryCtxError(`Schema: ${problem}`);
}

// ---------------------------------------------------------------------------
// Ordering

const RANK: Record<string, number> = { undefined: 0, null: 1, number: 2, bigint: 2, boolean: 3, string: 4, bytes: 5, array: 6, object: 7 };

export function compareValues(a: Value, b: Value): number {
  const ra = RANK[describe(a)] ?? 8;
  const rb = RANK[describe(b)] ?? 8;
  if (ra !== rb) return ra - rb;
  if (a === b) return 0;
  if (typeof a === 'number' || typeof a === 'bigint') return (a as number) < (b as number) ? -1 : 1;
  if (typeof a === 'boolean') return a ? 1 : -1;
  if (typeof a === 'string') return a < (b as string) ? -1 : 1;
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
      const c = compareValues(a[i], b[i]);
      if (c !== 0) return c;
    }
    return a.length - b.length;
  }
  return JSON.stringify(a) < JSON.stringify(b) ? -1 : 1;
}

// ---------------------------------------------------------------------------
// Reads

export type ReadRecord = {
  table: string;
  index: string | null;
  /** The fields the read pinned with `eq`, in order. */
  eq: string[];
  terminal: 'first' | 'unique' | 'take' | 'paginate' | 'collect' | 'iterate';
  /** The row limit of a `take` or a `paginate` page. */
  limit?: number;
};

type Bound = { op: 'gt' | 'gte' | 'lt' | 'lte'; field: string; value: Value };

/** The `q` a `withIndex` range receives. */
export type IndexRange = {
  eq(field: string, value: Value): IndexRange;
  gt(field: string, value: Value): IndexRange;
  gte(field: string, value: Value): IndexRange;
  lt(field: string, value: Value): IndexRange;
  lte(field: string, value: Value): IndexRange;
};

function indexFields(table: string, name: string): string[] {
  if (name === 'by_id') return ['_id'];
  if (name === 'by_creation_time') return ['_creationTime'];
  const found = TABLES[table]?.indexes.find((index) => index.indexDescriptor === name);
  if (!found) throw new MemoryCtxError(`Index "${name}" is not defined on table "${table}"`);
  return [...found.fields, '_creationTime'];
}

type Store = {
  tables: Map<string, Doc[]>;
  next: number;
};

function rowsOf(store: Store, table: string): Doc[] {
  if (!store.tables.has(table)) store.tables.set(table, []);
  return store.tables.get(table) as Doc[];
}

function findRow(store: Store, id: string): Doc | null {
  const table = tableOf(id);
  if (!table) return null;
  return rowsOf(store, table).find((row) => row._id === id) ?? null;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function makeQuery(store: Store, table: string, reads: ReadRecord[]) {
  let index: string | null = null;
  let fields: string[] = ['_creationTime'];
  const eq: Array<[string, Value]> = [];
  const bounds: Bound[] = [];
  let descending = false;

  const matched = (): Doc[] => {
    const rows = rowsOf(store, table).filter(
      (row) =>
        eq.every(([field, value]) => compareValues(row[field], value) === 0) &&
        bounds.every((bound) => {
          const c = compareValues(row[bound.field], bound.value);
          return bound.op === 'gt' ? c > 0 : bound.op === 'gte' ? c >= 0 : bound.op === 'lt' ? c < 0 : c <= 0;
        }),
    );
    rows.sort((a, b) => {
      for (const field of fields) {
        const c = compareValues(a[field], b[field]);
        if (c !== 0) return c;
      }
      return 0;
    });
    if (descending) rows.reverse();
    return rows.map(clone);
  };

  const record = (terminal: ReadRecord['terminal'], limit?: number) =>
    reads.push({ table, index, eq: eq.map(([field]) => field), terminal, ...(limit === undefined ? {} : { limit }) });

  const terminals = {
    order(direction: 'asc' | 'desc') {
      descending = direction === 'desc';
      return terminals;
    },
    filter() {
      throw new MemoryCtxError('query.filter is not supported. Read through an index and filter in code.');
    },
    async first() {
      record('first');
      return matched()[0] ?? null;
    },
    async unique() {
      record('unique');
      const rows = matched();
      if (rows.length > 1) throw new MemoryCtxError(`unique() on "${table}" matched ${rows.length} rows`);
      return rows[0] ?? null;
    },
    async take(count: number) {
      record('take', count);
      return matched().slice(0, count);
    },
    async collect() {
      record('collect');
      return matched();
    },
    async paginate(options: { numItems: number; cursor: string | null }) {
      record('paginate', options.numItems);
      const rows = matched();
      const start = options.cursor ? Number(options.cursor) : 0;
      const end = start + options.numItems;
      return { page: rows.slice(start, end), isDone: end >= rows.length, continueCursor: String(Math.min(end, rows.length)) };
    },
    [Symbol.asyncIterator]() {
      record('iterate');
      const rows = matched();
      let at = 0;
      return { next: async () => (at < rows.length ? { value: rows[at++], done: false } : { value: undefined, done: true }) };
    },
  };

  return {
    ...terminals,
    withIndex(name: string, build?: (q: IndexRange) => IndexRange) {
      fields = indexFields(table, name);
      index = name;
      let position = 0;
      let rangeField: string | null = null;
      const range = (op: Bound['op']) => (field: string, value: Value): IndexRange => {
        if (rangeField && rangeField !== field) throw new MemoryCtxError(`withIndex("${name}"): ranges on two fields`);
        if (fields[position] !== field) {
          throw new MemoryCtxError(`withIndex("${name}"): ${op}("${field}") is not field ${position + 1} of [${fields.join(', ')}]`);
        }
        const lower = op === 'gt' || op === 'gte';
        if (bounds.some((bound) => (bound.op === 'gt' || bound.op === 'gte') === lower)) {
          throw new MemoryCtxError(`withIndex("${name}"): two ${lower ? 'lower' : 'upper'} bounds on "${field}"`);
        }
        rangeField = field;
        bounds.push({ op, field, value });
        return q;
      };
      const q: IndexRange = {
        eq(field: string, value: Value) {
          if (rangeField) throw new MemoryCtxError(`withIndex("${name}"): eq("${field}") after a range`);
          if (fields[position] !== field) {
            throw new MemoryCtxError(`withIndex("${name}"): eq("${field}") is not field ${position + 1} of [${fields.join(', ')}]`);
          }
          eq.push([field, value]);
          position += 1;
          return q;
        },
        gt: range('gt'),
        gte: range('gte'),
        lt: range('lt'),
        lte: range('lte'),
      };
      build?.(q);
      return terminals;
    },
  };
}

// ---------------------------------------------------------------------------
// The ctx

/**
 * A function reference's name. A call into a component (such as Better Auth)
 * has no name in this app, so it is named by its reference path, like
 * `_reference/childComponent/betterAuth/adapter/findOne`.
 */
function nameOf(ref: unknown): string {
  try {
    return getFunctionName(ref as never);
  } catch {
    const address = getFunctionAddress(ref as never) as { reference?: string; name?: string };
    const name = address.reference ?? address.name;
    if (!name) throw new MemoryCtxError('Could not name a function reference');
    return name;
  }
}

export type Actor = 'staff' | 'peter' | 'client' | { authUserId: string };

export type ScheduledCall = { name: string; at: number; args: Record<string, Value>; id: string };
export type RunCall = { kind: 'query' | 'mutation' | 'action'; name: string; args: Record<string, Value> };
export type Respond = (call: RunCall) => unknown;

type RegisteredFunction = {
  isQuery?: boolean;
  isMutation?: boolean;
  isAction?: boolean;
  exportArgs?: () => string;
  _handler: (ctx: unknown, args: Record<string, Value>) => Promise<unknown>;
};

export type CallOptions = { as?: Actor; respond?: Respond };

export function memoryCtx() {
  const store: Store = { tables: new Map(), next: 1 };
  const readLog: ReadRecord[] = [];
  const getLog: string[] = [];
  const scheduled: ScheduledCall[] = [];
  const runs: RunCall[] = [];
  const storage = { deleted: [] as string[] };
  const actors = new Map<string, string>();

  function insertRow(table: string, doc: Record<string, Value>): string {
    if (SYSTEM_TABLES.has(table)) throw new MemoryCtxError(`Cannot insert into system table "${table}"`);
    const fields = withoutSystemFields(doc);
    for (const key of Object.keys(fields)) if (fields[key] === undefined) delete fields[key];
    assertStorable(table, fields);
    const id = `${table}:${store.next}`;
    rowsOf(store, table).push({ ...clone(fields), _id: id, _creationTime: store.next });
    store.next += 1;
    return id;
  }

  function existing(id: string, verb: string): Doc {
    const row = findRow(store, id);
    if (!row) throw new MemoryCtxError(`${verb}: no row "${id}"`);
    return row;
  }

  function writeRow(row: Doc, next: Record<string, Value>) {
    const table = tableOf(row._id) as string;
    for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
    assertStorable(table, next);
    const rows = rowsOf(store, table);
    rows[rows.indexOf(row)] = { ...clone(next), _id: row._id, _creationTime: row._creationTime };
  }

  const reader = {
    async get(id: string) {
      getLog.push(id);
      const row = typeof id === 'string' ? findRow(store, id) : null;
      return row ? clone(row) : null;
    },
    query(table: string) {
      if (!TABLES[table]) throw new MemoryCtxError(`Unknown table "${table}"`);
      return makeQuery(store, table, readLog);
    },
    normalizeId(table: string, id: string) {
      return typeof id === 'string' && tableOf(id) === table ? id : null;
    },
    system: {
      async get(id: string) {
        const row = findRow(store, id);
        return row && tableOf(id) === '_storage' ? clone(row) : null;
      },
      query(table: string) {
        if (table !== '_storage') throw new MemoryCtxError(`Unknown system table "${table}"`);
        return makeQuery(store, table, readLog);
      },
    },
  };

  const writer = {
    ...reader,
    async insert(table: string, doc: Record<string, Value>) {
      return insertRow(table, doc);
    },
    async patch(id: string, fields: Record<string, Value>) {
      const row = existing(id, 'patch');
      if ('_id' in fields || '_creationTime' in fields) throw new MemoryCtxError('patch: cannot change system fields');
      writeRow(row, { ...withoutSystemFields(row), ...fields });
    },
    async replace(id: string, doc: Record<string, Value>) {
      const row = existing(id, 'replace');
      writeRow(row, withoutSystemFields(doc));
    },
    async delete(id: string) {
      const row = existing(id, 'delete');
      const rows = rowsOf(store, tableOf(id) as string);
      rows.splice(rows.indexOf(row), 1);
    },
  };

  const readOnly = {
    ...reader,
    insert: async () => {
      throw new MemoryCtxError('A query cannot write');
    },
    patch: async () => {
      throw new MemoryCtxError('A query cannot write');
    },
    replace: async () => {
      throw new MemoryCtxError('A query cannot write');
    },
    delete: async () => {
      throw new MemoryCtxError('A query cannot write');
    },
  };

  const scheduler = {
    async runAfter(delayMs: number, ref: unknown, args: Record<string, Value> = {}) {
      return schedule(Date.now() + delayMs, ref, args);
    },
    async runAt(at: number | Date, ref: unknown, args: Record<string, Value> = {}) {
      return schedule(typeof at === 'number' ? at : at.getTime(), ref, args);
    },
    async cancel(id: string) {
      const at = scheduled.findIndex((call) => call.id === id);
      if (at >= 0) scheduled.splice(at, 1);
    },
  };

  function schedule(at: number, ref: unknown, args: Record<string, Value>) {
    const id = `_scheduled_functions:${store.next}`;
    store.next += 1;
    scheduled.push({ name: nameOf(ref), at, args: clone(args), id });
    return id;
  }

  function seedActor(actor: Actor): string {
    if (typeof actor === 'object') return actor.authUserId;
    const known = actors.get(actor);
    if (known) return known;
    const authUserId = `auth-${actor}`;
    const staff = actor !== 'client';
    const slug = staff ? 'warehaus' : 'northwind';
    const orgId =
      rowsOf(store, 'clients').find((row) => row.slug === slug)?._id ??
      insertRow('clients', {
        notionPageId: `seed-${slug}`,
        lastSyncedAt: 0,
        companyName: staff ? 'Warehaus' : 'Northwind',
        slug,
        status: 'Active',
        portalAccess: 'Enabled',
      });
    insertRow('contacts', {
      orgId,
      notionPageId: `seed-contact-${actor}`,
      lastSyncedAt: 0,
      name: actor === 'peter' ? 'Peter' : staff ? 'Maya Chen' : 'Nia Client',
      email: actor === 'peter' ? PETER_EMAILS[0] : staff ? 'maya@warehaus.test' : 'nia@northwind.test',
      authUserId,
      role: staff ? 'Warehaus Staff' : 'Client Admin',
      portalAccess: 'Enabled',
    });
    actors.set(actor, authUserId);
    return authUserId;
  }

  function ctxFor(kind: 'query' | 'mutation' | 'action', options: CallOptions) {
    const authUserId = options.as ? seedActor(options.as) : null;
    const auth = {
      getUserIdentity: async () => (authUserId ? { subject: authUserId, tokenIdentifier: `test|${authUserId}`, issuer: 'test' } : null),
    };
    const run = (runKind: RunCall['kind']) => async (ref: unknown, args: Record<string, Value> = {}) => {
      const call = { kind: runKind, name: nameOf(ref), args: clone(args) };
      runs.push(call);
      return options.respond ? options.respond(call) : undefined;
    };
    const storageApi = {
      getUrl: async (id: string) => `https://storage.test/${id}`,
      delete: async (id: string) => {
        storage.deleted.push(id);
      },
      generateUploadUrl: async () => 'https://storage.test/upload',
    };
    if (kind === 'query') return { db: readOnly, auth, storage: storageApi };
    if (kind === 'mutation') return { db: writer, auth, scheduler, storage: storageApi, runQuery: run('query'), runMutation: run('mutation') };
    return { auth, scheduler, storage: storageApi, runQuery: run('query'), runMutation: run('mutation'), runAction: run('action') };
  }

  /**
   * Run a registered function's real handler. Arguments are checked against
   * its validator. A throw restores every table, as Convex rolls back a
   * mutation.
   */
  async function call<T = unknown>(fn: unknown, args: Record<string, Value> = {}, options: CallOptions = {}): Promise<T> {
    const registered = fn as RegisteredFunction;
    if (typeof registered?._handler !== 'function') throw new MemoryCtxError('call() needs a registered Convex function');
    const kind = registered.isQuery ? 'query' : registered.isMutation ? 'mutation' : registered.isAction ? 'action' : null;
    if (!kind) throw new MemoryCtxError('call() could not tell the function kind');
    if (registered.exportArgs) {
      const problem = checkValue(JSON.parse(registered.exportArgs()) as ValidatorJson, args, 'args');
      if (problem) throw new MemoryCtxError(`Arguments: ${problem}`);
    }
    const ctx = ctxFor(kind, options);
    const snapshot = clone([...store.tables.entries()]);
    const next = store.next;
    const scheduledBefore = scheduled.length;
    try {
      return (await registered._handler(ctx, clone(args))) as T;
    } catch (error) {
      // Convex drops the writes and the scheduled calls of a mutation that throws.
      store.tables = new Map(snapshot);
      store.next = next;
      scheduled.length = scheduledBefore;
      throw error;
    }
  }

  /**
   * Run an `httpAction` handler with a request. It gets an action ctx, so its
   * `runQuery`, `runMutation` and `runAction` calls are recorded in `runs` and
   * answered by `respond`. A test that needs the mutation to really run calls
   * it with `call` from `respond`.
   */
  async function callHttp(fn: unknown, request: Request, options: CallOptions = {}): Promise<Response> {
    const registered = fn as { isHttp?: boolean; _handler?: (ctx: unknown, request: Request) => Promise<Response> };
    if (!registered?.isHttp || typeof registered._handler !== 'function') throw new MemoryCtxError('callHttp() needs an httpAction');
    return registered._handler(ctxFor('action', options), request);
  }

  return {
    call,
    callHttp,
    /** Insert a row before the test runs. Checked against the schema. */
    seed: (table: string, doc: Record<string, Value>) => insertRow(table, doc),
    /** Seed the contact for an actor and return its auth user id. */
    actor: seedActor,
    /** Every row of a table, in insertion order. Copies. */
    rows: (table: string) => clone(rowsOf(store, table)),
    /** One row by id, or null. A copy. */
    row: (id: string) => {
      const found = findRow(store, id);
      return found ? clone(found) : null;
    },
    /** Add a stored file for `db.system` reads. */
    storeFile: (fields: Record<string, Value> = {}) => {
      const id = `_storage:${store.next}`;
      rowsOf(store, '_storage').push({ ...fields, _id: id, _creationTime: store.next });
      store.next += 1;
      return id;
    },
    scheduled,
    runs,
    storage,
    reads: {
      all: readLog,
      /** Ids passed to `db.get`, in order. */
      gets: getLog,
      /** `.collect()` and async iteration: reads with no limit. */
      unbounded: () => readLog.filter((read) => read.terminal === 'collect' || read.terminal === 'iterate'),
      /** Reads with no index. */
      unindexed: () => readLog.filter((read) => read.index === null),
      reset: () => {
        readLog.length = 0;
        getLog.length = 0;
      },
    },
    /** The raw db for helpers that take a ctx, outside a handler. Writes are checked like any other. */
    db: writer,
  };
}

export type MemoryCtx = ReturnType<typeof memoryCtx>;
