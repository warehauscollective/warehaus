# Warehaus Portal — Engineering Handoff Brief

**For:** the coding agent picking up this build
**Date:** 3 August 2026
**Companion documents:** `warehaus-portal-notion-remediation-plan.md`,
`warehaus-portal-field-allowlist.md` — read both before writing code. This brief
gives you context and ordering; the allowlist is the authoritative spec for what data
may cross which boundary.

---

## 1. What we're building

Warehaus is a design and engineering studio. We're building a client portal with two
audiences:

- **Admin portal** — the Warehaus team manages all clients and all projects across
  clients.
- **Client portal** — each client sees only their own projects, documents, files and
  billing. This is intended to be the only place a client goes to work with us.

Web first (React), React Native/Expo later. The same backend serves both.

## 2. Architecture, and the reasoning behind it

Read this section carefully. Several decisions look arbitrary until you know why they
were made, and reversing one of them quietly will break a guarantee elsewhere.

### Convex is the system of record. Notion is an authoring surface.

Notion holds the human-edited workflow: clients, projects, tasks, client-facing
documents. But **Notion is not the backend.** It writes *into* Convex, and the portal
reads from Convex.

The distinction matters when the two disagree. If Notion were authoritative, a bad
Notion state would become a bad client experience automatically. Because Convex is
authoritative, a bad Notion state gets rejected at the sync boundary and surfaces as
an error we can see.

Why Notion at all: the team gets kanban boards, wikis, templates and an editing UI for
free, and can fix data directly when needed. Why not Notion alone: the API caps at
~3 requests/second (2,700 per 15 minutes, no paid tier raises it), has no
transactions, no real query planner, and no permission model safe to expose to
external users.

### Client writes never round-trip into Notion

Anything a client does lands in Convex. Full stop. Notion may receive a periodic
digest, never a live write.

Two reasons: Notion has no external permission boundary we can safely use, and every
client-triggered Notion write burns from the same ~3 req/s budget as our own syncing.
A busy Tuesday would starve the sync.

### Billing never touches Notion

Stripe → webhooks → Convex → portal. Notion has no validation, no audit trail, no
transactions, and is editable by anyone on the team — and by AI tooling. A wrong
balance shown to a client is a trust and legal problem, not a bug report.

### Real-time lives between the client and Convex

Convex's reactive queries push updates over a websocket. The Notion hop is a
background ingest, not part of the read path:

```
Notion edit → webhook (seconds) → worker → Convex upsert → instant push to clients
Client action → Convex → instant push
```

Client-initiated changes are instant. Team edits made in Notion land in seconds. That
is the right place to absorb latency.

### The sync boundary is an allowlist, and it is the safety-critical part

There is a second Notion space — **Second Brain** — containing personal notes, PARA
areas, and Granola meeting transcripts. Portal Projects used to relate directly to
five Second Brain databases, and one project already had three raw meeting
transcripts attached. A worker that naively followed relations would have published
verbatim internal call transcripts to a client.

That has been fixed structurally (see §4), but the discipline must hold in code:

**The worker reads exactly seven collection IDs and refuses to traverse any relation
pointing outside that set.** Not a denylist. Not a heuristic. A hardcoded list, with
a CI test.

## 3. Stack

| Layer | Choice | Notes |
|---|---|---|
| Backend / DB | **Convex** | reactive queries, transactions, scheduled functions |
| Auth | **Better Auth** via `@convex-dev/better-auth` | runs on the Convex deployment; user data stays in Convex; organization plugin for client orgs; documented Expo path |
| Billing | **Stripe** | webhooks into Convex |
| Frontend | React (web) → Expo/React Native (later) | |
| Hosting | Vercel | |
| Authoring | Notion (team only) | |

Better Auth was chosen over Clerk because there's no per-MAU or per-organization
meter, and because the user table lives in Convex — so `Contacts.Auth User ID` joins
to a row in our own database rather than a foreign system called on every permission
check.

### Multi-tenancy: Convex has no RLS, deliberately

Convex's position is that because the database is only reachable through server
functions, authorization belongs in those functions rather than in row-level policy.
That's defensible, but it transfers the guarantee to us: in Postgres a forgotten
`WHERE client_id = ?` returns nothing; in Convex a forgotten org check returns
*everything*.

Non-negotiable patterns:

1. **No public function calls `ctx.db` directly.** Build `clientQuery` / `clientMutation`
   / `adminQuery` wrappers that resolve identity → `orgId` and hand the handler a
   pre-scoped context. Make the unscoped path awkward to reach.
2. **`orgId` leads every index** on tenant-scoped tables. Not a post-filter.
3. **Cross-client operations live in `internal` functions**, which Convex guarantees
   cannot be called from a client.
4. **Add `rowLevelSecurity` from convex-helpers** as defence in depth even though it
   isn't required.
5. **CI test:** a client-role token gets zero rows from every client-facing query for
   an org it doesn't belong to.

Known weak spot: cross-tenant aggregation. The admin portal wants "all projects across
all clients", and Convex has no SQL, joins or `GROUP BY`. Dashboard counts need
denormalised counters maintained on write, or the Convex aggregate component. Plan for
this rather than discovering it.

---

## 4. Current Notion state — verified 3 August 2026

### The seven in-bounds data sources

| # | Name | Collection ID |
|---|---|---|
| 1 | Clients | `5165ca6e-352e-45af-8918-98779fd76e61` |
| 2 | Projects | `39947c31-d003-4125-9c32-5e570d4c7e0e` |
| 3 | Tasks | `f418e8e8-6470-4e12-8207-b45b8ae6d8a5` |
| 4 | Contacts | `b8e25824-c184-448f-a4fd-32fbf03b3c8a` |
| 5 | Shared Resources | `7215c759-e91b-4fd3-b90d-ac834e5435fc` |
| 6 | Activity | `d9e9c053-dec7-415b-bb06-ff3f6b71538f` |
| 7 | Client Docs | `50f364f7-9162-4226-9a01-53464052fd19` |

All seven live under the **Warehaus Portal** page (`3a3ffd60-316b-8012-83a5-c017bc2f7312`).

### Out of bounds — do not read

| Name | Collection ID | Why |
|---|---|---|
| **Project Ops** | `74122728-5f56-4fa0-89fb-1bed8a70148c` | Holds the Second Brain links removed from Projects. Lives under Second Brain. Reachable from `Projects.Ops (Internal)` — this is the one relation most likely to be mistaken for in-scope. |
| Brain Areas | `e59ffd60-316b-82f8-a0e3-07f0de2329da` | |
| Brain Notes | `ac1ffd60-316b-83d8-b4a6-87ecd16a4937` | |
| Brain Resources | `e51ffd60-316b-8356-ace3-87453234d7b1` | |
| Granola Notes | `740ffd60-316b-8335-9986-87f96b0da096` | raw meeting transcripts |
| Brain Tasks | `ea0ffd60-316b-8297-a233-87d1441c54e1` | |
| Brain Projects | `820ffd60-316b-83dd-afa9-87a4a26422e9` | |

### Schemas

Property names are exactly as they appear via the Notion REST API.

**Clients** — 15 rows, all with `Slug` and `External ID` populated.

| Property | Type | Values |
|---|---|---|
| Company Name | title | |
| Slug | rich_text | lowercase-hyphenated |
| External ID | rich_text | `wh_cli_*` |
| Status | select | Active, Prospect, Paused |
| Portal access | select | Enabled, Disabled |
| Primary Email | email | |
| Phone | phone_number | |
| Projects | relation → Projects | two-way |
| Contacts | relation → Contacts | two-way |
| Client Docs | relation → Client Docs | two-way |
| Source | select | motoko, portal, notion-ui, bridge, arc |
| BridgeDirection | select | none, brain-to-warehaus, warehaus-to-brain |
| LastBridgedAt | date | |
| BrainPageId, WarehausPageId | rich_text | |
| Publish to Warehaus, Promote to Brain | checkbox | |

**Projects** — 6 rows, all linked to a client, all with `External ID`.

| Property | Type | Values |
|---|---|---|
| Name | title | |
| Description | rich_text | |
| Client | relation → Clients | two-way, **required for tenancy** |
| Tasks | relation → Tasks | two-way |
| Ops (Internal) | relation → Project Ops | **out of bounds** |
| Client Docs | relation → Client Docs | two-way |
| Status | status | Inbox, Planned, In progress, Done |
| Priority | select | High, Medium, Low |
| Type | multi_select | Website, Product, Brand, Internal, R&D |
| Stack | multi_select | 22 tech options |
| Start Date, End Date | date | |
| Progress | rollup | `percent_checked` over `Tasks → Is Done` |
| Owner/DRI | people | Notion user IDs |
| Live URL, Docs URL, Figma Link, Github Repo | url | |
| Archive | checkbox | |
| External ID | rich_text | `wh_prj_*` |
| Source, BridgeDirection | select | |
| LastBridgedAt | date | |
| BrainPageId, WarehausPageId | rich_text | |
| Publish to Warehaus, Promote to Brain | checkbox | |

**Tasks** — **0 rows currently.** Greenfield; no migration concerns.

| Property | Type | Values |
|---|---|---|
| Name | title | |
| Description | rich_text | |
| Projects | relation → Projects | two-way |
| Status | status | Inbox, To Do (to_do); In Progress (in_progress); Done (complete) |
| Is Done | formula | `prop("Status") == "Done"` → boolean |
| Legacy Complete | checkbox | **deprecated**, ignore |
| Priority | select | High, Medium, Low |
| Estimate | select | XS, S, M, L, XL |
| Date | date | |
| Next Action | rich_text | |
| Owner / DRI | people | note the spaces around the slash |
| Blocked by, Blocking | relation → self | |
| GitHub Issue/PR, Figma Frame, URL | url | |
| Repo Branch | rich_text | |
| External ID | rich_text | `wh_tsk_*` |
| Source, BridgeDirection, LastBridgedAt, BrainPageId, WarehausPageId | | |
| Publish to Warehaus, Promote to Brain | checkbox | |

**Contacts** — the portal identity table.

| Property | Type | Values |
|---|---|---|
| Name | title | |
| Email | email | |
| Phone | phone_number | |
| Client Company | relation → Clients | two-way, **required for tenancy** |
| Auth User ID | rich_text | **Better Auth user id — the login join key** |
| External ID | rich_text | `wh_con_*` |
| Role | select | Client Admin, Client Member, Warehaus Staff |
| Portal Access | select | Enabled, Disabled |
| Internal Notes, Internal Description | rich_text | **never sync** |
| Website, LinkedIn, Instagram, X / Twitter | url | |
| Source | select | |
| LastBridgedAt | date | |
| Publish to Warehaus | checkbox | |

`Auth User ID` and `External ID` are currently unpopulated. Backfilling them is part
of the auth work — see §6.

**Shared Resources**

| Property | Type | Values |
|---|---|---|
| Name | title | |
| Description | rich_text | |
| Type | select | Image, Social Media Post, Podcast, Course, Video, PDF, Article |
| URL | url | |
| File | files | |
| Client, Project | relation | one-way |
| External ID | rich_text | `wh_res_*` |
| Source, BridgeDirection, LastBridgedAt, BrainPageId, WarehausPageId | | |
| Publish to Warehaus, Promote to Brain | checkbox | |

**Activity** — direction is inverted; see §5.

| Property | Type | Values |
|---|---|---|
| Name | title | |
| Summary | rich_text | |
| Type | select | project, team, sync, exception |
| Tone | select | success, warn, danger, accent, muted |
| Timestamp | date | |
| Client, Project | relation | |
| Sync status | select | ok, pending, error, stale |
| External ID, Source | | |

**Client Docs** — 35 rows: 7 documents × 5 clients. All `Draft`, none published.

| Property | Type | Values |
|---|---|---|
| Title | title | |
| Doc Type | select | Start Here, Project Brief, Brand & Assets, Questions & Requests, Decisions Log, Meeting Notes, Deliverables & Handoff |
| Order | number | portal display sequence |
| Summary | rich_text | |
| Client, Project | relation | two-way |
| Status | select | Draft, Published |
| External ID | rich_text | `wh_doc_*` |
| Source | select | |
| Publish to Warehaus | checkbox | |
| LastBridgedAt | date | |

This is the **only** database whose page body content is read. Everything else
contributes properties only.

---

## 5. Behaviour that isn't obvious from the schema

**Activity is write-only from our side.** Events are written to Convex by the app.
A scheduled Convex job writes a periodic digest *into* Notion for internal review.
The worker never reads Activity as a sync source. `sync` and `exception` events are
aggregated to counts, not written as individual rows — those are the events that
would otherwise exhaust the rate limit.

**Client-facing activity feeds read from Convex** and must filter to
`Type ∈ {project}` for client feeds. `team`, `sync` and `exception` are internal by
definition.

**`Progress` is a rollup, so it's derived.** Don't write to it. It recomputes from
`Tasks → Is Done`.

**`Is Done` is a formula over the status name.** If anyone renames the `Done` status
option in Notion, the formula silently returns false for everything and `Progress`
drops to zero. Worth a monitoring assertion.

**Notion file URLs expire and are unauthenticated.** Anyone holding one can fetch the
asset. Copy bytes into our own storage on sync; serve signed URLs.

**Webhook payloads are sparse.** A `page.updated` event tells you *what* changed, not
the content. You still fetch the page, against the 3 req/s budget. Design: webhook →
verify HMAC → dedupe by event ID → enqueue page ID → return 200 immediately → worker
fetches and upserts. Plus an incremental cron on `last_edited_time` as a backstop for
missed deliveries.

**Notion has no transactions.** Never assume a multi-page write succeeded atomically.

---

## 6. Work to do, in order

### Phase A — Convex foundation

1. Convex project, schema for the seven synced tables plus the Convex-native
   entities in Phase D.
2. `orgId` (Convex ID of the client) as the leading field of every index on
   tenant-scoped tables.
3. `clientQuery` / `clientMutation` / `adminQuery` / `adminMutation` wrappers.
   No public function reaches raw `ctx.db`.
4. **CI test:** every client-facing query returns zero rows for a foreign org.

### Phase B — Auth

1. Better Auth via `@convex-dev/better-auth`, organization plugin. Social providers
   plus email.
2. On first login, resolve the authenticated user to a Contact by email and write
   `Auth User ID` back to Notion. This is the one legitimate Notion write from an
   auth flow — it's a single field on a single row, not a client-driven write.
3. Backfill `External ID` (`wh_con_*`) on all Contacts.
4. Enforce: `Portal Access` = Enabled and `Client Company` non-empty, or no access.
5. `Role` drives admin vs client routing.

### Phase C — The sync worker

1. Hardcoded map: collection ID → { property name → tier } for all seven sources,
   per `warehaus-portal-field-allowlist.md`. **Unknown properties are dropped.**
   Fail closed.
2. Relation traversal restricted to the seven collection IDs. Log and drop anything
   else.
3. Row-level gates per the allowlist — note Tasks inherit their parent project's gate.
4. Notion webhook receiver → queue → worker → Convex upsert, keyed on Notion page ID.
5. Incremental cron backstop on `last_edited_time`.
6. Validation at the boundary: rows failing schema go to a visible quarantine table,
   not into the portal.
7. `lastSyncedAt` per record + staleness alerting. The dangerous failure is a silent
   one — the sync dying while the portal serves plausible stale data.
8. **CI test:** publish Sugar Shark (which has Second Brain history via its Ops
   record) and assert zero Brain-sourced content downstream.

### Phase D — Convex-native entities not yet modelled

These don't exist anywhere yet and will block the portal build.

**`TaskResponse`** — clients do not edit tasks. A client moving a task to Done would
overwrite the team's judgement about whether it is done. Instead clients attach
responses: `{ taskId, contactId, type: approve | request-change | comment, body,
createdAt }`. Keeps tasks single-writer, and makes client actions auditable and
reversible.

**`ClientUpload`** — client-uploaded assets go to Convex + object storage, never
Notion. Separate from `Shared Resources` because provenance matters: a file we
published and a file a client dropped in have different trust levels. Carry
virus-scan status and a review flag before anyone opens them.

### Phase E — Billing

Stripe → webhooks → Convex. Portal renders Stripe's truth read-only. Nothing about
billing is authored in Notion.

### Phase F — Client Docs rendering

Page body content pipeline per the allowlist §"Client Docs — page body content".
Six rules, all of which are safety rules, not formatting preferences: block-type
allowlist; never traverse child pages; never render synced blocks; strip mentions and
internal links; never fetch comments; copy images to our storage.

The seven template documents are deliberately flat — tables and headings, no nesting
— so the no-child-pages rule costs nothing today.

---

## 7. Do not

- Write client actions into Notion.
- Put billing, balances, or contract terms in Notion.
- Follow a relation to a collection ID outside the seven.
- Sync a Notion property that isn't in the field map.
- Serve a Notion file URL directly to a browser.
- Use Notion as the hot path for anything high-frequency.
- Call `ctx.db` from a public Convex function.
- Assume a Notion property that exists today will still exist next month — the CI
  test on schema drift is what catches this.

---

## 8. Open questions for Peter

- `Owner/DRI` is a Notion people property, so the value is a Notion user ID. Showing
  "your team" to a client needs a Notion-user → display-record mapping. Not built.
- Whether `TaskResponse` covers the intended client interaction, or specific task
  fields should genuinely be client-writable.
- Notion plan tier — relevant if guest access is ever revisited (it currently is not;
  clients never touch Notion).
- Whether client-uploaded assets need a review/approval step before appearing to the
  Warehaus team.
