#!/usr/bin/env node
/**
 * Idempotent portal test-auth bootstrap for Cloud Agents / local QA.
 *
 * 1. Seeds Convex demo tenants + billing (public mutations on the portal deployment)
 * 2. Ensures Better Auth users exist for the documented test emails/passwords
 *
 * Env overrides (optional):
 *   PORTAL_BASE_URL          default http://127.0.0.1:3100
 *   PORTAL_TEST_EMAIL        default demo@northbay.test
 *   PORTAL_TEST_PASSWORD     default WarehausDemo1!
 *   PORTAL_STAFF_EMAIL       default team@warehaus.co
 *   PORTAL_STAFF_PASSWORD    default WarehausTeam1!
 *   NEXT_PUBLIC_CONVEX_URL   required for seed (read from apps/portal/.env.local if unset)
 *
 * Usage:
 *   node scripts/ensure-portal-test-auth.mjs
 *   node scripts/ensure-portal-test-auth.mjs --wait-portal
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const waitPortal = process.argv.includes('--wait-portal');
const seedOnly = process.argv.includes('--seed-only');

function loadEnvLocal() {
  const path = resolve(root, 'apps/portal/.env.local');
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const i = trimmed.indexOf('=');
    let k = trimmed.slice(0, i);
    let v = trimmed.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

const fileEnv = loadEnvLocal();
const convexUrl =
  process.env.NEXT_PUBLIC_CONVEX_URL?.trim() ||
  fileEnv.NEXT_PUBLIC_CONVEX_URL?.trim() ||
  '';
const portalBase =
  process.env.PORTAL_BASE_URL?.trim() ||
  // Must match SITE_URL / trusted origins (localhost, not 127.0.0.1)
  'http://localhost:3100';

const accounts = [
  {
    role: 'client',
    email: process.env.PORTAL_TEST_EMAIL?.trim() || 'demo@northbay.test',
    password: process.env.PORTAL_TEST_PASSWORD?.trim() || 'WarehausDemo1!',
    name: 'North Bay Demo',
  },
  {
    role: 'staff',
    email: process.env.PORTAL_STAFF_EMAIL?.trim() || 'team@warehaus.co',
    password: process.env.PORTAL_STAFF_PASSWORD?.trim() || 'WarehausTeam1!',
    name: 'Warehaus Team',
  },
];

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function waitForPortal(timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${portalBase}/login`, { redirect: 'manual' });
      if (res.status === 200 || res.status === 307 || res.status === 308) {
        return;
      }
    } catch {
      // not up yet
    }
    await sleep(1500);
  }
  throw new Error(`Portal not reachable at ${portalBase} within ${timeoutMs}ms`);
}

async function convexMutation(path, args = {}) {
  if (!convexUrl) {
    throw new Error(
      'NEXT_PUBLIC_CONVEX_URL missing. Pull Vercel env into apps/portal/.env.local first.',
    );
  }
  const res = await fetch(`${convexUrl.replace(/\/$/, '')}/api/mutation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args, format: 'json' }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.status === 'error') {
    throw new Error(
      `Convex mutation ${path} failed: ${JSON.stringify(body).slice(0, 500)}`,
    );
  }
  return body.value;
}

async function ensureAuthUser({ email, password, name }) {
  const signUp = await fetch(`${portalBase}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: portalBase,
    },
    body: JSON.stringify({ email, password, name }),
  });
  const signUpBody = await signUp.json().catch(() => ({}));

  if (signUp.ok && signUpBody.user) {
    console.log(`✓ Created auth user ${email}`);
    return { created: true, email };
  }

  const already =
    signUp.status === 422 ||
    /already|exists|registered/i.test(String(signUpBody.message || signUpBody.code || ''));

  if (!already && !signUp.ok) {
    throw new Error(
      `sign-up failed for ${email}: ${signUp.status} ${JSON.stringify(signUpBody).slice(0, 300)}`,
    );
  }

  const signIn = await fetch(`${portalBase}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: portalBase,
    },
    body: JSON.stringify({ email, password }),
  });
  const signInBody = await signIn.json().catch(() => ({}));
  if (!signIn.ok || !signInBody.user) {
    throw new Error(
      `Auth user ${email} exists but password check failed. Reset via /login Create password or update PORTAL_*_PASSWORD. ${JSON.stringify(signInBody).slice(0, 300)}`,
    );
  }
  console.log(`✓ Verified auth user ${email}`);
  return { created: false, email };
}

async function main() {
  console.log('Portal test-auth bootstrap');
  console.log(`  Convex: ${convexUrl || '(missing)'}`);
  console.log(`  Portal: ${portalBase}`);

  const seed = await convexMutation('seed:seedDemoTenants');
  console.log(
    `✓ Seeded tenants (demo=${seed?.demoEmail}, staff=${seed?.staffEmail})`,
  );
  try {
    await convexMutation('seed:seedDemoBilling');
    console.log('✓ Seeded demo billing');
  } catch (err) {
    console.warn(`⚠ seedDemoBilling skipped: ${err.message}`);
  }

  if (seedOnly) {
    console.log('(--seed-only) Skipping Better Auth user ensure');
    return;
  }

  if (waitPortal) {
    console.log(`Waiting for portal at ${portalBase} …`);
    await waitForPortal();
  }

  for (const account of accounts) {
    await ensureAuthUser(account);
  }

  console.log('\nUse these logins for Cloud Agent UI testing:');
  for (const a of accounts) {
    console.log(`  ${a.role.padEnd(7)} ${a.email} / ${a.password}`);
  }
}

main().catch((err) => {
  console.error(`✖ ${err.message || err}`);
  process.exit(1);
});
