import { clientIsStaffVisible } from '@warehaus/portal-sync';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from './_generated/server';
import { contextSourceForToken } from './_lib/projectContext';
import { readProjectContext, writeBrief, writeDecision, writeTerm } from './_lib/projectContextStore';

/**
 * Project context for the staff API and MCP tools. Internal only: these are
 * reached through `/api/v1/context*` after a staff token is checked. A browser
 * cannot call them. Concealed clients read as not found, as on project reads.
 */

type ApiResult = { status: number; body: unknown };

async function visibleProject(ctx: QueryCtx | MutationCtx, projectId: Id<'projects'>): Promise<boolean> {
  const project = await ctx.db.get(projectId);
  if (!project) return false;
  return clientIsStaffVisible(await ctx.db.get(project.orgId));
}

const NOT_FOUND: ApiResult = { status: 404, body: { error: 'Project not found' } };

export const read = internalQuery({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }): Promise<ApiResult> => {
    if (!(await visibleProject(ctx, projectId))) return NOT_FOUND;
    return { status: 200, body: await readProjectContext(ctx, projectId) };
  },
});

export const saveBrief = internalMutation({
  args: {
    projectId: v.id('projects'),
    tokenName: v.string(),
    goal: v.optional(v.string()),
    audience: v.optional(v.string()),
    outOfScope: v.optional(v.string()),
    doneWhen: v.optional(v.string()),
  },
  handler: async (ctx, { projectId, tokenName, ...fields }): Promise<ApiResult> => {
    if (!(await visibleProject(ctx, projectId))) return NOT_FOUND;
    const result = await writeBrief(ctx, { source: contextSourceForToken(tokenName) }, projectId, fields);
    return { status: 200, body: { ...result, context: await readProjectContext(ctx, projectId) } };
  },
});

export const upsertTerm = internalMutation({
  args: { projectId: v.id('projects'), tokenName: v.string(), term: v.string(), definition: v.string() },
  handler: async (ctx, { projectId, tokenName, term, definition }): Promise<ApiResult> => {
    if (!(await visibleProject(ctx, projectId))) return NOT_FOUND;
    const result = await writeTerm(ctx, { source: contextSourceForToken(tokenName) }, projectId, { term, definition });
    return { status: 200, body: result };
  },
});

export const recordDecision = internalMutation({
  args: { projectId: v.id('projects'), tokenName: v.string(), title: v.string(), body: v.optional(v.string()) },
  handler: async (ctx, { projectId, tokenName, title, body }): Promise<ApiResult> => {
    if (!(await visibleProject(ctx, projectId))) return NOT_FOUND;
    const result = await writeDecision(ctx, { source: contextSourceForToken(tokenName) }, projectId, { title, body });
    return { status: 200, body: result };
  },
});
