import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CLIENT_DOC_SCHEMA,
  CLIENT_SCHEMA,
  CONTACT_SCHEMA,
  PROJECT_SCHEMA,
  SHARED_RESOURCE_SCHEMA,
  TASK_SCHEMA,
  type NotionPropertyType,
  type PropertySchema,
} from './notionSchema';
import { PROPERTY_TIERS_BY_DATABASE } from './tiers';
import { asWritebackDatabase, readNotionPlain, toNotionProperties, type WriteValue } from './writeback';

const SCHEMAS = {
  clients: CLIENT_SCHEMA,
  projects: PROJECT_SCHEMA,
  tasks: TASK_SCHEMA,
  contacts: CONTACT_SCHEMA,
  sharedResources: SHARED_RESOURCE_SCHEMA,
  clientDocs: CLIENT_DOC_SCHEMA,
} as const;

const SAMPLE: Record<NotionPropertyType, WriteValue> = {
  title: 'A title',
  rich_text: 'Some text',
  select: 'Option',
  status: 'In Progress',
  multi_select: ['Website', 'Brand'],
  relation: ['page-1', 'page-2'],
  date: '2026-11-24',
  checkbox: true,
  number: 3,
  url: 'https://example.com/x',
  email: 'ada@example.test',
  files: 'https://example.com/file.zip',
};

describe('Notion property schemas', () => {
  for (const [database, schema] of Object.entries(SCHEMAS)) {
    it(`${database}: every typed property round-trips through write and read`, () => {
      for (const [name, spec] of Object.entries(schema as PropertySchema)) {
        if (!spec.type || spec.type === 'files') continue;
        const value = SAMPLE[spec.type];
        const written = toNotionProperties(database as keyof typeof SCHEMAS, { [name]: value });
        assert.ok(name in written, `${database}.${name} was not written`);
        // Notion answers with the same value plus its `type`.
        const answered = { type: spec.type, ...(written[name] as object) };
        assert.deepEqual(readNotionPlain(answered), value, `${database}.${name}`);
      }
    });

    it(`${database}: has exactly one title property`, () => {
      const titles = Object.values(schema as PropertySchema).filter((spec) => spec.type === 'title');
      assert.equal(titles.length, 1);
    });

    it(`${database}: tier map is the schema's tiers`, () => {
      const tiers = PROPERTY_TIERS_BY_DATABASE[database as keyof typeof SCHEMAS];
      assert.deepEqual(
        tiers,
        Object.fromEntries(Object.entries(schema as PropertySchema).map(([name, spec]) => [name, spec.tier])),
      );
    });
  }

  it('clears a clearable select on an empty value and skips other empties', () => {
    assert.deepEqual(toNotionProperties('tasks', { Priority: '' }), { Priority: { select: null } });
    assert.deepEqual(toNotionProperties('tasks', { Date: null }), { Date: { date: null } });
    assert.deepEqual(toNotionProperties('tasks', { Stage: null }), {});
  });

  it('reads a stored database name or refuses it', () => {
    assert.equal(asWritebackDatabase('tasks'), 'tasks');
    assert.equal(asWritebackDatabase('nope'), null);
  });
});
