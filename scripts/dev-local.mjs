#!/usr/bin/env node
/**
 * Mac entry: preflight, then `convex dev` (pushes to the shared dev deployment)
 * and the portal on port 3100.
 *
 * Cloud agents use `npm run dev:portal` instead. That is Next only.
 * Do not use this script unless you mean to push functions.
 */
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPreflight } from './preflight-portal-dev.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const portalDir = resolve(root, 'apps/portal');

try {
  runPreflight({ push: true });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

console.log(
  'dev:local (Mac): pushing Convex functions to the shared dev deployment and starting the portal on http://localhost:3100.',
);
console.log(
  'Cloud agents: use npm run dev:portal (Next only). Do not use dev:local unless this PR changes convex/.',
);

const children = [];
let stopping = false;

function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null && !child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => {
    for (const child of children) {
      if (child.exitCode === null) child.kill('SIGKILL');
    }
    process.exit(code);
  }, 1500).unref();
}

function start(command, args, cwd, env) {
  const child = spawn(command, args, { cwd, env, stdio: 'inherit' });
  children.push(child);
  child.on('error', (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on('exit', (code, signal) => {
    if (stopping) return;
    stop(code ?? (signal ? 1 : 0));
  });
}

process.on('SIGINT', () => stop(130));
process.on('SIGTERM', () => stop(143));

start('npx', ['--no-install', 'convex', 'dev'], portalDir, process.env);
start(process.execPath, ['scripts/dev-app.mjs', 'portal'], root, {
  ...process.env,
  PORTAL_PORT: '3100',
});
