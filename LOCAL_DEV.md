# Local portal

Prerequisite: **Node 22**. From the repo root, run `npm install` once.

The portal is [http://localhost:3100](http://localhost:3100).

## Env names

Copy `apps/portal/.env.example` to `apps/portal/.env.local`. Commit names only, never values.

Dev Convex:

- `CONVEX_DEPLOYMENT`
- `NEXT_PUBLIC_CONVEX_URL`
- `NEXT_PUBLIC_CONVEX_SITE_URL`
- `NEXT_PUBLIC_SITE_URL`
- `SITE_URL`
- `BETTER_AUTH_SECRET`

Fixture preview:

- `NEXT_PUBLIC_PORTAL_FIXTURES`

Leave `NOTION_WRITEBACK_ENABLED` and `NOTION_PROJECT_CREATE_ENABLED` unset. Point Convex URLs at a **dev** deployment, not production.

## Start Convex dev and the portal

Two terminals, repo root:

```bash
npm run dev:convex -w @warehaus/portal
npm run dev:portal
```

`dev:convex` links a dev deployment and writes `apps/portal/.env.local` (`CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL`). A fresh deployment has no rows. Pull Notion, then create a staff login, then open http://localhost:3100.

Run every `npx convex` command below from `apps/portal`, with `dev:convex` still running, so they use that dev `CONVEX_DEPLOYMENT`. Do not pass `--prod`.

## First Notion pull

The pull reads Notion with `NOTION_WAREHAUS_TOKEN` on the dev deployment. That token is a read-only Notion integration. Set it with `npx convex env set` from `apps/portal`. Do not commit the value.

`BLOB_READ_WRITE_TOKEN` is optional. Leave it unset for a read-only pull: file copy is skipped, and the pull does not patch Notion page URLs.

Write-back flags stay unset.

`sync/trigger:schedulePull` is a staff mutation. It needs a signed-in Warehaus Staff session, which an empty deployment does not have yet. The CLI pull is the internal action `sync/pull:pullAll` (same pull the staff mutation schedules). With no prior sync cursor, that action does a full scan.

```bash
cd apps/portal
npx convex run sync/pull:pullAll
```

A later full rescan is `npx convex run sync/pull:pullAll '{"forceFull":true}'`.

## First staff login

After the pull, a Warehaus Staff contact with portal access enabled can sign in. Staff cannot self-register. `staffProvision:provisionStaffUser` creates the verified user and links that contact. It does not send mail.

Names already on the dev deployment: `SITE_URL`, `BETTER_AUTH_SECRET`. Do not pass `BETTER_AUTH_SECRET` into the function.

From `apps/portal`, run `npx convex run staffProvision:provisionStaffUser`. The JSON argument keys are `email`, `password`, and optional `name`. Use the staff contact’s email from the pull. Choose the password in a private shell: 12+ characters, mixed case, and a number or symbol. Do not commit it. Do not pass `--prod`.

Then sign in at http://localhost:3100/login.

## Fixture preview

When you do not have a dev Convex deployment:

```bash
npm run dev:portal:local
```

That sets `NEXT_PUBLIC_PORTAL_FIXTURES` and starts the portal on port 3100. Open http://localhost:3100/preview (unsigned fixture session). http://localhost:3100/login is the signed-out screen. Do not run this with `VERCEL_ENV=production`.

## Cursor

Command Palette → **Simple Browser: Show** → `http://localhost:3100`.

If the app is on another machine, forward port **3100** and open that same localhost URL.
