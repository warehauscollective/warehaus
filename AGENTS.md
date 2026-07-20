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

### Platform access (pushing up edits)

- **GitHub**: `git push` and pull-request creation already work from the VM (the agent has push access and uses the PR tooling). This is the normal way to ship changes; a git-connected Vercel project builds a preview deployment automatically on push / PR.
- **Vercel**: the Vercel MCP server is authenticated to the **Warehaus** team (`team_gk8AwUegrHijeRwyTvHBsWhO`, slug `warehaus-collective`). Use it to deploy, read build/runtime logs, inspect deployments, and manage env vars without any extra credentials. The current Next.js app maps to the `warehaus-portal` Vercel project (framework `nextjs`); the older `new-warehaus` project is the stale Astro site.
- **Vercel CLI**: not installed globally (the npm global prefix is `/`, which needs root). Run it on demand with `npx vercel@latest <cmd>`. It requires a token to run non-interactively — interactive `vercel login` will hang in this VM. Set the `VERCEL_TOKEN` secret and run commands as `npx vercel@latest --token "$VERCEL_TOKEN" <cmd>` (e.g. `link`, `pull`, `env pull`, `deploy --prebuilt`). Prefer the MCP tools for deploys/logs when a token is not configured. `.vercel/` is gitignored, so linking is a per-VM step.
- **Chromatic** (visual regression, `.github/workflows/chromatic.yml`) runs in GitHub Actions and needs the `CHROMATIC_PROJECT_TOKEN` repo secret. It is CI-side and not required for the agent to push edits.
