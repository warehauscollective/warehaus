/**
 * Staff-attached review links on a production milestone.
 * The preview worker still refuses unique-turtle-383. This path never
 * starts that worker and never reads a review token.
 */

import { assertReviewConvexUrl } from './reviewPreview';
import { isPeterEmail } from './milestoneReview';

export { isPeterEmail };

/** Team preview hosts: warehaus-portal-*-warehaus-collective.vercel.app */
export const PREVIEW_LINK_HOST_PATTERN =
  /^warehaus-portal-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?-warehaus-collective\.vercel\.app$/;

/**
 * Extra exact hosts. Empty unless a preview host cannot match the pattern.
 * Localhost and the production alias are rejected even if listed here.
 */
export const PREVIEW_LINK_ALLOWLIST: readonly string[] = [];

export const PREVIEW_LINK_EMPTY = 'Add a preview link.';
export const PREVIEW_LINK_HTTPS = 'Preview links have to be https.';
export const PREVIEW_LINK_LOCAL = 'Localhost links can’t be attached.';
export const PREVIEW_LINK_PRODUCTION = 'That host is production.';
export const PREVIEW_LINK_HOST = 'That isn’t a Warehaus preview link.';

const PRODUCTION_ALIAS_HOSTS = new Set(['warehaus-portal.vercel.app', 'www.warehaus-portal.vercel.app']);

export type PreviewLinkSnapshot = {
  previewUrl?: string | null;
  previewAttachedBy?: string | null;
  previewAttachedAt?: number | null;
  previewBuild?: 'building' | 'failed' | null;
  previewBuildAttempt?: number | null;
  previewBuildAt?: number | null;
};

export type PreviewLinkWrite = {
  previewUrl: string;
  previewAttachedBy: string;
  previewAttachedAt: number;
  previewBuild?: undefined;
  previewBuildAttempt?: undefined;
  previewBuildAt?: undefined;
};

export function staffMayAttachPreviewLink(input: { staff: boolean }): boolean {
  return input.staff === true;
}

/** Approve & deploy on the tile. Peter only, and only once a preview link exists. */
export function peterMayApproveDeploy(input: {
  staff: boolean;
  isPeter: boolean;
  workStatus: string;
  approval?: string | null;
  previewUrl?: string | null;
}): boolean {
  return Boolean(
    input.staff &&
      input.isPeter &&
      input.workStatus === 'ready' &&
      input.approval !== 'approved' &&
      input.previewUrl,
  );
}

/** The disabled Retry copy stays on production. Shared dev can still offer Retry. */
export function reviewRetryLiveOnClient(convexUrl: string | null | undefined): boolean {
  return assertReviewConvexUrl(convexUrl).ok;
}

/** Production writes nothing, even if a token is present. Missing tokens also wait. */
export function reviewRetryAvailable(env: {
  convexUrl?: string | null;
  vercelToken?: string | null;
  githubToken?: string | null;
}): boolean {
  if (!assertReviewConvexUrl(env.convexUrl).ok) return false;
  return Boolean(env.vercelToken?.trim() && env.githubToken?.trim());
}

function deniedHost(host: string): string | null {
  const name = host.trim().toLowerCase();
  if (
    name === 'localhost' ||
    name.endsWith('.localhost') ||
    name === '127.0.0.1' ||
    name === '::1' ||
    name === '[::1]'
  ) {
    return PREVIEW_LINK_LOCAL;
  }
  if (
    PRODUCTION_ALIAS_HOSTS.has(name) ||
    name.includes('unique-turtle-383') ||
    name.endsWith('.convex.cloud') ||
    name.endsWith('.convex.site')
  ) {
    return PREVIEW_LINK_PRODUCTION;
  }
  return null;
}

export function assertStaffPreviewLink(
  url: string,
  allowlist: readonly string[] = PREVIEW_LINK_ALLOWLIST,
): { ok: true; href: string } | { ok: false; reason: string } {
  const raw = url.trim();
  if (!raw) return { ok: false, reason: PREVIEW_LINK_EMPTY };
  if (/^http:\/\//i.test(raw)) return { ok: false, reason: PREVIEW_LINK_HTTPS };
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: PREVIEW_LINK_HOST };
  }
  if (parsed.username || parsed.password) return { ok: false, reason: PREVIEW_LINK_HOST };
  if (parsed.protocol !== 'https:') return { ok: false, reason: PREVIEW_LINK_HTTPS };
  const host = parsed.hostname.toLowerCase();
  const denied = deniedHost(host);
  if (denied) return { ok: false, reason: denied };
  if (parsed.port && parsed.port !== '443') return { ok: false, reason: PREVIEW_LINK_HOST };
  const listed = allowlist.some((item) => item.trim().toLowerCase() === host);
  if (!listed && !PREVIEW_LINK_HOST_PATTERN.test(host)) {
    return { ok: false, reason: PREVIEW_LINK_HOST };
  }
  const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '');
  return { ok: true, href: `https://${host}${path}` };
}

export function planAttachPreviewLink(input: {
  url: string;
  contactId: string;
  now: number;
  current: PreviewLinkSnapshot;
}): { ok: false; reason: string } | { ok: true; wrote: false } | { ok: true; wrote: true; patch: PreviewLinkWrite } {
  const contactId = input.contactId.trim();
  if (!contactId) return { ok: false, reason: 'Staff contact required' };
  const checked = assertStaffPreviewLink(input.url);
  if (!checked.ok) return checked;
  const currentUrl = input.current.previewUrl?.trim() || '';
  const sameLink =
    currentUrl === checked.href &&
    Boolean(input.current.previewAttachedBy) &&
    input.current.previewAttachedAt != null;
  const buildStuck =
    input.current.previewBuild != null ||
    input.current.previewBuildAttempt != null ||
    input.current.previewBuildAt != null;
  if (sameLink && !buildStuck) return { ok: true, wrote: false };
  const patch: PreviewLinkWrite = {
    previewUrl: checked.href,
    previewAttachedBy: contactId,
    previewAttachedAt: input.current.previewAttachedAt != null && sameLink ? input.current.previewAttachedAt : input.now,
  };
  if (input.current.previewBuild != null) patch.previewBuild = undefined;
  if (input.current.previewBuildAttempt != null) patch.previewBuildAttempt = undefined;
  if (input.current.previewBuildAt != null) patch.previewBuildAt = undefined;
  return { ok: true, wrote: true, patch };
}

export function planClearPreviewLink(
  current: PreviewLinkSnapshot,
): { wrote: false } | {
  wrote: true;
  patch: { previewUrl: undefined; previewAttachedBy: undefined; previewAttachedAt: undefined };
} {
  const hasUrl = Boolean(current.previewUrl?.trim());
  const hasActor = Boolean(current.previewAttachedBy) || current.previewAttachedAt != null;
  if (!hasUrl && !hasActor) return { wrote: false };
  return {
    wrote: true,
    patch: { previewUrl: undefined, previewAttachedBy: undefined, previewAttachedAt: undefined },
  };
}
