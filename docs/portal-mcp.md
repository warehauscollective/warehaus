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

Cursor posts its agent URL with `add_task_link` and kind `agent`. That kind stays on the task. It does not enqueue a Notion field update.

`move_task_stage` and `update_task` can set stage Shipped. The portal reads the public GitHub pull request once on that write, with no token, and accepts it only for `warehauscollective/warehaus` when that pull request is merged into main. A rate limit or a failed read is rejected. The stage write still uses the task-stage outbox.

`create_milestone` takes `projectId`, `name`, and `objective`. The objective is at most 2000 characters: it is the short brief on the card, and a note can be longer. `goals` and `status` are optional. A new milestone cannot start at Shipped or Building. `update_milestone` sends only the fields that change: `name`, `objective`, `goals`, `status`, or `stage`. `status` and `stage` are the one field: Idea, Planning, Awaiting Go, Ready to Ship, Shipped, or Parked. Building is set in the Portal, by the play button or a request for changes, and the API rejects it. Shipped is allowed when every task the milestone shows that is not Parked is Done, including a subtask that has no milestone of its own. Archived tasks do not count. `detach_task_from_milestone` removes one task from a milestone and leaves the task on the project. These three use the same bearer token, idempotency key, and activity log as the other write tools.

## Claude Code and Claude Desktop

Claude Code and Claude Desktop use the same staff endpoint as every other MCP client: `POST https://warehaus-portal.vercel.app/api/mcp`. Send `Accept: application/json, text/event-stream` and a bearer token. The handler does not special-case the token name. The token for these two clients is named `claude`, scope `read-write`. A missing or unknown token is 401. A read token that calls a write tool is 403. The raw token is shown once at mint time and is not stored in this repo.

```json
{
  "mcpServers": {
    "warehaus-portal": {
      "url": "https://warehaus-portal.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer whp_…"
      }
    }
  }
}
```

Claude Desktop uses that block. Claude Code uses the same URL and the same `Authorization` header.

`create_client` uses the staff client-create path and stays disabled and unpublished. `create_project` uses the same project-create path. Pass `clientId`, or `client` to create the client first. The project stays unpublished unless `publishToWarehaus` is `true`. The staff form still publishes, because that path passes publish on. Tasks and milestones stay unpublished.

## Milestone status

A milestone has one field, `status`: `Idea`, `Planning`, `Awaiting Go`, `Building`, `Ready to Ship`, `Shipped`, or `Parked`. Approval is the separate review result in `approval`.

`GET /api/v1/milestones` and `list_milestones` return `status`. `POST /api/v1/milestones` and `POST /api/v1/milestones/update` accept `status`. `stage` and `workStatus` are aliases of that field for one release. A new milestone is `Planning` unless `status` says otherwise. Building cannot be set through the API. Staff can set Shipped when every task that is not Parked is Done. A new milestone cannot start at Shipped or Building. Sending the stored status again writes nothing. A merge ships the milestone through that same task check.

## Milestones and their tasks

`update_milestone` (`POST /api/v1/milestones/update`) sends only the fields that change, including Shipped when every task that is not Parked is Done. `create_milestone` cannot start a milestone at Shipped.

A task only exists inside a milestone. `create_task` and `POST /api/v1/tasks` need `milestoneId`. A missing milestone, a milestone on another project, and a `Shipped` milestone are each a 400.

To start new work, create the milestone and its task list in one call:

- `create_milestone` (`POST /api/v1/milestones`) takes `projectId`, `name`, `objective`, `goals`, and `proposedTasks`.
- `proposedTasks` is 3 to 10 concrete tasks, in the order they should be done. Each is `{ title, detail? }`. A plain title string works too. Leave it out to create a milestone with no tasks.
- The milestone starts at `Planning`. A `status` in the call is kept, except `Building` and `Shipped`.
- `createdVia` is taken from the token name, not from the request. A token named `grok-bot` or containing `grok` is grok, a name containing `claude` is claude, and anything else is other. The Portal shows it on the milestone as "via Grok Bot" or "via Claude".
- These tasks are stored in the Portal only. They are not sent to Notion.
- The result is `{ id, status, createdVia, taskIds }`.

`get_milestone_status` (`GET /api/v1/milestones/item?id=`) returns one milestone: `status`, `approval`, `iteration`, the ordered `tasks` with `origin` (`brief`, `review`, `manual`) and `round`, `previews.local` and `previews.vercel`, `pullRequest`, and the latest `reviews`, `notes` and `events`.

`add_note` (`POST /api/v1/milestones/note`) adds a staff note. Notes are staff only. A note changes no status, approval or task.

`list_needs_peter` (`GET /api/v1/milestones/needs-peter`) lists what is waiting on Peter, newest first, at most 20. There are two kinds. `approval`: a milestone reached Ready to Ship. The note has the pull request, the local preview command and link, and the approval line. `blocked`: a runner stopped on a task. The note has the task and the reason. An approval note leaves the list when Peter approves or requests changes. A blocked note leaves when that task is done. The Portal does not message Grok Bot. Grok Bot reads this list.

## Review

`approve_milestone` and `request_changes` record Peter's decision on one iteration. Only the `grok-bot` token is accepted. Send the `iteration` from `get_milestone_status`. A stale iteration is rejected.

- `approve_milestone` needs `status` `Ready to Ship` and a preview, local or Vercel. It keeps that status. It records the decision only. It does not merge and does not deploy.
- `request_changes` needs `notes`. Put each change on its own line in `newTasks`. Every line becomes a review task in the milestone. Without `newTasks` the notes are split into tasks. It starts the next iteration and moves `status` back to `Building`.

`record_milestone_review` is the older name for both and still works for one release. All three post to `POST /api/v1/milestones/{id}/review`.

For one release the old names still work, so current bot tokens do not break:
- `stage` is returned with the same value as `status`, and is accepted in its place.
- `workStatus` is returned as `draft`, `active`, or `ready`, and is accepted as `Planning`, `Building`, or `Ready to Ship`.
- If more than one of the three is sent, they must agree, or the call is a 400.

Read and send `status`. The two aliases are removed in a later release.

If a write stops after the outbox row is stored and before the response is saved, the idempotency key stays pending. Retrying that key returns 409, `A request with this idempotency key is already in progress`, while the key is inside its 15 minute lease. That lease is longer than the Convex action limit, so a request that is still running is not replaced.

After the lease, the retry reads the matching outbox row and does not start a second Notion create while that row is in flight:
- `done` replays the stored result and does not call `processOne`.
- `inflight` or `queued` returns the same 409. It does not take the outbox lease and does not call `processOne`.
- `failed` or `dead` is the only case that calls `processOne` again.

The outbox lease is 15 minutes as well. A live attempt cannot be preempted. This is not a promise that Notion itself dedupes a create that is still in flight and not yet searchable. The retry avoids that race by leaving an inflight row alone.

## Mint a token

One live token per name. `grok-bot` and `warehaus-studio-manager` are separate rows, each with its own scope, and each can be revoked on its own.

The script follows `.env.local` and must not be pointed at production. Run it from `apps/portal`. It does not pass `--prod`. The command prints each raw token once on stdout.

```bash
node scripts/mint-bot-token.mjs --name grok-bot --scope read-write --org-id <clients id>
node scripts/mint-bot-token.mjs --name warehaus-studio-manager --scope read-write --org-id <clients id>
node scripts/mint-bot-token.mjs --revoke grok-bot
```

`--org-id` is the staff home org stored on the token so client create can enqueue. It is not a slug. `--all` mints both bots. The default scope for `grok-bot` and for `warehaus-studio-manager` is `read-write`. Pass `--scope` with one `--name` to choose `read` or `read-write` for that bot only. A name that already has a live token is refused. After a revoke, minting the same name replaces that row and prints the new token once.

### Production

Peter runs this himself from `apps/portal`. These commands are not the script above. `npx convex run` does not deploy.

Unset `CONVEX_DEPLOY_KEY` so a dev deploy key does not override `--prod`. `npx convex login` is enough. `--prod` selects production `unique-turtle-383` for the project linked by `.env.local`.

The staff home org id is the `clients` row whose `slug` is `warehaus`. That id is not checked in. Look it up, then use the `id` on the item in `body.items`:

```bash
npx convex run --prod portalCatalog:listClients '{"cursor":null,"limit":50}'
```

The output includes each client's `primaryEmail` and `phone`. Do not paste it back. If `body.hasMore` is true, repeat with that page's `body.nextCursor`.

Mint one bot. The example is `grok-bot`, scope `read-write`. The raw token prints once in the JSON `token` field.

```bash
npx convex run --prod portalTokens:mintBot '{"name":"grok-bot","scope":"read-write","homeOrgId":"<clients id>"}'
```

`warehaus-studio-manager` is the same shape, scope `read-write`, and a separate row:

```bash
npx convex run --prod portalTokens:mintBot '{"name":"warehaus-studio-manager","scope":"read-write","homeOrgId":"<clients id>"}'
```

`claude` is the same shape, scope `read-write`, and a separate row. Claude Code and Claude Desktop use this token on `POST https://warehaus-portal.vercel.app/api/mcp`.

```bash
npx convex run --prod portalTokens:mintBot '{"name":"claude","scope":"read-write","homeOrgId":"<clients id>"}'
```

Revoke by name:

```bash
npx convex run --prod portalTokens:revokeBot '{"name":"grok-bot"}'
npx convex run --prod portalTokens:revokeBot '{"name":"warehaus-studio-manager"}'
npx convex run --prod portalTokens:revokeBot '{"name":"claude"}'
```

## Project context tools

Each project has a context: a brief, a glossary, and recorded decisions. It is staff only and lives in Convex. It is not part of the Notion sync.

| Tool | Scope | Route |
|---|---|---|
| `get_project_context` | read | `GET /api/v1/context?projectId=` |
| `get_grilling_instructions` | read | `GET /api/v1/context/grilling` |
| `save_project_brief` | read-write | `POST /api/v1/context/brief` |
| `upsert_glossary_term` | read-write | `POST /api/v1/context/terms` |
| `record_decision` | read-write | `POST /api/v1/context/decisions` |

`get_grilling_instructions` returns the rules for a grilling session, from `apps/portal/convex/_lib/grillingInstructions.ts`. Every bot reads the same text. The portal serves it and never calls a model. The rules are adapted from the `grilling` and `domain-modeling` skills in `mattpocock/skills` (MIT).

The brief has four fields: `goal`, `audience`, `outOfScope`, `doneWhen`. A field left out of `save_project_brief` is not changed. An empty string clears it. `summary.incomplete` is true while no field is set.

Glossary terms match without regard to case. Writing a term again updates its definition. Decisions are numbered per project from 0001 and a number is never reused. Recording the same title again returns the first record.

Writes need an `idempotencyKey`. A write records which bot made it from the token name (`grok`, `claude`, or `other`), not a person: one `grok-bot` token serves every Grok chat. There is no tool that deletes context. A concealed client reads as `Project not found`.
