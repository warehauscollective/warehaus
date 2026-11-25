// `npm run runner -- setup`: pairs this Mac with the Portal (ADR-0005 amendment).
//
// The secret and the poll key are made here and never leave this Mac in the
// clear: the Portal gets their SHA-256 hashes. Staff confirm the printed code
// in the Runner status modal; this process waits for that and then stores the
// secret in the macOS Keychain. The config file holds the URL and id only.

import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { join } from 'node:path';
import { RUNNER_PAIR_PATHS } from '../../../packages/runner-protocol/index.mjs';
import { DEPLOYMENTS, KEYCHAIN_SERVICE, configFileText, keychainAccount, parseConfigFile, proposedRunnerId } from './lib.mjs';

const POLL_EVERY_MS = 3000;

export function configDir() {
  return join(homedir(), '.config', 'warehaus');
}

export function deploymentFor(production) {
  return production ? DEPLOYMENTS.production : DEPLOYMENTS.dev;
}

/** The file setup wrote for this deployment, or {}. */
export function readSavedConfig(production) {
  const path = join(configDir(), deploymentFor(production).configFile);
  return existsSync(path) ? parseConfigFile(readFileSync(path, 'utf8')) : {};
}

/** The secret from the Keychain, or ''. Nothing is printed. */
export function readKeychainSecret(deploymentName, id) {
  if (process.platform !== 'darwin' || !id) return '';
  const found = spawnSync('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', keychainAccount(deploymentName, id), '-w'], {
    encoding: 'utf8',
  });
  return found.status === 0 ? found.stdout.trim() : '';
}

function storeKeychainSecret(deploymentName, id, secret) {
  // `security` takes the password as an argument. It is visible to `ps` for the moment the command runs.
  const stored = spawnSync(
    'security',
    ['add-generic-password', '-U', '-s', KEYCHAIN_SERVICE, '-a', keychainAccount(deploymentName, id), '-l', `Warehaus runner ${id}`, '-w', secret],
    { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' },
  );
  if (stored.status !== 0) throw new Error(`Could not save the secret to the Keychain: ${stored.stderr.trim() || 'security failed'}`);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function post(url, body) {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) throw new Error(data && typeof data.error === 'string' ? data.error : `HTTP ${response.status}`);
  return data ?? {};
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

export async function runSetup({ production, id, say }) {
  if (process.platform !== 'darwin') throw new Error('Setup stores the runner secret in the macOS Keychain, so it runs on a Mac.');
  const deployment = deploymentFor(production);
  const agentUrl = (process.env.PORTAL_AGENT_URL || deployment.agentUrl).replace(/\/+$/, '');
  const portalUrl = process.env.PORTAL_WEB_URL || deployment.portalUrl;
  const secret = randomBytes(32).toString('base64url');
  const pollKey = randomBytes(32).toString('base64url');
  const started = await post(`${agentUrl}${RUNNER_PAIR_PATHS.start}`, {
    proposedRunnerId: id || proposedRunnerId(hostname(), production),
    tokenHash: sha256(secret),
    pollKeyHash: sha256(pollKey),
  });
  if (Boolean(started.production) !== production) {
    throw new Error(production ? 'That deployment is not production.' : 'That is the production deployment. Run setup with --production.');
  }
  say(`Pairing code: ${started.code}`);
  say(`Proposed id:  ${started.proposedRunnerId} (${production ? 'production' : 'shared dev'})`);
  say(`Open any project in the Portal, tap the runner chip, and enter the code. Opening ${portalUrl}`);
  say('If no browser opens, go there yourself. The code expires in 10 minutes.');
  spawnSync('open', [portalUrl], { stdio: 'ignore' });

  for (;;) {
    await sleep(POLL_EVERY_MS);
    let status;
    try {
      status = await post(`${agentUrl}${RUNNER_PAIR_PATHS.poll}`, { code: started.code, pollKey });
    } catch (error) {
      say(`Waiting… (${error.message})`);
      continue;
    }
    if (status.status === 'expired') throw new Error('The code expired before anyone confirmed it. Run setup again.');
    if (status.status !== 'confirmed') continue;
    const runnerId = String(status.runnerId);
    storeKeychainSecret(deployment.name, runnerId, secret);
    mkdirSync(configDir(), { recursive: true });
    const path = join(configDir(), deployment.configFile);
    writeFileSync(path, configFileText({ url: agentUrl, id: runnerId, production }), { mode: 0o600 });
    chmodSync(path, 0o600);
    const flag = production ? ' --production' : '';
    say(`Paired as ${runnerId}. The secret is in the Keychain (${KEYCHAIN_SERVICE}); ${path} has the URL and id.`);
    say(`Start it with: npm run runner -- start${flag}. It keeps its own clones under ~/warehaus-runner/repos.`);
    return { runnerId };
  }
}
