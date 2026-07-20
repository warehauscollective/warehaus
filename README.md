# Warehaus

Monorepo for the Warehaus **website** and **client portal** — shared design
tokens and logic, separate deployable apps.

## Apps

| App | Package | Local port | Role |
| --- | --- | --- | --- |
| Website | `@warehaus/web` | **`3000`** | Marketing site (Next.js) |
| Portal | `@warehaus/portal` | **`3100`** | Client product shell (Next.js) — deploy on `portal.` subdomain |

> **Port collision warning:** If something else already owns `:3000`, plain
> `next dev` auto-bumps the website to `:3001`. That makes `localhost:3001`
> look like “the portal” while it’s still the marketing site — and
> `/portal` then shows the website shell (or a 404). Our `dev` scripts
> **fail fast** instead of stealing ports. Portal lives on **`:3100`** so it
> stays out of Next’s 3000→3001 bump chain.

A React Native **portal** (`apps/native`) is planned later. There will be no RN
marketing site. Architecture: [`docs/monorepo-portal-architecture.md`](docs/monorepo-portal-architecture.md).

## Packages

| Package | Role |
| --- | --- |
| `@warehaus/tokens` | Design tokens → CSS vars (web) + JS maps (native later) |
| `@warehaus/logic` | Pure nav/config helpers (portal IA today) |
| `@warehaus/typescript-config` | Shared TSConfig bases |

## Commands

```bash
npm install

# Run each in its own terminal (pinned ports, fail if busy):
npm run dev:web        # website → http://localhost:3000
npm run dev:portal     # portal  → http://localhost:3100

# If :3000 is taken by another project on your machine:
WEB_PORT=3020 npm run dev:web
# optional: PORTAL_PORT=3100 npm run dev:portal

npm run build          # all apps (Turborepo)
npm run build:web
npm run build:portal

npm run tokens         # regenerate packages/tokens/dist/tokens.css
npm run typecheck
npm run lint
```

How to tell which app you’re on:

| URL | App | Dock tabs |
| --- | --- | --- |
| `http://localhost:3000` | Website | DREAM · DESIGN · DEVELOP |
| `http://localhost:3100` | Portal | DASHBOARD · PROJECTS · CHATROOM · ACTIVITY · ACCOUNT |

Website `/portal` redirects to `NEXT_PUBLIC_PORTAL_URL` (default `http://localhost:3100`).

Package manager: **npm workspaces**. Orchestration: **Turborepo**.

## Deploy

Two Vercel projects from this repo (recommended):

- Website → root directory `apps/web`
- Portal → root directory `apps/portal`

## Brand

Heading font: **Eurostile** (see `CLAUDE.md` / style guide).
