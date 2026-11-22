import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

/**
 * Portal Convex schema — separate deployment from Motoko/agent.
 * Every tenant-scoped table leads indexes with `orgId`.
 *
 * Synced tables: Notion → allowlisted worker → upsert here.
 * Native tables: milestones, milestoneResources, activity, taskResponses,
 * clientUploads, billing. There is no Notion milestones database.
 */

const notionSyncFields = {
  notionPageId: v.string(),
  externalId: v.optional(v.string()),
  lastSyncedAt: v.number(),
  /**
   * Set while the row must not be shown to clients.
   * Cleared when a later pull shows the row again. The Convex copy stays.
   */
  syncHiddenAt: v.optional(v.number()),
  syncHiddenReason: v.optional(
    v.union(v.literal('gate'), v.literal('ancestor'), v.literal('trashed')),
  ),
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
    /**
     * Trimmed lowercase company name for the duplicate check.
     * Absent until a later upsert writes it. This is not a backfill.
     */
    nameKey: v.optional(v.string()),
    /**
     * Portal choice for task and milestone reads.
     * Absent means Notion. Notion sync does not write this field.
     */
    taskPlatform: v.optional(v.union(v.literal('notion'), v.literal('linear'))),
  })
    .index('by_slug', ['slug'])
    .index('by_notionPageId', ['notionPageId'])
    .index('by_externalId', ['externalId'])
    .index('by_stripeCustomerId', ['stripeCustomerId'])
    .index('by_nameKey', ['nameKey']),

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
    /**
     * Person on this client. The name is stored beside the id so a task list
     * can return it without another read. Absent until a pull or a staff edit.
     */
    assigneeContactId: v.optional(v.id('contacts')),
    assigneeName: v.optional(v.string()),
    /** Set when staff archive the task. The row stays. Clients and the board skip it. */
    archivedAt: v.optional(v.number()),
    /** CLIENT select. Missing until Notion has the property. */
    stage: v.optional(v.union(v.string(), v.null())),
    /**
     * Last Stage from Notion, or the Stage a task-stage write confirmed.
     * Null means Notion had no stage.
     */
    stageSynced: v.optional(v.union(v.string(), v.null())),
    /** Set while stage is a staff move Notion has not confirmed. Staff-only. */
    stagePendingAt: v.optional(v.number()),
    /**
     * tasks.lastEditedTime the unsent move is based on.
     * Outbox expectedLastEditedTime. Not a wall clock.
     */
    stagePendingBaseEditedTime: v.optional(v.string()),
    /** Ready to Ship link for the unsent move. Not pullRequestUrl. */
    stagePendingPullRequest: v.optional(v.string()),
    /** SERVER self-relation, one level deep. */
    parentNotionPageId: v.optional(v.union(v.string(), v.null())),
    parentTaskId: v.optional(v.id('tasks')),
    /** SERVER notion ids until the join rows are resolved. */
    resourceNotionIds: v.optional(v.array(v.string())),
    /** SERVER. Never returned to a client. */
    pullRequestUrl: v.optional(v.union(v.string(), v.null())),
    lastEditedTime: v.optional(v.union(v.string(), v.null())),
    publishToWarehaus: v.boolean(),
    estimate: v.optional(v.string()),
    priority: v.optional(v.string()),
    source: v.optional(v.string()),
    /**
     * SERVER. Page body, or the Description property when the body is empty.
     * Client queries omit it while the tier is SERVER.
     */
    description: v.optional(v.string()),
    /**
     * Where `description` came from. `body` is read-only in the portal.
     * `none` means the page was read and both sources were empty.
     */
    descriptionSource: v.optional(
      v.union(v.literal('body'), v.literal('property'), v.literal('none')),
    ),
    /** Staff-only. Set when Notion Stage is not a portal stage. Cleared on the next clean pull. */
    syncNotice: v.optional(v.string()),
    /**
     * Portal-only link to a milestone on this same project.
     * Top-level tasks only. Notion sync does not write it.
     */
    milestoneId: v.optional(v.id('milestones')),
    /** Roadmap order while milestoneId is set. Cleared with that link. */
    milestoneOrder: v.optional(v.number()),
    /**
     * Where a milestone task came from: the brief, a change request, or a
     * staff add. Staff only. Absent on tasks that came from Notion.
     */
    origin: v.optional(v.union(v.literal('brief'), v.literal('review'), v.literal('manual'))),
    /** Review iteration that asked for this task. Set with origin review. Staff only. */
    round: v.optional(v.number()),
    /** Runner id working this task. Set on claim, cleared when the run ends. Staff only. */
    claimedBy: v.optional(v.string()),
    claimedAt: v.optional(v.number()),
    /** Commit the runner pushed for this task. Staff only. */
    lastCommitSha: v.optional(v.string()),
    /** Why the runner stopped on this task. Staff only. */
    blockedReason: v.optional(v.string()),
    /**
     * Portal project move. Tasks.Projects is SERVER, so this is not written
     * to Notion. The next pull keeps this project until Notion already matches.
     */
    portalProjectId: v.optional(v.id('projects')),
    /**
     * Staff-only copies of NEVER Notion fields, so task links can be rebuilt.
     * Client serializers do not read them.
     */
    figmaFrame: v.optional(v.union(v.string(), v.null())),
    repoBranch: v.optional(v.union(v.string(), v.null())),
    nextAction: v.optional(v.union(v.string(), v.null())),
    /** Milliseconds. Set when a merged field or a source link changes. */
    updatedAt: v.optional(v.number()),
    /** Last writer per field. Absent until a pull or the staff API stamps it. */
    fieldStamps: v.optional(
      v.object({
        status: v.optional(v.object({ updatedAt: v.number(), updatedBy: v.string() })),
        stage: v.optional(v.object({ updatedAt: v.number(), updatedBy: v.string() })),
        priority: v.optional(v.object({ updatedAt: v.number(), updatedBy: v.string() })),
        nextAction: v.optional(v.object({ updatedAt: v.number(), updatedBy: v.string() })),
      }),
    ),
  })
    .index('by_orgId', ['orgId'])
    .index('by_orgId_projectId', ['orgId', 'projectId'])
    .index('by_orgId_milestoneId', ['orgId', 'milestoneId'])
    .index('by_parentTaskId', ['parentTaskId'])
    .index('by_notionPageId', ['notionPageId'])
    .index('by_externalId', ['externalId'])
    .index('by_projectId', ['projectId'])
    .index('by_projectId_status', ['projectId', 'status'])
    .index('by_projectId_stage', ['projectId', 'stage'])
    .index('by_projectId_updatedAt', ['projectId', 'updatedAt'])
    .index('by_status', ['status'])
    .index('by_stage', ['stage'])
    .index('by_updatedAt', ['updatedAt']),

  /**
   * Task → Shared Resource. Only a link whose resource org matches the task org.
   * Client queries never read this table. They use sharedResources.listForClient.
   */
  taskResources: defineTable({
    orgId: v.id('clients'),
    taskId: v.id('tasks'),
    resourceId: v.id('sharedResources'),
  })
    .index('by_orgId_taskId', ['orgId', 'taskId'])
    .index('by_orgId_resourceId', ['orgId', 'resourceId']),

  /**
   * One objective inside one project. Portal only — no notionPageId.
   * Approval is a human decision. It does not close the milestone's tasks.
   */
  milestones: defineTable({
    orgId: v.id('clients'),
    projectId: v.id('projects'),
    name: v.string(),
    objective: v.string(),
    /** Ordered outcome lines. Text only — not tasks and not checkboxes. */
    goals: v.array(v.string()),
    /**
     * The one Status field. Every write goes through `transitionMilestone`
     * in `_lib/milestoneStatus.ts`. Staff can set Shipped when every task
     * that is not Parked is Done. The play button never moves to Shipped.
     */
    status: v.union(
      v.literal('Idea'),
      v.literal('Planning'),
      v.literal('Awaiting Go'),
      v.literal('Building'),
      v.literal('Ready to Ship'),
      v.literal('Shipped'),
      v.literal('Parked'),
    ),
    approval: v.union(
      v.literal('unreviewed'),
      v.literal('approved'),
      v.literal('changes_requested'),
    ),
    /** Set only when a human approves or requests changes. */
    note: v.optional(v.string()),
    approverContactId: v.optional(v.id('contacts')),
    /** When that human decided. */
    decidedAt: v.optional(v.number()),
    /** Clients do not see a milestone until this is true. Inserts stay false. */
    publishToWarehaus: v.boolean(),
    /**
     * Open review iteration. Missing means 1. Clients never receive this.
     * Approve needs Status Ready to Ship. Approve does not move it to Shipped.
     */
    iteration: v.optional(v.number()),
    /**
     * Staff-only preview. A localhost:3100 link, or the Vercel review deployment.
     * Never returned to a client. Never unique-turtle-383.
     */
    previewUrl: v.optional(v.string()),
    /**
     * Staff contact who attached previewUrl by hand. Absent when the preview
     * worker stored the link, or when no link is attached. No index: reads
     * stay on the milestone document.
     */
    previewAttachedBy: v.optional(v.id('contacts')),
    previewAttachedAt: v.optional(v.number()),
    previewPrNumber: v.optional(v.number()),
    previewPrTitle: v.optional(v.string()),
    previewBranch: v.optional(v.string()),
    previewCommit: v.optional(v.string()),
    previewBuiltAt: v.optional(v.number()),
    /** Vercel deployment id for the review preview. Cleared once the delete is confirmed. */
    previewDeploymentId: v.optional(v.string()),
    designCheck: v.optional(v.union(v.literal('pass'), v.literal('fixes'), v.literal('pending'))),
    designCheckNote: v.optional(v.string()),
    /** Preview build for this iteration. Absent once a preview URL is stored. */
    previewBuild: v.optional(v.union(v.literal('building'), v.literal('failed'))),
    previewBuildAttempt: v.optional(v.number()),
    previewBuildAt: v.optional(v.number()),
    /** After approve, removing the preview. `removed` means the Vercel build is gone. Absent until a delete is attempted. */
    previewDelete: v.optional(v.union(v.literal('removing'), v.literal('failed'), v.literal('removed'))),
    previewDeleteAttempt: v.optional(v.number()),
    /** Last delete attempt. When `previewDelete` is `removed`, this is the time the preview was deleted. */
    previewDeleteAt: v.optional(v.number()),
    /** Set only when a real production deploy finishes. Absent means it has not finished. */
    deployFinishedAt: v.optional(v.number()),
    /** Optional person on this client. Convex only. Not written to Notion. */
    ownerContactId: v.optional(v.id('contacts')),
    /** Calendar day, YYYY-MM-DD. Absent means not set. */
    dueDate: v.optional(v.string()),
    /** Person who created the milestone in the Portal. Absent on older rows. */
    createdByContactId: v.optional(v.id('contacts')),
    /**
     * Staff-only localhost link shown on the milestone tile. Not previewUrl,
     * and not used for Approve & deploy. Read with the milestone. No index.
     */
    localPreviewUrl: v.optional(v.string()),
    /**
     * Staff-only Figma link shown on the milestone tile. Read with the
     * milestone. No index. Clients never receive it.
     */
    figmaUrl: v.optional(v.string()),
    /** Where the milestone was created. Staff only. Absent on older rows. */
    createdVia: v.optional(
      v.union(v.literal('grok'), v.literal('claude'), v.literal('portal'), v.literal('other')),
    ),
    /**
     * Planning job for the runner. `queued` when a milestone is created in the
     * portal with no tasks. `running` once a runner claims it. Absent otherwise.
     */
    planning: v.optional(v.union(v.literal('queued'), v.literal('running'))),
  })
    .index('by_orgId', ['orgId'])
    .index('by_orgId_projectId', ['orgId', 'projectId'])
    .index('by_projectId', ['projectId'])
    .index('by_previewPrNumber', ['previewPrNumber'])
    .index('by_status', ['status'])
    .index('by_planning', ['planning']),

  /**
   * One human review of one iteration. Idempotent on milestone + iteration.
   * Staff-only. No Notion write. Clients never query this table.
   */
  milestoneReviews: defineTable({
    orgId: v.id('clients'),
    milestoneId: v.id('milestones'),
    iteration: v.number(),
    decision: v.union(v.literal('approve'), v.literal('request_changes')),
    notes: v.string(),
    decidedBy: v.id('contacts'),
    decidedAt: v.number(),
    source: v.union(v.literal('portal'), v.literal('chat')),
    prNumber: v.optional(v.number()),
    commit: v.optional(v.string()),
    /** Tasks created for this change request. Empty on approve. */
    createdTaskIds: v.array(v.id('tasks')),
  })
    .index('by_org_milestone_iteration', ['orgId', 'milestoneId', 'iteration'])
    .index('by_milestone_iteration', ['milestoneId', 'iteration']),

  /**
   * One piece of runner work on a milestone: a task, or a planning run.
   * Staff only. No client query reads this table.
   */
  agentRuns: defineTable({
    orgId: v.id('clients'),
    milestoneId: v.id('milestones'),
    /** Absent on a planning run. */
    taskId: v.optional(v.id('tasks')),
    kind: v.union(v.literal('planning'), v.literal('task')),
    runnerId: v.string(),
    tool: v.union(v.literal('claude_code'), v.literal('cursor')),
    mode: v.union(v.literal('interactive'), v.literal('headless')),
    status: v.union(v.literal('running'), v.literal('succeeded'), v.literal('failed'), v.literal('cancelled')),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
  })
    .index('by_milestone', ['milestoneId', 'startedAt'])
    .index('by_task', ['taskId'])
    .index('by_runner_status', ['runnerId', 'status']),

  /**
   * Short lines for a milestone's run feed. Summaries and payloads are
   * masked and cut down before they are stored. Staff only.
   */
  agentEvents: defineTable({
    orgId: v.id('clients'),
    milestoneId: v.id('milestones'),
    /** Absent on an event the portal writes itself, such as Ready to Ship. */
    runId: v.optional(v.id('agentRuns')),
    type: v.string(),
    summary: v.string(),
    /** Trimmed hook payload as JSON text. Never the environment, never a credential. */
    payload: v.optional(v.string()),
    /** Sender's key for one event, so a retried hook is stored once. */
    key: v.optional(v.string()),
    at: v.number(),
  })
    .index('by_run', ['runId', 'at'])
    .index('by_milestone_time', ['milestoneId', 'at']),

  /** One row per runner: its request window and when it last called. */
  agentRunners: defineTable({
    runnerId: v.string(),
    windowStart: v.number(),
    count: v.number(),
    lastSeenAt: v.number(),
  }).index('by_runnerId', ['runnerId']),

  /**
   * Staff notes on a milestone, added by a person or a bot through the staff
   * API. No client query reads this table.
   */
  milestoneNotes: defineTable({
    orgId: v.id('clients'),
    milestoneId: v.id('milestones'),
    body: v.string(),
    /** Token name or staff name that wrote the note. */
    addedBy: v.string(),
    createdAt: v.number(),
  }).index('by_milestone_createdAt', ['milestoneId', 'createdAt']),

  /**
   * Milestone → Shared Resource. Same org only.
   * A curated set, not the union of every task resource.
   */
  milestoneResources: defineTable({
    orgId: v.id('clients'),
    milestoneId: v.id('milestones'),
    resourceId: v.id('sharedResources'),
    sortOrder: v.number(),
  })
    .index('by_orgId', ['orgId'])
    .index('by_orgId_milestoneId', ['orgId', 'milestoneId'])
    .index('by_orgId_resourceId', ['orgId', 'resourceId']),

  /**
   * Project context: brief fields, glossary terms, and decisions for one project.
   * STAFF ONLY. Never read through clientQuery. Convex is the source of truth;
   * these rows are not part of the Notion sync.
   */
  projectContextEntries: defineTable({
    orgId: v.id('clients'),
    projectId: v.id('projects'),
    kind: v.union(v.literal('brief'), v.literal('term'), v.literal('decision')),
    /** brief: field key. term: lower-cased term. decision: zero-padded number. */
    key: v.string(),
    /** brief: field label. term: the term as written. decision: its title. */
    title: v.string(),
    body: v.string(),
    /** Decisions only. Counts from 1 per project and is never reused. */
    number: v.optional(v.number()),
    source: v.union(
      v.literal('portal'),
      v.literal('grok'),
      v.literal('claude'),
      v.literal('other'),
    ),
    updatedByContactId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_projectId_kind_key', ['projectId', 'kind', 'key']),

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
    /** Set when the row is about one milestone. Older rows omit it. */
    milestoneId: v.optional(v.id('milestones')),
    name: v.string(),
    summary: v.optional(v.string()),
    type: v.string(),
    tone: v.optional(v.string()),
    timestamp: v.number(),
  })
    .index('by_orgId', ['orgId'])
    .index('by_orgId_timestamp', ['orgId', 'timestamp'])
    .index('by_orgId_type', ['orgId', 'type'])
    .index('by_timestamp', ['timestamp']),

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
    .index('by_orgId_createdAt', ['orgId', 'createdAt'])
    .index('by_storageId', ['storageId']),

  /**
   * Minted with generateUploadUrl. finalizeUpload requires it so a browser
   * cannot attach an arbitrary storage id. Bookkeeping only — swept with
   * orphaned upload blobs.
   */
  uploadIntents: defineTable({
    orgId: v.id('clients'),
    contactId: v.id('contacts'),
    createdAt: v.number(),
    consumedAt: v.optional(v.number()),
    storageId: v.optional(v.id('_storage')),
  })
    .index('by_orgId_createdAt', ['orgId', 'createdAt'])
    .index('by_createdAt', ['createdAt']),

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
    /** Notion last_edited_time. Same page and edit must not insert twice. */
    editedAtMs: v.optional(v.number()),
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
    .index('by_receivedAt', ['receivedAt'])
    .index('by_processedAt', ['processedAt']),

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

  /**
   * Pending invites only. Login never reads this table.
   * Rows exist only after a pull decides UPSERT_PENDING_INVITE, or after
   * Notion confirms a staff invite.
   */
  pendingInvites: defineTable({
    orgId: v.id('clients'),
    notionPageId: v.string(),
    name: v.string(),
    email: v.string(),
    role: v.union(
      v.literal('Client Admin'),
      v.literal('Client Member'),
      v.literal('Warehaus Staff'),
    ),
    inviteStatus: v.union(
      v.literal('Pending'),
      v.literal('Accepted'),
      v.literal('Declined'),
      v.literal('Expired'),
      v.literal('Revoked'),
    ),
    source: v.optional(v.string()),
    notionLastEditedTime: v.optional(v.string()),
    lastSyncedAt: v.number(),
  })
    .index('by_orgId', ['orgId'])
    .index('by_notionPageId', ['notionPageId'])
    .index('by_email', ['email']),

  /**
   * Add-only. One short-lived row per invite token hash, consumed once when
   * the invited person creates their account. Not an in-memory permit.
   */
  inviteSignupPermits: defineTable({
    tokenHash: v.string(),
    email: v.string(),
    expiresAt: v.number(),
  })
    .index('by_tokenHash', ['tokenHash'])
    .index('by_email', ['email']),

  /** Raw invite tokens are never stored. Only the SHA-256 hash. */
  inviteTokens: defineTable({
    orgId: v.id('clients'),
    contactNotionPageId: v.string(),
    clientNotionPageId: v.string(),
    emailNormalized: v.string(),
    tokenHash: v.string(),
    status: v.union(
      v.literal('live'),
      /** Held by accept, decline, or revoke until Notion confirms or the write dies. */
      v.literal('pending'),
      v.literal('used'),
      v.literal('killed'),
      v.literal('expired'),
    ),
    expiresAt: v.number(),
    createdByContactId: v.optional(v.id('contacts')),
    createdAt: v.number(),
    usedAt: v.optional(v.number()),
    /** Bumped when a dead write releases the token, so the next enqueue is a new row. */
    attempt: v.optional(v.number()),
  })
    .index('by_orgId', ['orgId'])
    .index('by_tokenHash', ['tokenHash'])
    .index('by_contactNotionPageId', ['contactNotionPageId'])
    .index('by_status_expiresAt', ['status', 'expiresAt'])
    .index('by_orgId_createdBy_createdAt', ['orgId', 'createdByContactId', 'createdAt']),

  /**
   * Resend cooldown for verification mail. One row per normalized address,
   * including addresses that cannot register, so the window does not reveal them.
   */
  verificationResend: defineTable({
    email: v.string(),
    lastAttemptAt: v.number(),
  }).index('by_email', ['email']),

  /**
   * Notion writes waiting to be sent. Nothing that grants access is inserted
   * from a row until Notion confirms and a later handler runs.
   * `conflict` means Notion changed since the last read; the row is not retried.
   */
  notionOutbox: defineTable({
    idempotencyKey: v.string(),
    kind: v.string(),
    orgId: v.id('clients'),
    database: v.string(),
    notionPageId: v.optional(v.string()),
    /** ISO last_edited_time the caller last read. Required for property updates. */
    expectedLastEditedTime: v.optional(v.string()),
    payload: v.string(),
    actor: v.union(v.literal('staff'), v.literal('clientAdmin'), v.literal('system')),
    actorId: v.optional(v.string()),
    status: v.union(
      v.literal('queued'),
      v.literal('inflight'),
      v.literal('done'),
      v.literal('failed'),
      v.literal('dead'),
      v.literal('conflict'),
    ),
    attempts: v.number(),
    nextAttemptAt: v.number(),
    lastError: v.optional(v.string()),
    createdAt: v.number(),
    claimedAt: v.optional(v.number()),
    staffNotifiedAt: v.optional(v.number()),
    resultJson: v.optional(v.string()),
  })
    .index('by_idempotencyKey', ['idempotencyKey'])
    .index('by_status_nextAttemptAt', ['status', 'nextAttemptAt'])
    .index('by_orgId', ['orgId'])
    .index('by_notionPageId', ['notionPageId'])
    .index('by_createdAt', ['createdAt']),

  /** Last values the portal wrote, plus the response last_edited_time. */
  notionWriteState: defineTable({
    notionPageId: v.string(),
    orgId: v.id('clients'),
    database: v.string(),
    lastValues: v.string(),
    lastEditedTime: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index('by_notionPageId', ['notionPageId'])
    .index('by_orgId', ['orgId']),

  auditEvents: defineTable({
    orgId: v.id('clients'),
    actorKind: v.union(
      v.literal('clientAdmin'),
      v.literal('staff'),
      v.literal('system'),
      v.literal('notionEdit'),
    ),
    actorId: v.optional(v.string()),
    action: v.string(),
    notionPageId: v.optional(v.string()),
    notionUrl: v.optional(v.string()),
    before: v.optional(v.string()),
    after: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_orgId', ['orgId'])
    .index('by_orgId_createdAt', ['orgId', 'createdAt'])
    .index('by_notionPageId', ['notionPageId'])
    .index('by_createdAt', ['createdAt']),

  /** Portal notices only. No Notion comments in this foundation. */
  notices: defineTable({
    orgId: v.id('clients'),
    audience: v.union(v.literal('staff'), v.literal('clientAdmin')),
    message: v.string(),
    contactNotionPageId: v.optional(v.string()),
    edgeCase: v.optional(v.string()),
    createdAt: v.number(),
    readAt: v.optional(v.number()),
  })
    .index('by_orgId', ['orgId'])
    .index('by_audience_createdAt', ['audience', 'createdAt']),

  /**
   * Per-staff read receipts. `notices.readAt` stays unused for unread:
   * one staff member marking read must not clear it for everyone else.
   */
  noticeReads: defineTable({
    noticeId: v.id('notices'),
    contactId: v.id('contacts'),
    readAt: v.number(),
  })
    .index('by_noticeId_contactId', ['noticeId', 'contactId'])
    .index('by_contactId', ['contactId']),

  /**
   * Per-user in-portal notification toggles. One row per contact.
   * Email delivery stays off — these flags are not a send list.
   */
  notificationPrefs: defineTable({
    contactId: v.id('contacts'),
    awaitingGo: v.boolean(),
    syncProblems: v.boolean(),
    draftRecaps: v.boolean(),
    inviteNotices: v.boolean(),
    needsAttention: v.boolean(),
    sharedRecaps: v.boolean(),
    weeklySummary: v.boolean(),
    updatedAt: v.number(),
  }).index('by_contactId', ['contactId']),

  /**
   * Staff API tokens. The raw token is shown once at creation and is not stored.
   * `tokenHash` is the SHA-256 hex of the token. Clients never read this table.
   */
  apiTokens: defineTable({
    name: v.string(),
    tokenHash: v.string(),
    tokenPrefix: v.string(),
    scope: v.union(v.literal('read'), v.literal('read-write')),
    revokedAt: v.optional(v.number()),
    lastUsedAt: v.optional(v.number()),
    createdAt: v.number(),
    createdByContactId: v.optional(v.id('contacts')),
    /** Staff org stamped on bot tokens so client create can enqueue. */
    homeOrgId: v.optional(v.id('clients')),
    rateLimit: v.number(),
    rateWindowMs: v.number(),
    windowStartedAt: v.number(),
    windowCount: v.number(),
  })
    .index('by_tokenHash', ['tokenHash'])
    .index('by_name', ['name'])
    .index('by_createdAt', ['createdAt']),

  /**
   * One row per token and Idempotency-Key. The pending row is inserted in the
   * same mutation that reads the index, before any other write.
   */
  apiIdempotency: defineTable({
    tokenId: v.id('apiTokens'),
    key: v.string(),
    requestHash: v.string(),
    state: v.union(v.literal('pending'), v.literal('done')),
    status: v.optional(v.number()),
    body: v.optional(v.string()),
    createdAt: v.number(),
  }).index('by_tokenId_key', ['tokenId', 'key']),

  /**
   * Staff-only links on a task. Kinds match the portal API.
   * Repo branch is included so the Notion field is not dropped.
   * `agent` is a Cursor agent URL. Client queries do not read this table.
   * `state` is the chip label (open, closed, merged, a check, or a deploy phase).
   */
  taskLinks: defineTable({
    orgId: v.id('clients'),
    taskId: v.id('tasks'),
    kind: v.union(
      v.literal('chat request'),
      v.literal('PR'),
      v.literal('deploy'),
      v.literal('agent'),
      v.literal('Figma frame'),
      v.literal('Notion page or doc'),
      v.literal('Repo branch'),
    ),
    url: v.string(),
    title: v.optional(v.string()),
    addedBy: v.string(),
    createdAt: v.number(),
    /**
     * Webhook bookkeeping for a PR or deploy link.
     * Staff-only. Client queries do not read this table.
     * `state` is open, closed, merged, a check conclusion, or a deploy phase.
     */
    state: v.optional(v.string()),
    sha: v.optional(v.string()),
    updatedAt: v.optional(v.number()),
  })
    .index('by_taskId', ['taskId'])
    .index('by_taskId_url', ['taskId', 'url'])
    .index('by_sha', ['sha'])
    .index('by_orgId_taskId', ['orgId', 'taskId']),

  /** Staff API comments. Not Notion comments, and not client task responses. */
  taskComments: defineTable({
    orgId: v.id('clients'),
    taskId: v.id('tasks'),
    body: v.string(),
    addedBy: v.string(),
    createdAt: v.number(),
  })
    .index('by_taskId_createdAt', ['taskId', 'createdAt'])
    .index('by_orgId_taskId', ['orgId', 'taskId']),

  /**
   * Shared-dev inbox for password reset and verification mail when Resend
   * is not configured. Empty unless DEV_MAILBOX_ENABLED is exactly "true".
   */
  devMailbox: defineTable({
    to: v.string(),
    subject: v.string(),
    text: v.string(),
    html: v.string(),
    createdAt: v.number(),
  }).index('by_createdAt', ['createdAt']),
});
