# Warehaus Portal × Notion Sync Architecture

> Status: **planning** — exploration complete for `warehaus`; Motoko source
> inspection blocked (private repo not in this environment).
>
> Goal: make the portal’s data layer ideal for fast Notion sync and for
> plugging portal tools into the same Notion databases Motoko already uses —
> without breaking either app.

Companion docs:

- [`monorepo-portal-architecture.md`](./monorepo-portal-architecture.md) — app boundaries, auth deferral
- [`design-system-ecosystem.md`](./design-system-ecosystem.md) — UI / RN path

---

## 1. What we’re optimizing for

| Need | Meaning |
| --- | --- |
| Notion as ops SoT | Humans edit clients / projects / tasks / ops records in Notion |
| Portal as product surface | Fast lists, filters, forms, auth, chat — not raw Notion API latency |
| Motoko cohesion | Same Notion databases + property contracts; no divergent schemas |
| Tool plug-in speed | Portal (and agents) can read/write Notion DBs via a thin, typed layer |
| Nothing breaks | Dual writers need identity, conflict rules, and a single sync contract |

**Non-goal for v1:** treating Notion as the portal’s only runtime database
(query every UI request through Notion). That is slow, rate-limited, and
painful for auth-scoped product UX.

---

## 2. Current state — Warehaus portal

| Layer | Status |
| --- | --- |
| `apps/portal` | Next.js shell (tabs, dock, swipe workspace) |
| Auth | None |
| ORM / Postgres / Neon / Supabase | None |
| Notion client / sync jobs | **None** (zero Notion references in repo) |
| Product data | Hardcoded mocks in page components |
| Closest existing Warehaus “portal + DB” pattern | Vercel `project-dashboard-*` (“Place to Stand”) — auth + Supabase-style stack, **not** Notion |

### Portal IA → candidate domain entities

From `@warehaus/logic` + portal mocks:

| Surface | Mock entities today | Likely Notion DB(s) |
| --- | --- | --- |
| Dashboard | Shipments, docks, ETAs, statuses | `Shipments` (or Motoko-named equivalent) |
| Projects | Projects + phase pipeline | `Projects` |
| Chatroom | Threads / messages | App-owned first (Postgres); optional Notion link |
| Activity | Feed events, exceptions | `Activity` / `Exceptions` or derived from shipment updates |
| Account | Team, roles, locations | `People` / `Locations` (+ Clerk/Auth later) |

Shipment mock fields already imply a stable row shape:

`id`, `origin`, `dock`, `status`, `pallets`, `eta`

Project mock fields:

`id`, `name`, `phase`, `owner`, `due`

These should become **shared property maps** once Motoko’s real Notion schema
is visible — not reinvented in Warehaus.

---

## 3. Motoko access status (blocker)

| Item | Value |
| --- | --- |
| Expected repo | `https://github.com/Peteroq/Boop-motoko` (from prior agent context) |
| Visibility from this run | **404 / private** — GitHub token only sees `warehauscollective/warehaus` |
| Closest public Boop Notion pattern | `raroque/boop-agent` → **Composio** for agent toolkits (Gmail/Slack/Notion…), **Convex** as app truth — **not** a bidirectional Notion-DB product sync |

Until Motoko is readable, any “mirror Motoko exactly” claim is provisional.
The architecture below is the **cohesion target**; Phase 0 is Motoko schema
extraction.

### Unblock options (pick one)

1. Add `Peteroq/Boop-motoko` (or a fork under `warehauscollective`) to this
   Cloud Agent environment’s allowed repos / grant the agent GitHub access.
2. Paste or export Motoko’s Notion module paths + DB property maps into this
   repo under `docs/motoko-notion-contract.md`.
3. Run a short follow-up agent with Motoko as the primary workspace, then
   merge findings into this doc.

### Motoko inspection checklist (when accessible)

Capture these artifacts into a shared contract (do not copy Motoko code
blindly into portal):

1. **Notion auth model** — internal integration token vs OAuth; which workspace.
2. **Database inventory** — IDs, titles, relation graph between DBs.
3. **Property maps** — name → Notion type → app field; select option enums.
4. **Identity keys** — how Motoko joins a Notion page to an app row
   (`notion_page_id`, Unique ID, slug, etc.).
5. **Sync directionality** — which entities are Notion→app, app→Notion, or both.
6. **Conflict / last-write rules** — `last_edited_time` vs app `updated_at`.
7. **Jobs / webhooks** — cron poll, Notion webhook, manual sync, Inngest, etc.
8. **Write path** — create/update/archive page helpers; rate-limit / retry.
9. **Tool surface** — CLI, MCP, server actions, agent tools that touch Notion.
10. **Env var names** — so portal can share naming (`NOTION_*`, DB id vars).

---

## 4. Recommended architecture (target)

### 4.1 Mental model

```
┌────────────────────┐         ┌─────────────────────────┐
│  Notion workspace  │◄───────►│  Sync contract (shared) │
│  (ops SoT + UI)    │         │  property maps + IDs    │
└─────────┬──────────┘         └───────────┬─────────────┘
          │ pull / push                    │
          ▼                                ▼
┌────────────────────┐         ┌─────────────────────────┐
│  Postgres mirror   │◄───────►│  apps/portal (product)  │
│  (query cache)     │         │  + Motoko app (ops)     │
└────────────────────┘         └─────────────────────────┘
```

- **Notion** = human SoT for shared operational records.
- **Postgres (Neon recommended on Vercel)** = portal’s fast read model,
  auth-adjacent tables, chat, and sync cursors.
- **Sync contract** = one typed package both apps obey so schemas cannot drift.

### 4.2 Why not Notion-only or Composio-only?

| Approach | Verdict for portal product data |
| --- | --- |
| Notion API on every page load | Reject — latency, rate limits, weak relational queries |
| Composio Notion tools (boop-agent style) | Good for **agents**; weak as product SoT sync |
| Postgres mirror + Notion sync | **Recommended** — fast portal, Notion stays editable |
| Dual independent Notion clients with ad-hoc props | Reject — Motoko and portal will diverge and break |

### 4.3 Monorepo package shape (Warehaus)

Add packages that stay app-agnostic (Motoko can later consume the same
contract via copy, npm workspace publish, or a tiny shared repo):

```
packages/
  notion-contract/     # DB ids (env-backed), property maps, zod schemas, enums
  db/                  # drizzle schema + migrations (Postgres mirror)
  sync/                # pull/push engine, conflict rules, cursors
apps/
  portal/              # product UI; reads Postgres; writes via sync API
```

Optional later: extract `notion-contract` + sync helpers into a private npm
package if Motoko remains a separate git repo.

### 4.4 Identity & conflict contract (non-negotiable)

Every mirrored row MUST carry:

| Column | Role |
| --- | --- |
| `id` | App UUID (primary key) |
| `notion_page_id` | Stable Notion page id (unique) |
| `notion_last_edited_time` | Last known Notion edit stamp |
| `updated_at` | App-side write stamp |
| `sync_status` | `synced` \| `pending_push` \| `conflict` \| `archived` |
| `source` | `notion` \| `portal` \| `motoko` (last successful writer class) |

**Default conflict rule (v1):**

1. Pull wins if Notion `last_edited_time` > stored `notion_last_edited_time`
   and row is not `pending_push`.
2. Push wins for local `pending_push` rows; after successful Notion update,
   refresh Notion stamp.
3. If both sides changed since last sync → mark `conflict`, do not silent-clobber;
   surface in Activity / admin.

This is the main “nothing is broken” guarantee between Motoko and portal.

### 4.5 Sync topology

**Phase A — poll pull (ship first)**

- Cron / Vercel Cron / Inngest every N minutes per database.
- `databases.query` with `sorts: last_edited_time` + cursor watermark.
- Upsert into Postgres by `notion_page_id`.

**Phase B — push on mutation**

- Portal Server Actions / route handlers write Postgres (`pending_push`) then
  enqueue Notion `pages.update` / `pages.create`.
- Motoko uses the same property map when it writes Notion or the mirror.

**Phase C — near-real-time (optional)**

- Notion webhooks (where available) or shorter poll for hot DBs (Shipments).
- Activity feed derived from sync events table.

### 4.6 Tool plug-in layer (fast Notion access)

Expose one internal interface used by portal UI, cron, and future agents:

```ts
// Conceptual API — packages/sync or packages/notion-contract
type NotionDbKey = 'projects' | 'shipments' | 'people' | 'locations' | 'exceptions';

queryMirror(db: NotionDbKey, filter): Promise<Row[]>
getByNotionId(pageId): Promise<Row | null>
upsertFromNotion(page): Promise<Row>
createInNotion(db, input): Promise<Row>   // create page + mirror row
updateInNotion(rowId, patch): Promise<Row>
archiveInNotion(rowId): Promise<void>
```

Rules:

- UI never calls `@notionhq/client` directly from client components.
- All Notion property names live in `notion-contract` — one rename, one place.
- Agent/MCP tools (if added) call the same helpers — not a second schema.

**Composio:** optional later for *agent* convenience; do **not** make Composio
the portal’s product sync path. Keep a first-party Notion integration token
for deterministic DB sync.

---

## 5. Cohesion with Motoko (operating agreement)

| Rule | Detail |
| --- | --- |
| One workspace | Motoko + Warehaus portal share the same Notion workspace/integration |
| One property map | Warehaus `notion-contract` is generated/aligned from Motoko’s maps |
| One identity | `notion_page_id` is the cross-app join key |
| Split write domains (v1) | Prefer Motoko owns some DBs, portal owns others — or both write with conflict rules above |
| Shared env naming | `NOTION_TOKEN`, `NOTION_DB_PROJECTS`, `NOTION_DB_SHIPMENTS`, … |
| No silent schema edits | Adding a Notion property requires a contract PR in both apps |

### Suggested ownership (until Motoko audit says otherwise)

| Domain | Primary writer | Portal role |
| --- | --- | --- |
| Projects / clients / pipeline | Motoko or shared Notion | Read + limited status updates |
| Shipments / exceptions (portal metaphor) | Portal | Full CRUD → Notion |
| People / team | Notion + Auth provider | Read mirror; invites via auth |
| Chat threads | Portal Postgres only | Not mirrored to Notion in v1 |
| Activity | Derived from sync + portal events | Read |

Adjust after Motoko checklist is filled.

---

## 6. Infra recommendations (Vercel-native)

| Piece | Recommendation |
| --- | --- |
| Postgres | Neon (Marketplace) — `DATABASE_URL` on `warehaus-portal` |
| ORM | Drizzle — fits monorepo `packages/db` |
| Auth | Clerk or Auth.js (still deferred per monorepo plan); keep user email mappable to Notion People |
| Notion SDK | Official `@notionhq/client` in server-only code |
| Jobs | Vercel Cron for pull; queue (Inngest/QStash) for push bursts |
| Secrets | Portal project env only — never `apps/web` |
| Local | `.env.local` with Notion integration shared from Motoko’s workspace |

Aligns with existing Vercel project `warehaus-portal` (`apps/portal`).

---

## 7. Phased plan

### Phase 0 — Motoko contract extraction *(blocked → unblock first)*

- [ ] Gain read access to `Peteroq/Boop-motoko` (or export)
- [ ] Fill inspection checklist (§3)
- [ ] Write `docs/motoko-notion-contract.md` (DB ids, props, sync direction)
- [ ] Diff Motoko entities vs portal mocks; decide rename vs adapt UI labels

### Phase 1 — Contract + mirror skeleton *(no Motoko code required to start scaffolding)*

- [ ] Add `packages/notion-contract` with zod models for Projects + Shipments
  (provisional property names; swap after Phase 0)
- [ ] Add `packages/db` (Drizzle) + Neon
- [ ] Mirror tables with identity columns (§4.4)
- [ ] Server-only Notion client wrapper in `packages/sync`

### Phase 2 — Pull sync (Notion → portal)

- [ ] Query + upsert for Projects (maps to `/projects`)
- [ ] Query + upsert for Shipments (maps to dashboard)
- [ ] Cron route; sync run log; basic “last synced” in Account or Activity
- [ ] Replace hardcoded `PROJECTS` / `SHIPMENTS` arrays with mirror reads

### Phase 3 — Push sync (portal → Notion)

- [ ] Create / update shipment flow writes mirror + Notion
- [ ] Project phase updates (if portal is allowed to write)
- [ ] Conflict row surfacing in Activity → Exceptions

### Phase 4 — Tools & Motoko lockstep

- [ ] Internal tool API (§4.6) used by portal mutations
- [ ] Optional MCP/agent tools wrapping the same API
- [ ] Document Motoko ↔ portal “schema change” checklist
- [ ] Shared integration token rotation runbook

### Phase 5 — Harden

- [ ] Rate-limit / backoff / idempotent upserts
- [ ] Webhook or sub-minute poll for hot boards
- [ ] Auth scoping (client sees only their projects)
- [ ] Chat remains app-native; link Notion pages by URL where useful

---

## 8. Decisions to confirm

| # | Decision | Recommendation |
| --- | --- | --- |
| 1 | Notion vs Postgres as runtime SoT | **Notion ops SoT + Postgres mirror** |
| 2 | Share Motoko Notion workspace? | **Yes** — cohesion fails otherwise |
| 3 | Composio for product sync? | **No** — first-party Notion client; Composio optional for agents |
| 4 | ORM | **Drizzle + Neon** |
| 5 | First vertical to wire | **Projects pull**, then **Shipments** bidirectional |
| 6 | Chat in Notion? | **No for v1** — Postgres only |
| 7 | Where shared contract lives | Start in `packages/notion-contract`; extract if Motoko can’t consume monorepo |

---

## 9. Immediate next step

**Unblock Motoko read access**, then run Phase 0 and paste the real DB/property
maps into this plan. Until then, Phase 1 scaffolding can proceed with
*provisional* contract names matching portal mocks — but do not create live
Notion databases that Motoko will later fight.

If Motoko access lands in this environment, the follow-up work is:

1. Extract Motoko Notion maps → `docs/motoko-notion-contract.md`
2. Align `packages/notion-contract` to Motoko (not the reverse, unless Motoko
   is unfinished)
3. Implement Phase 1–2 on `apps/portal` against the shared DBs

---

## 10. Traceability

| Signal | Use |
| --- | --- |
| Portal mocks (`PortalHomeContent`, `ProjectsContent`, …) | Provisional entity shapes |
| `packages/logic` `PORTAL_TABS` | Product surfaces that need data |
| Prior agent: Notion as bidirectional SoT | Confirmed product intent |
| `raroque/boop-agent` Composio Notion | Agent pattern — **not** product sync template |
| Vercel `project-dashboard-*` | Existing Warehaus portal+DB precedent (Supabase/auth), useful for auth/UX patterns only |

---

*Update this file when Motoko access lands or when the sync contract is frozen.*
