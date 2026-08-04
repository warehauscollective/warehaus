import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

/**
 * Portal Convex schema — separate deployment from Motoko/agent.
 * Every tenant-scoped table leads indexes with `orgId`.
 *
 * Synced tables: Notion → allowlisted worker → upsert here.
 * Native tables: activity, taskResponses, clientUploads, billing.
 */

const notionSyncFields = {
  notionPageId: v.string(),
  externalId: v.optional(v.string()),
  lastSyncedAt: v.number(),
};

export default defineSchema({
  /**
   * Tenant root. Other tables' `orgId` points here (`clients._id`).
   * This table itself is not indexed by orgId — the row id *is* the org.
   */
  clients: defineTable({
    ...notionSyncFields,
    companyName: v.string(),
    slug: v.string(),
    /** SERVER — commercial state */
    status: v.string(),
    /** SERVER — gate input */
    portalAccess: v.union(v.literal('Enabled'), v.literal('Disabled')),
    primaryEmail: v.optional(v.string()),
    phone: v.optional(v.string()),
    source: v.optional(v.string()),
    /** Stripe Customer id — maps webhooks → org (never Notion) */
    stripeCustomerId: v.optional(v.string()),
  })
    .index('by_slug', ['slug'])
    .index('by_notionPageId', ['notionPageId'])
    .index('by_externalId', ['externalId'])
    .index('by_stripeCustomerId', ['stripeCustomerId']),

  projects: defineTable({
    orgId: v.id('clients'),
    ...notionSyncFields,
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
    /** SERVER gate inputs */
    type: v.array(v.string()),
    archive: v.boolean(),
    publishToWarehaus: v.boolean(),
    priority: v.optional(v.string()),
    source: v.optional(v.string()),
  })
    .index('by_orgId', ['orgId'])
    .index('by_orgId_status', ['orgId', 'status'])
    .index('by_notionPageId', ['notionPageId'])
    .index('by_externalId', ['externalId']),

  tasks: defineTable({
    orgId: v.id('clients'),
    projectId: v.id('projects'),
    ...notionSyncFields,
    name: v.string(),
    status: v.string(),
    isDone: v.boolean(),
    date: v.optional(v.string()),
    publishToWarehaus: v.boolean(),
    estimate: v.optional(v.string()),
    priority: v.optional(v.string()),
    source: v.optional(v.string()),
  })
    .index('by_orgId', ['orgId'])
    .index('by_orgId_projectId', ['orgId', 'projectId'])
    .index('by_notionPageId', ['notionPageId'])
    .index('by_externalId', ['externalId']),

  contacts: defineTable({
    orgId: v.id('clients'),
    ...notionSyncFields,
    name: v.string(),
    email: v.string(),
    /** SERVER — Better Auth join key */
    authUserId: v.optional(v.string()),
    role: v.union(
      v.literal('Client Admin'),
      v.literal('Client Member'),
      v.literal('Warehaus Staff'),
    ),
    portalAccess: v.union(v.literal('Enabled'), v.literal('Disabled')),
    phone: v.optional(v.string()),
    source: v.optional(v.string()),
  })
    .index('by_orgId', ['orgId'])
    .index('by_authUserId', ['authUserId'])
    .index('by_email', ['email'])
    .index('by_notionPageId', ['notionPageId'])
    .index('by_externalId', ['externalId']),

  sharedResources: defineTable({
    orgId: v.id('clients'),
    projectId: v.optional(v.id('projects')),
    ...notionSyncFields,
    title: v.string(),
    description: v.optional(v.string()),
    type: v.optional(v.string()),
    url: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    byteSize: v.optional(v.number()),
    checksum: v.optional(v.string()),
    blobPathname: v.optional(v.string()),
    blobUrl: v.optional(v.string()),
    /** SERVER — never serialize to client */
    sourceNotionUrl: v.optional(v.string()),
    publishToWarehaus: v.boolean(),
    archive: v.boolean(),
    source: v.optional(v.string()),
  })
    .index('by_orgId', ['orgId'])
    .index('by_notionPageId', ['notionPageId'])
    .index('by_externalId', ['externalId']),

  clientDocs: defineTable({
    orgId: v.id('clients'),
    projectId: v.optional(v.id('projects')),
    ...notionSyncFields,
    title: v.string(),
    summary: v.optional(v.string()),
    docType: v.string(),
    order: v.optional(v.number()),
    /** Safe AST / markdown after block allowlist — no Notion hosts */
    body: v.optional(v.string()),
    status: v.union(v.literal('Draft'), v.literal('Published')),
    publishToWarehaus: v.boolean(),
    source: v.optional(v.string()),
  })
    .index('by_orgId', ['orgId'])
    .index('by_orgId_status', ['orgId', 'status'])
    .index('by_notionPageId', ['notionPageId'])
    .index('by_externalId', ['externalId']),

  clientDocImages: defineTable({
    orgId: v.id('clients'),
    docId: v.id('clientDocs'),
    blobPathname: v.string(),
    blobUrl: v.string(),
    alt: v.optional(v.string()),
    width: v.optional(v.number()),
    checksum: v.optional(v.string()),
    lastSyncedAt: v.number(),
  })
    .index('by_orgId', ['orgId'])
    .index('by_orgId_docId', ['orgId', 'docId']),

  /** Convex-native — not synced in from Notion */
  activity: defineTable({
    orgId: v.id('clients'),
    projectId: v.optional(v.id('projects')),
    name: v.string(),
    summary: v.optional(v.string()),
    type: v.string(),
    tone: v.optional(v.string()),
    timestamp: v.number(),
  })
    .index('by_orgId', ['orgId'])
    .index('by_orgId_timestamp', ['orgId', 'timestamp'])
    .index('by_orgId_type', ['orgId', 'type']),

  taskResponses: defineTable({
    orgId: v.id('clients'),
    taskId: v.id('tasks'),
    contactId: v.id('contacts'),
    type: v.union(
      v.literal('approve'),
      v.literal('request-change'),
      v.literal('comment'),
    ),
    body: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_orgId', ['orgId'])
    .index('by_orgId_taskId', ['orgId', 'taskId']),

  /** Client → Convex `_storage` uploads (never Notion) */
  clientUploads: defineTable({
    orgId: v.id('clients'),
    uploadedByContactId: v.id('contacts'),
    storageId: v.id('_storage'),
    filename: v.string(),
    mimeType: v.optional(v.string()),
    byteSize: v.number(),
    scanStatus: v.union(
      v.literal('pending'),
      v.literal('clean'),
      v.literal('infected'),
      v.literal('error'),
    ),
    needsReview: v.boolean(),
    reviewedBy: v.optional(v.id('contacts')),
    reviewedAt: v.optional(v.number()),
    projectId: v.optional(v.id('projects')),
    createdAt: v.number(),
  })
    .index('by_orgId', ['orgId'])
    .index('by_orgId_needsReview', ['orgId', 'needsReview'])
    .index('by_orgId_createdAt', ['orgId', 'createdAt']),

  syncMeta: defineTable({
    key: v.string(),
    lastSyncedAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    details: v.optional(v.string()),
  }).index('by_key', ['key']),

  quarantine: defineTable({
    orgId: v.optional(v.id('clients')),
    notionPageId: v.string(),
    database: v.string(),
    reason: v.string(),
    payload: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_notionPageId', ['notionPageId'])
    .index('by_createdAt', ['createdAt']),

  /** Webhook delivery dedupe / audit */
  syncEvents: defineTable({
    eventId: v.string(),
    receivedAt: v.number(),
    processedAt: v.optional(v.number()),
    status: v.union(
      v.literal('queued'),
      v.literal('done'),
      v.literal('error'),
    ),
    payload: v.optional(v.string()),
    error: v.optional(v.string()),
  })
    .index('by_eventId', ['eventId'])
    .index('by_receivedAt', ['receivedAt']),

  /** Stripe → Convex billing (never Notion) */
  billingSubscriptions: defineTable({
    orgId: v.id('clients'),
    stripeSubscriptionId: v.string(),
    status: v.string(),
    planName: v.string(),
    cancelAtPeriodEnd: v.boolean(),
    currentPeriodEnd: v.optional(v.number()),
    lastSyncedAt: v.number(),
  })
    .index('by_orgId', ['orgId'])
    .index('by_stripeSubscriptionId', ['stripeSubscriptionId']),

  billingInvoices: defineTable({
    orgId: v.id('clients'),
    stripeInvoiceId: v.string(),
    number: v.optional(v.string()),
    status: v.string(),
    amountDue: v.number(),
    currency: v.string(),
    hostedInvoiceUrl: v.optional(v.string()),
    invoicePdf: v.optional(v.string()),
    periodStart: v.optional(v.number()),
    periodEnd: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_orgId', ['orgId'])
    .index('by_orgId_createdAt', ['orgId', 'createdAt'])
    .index('by_stripeInvoiceId', ['stripeInvoiceId']),

  billingEvents: defineTable({
    eventId: v.string(),
    type: v.string(),
    receivedAt: v.number(),
    processedAt: v.optional(v.number()),
    status: v.union(
      v.literal('queued'),
      v.literal('done'),
      v.literal('error'),
      v.literal('ignored'),
    ),
    orgId: v.optional(v.id('clients')),
    error: v.optional(v.string()),
  })
    .index('by_eventId', ['eventId'])
    .index('by_receivedAt', ['receivedAt']),
});
