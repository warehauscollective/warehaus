# ADR-0003: Task changes save first

Status: Accepted, Peter, 2026-11-24.

Peter approved these decisions in the architecture review session on 2026-11-24 ("Yes to all" across two rounds). They come from candidate 5 of that review: one task-change module in place of the per-field paths.

## Context

A staff edit to a task field reached Notion along one of many paths. Each path decided for itself when to save the task row:

- Stage, due date and Mark done saved the row before Notion confirmed.
- Status, live fields, description and resources did not save the row at all. The value showed only after the next pull.
- The staff API and the merge webhook saved the row after queueing the Notion write.

Only the staff API and the webhook wrote field stamps. So a newer Notion pull always overwrote a staff UI edit, and nothing protected date, estimate, source, publish, name or description. With write-back off, some fields saved in the portal and others refused.

## Decisions

1. **A task change saves the row first.** Every field it touches is written to the task row in the same mutation that queues the Notion write, before Notion confirms.
2. **Every field the portal writes is stamped.** The stamp records when and by whom. A Notion pull replaces a stamped field only when Notion's edit is newer than the stamp. The pull and the task change read and write one stamp format.
3. **A failed write-back does not roll back.** When the Notion write ends in conflict or dead, the portal keeps its value and raises a staff notice naming the field. The value stays until someone edits that field in Notion after the stamp.
4. **Write-back off still saves.** The change is saved and stamped in the portal, no outbox row is queued, and the result says `off`. This follows ADR-0002 decision 6: a refused write is skipped, not failed.
5. **A change is checked whole.** Every field is saved, or none. A stale `expectedLastEditedTime` refuses the change before any write.
6. **Stage keeps its pending stage.** A stage move also marks the task pending until Notion confirms, and the drain resends pending stages. Other fields need no pending mark, because the stamp protects them and the outbox resends on its own.

## Considered options

- **Wait for Notion to confirm before saving.** Rejected. Staff would see the old value for seconds or, with write-back off, forever, and every field would need pending state.
- **Roll back the row when the write fails.** Rejected. A rollback can erase a later edit, and a conflict often means Notion changed for an unrelated reason. A notice lets a person decide.
- **Stamp only the fields the staff API writes.** Rejected. That is today's behaviour, and it lets a pull silently overwrite UI edits.

## Consequences

- The portal can disagree with Notion until a person resolves it. The notice and the stamp make the disagreement visible instead of silent.
- `fieldStamps` grows to every field the portal writes.
- Old outbox rows of kind `update` still validate and still send. Nothing new writes that kind for tasks; a later change drops it once none is left.
- Build plan: one Portal milestone, "Task change", on branch `milestone/task-change`, with no design task. Product Design Lead checks screenshots of the task modal in Dark and Light at 1440 and 390.
  1. Core: `convex/_lib/taskChange.ts` with typed changes and one result, typed write kinds, the outbox insert as a plain function, wider `fieldStamps` and `stagePendingBy`, and one pull merge, `mergePulledTask`
  2. Staff edits: every task mutation in `tasks.ts` goes through it, and the per-field enqueue mutations in `sync/taskWrite.ts` are deleted
  3. Other writers: the staff API `updateTask`, `createTask` and `addLink`, the merge webhook, the pending-stage drain, and closeout park and undo
  4. Confirms: every confirmed task write updates `lastEditedTime`, conflict and dead raise the notice, and a repeated key whose row is dead or in conflict is refused
  5. UI: one note for every task field, with status and stage shown at once
  6. Cleanup: dead code, docs, checks, and the pull request

  Peter previews locally with write-back off on shared dev. It merges after he approves. Merging does not deploy.
