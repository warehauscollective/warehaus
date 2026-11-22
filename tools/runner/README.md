# Warehaus runner

The runner is a small CLI for a staff Mac. It asks the Portal for the next piece of milestone work, runs the project's build agent on the milestone branch, and tells the Portal what happened. The milestone's Activity tab shows the run as it goes.

A project picks its build agent: Claude Code or Cursor. Planning always uses Claude Code, read-only. Building uses the project's agent.

Claude Code has no model API key here. The runner never reads or forwards a Claude sign-in. The only program it starts for Claude work is the official `claude` CLI, using the sign-in already on the Mac. The Cursor API key, `CURSOR_API_KEY`, lives on this Mac with the runner. It is never set on Convex, Vercel, chat, or Notion, and it is never printed.

## What it does

1. Calls `POST /agent/claim`. The Portal hands back one of:
   - a **planning job**: a milestone in Planning with no tasks, or one a staff member asked to regenerate
   - a **build job**: one Cursor cloud agent for a whole milestone whose project uses Cursor
   - a **task**: the lowest-order To do task on the oldest Claude Code milestone whose status is Building
   - nothing
2. For Claude Code, makes sure a git worktree exists for the milestone branch, `milestone/<slug>`, in `../warehaus-runner/` beside this repository. A new branch starts from the repository's default branch. Cursor works on that same branch in the cloud.
3. Starts the driver. Planning always starts `claude -p` in plan mode and reads the tasks from its stdout. A Claude task starts `claude` in the worktree. A Cursor build posts one cloud agent for the milestone.
4. When the driver finishes:
   - **task**: if there is a new commit, pushes the branch, makes sure the milestone has its one pull request into the default branch (`gh pr create` when there is none), and reports `done` with the commit. With no new commit the task is blocked. If Claude wrote `.runner/blocked.txt`, the task is reported `blocked` with that line. Staff retry a blocked task.
   - **planning**: posts the 3 to 10 tasks to `POST /agent/tasks`. The tasks are marked Planner. The milestone stays in Planning. It does not write a file and it does not commit.
   - **build**: follows the Cursor agent, reads commits that name a task with `Portal-Task: <id>`, and reports them to `POST /agent/build`. The agent link is stored on those tasks.
5. When the last task on a milestone is done, the Portal moves the milestone to Ready to Ship, stores the local preview link so Approve unlocks, and leaves a "needs Peter" note with the pull request, the local preview command and the approval line. The runner then labels the pull request `ready-for-review`, which is what starts the staff Vercel preview against shared dev. A blocked or stuck run leaves a note too. Grok Bot reads open notes with the `list_needs_peter` tool.

Only tasks stored in the Portal are claimed: tasks from the brief, from a change request, or added on the milestone. A task that syncs from Notion is left for a person.

The runner works one task at a time. It commits straight to the milestone branch. It never merges, never closes a pull request, never deploys, and never pushes any branch but `milestone/<slug>`.

When the pull request merges into the default branch, the GitHub webhook moves the milestone to Shipped only if every task that is not Parked is Done, subtasks included. Staff set Shipped through the same check. The runner never sets it.

## Set up

On the Convex deployment, set `RUNNER_TOKENS` to one runner per line. Each line is `id=token` and the repositories that runner may serve, separated by spaces. A token has to be at least 24 characters. A runner with no repository on its line is handed nothing. The `--repo` flag has to name one of those repositories.

```
RUNNER_TOKENS=peter-mbp=<long random token> warehauscollective/warehaus
```

On the Mac:

```bash
export PORTAL_AGENT_URL=https://<deployment>.convex.site
export RUNNER_TOKEN=<this runner's token>
```

Keep both out of the repository. The production deployment is always refused. Do not set `RUNNER_TOKENS` or a project's repository on production.

For a project set to Cursor, also set `CURSOR_API_KEY` on this Mac. Leave it unset everywhere else. A missing key blocks that build and leaves a note. It does not get sent to Claude.

The Claude process gets an allowlist of its environment and does not receive `RUNNER_TOKEN`. Copying the hooks from `hooks/settings.example.json` into `.claude/settings.json` no longer posts lines from inside the session, because the hook reads `RUNNER_TOKEN` and the runner does not pass it. The runner still reports when a run starts and when it finishes. File contents and command output stay on the Mac.

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
2. Ask the bot to create a milestone with `create_milestone` and a task list. It lands at Planning.
3. In the Portal, open the milestone and press play until its status is Building.
4. A staff member sets the project's repository once (`projects.setAgentRepo`). Then start the runner: `npm run runner -- start --id <your id> --repo <owner/name> --once`.
5. Work the task in the Claude Code session that opens. Commit. Exit.
6. Open the milestone's Activity tab. The run and the commit are there. The task shows Done with its commit on the Tasks tab.
7. Repeat until every task is done. The milestone moves to Ready to Ship.
8. Open the local preview: `npm run preview:pr -- milestone/<slug>`.
9. Approve in the Portal or in Grok Bot. Approval records the decision. Merge and deploy stay separate steps.

## Dry run log

This section records each dry run of the runner on shared dev. To add a later run, add one line per run, newest last, in the form `- YYYY-MM-DD: what was run`.

- 2026-11-22: first dry run of the milestone runner on shared dev.

## Tests

```bash
npm run test:runner
```
