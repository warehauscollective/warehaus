import { ConvexError } from 'convex/values';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import {
  BRIEF_FIELDS,
  CONTEXT_LIMITS,
  briefFieldLabel,
  buildContextView,
  cleanContextLine,
  cleanContextText,
  decisionError,
  decisionKey,
  findDecisionByTitle,
  isSameContent,
  lengthError,
  nextDecisionNumber,
  termError,
  termKey,
  type BriefFieldKey,
  type ContextKind,
  type ContextSource,
} from './projectContext';

/**
 * Reads and writes for project context. The callers decide who may call:
 * staff session wrappers in `convex/projectContext.ts`, nothing else.
 * Every read is one indexed, bounded range for a single project.
 */

export type ContextActor = { contactId?: string; source?: ContextSource };

const MAX_ROWS = BRIEF_FIELDS.length + CONTEXT_LIMITS.terms + CONTEXT_LIMITS.decisions;

async function requireProject(ctx: QueryCtx | MutationCtx, projectId: Id<'projects'>) {
  const project = await ctx.db.get(projectId);
  if (!project) throw new ConvexError('Project not found');
  return project;
}

function byKind(ctx: QueryCtx | MutationCtx, projectId: Id<'projects'>, kind: ContextKind) {
  return ctx.db
    .query('projectContextEntries')
    .withIndex('by_projectId_kind_key', (q) => q.eq('projectId', projectId).eq('kind', kind));
}

function one(ctx: QueryCtx | MutationCtx, projectId: Id<'projects'>, kind: ContextKind, key: string) {
  return ctx.db
    .query('projectContextEntries')
    .withIndex('by_projectId_kind_key', (q) =>
      q.eq('projectId', projectId).eq('kind', kind).eq('key', key),
    )
    .unique();
}

export async function readProjectContext(ctx: QueryCtx | MutationCtx, projectId: Id<'projects'>) {
  const project = await requireProject(ctx, projectId);
  const rows = await ctx.db
    .query('projectContextEntries')
    .withIndex('by_projectId_kind_key', (q) => q.eq('projectId', projectId))
    .take(MAX_ROWS);
  return { projectId, projectName: project.name, ...buildContextView(rows) };
}

/** Set, change, or clear brief fields. A field left out is not touched; an empty one is cleared. */
export async function writeBrief(
  ctx: MutationCtx,
  actor: ContextActor,
  projectId: Id<'projects'>,
  fields: Partial<Record<BriefFieldKey, string>>,
) {
  const project = await requireProject(ctx, projectId);
  const now = Date.now();
  let changed = 0;
  for (const field of BRIEF_FIELDS) {
    const raw = fields[field.key];
    if (raw === undefined) continue;
    const body = cleanContextText(raw);
    const tooLong = lengthError(field.label, body, CONTEXT_LIMITS.briefField);
    if (tooLong) throw new ConvexError(tooLong);
    const existing = await one(ctx, projectId, 'brief', field.key);
    if (body === '') {
      if (existing) {
        await ctx.db.delete(existing._id);
        changed += 1;
      }
      continue;
    }
    const title = briefFieldLabel(field.key);
    if (isSameContent(existing, { title, body })) continue;
    if (existing) {
      await ctx.db.patch(existing._id, {
        title,
        body,
        source: actor.source ?? 'portal',
        updatedByContactId: actor.contactId,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert('projectContextEntries', {
        orgId: project.orgId,
        projectId,
        kind: 'brief',
        key: field.key,
        title,
        body,
        source: actor.source ?? 'portal',
        updatedByContactId: actor.contactId,
        createdAt: now,
        updatedAt: now,
      });
    }
    changed += 1;
  }
  return { changed };
}

/** Add a glossary term, or change its definition. Spelling of an existing term follows the latest write. */
export async function writeTerm(
  ctx: MutationCtx,
  actor: ContextActor,
  projectId: Id<'projects'>,
  input: { term: string; definition: string },
) {
  const project = await requireProject(ctx, projectId);
  const title = cleanContextLine(input.term);
  const body = cleanContextText(input.definition);
  const error = termError(title, body);
  if (error) throw new ConvexError(error);
  const key = termKey(title);
  const existing = await one(ctx, projectId, 'term', key);
  if (isSameContent(existing, { title, body })) return { term: title, created: false, changed: false };
  const now = Date.now();
  if (existing) {
    await ctx.db.patch(existing._id, {
      title,
      body,
      source: actor.source ?? 'portal',
      updatedByContactId: actor.contactId,
      updatedAt: now,
    });
    return { term: title, created: false, changed: true };
  }
  const count = (await byKind(ctx, projectId, 'term').take(CONTEXT_LIMITS.terms)).length;
  if (count >= CONTEXT_LIMITS.terms) {
    throw new ConvexError(`A project can hold ${CONTEXT_LIMITS.terms} glossary terms`);
  }
  await ctx.db.insert('projectContextEntries', {
    orgId: project.orgId,
    projectId,
    kind: 'term',
    key,
    title,
    body,
    source: actor.source ?? 'portal',
    updatedByContactId: actor.contactId,
    createdAt: now,
    updatedAt: now,
  });
  return { term: title, created: true, changed: true };
}

export async function deleteTerm(ctx: MutationCtx, projectId: Id<'projects'>, term: string) {
  await requireProject(ctx, projectId);
  const existing = await one(ctx, projectId, 'term', termKey(term));
  if (!existing) return { removed: false };
  await ctx.db.delete(existing._id);
  return { removed: true };
}

/** Record a decision. The same title again returns the first record and writes nothing. */
export async function writeDecision(
  ctx: MutationCtx,
  actor: ContextActor,
  projectId: Id<'projects'>,
  input: { title: string; body?: string },
) {
  const project = await requireProject(ctx, projectId);
  const title = cleanContextLine(input.title);
  const body = cleanContextText(input.body ?? '');
  const error = decisionError(title, body);
  if (error) throw new ConvexError(error);
  const rows = await byKind(ctx, projectId, 'decision').take(CONTEXT_LIMITS.decisions);
  const same = findDecisionByTitle(rows, title);
  if (same && typeof same.number === 'number') {
    return { number: same.number, id: decisionKey(same.number), reused: true };
  }
  if (rows.length >= CONTEXT_LIMITS.decisions) {
    throw new ConvexError(`A project can hold ${CONTEXT_LIMITS.decisions} decisions`);
  }
  const number = nextDecisionNumber(rows.map((row) => row.number ?? 0));
  const now = Date.now();
  await ctx.db.insert('projectContextEntries', {
    orgId: project.orgId,
    projectId,
    kind: 'decision',
    key: decisionKey(number),
    title,
    body,
    number,
    source: actor.source ?? 'portal',
    updatedByContactId: actor.contactId,
    createdAt: now,
    updatedAt: now,
  });
  return { number, id: decisionKey(number), reused: false };
}

/** Correct the wording of a recorded decision. Its number does not change. */
export async function reviseDecision(
  ctx: MutationCtx,
  actor: ContextActor,
  projectId: Id<'projects'>,
  input: { number: number; title: string; body?: string },
) {
  await requireProject(ctx, projectId);
  const existing = await one(ctx, projectId, 'decision', decisionKey(input.number));
  if (!existing) throw new ConvexError('Decision not found');
  const title = cleanContextLine(input.title);
  const body = cleanContextText(input.body ?? '');
  const error = decisionError(title, body);
  if (error) throw new ConvexError(error);
  if (isSameContent(existing, { title, body })) return { number: input.number, changed: false };
  await ctx.db.patch(existing._id, {
    title,
    body,
    source: actor.source ?? 'portal',
    updatedByContactId: actor.contactId,
    updatedAt: Date.now(),
  });
  return { number: input.number, changed: true };
}
