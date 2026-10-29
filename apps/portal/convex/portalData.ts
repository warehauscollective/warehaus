import type { Id } from './_generated/dataModel';
import { clientQuery, adminQuery } from './_lib/wrappers';
import { isStaff } from './_lib/identity';
import { buildActivityFeed } from './_lib/activityFeed';
import { staffQuarantineActivity } from './_lib/quarantineActivity';
import { clientMaySeeProject, clientMaySeeTask, isClientVisibleActivityType, isOrgVisibleToClients } from '@warehaus/portal-sync';
import { isNotionWritebackEnabled } from './_lib/writeAuthz';

function isActivityVisible(type: string, staff: boolean): boolean {
  if (type === 'shipment') return false;
  if (staff) return true;
  return isClientVisibleActivityType(type);
}

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
        notionPageId: p.notionPageId,
        lastSyncedAt: p.lastSyncedAt,
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
            notionPageId: t.notionPageId,
            lastSyncedAt: t.lastSyncedAt,
          };
        }),
      activity: [
        ...quarantineActivity,
        ...activity
          .filter((a) => {
            if (!isActivityVisible(a.type, staff)) return false;
            if (staff) return true;
            if (a.projectId && !projectById.has(a.projectId)) return false;
            return true;
          })
          .map((a) => ({
            id: a._id,
            name: a.name,
            type: a.type,
            summary: a.summary ?? '',
            timestamp: new Date(a.timestamp).toISOString(),
            tone: a.tone ?? 'muted',
            projectId: a.projectId ?? null,
          })),
      ],
      syncMeta: {
        lastSyncedAt: syncMeta?.lastSyncedAt
          ? new Date(syncMeta.lastSyncedAt).toISOString()
          : null,
        lastError: syncMeta?.lastError ?? null,
        mode: 'convex' as const,
      },
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

/** Client feed. Internal projects and SERVER task fields stay out. */
export const listActivityForClient = clientQuery({
  args: {},
  handler: async (ctx) => {
    const orgId = ctx.orgId;
    const client = await ctx.db.get(orgId);
    const projects = await ctx.db.query('projects').withIndex('by_orgId', (q) => q.eq('orgId', orgId)).collect();
    const tasks = await ctx.db.query('tasks').withIndex('by_orgId', (q) => q.eq('orgId', orgId)).collect();
    const activity = await ctx.db
      .query('activity')
      .withIndex('by_orgId_timestamp', (q) => q.eq('orgId', orgId))
      .order('desc')
      .take(50);
    const audits = await ctx.db
      .query('auditEvents')
      .withIndex('by_orgId_createdAt', (q) => q.eq('orgId', orgId))
      .order('desc')
      .take(50);
    return buildActivityFeed({
      audience: 'client',
      orgVisible: isOrgVisibleToClients(client),
      activity,
      audits,
      outbox: [],
      projects,
      tasks,
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

const OPEN_OUTBOX = ['queued', 'inflight', 'failed', 'dead', 'conflict'] as const;

/**
 * Staff sync health for the dashboard. Reads the Notion pull and the B0
 * outbox. The write-back flag is reported as on only when it is exactly
 * "true". Payloads, tokens, and Granola are not returned. Clients cannot
 * call this query.
 */
export const getSyncHealth = adminQuery({
  args: {},
  handler: async (ctx) => {
    const syncMeta = await ctx.db
      .query('syncMeta')
      .withIndex('by_key', (q) => q.eq('key', 'notion-pull'))
      .unique();
    const outbox = [];
    for (const status of OPEN_OUTBOX) {
      const rows = await ctx.db
        .query('notionOutbox')
        .withIndex('by_status_nextAttemptAt', (q) => q.eq('status', status))
        .take(500);
      for (const row of rows) {
        outbox.push({
          status: row.status,
          createdAt: row.createdAt,
          nextAttemptAt: row.nextAttemptAt,
        });
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
      outbox,
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

