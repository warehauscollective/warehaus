<!-- BRAND-GUIDELINES-START -->
## Brand Guidelines

### Fonts

- **Heading**: Eurostile
<!-- BRAND-GUIDELINES-END -->

## Milestone Build Protocol

Approved by Peter in Grok Bot (Portal room), 2026-11-17, 11:46 AM ET. Canonical writeup: `AGENTS.md`. Cursor rule: `.cursor/rules/milestone-build-protocol.mdc`.

- Every change belongs to a Portal milestone or a task inside one. The PR names that task.
- Design tasks come first, in Dark and Light at 1440 and 390. Peter approves design in Grok Bot or the Portal before build. In the Portal that is the Approve designs button in the tile's Status box; it records the approval and tells the runner build can go ahead.
- Post dev updates on the milestone (next action and the PR link).
- A milestone has one Status (Idea, Planning, Awaiting Go, Building, Ready to Ship, Shipped, Parked). Staff can set Shipped when every task that is not Parked is Done. The play button never moves to Shipped. Approval is the separate review result.
- Product Design Lead checks the build against Figma from screenshots, then Peter previews.
- Two previews. Peter always approves from the local one: a build on his Mac against shared dev Convex `graceful-mastiff-960`. The Vercel branch preview is for staff only and is never the link in his approval request. Never production `unique-turtle-383`, for either.
- On his Mac: `npm run preview:pr -- <branch>`. It prints the localhost URL, refuses a production Convex URL, and does not run `convex dev`.
- Peter's feedback becomes iteration tasks in the same milestone.
- Nothing merges or goes live until Peter approves in Grok Bot chat or the Portal. Peter never approves in Notion. Merging does not deploy. Production still needs his explicit "deploy main", from `main` only.
- Keep Convex usage low: indexed reads, bounded pagination, no whole-table scans, skip no-op writes, no lingering `convex dev`.

Open item: shared dev still uses the production Notion token, so a local preview that writes can touch the real Warehaus Notion. The test Notion spec is coming.

## Design source

Figma file for every Portal design: [Warehaus Studio](https://www.figma.com/design/TS3DcaCgrIdYf0jhvnMy3k/Warehaus-Studio?node-id=689-31057) (file key `TS3DcaCgrIdYf0jhvnMy3k`). Full table and rules: `AGENTS.md`, "Design source".

- One page per Portal tab: Portal - Dashboard (`689:31056`), Portal - Projects (`689:31057`), Portal - Resources (`689:31058`), Portal - Activity (`689:31059`), Portal - Account (`689:31060`).
- Core / Components, the component library: Portal - Component Library (`151:5387`).
- Iterate on existing frames only. No new page, no new file, no parallel copy of a screen, and do not publish the library.
- Figma protocol: `docs/design/figma-protocol.md` (ADR-0006). Atoms, Molecules, Organisms in the library. Components carry the states as variants; one canonical screen per view, built from instances. Hand-build 1440 Dark and 390 Dark only; Light frames are instances on the Light mode. Options go in the page's Exploration section; old frames go to Archive.

## Code graph (graphify)

Local only. Never Graphify Cloud, and no semantic pass over docs or images.

- To find where a symbol is defined or what calls it, run `graphify explain "<symbol>"` from `apps/portal` before grepping. Then read the file it points to before editing.
- Do not use `graphify path` or `graphify query` to trace Convex flows. The graph does not follow `ctx.scheduler.runAfter`, `ctx.runMutation`, `ctx.runQuery` or `ctx.runAction` through `internal.*`, so "no path" proves nothing. Grep for those.
- The graph is not committed. If `apps/portal/graphify-out/` is missing or stale, run `graphify update .` in `apps/portal` (about 6 seconds, no LLM).

## Agent skills

### Issue tracker

Work is tracked as Portal milestones and their tasks, not GitHub Issues. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root, created when the first term or decision is settled. See `docs/agents/domain.md`.
