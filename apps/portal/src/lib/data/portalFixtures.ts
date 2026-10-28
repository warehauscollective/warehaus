/** Local screenshot / empty-Convex stand-in. Never points at a deployment. */
export function portalFixturesEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PORTAL_FIXTURES === '1';
}

export const FIXTURE_SESSION = {
  contactId: 'fixture-contact-staff',
  orgId: 'c-warehaus',
  orgSlug: 'warehaus-internal',
  role: 'Warehaus Staff',
  name: 'Alex Staff',
  email: 'alex@warehaus.co',
  isStaff: true,
};

export const FIXTURE_CLIENT_SESSION = {
  contactId: 'ct-ada',
  orgId: 'c-north',
  orgSlug: 'northwind',
  role: 'Client Admin',
  name: 'Ada North',
  email: 'ada@northwind.example',
  isStaff: false,
};
