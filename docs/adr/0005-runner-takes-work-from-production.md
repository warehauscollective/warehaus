# ADR-0005: The runner takes its work from production

Status: Accepted, Peter, 2026-11-24. Peter answered "Yes to all" to both grilling rounds on the Auto-planning and agent choice milestone, then confirmed the summary with "Yes, set it up". The work is tracked in the Portal milestone "Runner on production".

## Context

ADR-0001 kept the runner on shared dev `graceful-mastiff-960`. The runner refuses any `unique-turtle-383` URL, and only dev has `RUNNER_TOKENS`. Staff, Grok Bot and Peter all track milestones in the production Portal. So on production a milestone that enters Planning is queued and never planned, and a milestone in Building never moves. Whatever a runner does on dev stays in dev's data.

## Decision

The runner claims milestone work from production, with a production-only runner token. Everything the work produces for review stays on dev: the local preview (`npm run preview:pr`) and the staff Vercel preview still point at `graceful-mastiff-960` and never at production (ADR-0001, decision 1).

## Considered options

- **Keep the runner dev-only.** Rejected: the feature then does nothing where Peter works, and production pages claim a runner that never comes.
- **Track agent milestones on dev.** Rejected: it splits milestones across two Portals and the bots and the staff API already write to production.

## Details

1. **Opt in, never by default.** The runner still refuses the production URL unless it is started with `--production`. Production settings live in their own file, `~/.config/warehaus/runner.prod.env`, apart from `runner.env` for dev.
2. **One runner per deployment.** A dev runner stays for testing runner changes on shared dev. Runner ids differ per deployment, for example `peter-mbp` on dev and `peter-mbp-prod` on production.
3. **Start from an empty queue.** When production is switched on, the planning flags already set there are cleared once, so no old milestone starts planning by surprise. On 2026-11-24 that was Double Booking Awareness (project with no repository) and Figma library cleanup (already has tasks).
4. **Runner health on the project page.** Staff see the existing `RunnerStatus` chip in the project heading, and tapping it opens the Runner status modal (a bottom sheet on a phone). The modal names the runner by its id and says when it was last seen. When no runner is online it also gives the start command. Online means a runner serving the project's repository was seen in the last 10 minutes. Staff only. Peter chose on 2026-11-24 to rework the chip and modal from the Auto-planning milestone (open PR 157) instead of adding a card next to the repository and build agent settings. The design is reworked first and approved before PR 157 is changed to match.

## Related changes decided in the same review

- A Grok Bot "request changes" on a milestone at Ready to Ship leaves a note and moves it to Awaiting Go, not Building. Only staff start a build.
- The drafted-tasks card gets Regenerate: it archives the planner's drafts and plans again.
- A milestone has at most one active Cursor agent. A Cursor build still running after 2 hours is blocked with a "needs Peter" note. No money budget for now.
- ADR-0001's "Not built" list, its "stubs" line, and the `failPlanning` docstring are brought in line with the code.

## Consequences

- The runner's hard refusal of the production URL becomes an explicit opt-in.
- Production gets its own `RUNNER_TOKENS`. Dev keeps its own for testing.
- The Claude child process still inherits no tokens, so a build never holds a production credential.

## Amendment, 2026-11-24: runner registry and set-up from the Portal

Peter answered "Yes to all" to three grilling rounds after production showed "No runner allowed", then confirmed the summary with "Yes, set it up". These points replace the matching lines above where they differ. The work is tracked in the same Portal milestone, "Runner on production".

Production showed "No runner allowed" because it had no `RUNNER_TOKENS`, and the runner refused the production URL. Adding a token by hand on each deployment is the step this amendment removes.

1. **Runner registrations replace `RUNNER_TOKENS`.** Runners are registered per deployment in Convex, with only a hash of each secret stored. Staff see, add and revoke them in the RunnerStatus modal. There is no new page. `RUNNER_TOKENS` is read only as a fallback until the dev runner is re-paired, then the fallback and the dev env var are removed in this milestone.
2. **Any project with a repository is served.** A registered runner serves every project that names a repository it can reach. Runners no longer list repositories. The runner keeps its own clone of each repository under `~/warehaus-runner/repos/<owner>/<name>` and works only in a clone whose remote matches the project. A repository it cannot clone blocks the run with a "needs Peter" note.
3. **Pairing, not copy-paste.** `npm run runner -- setup` (with `--production` for production) prints an 8-character code and opens the Portal. Staff confirm the code in the RunnerStatus modal. The CLI proposes the id from the hostname, with `-prod` on production, and staff confirm it. The secret goes only to the CLI that started the pairing and is stored in the macOS Keychain, never on screen or in a plain file. A code lasts 10 minutes, at most 5 pairings are open per deployment, and expired ones are swept by the existing bounded cron. Copy-paste stays as a fallback when the CLI cannot open a browser.
4. **Staff only.** Set-up, the runner list and Revoke are staff only. Revoking asks for confirmation.
5. **Kept running.** `npm run runner -- install` writes a launchd agent, one per deployment, that starts the runner at login and restarts it if it stops. The runner holds `caffeinate -i` only while a run is in progress. `--production` stays an explicit opt-in: it is required at set-up, written into the launchd agent, and a runner paired to production refuses to start without it.
6. **Alerts.** The Portal writes a "needs Peter" note when production has no registered runner, and when a milestone has been Building for 30 minutes with no runner online (one open note per milestone, closed when a runner returns, from the existing stuck-run cron).
7. **Version check.** The runner sends its protocol version with each heartbeat. The Portal shows "Runner out of date" when it is behind and refuses claims below the minimum. The runner never updates its own code.
   - **Chip state (designed 2026-11-25, Runner status follow-ups task 02, awaiting Peter's approval before build).** When the latest runner is registered and below the minimum protocol, the chip reads Out of date instead of Ready or Offline, the same rule that already swaps the modal body. It uses the warning treatment of Offline Building: amber outline, amber dot, amber label. Compact: `Out of date`. Expanded: `Runner out of date` then the meta `<runner id> · protocol <n>`. Figma: `RunnerStatus` variants `state=Out of date` in Portal - Component Library ([1063:7524](https://www.figma.com/design/TS3DcaCgrIdYf0jhvnMy3k/Warehaus-Studio?node-id=1063-7524)), with the documentation sheets in Dark and Light, and the project page frames "Project details · Milestones · Runner out of date" in Dark and Light at 1440 and 390 on Portal - Projects ([1101:40567](https://www.figma.com/design/TS3DcaCgrIdYf0jhvnMy3k/Warehaus-Studio?node-id=1101-40567)).
8. **Design first.** The RunnerStatus modal gets six states, in Dark and Light at 1440 and 390, on the existing frames: not set up with the pairing field, confirm pairing, paired, runner list with Revoke, revoke confirmation, and out of date. Peter approves them before any build.

A hosted runner on a server is a later milestone.

### Built, 2026-11-24

Built on the branch `milestone/runner-on-production`, awaiting Peter's approval:

- Registrations, pairing, the six RunnerStatus states, revoke, and the protocol version check (points 1, 3, 4, 7, 8).
- The runner's own clones under `~/warehaus-runner/repos/<owner>/<name>`; a clone that fails blocks the run with a "needs Peter" note (point 2). `--dir` is gone and `--repo` is an optional filter.
- `npm run runner -- install`, and `caffeinate -i` held only during a run (point 5).
- The no-runner notes from the stuck-run cron (point 6). Production having no registered runner is reported on each Building milestone that waits, since a note belongs to a milestone.
- The internal mutation `runners:clearQueuedPlanning`, run once by hand on production after the deploy, for detail 3.
- Request changes from Grok Bot moves to Awaiting Go; Regenerate on the drafted tasks card; a Cursor build is blocked after 2 hours.

Done (task 13): the `RUNNER_TOKENS` fallback is removed from Convex, and the dev env var with it. Peter decided dev needs no runner, so dev was not re-paired. Runners serve production only, and every runner gets in only through its registration.

## Amendment, 2026-11-26: staff set up the runner with the Mac app

Portal decision 0005 made the runner a native Swift menu bar app, and ADR-0006 (decisions 3 and 8) put it in `apps/mac`, signed and notarized, downloaded only from the Portal. This amendment records what that changes here. The work is tracked in the Portal milestone "Runner Mac app, set up from the Portal". These points replace the matching lines above where they differ.

1. **Staff set up a runner with the app, never the CLI.** Staff download the Mac app (named Warehaus Portal since 2026-11-26, Warehaus Runner before) from the Runner status modal (Set up runner › Download runner app; staff only, Apple silicon, macOS 14 or later) and follow its first-launch checklist: GitHub sign-in, Claude Code (Install, then sign in), then pairing. The app runs `setup --supervised --production`, shows the code, and opens the Portal at `/?runnerPair=<code>`, where staff confirm it. No staff step uses a terminal. The CLI's `setup` stays for developers and for a host with no app (point 3 of the 2026-11-24 amendment).
2. **The app keeps the runner running, not launchd.** The app starts the bundled runner (`start --supervised --mode headless --production`) with its own Node and `gh`, restarts it if it stops, and starts at login through the macOS login item, on from the first launch. It replaces point 5's launchd agent for staff. On a Mac that already has the production agent, the app adopts the existing pairing and offers Replace it, which unloads and removes `co.warehaus.runner.prod`; until then the app does not start a second runner. `install` stays for a dev runner. Release builds use production only and debug builds refuse it, as before.
3. **Registry, pairing and revoke, plus unpair.** Registrations, the pairing code (10 minutes, at most 5 open) and Revoke in the Portal are unchanged. Remove this runner… in the app adds the runner's own revoke: `remove` calls `POST /agent/unpair` with the runner's secret, hands any run in progress back for Retry, removes the login item and any old agent, and deletes the Keychain secret. If the Portal cannot be reached, the app asks staff to revoke the runner in the Portal.
4. **Paused.** Pause in the app sends `pause` to the runner, which claims nothing and sends `paused: true` with each heartbeat, so the Portal shows Paused instead of Offline. A run in progress finishes first. The app remembers a pause across restarts.
5. **Release check and self-update.** Point 7's "The runner never updates its own code" now holds for the CLI only. The app updates itself, and the runner bundled in it, between runs:
   - A maintainer runs the release workflow by hand, from `main` only, after a production deploy that changes `apps/mac` or `tools/runner`. It publishes a signed, notarized zip to production Convex (`/runner-app/upload-url`, then `/runner-app/release`). The build number is the commit count on `main`.
   - The app asks for the latest release on launch, every 6 hours and on Check for update, through the runner (`app-release`, `POST /agent/app-release` with the runner secret). A release is newer when its build number is higher.
   - Before installing, it checks the zip's size and SHA-256, the signature, the team (7XQWUC33C7), the bundle id, that the build is the one the Portal named, and Gatekeeper.
   - It installs only while the runner is idle, paused or stopped, never during a run. It keeps a rollback copy, and puts the old app back if the new one does not check in within 45 seconds.
   - The protocol version check stays: a runner below the minimum shows "Runner out of date" and gets no work.

What stays the same: the runner claims work from production with its registration; the local preview and the staff Vercel preview point at shared dev only; the Claude child process inherits no secret; headless Claude draws on the Agent SDK credit; the no-runner notes and the stuck-run sweep are unchanged; merging still deploys nothing.

## Amendment, 2026-11-26: one runner works several milestones at once

Peter asked on 2026-11-26 for the runner to work every Building milestone instead of one at a time, as a priority. The work is tracked in the Portal milestone "Runner works several Building milestones at once".

- A runner holds up to N open runs (the claim's `slots`, 1 to 4; the Mac app uses 4), each on a different milestone. Inside a milestone nothing changes: one task run at a time, in order, on the one `milestone/<slug>` branch.
- Each claim lists the runs the runner holds. An open run it does not list comes back to it first; with every slot in use it gets nothing new. A runner that sends no slots (protocol 2) works one run at a time as before.
- Each run is its own headless Claude session, so N runs use the Agent SDK credit N times as fast.

## Amendment, 2026-11-26: a usage limit hands the run back

On 2026-11-26 the production runner `peteroqs-laptop-prod` blocked tasks 04 to 07 of "Milestone tasks as a board" twice, about 8 seconds apart, each with "The run ended with no new commit". Every Claude transcript ended "You've hit your 5-hour limit · resets 8:30am (America/New_York)". A usage limit is not a task problem, so it should not block the task or ask Peter for anything.

- Headless, the runner reads the last lines of Claude's output. A usage-limit line ends the run as released, not failed. A blocked note from Claude still wins.
- A new route, `POST /agent/release`, takes a task or planning run back: the run is cancelled and settled, the task goes back to To do (a plan back to the queue), the feed gets a note, and there is no "needs Peter" note. It is its own route, not a fourth complete status, because a Portal that predates it must refuse it plainly (404); an older `failPlanning` would have ignored a status and blocked the plan. On a 404 the runner leaves the run open, and the claim after the reset hands it back.
- The runner claims nothing until the reset Claude named plus a minute, or 30 minutes when it names none, at most 8 days. The limit is the account's, so one run that hits it holds every slot.
- Supervised, the runner prints a `waiting` line with reason `usage_limit` and the time it takes work again. It is not an `attention` reason: nobody has to act, and the wait ends on its own. The Mac app shows it as a fifth menu state, Waiting, with an orange dot and the time it takes work again (approved by Peter in the Claude Code session on 2026-11-26); while runs are still going it adds one line under them. It never notifies.

