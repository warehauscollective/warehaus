/**
 * Review-time Vercel previews for one milestone.
 * Shared dev graceful-mastiff-960 only. Production unique-turtle-383 is refused.
 * Preview state stays on the milestone. Clients never receive it.
 */

import { timingSafeEqualUtf8 } from './constantTime';
import { isPeterEmail } from './milestoneReview';

export { isPeterEmail };

export const SHARED_DEV_DEPLOYMENT = 'graceful-mastiff-960';
export const SHARED_DEV_CLOUD_HOST = 'graceful-mastiff-960.convex.cloud';
export const SHARED_DEV_SITE_HOST = 'graceful-mastiff-960.convex.site';
export const PRODUCTION_DEPLOYMENT = 'unique-turtle-383';
export const PRODUCTION_APP_HOST = 'warehaus-portal.vercel.app';
export const VERCEL_TEAM_ID = 'team_gk8AwUegrHijeRwyTvHBsWhO';
export const VERCEL_PROJECT_ID = 'prj_5QsXPIEeRT2NCFovhsV3wqMt3bW5';
export const VERCEL_PROJECT_NAME = 'warehaus-portal';
export const REVIEW_PREVIEW_PATH = '/review-preview';
export const PREVIEW_DELETED_ACTIVITY = 'milestone.preview_deleted';
export const PREVIEW_READY_ACTIVITY = 'milestone.preview_ready';

export const REVIEW_PREVIEW_STATES = ['building', 'ready', 'failed', 'removed'] as const;
export type ReviewPreviewState = (typeof REVIEW_PREVIEW_STATES)[number];

export type ReviewPreviewRecord = {
  state?: ReviewPreviewState | null;
  url?: string | null;
  sha?: string | null;
  deploymentId?: string | null;
  prNumber?: number | null;
  iteration?: number | null;
  branch?: string | null;
  builtAt?: number | null;
  deleteState?: PreviewDeleteState | null;
  deleteAttempts?: number | null;
  deleteFailedAt?: number | null;
};

/** Writes onto the milestone preview fields. Iteration stays on `iteration`. */
export type ReviewPreviewPatch = {
  previewUrl?: string;
  previewCommit?: string;
  previewDeploymentId?: string;
  previewPrNumber?: number;
  previewBranch?: string;
  previewBuiltAt?: number;
  previewBuild?: 'building' | 'failed';
  previewDelete?: 'removed';
};

const NOTION_WRITE_FLAGS = [
  'NOTION_WRITEBACK_ENABLED',
  'NOTION_PROJECT_CREATE_ENABLED',
  'INVITE_EMAIL_ENABLED',
] as const;

/** Tokens and webhook secrets. Blank on the preview deployment so a project env cannot leak in. */
const NOTION_SECRET_KEYS = ['NOTION_WAREHAUS_TOKEN', 'NOTION_WEBHOOK_SECRET'] as const;

/** Automatic Vercel deletes. Attempt 3 is the last; the card then waits for a person. */
export const PREVIEW_DELETE_ATTEMPT_LIMIT = 3;

const DELETE_BACKOFF_MS = [30_000, 120_000, 480_000] as const;

/** `removing` is the automatic retry. `failed` means the attempt limit was reached. */
export type PreviewDeleteState = 'removing' | 'failed';

/** The workflow and the close job do nothing unless both secrets are set. */
export function reviewPreviewCliShouldRun(env: { vercelToken?: string | null; previewSecret?: string | null }): boolean {
  return Boolean(env.vercelToken?.trim() && env.previewSecret?.trim());
}

export function retryActorAllowed(email: string | null | undefined): { ok: true } | { ok: false; reason: string } {
  if (isPeterEmail(email)) return { ok: false, reason: 'Peter cannot retry a review preview' };
  return { ok: true };
}

export function isReviewPreviewState(value: string): value is ReviewPreviewState {
  return (REVIEW_PREVIEW_STATES as readonly string[]).includes(value);
}

export function shortSha(sha: string | null | undefined): string | null {
  const value = sha?.trim().toLowerCase() ?? '';
  if (!/^[0-9a-f]{7,40}$/.test(value)) return null;
  return value.slice(0, 7);
}

export function assertReviewConvexUrl(
  url: string | undefined | null,
): { ok: true; cloud: string; site: string } | { ok: false; reason: string } {
  const raw = url?.trim() ?? '';
  if (!raw) return { ok: false, reason: 'Convex URL is missing' };
  if (raw.includes(PRODUCTION_DEPLOYMENT)) {
    return { ok: false, reason: 'Convex URL points at unique-turtle-383' };
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: 'Convex URL is not a URL' };
  }
  if (parsed.protocol !== 'https:') return { ok: false, reason: 'Convex URL is not https' };
  if (parsed.host !== SHARED_DEV_CLOUD_HOST) {
    return { ok: false, reason: 'Convex URL is not graceful-mastiff-960' };
  }
  return {
    ok: true,
    cloud: `https://${SHARED_DEV_CLOUD_HOST}`,
    site: `https://${SHARED_DEV_SITE_HOST}`,
  };
}

export function assertPreviewAppUrl(
  url: string | null | undefined,
): { ok: true; href: string; host: string } | { ok: false; reason: string } {
  const raw = url?.trim() ?? '';
  if (!raw) return { ok: false, reason: 'Preview URL is missing' };
  if (raw.includes(PRODUCTION_DEPLOYMENT)) {
    return { ok: false, reason: 'Preview URL points at unique-turtle-383' };
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: 'Preview URL is not a URL' };
  }
  if (parsed.protocol !== 'https:') return { ok: false, reason: 'Preview URL is not https' };
  if (parsed.host === PRODUCTION_APP_HOST || parsed.host.endsWith('.convex.cloud') || parsed.host.endsWith('.convex.site')) {
    return { ok: false, reason: 'Preview URL is a production host' };
  }
  if (!parsed.host.endsWith('.vercel.app')) {
    return { ok: false, reason: 'Preview URL is not a Vercel preview host' };
  }
  parsed.hash = '';
  parsed.search = '';
  return { ok: true, href: parsed.toString().replace(/\/$/, ''), host: parsed.host };
}

/**
 * Inspects the env object that will be sent on the deployment.
 * Every Notion token and write flag must be present and safe.
 * An empty object fails: missing keys are not a blank override.
 */
export function assertPreviewNotionFlags(
  env: Record<string, string | undefined>,
): { ok: true } | { ok: false; reason: string } {
  for (const name of NOTION_SECRET_KEYS) {
    if (!(name in env)) return { ok: false, reason: `${name} must be set on a review preview` };
    if (env[name]?.trim()) return { ok: false, reason: `${name} must be blank on a review preview` };
  }
  for (const name of NOTION_WRITE_FLAGS) {
    if (!(name in env)) return { ok: false, reason: `${name} must be set on a review preview` };
    if (env[name] === 'true') return { ok: false, reason: `${name} must not be enabled on a review preview` };
    if (env[name] !== 'false') return { ok: false, reason: `${name} must be false on a review preview` };
  }
  return { ok: true };
}

export function blankPreviewNotionEnv(): Record<(typeof NOTION_SECRET_KEYS)[number] | (typeof NOTION_WRITE_FLAGS)[number], string> {
  return {
    NOTION_WAREHAUS_TOKEN: '',
    NOTION_WEBHOOK_SECRET: '',
    NOTION_WRITEBACK_ENABLED: 'false',
    NOTION_PROJECT_CREATE_ENABLED: 'false',
    INVITE_EMAIL_ENABLED: 'false',
  };
}

export function previewProjectCreateEnabled(input: { vercelEnv?: string; flag?: string }): boolean {
  if (input.vercelEnv === 'preview') return false;
  return input.flag === 'true';
}

export function ignoreBuildExitCode(env: { REVIEW_PREVIEW?: string }): 0 | 1 {
  return env.REVIEW_PREVIEW === '1' ? 1 : 0;
}

export function previewProtectionCoversPreviews(project: {
  ssoProtection?: { deploymentType?: string } | null;
}): boolean {
  const type = project.ssoProtection?.deploymentType;
  return (
    type === 'all' ||
    type === 'preview' ||
    type === 'prod_deployment_urls_and_all_previews' ||
    type === 'all_except_custom_domains'
  );
}

export function reviewReadyChatMessage(input: { prNumber: number; iteration: number; url: string }): string {
  return `PR #${input.prNumber} · Iteration ${input.iteration} is ready. Open preview: ${input.url} (test data, sign in). Reply approve, or request changes with your notes.`;
}

export function builtFromLine(sha: string, iteration: number): string | null {
  const short = shortSha(sha);
  if (!short || !Number.isInteger(iteration) || iteration < 1) return null;
  return `Built from ${short} · Iteration ${iteration}`;
}

export const PROTECTED_PREVIEW_LINE = 'Protected Vercel preview · test data · sign in';
export const REMOVED_AFTER_APPROVAL_LINE = 'Preview removed after approval · Vercel build deleted';

export function reviewPreviewForAudience(
  audience: 'staff' | 'client',
  record: ReviewPreviewRecord | null | undefined,
): ReviewPreviewRecord | null {
  if (audience !== 'staff' || !record?.state || !isReviewPreviewState(record.state)) return null;
  const href = record.url ? assertPreviewAppUrl(record.url) : null;
  return {
    state: record.state,
    url: href && href.ok ? href.href : null,
    sha: shortSha(record.sha) ? record.sha!.trim().toLowerCase() : null,
    deploymentId: null,
    prNumber: record.prNumber ?? null,
    iteration: record.iteration ?? null,
    branch: record.branch?.trim() || null,
    builtAt: record.builtAt ?? null,
  };
}

export type RoadmapPreviewDelete = {
  state?: PreviewDeleteState | null;
  attempts?: number | null;
  failedAt?: number | null;
};

/**
 * Query-path copy of the preview onto a roadmap view.
 * Clients lose the key entirely, even when the input view already has one.
 */
export function reviewPreviewOnRoadmap<T extends Record<string, unknown>>(
  audience: 'staff' | 'client',
  view: T,
  record: ReviewPreviewRecord | null | undefined,
  deletion?: RoadmapPreviewDelete | null,
): Omit<T, 'reviewPreview'> & {
  reviewPreview?: {
    state: ReviewPreviewState;
    url: string | null;
    sha: string | null;
    prNumber: number | null;
    iteration: number | null;
    branch: string | null;
    builtAt: number | null;
    deleteState?: PreviewDeleteState;
    deleteAttempts?: number | null;
    deleteFailedAt?: number | null;
  };
} {
  const { reviewPreview: _drop, ...rest } = view;
  if (audience !== 'staff') return rest;
  const preview = reviewPreviewForAudience('staff', record);
  if (!preview?.state) return rest;
  const deleteState = deletion?.state === 'removing' || deletion?.state === 'failed' ? deletion.state : null;
  return {
    ...rest,
    reviewPreview: {
      state: preview.state,
      url: preview.url ?? null,
      sha: preview.sha ?? null,
      prNumber: preview.prNumber ?? null,
      iteration: preview.iteration ?? null,
      branch: preview.branch ?? null,
      builtAt: preview.builtAt ?? null,
      ...(deleteState
        ? {
            deleteState,
            deleteAttempts: deletion?.attempts ?? null,
            deleteFailedAt: deletion?.failedAt ?? null,
          }
        : {}),
    },
  };
}

export function previewDeleteAfterFailure(input: { attempts: number; now: number; terminal?: boolean }): {
  state: PreviewDeleteState;
  attempts: number;
  failedAt: number;
  delayMs: number | null;
} {
  const attempts = input.attempts;
  const failedAt = input.now;
  if (input.terminal || attempts >= PREVIEW_DELETE_ATTEMPT_LIMIT) {
    return { state: 'failed', attempts, failedAt, delayMs: null };
  }
  const delayMs = DELETE_BACKOFF_MS[Math.max(0, attempts - 1)] ?? DELETE_BACKOFF_MS[DELETE_BACKOFF_MS.length - 1];
  return { state: 'removing', attempts, failedAt, delayMs };
}

function sameRecord(current: ReviewPreviewRecord, next: ReviewPreviewRecord): boolean {
  return (
    (current.state ?? null) === (next.state ?? null) &&
    (current.url ?? null) === (next.url ?? null) &&
    (current.sha ?? null) === (next.sha ?? null) &&
    (current.deploymentId ?? null) === (next.deploymentId ?? null) &&
    (current.prNumber ?? null) === (next.prNumber ?? null) &&
    (current.iteration ?? null) === (next.iteration ?? null) &&
    (current.branch ?? null) === (next.branch ?? null) &&
    (current.builtAt ?? null) === (next.builtAt ?? null)
  );
}

export function reviewPreviewSetPatch(input: {
  current: ReviewPreviewRecord;
  next: ReviewPreviewRecord;
}):
  | { ok: true; patch: null }
  | {
      ok: true;
      patch: ReviewPreviewPatch;
      clearUrl: boolean;
      clearDeploymentId: boolean;
      previousDeploymentId: string | null;
      chat: string | null;
    }
  | { ok: false; reason: string } {
  if (!input.next.state || !isReviewPreviewState(input.next.state)) {
    return { ok: false, reason: 'Preview state must be building, ready, failed, or removed' };
  }
  if (input.next.state === 'ready') {
    const href = assertPreviewAppUrl(input.next.url);
    if (!href.ok) return href;
    if (!shortSha(input.next.sha)) return { ok: false, reason: 'Preview sha is missing' };
    if (!input.next.prNumber || input.next.prNumber < 1) return { ok: false, reason: 'Pull request number is missing' };
    const iteration = input.next.iteration ?? input.current.iteration ?? 1;
    const normalized: ReviewPreviewRecord = {
      state: 'ready',
      url: href.href,
      sha: input.next.sha!.trim().toLowerCase(),
      deploymentId: input.next.deploymentId?.trim() || null,
      prNumber: input.next.prNumber,
      iteration,
      branch: input.next.branch?.trim() || null,
      builtAt: input.next.builtAt ?? null,
    };
    if (sameRecord(input.current, normalized)) return { ok: true, patch: null };
    return {
      ok: true,
      patch: toPatch(normalized),
      clearUrl: false,
      clearDeploymentId: false,
      previousDeploymentId:
        input.current.deploymentId && input.current.deploymentId !== normalized.deploymentId
          ? input.current.deploymentId
          : null,
      chat: reviewReadyChatMessage({ prNumber: normalized.prNumber!, iteration, url: href.href }),
    };
  }
  const normalized: ReviewPreviewRecord = {
    state: input.next.state,
    url: null,
    sha: input.next.sha ? input.next.sha.trim().toLowerCase() : input.current.sha ?? null,
    deploymentId: input.next.state === 'building' ? null : input.current.deploymentId ?? null,
    prNumber: input.next.prNumber ?? input.current.prNumber ?? null,
    iteration: input.next.iteration ?? input.current.iteration ?? 1,
    branch: input.next.branch?.trim() || input.current.branch || null,
    builtAt: input.current.builtAt ?? null,
  };
  if (input.next.state === 'failed' || input.next.state === 'building') {
    normalized.url = null;
  }
  if (sameRecord({ ...input.current, url: input.current.url ?? null }, normalized)) {
    return { ok: true, patch: null };
  }
  return {
    ok: true,
    patch: toPatch(normalized),
    clearUrl: true,
    clearDeploymentId: input.next.state === 'building',
    previousDeploymentId: null,
    chat: null,
  };
}

function toPatch(record: ReviewPreviewRecord): ReviewPreviewPatch {
  const patch: ReviewPreviewPatch = {};
  if (record.state === 'building' || record.state === 'failed') patch.previewBuild = record.state;
  if (record.state === 'removed') patch.previewDelete = 'removed';
  if (record.url) patch.previewUrl = record.url;
  if (record.sha) patch.previewCommit = record.sha;
  if (record.deploymentId) patch.previewDeploymentId = record.deploymentId;
  if (record.prNumber) patch.previewPrNumber = record.prNumber;
  if (record.branch) patch.previewBranch = record.branch;
  if (record.builtAt) patch.previewBuiltAt = record.builtAt;
  return patch;
}

/** Fields cleared when a preview URL must leave the milestone. Undefined drops the field. */
export function clearedPreviewFields(): {
  previewUrl: undefined;
  previewDeploymentId: undefined;
} {
  return { previewUrl: undefined, previewDeploymentId: undefined };
}

export function clearPreviewOnApprove(input: {
  decision: string;
  record: ReviewPreviewRecord;
}): { patch: null; deploymentId: null } | {
  patch: {
    previewUrl?: undefined;
    previewDelete?: undefined;
    previewDeleteAttempt?: undefined;
    previewDeleteAt?: undefined;
  } | null;
  deploymentId: string | null;
} {
  if (input.decision !== 'approved') return { patch: null, deploymentId: null };
  const deploymentId = input.record.deploymentId?.trim() || null;
  const hasUrl = Boolean(input.record.url);
  const hasDelete = Boolean(input.record.deleteState || input.record.deleteAttempts || input.record.deleteFailedAt);
  if (!deploymentId && !hasUrl && !hasDelete) return { patch: null, deploymentId: null };
  const patch = {
    ...(hasUrl ? { previewUrl: undefined } : {}),
    ...(hasDelete
      ? {
          previewDelete: undefined,
          previewDeleteAttempt: undefined,
          previewDeleteAt: undefined,
        }
      : {}),
  };
  return { patch: Object.keys(patch).length > 0 ? patch : null, deploymentId };
}

export function removalAfterDelete(input: {
  outcome: 'deleted' | 'already-gone' | 'failed' | 'unconfigured';
  record: ReviewPreviewRecord;
}): { patch: null } | {
  patch: {
    previewDelete: 'removed';
    previewUrl: undefined;
    previewDeploymentId: undefined;
    previewBuild: undefined;
    previewDeleteAttempt: undefined;
    previewDeleteAt: undefined;
  };
} {
  if (input.outcome !== 'deleted' && input.outcome !== 'already-gone') return { patch: null };
  if (input.record.state === 'removed' && !input.record.url && !input.record.deploymentId) return { patch: null };
  return {
    patch: {
      previewDelete: 'removed',
      previewUrl: undefined,
      previewDeploymentId: undefined,
      previewBuild: undefined,
      previewDeleteAttempt: undefined,
      previewDeleteAt: undefined,
    },
  };
}

export function retryPreviewPatch(
  record: ReviewPreviewRecord,
): { patch: null } | { patch: ReviewPreviewPatch & { previewUrl: undefined; previewDeploymentId: undefined } } {
  if (record.state !== 'failed') return { patch: null };
  return {
    patch: {
      previewBuild: 'building',
      previewUrl: undefined,
      previewDeploymentId: undefined,
      ...(record.prNumber ? { previewPrNumber: record.prNumber } : {}),
      ...(record.branch ? { previewBranch: record.branch } : {}),
    },
  };
}

export function deleteVercelResult(status: number): 'deleted' | 'already-gone' | 'failed' {
  if (status === 200 || status === 204) return 'deleted';
  if (status === 404 || status === 410) return 'already-gone';
  return 'failed';
}

export function previewDeletedActivity(input: {
  orgId: string;
  projectId: string;
  milestoneId: string;
  name: string;
  sha: string | null;
  outcome: 'deleted' | 'already-gone' | 'failed' | 'unconfigured';
  timestamp: number;
}): {
  orgId: string;
  projectId: string;
  milestoneId: string;
  name: string;
  summary: string;
  type: string;
  tone: 'warn' | 'accent';
  timestamp: number;
} {
  const sha = shortSha(input.sha) ?? 'unknown';
  const summary =
    input.outcome === 'deleted'
      ? `Preview ${sha} deleted`
      : input.outcome === 'already-gone'
        ? `Preview ${sha} already deleted`
        : input.outcome === 'unconfigured'
          ? `Preview ${sha} delete skipped; VERCEL_TOKEN is not set`
          : `Preview ${sha} delete failed`;
  return {
    orgId: input.orgId,
    projectId: input.projectId,
    milestoneId: input.milestoneId,
    name: input.name,
    summary,
    type: PREVIEW_DELETED_ACTIVITY,
    tone: input.outcome === 'deleted' || input.outcome === 'already-gone' ? 'accent' : 'warn',
    timestamp: input.timestamp,
  };
}

export function authorizeReviewPreview(input: {
  configuredSecret: string | undefined;
  authorizationHeader: string | null;
}): 'ok' | 'unconfigured' | 'unauthorized' {
  const secret = input.configuredSecret?.trim() ?? '';
  if (!secret) return 'unconfigured';
  const match = /^Bearer\s+(\S+)\s*$/.exec(input.authorizationHeader ?? '');
  if (!match?.[1] || !timingSafeEqualUtf8(match[1], secret)) return 'unauthorized';
  return 'ok';
}

export function reviewDeploymentBody(input: {
  projectId: string;
  org: string;
  repo: string;
  ref: string;
  sha: string;
  prNumber: number;
  milestoneId: string;
  convexUrl: string;
  convexSite: string;
}): { ok: true; body: Record<string, unknown> } | { ok: false; reason: string } {
  const convex = assertReviewConvexUrl(input.convexUrl);
  if (!convex.ok) return convex;
  if (input.projectId !== VERCEL_PROJECT_ID) return { ok: false, reason: 'Vercel project is not warehaus-portal' };
  const env = {
    REVIEW_PREVIEW: '1',
    NEXT_PUBLIC_CONVEX_URL: convex.cloud,
    NEXT_PUBLIC_CONVEX_SITE_URL: input.convexSite,
    ...blankPreviewNotionEnv(),
  };
  const notion = assertPreviewNotionFlags(env);
  if (!notion.ok) return notion;
  return {
    ok: true,
    body: {
      name: VERCEL_PROJECT_NAME,
      project: input.projectId,
      gitSource: { type: 'github', org: input.org, repo: input.repo, ref: input.ref, sha: input.sha },
      projectSettings: { framework: 'nextjs', rootDirectory: 'apps/portal' },
      meta: {
        reviewPreview: '1',
        prNumber: String(input.prNumber),
        milestoneId: input.milestoneId,
        githubCommitSha: input.sha,
      },
      env,
      build: { env },
    },
  };
}

export async function deleteVercelDeployment(input: {
  token: string | undefined;
  teamId: string;
  deploymentId: string;
  fetchImpl?: typeof fetch;
}): Promise<{ status: 'deleted' | 'already-gone' | 'failed' | 'unconfigured'; httpStatus: number }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  if (!input.token?.trim()) return { status: 'unconfigured', httpStatus: 0 };
  if (!input.deploymentId.trim()) return { status: 'already-gone', httpStatus: 0 };
  const url = `https://api.vercel.com/v13/deployments/${encodeURIComponent(input.deploymentId)}?teamId=${encodeURIComponent(input.teamId)}`;
  const response = await fetchImpl(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${input.token}` },
  });
  return { status: deleteVercelResult(response.status), httpStatus: response.status };
}

export function redactSecrets(text: string, secrets: readonly string[]): string {
  let next = text;
  for (const secret of secrets) {
    if (secret) next = next.split(secret).join('[redacted]');
  }
  return next;
}
