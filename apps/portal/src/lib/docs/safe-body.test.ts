import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseSafeDocBody } from './safe-body';

describe('parseSafeDocBody', () => {
  it('keeps allowlisted blocks and drops notion hosts', () => {
    const blocks = parseSafeDocBody(
      JSON.stringify([
        { type: 'heading_2', text: 'Welcome' },
        { type: 'paragraph', text: 'Hello @https://www.notion.so/secret' },
        { type: 'child_page', text: 'leak' },
        { type: 'image', src: 'https://amazonaws.com/notion/x.png', alt: 'nope' },
        { type: 'image', src: 'https://blob.vercel-storage.com/ok.png', alt: 'ok' },
      ]),
    );
    assert.equal(blocks.length, 3);
    assert.equal(blocks[0]?.type, 'heading_2');
    assert.equal(blocks[1]?.type, 'paragraph');
    assert.ok(!('text' in blocks[1]! && String(blocks[1].text).includes('notion.so')));
    assert.equal(blocks[2]?.type, 'image');
  });
});
