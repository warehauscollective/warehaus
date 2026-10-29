import type { Id } from './_generated/dataModel';
import { clientQuery, adminQuery } from './_lib/wrappers';
import { isStaff } from './_lib/identity';
import { buildActivityFeed } from './_lib/activityFeed';
import { staffQuarantineActivity } from './_lib/quarantineActivity';
import { clientMaySeeProject, clientMaySeeTask, isOrgVisibleToClients } from '@warehaus/portal-sync';
import { isNotionWritebackEnabled } from './_lib/writeAuthz';

/**
 * CLIENT-tier org snapshot for the signed-in portal UI.
 * Field set matches packages/portal-sync allowlist CLIENT columns only.
 * Staff see sync/exception activity; clients see project events only.
 */
export const getSnapshot = clientQuery({
  args: {},
  handler: async (ctx) => {
    const orgId = ctx.orgId;
    const staff = isStaff(ctx.identity);
    const client = await ctx.db.get(orgId);
    const projects = await ctx.db
      .query('projects')
      .withIndex('by_orgId', (q) => q.eq('orgId', orgId))
      .collect();
    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_orgId', (q) => q.eq('orgId', orgId))
      .collect();
    const activity = await ctx.db
      .query('activity')
      .withIndex('by_orgId_timestamp', (q) => q.eq('orgId', orgId))
      .order('desc')
      .take(50);
    const syncMeta = await ctx.db
      .query('syncMeta')
      .withIndex('by_key', (q) => q.eq('key', 'notion-pull'))
      .unique();
    const quarantineActivity = staff
      ? staffQuarantineActivity(
          (
            await ctx.db
              .query('quarantine')
              .withIndex('by_createdAt')
              .order('desc')
              .take(40)
          ).map((row) => ({
            id: row._id,
            notionPageId: row.notionPageId,
            database: row.database,
            reason: row.reason,
            createdAt: row.createdAt,
            orgId: row.orgId ?? null,
          })),
          orgId,
        )
      : [];

    const orgOpen = isOrgVisibleToClients(client);
    const publishedProjects = (orgOpen ? projects : [])
      .filter((p) =>
        clientMaySeeProject({
          name: p.name,
          types: p.type,
          publishToWarehaus: p.publishToWarehaus,
          archive: p.archive,
          hidden: p.syncHiddenAt != null,
          orgVisible: true,
        }),
      )
      .sort((a, b) => {
        // Active / in-progress first, then highest progress, then name.
        const score = (p: (typeof projects)[number]) => {
          const s = p.status.toLowerCase();
          if (s.includes('progress')) return 3;
          if (s.includes('plan')) return 2;
          if (s.includes('inbox')) return 1;
          return 0;
        };
        const byStatus = score(b) - score(a);
        if (byStatus !== 0) return byStatus;
        return (b.progress ?? 0) - (a.progress ?? 0) || a.name.localeCompare(b.name);
      });
    const projectById = new Map(publishedProjects.map((p) => [p._id, p] as const));

    return {
      clients: client
        ? [
            {
              id: client._id,
              name: client.companyName,
              slug: client.slug,
            },
          ]
        : [],
      projects: publishedProjects.map((p) => ({
        id: p._id,
        name: p.name,
        description: p.description ?? null,
        status: p.status,
        progress: p.progress ?? null,
        startDate: p.startDate ?? null,
        endDate: p.endDate ?? null,
        liveUrl: p.liveUrl ?? null,
        figmaLink: p.figmaLink ?? null,
        docsUrl: p.docsUrl ?? null,
        stack: p.stack ?? [],
        // Sync time only. Clients need it to sort "last updated". Not a Notion id.
        lastSyncedAt: p.lastSyncedAt,
        ...(staff ? { notionPageId: p.notionPageId } : {}),
      })),
      tasks: tasks
        .filter((t) => {
          const project = projectById.get(t.projectId);
          if (!project) return false;
          return clientMaySeeTask({
            publishToWarehaus: t.publishToWarehaus,
            hidden: t.syncHiddenAt != null,
            project: {
              name: project.name,
              types: project.type,
              publishToWarehaus: project.publishToWarehaus,
              archive: project.archive,
              hidden: project.syncHiddenAt != null,
              orgVisible: true,
            },
          });
        })
        .map((t) => {
          const project = projectById.get(t.projectId);
          return {
            id: t._id,
            name: t.name,
            status: t.status,
            isDone: t.isDone,
            date: t.date ?? null,
            stage: t.publishToWarehaus ? (t.stage ?? null) : null,
            lastEditedTime: t.lastEditedTime ?? null,
            projectId: t.projectId,
            projectName: project?.name ?? null,
            projectStatus: project?.status ?? null,
            projectEndDate: project?.endDate ?? null,
            ...(staff
              ? {
                  notionPageId: t.notionPageId,
                  lastSyncedAt: t.lastSyncedAt,
                  ...(t.stagePendingAt != null ? { stagePending: true as const } : {}),
                }
              : {}),
          };
        }),
      activity: [
        ...quarantineActivity,
        ...(staff
          ? activity
              .filter((a) => a.type !== 'shipment')
              .map((a) => ({
                id: a._id,
                name: a.name,
                type: a.type,
                summary: a.summary ?? '',
                timestamp: new Date(a.timestamp).toISOString(),
                tone: a.tone ?? 'muted',
                projectId: a.projectId ?? null,
              }))
          : buildActivityFeed({
              audience: 'client',
              orgVisible: orgOpen,
              activity,
              audits: [],
              outbox: [],
              projects,
              tasks,
              contacts: (
                await ctx.db
                  .query('contacts')
                  .withIndex('by_orgId', (q) => q.eq('orgId', orgId))
                  .take(50)
              ).map((contact) => ({ name: contact.name })),
              orgId,
              limit: 50,
            }).map((item) => ({
              id: item.id,
              name: item.name,
              type: item.type,
              summary: item.summary,
              timestamp: item.timestamp,
              tone: item.tone,
              projectId: item.projectId,
            }))),
      ],
      syncMeta: staff
        ? {
            lastSyncedAt: syncMeta?.lastSyncedAt
              ? new Date(syncMeta.lastSyncedAt).toISOString()
              : null,
            lastError: syncMeta?.lastError ?? null,
            mode: 'convex' as const,
          }
        : { mode: 'convex' as const },
      ...(staff
        ? {}
        : {
            // leadName only exists when a Warehaus Staff contact is stored on
            // this client org. There is no lead column. The first match in
            // by_orgId index order (creation order) within this cap wins.
            leadName:
              (
                await ctx.db
                  .query('contacts')
                  .withIndex('by_orgId', (q) => q.eq('orgId', orgId))
                  .take(50)
              ).find((person) => person.role === 'Warehaus Staff' && person.name.trim())?.name.trim() ?? null,
          }),
      tenant: {
        mode: staff ? ('team' as const) : ('client' as const),
        slug: client?.slug ?? null,
        clientExternalId: client?.externalId ?? client?._id ?? null,
        clientName: client?.companyName ?? null,
        ok: true as const,
      },
    };
  },
});

const CLIENT_FEED_TAKE = 50;

/**
 * Client feed. Internal projects and SERVER task fields stay out.
 * Activity and audits are a bounded take. Projects and tasks are only the
 * rows those events point at — never a full-table collect.
 */
export const listActivityForClient = clientQuery({
  args: {},
  handler: async (ctx) => {
    const orgId = ctx.orgId;
    const client = await ctx.db.get(orgId);
    const activity = await ctx.db
      .query('activity')
      .withIndex('by_orgId_timestamp', (q) => q.eq('orgId', orgId))
      .order('desc')
      .take(CLIENT_FEED_TAKE);
    const audits = await ctx.db
      .query('auditEvents')
      .withIndex('by_orgId_createdAt', (q) => q.eq('orgId', orgId))
      .order('desc')
      .take(CLIENT_FEED_TAKE);

    const projectIds = new Set<Id<'projects'>>();
    for (const row of activity) {
      if (row.projectId) projectIds.add(row.projectId);
    }
    const tasks = [];
    const resources = [];
    const seenNotion = new Set<string>();
    for (const notionPageId of audits
      .map((row) => row.notionPageId)
      .filter((id): id is string => Boolean(id))) {
      if (seenNotion.has(notionPageId)) continue;
      seenNotion.add(notionPageId);
      const task = await ctx.db
        .query('tasks')
        .withIndex('by_notionPageId', (q) => q.eq('notionPageId', notionPageId))
        .unique();
      if (task && task.orgId === orgId) {
        tasks.push(task);
        projectIds.add(task.projectId);
        continue;
      }
      const resource = await ctx.db
        .query('sharedResources')
        .withIndex('by_notionPageId', (q) => q.eq('notionPageId', notionPageId))
        .unique();
      if (resource && resource.orgId === orgId) {
        resources.push(resource);
        if (resource.projectId) projectIds.add(resource.projectId);
        continue;
      }
      const project = await ctx.db
        .query('projects')
        .withIndex('by_notionPageId', (q) => q.eq('notionPageId', notionPageId))
        .unique();
      if (project && project.orgId === orgId) projectIds.add(project._id);
    }
    const projects = [];
    for (const projectId of projectIds) {
      const project = await ctx.db.get(projectId);
      if (project && project.orgId === orgId) projects.push(project);
    }
    const contacts = await ctx.db
      .query('contacts')
      .withIndex('by_orgId', (q) => q.eq('orgId', orgId))
      .take(CLIENT_FEED_TAKE);

    return buildActivityFeed({
      audience: 'client',
      orgVisible: isOrgVisibleToClients(client),
      activity,
      audits,
      outbox: [],
      projects,
      tasks,
      resources,
      contacts: contacts.map((contact) => ({ name: contact.name })),
      orgId,
      limit: CLIENT_FEED_TAKE,
    });
  },
});

const STAFF_FEED_LIMIT = 40;

/** Staff feed across orgs, including internal projects and outbox history. */
export const listActivityForStaff = adminQuery({
  args: {},
  handler: async (ctx) => {
    const activity = await ctx.db.query('activity').withIndex('by_timestamp').order('desc').take(STAFF_FEED_LIMIT);
    const audits = await ctx.db
      .query('auditEvents')
      .withIndex('by_createdAt')
      .order('desc')
      .take(STAFF_FEED_LIMIT);
    const outbox = await ctx.db
      .query('notionOutbox')
      .withIndex('by_createdAt')
      .order('desc')
      .take(STAFF_FEED_LIMIT);

    const projectIds = new Set<Id<'projects'>>();
    for (const row of activity) {
      if (row.projectId) projectIds.add(row.projectId);
    }
    const tasks = [];
    const seenNotion = new Set<string>();
    for (const notionPageId of [...audits, ...outbox]
      .map((row) => row.notionPageId)
      .filter((id): id is string => Boolean(id))) {
      if (seenNotion.has(notionPageId)) continue;
      seenNotion.add(notionPageId);
      const task = await ctx.db
        .query('tasks')
        .withIndex('by_notionPageId', (q) => q.eq('notionPageId', notionPageId))
        .unique();
      if (task) {
        tasks.push(task);
        projectIds.add(task.projectId);
        continue;
      }
      const project = await ctx.db
        .query('projects')
        .withIndex('by_notionPageId', (q) => q.eq('notionPageId', notionPageId))
        .unique();
      if (project) projectIds.add(project._id);
    }
    const projects = [];
    for (const projectId of projectIds) {
      const project = await ctx.db.get(projectId);
      if (project) projects.push(project);
    }

    return buildActivityFeed({
      audience: 'staff',
      orgVisible: true,
      activity,
      audits,
      outbox,
      projects,
      tasks,
    });
  },
});

const OUTBOX_STATUSES = ['queued', 'inflight', 'failed', 'dead', 'conflict'] as const;
/** Per-status cap. The dashboard gets counts, never this many rows. Display copy for a count at this cap lives in dashboard.ts as the same number. */
const OUTBOX_HEALTH_LIMIT = 100;
const FAILED_OUTBOX = new Set<string>(['failed', 'dead', 'conflict']);
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Staff sync health for the dashboard. Reads the Notion pull and a bounded
 * slice of the B0 outbox. Returns per-status counts and the oldest counted
 * timestamp, not outbox rows. Failed, dead, and conflict counts are the last
 * 24 hours. The write-back flag is on only when it is exactly "true".
 * Payloads, tokens, and Granola are not returned. Clients cannot call this.
 */
export const getSyncHealth = adminQuery({
  args: {},
  handler: async (ctx) => {
    const syncMeta = await ctx.db
      .query('syncMeta')
      .withIndex('by_key', (q) => q.eq('key', 'notion-pull'))
      .unique();
    const now = Date.now();
    const counts = { queued: 0, inflight: 0, failed: 0, dead: 0, conflict: 0 };
    let oldestCreatedAt: number | null = null;
    for (const status of OUTBOX_STATUSES) {
      const rows = await ctx.db
        .query('notionOutbox')
        .withIndex('by_status_nextAttemptAt', (q) => q.eq('status', status))
        .take(OUTBOX_HEALTH_LIMIT);
      for (const row of rows) {
        if (FAILED_OUTBOX.has(status) && now - row.createdAt > DAY_MS) continue;
        counts[status] += 1;
        if (oldestCreatedAt == null || row.createdAt < oldestCreatedAt) {
          oldestCreatedAt = row.createdAt;
        }
      }
    }
    const notices = await ctx.db
      .query('notices')
      .withIndex('by_audience_createdAt', (q) => q.eq('audience', 'staff'))
      .order('desc')
      .take(20);
    return {
      pull: {
        lastSyncedAt: syncMeta?.lastSyncedAt ? new Date(syncMeta.lastSyncedAt).toISOString() : null,
        lastError: syncMeta?.lastError ?? null,
      },
      writebackEnabled: isNotionWritebackEnabled(),
      outbox: { counts, oldestCreatedAt },
      notices: notices
        .filter((row) => row.edgeCase === 'sync' || row.edgeCase === 'conflict')
        .map((row) => ({
          id: row._id,
          message: row.message,
          createdAt: row.createdAt,
          edgeCase: row.edgeCase ?? null,
        })),
    };
  },
});

