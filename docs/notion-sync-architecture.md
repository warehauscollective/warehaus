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
```

- **No** `/api/data` memory store, dualStore, or Postgres portal cache.
- **No** Shipments entity (D-I). Activity client feeds are project-only.
- Billing is Stripe → Convex (parked Phase 4), never Notion.
- Bootstrap helper (greenfield DBs only): `scripts/notion-bootstrap-warehaus.mjs`
  (Clients, Projects, Tasks, Activity, Shared Resources — **not** Shipments).

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
NOTION_WEBHOOK_SECRET=          # optional
BLOB_READ_WRITE_TOKEN=          # Shared Resource / doc image copy
STRIPE_WEBHOOK_SECRET=          # Phase 4 (parked until keys)
NEXT_PUBLIC_CONVEX_URL=
NEXT_PUBLIC_CONVEX_SITE_URL=
```

Live collection IDs live in `packages/portal-sync/src/collections.ts`.

## Out of scope (still)

- Chatroom via Notion
- Shipments sync or portal UI
- Dumping Convex agent memory into Notion
- Auto-mirroring entire Brain into Warehaus
