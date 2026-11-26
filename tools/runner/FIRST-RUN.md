# Set up a Mac as a runner

For Warehaus staff. Everything here happens in the Portal and in the Warehaus Runner app. You never open a terminal.

A runner is a staff Mac that takes milestone work from the Portal and hands it to an agent. The app keeps it going in the menu bar, starts it at login, and updates it between runs.

**You need:** a staff account on the Portal, a Mac with Apple silicon on macOS 14 or later, a GitHub account with push access to the repositories you build, and a Claude account.

## 1. Download the app

1. In the Portal, open any project and click the runner status chip next to its name. The Runner status modal opens.
2. Choose **Set up runner**, then **Download runner app**. Only staff see this.
3. Move **Warehaus Runner** from Downloads to **Applications**. It has to live there so it can update itself.

The app is signed by Warehaus LLC and notarized by Apple, so it opens like any other app. It is only ever downloaded from the Portal, never the App Store.

If the modal says the runner app has no release yet, it is published with the next production deploy that changes the runner. Ask Peter.

## 2. Open it and follow the checklist

Open Warehaus Runner from Applications. A window called **Set up this Mac as a runner** lists three steps. Each one opens your browser, and nothing installs without a click.

1. **GitHub.** Click **Sign in**. GitHub opens in your browser, and the row shows a one-time code to enter there. When you're done the row says "Signed in as <your login>". If it already shows a green check, you're signed in.
2. **Claude Code.** If it says "Not installed yet", click **Install**. That runs Anthropic's official installer, then asks you to sign in through your browser. If Claude Code is already installed it only asks you to sign in.
3. **Pair with the Portal.** This unlocks after the first two. Click **Pair**.

## 3. Confirm this Mac in the Portal

When you click Pair, a second window, **Confirm this Mac in the Portal**, shows a pairing code like `K7QM-4XPA`, the runner id this Mac proposes, and how long the code has left. Your browser opens the Portal with the same code filled in.

1. In the Portal, **Confirm this runner** shows the code and the deployment (Production). Check the code matches the one in the app.
2. The runner id is this Mac's name with `-prod` at the end. You can change it.
3. Click **Confirm and pair**.

The app window closes on its own and the runner starts. The Portal shows **Runner paired**.

- A code lasts 10 minutes. If it runs out, the checklist says so; click **Pair again**.
- If the browser didn't open, click **Open Portal again**.
- Only confirm a code you can see in the app on your own Mac.

The runner's secret is made on your Mac and kept in its Keychain. Nobody sees it, and you never copy it.

## 4. The menu bar

The Warehaus icon in the menu bar shows what the runner is doing.

| State | What it means | Rows you'll see |
| --- | --- | --- |
| **Ready** | Waiting for work. The header shows the runner id, "Production", and the last run. | Pause runner · Open Portal |
| **Working** | A run is in progress. The header names the milestone and task. The Mac stays awake until the run ends. | Pause after this run · Open milestone in Portal (or Open Portal) |
| **Paused** | Takes no new work. The Portal shows Paused. | Resume runner · Open Portal |
| **Needs attention** | Something only you can fix. The header says what, and the first row fixes it when it can. | The fix · Open Portal · Pause runner or Resume runner |

Every state also has:

- **The update line and Check for update**: see "Updates" below.
- **Start at login**: On by default. Click it to turn it off or on.
- **Remove this runner…**
- **Quit**: stops the runner until you open the app again. Quitting during a run stops that run, so choose **Pause after this run** first. A stopped run is released for Retry in the Portal after about 30 minutes.

**Pausing.** Pause runner stops new work. During a run the row reads **Pause after this run**: the run finishes, then the runner pauses. **Keep working after this run** cancels that. The app remembers a pause after a restart.

You get a notification only when you need to act, such as a GitHub sign-in that expired. Nothing is sent for normal work.

## 5. Updates

The app updates itself between runs, never during one.

It checks when it opens, about every six hours, and when you click **Check for update**. The update line says where it stands:

- **Up to date** · v0.1.0
- **Checking for update…**
- **Downloading update…**
- **Update waits for this run**: a run is in progress, and the update installs after it.
- **Installs before the next run**
- **Installing update…**: the app stops the runner, replaces itself, and opens the new version. It takes a few seconds.
- **Update failed: …**: says why, and offers Check for update again. Nothing was installed.
- **Can't update here. Move the app to Applications.**

Before installing, the app checks that the download is the exact build the Portal named, is signed by Warehaus, and is notarized by Apple. If the new version doesn't start, the old one puts itself back.

## 6. Remove this runner

Choose **Remove this runner…** in the menu, then **Remove runner** to confirm. The app:

- revokes the runner in the Portal, so it stops taking work at once,
- hands any run in progress back to the Portal for Retry,
- takes Warehaus Runner out of your login items,
- deletes the runner's secret from this Mac's Keychain.

If the Portal can't be reached, the runner is still removed from the Mac, and a notification asks you to revoke it in the Portal under **Manage runners**.

Staff can also revoke any runner from the Portal: Runner status › **Manage runners** › **Revoke runner**.

## 7. A Mac that was set up from the terminal

Some Macs were set up before the app existed. Opening the app on one of them is safe.

- If this Mac is already paired, the checklist says "Already paired as <id>. This app takes it over." There's no need to pair again.
- If the old runner still starts at login, the checklist explains that and shows **Replace it**. Click it, and the app stops the old runner, removes it from login, and runs the runner itself. Until you click, the app doesn't start a second runner.

## Troubleshooting

Everything here is done in the app or the Portal.

| You see | Do this |
| --- | --- |
| The Portal chip says **Offline** | Open Warehaus Runner from Applications. If it's open, check it isn't Paused. |
| The Portal says **Runner out of date** | Click **Check for update** in the menu. The update installs after any run in progress. |
| **GitHub sign-in expired** | Choose **Sign in to GitHub…** in the menu. |
| **This runner was revoked in the Portal** or **isn't paired yet** | Choose **Pair with the Portal…** and confirm the code in the Portal. |
| **The runner keeps stopping** | Choose **Restart runner**. |
| **Can't reach the Portal** | Check your internet connection. The runner keeps trying on its own. |
| **The runner files are missing** | Download the app again from the Portal and replace the one in Applications. |
| **Can't update here** | Move Warehaus Runner into Applications in Finder, then open it again. |
| **Update failed** | Click **Check for update** again. If it keeps failing, tell Peter. |
| Anything else | Choose **Remove this runner…**, then open the app and pair again. |

The app runs Claude Code headless, so its work uses the monthly Agent SDK credit, not your Claude plan limits.

---

## Not for staff: first live milestone run (developers)

A checklist for developers testing the whole milestone pipeline end to end on shared dev `graceful-mastiff-960`: create a milestone, plan it, press Go, build, preview, approve, merge. It uses terminal commands, the CLI and shared dev. Nothing here touches production `unique-turtle-383`. Staff never need it. See "For developers and maintainers" in `README.md` first.

1. **Start from current `main`** and run the tests: `npm run test:runner` and `npm run test:portal-convex`. Merging does not deploy anything. Production still waits for Peter's "deploy main".
2. **Push to shared dev only.** Push the schema and functions to `graceful-mastiff-960` once, then stop. Never use `--prod`, never run `npx convex deploy`, and don't leave `convex dev` running. Set `GITHUB_WEBHOOK_SECRET` on the dev deployment, and `VERCEL_WEBHOOK_SECRET` if you want the Vercel preview link on the milestone.
3. **Set up a test project**, not a client one. Set its repository on the project page (`ProjectRepoSetting`) or with `projects.setAgentRepo`, as `owner/name`. On that GitHub repository, add a webhook to `https://graceful-mastiff-960.convex.site/github/webhook` (JSON, the same secret, Pull requests events). Optionally add a Vercel webhook to `/vercel/webhook`.
4. **A dev runner.** Release builds of the app pair to production only, so on shared dev use the CLI: `npm run runner -- setup`, then confirm the code in the Runner status modal on a dev Portal. Use the default `--mode interactive`; `--mode headless` draws on the Agent SDK credit. For a Cursor project, export `CURSOR_API_KEY` in that shell only.
5. **Grok Bot.** Connect it to the Portal MCP server (`docs/portal-mcp.md`) and have it check `list_needs_peter`.
6. **Vercel.** Confirm the Preview environment points at `graceful-mastiff-960`, not `unique-turtle-383`.
7. **Dry run.**
   1. Create a milestone with no tasks. Its planning gets queued.
   2. `npm run runner -- start --once`. The runner writes 3 to 10 tasks and leaves the milestone in Planning. Staff edit the list, then move it to Awaiting Go.
   3. Press Go. The milestone moves to Building.
   4. Run the same command once per task. Each task ends with a commit on `milestone/<slug>`, one PR into the default branch, and the task Done with its commit.
   5. Test a blocked task once: have Claude write `.runner/blocked.txt`. A "needs Peter" note appears.
   6. After the last task the milestone moves to Ready to Ship, with the local preview stored. Open it with `npm run preview:pr -- milestone/<slug>`. A Parked task does not hold this up.
   7. Request changes once. A review task appears, and the milestone goes back to Building.
   8. Approve. That records the decision and nothing else.
   9. Merge the test PR. The webhook moves the milestone to Shipped.

Watch for:

- **Notion:** shared dev still uses the production Notion token, so use Portal-only test tasks.
- **Stuck runs:** the 10-minute cron releases a run stuck for over 30 minutes. See "Retry and the run it replaces" in `README.md`.
- **No work:** check the project names its repository, and that any `--repo` matches it exactly.
- **Clone failed:** check `gh auth status` and `gh auth setup-git`.
