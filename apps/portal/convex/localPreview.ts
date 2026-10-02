import { hashPassword } from 'better-auth/crypto';
import { v } from 'convex/values';
import { components, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { internalAction, internalMutation, internalQuery, type ActionCtx } from './_generated/server';
import {
  PREVIEW_ACTIVITY,
  PREVIEW_CONTACTS,
  PREVIEW_ORGS,
  PREVIEW_PROJECTS,
  PREVIEW_RESOURCES,
  PREVIEW_TASKS,
  type PreviewContact,
} from './_lib/localPreviewCatalog';
import { passwordRuleState } from './_lib/passwordRules';
import { staffSessionDeleteArgs, staffSessionDeleteCursor } from './_lib/registration';

type AuthUserDoc = { _id: string; email?: string; emailVerified?: boolean };
type AuthAccountDoc = { _id: string };

const SEED_PAGE_PREFIX = 'seed-local-';

/**
 * Idempotent sample data for a dev deployment.
 * Internal only. Refuses to run unless LOCAL_PREVIEW_SEED=1.
 * Does not delete rows.
 */
export const seedSampleData = internalMutation({
  args: {},
  handler: async (ctx): Promise<{
    orgs: string[];
    logins: Array<{ email: string; name: string; role: PreviewContact['role'] }>;
  }> => {
    const now = Date.now();
    const orgIds = new Map<string, Id<'clients'>>();

    for (const org of PREVIEW_ORGS) {
      const existing = await ctx.db
        .query('clients')
        .withIndex('by_slug', (q) => q.eq('slug', org.slug))
        .unique();
      const row = {
        notionPageId: org.notionPageId,
        externalId: org.externalId,
        companyName: org.companyName,
        slug: org.slug,
        status: org.status,
        portalAccess: 'Enabled' as const,
        primaryEmail: org.primaryEmail,
        source: 'portal',
        lastSyncedAt: now,
      };
      const id = existing ? existing._id : await ctx.db.insert('clients', row);
      if (existing) await ctx.db.patch(existing._id, row);
      orgIds.set(org.slug, id);
    }

    for (const contact of PREVIEW_CONTACTS) {
      const orgId = requiredOrg(orgIds, contact.orgSlug);
      const email = contact.email.toLowerCase();
      const existing = await ctx.db
        .query('contacts')
        .withIndex('by_email', (q) => q.eq('email', email))
        .unique();
      const row = {
        orgId,
        notionPageId: contact.notionPageId,
        externalId: contact.externalId,
        name: contact.name,
        email,
        role: contact.role,
        portalAccess: 'Enabled' as const,
        source: 'portal',
        lastSyncedAt: now,
      };
      if (existing) await ctx.db.patch(existing._id, row);
      else await ctx.db.insert('contacts', row);
    }

    const projectIds = new Map<string, Id<'projects'>>();
    for (const project of PREVIEW_PROJECTS) {
      const orgId = requiredOrg(orgIds, project.orgSlug);
      const existing = await ctx.db
        .query('projects')
        .withIndex('by_externalId', (q) => q.eq('externalId', project.externalId))
        .unique();
      const row = {
        orgId,
        notionPageId: project.notionPageId,
        externalId: project.externalId,
        name: project.name,
        description: project.description,
        status: project.status,
        progress: project.progress,
        type: project.type,
        archive: false,
        publishToWarehaus: true,
        stack: project.stack,
        source: 'portal',
        lastSyncedAt: now,
      };
      const id = existing ? existing._id : await ctx.db.insert('projects', row);
      if (existing) await ctx.db.patch(existing._id, row);
      projectIds.set(project.externalId, id);
    }

    for (const task of PREVIEW_TASKS) {
      const projectId = projectIds.get(task.projectExternalId);
      if (!projectId) throw new Error(`Missing preview project ${task.projectExternalId}`);
      const project = PREVIEW_PROJECTS.find((item) => item.externalId === task.projectExternalId);
      if (!project) throw new Error(`Missing preview project ${task.projectExternalId}`);
      const orgId = requiredOrg(orgIds, project.orgSlug);
      const existing = await ctx.db
        .query('tasks')
        .withIndex('by_externalId', (q) => q.eq('externalId', task.externalId))
        .unique();
      const row = {
        orgId,
        projectId,
        notionPageId: task.notionPageId,
        externalId: task.externalId,
        name: task.name,
        status: task.status,
        isDone: task.isDone,
        publishToWarehaus: true,
        source: 'portal',
        lastSyncedAt: now,
      };
      if (existing) await ctx.db.patch(existing._id, row);
      else await ctx.db.insert('tasks', row);
    }

    for (const resource of PREVIEW_RESOURCES) {
      const orgId = requiredOrg(orgIds, resource.orgSlug);
      const projectId = projectIds.get(resource.projectExternalId);
      const existing = await ctx.db
        .query('sharedResources')
        .withIndex('by_externalId', (q) => q.eq('externalId', resource.externalId))
        .unique();
      const row = {
        orgId,
        projectId,
        notionPageId: resource.notionPageId,
        externalId: resource.externalId,
        title: resource.title,
        description: resource.description,
        type: 'Link',
        url: resource.url,
        publishToWarehaus: true,
        archive: false,
        source: 'portal',
        lastSyncedAt: now,
      };
      if (existing) await ctx.db.patch(existing._id, row);
      else await ctx.db.insert('sharedResources', row);
    }

    for (const activity of PREVIEW_ACTIVITY) {
      const orgId = requiredOrg(orgIds, activity.orgSlug);
      const projectId = activity.projectExternalId
        ? projectIds.get(activity.projectExternalId)
        : undefined;
      const existing = (await ctx.db
        .query('activity')
        .withIndex('by_orgId', (q) => q.eq('orgId', orgId))
        .collect())
        .find((row) => row.name === activity.name);
      const row = {
        orgId,
        projectId,
        name: activity.name,
        summary: activity.summary,
        type: activity.type,
        tone: activity.tone,
        timestamp: now - activity.ageMs,
      };
      if (existing) await ctx.db.patch(existing._id, row);
      else await ctx.db.insert('activity', row);
    }

    return {
      orgs: PREVIEW_ORGS.map((org) => org.slug),
      logins: PREVIEW_CONTACTS.map((contact) => ({
        email: contact.email,
        name: contact.name,
        role: contact.role,
      })),
    };
  },
});

export const previewContactForProvision = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const normalized = email.trim().toLowerCase();
    const contact = await ctx.db
      .query('contacts')
      .withIndex('by_email', (q) => q.eq('email', normalized))
      .unique();
    if (!contact) return null;
    return {
      email: contact.email,
      name: contact.name,
      role: contact.role,
      notionPageId: contact.notionPageId,
      authUserId: contact.authUserId ?? null,
    };
  },
});

export const linkPreviewContact = internalMutation({
  args: {
    email: v.string(),
    authUserId: v.string(),
  },
  handler: async (ctx, { email, authUserId }) => {
    const normalized = email.trim().toLowerCase();
    const contact = await ctx.db
      .query('contacts')
      .withIndex('by_email', (q) => q.eq('email', normalized))
      .unique();
    if (!contact || !isPreviewContact(contact)) {
      throw new Error('Preview login can only link a seed-local .test contact');
    }
    if (contact.authUserId && contact.authUserId !== authUserId) {
      throw new Error('Preview contact is already linked to a different auth user');
    }
    await ctx.db.patch(contact._id, { authUserId, email: normalized });
    return { email: normalized, contactId: contact._id };
  },
});

/**
 * Seed sample rows and create verified passwords for the preview contacts.
 * `npx convex run localPreview:seedAndProvision '{"password":"<dev password>"}'`
 * Password is a function argument. Do not pass BETTER_AUTH_SECRET.
 */
export const seedAndProvision = internalAction({
  args: { password: v.string() },
  handler: async (ctx, { password }): Promise<{
    orgs: string[];
    provisioned: Array<{ email: string; role: PreviewContact['role'] }>;
  }> => {
    if (process.env.LOCAL_PREVIEW_SEED !== '1') {
      throw new Error(
        'Refusing to seed. Set LOCAL_PREVIEW_SEED=1 on this dev deployment first.',
      );
    }
    if (!passwordRuleState(password).ready) {
      throw new Error('Password must be 12+ characters with mixed case and a number or symbol');
    }

    const seeded = await ctx.runMutation(internal.localPreview.seedSampleData, {});
    const provisioned: Array<{ email: string; role: PreviewContact['role'] }> = [];
    for (const login of seeded.logins) {
      await provisionPreviewUser(ctx, login.email, login.name, password);
      provisioned.push({ email: login.email, role: login.role });
    }
    return { orgs: seeded.orgs, provisioned };
  },
});

function requiredOrg(orgIds: Map<string, Id<'clients'>>, slug: string): Id<'clients'> {
  const orgId = orgIds.get(slug);
  if (!orgId) throw new Error(`Missing preview org ${slug}`);
  return orgId;
}

function isPreviewContact(contact: { email: string; notionPageId: string }): boolean {
  return (
    contact.email.trim().toLowerCase().endsWith('.test') &&
    contact.notionPageId.startsWith(SEED_PAGE_PREFIX)
  );
}

async function provisionPreviewUser(
  ctx: ActionCtx,
  email: string,
  name: string,
  password: string,
): Promise<void> {
  const contact = (await ctx.runQuery(internal.localPreview.previewContactForProvision, {
    email,
  })) as {
    email: string;
    name: string;
    notionPageId: string;
    authUserId: string | null;
  } | null;
  if (!contact || !isPreviewContact(contact)) {
    throw new Error('Preview login can only provision a seed-local .test contact');
  }

  const normalized = contact.email.trim().toLowerCase();
  const now = Date.now();
  const passwordHash = await hashPassword(password);
  const existing = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: 'user',
    where: [{ field: 'email', operator: 'eq', value: normalized }],
  })) as AuthUserDoc | null;

  let authUserId = existing?._id ?? '';
  if (!existing) {
    const created = (await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: 'user',
        data: {
          name,
          email: normalized,
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        },
      },
    })) as AuthUserDoc;
    authUserId = created._id;
    await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: 'account',
        data: {
          accountId: authUserId,
          providerId: 'credential',
          userId: authUserId,
          password: passwordHash,
          createdAt: now,
          updatedAt: now,
        },
      },
    });
  } else {
    let cursor: string | null = null;
    for (let page = 0; page < 20; page++) {
      const deleted = (await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
        paginationOpts: { numItems: 100, cursor },
        input: staffSessionDeleteArgs(existing._id),
      })) as { isDone: boolean; continueCursor: string | null };
      cursor = staffSessionDeleteCursor(deleted);
      if (!cursor) break;
      if (page === 19) throw new Error('Could not delete all existing preview sessions');
    }
    await ctx.runMutation(components.betterAuth.adapter.updateOne, {
      input: {
        model: 'user',
        where: [{ field: '_id', operator: 'eq', value: existing._id }],
        update: { name, emailVerified: true, updatedAt: now },
      },
    });
    const account = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: 'account',
      where: [
        { field: 'userId', operator: 'eq', value: existing._id },
        { field: 'providerId', operator: 'eq', value: 'credential' },
      ],
    })) as AuthAccountDoc | null;
    if (account) {
      await ctx.runMutation(components.betterAuth.adapter.updateOne, {
        input: {
          model: 'account',
          where: [{ field: '_id', operator: 'eq', value: account._id }],
          update: { password: passwordHash, updatedAt: now },
        },
      });
    } else {
      await ctx.runMutation(components.betterAuth.adapter.create, {
        input: {
          model: 'account',
          data: {
            accountId: existing._id,
            providerId: 'credential',
            userId: existing._id,
            password: passwordHash,
            createdAt: now,
            updatedAt: now,
          },
        },
      });
    }
  }

  await ctx.runMutation(internal.localPreview.linkPreviewContact, {
    email: normalized,
    authUserId,
  });
}
