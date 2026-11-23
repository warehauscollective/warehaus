# ADR-0002: Notion write policy

Status: Accepted, Peter, 2026-11-23.

Peter approved these decisions in the architecture review session on 2026-11-23 ("yes to all" across two rounds, then "Yes, write docs"). They come from candidate 1 of that review: one Notion client module.

## Context

Shared dev `graceful-mastiff-960` reads the production Warehaus Notion. Before this decision, four separate checks guarded writes to Notion, each in a different module:

- `NOTION_WRITEBACK_ENABLED`, read in `sync/notionWrite.ts`, `sync/outbox.ts`, `sync/taskWrite.ts`, `sync/outboxWork.ts`, `invites.ts`, `projectCreate.ts` and `clientCreate.ts`
- a production-only check, `authMirrorAllowed`, in `notionAuth.ts`
- the presence of `BLOB_READ_WRITE_TOKEN`, the only check on the pull's `writeSharedResourceUrl` in `sync/notionApi.ts`
- `NOTION_PROJECT_CREATE_ENABLED`, which the Next.js portal layout read and passed into a provider whose value nothing used

Code outside these modules called `fetch` on Notion directly. A new caller could write to Notion without passing any check.

## Decisions

1. **One Notion client.** Every outbound call to Notion goes through one module, `convex/sync/notion/`: reads, writes, creates, archives and searches. It sends one Notion API version, `2025-09-03`. Inbound webhook verification is not a call to Notion and stays outside.
2. **One write policy, inside the Notion client.** It is the only code that reads the Notion write flags and the deployment identity. Each write names its write kind, and callers cannot skip the policy. Code that decides whether to queue a write, such as the outbox enqueue, asks the same policy instead of reading env.
3. **Three write kinds:**
   - **Write-back** is allowed only when `NOTION_WRITEBACK_ENABLED` is exactly `true`. Project create and client create are write-back.
   - **Auth mirror** is allowed on production `unique-turtle-383` only, whatever the flags say. Auth ids belong to one deployment.
   - **Resource URL** needs write-back to be on as well as a Blob token. A pull never writes to Notion unless write-back is on. This is the one change in behaviour.
4. **`NOTION_PROJECT_CREATE_ENABLED` is removed.** It gated nothing, so it only misled readers.
5. **Shared dev keeps today's meaning.** It writes to Notion only when the write-back flag is exactly `true` on that deployment. Stopping shared dev from ever writing to the production workspace belongs to the coming test-Notion spec. That spec then only changes env behind the Notion client.
6. **A refused write is skipped, not failed.** It returns a typed skipped result with a reason (`writeback-off`, `not-production` or `not-configured`) and is logged. It never throws. Each caller picks its follow-up: the outbox leaves the row queued, and the pull counts the skip in its stats.
7. **Errors and retries.** A failed read throws a `NotionError` carrying the HTTP status and any Retry-After delay. A failed write returns a result with the same fields. A missing `NOTION_WAREHAUS_TOKEN` gives `not-configured` either way. The Notion client never retries on its own; the outbox backoff and the pull's retry records keep that job.
8. **Generic operations only.** The interface offers Notion operations: query a data source, get a page, list blocks, list property names, search, create, patch properties, archive. Domain filters, such as the project-create search, stay as pure functions in `packages/portal-sync`, which also owns the interface type.

## Considered options

- **Gate writes only, leave reads on direct `fetch`.** Rejected. An in-memory adapter that can't serve reads can't test the pull end to end.
- **Harden shared dev now so it can never write.** Rejected for now. Shared dev needs some write path to exercise write-back until a test workspace exists.
- **Domain operations on the client, such as `searchProjectCreateHits`.** Rejected. The interface would grow with every feature, and the in-memory adapter would have to copy domain rules.

## Consequences

- There are two adapters behind the Notion client: HTTP, and an in-memory adapter used only in tests. The in-memory adapter supports only the operations and filters callers use today, and throws on anything else, so a test can't pass by accident. It cannot back a local preview, because Convex actions on shared dev run in the cloud.
- A new feature that writes to Notion has to name a write kind. Adding a kind means amending this ADR.
- Build plan: one Portal milestone, "Notion client", on branch `milestone/notion-client`:
  1. the client, the HTTP adapter and the write policy, with every caller moved onto it
  2. the in-memory adapter, and end-to-end pull and outbox tests
  3. `runOutboxAttempt` takes the client in place of its callbacks, and `notionTaskPlatform` is deleted

  It merges after Peter approves from the local preview. Merging does not deploy.
