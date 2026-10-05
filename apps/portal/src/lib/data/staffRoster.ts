/**
 * Staff roster queries added on this branch (`listForStaff`, `listForOrg`).
 * They are not deployed on production Convex `unique-turtle-383`.
 * Leave this off until that deploy is an explicit decision.
 */

export function staffRosterQueriesDeployedFrom(flag: string | undefined): boolean {
  return flag === '1';
}

export function staffRosterQueriesDeployed(): boolean {
  return staffRosterQueriesDeployedFrom(
    (process.env as Record<string, string | undefined>).NEXT_PUBLIC_PORTAL_STAFF_QUERIES,
  );
}

export function isMissingConvexFunction(message: string | null | undefined): boolean {
  if (!message) return false;
  return /could not find public function/i.test(message);
}
