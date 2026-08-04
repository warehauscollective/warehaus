import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Notion webhook → forward to Convex HTTP action (enqueue + schedule pull).
 * Prefer pointing Notion directly at CONVEX_SITE_URL/notion/webhook in prod.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.NOTION_WEBHOOK_SECRET?.trim();
  if (secret) {
    const header =
      req.headers.get('x-notion-signature') ||
      req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (header !== secret) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL?.replace(/\/$/, '') ||
    process.env.CONVEX_SITE_URL?.replace(/\/$/, '');

  const bodyText = await req.text();

  if (!siteUrl) {
    return NextResponse.json(
      { error: 'convex_site_url_missing', received: true },
      { status: 503 },
    );
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (secret) {
    headers['x-notion-signature'] = secret;
  }

  const upstream = await fetch(`${siteUrl}/notion/webhook`, {
    method: 'POST',
    headers,
    body: bodyText || '{}',
  });

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
