# Local portal

Prerequisite: **Node 22**. From the repo root, run `npm install` once.

The portal is [http://localhost:3100](http://localhost:3100).

Two Convex environments, and no third:

- Production is `unique-turtle-383`. Local dev and cloud agents never use it.
- One shared dev deployment. Peter's Mac and cloud agents both use that deployment. Do not create a Mac-only deployment or a separate cloud-agent deployment.

## Env names

Copy `apps/portal/.env.example` to `apps/portal/.env.local`. Commit names only, never values. Mac and cloud `.env.local` files point at the same shared dev deployment.

- `CONVEX_DEPLOYMENT` (`dev:<shared-dev-name>`, never `unique-turtle-383`)
- `NEXT_PUBLIC_CONVEX_URL`
- `NEXT_PUBLIC_CONVEX_SITE_URL`
- `NEXT_PUBLIC_SITE_URL`
- `SITE_URL`
- `BETTER_AUTH_SECRET`
- `CONVEX_DEPLOY_KEY` (name only; see Cloud agents)

Fixture preview:

- `NEXT_PUBLIC_PORTAL_FIXTURES`

Leave `NOTION_WRITEBACK_ENABLED` and `NOTION_PROJECT_CREATE_ENABLED` unset. Write-back stays off until the dev-only steps below.

## One-time Mac setup

Do this once, on Peter's Mac. It creates the single shared dev deployment. Do not repeat it on a cloud agent. Do not run it again in an empty checkout: `npx convex dev` with no `.env.local` creates another deployment.

1. Install Node 22. From the repo root, run `npm install`.
2. From `apps/portal`, run `npx convex login`, then `npx convex dev`. Create one dev deployment when asked. Wait until it writes `apps/portal/.env.local` with `CONVEX_DEPLOYMENT` starting `dev:`. That deployment is the shared one. Stop the process after the file is written.
3. From `apps/portal`, set a read-only Notion token on that deployment: `npx convex env set NOTION_WAREHAUS_TOKEN`. The CLI prompts for the value. Do not commit it. Leave the write-back flags unset.
4. First pull, from `apps/portal`, with Convex dev running: `npx convex run sync/pull:pullAll`. `sync/trigger:schedulePull` needs a staff user, which a new deployment does not have, so the first pull is this action.
5. Still from `apps/portal`: `npx convex run staffProvision:provisionStaffUser`. The JSON keys are `email`, `password`, and optional `name`. Use the staff contact email from the pull. Choose the password in a private shell. Do not commit it. Do not pass `--prod`.

After `.env.local` exists, day-to-day Mac work is `npm run dev:local` from the repo root. `npm run dev:convex` refuses to start until that file exists and names the shared `dev:` deployment.

## Cloud agents

Cloud agents use the shared dev deployment. They run Next against it.

```bash
npm run dev:portal
```

That runs the preflight, then the portal on port 3100. It does not run `convex dev`.

`convex dev` pushes functions to the shared dev deployment. Cloud agents do not run `npm run dev:local`, `npm run dev:convex`, `npx convex dev`, or `npx convex deploy`. They do not push functions unless a PR changes files under `convex/` and Peter has supplied a dev deploy key. A PR that changes `convex/` still does not update the shared dev deployment until Peter pulls that branch and runs `npx convex dev` himself. Production `unique-turtle-383` is never the target. Do not pass `--prod`.

The dev deploy key name is `CONVEX_DEPLOY_KEY`, scoped to the shared dev deployment, not production. Peter creates that key. Do not create a key in a PR. Do not put the value in the repo, a doc, or chat.

## Write-back in dev only

Leave both flags unset on a normal checkout. The worker and enqueue are no-ops until `NOTION_WRITEBACK_ENABLED` is exactly `true`. Project create also needs `NOTION_PROJECT_CREATE_ENABLED` exactly `true`, and still does nothing while write-back is off.

Turn write-back on only on the shared dev deployment, from `apps/portal`, while Convex dev is running. Do not pass `--prod`. Do not target `unique-turtle-383`.

```bash
cd apps/portal
npx convex env set NOTION_WRITEBACK_ENABLED true
```

The value is the word `true`. That is not a secret. Do not set it on production.

To turn it off again, remove it. Unset is off. The string `false` is also off. Only the exact string `true` is on.

```bash
npx convex env remove NOTION_WRITEBACK_ENABLED
```

One manual check, against one test task, after Peter pulls this branch and runs `npx convex dev` so the new tables exist:

1. Confirm `CONVEX_DEPLOYMENT` is the shared `dev:` deployment and does not contain `unique-turtle-383`.
2. Set `NOTION_WRITEBACK_ENABLED` to `true` on that deployment only.
3. Read one test task's Notion `last_edited_time`.
4. From `apps/portal`: `npx convex run sync/taskWrite:enqueueStatus` with JSON keys `taskId`, `status` (`Inbox`, `To Do`, `Blocked`, `In Progress`, or `Done`), and `expectedLastEditedTime` (that ISO time).
5. The worker runs on the outbox cron, or `npx convex run sync/outboxWork:processDue`.
6. Confirm the test task's Status in Notion, one `auditEvents` row, and no second write if the same command is run again.
7. Remove `NOTION_WRITEBACK_ENABLED` when finished. Leave `NOTION_PROJECT_CREATE_ENABLED` unset.

Do not point this at a client row you cannot afford to change. Stage, Parent item, and Resources are not writable.

## Deploy policy

Standing rule (Peter, Oct 25): build and test the portal on localhost. Nothing deploys to Vercel or production Convex `unique-turtle-383` without Peter's explicit yes for that one deploy.

`apps/portal/vercel.json` sets `git.deploymentEnabled` to false for Vercel project `warehaus-portal` (root directory `apps/portal`). Pushes, pull requests, and merges to `main` start no portal builds. This does not change the Vercel dashboard. It applies once this file is on the branch Vercel reads.

`warehaus-portal` does not build the marketing site. Marketing is `apps/web`, with its own `apps/web/vercel.json` (`@warehaus/web`). This guard does not turn marketing builds off. A separate Vercel project named `portal` expects `.next` at the repo root. That project is not the portal. Leave it alone.

The only approved Vercel production path is a manual `vercel deploy --prod` from `apps/portal` after Peter approves that deploy. Do not run `npx convex deploy` or `npx convex dev --prod`. Both target production `unique-turtle-383`.

## Start on a Mac

From the repo root:

```bash
npm run dev:local
```

That runs the preflight, then `convex dev` in `apps/portal` (pushes functions to the shared dev deployment) and the portal on port 3100.

Two terminals, same checks:

```bash
npm run dev:convex
npm run dev:portal
```

`dev:convex` pushes. `dev:portal` is Next only.

Run other dev `npx convex` commands from `apps/portal` while Convex dev is running, so they use the shared `CONVEX_DEPLOYMENT`. Do not pass `--prod`. Use Option A or Option B, then open http://localhost:3100.

## Option A: Notion pull

The pull reads Notion with `NOTION_WAREHAUS_TOKEN` on the shared dev deployment. That token is a read-only Notion integration. Set it with `npx convex env set` from `apps/portal`. Do not commit the value.

`BLOB_READ_WRITE_TOKEN` is optional. Leave it unset for a read-only pull: file copy is skipped, and the pull does not patch Notion page URLs.

Write-back flags stay unset unless you are on the dev-only steps below. Production `unique-turtle-383` never gets either flag.

`sync/trigger:schedulePull` is a staff mutation. It needs a signed-in Warehaus Staff session, which an empty deployment does not have yet. The CLI pull is the internal action `sync/pull:pullAll` (same pull the staff mutation schedules). With no prior sync cursor, that action does a full scan.

```bash
cd apps/portal
npx convex run sync/pull:pullAll
```

A later full rescan is `npx convex run sync/pull:pullAll '{"forceFull":true}'`.

## Option B: copy production data into dev

This reads production once, then writes only to the shared dev deployment.

From `apps/portal`, export is read-only on prod `unique-turtle-383`:

```bash
cd apps/portal
npx convex export --prod --path portal-dev-import.zip
```

The zip holds client rows and Better Auth tables (sessions and password hashes). Keep it out of the repo. Delete it after import.

Before import, confirm `CONVEX_DEPLOYMENT` in `apps/portal/.env.local` is the shared dev deployment, not `unique-turtle-383` and not a newly created deployment. Stop if it is not `dev:` or if the name contains `unique-turtle-383`:

```bash
cd apps/portal
line=$(grep -E '^CONVEX_DEPLOYMENT=' .env.local | head -1)
name=${line#CONVEX_DEPLOYMENT=}
name=${name%%#*}
name=$(printf '%s' "$name" | tr -d ' "\047')
printf '%s\n' "$name"
case "$name" in
  dev:*) ;;
  *) printf 'Stop. Not a dev deployment: %s\n' "$name"; exit 1 ;;
esac
case "$name" in
  *unique-turtle-383*) printf 'Stop. Production deployment.\n'; exit 1 ;;
esac
```

Import into the shared dev deployment only. Do not pass `--prod`:

```bash
npx convex import --replace portal-dev-import.zip
rm portal-dev-import.zip
```

`convex import` has no exclude flag, and the zip should stay intact. After import, wipe auth tables on the shared dev deployment with an empty file (this replaces every row in that table):

```bash
touch /tmp/empty.jsonl
npx convex import --component betterAuth --table session --replace --yes /tmp/empty.jsonl
npx convex import --component betterAuth --table verification --replace --yes /tmp/empty.jsonl
npx convex import --component betterAuth --table twoFactor --replace --yes /tmp/empty.jsonl
npx convex import --component betterAuth --table jwks --replace --yes /tmp/empty.jsonl
npx convex import --component betterAuth --table oauthAccessToken --replace --yes /tmp/empty.jsonl
npx convex import --component betterAuth --table oauthApplication --replace --yes /tmp/empty.jsonl
npx convex import --component betterAuth --table oauthConsent --replace --yes /tmp/empty.jsonl
```

Those names are the `betterAuth` component tables (`defineComponent("betterAuth")`): `session`, `verification`, `twoFactor`, `jwks`, `oauthAccessToken`, `oauthApplication`, `oauthConsent`. `account.password` is the password hash and `session.token` is the session. Leave `user` and `account` in place if you want login. A dev sign-in then reuses the copied accounts (same email and password hash). `contacts.authUserId` still points at the copied `user` rows.

Wiping `account` removes the hashes, so those passwords stop working. Use the staff provision step below after that. Do not wipe `user` if those contact links should keep working. Do not pass `--prod` on any wipe.

## First staff login

Use this after Option A, or after Option B if you wiped `account`. A Warehaus Staff contact with portal access enabled can sign in. Staff cannot self-register. `staffProvision:provisionStaffUser` creates the verified user and links that contact. It does not send mail.

Names already on the shared dev deployment: `SITE_URL`, `BETTER_AUTH_SECRET`. Do not pass `BETTER_AUTH_SECRET` into the function.

From `apps/portal`, run `npx convex run staffProvision:provisionStaffUser`. The JSON argument keys are `email`, `password`, and optional `name`. Use the staff contact’s email from the pull. Choose the password in a private shell: 12+ characters, mixed case, and a number or symbol. Do not commit it. Do not pass `--prod`.

Then sign in at http://localhost:3100/login.

## Fixture preview

When you are not using Convex, and you have no `.env.local`:

```bash
npm run dev:portal:local
```

That does not run the preflight. It sets `NEXT_PUBLIC_PORTAL_FIXTURES` and starts the portal on port 3100. Open http://localhost:3100/preview (unsigned fixture session). http://localhost:3100/login is the signed-out screen. Do not run this with `VERCEL_ENV=production`.

## Cursor

Command Palette → **Simple Browser: Show** → `http://localhost:3100`.

If the app is on another machine, forward port **3100** and open that same localhost URL.
