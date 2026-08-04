# Portal → Convex + Notion migration plan

**Status:** Decisions locked — **Phases 1–5 landed** (auth, sync, UI, billing parked, debt purge)  
**Date:** 3 August 2026 (Phase 5 debt purge same day)  
**Branch context:** `feat/portal-multi-tenant-subdomains` (current UI/tenancy work)  
**Source of truth for data rules:**

- [`warehaus-portal-agent-brief.md`](./warehaus-portal-agent-brief.md)
- [`warehaus-portal-field-allowlist.md`](./warehaus-portal-field-allowlist.md)
- [`warehaus-portal-notion-remediation-plan.md`](./warehaus-portal-notion-remediation-plan.md)

**Locked product decisions (Peter, 3 Aug 2026):** separate portal Convex · TaskResponse only · upload review gate · Host + session must match · hide Owner/DRI v1 · Docs + Files tabs · Convex-only sync · Chatroom out of scope · Shipments dead · dual storage: **Vercel Blob** (Notion→portal assets) + **Convex `_storage`** (client uploads).

---

## 1. Goal

Replace the portal’s current **Notion-as-SoT + memory/Postgres cache + host-only tenancy** stack with:

| Layer | Target |
| --- | --- |
| System of record (client reads) | **Convex** |
| Authoring (team) | **Notion** (7 allowlisted data sources only) |
| Auth | **Better Auth** (`@convex-dev/better-auth`) + Contacts join |
| Billing | **Stripe → Convex** (never Notion) |
| Frontend | Existing Next portal (`apps/portal`), then Expo later |

Non-negotiables (from the brief — do not reverse quietly):

1. Client writes never round-trip into Notion.
2. Billing never touches Notion.
3. Sync worker reads exactly **seven** collection IDs; refuses all other relations.
4. Unknown Notion properties are **NEVER** (fail closed).
5. No public Convex function calls raw `ctx.db` — scoped wrappers only.
6. `orgId` leads every tenant-scoped index.

---

## 2. Current state vs target

### 2.1 What exists today (`apps/portal` + `packages/notion-sync`)

| Area | Today | Target |
| --- | --- | --- |
| Store | Memory seed + optional Postgres (`DATABASE_URL`) | Convex tables |
| Read path | `GET /api/data` → `PortalSnapshot` once on mount | Convex reactive queries (websocket) |
| Auth | Host header only (`middleware` + slug → client) | Better Auth session → Contact → org |
| Tenancy | App-layer `client-scope.ts` | Convex `clientQuery` / `adminQuery` + org checks |
| Notion sync | Full pull cron + webhook → dualStore | Webhook → queue → allowlisted worker → Convex upsert + cron backstop |
| Entities in UI | clients, projects, tasks, activity | + contacts, shared resources, client docs, billing, task responses, uploads |
| Shipments | Synced historically; stripped from public snapshot | **Dead** — no Convex table, no Notion DB, purge seed/sync leftovers |
| Chatroom | UI shell only; no data | **Out of scope** this migration; hide or keep inert shell |
| Writes | `writeProject` helper, no HTTP/UI | Client mutations → Convex only; Notion digest optional |

### 2.2 Notion model drift (UI will break if we ignore this)

Portal UI + `@warehaus/notion-sync` still assume the **old** seed schema. Live Notion (per brief) has already moved.

| Concept | Current portal / seed | New Notion / allowlist |
| --- | --- | --- |
| Client ID | `CLI-001` | `wh_cli_*` |
| Project ID | `PRJ-104` | `wh_prj_*` |
| Project phase | `Discovery / Design / Build / Shipped` | `Status`: Inbox / Planned / In progress / Done |
| Project visibility | `Client / Internal` | Gate: `Type` ∌ Internal + `Publish to Warehaus` + `Archive=false` |
| Task status | `Todo / Doing / Done / Blocked` | Inbox / To Do / In Progress / Done (+ formula `Is Done`) |
| Task due | Derived from project due | Task `Date` (CLIENT) |
| Activity | Bidirectional Notion sync | Convex-native; digest **into** Notion; client feed filters `project` (and later non-shipment types only — **no shipment**) |
| Docs / files | Missing | Client Docs + Shared Resources |
| Contacts / login | Missing | Contacts + `Auth User ID` |

**Implication:** Phase 0 of product work is an **adapter / domain model rewrite** in the portal UI, not a drop-in swap of `/api/data` for a Convex query with the same field names.

### 2.3 Surfaces already built that need a new data contract

| UI surface | Today | Must become |
| --- | --- | --- |
| Dashboard | Featured project + task board + status rail | Published project(s) for org; Progress rollup; CLIENT activity only |
| Tasks (client tab) | Kanban edit mental model | Read-only task board + **TaskResponse** (approve / request-change / comment) |
| Projects (team) | Phase/owner/due table | New Status/Type/dates/Progress; admin cross-org |
| Activity | Mixed tones/types from Notion | Convex events; strip team/sync/exception for clients |
| Account | Client list / org stub | Contacts, Portal Access, org membership |
| Chatroom | Placeholder | Out of this migration’s Notion scope |
| Billing | Fake “Aug 1 / Current” cards | Stripe truth via Convex |
| Client Docs | Missing | New tab or section (list + safe body renderer) |
| Shared Resources | Missing | Files via signed URLs (never Notion S3) |

---

## 3. Target architecture

```
Notion (7 DBs) ──webhook/cron──► Sync worker ──allowlist──► Convex upsert
                                      │
                                      ├── file/image bytes ──► Vercel Blob
                                      │                         (store blob URL + meta on Convex row)
                                      ▼
                              Quarantine + sync log

Client browser ◄──reactive── Convex (SoT)
     │                         ▲
     ├── TaskResponse / etc. ──┘   (never Notion)
     └── ClientUpload bytes ──► Convex _storage ──► clientUploads row
                                  (needsReview + scanStatus)

Stripe webhooks ───────────────────► Convex billing tables
```

### 3.1 Package / app layout (proposed)

| Path | Role |
| --- | --- |
| `packages/portal-sync/` (new) or `convex/` at root | Allowlist map, collection IDs, CI tests, Notion→Convex mappers |
| `convex/` (new, portal-owned or monorepo shared) | Schema, auth, queries/mutations, Stripe webhooks, digest jobs |
| `apps/portal` | Next UI; Convex React client; drop memory/Postgres dualStore + `/api/sync` pull path over time |
| `packages/notion-sync` | Sunset or shrink to bootstrap/admin scripts only — do not keep as runtime SoT |

**LOCKED:** Motoko / agent Convex stays separate from portal Convex.

### 3.2 Convex schema sketch (tenant-scoped)

Leading index field: `orgId` (Convex Id of Client).

Synced (Notion → Convex): `clients`, `projects`, `tasks`, `contacts`, `sharedResources`, `clientDocs` (+ `clientDocBlocks` or stored markdown/AST), `syncMeta` / `quarantine`.

Convex-native: `activity`, `taskResponses`, `clientUploads`, billing tables (`subscriptions`, `invoices`, …), Better Auth tables.

No `shipments` table. No shipment activity types in client serializers.

### 3.2.1 File storage split (LOCKED)

| Flow | Storage | Why |
| --- | --- | --- |
| Notion → portal (Shared Resources files, Client Doc images) | **Vercel Blob** | Sync worker copies Notion S3 bytes once; durable CDN URLs; never serve `amazonaws.com/notion` |
| Client → portal (`ClientUpload`) | **Convex `_storage`** | Upload stays inside Convex auth/mutation path; org-scoped; review gate before team visibility |

Both paths store **metadata on Convex rows** (orgId, filename, mime, size, checksum, source, review flags). Browser never receives a raw Notion file URL.

### 3.3 Auth + tenancy

1. Better Auth on Convex (org plugin).
2. Login → match Contact by email → write `Auth User ID` to Notion (one-field exception) + Convex.
3. Session → `Role` + `orgId` from Contact.
4. Host slug still useful for **routing / branding**, but **authorization is session + orgId**, not Host alone.
5. Team (`Warehaus Staff`) → `adminQuery`; client roles → `clientQuery`.

### 3.4 Sync worker rules (CI-backed)

Hardcoded:

1. Seven collection IDs (Activity is write-out only).
2. Property → tier map from allowlist (single import shared by worker + query serializers).
3. Relation traversal: only those seven IDs; log+drop `Ops (Internal)` / Brain / Project Ops.
4. Row gates from allowlist (incl. Tasks inherit project gate).
5. Sugar Shark fixture: zero Brain-sourced content downstream.
6. Schema-drift CI: every live Notion property appears in the map.

---

## 4. Locked decisions

| ID | Decision | Locked choice |
| --- | --- | --- |
| **D-A** | Convex deployment | **A1** — separate portal Convex; Motoko/agent stays elsewhere |
| **D-B** | Client task interaction | **B1** — TaskResponse only (`approve` / `request-change` / `comment`); no client-writable task fields |
| **D-C** | Client uploads | **C1** — `ClientUpload` with scan status + `needsReview` before team visibility |
| **D-D** | Host vs auth | **D1** — keep Host routing; require login; Host slug must match session org (fail closed) |
| **D-E** | Owner / DRI | **E1** — hide for v1 (allowlist NEVER) |
| **D-F** | UI IA | **F1** — client dock: Dashboard · Tasks · Docs · Files · Activity · Account (+ Billing under Account) |
| **D-G** | Cutover | **G1** — Convex-only sync; freeze/remove dualStore + Postgres path; keep bootstrap scripts |
| **D-H** | Chatroom | **H1** — out of scope; hide from dock or leave inert shell |
| **D-I** | Shipments | **I1** — dead; no Convex table; no Notion DB; purge leftovers |
| **D-J** | Object storage | **J1** — Vercel Blob for Notion-synced assets; Convex `_storage` for client uploads (see §5) |

---

## 5. File storage workstream (implement)

This is first-class implementation work, not an open question.

### 5.1 Principles

1. Never serve a Notion file URL to a browser (expire + unauthenticated).
2. Every file row is org-scoped (`orgId` leading index).
3. CLIENT serializers return only **our** URLs (Blob public/signed or Convex short-lived URL).
4. Client-originated files ≠ team-published Shared Resources (separate tables + trust).
5. Review gate: team must not see `ClientUpload` until `needsReview === false` (and scan ok).

### 5.2 Schema fields (minimum)

**`sharedResources` (Notion → Convex + Blob)**

| Field | Notes |
| --- | --- |
| `orgId`, `notionPageId`, `externalId` | tenancy + sync identity |
| `title`, `mimeType`, `byteSize`, `checksum` | CLIENT metadata |
| `blobPathname`, `blobUrl` | Vercel Blob location |
| `sourceNotionUrl` | SERVER only — never serialize to client |
| `published`, `archive`, sync timestamps | gates |

**`clientDocImages` (or embed on `clientDocBlocks`)**

| Field | Notes |
| --- | --- |
| `orgId`, `docId`, `blobPathname`, `blobUrl` | image copied on body sync |
| `alt`, `width?` | CLIENT-safe |

**`clientUploads` (Convex `_storage`)**

| Field | Notes |
| --- | --- |
| `orgId`, `uploadedByContactId` | tenancy + provenance |
| `storageId` | Convex `Id<"_storage">` |
| `filename`, `mimeType`, `byteSize` | CLIENT |
| `scanStatus` | `pending \| clean \| infected \| error` |
| `needsReview` | default `true` |
| `reviewedBy?`, `reviewedAt?` | team admin |
| `projectId?` | optional link |
| `createdAt` | |

### 5.3 Vercel Blob tasks (Notion → portal)

Implement in sync / portal package (not Motoko):

1. **Env + package** — `@vercel/blob` in portal/sync worker; `BLOB_READ_WRITE_TOKEN` in portal Vercel + sync runtime secrets.
2. **Copy helper** — `copyNotionFileToBlob({ notionUrl, orgId, kind, notionPageId })`:
   - fetch Notion bytes server-side
   - `put()` under pathname `portal/{orgId}/{kind}/{notionPageId}/{hash}-{safeName}`
   - return `{ blobUrl, pathname, size, contentType }`
   - idempotent: if checksum matches existing row, skip re-upload
3. **Shared Resources sync hook** — on upsert, for each Files property: copy → write Blob fields on Convex row; clear stale Blob if Notion file removed.
4. **Client Doc body sync** — when walking blocks, copy image file blocks to Blob; rewrite stored AST/markdown to Blob URLs only.
5. **URL grant for clients** — prefer private Blob + short-lived signed download URLs via a Convex action / Next route that checks `clientQuery` org; if using public Blob, still never leak Notion source URL and keep pathnames unguessable (`orgId` + hash).
6. **GC job** — cron: list Blob pathnames orphaned after Soft-deleted/unpublished Notion rows; delete Blob + mark Convex.
7. **Tests** — fixture Notion file URL → Blob put mocked; CLIENT serializer asserts no `amazonaws.com` / `notion.so` file hosts.

### 5.4 Convex file storage tasks (client uploads)

1. **Generate upload URL** — `clientMutation` `clientUploads.generateUploadUrl` (org + Portal Access gated).
2. **Finalize upload** — after client `storage.store`, mutation creates `clientUploads` row: `needsReview: true`, `scanStatus: "pending"`.
3. **Virus scan stub** — action/cron sets `scanStatus`; infected → delete `_storage` blob + flag row; clean stays `needsReview: true` until team.
4. **Team review** — `adminMutation` `approveUpload` / `rejectUpload` (reject deletes storage).
5. **Client list** — client sees own org uploads (including pending review); team list filters `needsReview` for inbox.
6. **Download** — `clientQuery`/`adminQuery` returns short-lived Convex file URL via `storage.getUrl`; never a permanent public link without auth check.
7. **Quota guard (v1 light)** — max bytes / count per org per day; fail closed with clear error.
8. **Tests** — foreign-org cannot `getUrl`; unapproved uploads hidden from team “published files” views but visible in review queue; infected path deletes storageId.

### 5.5 Files tab UI (consumes both)

| Section | Source | Actions |
| --- | --- | --- |
| Shared with you | `sharedResources` (Blob URLs) | Download |
| Your uploads | `clientUploads` (Convex storage) | Upload, see review/scan status |
| Team review (admin) | `clientUploads` where `needsReview` | Approve / reject |

Docs tab uses Blob-backed images inside the safe body renderer.

---

## 6. Phased delivery (implementation order)

§4 is locked. Remaining pre-code ops checks are in §10.

### Phase 0 — Align Notion + freeze contracts

- [x] Confirm remediation Phase 0/1 items still match live Notion (IDs in brief) — see [`ops-checklist.md`](./ops-checklist.md).
- [x] Commit allowlist + collection IDs as a typed module (`packages/portal-sync`).
- [x] Document field renames for UI (`phase` → `status`, etc.) in `view-models.ts`.
- [x] Add typed file metadata shapes (`SharedResourceFile`, `ClientUpload`) matching §5.2.

### Phase 1 — Convex foundation + auth

1. [x] Scaffold **separate** portal `apps/portal/convex/` (anonymous local deploy working).
2. [x] Schema: synced tables + `clientUploads` / `clientDocImages` Blob fields + native activity/taskResponses.
3. [x] `clientQuery` / `clientMutation` / `adminQuery` / `adminMutation` wrappers (`_lib/wrappers.ts`).
4. [x] Better Auth (email/password) + Contact join via `contacts.authUserId`; org plugin deferred to local-install follow-up.
5. [x] Host slug must match session org (`assertHostMatchesOrg`).
6. [x] CI pure tests: foreign-org filter + host mismatch (`npm run test:portal-convex`).
7. [x] Thin Next wiring: `ConvexClientProvider` (no-ops without `NEXT_PUBLIC_CONVEX_URL`).
8. [x] **Convex files (partial):** `generateUploadUrl` / `finalizeUpload` / review mutations.
9. [x] Standalone `/login` page (outside portal chrome) + AuthGate on all portal routes; Contact join + Notion Auth User ID action. Sign out from Account → Profile.
10. [x] Dev seed: `npx convex run seed:seedDemoTenants` (`demo@northbay.test` / `team@warehaus.co`).
11. [x] Replace `usePortalData` with Convex adapter when signed-in (`portalData.getSnapshot`); memory `/api/data` removed in Phase 3.
12. [~] Better Auth organization plugin — runbook in [`better-auth-org-plugin.md`](./better-auth-org-plugin.md); blocked on cloud claim + local install. Contact.`orgId` remains ACL SoT.

**Exit (partial):** Login + Contact join works against local Convex; Notion write runs when token is set on the deployment.

### Phase 2 — Sync worker + Vercel Blob

1. [x] Webhook receiver (secret header, dedupe via `syncEvents`, enqueue, 200 fast) — Convex `POST /notion/webhook` + Next forwarder.
2. [x] Worker: allowlisted pull → mappers/gates → upsert / quarantine (`sync/pull:pullAll`).
3. [x] Cron backstop every 15m (`crons.ts` → `pullAll`). Incremental `last_edited_time` filter when syncMeta exists (`forceFull` override).
4. [x] **Blob copy pipeline** (§5.3): Shared Resources + Client Doc images (`docBody` rewrite); GC cron for unpublished shared Blobs. Skips without `BLOB_READ_WRITE_TOKEN`.
5. [x] CI: Sugar Shark + schema-drift + CLIENT file-host asserts in `@warehaus/portal-sync` tests.
6. [x] Staleness: `syncMeta` key `notion-pull` written each run (alert path later).
7. [x] Blob GC cron for unpublished/archived Shared Resources (`sync/blobGc`).

**Ops blocker:** Convex `NOTION_WAREHAUS_TOKEN` must be a Warehaus integration that can query the six sync-in data sources (current Motoko Arc Sync token 404s Clients). Set via `npx convex env set NOTION_WAREHAUS_TOKEN …`.

**Exit:** Publishing a Client Doc / Shared Resource in Notion appears in Convex with Blob URLs within seconds; Brain content never does; no Notion S3 URLs to clients.

### Phase 3 — Portal UI domain rewrite

1. [x] Replace seed field names with view-models matching CLIENT tier (`src/lib/data/view-models.ts` + `portalData.getSnapshot`).
2. [x] Tasks: read-only board/list + TaskResponse composer in detail sheet (`taskResponses.create` / `listForTask`).
3. [x] **Resources tab** (Docs + Files merged): Shared Resources table + Blob URL writeback + ClientUpload / review.
4. [x] Safe Client Doc body sync on pull (Notion images → Blob URLs in body + `clientDocImages`).
5. [x] **Team review UI** for uploads (`needsReview` — Resources → Review for staff).
6. [x] Activity: Convex feed; client type filter (**no shipment**); staff sees exception/sync; Exceptions polish.
7. [x] Dashboard: featured project ranking, task counts, activity rail, Progress rail (Billing deferred to Phase 4).
8. [x] Remove Chatroom from dock (route redirects home).
9. [x] Remove `/api/data` memory path + dualStore/Postgres; Convex-only `usePortalData`.
10. [x] Team admin: `clients.listDirectory` / `getTeamStats` live counts + Account → Clients table.
11. [x] Purge shipment types from portal UI/seed serializers (notion-sync package purge → Phase 5).

**Exit:** Client portal usable end-to-end without seed memory; Resources tab live.

### Phase 4 — Billing

1. [x] Stripe webhooks → Convex (`POST /stripe/webhook` + `billingEvents` idempotency).
2. [x] Account → Billing (plan + invoices) + Dashboard Billing rail from Convex.
3. [x] No Notion involvement (`seedDemoBilling` for local without Stripe keys).
4. [x] `clients.stripeCustomerId` maps Stripe Customer → org.

### Phase 5 — Hardening + delete debt

1. [x] Remove Postgres dualStore (done with Phase 3.9).
2. [x] Delete `packages/notion-sync` (runtime already unused; replaced by `@warehaus/portal-sync`).
3. [x] Strip Shipments from bootstrap; no live Shipments DB existed under Warehaus Databases. Removed stale Activity `Type=shipment` select option (2026-08-04).
4. [x] Update `docs/portal-multi-tenant.md`, `docs/notion-sync-architecture.md` (obsolete banner).
5. [x] Expo auth path note — [`expo-auth-path.md`](./expo-auth-path.md) (no native scaffold).
6. [x] Blob + Convex storage retention — [`storage-retention.md`](./storage-retention.md) + Blob GC cron.

---

## 7. Gap register (UI ↔ plan)

| ID | Gap | Severity | Resolution phase |
| --- | --- | --- | --- |
| G1 | No login; Host ACL only | Blocker | 1 |
| G2 | Field model mismatch (phase/visibility/status) | Blocker | 0–3 |
| G3 | Tasks treated as editable; TaskResponse only | High | 3 |
| G4 | No Docs / Files surfaces | High | 3 |
| G5 | Fake billing | High | 4 ✅ |
| G6 | Activity bidirectional Notion sync | High | 2–3 |
| G7 | Chatroom empty | Medium | Out of scope (hide) |
| G8 | Polling `/api/data` vs reactive Convex | Medium | 1–3 |
| G9 | Admin cross-org aggregations (no SQL) | Medium | 1 design / 3 build |
| G10 | Owner/DRI display | Low | Hide v1 |
| G11 | External ID format + seed IDs | Medium | 0–2 |
| G12 | Shipments leftover in notion-sync | Low | 5 ✅ |
| G13 | Client Docs all Draft today — portal empty until publish | Product | Ops + 2 |
| G14 | Tasks DB has 0 rows — board empty until authored | Product | Ops |
| G15 | Convex has no RLS — forgotten org check = full leak | Critical process | 1 CI |
| G16 | No Blob / Convex storage wiring | High | 1–3 (§5) |

---

## 8. Test plan (minimum)

| Test | Layer |
| --- | --- |
| Allowlist: unknown property dropped | Unit |
| Relation outside 7 IDs not traversed | Unit |
| Sugar Shark → zero Brain content | Integration / CI |
| Notion schema props ⊆ map | CI (live or fixture snapshot) |
| Client token: zero rows for foreign org on every client query | CI |
| CLIENT serializer never emits SERVER fields (`Auth User ID`, emails of other orgs, etc.) | Unit |
| Client Doc renderer drops child pages, synced blocks, comments | Unit |
| File responses are Blob or Convex URLs, never `amazonaws.com/notion` | Integration |
| Blob copy idempotent on same checksum | Unit |
| Foreign org cannot `storage.getUrl` for another org’s `storageId` | CI |
| Team published-files view excludes `needsReview` uploads | Unit |
| Infected upload deletes Convex storage blob | Integration |
| Stripe webhook idempotency | Integration |

---

## 9. Explicit non-goals (this migration)

- Clients in Notion as guests
- Live client → Notion writes
- Billing authored in Notion
- Merging Motoko agent memory into portal Convex
- Shipping Expo app (auth must not block web, but Expo is later)
- Rebuilding marketing site
- Chatroom backend
- Shipments / logistics
- Showing Owner/DRI to clients (v1)

---

## 10. Remaining ops checks (non-blocking for PR1)

Product decisions are locked. Still confirm before Phase 2/4 traffic:

- [x] §4 decisions D-A … D-J locked
- [x] Confirm live Notion collection IDs still match the brief table ([`ops-checklist.md`](./ops-checklist.md))
- [x] Contacts `Auth User ID` / `External ID` ownership: Convex SoT; Notion mirror via join + `contacts.scheduleAuthBackfill`
- [x] Object storage: Vercel Blob + Convex `_storage` (§5)
- [~] Stripe account / mode + `STRIPE_WEBHOOK_SECRET` — set when leaving Phase 4 parked (commands in ops-checklist)
- [~] Provision portal Convex **cloud** project + `BLOB_READ_WRITE_TOKEN` on Convex (local anonymous lacks Blob/Stripe envs today)

---

## 11. Suggested first implementation PRs

**PR1 — Contracts only (no UI rewrite):** ✅ done in tree

1. `packages/portal-sync` with collection IDs, tiers, gates, serializers, file types, fixtures.
2. `npm run test:portal-sync` — 22 tests (Sugar Shark, schema drift, forbidden file hosts).
3. No production traffic change.

**PR2 — Portal Convex scaffold + auth wrappers + ClientUpload storage stubs** ✅

- `apps/portal/convex/` schema, Better Auth HTTP routes, scoped wrappers
- `clientUploads.generateUploadUrl` / `finalizeUpload` / review mutations
- `ConvexClientProvider` + `/api/auth/[...all]`
- Local anonymous deploy via `CONVEX_AGENT_MODE=anonymous npx convex dev`
- Claim a real cloud project when ready (`npx convex login`)

**PR2b — Login + Contact join** ✅

- `contacts.linkSession` / `canRegister` / `getLinkStatus`
- Notion `Auth User ID` push action (skips seed pages; needs token on Convex)
- Account → Profile login UI; demo seed emails

**PR3 — Sync worker + Vercel Blob copy pipeline** (Phase 2).

**PR4 — Docs + Files tabs + TaskResponse UI** (Phase 3).

Then billing (Phase 4) and debt purge including shipments (Phase 5).
