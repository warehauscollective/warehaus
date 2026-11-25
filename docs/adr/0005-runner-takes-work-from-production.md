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

Done (task 13): the `RUNNER_TOKENS` fallback is removed from Convex, and the dev env var with it, after the dev runner was re-paired. Every runner, on dev and production, gets in only through its registration.

