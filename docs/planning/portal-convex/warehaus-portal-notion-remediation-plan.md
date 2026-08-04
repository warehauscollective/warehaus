# Warehaus Portal — Notion Remediation Plan

**Workspace:** Warehaus · **Space:** Warehaus Portal
**Prepared:** 3 August 2026
**Status:** Awaiting approval

---

## Purpose

Bring the six Warehaus Portal databases to a state where they can safely act as the
authoring layer behind a client-facing portal, without leaking internal content and
without breaking when real data arrives.

Nothing in this plan is executed until you approve it. Phase 0 items are decisions
only — they block later phases.

---

## Architectural assumptions

This plan assumes the following. If any of these are wrong, tell me before approving,
because several items depend on them.

| # | Assumption |
|---|---|
| A1 | Convex becomes the system of record for anything a client reads. Notion is an authoring surface that writes *into* Convex. |
| A2 | Billing, invoices, balances and contract terms never live in Notion. They come from Stripe via webhook. |
| A3 | The sync boundary is a fixed allowlist of the six Warehaus Portal data sources. Nothing outside it is ever traversed. |
| A4 | `Publish to Warehaus` is the publish gate. Default off. Unchecked means invisible to the portal. |
| A5 | Notion page ID is the join key of record; `External ID` and `Slug` are secondary keys owned by the app. |

---

## Phase 0 — Decisions required from you

These block Phases 2 and 3. No changes are made until they're settled.

### D1. Brain relations on Portal Projects — **highest consequence**

Portal Projects currently relates out to five Second Brain data sources: `Areas`,
`Notes`, `Resources`, `Granola Notes`, and Brain `Tasks`. Portal Tasks relates to Brain
`Notes` and `Resources`.

Sugar Shark already has three Granola Notes attached — raw meeting transcripts.

Choose one:

- **Option A — Sever.** Remove the five Brain relations from Portal Projects and two
  from Portal Tasks. Cleanest boundary; you lose the in-Notion convenience of jumping
  from a portal project to its meeting notes.
- **Option B — Keep, allowlist-enforced.** Relations stay for your internal use. The
  sync worker refuses to traverse them. Convenience preserved; safety depends entirely
  on code discipline holding forever.
- **Option C — Split the record.** Portal Projects stays lean and client-safe. A
  separate internal "Project Ops" record in the Brain holds the Areas/Notes/Granola
  links and points back via `BrainPageId`. Most work, strongest separation.

*My recommendation: C if you're willing to spend the time, B otherwise — but B only if
item 2.1 (the allowlist test) is treated as non-optional.*

### D2. Which Tasks database is canonical for portal projects?

Portal Tasks (`f418e8e8`) and Brain Tasks (`ea0ffd60`) are near-duplicates. Options:
Portal Tasks canonical (my recommendation), Brain Tasks canonical, or keep both with an
explicit bridge. Answer determines items 1.3 and 1.4.

### D3. Auth provider for Contacts

Contacts is the portal identity table. Which provider issues the ID it joins on —
Clerk, WorkOS, Better Auth, other? Answer determines the field name and format in 3.1.

### D4. Does Activity stay in Notion?

It's an append-only event log inside a 3 req/sec store. Recommendation: Activity becomes
Convex-native; Notion keeps at most a summarized weekly view. Confirm or override.

---

## Phase 1 — Structural integrity

These are the changes that make the data model actually work. All are reversible except
where noted.

### 1.1 Make `Projects.Client` a two-way relation
**Change:** Alter `Projects.Client` to DUAL, creating a `Projects` property on Clients.
**Why:** The portal's authorization query is "projects where Client = me." One-way means
Clients has no back-link, so no traversal from client, no project rollups, no admin
dashboard counts.
**Risk:** None. No existing links to break.
**Executed by:** Me.

### 1.2 Backfill `Client` on all six projects
**Change:** Link Warehaus Website, Sugar Shark, Syzygy Labs, KEPM Website, Tome / Nexus
and AimCase Law to their client rows.
**Why:** All six are currently null. Nothing works until this exists.
**Risk:** I may guess wrong on mappings — I'll propose them for confirmation rather than
assume. Warehaus Website and possibly Tome / Nexus look internal and may need an
"internal" client row or no link at all.
**Executed by:** Me, after you confirm the mapping.

### 1.3 Resolve the duplicate Tasks databases
**Change:** Per D2. If Portal Tasks is canonical: repoint `Projects.Tasks` from
`ea0ffd60` to `f418e8e8` and make it the inverse of `Tasks.Projects`.
**Why:** They are currently two unrelated one-way relations to different tables.
**Risk:** Repointing a relation drops existing links. Currently zero, so free now —
expensive later.
**Executed by:** Me.

### 1.4 Repoint the `Progress` rollup
**Change:** Point `Progress` at the canonical Tasks relation from 1.3.
**Why:** It currently aggregates Brain Tasks' completion checkbox. Project progress shown
to a client would be computed from the wrong task set. Reads as empty today only because
`Tasks` is null everywhere — it fails silently the moment anyone populates it.
**Risk:** None.
**Executed by:** Me.

### 1.5 Fix Status groups on both Tasks databases
**Change:** Move `In Progress` into the in_progress group and `Done` into the complete
group. `Inbox` and `Backlog` stay in to_do.
**Why:** All four options currently sit in to_do, so Notion believes nothing is ever in
progress or complete. Breaks board grouping and every downstream "is done" check.
**Risk:** None. Group membership carries no data.
**Executed by:** Me.

### 1.6 Resolve the duplicate completion signal
**Change:** Designate Status as canonical. Rename the ` Complete` checkbox (note the
leading space in the property name) to `Legacy Complete`, or drop it.
**Why:** Two independent sources of truth for "is this done," and the leading space will
break API code that looks up the property by name.
**Risk:** Dropping loses data. Renaming does not — I'll rename unless you say otherwise.
**Executed by:** Me.

---

## Phase 2 — The sync boundary

### 2.1 Allowlist enforcement *(built in code, not Notion)*
**Change:** The sync worker accepts exactly six collection IDs. Any relation pointing
outside that set is not traversed, and the worker logs a violation rather than following
it. A CI test asserts a published project with a Granola Note attached produces zero
Brain content downstream.
**Why:** This is the control that prevents meeting transcripts reaching clients. It is
the single most important item in the plan.
**Executed by:** You / your team. I can write the worker and the test.

### 2.2 Apply the D1 decision
**Change:** Per your Phase 0 answer — sever, annotate, or split.
**Executed by:** Me (A or B) / joint (C).

### 2.3 Field-level allowlist
**Change:** Define, per database, the exact list of properties that cross to Convex.
Everything else is structurally excluded. Draft to follow for your review.
**Why:** Database-level gating isn't enough — internal free-text fields sit inside
otherwise-syncable rows.
**Executed by:** Me (draft) → you (approve).

### 2.4 Staleness detection
**Change:** `lastSyncedAt` per record in Convex, plus an alert when the newest sync
timestamp exceeds threshold.
**Why:** The dangerous failure isn't a loud error — it's the sync dying quietly while the
portal keeps serving plausible-looking stale data.
**Executed by:** You / your team.

---

## Phase 3 — Contacts as an identity table

Contacts currently has no `External ID`, no `Source`, no bridge fields, no publish gate,
no role, no portal flag, and no auth ID — despite being who actually logs in.

### 3.1 Add identity fields
**Change:** Add `External ID` (text), `Auth User ID` (text, per D3), `Role`
(select: Client Admin / Client Member / Warehaus Staff), `Portal Access`
(select: Enabled / Disabled, default Disabled).
**Risk:** None — additive.
**Executed by:** Me.

### 3.2 Mark internal fields
**Change:** Rename `Notes` → `Internal Notes`. Rename `Description` → `Internal
Description` or exclude it at the field allowlist.
**Why:** Free-text internal commentary sitting in the identity table with nothing marking
it non-syncable.
**Risk:** None — rename preserves data.
**Executed by:** Me.

### 3.3 Bridge convention parity
**Change:** Add `Source`, `Publish to Warehaus`, `LastBridgedAt` to match the other five
databases.
**Why:** Contacts is the only portal database outside the convention, so it's the one
your tooling will forget about.
**Executed by:** Me.

---

## Phase 4 — Hygiene and normalization

### 4.1 Backfill `Slug` on all 12 clients
Currently null everywhere. Format: lowercase-hyphenated from Company Name. I'll propose
values for confirmation. **Me.**

### 4.2 Backfill `External ID`
Null in every table. Needs a scheme — recommend `wh_cli_*`, `wh_prj_*`, `wh_tsk_*`,
`wh_con_*`. Confirm or supply your own. **Me, after you confirm the scheme.**

### 4.3 Merge duplicate client rows
"Vidi Global" and "Vidi Global — Christina Arriola" are one company across two rows —
Christina belongs in Contacts. Client titles should be company names only. **Me, after
you confirm the merge.** *Note: merging is destructive; I'll show you exactly what
moves where first.*

### 4.4 Fix nulls on Sugar Shark
`Status` and `Portal access` are null. Set explicit values and make both required, so the
portal never branches on undefined. **Me.**

### 4.5 Normalize Priority values
Projects uses `High / Med / Low`; Tasks uses `🔴 High / 🟠 Medium / 🟡 Low`. Normalize both
to `High / Medium / Low`. Emoji in enum values are painful to match and render.
*Renaming a select option preserves row values.* **Me.**

### 4.6 Shared Resources cleanup
Fix the `Descriptioin` typo; add `External ID`; add a Files property so assets can live
in Notion rather than only as URLs; add sync-time validation that `Client` and `Project`
agree (nothing currently stops a resource pointing at Client A and a project owned by
Client B). **Me** (schema) / **you** (validation rule).

### 4.7 Rename `Status 1` → `Status` on Portal Tasks
Leftover default name. **Me.**

---

## Phase 5 — What gets built in code

Out of scope for Notion changes; listed so the plan is complete.

1. Notion API webhook receiver → queue → worker → Convex upsert
2. Incremental cron backstop for missed webhook deliveries
3. Convex schema with `orgId` leading every tenant-scoped index
4. `clientQuery` / `adminQuery` wrappers so no public function reaches raw `ctx.db`
5. Cross-tenant isolation test in CI
6. Stripe webhook → Convex for all billing surfaces
7. Convex-native Activity log (per D4)

---

## What I will not do without separate, explicit approval

- Delete any property or database
- Delete or merge any page (4.3 will be proposed, not executed)
- Write to anything outside the six Warehaus Portal data sources
- Touch the Second Brain space in any way
- Modify sharing, permissions, or connector access

---

## Approval

Reply with:

1. **D1** — A, B, or C
2. **D2** — which Tasks database is canonical
3. **D3** — auth provider
4. **D4** — Activity stays in Notion, or moves to Convex
5. Any items to strike from Phases 1–4

On approval I'll work through Phase 1 one item at a time and report after each, so you
can check the workspace before I continue.
