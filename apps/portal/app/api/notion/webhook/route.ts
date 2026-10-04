import { NextRequest, NextResponse } from 'next/server';
import { decideNotionWebhook } from '@convex/_lib/notionSignature';

export const dynamic = 'force-dynamic';

/**
 * Notion webhook → forward to Convex HTTP action (enqueue + schedule pull).
 * Prefer pointing Notion directly at CONVEX_SITE_URL/notion/webhook in prod.
 *
 * Events require HMAC-SHA256 in X-Notion-Signature (fail closed if the
 * verification token is unset). The one-time `{ verification_token }` body
 * is accepted unsigned so the subscription handshake can complete.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const decision = await decideNotionWebhook({
    rawBody,
    signatureHeader: req.headers.get('x-notion-signature'),
    secret: process.env.NOTION_WEBHOOK_SECRET,
  });

  if (!decision.ok) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (decision.kind === 'handshake') {
    if (decision.handshake === 'verification_token') {
      console.info(
        '[notion-webhook] verification_token handshake. Set NOTION_WEBHOOK_SECRET to this token:',
        decision.body.verification_token,
      );
      return NextResponse.json({ received: true });
    }
    return NextResponse.json({ challenge: decision.body.challenge });
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL?.replace(/\/$/, '') ||
    process.env.CONVEX_SITE_URL?.replace(/\/$/, '');

  if (!siteUrl) {
    return NextResponse.json(
      { error: 'convex_site_url_missing', received: true },
      { status: 503 },
    );
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const signature = req.headers.get('x-notion-signature');
  if (signature) headers['x-notion-signature'] = signature;

  const upstream = await fetch(`${siteUrl}/notion/webhook`, {
    method: 'POST',
    headers,
    body: rawBody || '{}',
  });

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
