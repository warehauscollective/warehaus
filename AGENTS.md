# Warehaus agent instructions

Heading font: **Eurostile**. The brand block in `CLAUDE.md` stays as written.

## Milestone Build Protocol

Standing rule. Approved by Peter in Grok Bot (Portal room), 2026-11-17, 11:46 AM ET. Source: Notion task "Protocol: milestone-first builds with local Mac preview" and the Milestone Build Protocol SOP under Build Protocol - Idea to Shipped.

Every plan or feature follows this. Cursor agents, Claude agents, and Grok bots use the same rule.

### Work

- Every change belongs to a Portal milestone, or a task inside one. Nothing is coded without that link.
- The pull request names that task.
- Design tasks come first, in Dark and Light at 1440 and 390. The Figma screens and the spec are tasks before any build task. Peter approves the plan and the design in Grok Bot or the Portal before build starts.
- Post dev updates on the milestone: the next action and the pull request link.
- Product Design Lead checks the build against Figma from screenshots (Dark and Light, desktop and phone) and posts pass or fixes on the milestone. Then Peter opens the build.
- Peter's feedback becomes iteration tasks in the same milestone ("Iteration N: …"). If the design changes, Product Design Lead updates Figma first so Figma and the build match. Rebuild and preview again on his Mac.

### Milestone status

- A milestone has one field, Status: Idea, Planning, Awaiting Go, Building, Ready to Ship, Shipped, Parked.
- Every status write goes through `transitionMilestone()` in `apps/portal/convex/_lib/milestoneStatus.ts`.
- Staff can set Shipped when every task that is not Parked is Done. The play button never moves to Shipped.
- The play button moves one step: Idea, Planning, Awaiting Go, Building, Ready to Ship. No play on Ready to Ship, Shipped, or Parked.
- Approval is not a status. It is the review result. Approve unlocks when Status is Ready to Ship and a preview is attached. Request changes moves Status back to Building.
- The staff API and MCP return and accept `status`. `stage` and `workStatus` are aliases for one release.

### Preview

- There are two previews. Peter always approves from the local one. Decided by Peter, 2026-11-20 and 2026-11-21.
- Local: a build on his Mac against shared dev Convex `graceful-mastiff-960`. This is the link in every approval request.
- Vercel: a branch preview for staff only. It is never the link Peter is asked to approve from. It also runs against shared dev Convex.
- Never production Convex `unique-turtle-383`, for either preview.
- On his Mac, from the repo root: `npm run preview:pr -- <branch>`.
- That command fetches and checks out the branch, installs dependencies, and starts the portal dev server. It prints the localhost URL (port 3100 unless `PORTAL_PORT` is set).
- It refuses to start if the Convex URL is production: `unique-turtle-383`, a `prod:` deployment, a Vercel host, or any other Convex host that is not shared dev `graceful-mastiff-960`.
- It does not start `convex dev` and does not push Convex functions. Do not leave a `convex dev` process running for a preview.
- Send the localhost link and the approval request in Grok Bot chat. He can approve or request changes there or in the Portal.

### Approval

- Nothing merges, and nothing goes live, until Peter approves in Grok Bot chat or the Portal.
- Peter never approves in Notion. He does not give the OK in Notion, and he does not interact with Notion directly.
- Agents record his decision in Notion and the Portal on his behalf, with the date and where he said it. Notion is the agents' back office.
- After that approval, the code can merge and the milestone can close. Merging does not deploy. A production deploy still needs Peter's explicit "deploy main", from `main` only.

### Convex

Keep Convex usage low: indexed reads, bounded pagination, no whole-table scans, skip no-op writes, no lingering `convex dev`.

Do not target production `unique-turtle-383`. Do not pass `--prod`. Do not run `npx convex deploy`. Cloud agents do not run `npm run dev:local`, `npm run dev:convex`, or `npx convex dev`.

### Open item

Shared dev still uses the production Notion token. A local preview that writes can touch the real Warehaus Notion. The test Notion spec is coming. Until that exists, treat a preview write as a write to live Notion.

## Design source

One Figma file holds every Portal design: [Warehaus Studio](https://www.figma.com/design/TS3DcaCgrIdYf0jhvnMy3k/Warehaus-Studio?node-id=689-31057) (file key `TS3DcaCgrIdYf0jhvnMy3k`). Read it through the Figma connector before building or changing a screen.

| Portal tab | Figma page | Link |
|---|---|---|
| Dashboard | Portal - Dashboard | [689:31056](https://www.figma.com/design/TS3DcaCgrIdYf0jhvnMy3k/Warehaus-Studio?node-id=689-31056) |
| Projects (project, milestone and task pages) | Portal - Projects | [689:31057](https://www.figma.com/design/TS3DcaCgrIdYf0jhvnMy3k/Warehaus-Studio?node-id=689-31057) |
| Resources | Portal - Resources | [689:31058](https://www.figma.com/design/TS3DcaCgrIdYf0jhvnMy3k/Warehaus-Studio?node-id=689-31058) |
| Activity | Portal - Activity | [689:31059](https://www.figma.com/design/TS3DcaCgrIdYf0jhvnMy3k/Warehaus-Studio?node-id=689-31059) |
| Account | Portal - Account | [689:31060](https://www.figma.com/design/TS3DcaCgrIdYf0jhvnMy3k/Warehaus-Studio?node-id=689-31060) |
| Core / Components (the component library) | Portal - Component Library | [151:5387](https://www.figma.com/design/TS3DcaCgrIdYf0jhvnMy3k/Warehaus-Studio?node-id=151-5387) |

- Sign-up and invite screens are on Portal - Onboarding (`689:31055`). The two Archive pages are history: do not build from them.
- The file follows the Figma protocol in `docs/design/figma-protocol.md` (ADR-0006). Read it before editing the file. In short:
  - The library is Atoms, Molecules and Organisms. An organism only one tab uses lives in that page's Local components until a second tab needs it.
  - Components carry the states. A state is a variant in the component set, never its own screen. One canonical screen per view, built from instances only.
  - Each screen is 1440 Dark and 390 Dark, hand built and made components, plus 1440 Light and 390 Light as instances on the Light variable mode.
  - Each tab page has one section per screen (SCREEN and OVERLAYS rows), then Local components, then Exploration for options and proposals.
- Iterate in place: change the screen or the component, then save a named Figma version (`<Milestone> - iter <N>`). Do not start a new page, a new file, or a parallel copy of a screen, and do not publish the library. Old frames move to Archive, never deleted, and every move goes in `docs/design/figma-id-map.md`.
- A component comes from Portal - Component Library or the page's Local components. If a screen needs one that is not there, Product Design Lead adds it to the right tier first.
- Design comes first (see Work above): Dark and Light at 1440 and 390, approved by Peter before build. The approval request links the changed component sets and the one canonical screen. If a build shows the design is wrong, the component or frame is updated first, then the code.
- Copy in the build matches the frame, character for character. When the two differ, say so on the milestone. Do not pick one quietly.


## Testing Convex handlers

Test a Convex function through its real handler, against the in-memory ctx in `apps/portal/convex/_lib/memoryCtx.testkit.ts`. Do not build a fake `db` in a test file.

```ts
const t = memoryCtx();
const orgId = t.seed('clients', { /* a full, valid row */ });
const result = await t.call(advance, { milestoneId, expectedStatus: 'Building' }, { as: 'staff' });
assert.equal(t.row(milestoneId)?.status, 'Ready to Ship');
```

- `call(fn, args, { as, respond })` runs a query, mutation or action handler. `as` is `'staff'`, `'peter'`, `'client'` or `{ authUserId }`, and seeds that contact. No `as` means signed out. `callHttp(fn, request, { respond })` runs an `httpAction` with an action ctx. Do not reach for `fn._handler`.
- What it enforces, as Convex does:
  - A `withIndex` names an index in `schema.ts`, and its `eq` fields are a leading prefix of that index.
  - Arguments match the function's `args` validator. Every seeded or written row matches its table in `schema.ts`.
  - Ids are table scoped. `unique()` throws on two rows. A write to a missing row throws.
  - A handler that throws leaves no write and no scheduled call behind.
- What it records, without running or refusing:
  - `t.scheduled`: scheduler calls, by function name.
  - `t.runs`: `runQuery`, `runMutation` and `runAction` calls. An action test answers them with `respond`. A call into a component, such as Better Auth's `adapter.findOne`, is named by its reference path.
  - `t.reads`: every query read, with the `limit` of a `take` or a page. `t.reads.unbounded()` lists `.collect()` and async iteration, and `t.reads.unindexed()` lists reads with no index. A test on a path that should be bounded asserts both are empty. `t.reads.gets` lists every id passed to `db.get`, so a test can prove a row was never read.
- Do not loosen the adapter to make a test pass. If a moved test fails because the code breaks a rule, fix the code when the fix is small. Otherwise add an iteration task to the milestone and mark the test `todo` with the reason.
- Source text checks (`readFileSync` plus a regex on a source file): keep one only when it proves something is absent, such as no client read of agent tables, no `notionOutbox` write from a detail mutation, or no direct Notion write outside the Notion client. A check that some call or name is present is a behaviour test waiting to be written. Replace it with one through `call`.
- Convex skips any file whose name has more than one dot, so `*.testkit.ts` never deploys.
