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
- Staff can set any status except Shipped. Shipped is set when the pull request merges, never by hand.
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
