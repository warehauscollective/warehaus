# ADR-0008: The design gate

Status: Accepted, Peter, 2026-11-26. Settled in the milestone lifecycle grilling (Portal project decisions 0016, 0020 and 0024). Built in the Portal milestone "Design gate and task kinds" (Warehaus Portal).

## Context

The build protocol puts design first: on a milestone that changes what people see, the Figma work is done and Peter approves it before any build task starts. Until now that rule lived only in the docs. Approve designs in the Portal recorded who and when and added a line to the runner's prompt, but the runner did not wait for it. Nothing told a design task from a build task.

## Decisions

1. **Every task has a kind, Design or Build.** It is stored on the task as `kind` (`design` or `build`). A task with no kind, including every task written before this ADR, reads as Build. Staff set it in the task modal, the staff API and the MCP (`create_task`, `update_task`, `create_milestone` `proposedTasks`). The planner sets it on every task it writes.
2. **A visual milestone is one with at least one design task.** Only top-level tasks that are not archived and not Parked count. Subtasks follow their parent.
3. **The runner holds build tasks until Peter approves the designs.** On a visual milestone without `designApprovedAt`, the claim offers only design tasks. A milestone with no design task is not gated. The check is in the claim itself (`classifyClaimable`), so every runner obeys it.
4. **A design task works in Figma and never changes code.** It follows `docs/design/figma-protocol.md`. With no commit to report, the runner reports it done through `.runner/design-done.txt`.
5. **When the last design task is done, one Approve designs Ask opens on Peter.** It opens only while the milestone is Building, not archived, the designs are not approved, and build work is still waiting. It closes when Peter approves, requests design changes, or the milestone leaves Building. Every path that can finish a design task keeps it in step: a runner finishing, a staff task change, a status change, a kind change.
6. **Building shows a phase, derived, never stored.** Designs while a design task is open; Waiting on design approval once they are all done and not approved; then plain Build. It shows after Building on the tile, the details STATUS field and the status menu, to staff only.
7. **Peter can request design changes instead of approving.** Request design changes sits beside Approve designs in the tile's Status box and is in the MCP (`request_design_changes`, `grok-bot` token only). It needs notes. It adds top-level design tasks (origin review, the current round) whose description names the design tasks they revise, closes the Ask, and keeps build locked. It is refused once the designs are approved.
8. **Approve designs never moves Status, merges or deploys.** It records the approval and unlocks build.
9. **Approve designs needs a design task that is done** (amendment of 2026-11-28, milestone Milestone Improvements). The button shows to Peter, from Idea to Building, only on a visual milestone with at least one design task done. A milestone with no design task has nothing to approve, and one whose design tasks are all still open has nothing to look at yet: neither shows the button, and the `approveDesign` mutation refuses both with a plain reason ("This milestone has no design tasks.", "No design task is done yet."). The tile reads this from `designGate.doneDesign`. Request design changes sits beside the button, so it follows the same rule on the tile.

## Consequences

- Design-first is enforced by the runner, not by memory. Docs that called Approve designs "a record, not a gate" are updated.
- A milestone a person plans by hand is gated only if someone marks a task Design. The planner adds a design task first whenever the milestone changes what people see.
- A design change after approval adds an open design task, so Building shows Designs again, but build is not re-locked. Re-locking needs a new decision.
