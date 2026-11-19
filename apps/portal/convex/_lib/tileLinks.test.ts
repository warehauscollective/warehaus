import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { localPreviewHint, tileLinkChangeDecision } from './tileLinks';

describe('tile links', () => {
  it('stores a localhost preview and skips the same value', () => {
    const first = tileLinkChangeDecision({
      field: 'localPreview',
      from: null,
      to: 'http://localhost:3200/home',
    });
    assert.deepEqual(first, { ok: true, wrote: true, url: 'http://localhost:3200/home' });
    assert.deepEqual(
      tileLinkChangeDecision({ field: 'localPreview', from: 'http://localhost:3200/home', to: 'http://localhost:3200/home' }),
      { ok: true, wrote: false },
    );
    assert.deepEqual(
      tileLinkChangeDecision({ field: 'localPreview', from: 'http://127.0.0.1:3200/', to: '   ' }),
      { ok: true, wrote: true, url: null },
    );
    assert.deepEqual(tileLinkChangeDecision({ field: 'localPreview', from: null, to: '' }), { ok: true, wrote: false });
  });

  it('rejects review hosts, https localhost, and production', () => {
    for (const url of [
      'https://localhost:3200',
      'http://preview.vercel.app',
      'https://warehaus-git-main.vercel.app',
      'https://unique-turtle-383.convex.cloud',
      'http://example.com',
      'not a url',
    ]) {
      const decision = tileLinkChangeDecision({ field: 'localPreview', from: null, to: url });
      assert.equal(decision.ok, false, url);
    }
  });

  it('stores a figma.com link and rejects anything else', () => {
    const stored = tileLinkChangeDecision({
      field: 'figma',
      from: null,
      to: 'https://www.figma.com/design/TS3DcaCgrIdYf0jhvnMy3k/Portal',
    });
    assert.equal(stored.ok, true);
    if (stored.ok && stored.wrote) assert.match(stored.url ?? '', /^https:\/\/www\.figma\.com\/design\//);
    assert.equal(tileLinkChangeDecision({ field: 'figma', from: null, to: 'https://figma.com/file/abc' }).ok, true);
    for (const url of ['https://www.figma.com', 'http://www.figma.com/design/abc', 'https://evil.com/figma']) {
      assert.equal(tileLinkChangeDecision({ field: 'figma', from: null, to: url }).ok, false, url);
    }
  });

  it('prints the host or says the preview is not running', () => {
    assert.equal(localPreviewHint('http://localhost:3200/path'), 'localhost:3200');
    assert.equal(localPreviewHint(null), 'preview not running');
    assert.equal(localPreviewHint(''), 'preview not running');
  });
});
