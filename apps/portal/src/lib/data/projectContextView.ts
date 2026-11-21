import type { ContextView } from '@convex/_lib/projectContext';

/** Sub-tabs inside a project's Context tab. Clients only ever see Resources. */
export type ContextSubTab = 'brief' | 'glossary' | 'decisions' | 'resources';

export const CONTEXT_SUB_TABS: readonly ContextSubTab[] = ['brief', 'glossary', 'decisions', 'resources'];

/** Tab labels. Glossary and Decisions carry their count once the context has loaded. */
export function contextSubTabs(view: ContextView | null): { id: ContextSubTab; label: string }[] {
  return [
    { id: 'brief', label: 'Brief' },
    { id: 'glossary', label: view ? `Glossary ${view.summary.termCount}` : 'Glossary' },
    { id: 'decisions', label: view ? `Decisions ${view.summary.decisionCount}` : 'Decisions' },
    { id: 'resources', label: 'Resources' },
  ];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Nov 18". UTC, so the server and the browser print the same day. */
export function contextDate(ms: number): string {
  const date = new Date(ms);
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

export function briefMeta(view: ContextView): string {
  if (view.summary.briefUpdatedAt == null) return 'Not started';
  return `Updated ${contextDate(view.summary.briefUpdatedAt)}`;
}

export function countMeta(count: number, one: string, many: string, none: string): string {
  if (count === 0) return none;
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Text staff paste into Grok or Claude to start a grilling session.
 * The portal makes no model call; the bot runs the session with its own tools.
 */
export function grillingPrompt(project: { id: string; name: string }): string {
  return [
    `Grill me on the Warehaus project "${project.name}".`,
    `Project id: ${project.id}`,
    '',
    'Use the Warehaus Portal tools. Call get_grilling_instructions first and follow it.',
    'Then call get_project_context for this project and do not ask again what is already settled.',
    'Save the brief, glossary terms, and decisions to the project as we settle each one.',
  ].join('\n');
}

const day = (iso: string) => Date.parse(`${iso}T12:00:00Z`);

/** Fixture context for the design preview routes. Matches Figma section P13. */
export const FIXTURE_PROJECT_CONTEXT: ContextView = {
  brief: [
    { key: 'goal', label: 'Goal', body: 'One portal for staff and clients where every task belongs to a milestone.', updatedAt: day('2026-11-18') },
    { key: 'audience', label: 'Who it is for', body: 'Warehaus staff, client admins and client members.', updatedAt: day('2026-11-18') },
    { key: 'outOfScope', label: 'Out of scope', body: 'Per-task previews. Model calls made by the portal itself.', updatedAt: day('2026-11-18') },
    { key: 'doneWhen', label: 'Done when', body: 'A milestone can be created, built, reviewed and approved end to end.', updatedAt: day('2026-11-18') },
  ],
  terms: [
    { term: 'Client', definition: 'The organisation a project belongs to.', updatedAt: day('2026-11-18') },
    { term: 'Contact', definition: 'A person who can sign in, at a client or at Warehaus.', updatedAt: day('2026-11-18') },
    { term: 'Context', definition: 'The brief, glossary, decisions and resources of a project.', updatedAt: day('2026-11-20') },
    { term: 'Milestone', definition: 'A reviewable unit of work with one preview and one approval.', updatedAt: day('2026-11-18') },
    { term: 'Project', definition: 'A body of work for one client. Holds milestones.', updatedAt: day('2026-11-18') },
    { term: 'Task', definition: 'A step inside a milestone. Never exists outside one.', updatedAt: day('2026-11-18') },
  ],
  decisions: [
    { number: 3, id: '0003', title: 'Auth ids stay per deployment and are never copied from Notion off production.', body: '', recordedAt: day('2026-11-20') },
    { number: 2, id: '0002', title: 'Bots run grilling. The portal makes no model calls.', body: '', recordedAt: day('2026-11-20') },
    { number: 1, id: '0001', title: 'Tasks live only inside milestones.', body: '', recordedAt: day('2026-11-19') },
  ],
  summary: {
    briefFieldsSet: 4,
    briefComplete: true,
    termCount: 6,
    decisionCount: 3,
    incomplete: false,
    briefUpdatedAt: day('2026-11-18'),
  },
};
