import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const convexDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string) => readFileSync(join(convexDir, file), 'utf8');

const STAFF_WRAPPERS = new Set(['adminQuery', 'adminMutation']);

describe('project context is staff only', () => {
  const source = read('projectContext.ts');
  const exported = [...source.matchAll(/export const (\w+) = (\w+)\(/g)].map((m) => ({ name: m[1], wrapper: m[2] }));

  it('exports only functions behind a staff wrapper', () => {
    assert.ok(exported.length >= 6, 'expected the context functions to be found');
    for (const fn of exported) {
      assert.ok(STAFF_WRAPPERS.has(fn.wrapper), `${fn.name} uses ${fn.wrapper}`);
    }
    assert.equal([...source.matchAll(/export const /g)].length, exported.length, 'every export is a wrapped function');
  });

  it('does not import a client or public wrapper', () => {
    assert.doesNotMatch(source, /clientQuery|clientMutation/);
    assert.doesNotMatch(source, /from '\.\/_generated\/server'/);
  });

  it('offers the API only internal functions, which a browser cannot call', () => {
    const api = read('projectContextApi.ts');
    const fns = [...api.matchAll(/export const (\w+) = (\w+)\(/g)].map((m) => ({ name: m[1], wrapper: m[2] }));
    assert.ok(fns.length >= 4);
    for (const fn of fns) assert.ok(fn.wrapper === 'internalQuery' || fn.wrapper === 'internalMutation', `${fn.name} uses ${fn.wrapper}`);
    assert.doesNotMatch(api, /\b(query|mutation|action|httpAction)\(/);
  });

  it('is read and written by the store module and nothing else', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(join(convexDir, dir))) {
        const rel = join(dir, name);
        if (name === '_generated' || name === 'node_modules') continue;
        if (statSync(join(convexDir, rel)).isDirectory()) walk(rel);
        else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name) && read(rel).includes("'projectContextEntries'")) offenders.push(rel);
      }
    };
    walk('.');
    assert.deepEqual(offenders.sort(), ['_lib/projectContextStore.ts']);
  });
});
