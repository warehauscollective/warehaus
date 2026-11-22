import { clientMaySeeProject, isOrgVisibleToClients } from '@warehaus/portal-sync';
import { v } from 'convex/values';
import { serveTasksByOrg } from './_lib/taskPlatformRead';
import { adminMutation, adminQuery, clientQuery } from './_lib/wrappers';
import { PortalAuthError } from './_lib/identity';
import { AGENT_REPO_INVALID, agentRepo, buildAgent } from './_lib/agentRun';
import type { Id } from './_generated/dataModel';

/** CLIENT fields only — never emit SERVER gate inputs. */
function toClientProject(row: {
  _id: string;
  orgId: string;
  name: string;
  description?: string;
  status: string;
  progress?: number;
  startDate?: string;
  endDate?: string;
  liveUrl?: string;
  figmaLink?: string;
  docsUrl?: string;
  stack?: string[];
  externalId?: string;
}) {
  return {
    id: row._id,
    orgId: row.orgId,
    name: row.name,
    description: row.description ?? null,
    status: row.status,
    progress: row.progress ?? null,
    startDate: row.startDate ?? null,
    endDate: row.endDate ?? null,
    liveUrl: row.liveUrl ?? null,
    figmaLink: row.figmaLink ?? null,
    docsUrl: row.docsUrl ?? null,
    stack: row.stack ?? [],
  };
}

function isPublishedProject(row: {
  name: string;
  publishToWarehaus: boolean;
  archive: boolean;
  type: string[];
  syncHiddenAt?: number;
}) {
  return clientMaySeeProject({
    name: row.name,
    types: row.type,
    publishToWarehaus: row.publishToWarehaus,
    archive: row.archive,
    hidden: row.syncHiddenAt != null,
    orgVisible: true,
  });
}

/** List published projects for the caller's org. */
export const listForClient = clientQuery({
  args: {},
  handler: async (ctx) => {
    const org = await ctx.db.get(ctx.orgId);
    if (!isOrgVisibleToClients(org)) return [];
    const rows = await ctx.db
      .query('projects')
      .withIndex('by_orgId', (q) => q.eq('orgId', ctx.orgId))
      .collect();

    return rows.filter(isPublishedProject).map(toClientProject);
  },
});

/** Admin: list projects for any org (explicit orgId arg). */
export const listForOrgAdmin = adminQuery({
  args: { orgId: v.id('clients') },
  handler: async (ctx, { orgId }) => {
    const rows = await ctx.db
      .query('projects')
      .withIndex('by_orgId', (q) => q.eq('orgId', orgId))
      .collect();
    return rows.map(toClientProject);
  },
});

/**
 * Staff: all published projects across clients (team Projects tab).
 * Includes clientName for detail/pipeline grouping.
 */
export const listPublishedForStaff = adminQuery({
  args: {},
  handler: async (ctx) => {
    const clients = await ctx.db.query('clients').collect();
    const clientById = new Map(clients.map((c) => [c._id, c] as const));
    const rows = await ctx.db.query('projects').collect();

    return rows
      .filter(isPublishedProject)
      .map((row) => {
        const client = clientById.get(row.orgId);
        return {
          ...toClientProject(row),
          clientName: client?.companyName ?? null,
          clientSlug: client?.slug ?? null,
          notionPageId: row.notionPageId,
          // Staff only. toClientProject never carries it. The roster query
          // below returns it too; without it here the repository screen
          // reads "Not set" after a save.
          agentRepo: row.agentRepo ?? null,
          agentDriver: buildAgent(row.agentDriver),
        };
      })
      .sort((a, b) => {
        const score = (status: string) => {
          const s = status.toLowerCase();
          if (s.includes('progress')) return 3;
          if (s.includes('plan')) return 2;
          if (s.includes('inbox')) return 1;
          return 0;
        };
        const byStatus = score(b.status) - score(a.status);
        if (byStatus !== 0) return byStatus;
        return (
          (b.progress ?? 0) - (a.progress ?? 0) || a.name.localeCompare(b.name)
        );
      });
  },
});

function isInternalClient(client: { slug: string; companyName: string } | undefined): boolean {
  if (!client) return false;
  return (
    client.slug === 'warehaus' ||
    client.slug.startsWith('warehaus-') ||
    client.companyName.startsWith('Warehaus')
  );
}

/**
 * Staff project roster, including unpublished and internal rows.
 * Soft-hidden rows stay in the result with `syncHidden` so the UI cannot
 * paint them as saved. Client queries keep using the publish gate.
 */
export const listForStaff = adminQuery({
  args: {},
  handler: async (ctx) => {
    const clients = await ctx.db.query('clients').collect();
    const clientById = new Map(clients.map((c) => [c._id, c] as const));
    const tasks = serveTasksByOrg(
      (await ctx.db.query('tasks').collect()).filter((task) => task.syncHiddenAt == null),
      (orgId) => clientById.get(orgId as Id<'clients'>)?.taskPlatform,
    );
    const taskCount = new Map<string, number>();
    for (const task of tasks) {
      taskCount.set(task.projectId, (taskCount.get(task.projectId) ?? 0) + 1);
    }
    const rows = await ctx.db.query('projects').collect();
    return rows
      .map((row) => {
        const client = clientById.get(row.orgId);
        return {
          ...toClientProject(row),
          clientName: client?.companyName ?? null,
          clientSlug: client?.slug ?? null,
          publishToWarehaus: row.publishToWarehaus,
          internal: row.type.includes('Internal') || isInternalClient(client),
          notionPageId: row.notionPageId,
          lastSyncedAt: row.lastSyncedAt,
          syncHidden: row.syncHiddenAt != null,
          taskCount: taskCount.get(row._id) ?? 0,
          // Staff only. toClientProject never carries it.
          agentRepo: row.agentRepo ?? null,
          agentDriver: buildAgent(row.agentDriver),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

/**
 * Convex-only stand-in from before Notion project create.
 * The projects list does not call this. It does not write Notion, and the
 * synthetic page id is not a relation target for later tasks.
 */
export const createForStaff = adminMutation({
  args: {
    orgId: v.id('clients'),
    name: v.string(),
    description: v.optional(v.string()),
    status: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) {
      throw new PortalAuthError('Project name is required', 'FORBIDDEN');
    }

    const client = await ctx.db.get(args.orgId);
    if (!client) {
      throw new PortalAuthError('Client not found', 'FORBIDDEN');
    }

    const now = Date.now();
    const notionPageId = `portal:project:${now}:${Math.random().toString(36).slice(2, 10)}`;

    const projectId = await ctx.db.insert('projects', {
      orgId: args.orgId as Id<'clients'>,
      notionPageId,
      name,
      description: args.description?.trim() || undefined,
      status: args.status?.trim() || 'Inbox',
      progress: 0,
      endDate: args.endDate || undefined,
      type: ['Website'],
      archive: false,
      publishToWarehaus: true,
      source: 'portal',
      lastSyncedAt: now,
    });

    await ctx.db.insert('activity', {
      orgId: args.orgId as Id<'clients'>,
      projectId,
      name: 'Project created',
      summary: `${name} · ${client.companyName}`,
      type: 'project',
      tone: 'accent',
      timestamp: now,
    });

    return { id: projectId, notionPageId };
  },
});

/**
 * Staff set the repository a runner works this project in. Empty clears it,
 * and a project with none is never handed to a runner. The same value again
 * writes nothing. Convex only: not sent to Notion, never returned to a client.
 */
export const setAgentRepo = adminMutation({
  args: { projectId: v.id('projects'), repo: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new PortalAuthError('Project not found', 'FORBIDDEN');
    const raw = args.repo?.trim() ?? '';
    const next = raw ? agentRepo(raw) : null;
    if (raw && !next) throw new PortalAuthError(AGENT_REPO_INVALID, 'FORBIDDEN');
    if ((project.agentRepo ?? null) === next) return { ok: true as const, wrote: false, repo: next };
    await ctx.db.patch(project._id, { agentRepo: next ?? undefined });
    return { ok: true as const, wrote: true, repo: next };
  },
});

/**
 * Staff pick the agent that builds this project's milestones. Absent stays
 * Claude Code. The same value writes nothing. The Cursor API key is not
 * stored here.
 */
export const setAgentDriver = adminMutation({
  args: { projectId: v.id('projects'), driver: v.union(v.literal('claude_code'), v.literal('cursor')) },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new PortalAuthError('Project not found', 'FORBIDDEN');
    const next = buildAgent(args.driver);
    if (buildAgent(project.agentDriver) === next && project.agentDriver === next) {
      return { ok: true as const, wrote: false, driver: next };
    }
    if ((project.agentDriver ?? 'claude_code') === next) return { ok: true as const, wrote: false, driver: next };
    await ctx.db.patch(project._id, { agentDriver: next });
    return { ok: true as const, wrote: true, driver: next };
  },
});
