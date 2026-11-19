/**
 * Builds or deletes one warehaus-portal review preview.
 * Never prints tokens. Never targets production.
 */
import {
  REVIEW_PREVIEW_PATH,
  SHARED_DEV_SITE_HOST,
  VERCEL_PROJECT_ID,
  VERCEL_TEAM_ID,
  assertReviewConvexUrl,
  deleteVercelDeployment,
  previewProtectionCoversPreviews,
  redactSecrets,
  reviewDeploymentBody,
  reviewPreviewCliShouldRun,
} from '../convex/_lib/reviewPreview';

const secrets = [process.env.VERCEL_TOKEN, process.env.REVIEW_PREVIEW_SECRET, process.env.GITHUB_TOKEN].filter(
  (value): value is string => Boolean(value),
);

function say(message: string): void {
  console.log(redactSecrets(message, secrets));
}

function fail(message: string): never {
  console.error(redactSecrets(message, secrets));
  process.exit(1);
}

function milestoneIdFrom(body: string | undefined, explicit: string | undefined): string | null {
  const given = explicit?.trim();
  if (given) return given;
  const match = /Milestone-Id:\s*([A-Za-z0-9]+)/.exec(body ?? '');
  return match?.[1] ?? null;
}

async function githubPull(number: string): Promise<{
  state: string;
  body: string;
  sha: string;
  ref: string;
}> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) fail('GITHUB_TOKEN is missing');
  const response = await fetch(`https://api.github.com/repos/warehauscollective/warehaus/pulls/${number}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) fail(`GitHub pull request lookup returned ${response.status}`);
  const pull = (await response.json()) as {
    state?: string;
    body?: string;
    head?: { sha?: string; ref?: string };
  };
  const sha = process.env.HEAD_SHA?.trim() || pull.head?.sha || '';
  const ref = process.env.HEAD_REF?.trim() || pull.head?.ref || '';
  if (!sha || !ref) fail('Pull request head is missing');
  return { state: process.env.PR_STATE?.trim() || pull.state || '', body: process.env.PR_BODY ?? pull.body ?? '', sha, ref };
}

async function vercel(path: string, init?: RequestInit): Promise<Response> {
  const token = process.env.VERCEL_TOKEN;
  if (!token) fail('VERCEL_TOKEN is not set');
  return fetch(`https://api.vercel.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

async function postConvex(payload: Record<string, unknown>): Promise<{ ok?: boolean; reason?: string; previousDeploymentId?: string | null }> {
  const secret = process.env.REVIEW_PREVIEW_SECRET;
  if (!secret) fail('REVIEW_PREVIEW_SECRET is not set');
  const response = await fetch(`https://${SHARED_DEV_SITE_HOST}${REVIEW_PREVIEW_PATH}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  if (!response.ok) fail(`Review preview store returned ${response.status}: ${text.slice(0, 180)}`);
  return JSON.parse(text) as { ok?: boolean; reason?: string; previousDeploymentId?: string | null };
}

async function assertProtected(): Promise<void> {
  const response = await vercel(`/v9/projects/${VERCEL_PROJECT_ID}?teamId=${encodeURIComponent(VERCEL_TEAM_ID)}`);
  if (!response.ok) fail(`Vercel project lookup returned ${response.status}`);
  const project = (await response.json()) as { ssoProtection?: { deploymentType?: string } | null };
  if (!previewProtectionCoversPreviews(project)) {
    fail('Vercel Authentication does not cover preview deployments');
  }
}

async function pollReady(id: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await vercel(`/v13/deployments/${encodeURIComponent(id)}?teamId=${encodeURIComponent(VERCEL_TEAM_ID)}`);
    if (!response.ok) fail(`Vercel deployment lookup returned ${response.status}`);
    const deployment = (await response.json()) as { readyState?: string; url?: string };
    if (deployment.readyState === 'READY' && deployment.url) return `https://${deployment.url}`;
    if (deployment.readyState === 'ERROR' || deployment.readyState === 'CANCELED') {
      throw new Error(`Preview deployment ${deployment.readyState}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }
  throw new Error('Preview deployment did not become ready');
}

async function build(): Promise<void> {
  const convex = assertReviewConvexUrl('https://graceful-mastiff-960.convex.cloud');
  if (!convex.ok) fail(convex.reason);
  const prNumber = Number(process.env.PR_NUMBER);
  if (!Number.isInteger(prNumber) || prNumber < 1) fail('Pull request number is missing');
  const pull = await githubPull(String(prNumber));
  if (pull.state === 'closed') fail('Refusing to build a preview for a closed pull request');
  const milestoneId = milestoneIdFrom(pull.body, process.env.MILESTONE_ID);
  if (!milestoneId) {
    fail('Milestone id is missing. Add a Milestone-Id line to the pull request body, or re-run the workflow with milestone_id.');
  }
  await assertProtected();
  const deployment = reviewDeploymentBody({
    projectId: VERCEL_PROJECT_ID,
    org: 'warehauscollective',
    repo: 'warehaus',
    ref: pull.ref,
    sha: pull.sha,
    prNumber,
    milestoneId,
    convexUrl: convex.cloud,
    convexSite: convex.site,
  });
  if (!deployment.ok) fail(deployment.reason);
  await postConvex({
    milestoneId,
    state: 'building',
    sha: pull.sha,
    prNumber,
    branch: pull.ref,
  });
  const created = await vercel(`/v13/deployments?teamId=${encodeURIComponent(VERCEL_TEAM_ID)}&forceNew=1`, {
    method: 'POST',
    body: JSON.stringify(deployment.body),
  });
  if (!created.ok) {
    await postConvex({ milestoneId, state: 'failed', sha: pull.sha, prNumber, branch: pull.ref });
    fail(`Vercel create deployment returned ${created.status}`);
  }
  const createdBody = (await created.json()) as { id?: string };
  if (!createdBody.id) fail('Vercel did not return a deployment id');
  let url = '';
  try {
    url = await pollReady(createdBody.id);
  } catch (error) {
    await deleteVercelDeployment({ token: process.env.VERCEL_TOKEN, teamId: VERCEL_TEAM_ID, deploymentId: createdBody.id });
    await postConvex({ milestoneId, state: 'failed', sha: pull.sha, prNumber, branch: pull.ref });
    fail(error instanceof Error ? error.message : 'Preview deployment failed');
  }
  const stored = await postConvex({
    milestoneId,
    state: 'ready',
    url,
    sha: pull.sha,
    deploymentId: createdBody.id,
    prNumber,
    branch: pull.ref,
    builtAt: Date.now(),
  });
  if (stored.ok === false) {
    await deleteVercelDeployment({ token: process.env.VERCEL_TOKEN, teamId: VERCEL_TEAM_ID, deploymentId: createdBody.id });
    fail(stored.reason ?? 'Could not store the preview');
  }
  if (stored.previousDeploymentId) {
    await deleteVercelDeployment({
      token: process.env.VERCEL_TOKEN,
      teamId: VERCEL_TEAM_ID,
      deploymentId: stored.previousDeploymentId,
    });
  }
  say(`Review preview ready for PR #${prNumber}`);
}

async function close(): Promise<void> {
  const prNumber = Number(process.env.PR_NUMBER);
  if (!Number.isInteger(prNumber) || prNumber < 1) fail('Pull request number is missing');
  const listed = await vercel(
    `/v6/deployments?projectId=${encodeURIComponent(VERCEL_PROJECT_ID)}&teamId=${encodeURIComponent(VERCEL_TEAM_ID)}&meta-prNumber=${prNumber}`,
  );
  if (!listed.ok) fail(`Vercel deployment list returned ${listed.status}`);
  const body = (await listed.json()) as { deployments?: Array<{ uid?: string }> };
  const ids = (body.deployments ?? []).map((row) => row.uid).filter((id): id is string => Boolean(id));
  let outcome: 'deleted' | 'already-gone' | 'failed' = ids.length === 0 ? 'already-gone' : 'deleted';
  for (const id of ids) {
    const result = await deleteVercelDeployment({ token: process.env.VERCEL_TOKEN, teamId: VERCEL_TEAM_ID, deploymentId: id });
    if (result.status === 'failed' || result.status === 'unconfigured') outcome = 'failed';
  }
  await postConvex({ op: 'close', prNumber, outcome });
  say(`Review preview close recorded for PR #${prNumber}`);
}

const command = process.argv[2];
if (command !== 'build' && command !== 'close') fail('Use build or close');
if (!reviewPreviewCliShouldRun({ vercelToken: process.env.VERCEL_TOKEN, previewSecret: process.env.REVIEW_PREVIEW_SECRET })) {
  say('Review preview secrets are unset. Nothing to do.');
  process.exit(0);
}
if (command === 'build') {
  build().catch((error: unknown) => fail(error instanceof Error ? error.message : 'Review preview failed'));
} else {
  close().catch((error: unknown) => fail(error instanceof Error ? error.message : 'Review preview close failed'));
}
