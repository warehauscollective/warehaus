# Notion dual-space sync architecture

> **Obsolete for portal runtime (Phase 5).**  
> Warehaus Portal SoT is **Convex**. Notion is authoring/input only, synced via
> `@warehaus/portal-sync` allowlists into `apps/portal/convex/`.  
> See [`docs/planning/portal-convex/MIGRATION-PLAN.md`](planning/portal-convex/MIGRATION-PLAN.md)
> and [`docs/portal-multi-tenant.md`](portal-multi-tenant.md).
>
> This file remains as historical context for Motoko Second Brain + early Warehaus
> dual-space thinking. Do not implement portal Postgres / `@warehaus/notion-sync`
> / Shipments from this doc — those paths are deleted.

## Current portal path (canonical)

```text
Notion Warehaus space (allowlisted DBs)
        ↓ webhook + cron pull
@warehaus/portal-sync (tiers, gates, mappers)
        ↓
apps/portal/convex (SoT)  ←→  Better Auth, Blob, client uploads
        ↓
Portal UI (reactive queries)

Portal staff write
        ↓ enqueue (flag off = no row, no Notion call)
notionOutbox → worker (retries, backoff, idempotency, last_edited_time check)
        ↓ only when NOTION_WRITEBACK_ENABLED is exactly true
Notion Warehaus (allowlisted properties)
        ↓ auditEvents + notionWriteState
```

- **No** `/api/data` memory store, dualStore, or Postgres portal cache.
- **No** Shipments entity (D-I). Activity client feeds are project-only.
- Billing is Stripe → Convex (parked Phase 4), never Notion.
- Bootstrap helper (greenfield DBs only): `scripts/notion-bootstrap-warehaus.mjs`
  (Clients, Projects, Tasks, Activity, Shared Resources — **not** Shipments).

## Write-back (flag off)

Portal → Notion goes through one outbox. `sync/projectCreateWrite.ts` no longer calls Notion. Project create enqueues `project-create`. B1 calls `internal.sync.taskWrite.enqueueStatus` for a task Status change. There is no UI on that mutation.

Tables: `notionOutbox`, `notionWriteState`, `auditEvents`, `notices`.

`NOTION_WRITEBACK_ENABLED` must be the exact string `true`. Unset or any other value is off. Enqueue returns `Write-back is off. Nothing was sent to Notion.` and does not insert a row. The worker returns without calling Notion. The flag stays unset on every deployment until someone turns it on in dev.

Writable property names are the keys of the tier maps in `packages/portal-sync/src/tiers.ts`. A name that is not in the map is rejected. That includes Stage, Parent item, and Resources. Activity has no write path.

Updates re-read `last_edited_time` and do not PATCH when it differs from the time passed to enqueue. The same idempotency key does not write twice. Failures back off 30s, 2m, 10m, 30m, then stay at 2h. A longer 429 Retry-After is honored. A row dies after 24h. Each confirmed write inserts an `auditEvents` row.

Project create still requires `NOTION_PROJECT_CREATE_ENABLED` to be exactly `true` as well. Leave that unset. Write-back off blocks it even if the project-create flag is on.

Staff only. The B1 caller wraps `enqueueStatus` in `adminMutation`. Client roles cannot write in this batch.

Production Convex is `unique-turtle-383`. Never target it. One shared dev deployment. Cloud agents do not push Convex functions unless the PR changes `convex/` and Peter has supplied a dev deploy key named `CONVEX_DEPLOY_KEY`. A PR that changes `convex/` does not update the dev deployment by itself. Peter pulls the branch on his Mac and runs `npx convex dev` from `apps/portal`. Do not pass `--prod`. Do not run `npx convex deploy`.

## Historical: spaces + Motoko Brain

| Space | Audience | Primary app | Integration |
| --- | --- | --- | --- |
| Second Brain | Personal | Motoko | `NOTION_TOKEN` / Arc Resources |
| Warehaus | Team + clients | Portal | `NOTION_WAREHAUS_TOKEN` on Convex |

```text
Motoko (Convex = agent ops)  ←→  Notion Second Brain
                                         ↕ bridge (publish / promote) — Motoko-side
Warehaus Portal (Convex SoT) ←→  Notion Warehaus (allowlisted sync-in)
```

### Arc → Resources (Motoko)

Extension: `Boop-motoko/src/extensions/arc-resources-sync` — filesystem watcher on
Arc pinned tabs into Brain Resources. Property names including the `Descriptioin`
typo are Brain-side contracts; portal Shared Resources uses live Warehaus schema
via `portal-sync`.

### Composio Notion

Freeform agent OAuth against Brain. Not the portal SoT path.

## Bridge (opt-in)

Brain ↔ Warehaus bridge remains Motoko/ops territory. Portal never auto-mirrors
Brain content. Sugar Shark / allowlist CI in `@warehaus/portal-sync` enforces
that Brain-sourced content does not reach client queries.

## Env (portal today)

Set on **Convex** (not Next dualStore):

```bash
NOTION_WAREHAUS_TOKEN=
NOTION_WEBHOOK_SECRET=          # required; Notion verification_token (HMAC). Fail closed if unset.
NOTION_WRITEBACK_ENABLED=       # exact "true" or off. Leave unset. Dev only, never prod.
NOTION_PROJECT_CREATE_ENABLED=  # exact "true" or off. Leave unset. Also needs write-back.
BLOB_READ_WRITE_TOKEN=          # Shared Resource / doc image copy
STRIPE_WEBHOOK_SECRET=          # Phase 4 (parked until keys)
NEXT_PUBLIC_CONVEX_URL=
NEXT_PUBLIC_CONVEX_SITE_URL=
```

Names only. Do not put values in this file. Do not set either write flag on production `unique-turtle-383`.

Live collection IDs live in `packages/portal-sync/src/collections.ts`.

## Out of scope (still)

- Chatroom via Notion
- Shipments sync or portal UI
- Dumping Convex agent memory into Notion
- Auto-mirroring entire Brain into Warehaus
