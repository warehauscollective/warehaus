# ADR-0001: Milestone runner pipeline

Status: Accepted, as reported. The session "Milestone-to-agent workflow sync" reported on 2026-11-21 that Peter approved the six decisions below in its chat. The session that wrote this file did not hear the approval itself. Peter confirms or corrects this record when he reviews the pull request.

## Context

A milestone holds an ordered task list. The runner is a CLI on a staff Mac. It claims the next piece of milestone work from the Portal, opens the official `claude` CLI on the milestone branch, pushes the commit, and reports back. The Portal and Convex hold no model key and make no model call.

Code: `tools/runner/`, `apps/portal/convex/agent.ts`, `apps/portal/convex/agentHttp.ts`, `apps/portal/convex/_lib/agentRun.ts`.

## Decisions

1. **The preview is a local Mac build.** `npm run preview:pr -- milestone/<slug>` against shared dev `graceful-mastiff-960`. Never Vercel.
2. **One branch, one pull request.** Every task commits to `milestone/<slug>`. Each milestone has one pull request. It merges only after Peter approves.
3. **Every milestone created with no tasks is planned**, whatever created it: the Portal, Grok Bot, Claude, or anything else. A bot that sends its own task list skips planning.
4. **Each project has an agent setting**: its repository (GitHub owner and name) and its tool (`claude_code` or `cursor`). Ship Studio and the Claude CLI count as `claude_code`. A runner says which projects or repositories it serves, and a claim only hands it those.
5. **A milestone has at most one running task run.** A claim skips a milestone that already has one, so two runners never push to the same branch.
6. **Stuck work is released or surfaced.**
   - A run whose runner has been quiet for 30 minutes is released: the run is cancelled, the task goes back to To do, and the claim is cleared. A bounded, indexed cron does this.
   - A blocked task posts a notice to Peter in Grok Bot.

## The Ready to Ship hand-off

When the last task is done and the milestone moves to Ready to Ship, the runner:

- opens the milestone's pull request if there is none
- attaches the pull request number and the local preview to the milestone
- sends the approval request to Grok Bot

## What is built, and what is not

Built on the runner branches:

- Decision 2: the runner commits to `milestone/<slug>`, opens the one pull request after a push, and never merges it.
- Decision 3: both create paths queue a planning job when a milestone has no tasks.
- Decision 5: a claim skips a milestone with a running task run.
- Decision 6, first part: `agent.releaseStuckRuns`, on a 10 minute cron, reading at most 25 running runs through an index.
- A local preview unlocks Approve. The review-preview route takes `op: local` to store the link by milestone id or branch.
- The run feed names open tasks that are waiting on a person.

Not built yet:

- Decision 1 is not fully applied. Peter chose "both previews" on 2026-11-20 and the review card shows a local block and a Vercel block, and the Vercel webhook stores a branch preview. Decision 1 reverses that. The Vercel block and webhook path are still in the code until Peter confirms which one stands.
- Decision 4: no per-project agent setting, and a claim is not filtered by project or repository.
- Decision 6, second part: a blocked task does not post to Grok Bot. The Portal has no outbound path to Grok Bot today.
- The hand-off's approval request to Grok Bot, for the same reason. `preview:pr` does not yet post the local preview link itself.

## Consequences

- A milestone in Building makes progress only while a runner is online.
- A task that syncs from Notion is never claimed. It still counts toward "all tasks done", so it holds the milestone in Building until a person closes it. The run feed names it.
- Shipped is still set only when the pull request merges into `main`.
- Merging does not deploy. Production still needs Peter's explicit "deploy main".
