# First live milestone run

A checklist for the first end-to-end run of the milestone pipeline: create a milestone, plan its tasks, press Go, let the runner build, preview, approve, merge.

Every step uses shared dev `graceful-mastiff-960`. Nothing here touches production `unique-turtle-383`.

## 1. Merge (after Peter approves in Grok Bot or the Portal)

Merge in this order, rebasing each PR onto `main` before the next:

1. [#141](https://github.com/warehauscollective/warehaus/pull/141)
2. [#138](https://github.com/warehauscollective/warehaus/pull/138)
3. [#139](https://github.com/warehauscollective/warehaus/pull/139)
4. [#140](https://github.com/warehauscollective/warehaus/pull/140)
5. [#142](https://github.com/warehauscollective/warehaus/pull/142)
6. [#143](https://github.com/warehauscollective/warehaus/pull/143)

Run the tests on `main` once all six are in:

```bash
npm run test:runner
```

Merging does not deploy anything. Production still waits for Peter's "deploy main".

## 2. Push to shared dev only

- Push the schema and functions to `graceful-mastiff-960` once, then stop. Never use `--prod`, never run `npx convex deploy`, and don't leave `convex dev` running.
- Set these environment variables on the dev deployment:
  - `RUNNER_TOKENS=peter-mbp=<random token, at least 24 characters> <owner/name>`
  - `GITHUB_WEBHOOK_SECRET=<secret>`
  - `VERCEL_WEBHOOK_SECRET=<secret>`, if you want the Vercel preview link on the milestone.

## 3. Set up the test project

- Pick a test project, not a client one. Set its repository with the staff screen (`ProjectRepoSetting`) or with `projects.setAgentRepo`, as `owner/name`. A project without this is never handed to a runner.
- On that GitHub repository, add a webhook:
  - URL: `https://graceful-mastiff-960.convex.site/github/webhook`
  - Content type: JSON
  - Secret: the same `GITHUB_WEBHOOK_SECRET`
  - Event: Pull requests
- Optional: add a Vercel webhook pointing at `/vercel/webhook` with `VERCEL_WEBHOOK_SECRET`.

## 4. Mac runner

```bash
export PORTAL_AGENT_URL=https://graceful-mastiff-960.convex.site
```

```bash
export RUNNER_TOKEN=<the token for peter-mbp>
```

- The runner does not pass `RUNNER_TOKEN` into Claude, so the Activity hook posts nothing from inside the session. The start and the finish of a run are still reported.
- Use the default `--mode interactive`. `--mode headless` draws on the Agent SDK credit instead of plan limits.

## 5. Grok Bot

- Connect it to the Portal MCP server (see `docs/portal-mcp.md`).
- Tell it to check `list_needs_peter` and bring Peter any open notes.

## 6. Vercel check

Open the Vercel dashboard. Confirm the Preview environment variables point at `graceful-mastiff-960`, not `unique-turtle-383`, and that `REVIEW_PREVIEW` isn't set to `1` anywhere builds aren't wanted.

## 7. Dry run

1. Create a milestone with no tasks on the test project. Its planning gets queued.
2. Have the runner plan it:

   ```bash
   npm run runner -- start --id peter-mbp --repo <owner/name> --once
   ```

   The runner should write 3 to 10 tasks and leave the milestone in Planning. Staff edit the list, then move it to Awaiting Go.
3. Press Go. The milestone moves to Building.
4. Run the same command once per task. Each task should end with a commit on `milestone/<slug>`, one PR into the default branch, and the task marked Done on the Tasks tab with its commit.
5. Test a blocked task once: have Claude write `.runner/blocked.txt`. A "needs Peter" note should appear, and Grok Bot should pick it up.
6. When the last task is done, the milestone should move to Ready to Ship with the local preview stored and an approval note written. Open the preview with:

   ```bash
   npm run preview:pr -- milestone/<slug>
   ```

7. Test the review loop once: request changes. A review task appears, the milestone goes back to Building, and the runner claims the task.
8. Approve. That records the decision and nothing else.
9. Merge the test PR. The webhook should move the milestone to Shipped.

## Watch for

- **Notion:** shared dev still uses the production Notion token, so Portal-only test tasks are safest. Avoid any step that writes synced Notion tasks.
- **Stuck runs:** a run stuck over 30 minutes is released by the 10-minute cron. No manual fix is needed.
- **Repo mismatch:** if the runner gets `kind: 'none'`, check that `--repo` matches the project's repository setting exactly.
