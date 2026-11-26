import { formatReviewStamp } from '@convex/_lib/milestoneReview';
import type { MilestoneRoadmapView, RoadmapChild } from '@convex/_lib/milestones';
import { isOpenTask } from '@convex/_lib/milestoneTaskSet';

/**
 * The one next step at Ready to Ship. Figma NextStepCard 1141:42728.
 * review: Peter has not decided yet, so the review card's Approve is the step.
 * blocked: approved, but open tasks stop Shipped. Each is listed.
 * clear: approved and nothing open. Mark shipped is the step.
 * shipped: the record of approval and ship.
 * none: any other status, or a client view.
 */
export type NextStepKind = 'review' | 'blocked' | 'clear' | 'shipped' | 'none';

export type BlockingTask = Pick<RoadmapChild, 'id' | 'name' | 'status' | 'stage'> & {
  /** A subtask. It moves with its parent, so it gets Open and Park only. */
  nested: boolean;
};

export type NextStep = {
  kind: NextStepKind;
  blocking: BlockingTask[];
};

type StepInput = Pick<MilestoneRoadmapView, 'status' | 'approval' | 'rows'>;

/** Open work on the milestone, in list order: not Done, not Parked, not archived. */
export function blockingTasks(rows: MilestoneRoadmapView['rows']): BlockingTask[] {
  const out: BlockingTask[] = [];
  for (const row of rows) {
    if (isOpenTask(row)) out.push({ id: row.id, name: row.name, status: row.status, stage: row.stage, nested: false });
    for (const child of row.children) {
      if (isOpenTask(child)) out.push({ id: child.id, name: child.name, status: child.status, stage: child.stage, nested: true });
    }
  }
  return out;
}

export function readyToShipNextStep(milestone: StepInput, staff: boolean): NextStep {
  if (!staff) return { kind: 'none', blocking: [] };
  if (milestone.status === 'Shipped') {
    return { kind: milestone.approval === 'approved' ? 'shipped' : 'none', blocking: [] };
  }
  if (milestone.status !== 'Ready to Ship') return { kind: 'none', blocking: [] };
  if (milestone.approval !== 'approved') return { kind: 'review', blocking: [] };
  const blocking = blockingTasks(milestone.rows);
  return { kind: blocking.length > 0 ? 'blocked' : 'clear', blocking };
}

function approver(name: string | null | undefined): string {
  return name?.trim() ? name.trim().split(/\s+/)[0] : 'Peter';
}

/** "Approved by Peter · Nov 17, 2026 · 12:04 PM ET". The time is left off when it is not stored. */
export function approvedByLine(input: { approverName: string | null; decidedAt?: number | null }): string {
  const who = `Approved by ${approver(input.approverName)}`;
  return input.decidedAt != null ? `${who} · ${formatReviewStamp(input.decidedAt)}` : who;
}

/** The tile's short form: "Approved by Peter · Nov 17". */
export function approvedByShort(input: { approverName: string | null; decidedAt?: number | null }): string {
  const who = `Approved by ${approver(input.approverName)}`;
  return input.decidedAt == null ? who : `${who} · ${shortDay(input.decidedAt)}`;
}

/** "Nov 17", in ET like the review stamp. */
export function shortDay(at: number): string {
  return new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/** Copy for the next-step card. One source for the card and its tests. */
export function nextStepCopy(step: NextStep, input: { doneCount: number; total: number; shippedAt?: number | null }) {
  const open = step.blocking.length;
  switch (step.kind) {
    case 'blocked':
      return {
        eyebrow: `NEXT STEP · ${open} OPEN ${plural(open, 'TASK BLOCKS', 'TASKS BLOCK')} SHIPPED`,
        title: `Finish or move ${open} ${plural(open, 'task', 'tasks')} to mark this shipped`,
        body: 'Shipped needs every task that is not Parked to be Done. Open a task, park it, or move it to another milestone.',
        footer: 'Mark shipped unlocks when this list is empty · staff and Peter',
      };
    case 'clear':
      return {
        eyebrow: 'NEXT STEP · READY TO MARK SHIPPED',
        title: 'Every task is done. Mark this milestone shipped.',
        body: `${input.doneCount} of ${input.total} tasks done · Parked tasks do not count`,
        footer: 'Shipped records delivery. Merge and deploy stay separate steps · staff and Peter',
      };
    case 'shipped':
      return {
        eyebrow: 'SHIPPED',
        title: input.shippedAt != null ? `Shipped · ${formatReviewStamp(input.shippedAt).replace(/ · .*$/, '')}` : 'Shipped',
        body: `${input.doneCount} of ${input.total} tasks done`,
        footer: 'Merged to main · deploys stay a separate manual step',
      };
    default:
      return null;
  }
}

/** The task count on the Tasks tab: every row the tab lists, subtasks included. */
export function tasksTabCount(rows: MilestoneRoadmapView['rows']): number {
  return rows.reduce((sum, row) => sum + 1 + row.children.length, 0);
}

/**
 * The details panel's Approval field, staff only, right under Status.
 * Approved names who and when. Ready to Ship without a decision waits for Peter.
 */
export function approvalField(input: {
  status: string;
  approval?: string | null;
  approverName: string | null;
  decidedAt?: number | null;
}): { value: string; note: string | null } | null {
  if (input.approval === 'approved') {
    return {
      value: `Approved by ${approver(input.approverName)}`,
      note: input.decidedAt != null ? formatReviewStamp(input.decidedAt) : null,
    };
  }
  if (input.approval === 'changes_requested') {
    return { value: 'Changes requested', note: input.decidedAt != null ? formatReviewStamp(input.decidedAt) : null };
  }
  if (input.status === 'Ready to Ship') return { value: 'Waiting for Peter', note: 'Review ready' };
  return null;
}
