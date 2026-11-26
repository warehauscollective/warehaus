/**
 * Runner app releases (decision 0005). Pure: no Convex imports.
 *
 * CI publishes a signed, notarized zip on a production deploy that changes the
 * runner. The zip goes to Convex file storage, never a public release page.
 * The app asks for the latest build between runs and updates to a higher one.
 */

export const RUNNER_APP_PUBLISH_PATHS = Object.freeze({
  uploadUrl: '/runner-app/upload-url',
  release: '/runner-app/release',
});

/** Releases kept in storage. Older zips are deleted when a new one lands. */
export const RUNNER_APP_KEEP = 3;
/** Read at most this many rows when pruning, so a publish never scans the table. */
export const RUNNER_APP_PRUNE_SCAN = 10;
export const RUNNER_APP_MAX_BYTES = 200 * 1024 * 1024;
export const RUNNER_APP_MIN_MACOS = '14.0';

export type RunnerAppReleaseInput = {
  version: string;
  build: number;
  sha256: string;
  size: number;
  minMacOS: string;
};

export type RunnerAppReleaseView = {
  version: string;
  build: number;
  sha256: string;
  size: number;
  minMacOS: string;
  publishedAt: number;
  url: string;
};

/** Reads a publish request body. Anything off is refused with one plain reason. */
export function parseRunnerAppRelease(body: Record<string, unknown>): { ok: true; release: RunnerAppReleaseInput } | { ok: false; reason: string } {
  const version = typeof body.version === 'string' ? body.version.trim() : '';
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,4}$/.test(version)) return { ok: false, reason: 'version must look like 1.4.0' };
  const build = body.build;
  if (typeof build !== 'number' || !Number.isInteger(build) || build < 1) return { ok: false, reason: 'build must be a whole number from 1' };
  const sha256 = typeof body.sha256 === 'string' ? body.sha256.trim().toLowerCase() : '';
  if (!/^[0-9a-f]{64}$/.test(sha256)) return { ok: false, reason: 'sha256 must be 64 hex characters' };
  const size = body.size;
  if (typeof size !== 'number' || !Number.isInteger(size) || size < 1 || size > RUNNER_APP_MAX_BYTES) {
    return { ok: false, reason: 'size is missing or too large' };
  }
  const minMacOS = typeof body.minMacOS === 'string' && /^\d{2}\.\d$/.test(body.minMacOS) ? body.minMacOS : RUNNER_APP_MIN_MACOS;
  return { ok: true, release: { version, build, sha256, size, minMacOS } };
}

/**
 * Whether a publish writes. A repeat of the latest build with the same hash is
 * a no-op, so a retried CI step is safe. A lower or equal build otherwise is refused.
 */
export function runnerAppPublishDecision(
  latest: { build: number; sha256: string } | null,
  next: { build: number; sha256: string },
): 'insert' | 'same' | 'stale' {
  if (!latest) return 'insert';
  if (latest.build === next.build && latest.sha256 === next.sha256) return 'same';
  return next.build > latest.build ? 'insert' : 'stale';
}

/** True when the app on a Mac should update to `latest`. */
export function runnerAppNeedsUpdate(installedBuild: number | null | undefined, latest: { build: number } | null): boolean {
  if (!latest) return false;
  return installedBuild == null || latest.build > installedBuild;
}
