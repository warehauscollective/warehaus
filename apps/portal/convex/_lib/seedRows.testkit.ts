/**
 * Valid rows for tests on the in-memory ctx (see `memoryCtx.testkit.ts`).
 * Each factory fills the fields the schema requires and takes overrides.
 * Convex skips this file: its name has more than one dot.
 */

import type { MemoryCtx } from './memoryCtx.testkit';

type Fields = Record<string, unknown>;

let counter = 0;
const unique = (prefix: string) => `${prefix}-${(counter += 1)}`;

export function seedOrg(t: MemoryCtx, fields: Fields = {}): string {
  const slug = (fields.slug as string | undefined) ?? unique('org');
  return t.seed('clients', {
    notionPageId: `page-${slug}`,
    lastSyncedAt: 0,
    companyName: slug,
    slug,
    status: 'Active',
    portalAccess: 'Enabled',
    ...fields,
  });
}

export function seedContact(t: MemoryCtx, orgId: string, fields: Fields = {}): string {
  const key = unique('contact');
  return t.seed('contacts', {
    orgId,
    notionPageId: `page-${key}`,
    lastSyncedAt: 0,
    name: key,
    email: `${key}@example.test`,
    role: 'Client Admin',
    portalAccess: 'Enabled',
    ...fields,
  });
}

export function seedProject(t: MemoryCtx, orgId: string, fields: Fields = {}): string {
  const key = unique('project');
  return t.seed('projects', {
    orgId,
    notionPageId: `page-${key}`,
    lastSyncedAt: 0,
    name: key,
    status: 'Active',
    type: [],
    archive: false,
    publishToWarehaus: true,
    ...fields,
  });
}

export function seedMilestone(t: MemoryCtx, orgId: string, projectId: string, fields: Fields = {}): string {
  return t.seed('milestones', {
    orgId,
    projectId,
    name: unique('Milestone'),
    objective: 'Ship it',
    goals: [],
    status: 'Building',
    approval: 'unreviewed',
    publishToWarehaus: false,
    ...fields,
  });
}

export function seedTask(t: MemoryCtx, orgId: string, projectId: string, fields: Fields = {}): string {
  const key = unique('task');
  return t.seed('tasks', {
    orgId,
    projectId,
    notionPageId: `page-${key}`,
    lastSyncedAt: 0,
    name: key,
    status: 'To Do',
    isDone: false,
    publishToWarehaus: false,
    ...fields,
  });
}

/** An org, a project and a milestone in it, the usual start of a milestone test. */
export function seedMilestoneWorld(t: MemoryCtx, milestone: Fields = {}, project: Fields = {}) {
  const orgId = seedOrg(t);
  const projectId = seedProject(t, orgId, project);
  const milestoneId = seedMilestone(t, orgId, projectId, milestone);
  return { orgId, projectId, milestoneId, task: (fields: Fields = {}) => seedTask(t, orgId, projectId, { milestoneId, ...fields }) };
}
