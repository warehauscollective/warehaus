import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  decideNotionWebhook,
  notionSignatureHeader,
  notionSignatureMatches,
} from './notionSignature';
import { processedSyncEventPatch } from './syncEventRetention';

const SECRET = 'secret_test_verification_token';
const BODY = JSON.stringify({ id: 'evt_1', type: 'page.updated' });

describe('notion webhook signature', () => {
  it('accepts an HMAC-SHA256 signature over the raw body', async () => {
    const signature = await notionSignatureHeader(BODY, SECRET);
    assert.equal(signature.startsWith('sha256='), true);
    assert.equal(await notionSignatureMatches(BODY, signature, SECRET), true);
    const decision = await decideNotionWebhook({
      rawBody: BODY,
      signatureHeader: signature,
      secret: SECRET,
    });
    assert.equal(decision.ok, true);
    if (decision.ok) assert.equal(decision.kind, 'event');
  });

  it('rejects an unsigned webhook and closes out a processed one', async () => {
    const unsigned = await decideNotionWebhook({
      rawBody: BODY,
      signatureHeader: null,
      secret: SECRET,
    });
    assert.deepEqual(unsigned, { ok: false, status: 401, reason: 'invalid_signature' });

    const blankSecret = await decideNotionWebhook({
      rawBody: BODY,
      signatureHeader: null,
      secret: '   ',
    });
    assert.deepEqual(blankSecret, { ok: false, status: 401, reason: 'missing_secret' });

    const closed = processedSyncEventPatch('done', Date.parse('2026-09-27T00:00:00.000Z'));
    assert.equal(closed.status, 'done');
    assert.equal(closed.processedAt, Date.parse('2026-09-27T00:00:00.000Z'));
    assert.equal(closed.error, undefined);
  });

  it('rejects a tampered body, a missing signature, and a wrong secret', async () => {
    const signature = await notionSignatureHeader(BODY, SECRET);
    assert.equal(await notionSignatureMatches(`${BODY} `, signature, SECRET), false);
    assert.equal(await notionSignatureMatches(BODY, signature, 'other-secret'), false);
    assert.equal(await notionSignatureMatches(BODY, null, SECRET), false);
    assert.equal(await notionSignatureMatches(BODY, signature.slice('sha256='.length), SECRET), false);

    const bad = await decideNotionWebhook({
      rawBody: BODY,
      signatureHeader: 'sha256=deadbeef',
      secret: SECRET,
    });
    assert.deepEqual(bad, { ok: false, status: 401, reason: 'invalid_signature' });
  });

  it('fails closed when the verification token is unset', async () => {
    const signature = await notionSignatureHeader(BODY, SECRET);
    for (const secret of [undefined, null, '', '   ']) {
      const decision = await decideNotionWebhook({
        rawBody: BODY,
        signatureHeader: signature,
        secret,
      });
      assert.deepEqual(decision, { ok: false, status: 401, reason: 'missing_secret' });
    }
  });

  it('keeps the unsigned verification_token handshake', async () => {
    const rawBody = JSON.stringify({ verification_token: 'secret_from_notion' });
    const decision = await decideNotionWebhook({
      rawBody,
      signatureHeader: null,
      secret: undefined,
    });
    assert.equal(decision.ok, true);
    if (decision.ok && decision.kind === 'handshake') {
      assert.equal(decision.handshake, 'verification_token');
    } else {
      assert.fail('expected handshake');
    }
  });

  it('does not treat an event that also carries verification_token as a handshake', async () => {
    const rawBody = JSON.stringify({
      verification_token: 'secret_from_notion',
      type: 'page.updated',
      id: 'evt_2',
    });
    const decision = await decideNotionWebhook({
      rawBody,
      signatureHeader: null,
      secret: undefined,
    });
    assert.deepEqual(decision, { ok: false, status: 401, reason: 'missing_secret' });
  });

  it('still accepts a challenge-only handshake', async () => {
    const decision = await decideNotionWebhook({
      rawBody: JSON.stringify({ challenge: 'abc' }),
      signatureHeader: null,
      secret: '',
    });
    assert.equal(decision.ok, true);
    if (decision.ok && decision.kind === 'handshake') {
      assert.equal(decision.handshake, 'challenge');
    } else {
      assert.fail('expected challenge handshake');
    }
  });
});
