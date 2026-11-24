# Warehaus runner

The runner is a small CLI. Today it runs on Peter's Mac (decided 2026-11-22). Nothing in it is tied to that machine: see "Run it on macOS" and "Moving it to a server". It asks the Portal for the next piece of milestone work, runs the project's build agent on the milestone branch, and tells the Portal what happened. The milestone's Activity tab shows the run as it goes.

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
5. When the last task on a milestone is done, the Portal moves the milestone to Ready to Ship (a Parked task does not count, and the runner never takes one), stores the local preview link so Approve unlocks, and leaves a "needs Peter" note with the pull request, the local preview command and the approval line. The runner then labels the pull request `ready-for-review`, which is what starts the staff Vercel preview against shared dev. A blocked or stuck run leaves a note too. Grok Bot reads open notes with the `list_needs_peter` tool.

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

With nothing to do, the runner waits one minute, then longer, up to five minutes between checks. During a longer wait it calls `POST /agent/ping` every 75 seconds. The ping claims nothing: it only tells the Portal the runner is alive, so the runner status chip on the project page reads Ready (seen within the last 10 minutes, ADR-0005).

## Try it end to end

Use shared dev, never production.

1. Connect Grok Bot or Claude to the Portal MCP server (`docs/portal-mcp.md`).
2. Ask the bot to create a milestone with `create_milestone` and a task list. It lands at Planning.
3. In the Portal, open the milestone and press play until its status is Building.
4. A staff member sets the project's repository once (`projects.setAgentRepo`). Then start the runner: `npm run runner -- start --id <your id> --repo <owner/name> --once`.
5. Work the task in the Claude Code session that opens. Commit. Exit.
6. Open the milestone's Activity tab. The run and the commit are there. The task shows Done with its commit on the Tasks tab.
7. Repeat until every task that is not Parked is done. The milestone moves to Ready to Ship.
8. Open the local preview: `npm run preview:pr -- milestone/<slug>`.
9. Approve in the Portal or in Grok Bot. Approval records the decision. Merge and deploy stay separate steps.

## Run it on macOS

The runner lives on Peter's Mac for now (decided 2026-11-22). It is a plain Node process that polls the Portal, so it needs no open port and nothing installed beyond what the Mac already uses to work in the repository.

### What the Mac needs

- Node 22, `git`, and `gh` signed in (`gh auth status`) with push access to the repository.
- The official `claude` CLI, signed in, for planning and for Claude Code projects.
- A checkout of the repository the runner serves. Worktrees are created beside it, in `../warehaus-runner/`.

### Environment

Three values, all in the runner's own shell on the Mac. None of them belongs in the repository, in Convex, in Vercel, in chat or in Notion.

| Variable | What it is | Where it lives |
|---|---|---|
| `PORTAL_AGENT_URL` | `https://graceful-mastiff-960.convex.site`, shared dev | The Mac. The runner refuses the production deployment. |
| `RUNNER_TOKEN` | This runner's token, at least 24 characters | The Mac. Its match is one line of `RUNNER_TOKENS` on dev Convex. |
| `CURSOR_API_KEY` | The Cursor API key, only for projects set to Cursor | The Mac, and nowhere else. It is never sent to Convex and never printed. |

Keep them in a file only you can read, outside any repository, and load that file where the runner starts:

```bash
mkdir -p ~/.config/warehaus
touch ~/.config/warehaus/runner.env
chmod 600 ~/.config/warehaus/runner.env
# then edit it: one KEY=value per line, no quotes, no export
```

```
PORTAL_AGENT_URL=https://graceful-mastiff-960.convex.site
RUNNER_TOKEN=<this runner's token>
CURSOR_API_KEY=<only if a project uses Cursor>
```

`RUNNER_TOKENS` is the other half, and it is set **only on dev Convex** `graceful-mastiff-960`:

```
RUNNER_TOKENS=peter-mbp=<the same token> warehauscollective/warehaus
```

Never set `RUNNER_TOKENS`, or a project's repository (`agentRepo`), on production `unique-turtle-383`. With neither set, production hands no work to any runner, which is the point.

### Option A: `screen`, for interactive Claude Code

Use this when a person drives the Claude session, which is the default `--mode interactive`. The session needs a terminal, and `screen` keeps one alive after the window closes.

```bash
screen -S warehaus-runner
cd ~/Projects/warehaus
set -a; source ~/.config/warehaus/runner.env; set +a
npm run runner -- start --id peter-mbp --repo warehauscollective/warehaus
```

Detach with `Ctrl-a d`. Come back with `screen -r warehaus-runner`. Stop it with `Ctrl-c` in that session. `tmux` works the same way. The runner stops when the Mac restarts; start it again by hand.

### Option B: `launchd`, for unattended runs

Use this when nobody drives the session: a project set to Cursor, or `--mode headless`. `launchd` has no terminal, so interactive mode cannot work under it. **Headless Claude draws on the monthly Agent SDK credit, not plan limits.** A Cursor build starts no Claude session, but planning still runs `claude -p`.

Save this as `~/Library/LaunchAgents/co.warehaus.runner.plist`, with your own paths. It holds no secret: the wrapper line reads them from the file above.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>co.warehaus.runner</string>
  <key>WorkingDirectory</key><string>/Users/YOU/Projects/warehaus</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>set -a; source "$HOME/.config/warehaus/runner.env"; set +a; exec node tools/runner/src/cli.mjs start --id peter-mbp --repo warehauscollective/warehaus --mode headless</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>60</integer>
  <key>StandardOutPath</key><string>/Users/YOU/Library/Logs/warehaus-runner.log</string>
  <key>StandardErrorPath</key><string>/Users/YOU/Library/Logs/warehaus-runner.log</string>
</dict>
</plist>
```

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/co.warehaus.runner.plist   # start, and at every login
launchctl kickstart -k gui/$(id -u)/co.warehaus.runner                             # restart
launchctl bootout gui/$(id -u)/co.warehaus.runner                                  # stop and unload
tail -f ~/Library/Logs/warehaus-runner.log
```

`zsh -lc` is a login shell: it reads `~/.zprofile`, not `~/.zshrc`. If `node`, `gh` or `claude` is put on the path in `~/.zshrc` (nvm does this), give its full path in the plist or move that line to `~/.zprofile`. Check with `zsh -lc 'which node gh claude'`. The log holds the runner's own lines only. It never holds a token or a key.

### A sleeping Mac

A closed lid stops the runner. The Portal handles that on its own: after 30 minutes with no call, the sweep releases the run and blocks the task or the build, and staff see Retry. To keep the Mac awake while a milestone builds, run `caffeinate -is` in another tab, or start the runner under it: `caffeinate -is npm run runner -- start …`.

## Retry and the run it replaces

Retry never starts a second run on top of one that may still be working.

- While a run on the milestone is still running, a milestone Retry is refused: "A run is still going on this milestone." A task Retry for a different, blocked task is allowed: the task goes back to To do and waits, because the Portal hands out one run per milestone at a time.
- A run the sweep released has no word from its runner, so its Claude session may still be committing. It keeps the milestone for 10 more minutes: "The last run is still winding down." The hold ends sooner the moment the runner reports on that run, or asks for work again, which it only does when it is not working.
- A run the runner ended itself (done, blocked, failed) holds nothing. Retry works at once.
- A Cursor build that was released while its cloud agent may still be running is not replaced. After Retry, the next build follows that same agent. A second agent is launched only after the runner has seen the first one stop.

## Check the Cursor branch step

The branch step is: create `milestone/<slug>` from the default branch, push it, launch the agent on it, read its commits, open the one pull request.

CI runs that whole flow in `src/cursorFlow.test.mjs` against a throwaway local repository, with real `git`, a stand-in `gh`, and the Cursor API mocked. No test calls Cursor.

To check it by hand against the real repository, use the script. It only ever touches a throwaway branch named `milestone/zz-cursor-check-<date>-<time>`. It never merges, never deploys, and never talks to the Portal or Convex.

```bash
# 1. Branch from the default branch and push. No Cursor call, no pull request.
node tools/runner/scripts/check-cursor-branch.mjs --cleanup

# 2. The full step: one real Cursor agent, its Portal-Task trailer, a draft pull request, then clean up.
#    Costs one agent run. Needs CURSOR_API_KEY in this shell.
set -a; source ~/.config/warehaus/runner.env; set +a
node tools/runner/scripts/check-cursor-branch.mjs --launch --cleanup
```

Each step prints `ok` or `FAIL`. A pass looks like: branch on origin, branch starts at `main`, agent launched, agent finished, a commit carries `Portal-Task: check:1`, Cursor opened no pull request, draft pull request into `main`, pull request closed, branch deleted. Leave off `--cleanup` to look at the branch and the pull request first, then run the clean-up line the script prints. Add a line to the dry run log below when you run step 2.

## Moving it to a server

The runner is host-agnostic on purpose, so it can move to an always-on machine later without a code change.

- It is one Node process with three environment values and a git checkout. It reads no macOS path, keychain or app.
- It only makes outbound HTTPS calls: to the Portal, to GitHub through `git` and `gh`, and to Cursor. It listens on nothing.
- All state is in the Portal and in git. A new host needs the checkout, `gh` signed in, the three values, and its own line in `RUNNER_TOKENS` on dev Convex. Give the new host its own runner id, then remove the Mac's line.
- On Linux the same command runs under `systemd` (`Restart=always`, `EnvironmentFile=` pointing at the same kind of file) or in a container.
- The one thing a server cannot do is interactive Claude Code, which needs a person at a terminal. A server runs Cursor builds and `--mode headless`.

## Dry run log

This section records each dry run of the runner on shared dev. To add a later run, add one line per run, newest last, in the form `- YYYY-MM-DD: what was run`.

- 2026-11-22: first dry run of the milestone runner on shared dev.

## Tests

```bash
npm run test:runner
```

Two files: `src/lib.test.mjs` for the pure helpers, and `src/cursorFlow.test.mjs` for the Cursor branch flow and the manual check script against a throwaway repository. Portal CI runs both.
