import { v } from 'convex/values';
import { adminMutation, adminQuery } from './_lib/wrappers';
import {
  deleteTerm,
  readProjectContext,
  reviseDecision,
  writeBrief,
  writeDecision,
  writeTerm,
} from './_lib/projectContextStore';

/**
 * Project context for the Context tab: brief, glossary, decisions.
 * STAFF ONLY. Every export here uses an admin wrapper. Do not add a client
 * wrapper to this file; `projectContextAccess.test.ts` fails if one appears.
 */

const projectArg = { projectId: v.id('projects') };

export const get = adminQuery({
  args: projectArg,
  handler: (ctx, { projectId }) => readProjectContext(ctx, projectId),
});

export const saveBrief = adminMutation({
  args: {
    ...projectArg,
    goal: v.optional(v.string()),
    audience: v.optional(v.string()),
    outOfScope: v.optional(v.string()),
    doneWhen: v.optional(v.string()),
  },
  handler: (ctx, { projectId, ...fields }) =>
    writeBrief(ctx, { contactId: ctx.identity.contactId, source: 'portal' }, projectId, fields),
});

export const upsertTerm = adminMutation({
  args: { ...projectArg, term: v.string(), definition: v.string() },
  handler: (ctx, { projectId, term, definition }) =>
    writeTerm(ctx, { contactId: ctx.identity.contactId, source: 'portal' }, projectId, { term, definition }),
});

export const removeTerm = adminMutation({
  args: { ...projectArg, term: v.string() },
  handler: (ctx, { projectId, term }) => deleteTerm(ctx, projectId, term),
});

export const recordDecision = adminMutation({
  args: { ...projectArg, title: v.string(), body: v.optional(v.string()) },
  handler: (ctx, { projectId, title, body }) =>
    writeDecision(ctx, { contactId: ctx.identity.contactId, source: 'portal' }, projectId, { title, body }),
});

export const updateDecision = adminMutation({
  args: { ...projectArg, number: v.number(), title: v.string(), body: v.optional(v.string()) },
  handler: (ctx, { projectId, number, title, body }) =>
    reviseDecision(ctx, { contactId: ctx.identity.contactId, source: 'portal' }, projectId, { number, title, body }),
});
