# Warehaus

Monorepo for the Warehaus **website** and **client portal** — shared design
tokens and logic, separate deployable apps.

## Apps

| App | Package | Port | Role |
| --- | --- | --- | --- |
| Website | `@warehaus/web` | `3000` | Marketing site (Next.js) |
| Portal | `@warehaus/portal` | `3001` | Client product shell (Next.js) — deploy on `portal.` subdomain |

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

npm run dev            # website → http://localhost:3000
npm run dev:portal     # portal  → http://localhost:3001 (home tab: PORTAL)

# Website /portal redirects to the portal app (NEXT_PUBLIC_PORTAL_URL, default :3001).
# Run both apps when following Portal links from the marketing site.

npm run build          # all apps (Turborepo)
npm run build:web
npm run build:portal

npm run tokens         # regenerate packages/tokens/dist/tokens.css
npm run typecheck
npm run lint
```

Package manager: **npm workspaces** (staying on npm for now). Orchestration:
**Turborepo**.

## Deploy

Two Vercel projects from this repo (recommended):

- Website → root directory `apps/web`
- Portal → root directory `apps/portal`

## Brand

Heading font: **Eurostile** (see `CLAUDE.md` / style guide).
