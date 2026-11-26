# Warehaus runner

The runner is a small CLI. Today it runs on Peter's Mac (decided 2026-11-22) and takes its work from production, with a dev runner kept for testing runner changes (ADR-0005). Nothing in it is tied to that machine: see "Run it on macOS" and "Moving it to a server". It asks the Portal for the next piece of milestone work, runs the project's build agent on the milestone branch, and tells the Portal what happened. The milestone's Activity tab shows the run as it goes.

A project picks its build agent: Claude Code or Cursor. Planning always uses Claude Code, read-only. Building uses the project's agent.

Claude Code has no model API key here. The runner never reads or forwards a Claude sign-in. The only program it starts for Claude work is the official `claude` CLI, using the sign-in already on the Mac. The Cursor API key, `CURSOR_API_KEY`, lives on this Mac with the runner. It is never set on Convex, Vercel, chat, or Notion, and it is never printed.

## What it does

1. Calls `POST /agent/claim`. The Portal hands back one of:
   - a **planning job**: a milestone in Planning with no tasks, or one a staff member asked to regenerate
   - a **build job**: one Cursor cloud agent for a whole milestone whose project uses Cursor
   - a **task**: the lowest-order To do task on the oldest Claude Code milestone whose status is Building
   - nothing
2. Makes sure it has its own clone of the project's repository, under `~/warehaus-runner/repos/<owner>/<name>`, and a git worktree for the milestone branch, `milestone/<slug>`, under `~/warehaus-runner/worktrees/<owner>/<name>/`. The Portal names the repository with each piece of work. A clone is used only when its origin is that repository. A new branch starts from the repository's default branch. Cursor works on that same branch in the cloud. If the runner cannot clone the repository, the run is blocked with that reason and leaves a "needs Peter" note.
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

Pair the Mac with the Portal once per deployment (ADR-0005 amendment). Nobody copies a token by hand.

```bash
npm run runner -- setup                 # shared dev
npm run runner -- setup --production    # production, only when asked
```

`setup` prints an 8-character code and opens the Portal. A staff member opens any project page, taps the runner status chip, chooses Set up runner, and enters the code. The modal shows the id the Mac proposed (its name, with `-prod` on production); staff can change it, then confirm. A code lasts 10 minutes, and at most 5 can be open on a deployment at once.

The secret is made on the Mac and goes only to the macOS Keychain (service `warehaus-runner`). The Portal stores a hash of it. `~/.config/warehaus/runner.env` (`runner.prod.env` for production) holds only the Portal URL and the runner id. Nothing secret is printed.

Staff see every registered runner in the same modal, under Manage runners, and can revoke one. Revoking asks first, stops that runner at once, and puts any run it held back in the queue.

`--production` is never the default. It is required at set-up, it is written into the launchd agent, and a Mac paired to production refuses to start without it. The local preview and the staff Vercel preview still point at shared dev only.

For a project set to Cursor, also set `CURSOR_API_KEY` on this Mac. Leave it unset everywhere else. A missing key blocks that build and leaves a note. It does not get sent to Claude.

The Claude process gets an allowlist of its environment and holds no runner secret. Copying the hooks from `hooks/settings.example.json` into `.claude/settings.json` posts nothing from inside the session, because the runner does not pass its secret on. The runner still reports when a run starts and when it finishes. File contents and command output stay on the Mac.

Convex reads no `RUNNER_TOKENS`: a runner gets in only through its registration, on dev and production alike. `PORTAL_AGENT_URL` and `RUNNER_TOKEN` in the environment, with `--id`, still override the saved file and the Keychain, for a host with no Keychain.

## Run

```bash
npm run runner -- start
```

- A registered runner serves every project that names a repository, each in its own clone. A project with no repository is never handed to any runner.
- `--repo owner/name` narrows it to those repositories. Repeat it or separate with commas.
- `--mode interactive` is the default. It opens a Claude Code session for you to drive, on your normal plan limits.
- `--mode headless` runs `claude -p` with no session to drive. **This draws on the monthly Agent SDK credit, not your plan limits.** Use it on purpose.
- `--once` does one piece of work and exits.
- `--production` talks to the production Portal.

With nothing to do, the runner waits one minute, then longer, up to five minutes between checks. During a longer wait it calls `POST /agent/ping` every 75 seconds. The ping claims nothing: it only tells the Portal the runner is alive, so the runner status chip on the project page reads Ready (seen within the last 10 minutes). Each call sends the runner's protocol version. A runner below the Portal's minimum shows "Runner out of date" and gets no work until it is updated. The runner never updates its own code.

## Try it end to end

Use shared dev, never production.

1. Pair the Mac with dev: `npm run runner -- setup`.
2. Connect Grok Bot or Claude to the Portal MCP server (`docs/portal-mcp.md`).
3. Ask the bot to create a milestone with `create_milestone` and a task list. It lands at Planning.
4. In the Portal, open the milestone and press play until its status is Building.
5. A staff member sets the project's repository once, on the project page. Then start the runner: `npm run runner -- start --once`.
6. Work the task in the Claude Code session that opens. Commit. Exit.
7. Open the milestone's Activity tab. The run and the commit are there. The task shows Done with its commit on the Tasks tab.
8. Repeat until every task that is not Parked is done. The milestone moves to Ready to Ship.
9. Open the local preview: `npm run preview:pr -- milestone/<slug>`.
10. Approve in the Portal or in Grok Bot. Approval records the decision. Merge and deploy stay separate steps.

## Run it on macOS

The runner is a plain Node process that polls the Portal, so it needs no open port.

### What the Mac needs

- Node 22, `git`, and `gh` signed in (`gh auth status`) with push access to each repository it serves. `git` must be able to clone over HTTPS (`gh auth setup-git` does this).
- The official `claude` CLI, signed in, for planning and for Claude Code projects.
- Room under `~/warehaus-runner/` for its clones and worktrees. It never works in a person's own checkout.

### Keep it running

```bash
npm run runner -- install                 # dev
npm run runner -- install --production    # production
```

`install` writes one launchd agent per deployment to `~/Library/LaunchAgents` (`co.warehaus.runner`, `co.warehaus.runner.prod`) and loads it. launchd starts the runner at login and restarts it if it stops. It refuses a Mac that is not paired to that deployment. The file holds no secret.

The agent runs `--mode headless`, because launchd has no terminal. **Headless Claude draws on the monthly Agent SDK credit, not plan limits.** A Cursor build starts no Claude session, but planning still runs `claude -p`. For interactive Claude Code, start the runner by hand in a terminal instead, under `screen` or `tmux` if it should outlive the window.

```bash
npm run runner -- uninstall [--production]                           # stop and remove
launchctl kickstart -k gui/$(id -u)/co.warehaus.runner              # restart
tail -f ~/Library/Logs/co.warehaus.runner.log                        # its log
```

The log holds the runner's own lines only. It never holds a secret or a key.

### A sleeping Mac

The runner holds `caffeinate -i` while a run is in progress, and only then, so the Mac does not idle-sleep in the middle of a task. A closed lid still stops it. The Portal handles that on its own: after 30 minutes with no call, the sweep releases the run and blocks the task or the build, and staff see Retry. A milestone that has been Building for 30 minutes with no runner online gets a "needs Peter" note, which says whether no runner is set up at all. The note closes when a runner is back.

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

## Under the runner Mac app

The Warehaus Runner Mac app (`apps/mac`) starts the runner itself, so staff never type these commands. It runs:

```bash
node tools/runner/src/cli.mjs start --supervised --mode headless --production [--paused]
node tools/runner/src/cli.mjs remove --production
```

- `--supervised` prints one state line per change on stdout, `@@warehaus ` and a JSON object: `started`, `idle`, `working`, `finished`, `paused`, or `attention` with a reason (`unauthorized`, `out_of_date`, `github`, `unreachable`, `not_paired`). Every other line is the runner's own log. It reads `pause` or `resume` on stdin, and stops when the app closes its stdin.
- A paused runner claims nothing and sends `paused: true` with each heartbeat, so the Portal chip reads Paused. A run in progress finishes first.
- Supervised, it checks `gh auth status` every 10 minutes and takes no work while GitHub is signed out.
- `remove` revokes the runner in the Portal with its own secret (`POST /agent/unpair`), removes its launchd agent, and deletes its Keychain secret and saved file. Exit code 3 means it was removed from the Mac but the Portal could not be reached; 4 means the Keychain entry could not be deleted.

## Moving it to a server

The runner is host-agnostic on purpose, so it can move to an always-on machine later without a code change.

- It is one Node process with its own clones under `~/warehaus-runner`. On macOS it reads its secret from the Keychain; elsewhere `PORTAL_AGENT_URL` and `RUNNER_TOKEN` in the environment, with `--id`, do the same job.
- It only makes outbound HTTPS calls: to the Portal, to GitHub through `git` and `gh`, and to Cursor. It listens on nothing.
- All state is in the Portal and in git. A new host is paired like a Mac and gets its own runner id. Revoke the old one from the runner list.
- On Linux the same command runs under `systemd` (`Restart=always`, `EnvironmentFile=` pointing at the same kind of file) or in a container.
- The one thing a server cannot do is interactive Claude Code, which needs a person at a terminal. A server runs Cursor builds and `--mode headless`.

## Dry run log

This section records each dry run of the runner on shared dev. To add a later run, add one line per run, newest last, in the form `- YYYY-MM-DD: what was run`.

- 2026-11-22: first dry run of the milestone runner on shared dev.

## Tests

```bash
npm run test:runner
```

Three files: `src/lib.test.mjs` for the pure helpers, `src/cursorFlow.test.mjs` for the Cursor branch flow and the manual check script against a throwaway repository, and `src/clone.test.mjs` for the runner's own clones. Portal CI runs them.
