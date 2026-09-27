/** Login return path that keeps the invite token and drops every email. */
export function signInToAcceptPath(token: string): string {
  const acceptPath = `/accept?token=${encodeURIComponent(token)}`;
  return `/login?next=${encodeURIComponent(acceptPath)}`;
}
