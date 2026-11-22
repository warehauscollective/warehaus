/**
 * Picks a milestone's branch name. Two milestones with the same name must not
 * share a branch, because webhooks find a milestone by its branch.
 */

import { milestoneBranch } from './agentRun';

type BranchReader = {
  db: {
    query: (table: 'milestones') => {
      withIndex: (
        index: 'by_branch',
        range: (q: { eq: (field: 'branch', value: string) => unknown }) => unknown,
      ) => { first: () => Promise<unknown> };
    };
  };
};

const SUFFIX_LIMIT = 20;

/** `milestone/<slug>`, or `milestone/<slug>-2` and up when that one is taken. One indexed read per try. */
export async function uniqueMilestoneBranch(ctx: unknown, name: string): Promise<string> {
  const reader = ctx as BranchReader;
  const base = milestoneBranch(name);
  for (let attempt = 1; attempt <= SUFFIX_LIMIT; attempt += 1) {
    const candidate = branchCandidate(base, attempt);
    const taken = await reader.db
      .query('milestones')
      .withIndex('by_branch', (q) => q.eq('branch', candidate))
      .first();
    if (!taken) return candidate;
  }
  return branchCandidate(base, Date.now() % 100000);
}

/** The base branch on the first try, then the base with `-2`, `-3`, kept inside the length limit. */
export function branchCandidate(base: string, attempt: number): string {
  if (attempt <= 1) return base;
  const suffix = `-${attempt}`;
  const prefix = 'milestone/';
  const slug = base.slice(prefix.length).slice(0, 48 - suffix.length).replace(/-+$/g, '');
  return `${prefix}${slug}${suffix}`;
}
