import { timingSafeEqualUtf8 } from './constantTime';

export type NotionHandshakeKind = 'verification_token' | 'challenge';

export type NotionWebhookDecision =
  | {
      ok: true;
      kind: 'handshake';
      handshake: NotionHandshakeKind;
      body: Record<string, unknown>;
    }
  | { ok: true; kind: 'event'; body: Record<string, unknown> }
  | { ok: false; status: 401; reason: 'missing_secret' | 'invalid_signature' };

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Header value Notion sends: `sha256=` + HMAC-SHA256 hex of the raw body. */
export async function notionSignatureHeader(rawBody: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  return `sha256=${toHex(mac)}`;
}

export async function notionSignatureMatches(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string,
): Promise<boolean> {
  if (!signatureHeader || !secret) return false;
  const expected = await notionSignatureHeader(rawBody, secret);
  return timingSafeEqualUtf8(expected, signatureHeader.trim());
}

/**
 * One-time Notion handshake bodies are a single field and are not signed
 * (the token is what you later configure as the HMAC key).
 * Any extra field is treated as an event and must be signed.
 */
export function notionHandshakeKind(body: unknown): NotionHandshakeKind | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 1) return null;
  if (keys[0] === 'verification_token' && typeof record.verification_token === 'string' && record.verification_token.length > 0) {
    return 'verification_token';
  }
  if (keys[0] === 'challenge' && typeof record.challenge === 'string' && record.challenge.length > 0) {
    return 'challenge';
  }
  return null;
}

/**
 * Fail closed when the verification token is unset.
 * The unsigned handshake is the exception so a new subscription can deliver its token.
 */
export async function decideNotionWebhook(input: {
  rawBody: string;
  signatureHeader: string | null | undefined;
  secret: string | null | undefined;
}): Promise<NotionWebhookDecision> {
  let parsed: unknown = null;
  if (input.rawBody) {
    try {
      parsed = JSON.parse(input.rawBody) as unknown;
    } catch {
      parsed = null;
    }
  }

  const handshake = notionHandshakeKind(parsed);
  if (handshake && parsed && typeof parsed === 'object') {
    return {
      ok: true,
      kind: 'handshake',
      handshake,
      body: parsed as Record<string, unknown>,
    };
  }

  const secret = input.secret?.trim() ?? '';
  if (!secret) return { ok: false, status: 401, reason: 'missing_secret' };

  const matches = await notionSignatureMatches(input.rawBody, input.signatureHeader, secret);
  if (!matches) return { ok: false, status: 401, reason: 'invalid_signature' };

  const body =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  return { ok: true, kind: 'event', body };
}
