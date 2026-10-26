#!/usr/bin/env node
/**
 * Portal dev preflight. Two Convex environments, and no third:
 * - production unique-turtle-383 (always rejected)
 * - one shared dev deployment for Peter's Mac and cloud agents
 *
 *   node scripts/preflight-portal-dev.mjs
 *   node scripts/preflight-portal-dev.mjs --push
 *
 * --push means the next step is `convex dev`, which pushes functions to the
 * shared dev deployment. Next-only (`dev:portal`) omits that flag.
 * Fixture preview (`dev:portal:local`) does not run this script.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PROD_DEPLOYMENT = 'unique-turtle-383';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultEnvPath = resolve(root, 'apps/portal/.env.local');

export function assertNode22(version = process.versions.node) {
  const major = Number(String(version).split('.')[0]);
  if (major !== 22) {
    throw new Error(
      `portal preflight: Node.js 22 is required (found v${version}).`,
    );
  }
}

export function parseEnv(text) {
  const out = {};
  for (const rawLine of String(text).split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('export ')) line = line.slice('export '.length).trim();
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    } else {
      const comment = value.search(/\s+#/);
      if (comment !== -1) value = value.slice(0, comment).trim();
    }
    out[key] = value;
  }
  return out;
}

export function assertSharedDevEnv(env) {
  const deployment = (env.CONVEX_DEPLOYMENT ?? '').trim();
  const url = (env.NEXT_PUBLIC_CONVEX_URL ?? '').trim();

  if (!deployment) {
    throw new Error(
      'portal preflight: CONVEX_DEPLOYMENT is missing. It must be the shared dev: deployment, not unique-turtle-383.',
    );
  }
  if (deployment.includes(PROD_DEPLOYMENT)) {
    throw new Error(
      'portal preflight: CONVEX_DEPLOYMENT points at unique-turtle-383. Refusing to start. Production is unique-turtle-383. Mac and cloud agents use the one shared dev: deployment.',
    );
  }
  const slug = deployment.startsWith('dev:') ? deployment.slice('dev:'.length) : '';
  if (!slug || slug.includes(':')) {
    throw new Error(
      'portal preflight: CONVEX_DEPLOYMENT is not a dev: deployment. Expected the shared dev deployment (dev:<name>).',
    );
  }
  if (!url) {
    throw new Error(
      'portal preflight: NEXT_PUBLIC_CONVEX_URL is missing. It must point at the shared dev: deployment.',
    );
  }
  if (url.includes(PROD_DEPLOYMENT)) {
    throw new Error(
      'portal preflight: NEXT_PUBLIC_CONVEX_URL points at unique-turtle-383. Refusing to start.',
    );
  }
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    host = '';
  }
  if (host !== `${slug}.convex.cloud`) {
    throw new Error(
      'portal preflight: NEXT_PUBLIC_CONVEX_URL is not a dev: deployment. It does not match CONVEX_DEPLOYMENT.',
    );
  }
}

export function runPreflight({
  push = false,
  envPath = defaultEnvPath,
  nodeVersion = process.versions.node,
  envText,
} = {}) {
  assertNode22(nodeVersion);
  let text = envText;
  if (text == null) {
    if (!existsSync(envPath)) {
      throw new Error(
        'portal preflight: apps/portal/.env.local is missing. Copy apps/portal/.env.example and point CONVEX_DEPLOYMENT and NEXT_PUBLIC_CONVEX_URL at the shared dev: deployment, not unique-turtle-383.',
      );
    }
    text = readFileSync(envPath, 'utf8');
  }
  assertSharedDevEnv(parseEnv(text));
  if (push) {
    console.error(
      'portal preflight: convex dev pushes functions to the shared dev deployment. Cloud agents run this only when the PR changes convex/, and the PR must say so. This does not deploy production unique-turtle-383.',
    );
  }
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  try {
    runPreflight({ push: process.argv.includes('--push') });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
