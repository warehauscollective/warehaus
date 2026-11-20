# Issue tracker: Portal milestones

Work for this repo is tracked in the Warehaus Portal, not in GitHub Issues. The rules are the Milestone Build Protocol in `AGENTS.md`; this file tells the engineering skills how to apply them.

## Where work lives

- Every change belongs to a Portal milestone, or to a task inside one. A pull request names that task.
- Dev updates are posted on the milestone: the next action and the PR link.
- Peter's feedback becomes iteration tasks in the same milestone.
- Peter approves in Grok Bot chat or in the Portal. Never in Notion.

## What the skills do here

- `to-spec` and `to-tickets`: write the spec or the task breakdown as a draft in the conversation, shaped as one milestone with its tasks. Do not run `gh issue create`. Peter creates the milestone and tasks in the Portal, or asks for them to be created there.
- `implement` and `pr`: the PR description names the milestone task it belongs to. If no task exists yet, stop and ask for one before opening the PR.
- `triage`: not configured for this repo. There are no triage labels, and GitHub Issues is not a request queue. Do not create GitHub labels.

## What not to do

- Do not create, label, close or comment on GitHub issues as a way of tracking work.
- Do not treat a merged PR as a release. Merging does not deploy; see `AGENTS.md`.
