#!/usr/bin/env node
/**
 * Reports one step of the portal-deploy workflow to the Portal (ADR-0009).
 * Usage: node scripts/deploy-report.mjs <started|convex_ok|vercel_ok|failed>
 *
 * Reads DEPLOY_REPORT_URL, DEPLOY_REPORT_SECRET, DEPLOY_RUN_ID, DEPLOY_SHA,
 * DEPLOY_STEP and WORKFLOW_URL from the environment. It deploys nothing.
 * A report the Portal refuses fails the step, so a deploy never goes on
 * without the Portal knowing where it is.
 */

const EVENTS = new Set(['started', 'convex_ok', 'vercel_ok', 'failed']);
const STEPS = new Set(['dispatch', 'convex', 'vercel']);

export function reportBody(event, env) {
  if (!EVENTS.has(event)) throw new Error(`Unknown event: ${event}`);
  const runId = env.DEPLOY_RUN_ID?.trim();
  const sha = env.DEPLOY_SHA?.trim();
  if (!runId || !sha) throw new Error('DEPLOY_RUN_ID and DEPLOY_SHA are required');
  const step = env.DEPLOY_STEP?.trim();
  return {
    runId,
    sha,
    event,
    ...(event === 'failed' && step && STEPS.has(step) ? { step } : {}),
    ...(env.WORKFLOW_URL ? { url: env.WORKFLOW_URL } : {}),
  };
}

async function send(event, env) {
  const url = env.DEPLOY_REPORT_URL?.trim();
  const secret = env.DEPLOY_REPORT_SECRET?.trim();
  if (!url || !secret) throw new Error('DEPLOY_REPORT_URL and DEPLOY_REPORT_SECRET are required');
  const body = JSON.stringify(reportBody(event, env));
  let last = '';
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(15000),
      });
      if (response.ok) return;
      last = `HTTP ${response.status}`;
      // A refusal will not change on a retry.
      if (response.status >= 400 && response.status < 500) break;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
  }
  throw new Error(`The Portal did not accept the ${event} report: ${last}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  send(process.argv[2] ?? '', process.env).then(
    () => console.log(`Reported ${process.argv[2]}`),
    (error) => {
      console.error(error.message);
      process.exit(1);
    },
  );
}
