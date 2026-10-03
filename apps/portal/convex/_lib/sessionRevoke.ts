/**
 * Delete Better Auth sessions for one user.
 * Same adapter shape as staff reprovision in PR #20
 * (`staffSessionDeleteArgs` / `staffSessionDeleteCursor` on fix/portal-signup-security).
 * Copied here so this branch does not merge that PR.
 */

export function sessionDeleteArgs(userId: string): {
  model: 'session';
  where: [{ field: 'userId'; operator: 'eq'; value: string }];
} {
  return {
    model: 'session',
    where: [{ field: 'userId', operator: 'eq', value: userId }],
  };
}

/** Next page cursor, or null when every matching session is gone. */
export function sessionDeleteCursor(page: {
  isDone: boolean;
  continueCursor: string | null;
}): string | null {
  if (page.isDone) return null;
  if (!page.continueCursor) {
    throw new Error('Session delete did not finish');
  }
  return page.continueCursor;
}
