#!/usr/bin/env node
// Claude Code hook. Reads the hook payload on stdin and posts one short line
// to the Portal run feed. It does nothing unless PORTAL_AGENT_URL, RUNNER_TOKEN,
// RUNNER_ID and AGENT_RUN_ID are set. The runner does not put RUNNER_TOKEN in
// the Claude process, so a hook started from that process posts nothing.
// It never blocks Claude Code: every failure exits 0.
//
//   node tools/runner/src/hook.mjs PostToolUse

import { hookEvent } from './lib.mjs';
import { runnerClient } from '../../../packages/runner-protocol/index.mjs';

const kind = process.argv[2] ?? '';
const { PORTAL_AGENT_URL: url, RUNNER_TOKEN: token, RUNNER_ID: runnerId, AGENT_RUN_ID: runId } = process.env;

async function main() {
  if (!url || !token || !runnerId || !runId) return;
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  let payload = {};
  try {
    payload = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    payload = {};
  }
  const event = hookEvent(kind, payload);
  if (!event) return;
  // Only the summary is sent. The raw hook payload stays on this machine.
  await runnerClient({ url, token, runnerId, timeoutMs: 4000 }).event({ runId, type: event.type, summary: event.summary });
}

main().catch(() => undefined).finally(() => process.exit(0));
