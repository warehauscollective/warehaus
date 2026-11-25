import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shellBootScript } from './shellBoot';
import { MAC_SHELL_WAITING, WEB_SHELL, hasMacHandler, shellAfterMessage, shellKindFromAttribute } from './shellState';

const hello = {
  type: 'shell.hello',
  bridgeVersion: 1,
  platform: 'macos',
  appVersion: '1.2.0',
  capabilities: ['badge', 'openExternal'],
};

describe('shell detection', () => {
  it('reads mac only from data-shell="mac"', () => {
    assert.equal(shellKindFromAttribute('mac'), 'mac');
    assert.equal(shellKindFromAttribute(undefined), 'web');
    assert.equal(shellKindFromAttribute('ios'), 'web');
  });

  it('finds the warehaus message handler and nothing else', () => {
    assert.equal(hasMacHandler({ webkit: { messageHandlers: { warehaus: {} } } }), true);
    assert.equal(hasMacHandler({ webkit: { messageHandlers: { other: {} } } }), false);
    assert.equal(hasMacHandler({}), false);
    assert.equal(hasMacHandler(null), false);
  });
});

describe('shell state after a message', () => {
  it('takes capabilities and version from a valid hello', () => {
    const next = shellAfterMessage(MAC_SHELL_WAITING, hello);
    assert.deepEqual(next, {
      kind: 'mac',
      isMacApp: true,
      appVersion: '1.2.0',
      can: { badge: true, notify: false, openExternal: true },
    });
  });

  it('promises nothing before hello', () => {
    assert.deepEqual(MAC_SHELL_WAITING.can, { badge: false, notify: false, openExternal: false });
    assert.equal(shellAfterMessage(MAC_SHELL_WAITING, undefined), MAC_SHELL_WAITING);
  });

  it('ignores a hello on the web', () => {
    assert.equal(shellAfterMessage(WEB_SHELL, hello), WEB_SHELL);
  });

  it('ignores invalid and non-hello messages', () => {
    assert.equal(shellAfterMessage(MAC_SHELL_WAITING, { ...hello, bridgeVersion: 2 }), MAC_SHELL_WAITING);
    assert.equal(shellAfterMessage(MAC_SHELL_WAITING, { type: 'navigate', url: 'warehaus://milestone/a' }), MAC_SHELL_WAITING);
  });
});

describe('shell boot script', () => {
  it('names the transport constants', () => {
    assert.match(shellBootScript, /"warehaus"/);
    assert.match(shellBootScript, /"warehaus:shell"/);
  });

  it('sets data-shell and keeps the hello inside the Mac app', () => {
    const listeners: Record<string, (e: unknown) => void> = {};
    const win: Record<string, unknown> = {
      webkit: { messageHandlers: { warehaus: {} } },
      addEventListener: (name: string, fn: (e: unknown) => void) => { listeners[name] = fn; },
    };
    const doc = { documentElement: { dataset: {} as Record<string, string> } };
    new Function('window', 'document', shellBootScript)(win, doc);
    assert.equal(doc.documentElement.dataset.shell, 'mac');
    listeners['warehaus:shell']({ detail: hello });
    assert.deepEqual(win.__warehausShellHello, hello);
  });

  it('does nothing in a browser', () => {
    const doc = { documentElement: { dataset: {} as Record<string, string> } };
    new Function('window', 'document', shellBootScript)({}, doc);
    assert.equal(doc.documentElement.dataset.shell, undefined);
  });
});
