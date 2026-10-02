# Local portal preview

Branch `local/portal-stack-preview` stacks PR #20 only. Later portal PRs are not in this branch. The app listens on **http://localhost:3100** (`npm run dev:portal`).

This file has no live secrets. Copy placeholders into `apps/portal/.env.local`, which is gitignored.

## What you sign in as

Passwords are set by an internal Convex action (`localPreview:seedAndProvision`). That creates a verified Better Auth user and links the contact. No email is sent. Do not pass `BETTER_AUTH_SECRET` as a header or argument.

| Persona | Email | Password | Where |
| --- | --- | --- | --- |
| Staff admin | `ada.admin@warehaus.test` | `Local-Preview-1847` | http://localhost:3100 |
| Northwind client | `olivia.owner@northwind.test` | `Local-Preview-1847` | http://localhost:3100 or http://northwind.localhost:3100 |

Other seeded contacts (same password): `jordan.owner@contoso.test`, `sam.owner@fabrikam.test`.

Sample companies are Northwind Traders, Contoso Studio, and Fabrikam Goods, plus a Warehaus Internal org with an **Internal Warehaus** project.

## One-time Convex dev deployment

Cloud project creation needs your Convex login. From `apps/portal`:

```bash
npx convex login
npx convex project create warehaus-portal-local-dev
npx convex deployment create dev/portal-local --type dev --select
```

If you belong to more than one team, pass `--team <team_slug>` on `project create`. `npx convex login status` lists teams. You can also put a personal access token in the environment as `CONVEX_OVERRIDE_ACCESS_TOKEN` before those commands. Do not paste that token into chat.

`--select` writes `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL`, and `NEXT_PUBLIC_CONVEX_SITE_URL` into `.env.local`.

Then set dev-only Convex env vars (these stay on the new deployment):

```bash
npx convex env set SITE_URL http://localhost:3100
npx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
npx convex env set LOCAL_PREVIEW_SEED 1
```

Leave `NOTION_WAREHAUS_TOKEN`, `RESEND_API_KEY`, and `NOTION_WRITEBACK_ENABLED` unset. With no Resend key, mail is logged to the Convex console. With no Notion token, the sync pull returns without calling Notion.

## Every time you start the preview

From the repo root:

```bash
git fetch origin
git checkout local/portal-stack-preview
npm install
```

From `apps/portal` (deploys functions, then seeds):

```bash
npx convex dev --once
npx convex run localPreview:seedAndProvision '{"password":"Local-Preview-1847"}'
```

From the repo root:

```bash
npm run dev:portal
```

Open http://localhost:3100 and sign in. `seedAndProvision` is safe to re-run. It upserts sample rows and resets those preview passwords. It does not delete data.
