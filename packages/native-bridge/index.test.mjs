import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { decodePageMessage, decodeShellMessage } from './index.mjs';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/messages.json', import.meta.url), 'utf8'));
const decoderFor = (direction) => (direction === 'shellToPage' ? decodeShellMessage : decodePageMessage);

describe('native bridge contract (shared with the Swift copy)', () => {
  for (const example of fixtures.valid) {
    it(`accepts: ${example.name}`, () => {
      const result = decoderFor(example.direction)(example.message);
      assert.equal(result.ok, true, result.reason);
      assert.deepEqual(result.message, example.message);
    });
  }

  for (const example of fixtures.invalid) {
    it(`refuses: ${example.name}`, () => {
      const result = decoderFor(example.direction)(example.message);
      assert.equal(result.ok, false);
      assert.equal(typeof result.reason, 'string');
    });
  }
});

describe('native bridge decoding', () => {
  it('drops fields the contract does not name', () => {
    const result = decodePageMessage({ type: 'openExternal', url: 'https://example.com', extra: true });
    assert.deepEqual(result, { ok: true, message: { type: 'openExternal', url: 'https://example.com' } });
  });

  it('removes repeated capabilities', () => {
    const result = decodeShellMessage({
      type: 'shell.hello',
      bridgeVersion: 1,
      platform: 'macos',
      appVersion: '1.0.0',
      capabilities: ['badge', 'badge'],
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.message.capabilities, ['badge']);
  });

  it('refuses more than 20 alerts', () => {
    const alert = { id: 'a', kind: 'ask', title: 'Approve', url: 'warehaus://milestone/a', createdAt: 1 };
    const result = decodePageMessage({ type: 'attention', count: 21, alerts: Array(21).fill(alert) });
    assert.equal(result.ok, false);
  });
});
