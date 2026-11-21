/**
 * One public GitHub read when staff set a task to Shipped.
 * No token. The review-preview token is not used here. No polling.
 */

const PULL = /^(?:https:\/\/)?github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)\/?$/i;
const SHIP_OWNER = 'warehauscollective';
const SHIP_REPO = 'warehaus';

export const SHIPPED_NEEDS_LINK = 'Shipped needs a pull request link.';
export const SHIPPED_NOT_MERGED = 'That pull request is not merged into main.';
export const SHIPPED_UNVERIFIED = 'Could not verify that pull request.';
export const SHIPPED_RATE_LIMITED = 'GitHub is rate limiting this check. Try again in a minute.';

export type PullRef = { owner: string; repo: string; number: number; url: string };

export function parsePullRequestRef(value: string): PullRef | null {
  const match = PULL.exec(value.trim());
  if (!match) return null;
  const owner = (match[1] ?? '').toLowerCase();
  const repo = (match[2] ?? '').toLowerCase();
  const number = Number(match[3]);
  if (owner !== SHIP_OWNER || repo !== SHIP_REPO || !Number.isInteger(number) || number < 1) return null;
  return {
    owner: SHIP_OWNER,
    repo: SHIP_REPO,
    number,
    url: `https://github.com/${SHIP_OWNER}/${SHIP_REPO}/pull/${number}`,
  };
}

/** Explicit link wins. Otherwise the task's stored link, then a PR link row. */
export function resolveShipLink(input: {
  explicit?: string | null;
  stored?: string | null;
  links?: readonly string[];
}): { ok: true; link: string } | { ok: false; error: string } {
  const explicit = input.explicit?.trim() ?? '';
  if (explicit) {
    const parsed = parsePullRequestRef(explicit);
    if (!parsed) return { ok: false, error: SHIPPED_NEEDS_LINK };
    return { ok: true, link: parsed.url };
  }
  const stored = parsePullRequestRef(input.stored ?? '');
  if (stored) return { ok: true, link: stored.url };
  for (const link of input.links ?? []) {
    const parsed = parsePullRequestRef(link);
    if (parsed) return { ok: true, link: parsed.url };
  }
  return { ok: false, error: SHIPPED_NEEDS_LINK };
}

/** Merged into the base branch named main. A closed pull request that did not merge is rejected. */
export function readMergedPull(body: unknown): { ok: true } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: SHIPPED_UNVERIFIED };
  const pull = body as { merged?: unknown; base?: unknown };
  if (typeof pull.merged !== 'boolean') return { ok: false, error: SHIPPED_UNVERIFIED };
  const base = pull.base && typeof pull.base === 'object' ? (pull.base as { ref?: unknown }).ref : null;
  if (pull.merged === true && base === 'main') return { ok: true };
  return { ok: false, error: SHIPPED_NOT_MERGED };
}

function rateLimited(response: Response): boolean {
  if (response.status === 429) return true;
  if (response.status !== 403) return false;
  if (response.headers.get('x-ratelimit-remaining') === '0') return true;
  return response.headers.get('retry-after') != null;
}

/** Public pull request read. Sends no credential. */
export async function verifyPullMerged(input: {
  link: string;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true; link: string } | { ok: false; error: string }> {
  const parsed = parsePullRequestRef(input.link);
  if (!parsed) return { ok: false, error: SHIPPED_NEEDS_LINK };
  const fetchImpl = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(
      `https://api.github.com/repos/${SHIP_OWNER}/${SHIP_REPO}/pulls/${parsed.number}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(8000),
      },
    );
  } catch {
    return { ok: false, error: SHIPPED_UNVERIFIED };
  }
  if (rateLimited(response)) return { ok: false, error: SHIPPED_RATE_LIMITED };
  if (!response.ok) return { ok: false, error: SHIPPED_UNVERIFIED };
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, error: SHIPPED_UNVERIFIED };
  }
  const decision = readMergedPull(body);
  if (!decision.ok) return decision;
  return { ok: true, link: parsed.url };
}
