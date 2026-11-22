# Warehaus runner

The runner is a small CLI for a staff Mac. It asks the Portal for the next piece of milestone work, opens Claude Code on the milestone branch, and tells the Portal what happened. The milestone's Activity tab shows the run as it goes.

Claude Code only for now. Cursor comes later.

It has no model API key. It never reads or forwards a Claude sign-in. The only program it starts for model work is the official `claude` CLI, using the sign-in already on the Mac.

## What it does

1. Calls `POST /agent/claim`. The Portal hands back one of:
   - a **planning job**: a milestone made in the Portal with no tasks yet
   - a **task**: the lowest-order To do task on the oldest milestone whose status is Building
   - nothing
2. Makes sure a git worktree exists for the milestone branch, `milestone/<slug>`, in `../warehaus-runner/` beside this repository. A new branch starts from the repository's default branch.
3. Starts `claude` in that worktree with the prompt from `prompts/`.
4. When Claude Code exits:
   - **task**: if there is a new commit, pushes the branch, makes sure the milestone has its one pull request into the default branch (`gh pr create` when there is none), and reports `done` with the commit. With no new commit the task goes back to To do. If Claude wrote `.runner/blocked.txt`, the task is reported `blocked` with that line.
   - **planning**: reads `.runner/plan.json` and posts the 3 to 10 tasks to `POST /agent/tasks`.
5. When the last task on a milestone is done, the Portal moves the milestone to Ready to Ship, stores the local preview link so Approve unlocks, and leaves a "needs Peter" note with the pull request, the local preview command and the approval line. A blocked task leaves a note too. Grok Bot reads open notes with the `list_needs_peter` tool.

Only tasks stored in the Portal are claimed: tasks from the brief, from a change request, or added on the milestone. A task that syncs from Notion is left for a person.

The runner works one task at a time. It commits straight to the milestone branch. It never merges, never closes a pull request, never deploys, and never pushes any branch but `milestone/<slug>`.

When the pull request merges into the default branch, the GitHub webhook moves the milestone to Shipped. Staff can also set Shipped when every task that is not Parked is Done. The runner never sets it.

## Set up

On the Convex deployment, set `RUNNER_TOKENS` to one `id=token` pair per runner, separated by commas. A token has to be at least 24 characters.

```
RUNNER_TOKENS=peter-mbp=<long random token>
```

On the Mac:

```bash
export PORTAL_AGENT_URL=https://<deployment>.convex.site
export RUNNER_TOKEN=<this runner's token>
```

Keep both out of the repository. The production deployment is refused unless `RUNNER_ALLOW_PRODUCTION=1` is set.

To see edits and commands in the run feed while Claude Code works, copy the hooks from `hooks/settings.example.json` into `.claude/settings.json`. The hook sends only a short line, such as `Edited MilestoneReview.tsx`. File contents, command output and the environment stay on the Mac. Outside a runner session the hook does nothing.

## Run

```bash
npm run runner -- start --id peter-mbp --repo warehauscollective/warehaus
```

- `--repo` is required. It is the GitHub repository this runner serves, as `owner/name`. The checkout you run it in has to be that repository. The Portal only hands the runner work for projects whose repository setting matches. A project with no repository setting is never handed to any runner.

- `--mode interactive` is the default. It opens a Claude Code session for you to drive, on your normal plan limits.
- `--mode headless` runs `claude -p` with no session to drive. **This draws on the monthly Agent SDK credit, not your plan limits.** Use it on purpose.
- `--once` does one piece of work and exits.
- `--dir <path>` points at the checkout when you are not in it.

With nothing to do, the runner waits one minute, then longer, up to five minutes between checks.

## Try it end to end

Use shared dev, never production.

1. Connect Grok Bot or Claude to the Portal MCP server (`docs/portal-mcp.md`).
2. Ask the bot to create a milestone with `create_milestone` and a task list. It lands at Awaiting Go.
3. In the Portal, open the milestone and press play on its status to move it to Building.
4. A staff member sets the project's repository once (`projects.setAgentRepo`). Then start the runner: `npm run runner -- start --id <your id> --repo <owner/name> --once`.
5. Work the task in the Claude Code session that opens. Commit. Exit.
6. Open the milestone's Activity tab. The run, the commit and any hook lines are there. The task shows Done with its commit on the Tasks tab.
7. Repeat until every task is done. The milestone moves to Ready to Ship.
8. Open the local preview: `npm run preview:pr -- milestone/<slug>`.
9. Approve in the Portal or in Grok Bot. Approval records the decision. Merge and deploy stay separate steps.

## Dry run log

This section records each dry run of the runner on shared dev.

## Tests

```bash
npm run test:runner
```
