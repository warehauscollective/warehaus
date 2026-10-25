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

`dev:convex` links a dev deployment and writes `apps/portal/.env.local`. Then open http://localhost:3100 and sign in.

## Fixture preview

When you do not have a dev Convex deployment:

```bash
npm run dev:portal:local
```

That sets `NEXT_PUBLIC_PORTAL_FIXTURES` and starts the portal on port 3100. Open http://localhost:3100/preview (unsigned fixture session). http://localhost:3100/login is the signed-out screen. Do not run this with `VERCEL_ENV=production`.

## Cursor

Command Palette → **Simple Browser: Show** → `http://localhost:3100`.

If the app is on another machine, forward port **3100** and open that same localhost URL.
