#!/usr/bin/env node
/**
 * Start a Warehaus Next app on a pinned port (fail-fast if busy).
 *
 *   node scripts/dev-app.mjs web
 *   node scripts/dev-app.mjs portal
 *
 * Env overrides:
 *   WEB_PORT=3020     (default 3000)
 *   PORTAL_PORT=3100  (default 3100)
 *
 * Why: if :3000 is taken, `next dev` auto-increments to :3001 and the
 * website silently steals the portal port — then localhost:3001 looks like
 * the marketing site, and /portal shows website chrome + a 404.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const APP = process.argv[2];
const APPS = {
  web: {
    label: '@warehaus/web (website)',
    cwd: resolve(root, 'apps/web'),
    port: Number(process.env.WEB_PORT || 3000),
    envHint: 'WEB_PORT',
  },
  portal: {
    label: '@warehaus/portal',
    cwd: resolve(root, 'apps/portal'),
    port: Number(process.env.PORTAL_PORT || 3100),
    envHint: 'PORTAL_PORT',
  },
};

const cfg = APPS[APP];
if (!cfg) {
  console.error(`Usage: node scripts/dev-app.mjs <web|portal>`);
  process.exit(1);
}

if (!Number.isInteger(cfg.port) || cfg.port < 1) {
  console.error(`Invalid port for ${cfg.label}: ${cfg.port}`);
  process.exit(1);
}

const free = await new Promise((resolveFree) => {
  const server = createServer();
  server.once('error', () => resolveFree(false));
  server.once('listening', () => server.close(() => resolveFree(true)));
  server.listen(cfg.port, '0.0.0.0');
});

if (!free) {
  console.error(`
✖ Port ${cfg.port} is already in use — refusing to start ${cfg.label}.

  Another process (often a different project on :3000) causes Next.js to
  auto-bump the website onto :3001, which then looks like "the portal"
  but is still the marketing site.

  Fix one of:
    1. Free the port:  lsof -iTCP:${cfg.port} -sTCP:LISTEN
    2. Override:       ${cfg.envHint}=<free-port> npm run dev:${APP === 'web' ? 'web' : 'portal'}

  Canonical local ports:
    website → http://localhost:3000
    portal  → http://localhost:3100
`);
  process.exit(1);
}

console.log(`✓ Starting ${cfg.label} on http://localhost:${cfg.port}`);

const child = spawn(
  'npx',
  ['next', 'dev', '--turbopack', '--port', String(cfg.port)],
  {
    cwd: cfg.cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: String(cfg.port),
      ...(APP === 'web'
        ? {
            NEXT_PUBLIC_PORTAL_URL:
              process.env.NEXT_PUBLIC_PORTAL_URL ||
              `http://localhost:${Number(process.env.PORTAL_PORT || 3100)}`,
          }
        : {}),
    },
  },
);

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
