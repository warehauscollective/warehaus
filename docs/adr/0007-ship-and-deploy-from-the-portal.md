# ADR-0007: Ship and deploy from the Portal

Status: Accepted, Peter, 2026-11-26. Settled in a grilling session in Claude Code on 2026-11-26: Peter answered "yes to all" to three rounds (Q1 to Q20), then confirmed the summary with "Yes, record it". The work is tracked in the Portal milestone "Ship and deploy" (Warehaus Portal). No build until his go.

## Context

Milestones in the Warehaus Portal project reach Ready to Ship and then show no next step. Today nothing in the Portal merges or deploys: Peter approves, someone merges the milestone pull request, and production goes out only when Peter says "deploy main" in chat (ADR-0001). Peter asked for one button at Ready to Ship that merges the milestone and deploys it.

The milestone "Clear next step at Ready to Ship" (Building) already designs the one next-step slot at Ready to Ship. This ADR fills that slot for code milestones.

Facts checked on 2026-11-26: GitHub deletes a branch when its pull request merges; `main` has no branch protection; Portal CI runs on pull requests and on pushes to `main` and never deploys; `apps/portal/vercel.json` turns Vercel git deploys off.

## Decisions

### The milestone branch

1. **One milestone branch, one pull request, no pull request per task.** ADR-0001 decision 2 stands. Every task commits straight to `milestone/<slug>`; the milestone has one pull request into `main`. Ready to Ship already means every task is on the milestone branch, and the local preview (`npm run preview:pr -- milestone/<slug>`) runs from it.

### The button

2. **Ship and deploy is Peter's "deploy main" for that milestone.** Only Peter sees it, only in the Portal, and it asks him to confirm. Pressing it is his approval, the merge and the production deploy in one deliberate act. Grok Bot and the staff API cannot press it. This is the one path where approval to merge is also approval to deploy.
3. **Approve stays.** Approve still means "reviewed, not deployed yet" (Grok Bot, or batching a release). Ship and deploy does not need an earlier Approve. Once a milestone is approved, Ship and deploy is its one main action. Placement (Peter, 2026-11-26, design review): the Ship and deploy card (NextStepCard `State=ship`) shows under the ReviewCard whenever every task is done and the milestone has an open pull request into `main`, whether or not a review is still waiting; Approve stays on the ReviewCard.
4. **Only when the milestone has an open pull request into `main`.** A milestone with no pull request, such as Figma-only work, keeps Mark shipped.
5. **Warehaus Portal project only, for now.** Its deploy is production Convex `unique-turtle-383` and the Vercel project `warehaus-portal`. Other projects get the button once they have a deploy setting, in a later milestone.
6. **The confirm step lists what else goes out.** Deploying `main` releases everything merged since the last production deploy. The Portal keeps the deployed commit; the confirm step shows "Also goes out:" with the other merged milestones and loose commits since it, and those milestones are marked deployed with this one.
7. **One ship at a time per project.** While a ship run is going, every other Ship and deploy button in the project is disabled with "Another ship is running".

### The ship run

8. **A GitHub Actions `ship` workflow does the work.** Convex holds only a fine-grained token that can dispatch workflows on this repository. Convex never holds GitHub write access or deploy keys. The runner on Peter's Mac is not used, so a ship does not depend on his Mac being on.
9. **Check the merged code before anything touches `main`.** In order:
   1. Merge `main` into the milestone branch in the workflow. A conflict stops the run.
   2. Run Portal CI's checks on that merged code. A failure stops the run.
   3. Squash-merge the pull request, titled `<milestone name> (Portal milestone: <name>)`. GitHub deletes the branch.
   4. `convex deploy`, then the Vercel production deploy, both from that one `main` commit.
10. **Secrets live in a protected GitHub `production` environment**, locked to the `ship` workflow running from `main`, with no required reviewer. Pressing the button is the approval; there is no second gate in GitHub.
11. **Peter enters the secrets.** The production Convex deploy key and a Vercel token go in the GitHub `production` environment; the dispatch-only token goes in production Convex. The milestone has a setup task with exact steps for him. The button stays hidden until the Portal sees the dispatch token.

### Results

12. **Shipped means deployed on this path.** A ship run moves the milestone to Shipped only after the deploy succeeds, and records the deployed commit. A merge by hand still moves a milestone to Shipped as today, and shows "Not deployed" until a later deploy covers its commit. No new Status.
13. **A failure is visible and Retry resumes.**
    - Before the merge (conflict, failed check): the milestone stays Ready to Ship and shows "Ship failed · <step>" with the workflow log link. Retry runs again from the start.
    - Merged, deploy failed: the milestone shows "Merged · not deployed". Retry runs only the deploy.
    - Convex deployed, Vercel failed: Retry runs the deploy again from the same commit; both deploys are safe to repeat.
    - Each failure opens an Ask on Peter. It closes when a retry succeeds.
14. **Success posts a feed line, not an Ask.** An Activity row and an attention feed line, "Shipped and deployed · <commit>", so Grok Bot and the Mac app see it.
15. **Clients see only Shipped.** Ship progress, failures and Retry are staff only.
16. **No rollback button.** To undo a release, revert the squash commit and ship again, or use Vercel's instant rollback by hand. Convex functions have no clean rollback.

## Out of scope

- One-click local preview from the Mac app: its own milestone (Idea).
- Deploy settings for projects other than Warehaus Portal.
- The two milestones at Ready to Ship on 2026-11-26 (Iconsax icons across the Portal; Runner waits out Claude's usage limit) go out the current way, on Peter's "deploy main". Nothing waits on this button.

## Consequences

- ADR-0001's "Merging does not deploy. Production still needs Peter's explicit 'deploy main'" still holds for every path except Ship and deploy, where the button press is that instruction.
- Agents still never run `npx convex deploy` or `--prod` themselves. Only the `ship` workflow deploys, and only when Peter presses the button.
- The Portal stores the last deployed commit per project, which also gives the "Not deployed" mark for milestones merged by hand.
