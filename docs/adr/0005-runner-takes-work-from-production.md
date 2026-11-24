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
4. **Runner health on the project page.** Next to the repository and build agent settings, staff see "Runner online", the runner id and when it was last seen, or "No runner online", the last time one was seen and the start command. Online means a runner serving the project's repository was seen in the last 10 minutes. Staff only. Design frames come first.

## Related changes decided in the same review

- A Grok Bot "request changes" on a milestone at Ready to Ship leaves a note and moves it to Awaiting Go, not Building. Only staff start a build.
- The drafted-tasks card gets Regenerate: it archives the planner's drafts and plans again.
- A milestone has at most one active Cursor agent. A Cursor build still running after 2 hours is blocked with a "needs Peter" note. No money budget for now.
- ADR-0001's "Not built" list, its "stubs" line, and the `failPlanning` docstring are brought in line with the code.

## Consequences

- The runner's hard refusal of the production URL becomes an explicit opt-in.
- Production gets its own `RUNNER_TOKENS`. Dev keeps its own for testing.
- The Claude child process still inherits no tokens, so a build never holds a production credential.
