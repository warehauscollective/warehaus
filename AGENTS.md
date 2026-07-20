# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

Warehaus is an npm-workspaces monorepo. There is one runnable application plus a shared package:

- `apps/web` (`@warehaus/web`) — the Next.js 15 marketing site (App Router, Turbopack, React 19, Tailwind CSS 4, Three.js/R3F, GSAP). This is the only service.
- `packages/tokens` (`@warehaus/tokens`) — platform-agnostic design tokens consumed by the web app.

Note: the root `README.md` describes an old Astro starter and is out of date — ignore it. The real app is the Next.js app in `apps/web`.

### Running / building / testing

All commands are wired through the root `package.json` (which delegates to the `@warehaus/web` workspace) and `apps/web/package.json`. Prefer running from the repo root:

- Dev server: `npm run dev` — Next.js on `http://localhost:3000` (not 4321 as the stale README claims).
- Lint: `npm run lint` · Typecheck: `npm run typecheck` · Build: `npm run build`.
- Tokens: `npm run tokens` regenerates `apps/web/src/styles/tokens.generated.css` from `@warehaus/tokens`. This file is committed and imported by `global.css`; `build` runs it automatically via `prebuild`.
- Storybook: `npm run storybook` (port 6006).

### Non-obvious gotchas

- Tests are not wired to an npm script. Run them with `npx vitest run` from `apps/web`. They use Storybook browser tests via `@storybook/addon-vitest` + Playwright Chromium (headless), so the Playwright Chromium browser must be installed (`npx playwright install chromium`, handled by the update script). System libraries for headless Chromium already work in this environment.
- The AI chat feature (`/api/chat`, Anthropic SDK) is optional. Without `ANTHROPIC_API_KEY` it runs in "demo mode" and returns a canned reply — no secret is required to run or test the app. Set `ANTHROPIC_API_KEY` only to exercise live AI responses.
- The site is effectively a single-page tab UI: `/design`, `/develop`, `/dream` intentionally `307`-redirect to `/?tab=<name>`; `/work` and `/work/:slug` permanently redirect to `/codex`. These redirects are expected, not errors.
- `@vercel/toolbar` logs `No project info found ... run vc link` on dev startup. This is harmless.
