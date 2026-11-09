import { isMissingConvexFunction } from '@/lib/data/staffRoster';

/**
 * Pure checks for the milestone UI.
 * Milestone activity is filtered by milestoneId. A matching name is not enough.
 */

export function activityForMilestone<T extends { milestoneId?: string | null }>(
  items: readonly T[],
  milestoneId: string,
): T[] {
  return items.filter((item) => item.milestoneId === milestoneId);
}

export function resourcesForProject<T extends { projectId?: string | null }>(
  resources: readonly T[],
  projectId: string,
): T[] {
  return resources.filter((resource) => resource.projectId === projectId);
}

/** Project-scoped choices, plus resources already on this milestone. Server choice lists are not reused. */
export function milestoneResourceChoices(
  projectChoices: readonly { id: string; title: string }[],
  attached: readonly { id: string; title: string }[],
): { id: string; title: string }[] {
  const seen = new Set<string>();
  const choices: { id: string; title: string }[] = [];
  for (const choice of [...projectChoices, ...attached]) {
    if (seen.has(choice.id)) continue;
    seen.add(choice.id);
    choices.push({ id: choice.id, title: choice.title });
  }
  return choices;
}

/**
 * Fields already on the project the client is viewing.
 * An explicit hidden, internal, or unpublished project is unavailable.
 * Anything else with an empty milestone list is an authorized empty list.
 */
export function clientMilestoneEmptyKind(project: {
  publishToWarehaus?: boolean;
  internal?: boolean;
  syncHidden?: boolean;
  name?: string | null;
}): 'unavailable' | 'none-shared' {
  if (project.publishToWarehaus === false) return 'unavailable';
  if (project.internal === true) return 'unavailable';
  if (project.syncHidden === true) return 'unavailable';
  if ((project.name ?? '').trim().toLowerCase() === 'warehaus.studio') return 'unavailable';
  return 'none-shared';
}

export function milestonesAfterQuery<T>(input: {
  data: readonly T[] | undefined;
  error: string | null;
  loading: boolean;
  previous: readonly T[];
}): T[] {
  if (input.data) return [...input.data];
  if ((input.error || input.loading) && input.previous.length > 0) return [...input.previous];
  return [];
}

export function boardCountsFromTasks(
  tasks: readonly { id: string; parentTaskId?: string | null; isDone: boolean }[],
): { lanes: number; laneDone: number; nested: number } {
  const ids = new Set(tasks.map((task) => task.id));
  const parents = tasks.filter((task) => !task.parentTaskId);
  const nested = tasks.filter((task) => Boolean(task.parentTaskId) && ids.has(task.parentTaskId as string));
  return {
    lanes: parents.length,
    laneDone: parents.filter((task) => task.isDone).length,
    nested: nested.length,
  };
}

/** The decision stored on the milestone row. Activity names are not an input. */
export function storedMilestoneReview(milestone: {
  id: string;
  approval: string;
  note: string | null;
  approverName: string | null;
  decidedAt: number | null;
}): {
  id: string;
  approval: string;
  note: string;
  approverName: string | null;
  decidedAt: number | null;
} | null {
  if (!milestone.note && milestone.decidedAt == null) return null;
  return {
    id: milestone.id,
    approval: milestone.approval,
    note: milestone.note ?? '',
    approverName: milestone.approverName,
    decidedAt: milestone.decidedAt,
  };
}

/** Local calendar day. The today check and the printed day use this same zone. */
export function localMonthDay(at: number): { key: string; label: string } {
  const date = new Date(at);
  return {
    key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
    label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  };
}

export function reviewStamp(at: number | null, now = Date.now()): string {
  if (at == null) return 'No review yet';
  const when = localMonthDay(at);
  if (when.key === localMonthDay(now).key) return 'Last review today';
  return `Last review ${when.label}`;
}

export function goalKey(index: number, goal: string): string {
  return `${index}:${goal}`;
}

export function nextTabIndex(current: number, count: number, key: string): number | null {
  if (count <= 0 || current < 0) return null;
  if (key === 'ArrowRight') return (current + 1) % count;
  if (key === 'ArrowLeft') return (current - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

export function tabIds(prefix: string, tabId: string): { tab: string; panel: string } {
  return { tab: `${prefix}-tab-${tabId}`, panel: `${prefix}-panel` };
}

/** Where Tab should move when it would leave the dialog. */
export function dialogTabBoundary(input: {
  shiftKey: boolean;
  atFirst: boolean;
  atLast: boolean;
}): 'first' | 'last' | null {
  if (input.shiftKey && input.atFirst) return 'last';
  if (!input.shiftKey && input.atLast) return 'first';
  return null;
}

/** Missing milestone API leaves the new shell. Any other error stays in it. */
export function milestoneQueryAvailability(input: {
  fixtures: boolean;
  error: string | null;
}): 'shell' | 'fallback' {
  if (input.fixtures) return 'shell';
  if (isMissingConvexFunction(input.error)) return 'fallback';
  return 'shell';
}

export const MENU_ERROR_ID = 'milestone-menu-error';

/** A tasks-tab mutation failure stays on that tab, with the menu still open and the controls usable. */
export function tasksMenuFailure(input: {
  tab: 'overview' | 'tasks' | 'reviews' | 'activity';
  error: string | null;
  reviewOpen: boolean;
  editing: boolean;
}): { show: boolean; describedBy: string | undefined } {
  const show = input.tab === 'tasks' && input.error != null && !input.reviewOpen && !input.editing;
  return { show, describedBy: show ? MENU_ERROR_ID : undefined };
}

type Isolatable = {
  nodeName?: string;
  parentElement: Isolatable | null;
  children?: ArrayLike<Isolatable>;
  inert?: boolean;
  style?: { pointerEvents?: string };
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  removeAttribute(name: string): void;
};

function hideSiblings(current: Isolatable, touched: Array<{
  el: Isolatable;
  inert: boolean;
  hidden: string | null;
  pointer: string;
}>) {
  const parent = current.parentElement;
  if (!parent?.children) return;
  for (const child of Array.from(parent.children)) {
    if (child === current) continue;
    touched.push({
      el: child,
      inert: child.inert === true,
      hidden: child.getAttribute('aria-hidden'),
      pointer: child.style?.pointerEvents ?? '',
    });
    child.inert = true;
    child.setAttribute('aria-hidden', 'true');
    if (child.style) child.style.pointerEvents = 'none';
  }
}

/**
 * The open dialog stays reachable. Every other branch under body does not:
 * inert, hidden from assistive tech, and out of the pointer path.
 */
export function isolateOutsideDialog(dialog: Isolatable): () => void {
  const touched: Array<{
    el: Isolatable;
    inert: boolean;
    hidden: string | null;
    pointer: string;
  }> = [];
  let current: Isolatable | null = dialog;
  while (current?.parentElement) {
    const parentName = current.parentElement.nodeName ?? '';
    hideSiblings(current, touched);
    if (parentName === 'BODY' || parentName === 'HTML' || parentName === '#document') break;
    current = current.parentElement;
  }
  return () => {
    for (const item of touched) {
      item.el.inert = item.inert;
      if (item.hidden == null) item.el.removeAttribute('aria-hidden');
      else item.el.setAttribute('aria-hidden', item.hidden);
      if (item.el.style) item.el.style.pointerEvents = item.pointer;
    }
  };
}

/** Focus that lands outside the dialog is pulled back in. */
export function focusShouldReturnToDialog(input: { targetInsideDialog: boolean }): boolean {
  return !input.targetInsideDialog;
}
