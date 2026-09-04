# Warehaus — agent instructions

Monorepo for the Warehaus **website** (`apps/web`, `:3000`) and **client portal**
(`apps/portal`, `:3100`). See root `README.md` for everyday commands.

## Cursor Cloud specific instructions

Cloud Agents MUST follow this section when testing or changing the portal.

### Portal URL

- Local: **http://localhost:3100** (pinned; do not use `:3001` — that is often the website)
- Login gate: unauthenticated routes redirect to `/login`
- Production reference: `https://warehaus-portal.vercel.app` (Vercel project `warehaus-portal`)

### Default test accounts (always use these)

Invite-only: email must match a Convex Contact with Portal Access. Seeded contacts +
Better Auth users are created by `scripts/ensure-portal-test-auth.mjs`.

| Role | Email | Password | Use for |
| --- | --- | --- | --- |
| **Client (preferred for UI testing)** | `demo@northbay.test` | `WarehausDemo1!` | Dashboard, projects, client tenancy |
| Staff | `team@warehaus.co` | `WarehausTeam1!` | Staff / internal org views |

Optional env overrides (same defaults if unset): `PORTAL_TEST_EMAIL`,
`PORTAL_TEST_PASSWORD`, `PORTAL_STAFF_EMAIL`, `PORTAL_STAFF_PASSWORD`.

**Do not invent new passwords** for these emails unless the user asks — keep them
stable so every Cloud Agent run can sign in the same way.

### Boot + auth checklist (every Cloud Agent session)

1. `npm install` (if needed)
2. Refresh portal env + seed:
   ```bash
   bash scripts/portal-cloud-bootstrap.sh
   ```
   Or manually:
   ```bash
   cd apps/portal && npx vercel link --yes --project warehaus-portal --scope warehaus-collective
   npx vercel env pull .env.local --yes --environment development
   # Force local auth cookies:
   # NEXT_PUBLIC_SITE_URL=http://localhost:3100 and SITE_URL=http://localhost:3100
   ```
3. Start portal (leave running):
   ```bash
   npm run dev:portal
   ```
4. Ensure accounts exist (after portal is up):
   ```bash
   node scripts/ensure-portal-test-auth.mjs --wait-portal
   ```
5. For GUI testing, open `http://localhost:3100/login` and sign in with
   **`demo@northbay.test` / `WarehausDemo1!`** before exercising authenticated UI.
   Contact linking may show “Linking contact…” for a few seconds.

### Auth / Convex notes

- Portal SoT is **Convex** (deployment URL in `NEXT_PUBLIC_CONVEX_URL` from Vercel).
- Do **not** share Motoko’s Convex deployment with the portal.
- `seed:seedDemoTenants` and `seed:seedDemoBilling` are idempotent.
- If sign-in fails with “password”, re-run `ensure-portal-test-auth.mjs` or use
  “Create password” on `/login` for that email (contact must already be seeded).

### Ports

| App | Port |
| --- | --- |
| Website `@warehaus/web` | `3000` |
| Portal `@warehaus/portal` | `3100` |

Dev scripts fail fast if the port is busy (avoids Next auto-bump confusion).

### Manual UI testing

When changing portal UI (`.tsx` / styles), use computer-use against
`http://localhost:3100` **while signed in** as `demo@northbay.test`. Capture
walkthrough artifacts under `/opt/cursor/artifacts`.
