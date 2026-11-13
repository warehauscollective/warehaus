# Portal MCP

Staff-only Streamable HTTP MCP for the portal. The endpoint is `POST /api/mcp` on the portal host. It does not keep a session. Responses are JSON.

The bearer token is a staff portal token, the same kind `/api/v1` uses. The raw value is shown once at mint time and is stored only as a hash. A missing or unknown token is 401. A read token that calls a write tool is 403.

## Connect a client

Point the client at the portal origin, not the Convex site URL. Send both `application/json` and `text/event-stream` on `Accept`.

```json
{
  "mcpServers": {
    "warehaus-portal": {
      "url": "https://<portal-host>/api/mcp",
      "headers": {
        "Authorization": "Bearer whp_…"
      }
    }
  }
}
```

The portal process needs `NEXT_PUBLIC_CONVEX_SITE_URL` or `CONVEX_SITE_URL`. Tool calls are forwarded to `/api/v1` with the same bearer token. Reads are staff-visible: unpublished drafts stay, and trash, archive, and quarantine are omitted. Pages are at most 50. A page can be shorter than `limit` while `hasMore` is true, because concealed rows are skipped after the page is read. Follow `nextCursor` until `hasMore` is false. Writes need an `idempotencyKey`. There are no delete tools.

`create_client` uses the staff client-create path and stays disabled and unpublished. `create_project` uses the same project-create path. Pass `clientId`, or `client` to create the client first. The project stays unpublished unless `publishToWarehaus` is `true`. The staff form still publishes, because that path passes publish on. Tasks and milestones stay unpublished.

If a write stops after the outbox row is stored and before the response is saved, the idempotency key stays pending. Retrying that same key within 2 minutes returns 409: `A request with this idempotency key is already in progress`. After 2 minutes the same key and the same request can start again. The outbox still dedupes the project or client, so the retry does not create a second page.

## Mint a token

One live token per name. `grok-bot` and `warehaus-studio-manager` are separate rows, each with its own scope, and each can be revoked on its own. Run this from `apps/portal` against the deployment in `.env.local`. Do not point that deployment at production. The command prints each raw token once on stdout.

```bash
node scripts/mint-bot-token.mjs --name grok-bot --scope read-write --org-id <clients id>
node scripts/mint-bot-token.mjs --name warehaus-studio-manager --scope read-write --org-id <clients id>
node scripts/mint-bot-token.mjs --revoke grok-bot
```

`--org-id` is the staff home org stored on the token so client create can enqueue. It is not a slug. `--all` mints both bots. The default scope for `grok-bot` and for `warehaus-studio-manager` is `read-write`. Pass `--scope` with one `--name` to choose `read` or `read-write` for that bot only. A name that already has a live token is refused. After a revoke, minting the same name replaces that row and prints the new token once.
