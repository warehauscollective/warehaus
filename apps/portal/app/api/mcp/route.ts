import { handlePortalMcp, livePortalMcpDeps } from '@/lib/mcp/handle';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/** Stateless Streamable HTTP MCP. POST a JSON-RPC message. No session. */
export function POST(request: Request) {
  return handlePortalMcp(request, livePortalMcpDeps());
}
