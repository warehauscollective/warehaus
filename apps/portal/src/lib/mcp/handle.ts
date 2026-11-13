/**
 * Stateless Streamable HTTP MCP. One server per request, JSON responses, no session.
 * The bearer token is the same hashed staff token as /api/v1.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { bearerToken } from '@warehaus/portal-sync';
import { z } from 'zod';
import { isWriteTool, portalTools, runPortalTool, type ToolCall } from './tools';

export type PortalScope = 'read' | 'read-write';

export type PortalMcpDeps = {
  lookup: (token: string) => Promise<{ ok: true; scope: PortalScope } | { ok: false; status: number; error: string }>;
  call: (input: ToolCall & { token: string }) => Promise<{ status: number; body: unknown }>;
};

function jsonError(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

function requestsWrite(body: unknown): boolean {
  const messages = Array.isArray(body) ? body : [body];
  for (const message of messages) {
    if (!message || typeof message !== 'object') continue;
    const method = (message as { method?: unknown }).method;
    if (method !== 'tools/call') continue;
    const name = (message as { params?: { name?: unknown } }).params?.name;
    if (typeof name === 'string' && isWriteTool(name)) return true;
  }
  return false;
}

function toolResult(status: number, body: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(body) }],
    isError: status >= 400,
  };
}

export async function handlePortalMcp(request: Request, deps: PortalMcpDeps): Promise<Response> {
  if (request.method !== 'POST') return jsonError(405, 'Method not allowed');
  const token = bearerToken(request.headers.get('authorization'));
  if (!token) return jsonError(401, 'Unauthorized');

  const raw = await request.text();
  if (raw.length > 100_000) return jsonError(400, 'Request is too large');
  let parsed: unknown = null;
  if (raw.trim()) {
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return jsonError(400, 'Request body must be JSON');
    }
  }

  const session = await deps.lookup(token);
  if (!session.ok) return jsonError(session.status, session.error);
  if (session.scope !== 'read-write' && requestsWrite(parsed)) {
    return jsonError(403, 'This token is read-only');
  }

  const server = new McpServer(
    { name: 'warehaus-portal', version: '1.0.0' },
    {
      instructions:
        'Staff-only Warehaus portal. Reads include unpublished drafts and omit concealed clients. Writes use an idempotency key, the stage last-write-wins stamp, and the Notion outbox. There are no delete tools.',
    },
  );
  const register = server.registerTool.bind(server) as (
    name: string,
    config: { description: string; inputSchema: z.ZodRawShape },
    cb: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: 'text'; text: string }>; isError: boolean }>,
  ) => void;
  for (const tool of portalTools) {
    register(tool.name, { description: tool.description, inputSchema: tool.schema }, async (args) => {
      const result = await runPortalTool({
        name: tool.name,
        args,
        scope: session.scope,
        token,
        call: deps.call,
      });
      return toolResult(result.status, result.body);
    });
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  const next = new Request(request.url, {
    method: 'POST',
    headers: request.headers,
    body: raw,
  });
  try {
    return await transport.handleRequest(next, { parsedBody: parsed ?? undefined });
  } finally {
    await server.close().catch(() => undefined);
  }
}

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL?.replace(/\/$/, '') ||
    process.env.CONVEX_SITE_URL?.replace(/\/$/, '') ||
    ''
  );
}

export function livePortalMcpDeps(): PortalMcpDeps {
  return {
    lookup: async (token) => {
      const site = siteUrl();
      if (!site) return { ok: false, status: 503, error: 'Portal API is unavailable' };
      try {
        const response = await fetch(new URL('/api/v1/session', site), {
          headers: { authorization: `Bearer ${token}` },
        });
        if (response.status === 401) return { ok: false, status: 401, error: 'Unauthorized' };
        if (!response.ok) return { ok: false, status: 503, error: 'Portal API is unavailable' };
        const body = (await response.json()) as { scope?: unknown };
        if (body.scope !== 'read' && body.scope !== 'read-write') {
          return { ok: false, status: 401, error: 'Unauthorized' };
        }
        return { ok: true, scope: body.scope };
      } catch {
        return { ok: false, status: 503, error: 'Portal API is unavailable' };
      }
    },
    call: async (input) => {
      const site = siteUrl();
      if (!site) return { status: 503, body: { error: 'Portal API is unavailable' } };
      const url = new URL(input.path, site);
      for (const [key, value] of Object.entries(input.search ?? {})) url.searchParams.set(key, value);
      try {
        const response = await fetch(url, {
          method: input.method,
          headers: {
            authorization: `Bearer ${input.token}`,
            ...(input.body ? { 'content-type': 'application/json' } : {}),
            ...(input.idempotencyKey ? { 'idempotency-key': input.idempotencyKey } : {}),
          },
          body: input.body ? JSON.stringify(input.body) : undefined,
        });
        const body = (await response.json().catch(() => ({ error: 'Portal API is unavailable' }))) as unknown;
        return { status: response.status, body };
      } catch {
        return { status: 503, body: { error: 'Portal API is unavailable' } };
      }
    },
  };
}
