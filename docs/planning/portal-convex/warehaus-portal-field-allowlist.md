# Warehaus Portal — Field-Level Sync Allowlist

**Companion to:** Warehaus Portal — Notion Remediation Plan (Phase 2.3)
**Prepared:** 3 August 2026
**Status:** Draft for approval

---

## Why three tiers, not two

The obvious model is "syncs / doesn't sync." That model leaks.

`Auth User ID` has to reach Convex — it's the join key that resolves a login to a
Contact. But it must never appear in a payload sent to a browser. Same for
`Portal access`, `Primary Email`, and every `External ID`. These are neither
"internal to Notion" nor "client-facing"; they're infrastructure.

So every property lands in exactly one of three tiers:

| Tier | Meaning |
|---|---|
| **CLIENT** | Syncs to Convex, and may be served to a client user |
| **SERVER** | Syncs to Convex, never leaves the backend |
| **NEVER** | Never leaves Notion |

CLIENT and SERVER together define what the sync worker reads. CLIENT alone defines
what a client-scoped Convex query is allowed to return.

## The default rule

**Any property not named in this document is NEVER.**

This matters more than any individual row below. When someone adds a property in
Notion next month — and they will — the worker must ignore it until it is
explicitly classified here. Fail closed. A worker that syncs unknown fields by
default will eventually ship something private, and it will do so silently.

Practically: the worker holds a hardcoded map of property name → tier per database,
and drops anything not in the map. Not a denylist. Not a regex.

---

## Row-level gates

Field tiers decide *which columns*. These gates decide *which rows*. All must pass
before a row is eligible to sync at all.

| Database | Gate |
|---|---|
| Clients | `Portal access` = Enabled |
| Projects | `Publish to Warehaus` = true **AND** `Client` is not empty **AND** `Archive` = false **AND** `Type` does not contain `Internal` |
| Tasks | `Publish to Warehaus` = true **AND** `Projects` is not empty **AND** parent project passes its gate |
| Contacts | `Portal Access` = Enabled **AND** `Client Company` is not empty |
| Shared Resources | `Publish to Warehaus` = true **AND** (`Client` or `Project` is not empty) |
| Client Docs | `Status` = Published **AND** `Publish to Warehaus` = true **AND** `Client` is not empty |
| Activity | *(see note — direction is inverted)* |

Two of these deserve comment.

**`Type` contains `Internal`.** A project tagged Internal should never reach a client
portal even if someone ticks the publish box. Two independent conditions guarding the
same outcome is deliberate; the checkbox is a human action and humans misclick.

**Parent gate inheritance on Tasks.** A published task under an unpublished project
must not sync. Without this, a task leaks the existence of a project the client
shouldn't know about.

---

## Clients

| Property | Tier | Note |
|---|---|---|
| Company Name | CLIENT | |
| Slug | CLIENT | URL segment |
| Projects | CLIENT | traverse only to rows passing the Projects gate |
| Contacts | SERVER | membership resolution |
| External ID | SERVER | |
| Status | SERVER | Prospect/Paused is commercial state |
| Portal access | SERVER | gate input |
| Primary Email | SERVER | |
| Phone | SERVER | |
| Source | SERVER | provenance |
| LastBridgedAt | SERVER | staleness detection |
| BridgeDirection | NEVER | |
| BrainPageId | NEVER | |
| WarehausPageId | NEVER | |
| Publish to Warehaus | NEVER | |
| Promote to Brain | NEVER | |

`Status` is SERVER rather than CLIENT because a client seeing themselves labelled
`Prospect` or `Paused` is a conversation you want to have deliberately, not one the
portal starts on your behalf.

## Projects

| Property | Tier | Note |
|---|---|---|
| Name | CLIENT | |
| Description | CLIENT | |
| Status | CLIENT | Inbox/Planned/In progress/Done |
| Progress | CLIENT | rollup over Tasks → Is Done |
| Start Date | CLIENT | |
| End Date | CLIENT | |
| Live URL | CLIENT | |
| Figma Link | CLIENT | |
| Docs URL | CLIENT | |
| Stack | CLIENT | shown as a trust signal |
| Tasks | CLIENT | traverse only to rows passing the Tasks gate |
| Client | SERVER | tenant scoping — the single most important field |
| External ID | SERVER | |
| Type | SERVER | gate input |
| Archive | SERVER | gate input |
| Priority | SERVER | internal sequencing |
| Source | SERVER | |
| LastBridgedAt | SERVER | |
| **Ops (Internal)** | **NEVER** | the Second Brain edge |
| Github Repo | NEVER | |
| Owner/DRI | NEVER | Notion user ID — needs a display mapping first |
| BridgeDirection | NEVER | |
| BrainPageId | NEVER | |
| WarehausPageId | NEVER | |
| Publish to Warehaus | NEVER | |
| Promote to Brain | NEVER | |

`Ops (Internal)` being NEVER is what makes the Phase 2.2 split hold. It is the only
property in the entire portal pointing outside the six-database boundary. If one line
in this document deserves a comment in the code, it's this one.

## Tasks

| Property | Tier | Note |
|---|---|---|
| Name | CLIENT | *pending the visibility decision below* |
| Status | CLIENT | |
| Is Done | CLIENT | formula; drives Progress |
| Date | CLIENT | |
| Projects | SERVER | scoping + gate inheritance |
| External ID | SERVER | |
| Estimate | SERVER | effort sizing is commercially sensitive |
| Priority | SERVER | |
| Source | SERVER | |
| LastBridgedAt | SERVER | |
| Description | NEVER | free text, written for internal readers |
| Next Action | NEVER | free text |
| Owner / DRI | NEVER | |
| Blocked by | NEVER | |
| Blocking | NEVER | |
| GitHub Issue/PR | NEVER | |
| Repo Branch | NEVER | |
| Figma Frame | NEVER | |
| URL | NEVER | |
| Legacy Complete | NEVER | deprecated, delete once verified empty |
| BridgeDirection / BrainPageId / WarehausPageId | NEVER | |
| Publish to Warehaus / Promote to Brain | NEVER | |

`Description` and `Next Action` are NEVER on purpose. They are the fields most likely
to contain a sentence written assuming no client will read it. If you want
client-facing task copy, add a separate `Client Summary` property rather than
reclassifying these.

## Contacts

| Property | Tier | Note |
|---|---|---|
| Name | CLIENT | visible to others in the same client org only |
| Email | CLIENT | same-org scope only |
| Auth User ID | SERVER | Better Auth join key — never serialize to a browser |
| External ID | SERVER | |
| Client Company | SERVER | tenant scoping |
| Role | SERVER | authorization input |
| Portal Access | SERVER | gate input |
| Phone | SERVER | |
| Internal Notes | NEVER | |
| Internal Description | NEVER | |
| Website / LinkedIn / Instagram / X | NEVER | CRM enrichment, not portal data |
| Source / LastBridgedAt | SERVER | |
| Publish to Warehaus | NEVER | |

Contacts needs a scoping rule the other tables don't: `Name` and `Email` are CLIENT,
but only within the requesting user's own org. A client admin seeing colleagues is
expected; seeing a contact at another company is a breach. This is a query-layer
constraint, not a field-tier one — the tier says the data may reach *a* client, the
query decides *which*.

## Shared Resources

| Property | Tier | Note |
|---|---|---|
| Name | CLIENT | |
| Description | CLIENT | |
| Type | CLIENT | |
| URL | CLIENT | |
| File | CLIENT | serve via signed URL, never a raw Notion S3 link |
| Client | SERVER | scoping |
| Project | SERVER | scoping |
| External ID | SERVER | |
| Source / LastBridgedAt | SERVER | |
| BridgeDirection / BrainPageId / WarehausPageId | NEVER | |
| Publish to Warehaus / Promote to Brain | NEVER | |

Notion's file URLs are time-limited and unauthenticated — anyone holding one can
fetch the asset. Copy the bytes into your own storage on sync and serve from there.

Also needs the consistency check flagged in 4.6: if both `Client` and `Project` are
set and the project belongs to a different client, quarantine the row rather than
guessing which is authoritative.

## Client Docs

The seventh data source, added after the six original portal databases. Portal-native:
no `BridgeDirection`, `BrainPageId` or `Promote to Brain`, because these documents are
client-facing and have no reason to travel to Second Brain.

| Property | Tier | Note |
|---|---|---|
| Title | CLIENT | |
| Summary | CLIENT | shown in the portal doc list |
| Doc Type | CLIENT | drives icon and grouping |
| Order | CLIENT | display sequence |
| **Page body content** | CLIENT | see rules below |
| Client | SERVER | scoping |
| Project | SERVER | scoping |
| External ID | SERVER | |
| Status | SERVER | gate input |
| Source | SERVER | |
| LastBridgedAt | SERVER | |
| Publish to Warehaus | NEVER | gate input |

`Status` = Published and `Publish to Warehaus` = true are both required. Two
conditions rather than one gives these documents a real draft state — you can leave
a half-written brief sitting in the database without it appearing in a client's
portal.

## Client Docs — page body content

This is the only database whose **page body** is read. Every other database in the
workspace contributes properties only.

Rules for the renderer:

1. **Block-type allowlist.** Convert only: headings, paragraphs, bulleted and
   numbered lists, to-dos, tables, images, code, quotes, callouts, dividers.
   Everything else is dropped silently.
2. **Never traverse child pages.** If a doc contains a nested page, drop the block.
   Do not render it, do not link to it, do not follow it. The seven template docs are
   deliberately flat — tables and headings, no nesting — so this rule costs nothing
   today and prevents the failure mode entirely.
3. **Never render synced blocks.** A synced block can mirror content from anywhere
   in the workspace, including Second Brain, and looks identical to native content.
   Drop them.
4. **Strip mentions and internal links.** `@`-mentions of pages or people, and inline
   links to `notion.so` / `notion.com` URLs, become plain text. A mention leaks a page
   title even when the target is inaccessible.
5. **Never fetch comments.** Notion page comments are internal discussion.
6. **Images** get copied to your own storage and served signed, same as
   `Shared Resources` files.

A dropped block should increment a counter surfaced in the sync log. If someone
writes a doc that renders as half its intended content, that counter is the answer.

## Activity — direction inverted

Per decision D4, Activity becomes Convex-native. Events are written to Convex by the
app; Notion is not a source for this table.

That means **no field in Activity is CLIENT or SERVER** in the sync-in sense. The flow
reverses: a scheduled job writes a periodic digest *into* Notion for internal review.

What goes into that digest: `Name`, `Summary`, `Type`, `Timestamp`, `Client`,
`Project`. The `sync` and `exception` event types are operational noise and should be
aggregated to counts rather than written as individual rows — those are the events
that would otherwise blow the rate limit.

Client-facing activity feeds read from Convex directly, never from this table, and
must filter to `Type` in (`project`) — `team`, `sync` and `exception` are
internal by definition.

---

## Decisions — resolved

1. **`Stack`** → CLIENT. Shown to clients by default.
2. **`Figma Link`** → CLIENT. Shared by default.
3. **`Docs URL`** → CLIENT. Shared by default. *See "Documents" below — this
   answer implies more than a field flip.*
4. **`Owner/DRI`** → remains NEVER. It's a Notion person property, so the value is a
   Notion user ID; showing "your team" requires mapping Notion users to display
   records first. Deferred, not rejected.
5. **Task visibility** → tasks are client-visible with minimal fields, as drafted.
   *The "editable" half of this is unresolved — see "Client writes" below.*

---

## Open: client writes

Tiers in this document describe a **read** path: Notion → Convex → client. Two of the
answers above introduce a **write** path from the client, which the model does not yet
cover.

A field being CLIENT-readable says nothing about whether a client may change it.
Write permission is a fourth, independent designation.

The architectural constraint from earlier still holds: **client writes never
round-trip into Notion.** Notion has no permission boundary you can safely expose to
external users, and every client write against the Notion API burns from a ~3 req/sec
budget shared with your own syncing. Client writes land in Convex. What you see in
Notion, if anything, is a digest — the same pattern as Activity.

### Editable tasks

"Minimal fields editable" needs pinning down, because the obvious candidates are
mostly wrong:

- **`Status`** — a client moving a task to Done overwrites your team's judgment about
  whether it's actually done. Almost certainly not this.
- **`Name`, `Date`, `Is Done`** — same problem, worse.

What clients usually need is not to *edit a task* but to *attach something to one*:
approve it, reject it with a reason, or leave feedback. Those are separate records
that reference a task, not mutations of it — which keeps the task itself
single-writer and makes the client's action auditable and reversible.

**Recommendation:** no task field is client-writable. Add a Convex-native
`TaskResponse` entity (task ref, contact ref, type: approve / request-change /
comment, body, timestamp). The portal renders it inline under the task; your team
sees it in the admin view.

If you genuinely want direct field edits, say which fields and I'll model the
write-permission column properly — but I'd want to understand the workflow first.

### Asset upload and download

Two directions that need separating:

**Warehaus → client** (download). Already covered: `Shared Resources`, gated by
`Publish to Warehaus`. One change needed — copy file bytes into your own storage on
sync and serve signed URLs. Notion's file URLs are time-limited *and*
unauthenticated; anyone holding one can fetch the asset.

**Client → Warehaus** (upload). Not currently modelled anywhere. Client uploads
should go to Convex + object storage, never to Notion. They need their own entity
rather than reusing `Shared Resources`, because provenance matters: a file your team
published and a file a client dropped in have different trust levels and different
review requirements. Uploads should also carry a virus-scan status and a review flag
before anyone on your side opens them.

---

## Resolved: documents

Built. `Client Docs` exists under Warehaus Portal as the seventh data source, with
the seven-document template populated for Sugar Shark, Syzygy Labs, KEPM,
Tome / Nexus and AimCase Law — 35 documents, all Draft, none published.

Warehaus Internal was deliberately excluded: an internal project has no client to
serve.

Client docs are **read-only in the portal**. Only the Warehaus team edits them, in
Notion. No client ever touches the Notion workspace, and no Notion guest accounts
are involved. This keeps a single identity system (Better Auth) and keeps the portal
the only surface clients use.

Field tiers and content rules are specified above.

**The boundary is now seven data sources, not six.** This appears in the worker spec
and the CI test:

| # | Data source | Collection ID |
|---|---|---|
| 1 | Clients | `5165ca6e-352e-45af-8918-98779fd76e61` |
| 2 | Projects | `39947c31-d003-4125-9c32-5e570d4c7e0e` |
| 3 | Tasks | `f418e8e8-6470-4e12-8207-b45b8ae6d8a5` |
| 4 | Contacts | `b8e25824-c184-448f-a4fd-32fbf03b3c8a` |
| 5 | Shared Resources | `7215c759-e91b-4fd3-b90d-ac834e5435fc` |
| 6 | Activity | `d9e9c053-dec7-415b-bb06-ff3f6b71538f` *(write-only, see above)* |
| 7 | Client Docs | `50f364f7-9162-4226-9a01-53464052fd19` |

Anything not in this list is out of bounds — including `Project Ops`
(`74122728-5f56-4fa0-89fb-1bed8a70148c`), which lives under Second Brain and holds
the Areas, Notes, Resources and Granola Notes links that were removed from Projects.

---

## Implementation notes

- The map lives in one file, is the only place tiers are defined, and is imported by
  both the sync worker and the Convex query wrappers. Two copies will diverge.
- CI test: for each database, assert every property currently in the Notion schema
  appears in the map. A new Notion property fails the build rather than silently
  syncing or silently vanishing.
- CI test: assert no CLIENT-tier query returns rows for an org the caller doesn't
  belong to. Use Sugar Shark as the fixture — it's the row with real Brain history.
- Log every dropped property once per sync run at debug level. When someone asks why
  their new field isn't showing up, that log is the answer.
