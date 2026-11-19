#!/usr/bin/env node
/**
 * Peter's Mac: fetch a branch, install, and run the portal against shared
 * dev Convex only. Next.js only. This file never starts a Convex dev process
 * and never pushes functions.
 *
 *   npm run preview:pr -- <branch>
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertNode22, parseEnv } from './preflight-portal-dev.mjs';

export const SHARED_DEV_SLUG = 'graceful-mastiff-960';
export const PROD_SLUG = 'unique-turtle-383';

const SHARED_DEV_CLOUD = `${SHARED_DEV_SLUG}.convex.cloud`;
const SHARED_DEV_SITE = `${SHARED_DEV_SLUG}.convex.site`;

export const CONVEX_URL_KEYS = [
  'NEXT_PUBLIC_CONVEX_URL',
  'NEXT_PUBLIC_CONVEX_SITE_URL',
  'CONVEX_CLOUD_URL',
  'CONVEX_SITE_URL',
];

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function assertBranchName(branch) {
  if (typeof branch !== 'string' || branch.length === 0 || branch.length > 200) {
    throw new Error('preview: pass one branch. Usage: npm run preview:pr -- <branch>');
  }
  if (
    branch.startsWith('-') ||
    branch.startsWith('/') ||
    branch.endsWith('/') ||
    branch.endsWith('.') ||
    branch.includes('..') ||
    branch.includes('//') ||
    branch.includes('@') ||
    branch.includes('\\') ||
    branch.includes(' ') ||
    !/^[A-Za-z0-9._/-]+$/.test(branch)
  ) {
    throw new Error('preview: branch name is not usable. Pass one branch, like feature/name.');
  }
}

export function isProductionDeployment(deployment) {
  const value = String(deployment ?? '').trim().toLowerCase();
  return value.includes(PROD_SLUG) || value.startsWith('prod:') || value.startsWith('production');
}

export function isProductionConvexHost(hostname) {
  const host = String(hostname ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (!host || host === 'convex.cloud' || host === 'convex.site') return true;
  if (host.includes(PROD_SLUG)) return true;
  if (host === 'vercel.com' || host.endsWith('.vercel.app') || host.endsWith('.vercel.com')) return true;
  if (host.endsWith('.convex.cloud') || host.endsWith('.convex.site')) {
    return host !== SHARED_DEV_CLOUD && host !== SHARED_DEV_SITE;
  }
  return false;
}

function inspectConvexUrl(key, value) {
  if (String(value).includes(PROD_SLUG)) {
    throw new Error(`preview: ${key} points at production ${PROD_SLUG}. Refusing to start.`);
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`preview: ${key} is not a usable URL. Refusing to start.`);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`preview: ${key} is not a bare Convex origin. Refusing to start.`);
  }
  if (url.protocol !== 'https:') {
    throw new Error(`preview: ${key} is not a bare Convex origin. Refusing to start.`);
  }
  return url.hostname.toLowerCase().replace(/\.$/, '');
}

function assertConvexUrl(key, value, kind) {
  const host = inspectConvexUrl(key, value);
  if (isProductionConvexHost(host)) {
    throw new Error(`preview: ${key} is a production host. Refusing to start.`);
  }
  const allowed = kind === 'cloud'
    ? host === SHARED_DEV_CLOUD
    : host === SHARED_DEV_CLOUD || host === SHARED_DEV_SITE;
  if (!allowed) {
    throw new Error(`preview: ${key} is not shared dev ${SHARED_DEV_SLUG}. Refusing to start.`);
  }
}

export function previewEnv(fileEnv, processEnv = {}) {
  const merged = { ...fileEnv };
  const keys = ['CONVEX_DEPLOYMENT', ...CONVEX_URL_KEYS];
  for (const key of keys) {
    const override = processEnv[key];
    if (override != null && String(override).trim() !== '') merged[key] = String(override).trim();
  }
  return merged;
}

export function assertPreviewTarget(env) {
  const deployment = String(env.CONVEX_DEPLOYMENT ?? '').trim();
  if (!deployment) {
    throw new Error('preview: CONVEX_DEPLOYMENT is missing. Refusing to start.');
  }
  if (isProductionDeployment(deployment)) {
    throw new Error(
      `preview: CONVEX_DEPLOYMENT is production. Refusing to start. Production is ${PROD_SLUG}.`,
    );
  }
  if (deployment !== `dev:${SHARED_DEV_SLUG}`) {
    throw new Error(
      `preview: CONVEX_DEPLOYMENT is not shared dev ${SHARED_DEV_SLUG}. Refusing to start.`,
    );
  }

  const cloud = String(env.NEXT_PUBLIC_CONVEX_URL ?? '').trim();
  if (!cloud) {
    throw new Error('preview: NEXT_PUBLIC_CONVEX_URL is missing. Refusing to start.');
  }
  assertConvexUrl('NEXT_PUBLIC_CONVEX_URL', cloud, 'cloud');

  for (const key of CONVEX_URL_KEYS) {
    if (key === 'NEXT_PUBLIC_CONVEX_URL') continue;
    const value = String(env[key] ?? '').trim();
    if (!value) continue;
    const kind = key === 'CONVEX_CLOUD_URL' ? 'cloud' : 'site';
    assertConvexUrl(key, value, kind);
  }
}

export function readEnvFile(envPath) {
  if (!existsSync(envPath)) {
    throw new Error('preview: apps/portal/.env.local is missing. Refusing to start.');
  }
  return readFileSync(envPath, 'utf8');
}

export function previewUrl(portValue = '3100') {
  const port = String(portValue ?? '').trim() || '3100';
  if (!/^[0-9]+$/.test(port)) {
    throw new Error('preview: PORTAL_PORT is not a usable port. Refusing to start.');
  }
  const number = Number(port);
  if (!Number.isInteger(number) || number < 1 || number > 65535) {
    throw new Error('preview: PORTAL_PORT is not a usable port. Refusing to start.');
  }
  return `http://localhost:${number}`;
}

export function previewBanner(branch, url) {
  return [
    `Preview branch: ${branch}`,
    `Portal: ${url}`,
    `Convex: shared dev ${SHARED_DEV_SLUG}. Next only. No function push.`,
  ];
}

export function serverLaunch(repoRoot = root) {
  return {
    command: process.execPath,
    args: [resolve(repoRoot, 'scripts/dev-app.mjs'), 'portal'],
  };
}

/** Env for the Next process. Adds the branch name and nothing else. */
export function serverEnv(baseEnv, branch) {
  assertBranchName(branch);
  return {
    ...baseEnv,
    WAREHAUS_PREVIEW_BRANCH: branch,
  };
}

/**
 * Commands after a successful fetch. Never includes a Convex CLI.
 * localExists selects checkout of the existing branch versus creating it.
 */
export function switchAndInstallSteps({ branch, localExists }) {
  assertBranchName(branch);
  const remote = `origin/${branch}`;
  const steps = localExists
    ? [
        ['git', 'checkout', branch],
        ['git', 'merge', '--ff-only', remote],
      ]
    : [['git', 'checkout', '-b', branch, remote]];
  steps.push(['npm', 'install']);
  return steps;
}

export function failureMessage(kind) {
  switch (kind) {
    case 'fetch':
      return 'preview: git fetch failed. Refusing to start.';
    case 'missing-branch':
      return 'preview: that branch is not on origin. Refusing to start.';
    case 'checkout':
      return 'preview: git checkout failed. Refusing to start.';
    case 'merge':
      return 'preview: the local branch is not a fast-forward of origin. Refusing to reset.';
    case 'install':
      return 'preview: npm install failed. Refusing to start.';
    case 'status':
      return 'preview: git status failed. Refusing to start.';
    default:
      return 'preview: setup failed. Refusing to start.';
  }
}

function stepKind(step) {
  if (step[0] === 'npm') return 'install';
  if (step[1] === 'checkout') return 'checkout';
  if (step[1] === 'merge') return 'merge';
  return 'setup';
}

function commandEnv() {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'Never',
  };
}

function capture(command, args) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    env: commandEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function assertCommand(result, kind) {
  if (!result || result.error || result.status !== 0) {
    throw new Error(failureMessage(kind));
  }
}

function runQuiet(command, args, kind) {
  assertCommand(
    spawnSync(command, args, {
      cwd: root,
      env: commandEnv(),
      stdio: 'ignore',
    }),
    kind,
  );
}

function main() {
  const branch = process.argv[2];
  if (!branch || process.argv.length > 3) {
    throw new Error('preview: pass one branch. Usage: npm run preview:pr -- <branch>');
  }
  assertBranchName(branch);

  const status = capture('git', ['status', '--porcelain']);
  assertCommand(status, 'status');
  if (status.stdout.trim()) {
    throw new Error('preview: working tree has uncommitted changes. Refusing to switch branches.');
  }

  console.log(`Fetching ${branch}.`);
  runQuiet('git', ['fetch', 'origin', `refs/heads/${branch}:refs/remotes/origin/${branch}`], 'fetch');
  const remoteRef = capture('git', ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`]);
  if (!remoteRef || remoteRef.error || remoteRef.status !== 0) {
    throw new Error(failureMessage('missing-branch'));
  }
  const localRef = capture('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]);
  const localExists = Boolean(localRef && !localRef.error && localRef.status === 0);

  console.log(`Checking out ${branch}.`);
  for (const step of switchAndInstallSteps({ branch, localExists })) {
    if (step[0] === 'npm') console.log('Installing dependencies.');
    runQuiet(step[0], step.slice(1), stepKind(step));
    if (step[0] === 'npm') console.log('Dependencies installed.');
  }

  assertNode22();
  const fileEnv = parseEnv(readEnvFile(resolve(root, 'apps/portal/.env.local')));
  assertPreviewTarget(previewEnv(fileEnv, process.env));

  const url = previewUrl(process.env.PORTAL_PORT);
  for (const line of previewBanner(branch, url)) console.log(line);

  const launch = serverLaunch(root);
  const child = spawn(launch.command, launch.args, {
    cwd: root,
    stdio: 'inherit',
    env: serverEnv(process.env, branch),
  });
  let stopping = false;
  const stop = (code) => {
    if (stopping) return;
    stopping = true;
    if (child.exitCode === null && !child.killed) child.kill('SIGTERM');
    setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
      process.exit(code);
    }, 1500).unref();
  };
  child.on('error', () => stop(1));
  child.on('exit', (code, signal) => {
    if (stopping) return;
    stop(code ?? (signal ? 1 : 0));
  });
  process.on('SIGINT', () => stop(130));
  process.on('SIGTERM', () => stop(143));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : failureMessage('setup'));
    process.exit(1);
  }
}
