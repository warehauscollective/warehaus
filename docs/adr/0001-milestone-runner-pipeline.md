# ADR-0001: Milestone runner pipeline

Status: Accepted, Peter, 2026-11-21.

Peter approved the first six decisions in the session "Milestone-to-agent workflow sync" on 2026-11-21, then answered the open questions there: "yes to all, go with your recommendations". He confirmed the resulting five points directly in the build session the same day, with "No merge, no deploy."

## Context

A milestone holds an ordered task list. The runner is a CLI on a staff Mac. It claims the next piece of milestone work from the Portal, opens the official `claude` CLI on the milestone branch, pushes the commit, and reports back. The Portal and Convex hold no model key and make no model call.

Code: `tools/runner/`, `apps/portal/convex/agent.ts`, `apps/portal/convex/agentHttp.ts`, `apps/portal/convex/_lib/agentRun.ts`.

The wire rules both sides share (routes, plan size, task outcomes, branch shape, the runner's HTTP client) live in `packages/runner-protocol`, a plain ESM package the runner imports with no build.

## Decisions

1. **Two previews. Peter approves from the local one.** Local is `npm run preview:pr -- milestone/<slug>` on his Mac against shared dev `graceful-mastiff-960`. It is the link in every approval request. The Vercel branch preview is for staff only and is never the link he is asked to approve from. Neither ever points at production `unique-turtle-383`.
2. **One branch, one pull request.** Every task commits to `milestone/<slug>`. Each milestone has one pull request. It merges only after Peter approves.
3. **Every milestone created with no tasks is planned**, whatever created it: the Portal, Grok Bot, Claude, or anything else. A bot that sends its own task list skips planning.
4. **A project names its repository, and a runner names the repositories it serves.** `projects.agentRepo` is a staff-only `owner/name`. A claim skips a project with none, and skips a project the runner does not serve. This is the fail-safe version. A per-project settings screen, with the tool choice, is the next task.
5. **A milestone has at most one running task run.** A claim skips a milestone that already has one, so two runners never push to the same branch.
6. **Stuck work is released or surfaced.**
   - A run whose runner has been quiet for 30 minutes is released: the run is cancelled, the task goes back to To do, and the claim is cleared. A bounded, indexed cron does this.
   - A blocked task leaves a "needs Peter" note.
7. **No new outbound path to Grok Bot.** The Portal writes a "needs Peter" note on the milestone. Grok Bot reads open notes through the staff API (`GET /api/v1/milestones/needs-peter`, MCP tool `list_needs_peter`): one indexed read, at most 20.
8. **Claude Code only for now.** The runner starts only the `claude` CLI. Ship Studio and the Claude CLI count as `claude_code`. Cursor comes later.

## The Ready to Ship hand-off

When the last task is done and the milestone moves to Ready to Ship:

- the runner has already opened the milestone's pull request after its first push, and reported the link
- the Portal stores the local preview link on the milestone, so Approve unlocks without anyone attaching it by hand
- the Portal writes a "needs Peter" note with the pull request, the local preview command and link, and the approval line

The note closes when Peter approves or requests changes. A blocked-task note closes when that task is done.

## Where the Vercel preview points

Checked on 2026-11-21, read only, in the repository. Vercel's own project settings were not opened.

- `apps/portal/vercel.json` sets `git.deploymentEnabled` to `false`, so a push does not build the portal on Vercel.
- `apps/portal/scripts/vercel-ignore-build.mjs` skips every build unless `REVIEW_PREVIEW=1`, which only the review-preview workflow sets.
- That workflow's build environment comes from `reviewDeploymentBody` in `apps/portal/convex/_lib/reviewPreview.ts`. It sets `NEXT_PUBLIC_CONVEX_URL` from `assertReviewConvexUrl`, which refuses any URL containing `unique-turtle-383` and any host other than shared dev `graceful-mastiff-960`.
- The route that stores a review preview, `reviewPreviewHttp`, returns 403 unless the deployment it runs on passes the same check.

So a portal preview built through the repository's own path can only point at shared dev. What this does not cover: environment variables set by hand in the Vercel dashboard for the Preview environment. A build started outside the workflow would use those.

One consequence for the Vercel webhook path in this stack: because push builds are off, "a finished build of a milestone branch" only happens when the review-preview workflow runs for that branch.

## What is built, and what is not

Built:

- Decisions 2, 3, 5, 6, 7 and 8.
- Decision 4 in its fail-safe form: the field, the staff mutation `projects.setAgentRepo`, the claim filter, and the runner's required `--repo`. The runner also checks that the checkout it runs in is that repository.
- The hand-off above.

Built since (checked against the code on 2026-11-24):

- The staff screen to set a project's repository (`ProjectRepoSetting` on the project page).
- The per-project build agent choice, Claude Code or Cursor (`AgentDriverSetting`).
- Cursor: one cloud agent per milestone on the milestone branch.
- Decision 4's runner allowlist is replaced by runner registrations: a registered runner serves every project that names a repository, in its own clone (ADR-0005, amendment).

Not built:

- `preview:pr` does not post its own link. The hand-off stores `http://localhost:3100/`, which is where `preview:pr` serves unless `PORTAL_PORT` is set.

## Consequences

- A milestone in Building makes progress only while a runner that serves its repository is online.
- A project with no repository setting gets no runner work at all, including planning. Its milestones wait.
- A task that syncs from Notion is never claimed. It still counts toward "all tasks done", so it holds the milestone in Building until a person closes it. The run feed names it.
- A merge ships a milestone only when every task that is not Parked is Done, subtasks included. Peter decided this on 2026-11-22 at 3:20 PM ET. Staff set Shipped through the same gate (#128). The play button and the runner never move a milestone to Shipped.
- Merging does not deploy. Production still needs Peter's explicit "deploy main".

## Amendment, 2026-11-22

Peter gave the go for auto-planning and agent choice at 4:40 PM ET. These points replace the matching lines above where they differ.

- A milestone enters Planning with no tasks from the Portal, `update_milestone`, or `create_milestone` without tasks. That queues one planning run. The same milestone and iteration does not queue a second one. A milestone that already has tasks is skipped unless staff press Regenerate.
- The planner is Claude Code, read-only. It posts 3 to 10 tasks with origin `planner`. The milestone stays in Planning.
- Staff pick the build agent per project, next to the repository: Claude Code or Cursor. Planning still uses Claude. Cursor launches one cloud agent per milestone on the milestone branch. `CURSOR_API_KEY` stays on the runner.
- A failed or stuck run is blocked, shows its reason, and appears in `list_needs_peter`. Staff retry it. It is not put straight back in the queue.
- Both agents share one pull request, the local preview note, and Ready to Ship. The staff Vercel preview starts when the pull request is labeled `ready-for-review`, and that preview stays on `graceful-mastiff-960`.
- Building is still set only from the staff UI. The planning, progress, blocked, and agent screens were built from their approved design frames (the milestone loop card); they are no longer stubs (checked 2026-11-24).

## Amendment, 2026-11-24

Peter accepted these in the architecture review on 2026-11-24. They replace the matching lines above where they differ.

- **The Ready to Ship hand-off runs every time a milestone enters Ready to Ship from an earlier status**, not only when the runner finishes the last task. Play, the status menu and the staff API run it too. It stores the local preview link if missing, writes the "needs Peter" note, and adds a feed line. If tasks are still open, the note says how many.
- **Reopening from Shipped is not a hand-off.** Restore, or an undo that lands on Ready to Ship, writes no approval note.
- **Leaving Ready to Ship closes the open approval note**, whatever moved it: a review asking for changes, a staff move back to Building, or Parked. Approve keeps Ready to Ship and still closes the note.
- **Every status change goes through one module**, `convex/_lib/milestoneLifecycle.ts`. It decides the Shipped gate itself from the milestone task set. Mark complete and undo use the same gate in its "no open tasks" form, which allows an empty milestone. No caller tells it the tasks are ready.
