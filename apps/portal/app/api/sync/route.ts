import { NextResponse } from 'next/server';

/**
 * Legacy dualStore Notion sync retired (Phase 3).
 * Sync runs in Convex: cron every 15m + `POST /notion/webhook` +
 * `npx convex run sync/pull:pullAll`.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      error: 'gone',
      message:
        'Portal sync moved to Convex. Use the Notion webhook, Convex cron, or sync/pull:pullAll.',
    },
    { status: 410 },
  );
}

export async function POST() {
  return GET();
}
