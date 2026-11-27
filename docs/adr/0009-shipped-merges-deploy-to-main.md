# ADR-0009: Shipped merges, Deploy to main deploys

Status: Accepted, Peter, 2026-11-27. Settled in a grilling session in Claude Code on 2026-11-27: Peter answered "yes to all" to three rounds (Q1 to Q29), then confirmed the summary with "Yes, record it". Portal project decision 0027. Replaces decisions 2, 3 and 12 of ADR-0007 and the Ship and deploy button; the rest of ADR-0007 is reused as noted below. Tracked in three Portal milestones (Warehaus Portal): "Preview link on the tile", "Shipped merges the pull request" and "Deploy to main". No build until his go.

## Context

On 2026-11-27 Peter found milestones marked Shipped whose work was not live. "Add filters in the project list" had been set to Shipped by hand on 2026-11-26 while its pull request was still open: the Shipped gate checks only that tasks are Done, and no path to Shipped checks the pull request or approval. Its branch had also drifted into a conflict with `main`. It was merged and deployed by hand that day.

ADR-0007 answered this with one Ship and deploy button per milestone, where one press approved, merged and deployed. Peter asked instead for two steps: moving a milestone to Shipped merges it, and one Deploy to main button on the project page releases everything merged and not yet deployed. He also asked for the Ready to Ship tile to carry a clickable link to the branch's preview.

Facts checked on 2026-11-27:

- Building already works as he described. The runner takes the lowest-ordered To do task, pushes the milestone branch and opens the pull request before it reports each task Done, and moves the milestone to Ready to Ship when the last task finishes.
- At Ready to Ship the runner labels the pull request `ready-for-review`, which starts a Vercel build of the branch against shared dev Convex `graceful-mastiff-960`. The build reports its link to shared dev only, so a milestone in production never receives it.
- A merged milestone pull request already moves the milestone to Shipped through the GitHub webhook, with no approval check.
- The milestone field `deployFinishedAt` exists and nothing writes it. There is no per-project deploy setting; the Vercel project, the Convex deployments and the repository name are hardcoded for Warehaus Portal.

## Decisions

### Building

1. **Building stays as built.** No change to how the runner claims tasks, pushes, opens the pull request or moves the milestone to Ready to Ship.

### Ready to Ship: the preview link

2. **The Vercel branch preview is the link on the tile, and Peter approves from it.** It starts on every entry into Ready to Ship and its link is written to the production milestone. The local preview on his Mac (`npm run preview:pr -- <branch>`) becomes optional; its command stays in the Ready to Ship note. This replaces "Peter always approves from the local preview" once the milestone ships.
3. **The preview build pushes the branch's Convex code to shared dev.** The preview workflow uses a deploy key that works on `graceful-mastiff-960` only. One branch's backend runs on shared dev at a time, and the tile says which. Turned down: leaving the backend alone and marking the tile, and a separate Convex backend per branch.
4. **A failed backend push does not stop the preview.** The preview still builds and the tile says "Backend push failed" with the log link.
5. **The Notion risk is accepted for now.** Shared dev still uses the production Notion token, so a write in a preview can reach the real Warehaus Notion. The tile shows that warning next to the preview link until the test Notion setup exists.
6. **The preview lives until Shipped.** It is deleted when the milestone is Shipped, not when Peter approves. At that point shared dev is pushed back to `main`'s backend.

### Shipped: the merge

7. **Shipped means merged to `main`, not deployed.** Deploying is its own act (decisions 14 to 22).
8. **Only Peter moves a milestone with an open pull request to Shipped.** In the Portal, after a confirm step. The move counts as his approval, so no earlier Approve is needed. The staff API, Grok Bot and other staff are refused.
9. **A GitHub Actions workflow does the merge.** As ADR-0007 decisions 8 and 9, without the deploy step: merge `main` into the milestone branch, run Portal CI's checks on that merged code, then squash-merge the pull request, titled `<milestone name> (Portal milestone: <name>)`. Convex holds only a token that can dispatch workflows on this repository. The milestone shows Shipped only after the merge succeeds.
10. **A failed merge goes back to the runner.** On a conflict or a failed check the Portal adds a task "Bring the branch up to date with main" and moves the milestone to Building. It returns to Ready to Ship for Peter to ship again. Turned down: staying at Ready to Ship with an Ask on Peter, since a conflict cannot be resolved from the Portal.
11. **A pull request merged directly on GitHub still ships the milestone.** The code is on `main`, so the milestone moves to Shipped, recorded as "Merged on GitHub", and counts as waiting for deploy.
12. **A milestone with no pull request keeps the plain move to Shipped.** Figma-only work never merges and never counts as waiting for deploy. It can still be reopened as today.
13. **A merged milestone cannot leave Shipped.** The merge cannot be undone from the Portal. A fix is a new milestone; undoing a release is a revert commit and another deploy. No rollback button (ADR-0007 decision 16).

### Deploy to main

14. **A counter and a Deploy to main button sit on the project page**, between the runner indicator and New milestone. The counter is that project's Shipped milestones not yet deployed. Both show only on a project with a deploy set up, which is Warehaus Portal for now (production Convex `unique-turtle-383`, Vercel project `warehaus-portal`).
15. **Staff see the counter; only Peter sees and presses the button.** It asks him to confirm. The confirm step lists each waiting milestone, its deploy notes, and any commits on `main` that belong to no milestone.
16. **The button shows whenever `main` is ahead of the deployed commit.** With undeployed commits and no waiting milestone the counter reads 0 and the button still shows. With nothing to deploy it hides.
17. **Deploy notes say what a release needs beyond the code.** For example a new Convex table or index, a new environment variable or secret, or a one-off migration. The runner writes them from the diff at Ready to Ship and staff can edit them.
18. **Manual steps are checkboxes in the confirm step.** A deploy note can mark a step a person must do first. The button stays disabled until every manual step is ticked. The workflow never runs migrations or sets secrets.
19. **A GitHub Actions workflow deploys.** `convex deploy`, then the Vercel production deploy, both from one `main` commit, as ADR-0007 decision 9 step 4. Secrets live in a protected GitHub `production` environment as ADR-0007 decision 10.
20. **One deploy at a time per project.** The deploy takes the `main` commit as it was when Peter pressed the button; a milestone merged during the run waits for the next one. If Convex deploys and Vercel fails, Retry runs the deploy again from the same commit. A failure opens an Ask on Peter; success posts an Activity row and an attention feed line.
21. **The Portal stores the deployed commit per project.** A Shipped milestone whose merge commit is at or before it shows Deployed; otherwise Not deployed, and those are what the counter counts. Not a new Status. The first deployed commit recorded is `37c0fcf`, the deploy of 2026-11-27, so the counter starts at 0.
22. **Deploy to main is the only production deploy path once it is built.** "deploy main" in chat is retired and agents never deploy, with no exception.

### Clients

23. **Clients see Shipped only once it is deployed.** On a project with a deploy set up, a client keeps seeing Ready to Ship until the deploy covers the milestone. Staff see Shipped with Not deployed in between. Merge and deploy progress, failures and Retry are staff only.

### Secrets

24. **Peter enters each secret once, and each button stays hidden until its secret is in place.** Each milestone has a setup task with exact steps for him. For the merge: a dispatch-only token in production Convex. For Deploy to main: the production Convex deploy key and a Vercel token in the GitHub `production` environment. For the preview backend push: a dev-only Convex deploy key in GitHub. No value goes in the repo, a doc or chat, and no agent creates or sees one.

### Getting there

25. **Three milestones, in this order**, each design first where it has screens:
    1. Preview link on the tile (was "Staff preview on every Ready to Ship"): decisions 2 to 6.
    2. Shipped merges the pull request (was "Ship and deploy", with "Approval gates Shipped" folded in): decisions 7 to 13.
    3. Deploy to main: decisions 14 to 23.
26. **The old flow fills the gaps.** Until milestone 2 ships, a milestone pull request is merged by hand on Peter's word. Until milestone 3 ships, production goes out on his "deploy main" in chat.
27. **Work in flight does not wait.** Iconsax icons across the Portal and Runner waits out Claude's usage limit (Ready to Ship), and Mac app: Portal window and Clear next step at Ready to Ship (Building), go out the current way.
28. **Clear next step at Ready to Ship finishes as designed.** Milestone 2 then changes its next-step slot: for a milestone with a pull request the next step becomes Ship, which merges.

## Out of scope

- Deploy settings for projects other than Warehaus Portal.
- One-click local preview from the Mac app: its own milestone (Idea).
- The test Notion setup that removes the risk in decision 5.

## Consequences

- ADR-0007's Ship and deploy button is not built. Its ship run splits into a merge run and a deploy run.
- "Approval gates Shipped" (decisions 0017 and 0022) is covered by decision 8 and folded into milestone 2. Its Ask for an unapproved merge is replaced by decision 11: a merge on GitHub ships.
- Three standing rules change when their milestone ships, not before: Peter approves from the Vercel preview (milestone 1); only Peter sets Shipped on a milestone with a pull request (milestone 2); "deploy main" in chat is retired (milestone 3). Until then `AGENTS.md`, `CLAUDE.md` and the Cursor rule keep today's rules.
- The preview workflow gains write access to shared dev Convex. It still never targets production.
