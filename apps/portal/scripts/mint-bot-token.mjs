#!/usr/bin/env node
/**
 * Mint or revoke one staff API token per bot.
 * The raw token is printed once on stdout and is not written anywhere else.
 *
 * Run from apps/portal, against the deployment in .env.local.
 * Do not point CONVEX_DEPLOYMENT at production.
 *
 *   node scripts/mint-bot-token.mjs --name grok-bot --org-id <clients id>
 *   node scripts/mint-bot-token.mjs --name warehaus-studio-manager --scope read-write --org-id <clients id>
 *   node scripts/mint-bot-token.mjs --all --org-id <clients id>
 *   node scripts/mint-bot-token.mjs --revoke grok-bot
 */

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BOTS = {
  'grok-bot': 'read-write',
  'warehaus-studio-manager': 'read-write',
};

const portalRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function arg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function safe(text) {
  return text
    .split('\n')
    .filter((line) => !line.includes('whp_'))
    .join('\n');
}

function runConvex(fn, args) {
  const result = spawnSync('npx', ['convex', 'run', fn, JSON.stringify(args)], {
    cwd: portalRoot,
    encoding: 'utf8',
  });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) {
    const detail = safe(`${result.stderr ?? ''}\n${result.stdout ?? ''}`).trim();
    fail(detail || 'Convex command failed');
  }
  return result.stdout ?? '';
}

function parseResult(stdout) {
  const lines = stdout.split('\n').map((line) => line.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      return JSON.parse(lines[i]);
    } catch {
      // Convex may print a log line before the JSON value.
    }
  }
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

function mintOne(name, scope, homeOrgId) {
  const stdout = runConvex('portalTokens:mintBot', { name, scope, homeOrgId });
  const parsed = parseResult(stdout);
  const token = parsed?.token;
  if (typeof token !== 'string' || !token.startsWith('whp_')) fail(`Mint did not return a token for ${name}`);
  process.stderr.write(`minted ${name} (${scope})\n`);
  process.stdout.write(`${token}\n`);
}

const revoke = arg('--revoke');
if (revoke) {
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(revoke)) fail('Token name must be lowercase letters, numbers, and hyphens');
  const stdout = runConvex('portalTokens:revokeBot', { name: revoke });
  const parsed = parseResult(stdout);
  if (!parsed?.ok) fail(`Could not revoke ${revoke}`);
  process.stdout.write(`revoked ${revoke}\n`);
  process.exit(0);
}

const all = process.argv.includes('--all');
const name = arg('--name');
const scopeFlag = arg('--scope');
const homeOrgId = arg('--org-id');
if (!homeOrgId) fail('--org-id is required');
if (scopeFlag && scopeFlag !== 'read' && scopeFlag !== 'read-write') fail('Scope must be read or read-write');
if (all && scopeFlag) fail('Use --scope with a single --name');

const names = all ? Object.keys(BOTS) : [name];
if (!all && !name) fail('Pass --name <bot> or --all');
for (const bot of names) {
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(bot)) fail('Token name must be lowercase letters, numbers, and hyphens');
  const scope = scopeFlag ?? BOTS[bot];
  if (!scope) fail(`Pass --scope for ${bot}`);
  mintOne(bot, scope, homeOrgId);
}
