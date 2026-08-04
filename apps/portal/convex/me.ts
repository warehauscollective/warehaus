import { clientQuery } from './_lib/wrappers';

/** Session contact + org for the signed-in portal user. */
export const getPortalSession = clientQuery({
  args: {},
  handler: async (ctx) => {
    const { identity } = ctx;
    return {
      contactId: identity.contactId,
      orgId: identity.orgId,
      orgSlug: identity.orgSlug,
      role: identity.role,
      name: identity.name,
      email: identity.email,
      isStaff: identity.role === 'Warehaus Staff',
    };
  },
});
