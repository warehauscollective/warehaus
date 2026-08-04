import { v } from 'convex/values';
import { internalMutation, internalQuery } from '../_generated/server';
import type { Id } from '../_generated/dataModel';

export const upsertClient = internalMutation({
  args: {
    notionPageId: v.string(),
    companyName: v.string(),
    slug: v.string(),
    status: v.string(),
    portalAccess: v.union(v.literal('Enabled'), v.literal('Disabled')),
    primaryEmail: v.optional(v.string()),
    phone: v.optional(v.string()),
    externalId: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('clients')
      .withIndex('by_notionPageId', (q) => q.eq('notionPageId', args.notionPageId))
      .unique();
    const patch = {
      ...args,
      lastSyncedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return ctx.db.insert('clients', patch);
  },
});

export const upsertProject = internalMutation({
  args: {
    notionPageId: v.string(),
    orgId: v.id('clients'),
    name: v.string(),
    description: v.optional(v.string()),
    status: v.string(),
    progress: v.optional(v.number()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    liveUrl: v.optional(v.string()),
    figmaLink: v.optional(v.string()),
    docsUrl: v.optional(v.string()),
    stack: v.optional(v.array(v.string())),
    type: v.array(v.string()),
    archive: v.boolean(),
    publishToWarehaus: v.boolean(),
    priority: v.optional(v.string()),
    externalId: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('projects')
      .withIndex('by_notionPageId', (q) => q.eq('notionPageId', args.notionPageId))
      .unique();
    const patch = { ...args, lastSyncedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return ctx.db.insert('projects', patch);
  },
});

export const upsertTask = internalMutation({
  args: {
    notionPageId: v.string(),
    orgId: v.id('clients'),
    projectId: v.id('projects'),
    name: v.string(),
    status: v.string(),
    isDone: v.boolean(),
    date: v.optional(v.string()),
    publishToWarehaus: v.boolean(),
    estimate: v.optional(v.string()),
    priority: v.optional(v.string()),
    externalId: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('tasks')
      .withIndex('by_notionPageId', (q) => q.eq('notionPageId', args.notionPageId))
      .unique();
    const patch = { ...args, lastSyncedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return ctx.db.insert('tasks', patch);
  },
});

export const upsertContact = internalMutation({
  args: {
    notionPageId: v.string(),
    orgId: v.id('clients'),
    name: v.string(),
    email: v.string(),
    authUserId: v.optional(v.string()),
    role: v.union(
      v.literal('Client Admin'),
      v.literal('Client Member'),
      v.literal('Warehaus Staff'),
    ),
    portalAccess: v.union(v.literal('Enabled'), v.literal('Disabled')),
    phone: v.optional(v.string()),
    externalId: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const byNotion = await ctx.db
      .query('contacts')
      .withIndex('by_notionPageId', (q) => q.eq('notionPageId', args.notionPageId))
      .unique();
    const byEmail = await ctx.db
      .query('contacts')
      .withIndex('by_email', (q) => q.eq('email', args.email.toLowerCase()))
      .unique();
    const existing = byNotion ?? byEmail;
    const email = args.email.toLowerCase();
    // Preserve locally linked authUserId if Notion field empty
    const authUserId = args.authUserId || existing?.authUserId;
    const patch = {
      ...args,
      email,
      authUserId,
      lastSyncedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return ctx.db.insert('contacts', patch);
  },
});

export const upsertSharedResource = internalMutation({
  args: {
    notionPageId: v.string(),
    orgId: v.id('clients'),
    projectId: v.optional(v.id('projects')),
    title: v.string(),
    description: v.optional(v.string()),
    type: v.optional(v.string()),
    url: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    byteSize: v.optional(v.number()),
    checksum: v.optional(v.string()),
    blobPathname: v.optional(v.string()),
    blobUrl: v.optional(v.string()),
    sourceNotionUrl: v.optional(v.string()),
    publishToWarehaus: v.boolean(),
    archive: v.boolean(),
    externalId: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('sharedResources')
      .withIndex('by_notionPageId', (q) => q.eq('notionPageId', args.notionPageId))
      .unique();
    // Preserve Blob metadata when this pull did not re-copy (undefined args).
    const patch = {
      ...args,
      mimeType: args.mimeType ?? existing?.mimeType,
      byteSize: args.byteSize ?? existing?.byteSize,
      checksum: args.checksum ?? existing?.checksum,
      blobPathname: args.blobPathname ?? existing?.blobPathname,
      blobUrl: args.blobUrl ?? existing?.blobUrl,
      sourceNotionUrl: args.sourceNotionUrl ?? existing?.sourceNotionUrl,
      lastSyncedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return ctx.db.insert('sharedResources', patch);
  },
});

export const upsertClientDoc = internalMutation({
  args: {
    notionPageId: v.string(),
    orgId: v.id('clients'),
    projectId: v.optional(v.id('projects')),
    title: v.string(),
    summary: v.optional(v.string()),
    docType: v.string(),
    order: v.optional(v.number()),
    body: v.optional(v.string()),
    status: v.union(v.literal('Draft'), v.literal('Published')),
    publishToWarehaus: v.boolean(),
    externalId: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('clientDocs')
      .withIndex('by_notionPageId', (q) => q.eq('notionPageId', args.notionPageId))
      .unique();
    const patch = { ...args, lastSyncedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return ctx.db.insert('clientDocs', patch);
  },
});

/** Replace Blob image rows for a Client Doc after body sync. */
export const replaceClientDocImages = internalMutation({
  args: {
    orgId: v.id('clients'),
    docId: v.id('clientDocs'),
    images: v.array(
      v.object({
        blobPathname: v.string(),
        blobUrl: v.string(),
        alt: v.optional(v.string()),
        checksum: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { orgId, docId, images }) => {
    const existing = await ctx.db
      .query('clientDocImages')
      .withIndex('by_orgId_docId', (q) => q.eq('orgId', orgId).eq('docId', docId))
      .collect();
    for (const row of existing) {
      await ctx.db.delete(row._id);
    }
    const now = Date.now();
    for (const img of images) {
      await ctx.db.insert('clientDocImages', {
        orgId,
        docId,
        blobPathname: img.blobPathname,
        blobUrl: img.blobUrl,
        alt: img.alt,
        checksum: img.checksum,
        lastSyncedAt: now,
      });
    }
  },
});

export const getSyncMeta = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    return ctx.db
      .query('syncMeta')
      .withIndex('by_key', (q) => q.eq('key', key))
      .unique();
  },
});

export const writeQuarantine = internalMutation({
  args: {
    orgId: v.optional(v.id('clients')),
    notionPageId: v.string(),
    database: v.string(),
    reason: v.string(),
    payload: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert('quarantine', {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const writeSyncMeta = internalMutation({
  args: {
    key: v.string(),
    lastSyncedAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    details: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('syncMeta')
      .withIndex('by_key', (q) => q.eq('key', args.key))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        lastSyncedAt: args.lastSyncedAt,
        lastError: args.lastError,
        details: args.details,
      });
      return existing._id;
    }
    return ctx.db.insert('syncMeta', args);
  },
});

export const resolveIds = internalMutation({
  args: {},
  handler: async (ctx) => {
    const clients = await ctx.db.query('clients').collect();
    const projects = await ctx.db.query('projects').collect();
    return {
      clientByNotion: Object.fromEntries(
        clients.map((c) => [c.notionPageId, c._id as Id<'clients'>]),
      ),
      projectByNotion: Object.fromEntries(
        projects.map((p) => [p.notionPageId, p._id as Id<'projects'>]),
      ),
      projectOrgByNotion: Object.fromEntries(
        projects.map((p) => [p.notionPageId, p.orgId as Id<'clients'>]),
      ),
    };
  },
});
