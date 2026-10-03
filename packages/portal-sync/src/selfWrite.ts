/**
 * Self-write detection. Compare values the portal wrote.
 * `last_edited_time` is stored alongside, but it is not the primary check:
 * Notion has historically rounded that timestamp to the minute.
 */

import { readNotionPlain, type WriteProperties, type WriteValue } from './writeback';

function stable(value: WriteValue | undefined): string {
  if (Array.isArray(value)) return JSON.stringify([...value].sort());
  return JSON.stringify(value ?? null);
}

export function isPortalSelfWrite(input: {
  observed: WriteProperties;
  lastWritten: WriteProperties;
  fields?: readonly string[];
}): boolean {
  const fields = input.fields ?? Object.keys(input.lastWritten);
  if (fields.length === 0) return false;
  return fields.every((field) => stable(input.observed[field]) === stable(input.lastWritten[field]));
}

/** Read plain values for the keys the portal last wrote, from a Notion property map. */
export function observedFromNotionPage(
  properties: Record<string, unknown>,
  fields: readonly string[],
): WriteProperties {
  const observed: WriteProperties = {};
  for (const field of fields) {
    const plain = readNotionPlain(properties[field]);
    if (plain !== undefined) observed[field] = plain;
  }
  return observed;
}
