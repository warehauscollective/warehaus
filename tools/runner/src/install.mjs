// `npm run runner -- install`: keeps the runner running (ADR-0005 amendment).
//
// Writes one launchd agent per deployment to ~/Library/LaunchAgents and loads
// it. launchd starts the runner at login and restarts it if it stops. The
// agent runs headless, and a production agent always carries --production.
// Nothing secret is written: the runner reads its secret from the Keychain.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchAgentLabel, launchAgentPlist } from './lib.mjs';
import { readSavedConfig } from './setup.mjs';

const here = dirname(fileURLToPath(import.meta.url));

export function launchAgentPath(production) {
  return join(homedir(), 'Library', 'LaunchAgents', `${launchAgentLabel(production)}.plist`);
}

function launchctl(args) {
  return spawnSync('launchctl', args, { encoding: 'utf8' });
}

export function runInstall({ production, say }) {
  if (process.platform !== 'darwin') throw new Error('install writes a macOS launchd agent. Start the runner by hand elsewhere.');
  if (!readSavedConfig(production).RUNNER_ID) {
    throw new Error(`This Mac is not paired${production ? ' to production' : ''}. Run npm run runner -- setup${production ? ' --production' : ''} first.`);
  }
  const plist = launchAgentPath(production);
  const logPath = join(homedir(), 'Library', 'Logs', `${launchAgentLabel(production)}.log`);
  const path = [dirname(process.execPath), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':');
  mkdirSync(dirname(plist), { recursive: true });
  mkdirSync(dirname(logPath), { recursive: true });
  writeFileSync(
    plist,
    launchAgentPlist({
      production,
      node: process.execPath,
      cli: join(here, 'cli.mjs'),
      workingDirectory: resolve(here, '..', '..', '..'),
      logPath,
      path,
    }),
    { mode: 0o644 },
  );
  const domain = `gui/${process.getuid()}`;
  launchctl(['bootout', `${domain}/${launchAgentLabel(production)}`]);
  const loaded = launchctl(['bootstrap', domain, plist]);
  if (loaded.status !== 0) throw new Error(`launchctl could not load ${plist}: ${(loaded.stderr || '').trim().split('\n')[0]}`);
  say(`Installed ${launchAgentLabel(production)}. It starts at login and restarts if it stops. Log: ${logPath}`);
}

export function runUninstall({ production, say }) {
  const plist = launchAgentPath(production);
  if (process.platform === 'darwin') launchctl(['bootout', `gui/${process.getuid()}/${launchAgentLabel(production)}`]);
  if (existsSync(plist)) rmSync(plist);
  say(`Removed ${launchAgentLabel(production)}.`);
}
