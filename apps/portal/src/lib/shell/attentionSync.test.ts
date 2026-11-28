import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  attentionAdapterFor,
  attentionMessage,
  macAttentionAdapter,
  postToShell,
  tabTitleAdapter,
  tabTitleWithCount,
} from './attentionSync';
import { MAC_SHELL_WAITING, WEB_SHELL, shellAfterMessage, type ShellState } from './shellState';

const bridgeFixtures = JSON.parse(
  readFileSync(new URL('../../../../../packages/native-bridge/fixtures/messages.json', import.meta.url), 'utf8'),
) as { valid: { name: string; direction: string; message: { type: string; count: number; alerts: unknown[] } }[] };

const ask = {
  id: 'q575ty9z3709wdsy9a4cnthxbh8jx9gt',
  kind: 'ask',
  title: 'Runner on production',
  url: 'warehaus://milestone/nn7dv5y1gzxvk1d28jz0rj1p018jv75e?project=k975vmerwebjswcbmh27gbp6tx8h175e',
  createdAt: 1795591788567,
};
const ready = {
  id: 'q576ft1sp1axzqc4709j66x3758jxe62',
  kind: 'readyToShip',
  title: 'Mac app: Portal window',
  url: 'warehaus://task/m170091jfx7xwvhvmexr9dk08s8jwnjk',
  createdAt: 1795591270135,
};
const feed = { count: 2, alerts: [ask, ready] };

const macWith = (capabilities: string[]): ShellState =>
  shellAfterMessage(MAC_SHELL_WAITING, {
    type: 'shell.hello',
    bridgeVersion: 1,
    platform: 'macos',
    appVersion: '1.0.0',
    capabilities,
  });

describe('attention message for the shell', () => {
  it('carries the feed in the bridge shape', () => {
    assert.deepEqual(attentionMessage(feed), { type: 'attention', count: 2, alerts: [ask, ready] });
    assert.deepEqual(attentionMessage({ count: 0, alerts: [] }), { type: 'attention', count: 0, alerts: [] });
  });

  it('builds every attention example the Swift copy decodes', () => {
    const examples = bridgeFixtures.valid.filter((e) => e.direction === 'pageToShell' && e.message.type === 'attention');
    assert.ok(examples.length >= 2);
    for (const example of examples) {
      assert.deepEqual(attentionMessage({ count: example.message.count, alerts: example.message.alerts }), example.message, example.name);
    }
  });

  it('drops fields the bridge does not name', () => {
    const message = attentionMessage({ count: 1, alerts: [{ ...ask, milestoneId: 'nn7', waitingOn: 'Peter' }] });
    assert.deepEqual(message?.alerts, [ask]);
  });

  it('sends at most the bridge limit of alerts and keeps the count', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ ...ask, id: `ask${i}` }));
    const message = attentionMessage({ count: 25, alerts: many });
    assert.equal(message?.alerts.length, 20);
    assert.equal(message?.alerts[0].id, 'ask0');
    assert.equal(message?.count, 25);
  });

  it('is null for a feed the bridge would refuse', () => {
    assert.equal(attentionMessage({ count: -1, alerts: [] }), null);
    assert.equal(attentionMessage({ count: 1, alerts: [{ ...ask, kind: 'chat' }] }), null);
    assert.equal(attentionMessage({ count: 1, alerts: [{ ...ask, url: 'https://example.com' }] }), null);
  });
});

describe('posting to the Mac app', () => {
  it('posts to the warehaus handler', () => {
    const posted: unknown[] = [];
    const win = { webkit: { messageHandlers: { warehaus: { postMessage: (m: unknown) => posted.push(m) } } } };
    const message = attentionMessage(feed)!;
    assert.equal(postToShell(win, message), true);
    assert.deepEqual(posted, [message]);
  });

  it('does nothing without the handler, and survives one that throws', () => {
    const message = attentionMessage(feed)!;
    assert.equal(postToShell({}, message), false);
    assert.equal(postToShell(null, message), false);
    assert.equal(postToShell({ webkit: { messageHandlers: { other: { postMessage: () => undefined } } } }, message), false);
    const broken = { webkit: { messageHandlers: { warehaus: { postMessage: () => { throw new Error('gone'); } } } } };
    assert.equal(postToShell(broken, message), false);
  });
});

describe('tab title', () => {
  it('leads with the count while something waits', () => {
    assert.equal(tabTitleWithCount('Warehaus Portal', 3), '(3) Warehaus Portal');
    assert.equal(tabTitleWithCount('Warehaus Portal', 0), 'Warehaus Portal');
  });

  it('replaces a count already there', () => {
    assert.equal(tabTitleWithCount('(3) Warehaus Portal', 1), '(1) Warehaus Portal');
    assert.equal(tabTitleWithCount('(3) Warehaus Portal', 0), 'Warehaus Portal');
  });

  it('shows no count for a number that is not a whole count', () => {
    assert.equal(tabTitleWithCount('Warehaus Portal', -2), 'Warehaus Portal');
    assert.equal(tabTitleWithCount('Warehaus Portal', 1.5), 'Warehaus Portal');
    assert.equal(tabTitleWithCount('Warehaus Portal', Number.NaN), 'Warehaus Portal');
  });
});

describe('adapters', () => {
  const env = () => {
    const posted: unknown[] = [];
    return { doc: { title: 'Warehaus Portal' }, posted, post: (m: unknown) => void posted.push(m) };
  };

  it('browser: the count goes in the tab title and nothing is posted', () => {
    const e = env();
    const adapter = attentionAdapterFor(WEB_SHELL, e)!;
    adapter.show(feed);
    assert.equal(e.doc.title, '(2) Warehaus Portal');
    adapter.show({ count: 0, alerts: [] });
    assert.equal(e.doc.title, 'Warehaus Portal');
    adapter.show(feed);
    adapter.clear();
    assert.equal(e.doc.title, 'Warehaus Portal');
    assert.deepEqual(e.posted, []);
  });

  it('browser: keeps a title another part of the page set', () => {
    const doc = { title: '(2) Warehaus Portal' };
    const adapter = tabTitleAdapter(doc);
    doc.title = 'Projects';
    adapter.show({ count: 4, alerts: [] });
    assert.equal(doc.title, '(4) Projects');
  });

  it('Mac app: the feed is posted and the title is left alone', () => {
    const e = env();
    const adapter = attentionAdapterFor(macWith(['badge', 'notify', 'openExternal']), e)!;
    adapter.show(feed);
    adapter.clear();
    assert.deepEqual(e.posted, [{ type: 'attention', count: 2, alerts: [ask, ready] }]);
    assert.equal(e.doc.title, 'Warehaus Portal');
  });

  it('Mac app: a badge without notifications still gets the feed', () => {
    const e = env();
    attentionAdapterFor(macWith(['badge']), e)?.show(feed);
    assert.equal(e.posted.length, 1);
  });

  it('Mac app: nothing before hello, or when it claims neither badge nor notify', () => {
    assert.equal(attentionAdapterFor(MAC_SHELL_WAITING, env()), null);
    assert.equal(attentionAdapterFor(macWith(['openExternal']), env()), null);
  });

  it('Mac adapter does not post a feed the bridge would refuse', () => {
    const posted: unknown[] = [];
    macAttentionAdapter((m) => void posted.push(m)).show({ count: 1, alerts: [{ ...ask, title: ' ' }] });
    assert.deepEqual(posted, []);
  });
});

describe('pages never import the native bridge', () => {
  const portal = fileURLToPath(new URL('../../../', import.meta.url));
  const sources = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sources(path);
      return /\.(ts|tsx|mjs)$/.test(entry.name) ? [path] : [];
    });
  const importers = (dir: string) =>
    sources(`${portal}${dir}`)
      .filter((path) => readFileSync(path, 'utf8').includes('@warehaus/native-bridge'))
      .map((path) => path.slice(portal.length));

  it('no page or component names the bridge', () => {
    assert.deepEqual(importers('app'), []);
    assert.deepEqual(importers('src/components'), []);
    assert.deepEqual(importers('src/hooks'), []);
  });

  it('in lib, only the shell module and the warehaus:// link resolver do', () => {
    const outside = importers('src/lib').filter((path) => !path.startsWith('src/lib/shell/') && path !== 'src/lib/nav/portalLink.ts');
    assert.deepEqual(outside, []);
  });
});
