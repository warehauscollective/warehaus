/**
 * The design gate (decisions 0016, 0020, 0024; ADR-0008). Every task has a
 * kind, Design or Build. A milestone with at least one design task is a
 * visual milestone: its build tasks stay locked until Peter approves the
 * designs. Building shows a phase derived here, never stored: Designs while a
 * design task is open, Waiting on design approval once they are all done,
 * then plain Build. Pure.
 */

import { taskState, type TaskSetRow } from './milestoneTaskSet';

export const TASK_KINDS = ['design', 'build'] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

/** Shown on cards, the task modal and the MCP. */
export const TASK_KIND_LABELS: Record<TaskKind, string> = { design: 'Design', build: 'Build' };

export function isTaskKind(value: unknown): value is TaskKind {
  return value === 'design' || value === 'build';
}

/** A task with no kind (every task written before the gate) is a build task. */
export function taskKind(task: { kind?: string | null }): TaskKind {
  return task.kind === 'design' ? 'design' : 'build';
}

/** Accepts the stored values and the labels, any case. Null when it is neither. */
export function parseTaskKind(value: unknown): TaskKind | null {
  if (typeof value !== 'string') return null;
  const lower = value.trim().toLowerCase();
  return isTaskKind(lower) ? lower : null;
}

export const TASK_KIND_INVALID = 'Kind is Design or Build.';
export const TASK_KIND_NEEDS_MILESTONE = 'Only a milestone task has a kind.';

export type BuildingPhase = 'designs' | 'design-approval' | 'build';

/** Shown after "Building ·". Plain Build has none. */
export const BUILDING_PHASE_SUFFIX: Record<BuildingPhase, string | null> = {
  designs: 'Designs',
  'design-approval': 'Waiting on design approval',
  build: null,
};

export type GateRow = Pick<TaskSetRow, 'stage' | 'status' | 'isDone' | 'archived' | 'parentTaskId'> & {
  kind?: string | null;
};

/** Top level, not archived, not Parked. Subtasks follow their parent's kind. */
function counted(rows: readonly GateRow[]): GateRow[] {
  return rows.filter((task) => task.archived !== true && !task.parentTaskId && taskState(task) !== 'parked');
}

/** A milestone with at least one design task. */
export function isVisualMilestone(rows: readonly GateRow[]): boolean {
  return counted(rows).some((task) => taskKind(task) === 'design');
}

/** A milestone's type on the project page: design tasks only, build tasks only, or both. */
export type MilestoneWorkType = 'design' | 'build' | 'both';

/**
 * The type from the counted tasks, by the gate's own rule: top level, not
 * archived, not Parked, and a task with no kind is build. Null when no task
 * counts, so a milestone with no work yet has no type.
 */
export function milestoneWorkType(rows: readonly GateRow[]): MilestoneWorkType | null {
  const kinds = new Set(counted(rows).map(taskKind));
  if (kinds.size === 0) return null;
  return kinds.size === 2 ? 'both' : kinds.has('design') ? 'design' : 'build';
}

export type DesignGate = {
  visual: boolean;
  approved: boolean;
  /** Build tasks wait: a visual milestone whose designs Peter has not approved. */
  buildLocked: boolean;
  phase: BuildingPhase;
  openDesign: number;
  openBuild: number;
  doneDesign: number;
};

export function designGate(rows: readonly GateRow[], designApprovedAt: number | null | undefined): DesignGate {
  const tasks = counted(rows);
  const visual = tasks.some((task) => taskKind(task) === 'design');
  const approved = designApprovedAt != null;
  const open = tasks.filter((task) => taskState(task) === 'open');
  const openDesign = open.filter((task) => taskKind(task) === 'design').length;
  const openBuild = open.length - openDesign;
  const doneDesign = tasks.filter((task) => taskKind(task) === 'design' && taskState(task) === 'done').length;
  const buildLocked = visual && !approved;
  // An open design task means designs are still being made, even after an
  // approval (a late design change). Otherwise a locked milestone waits on Peter.
  const phase: BuildingPhase = !visual ? 'build' : openDesign > 0 ? 'designs' : approved ? 'build' : 'design-approval';
  return { visual, approved, buildLocked, phase, openDesign, openBuild, doneDesign };
}

/**
 * Whether the Approve designs Ask should be open: every design task is done,
 * the designs are not approved, and build work still waits on them. A
 * milestone with no build task left goes to Ready to Ship instead.
 */
export function designAskDue(gate: DesignGate): boolean {
  return gate.buildLocked && gate.openDesign === 0 && gate.openBuild > 0;
}

/** Whether a runner may take this task now. */
export function claimableUnderGate(task: { kind?: string | null }, gate: Pick<DesignGate, 'buildLocked'>): boolean {
  return !gate.buildLocked || taskKind(task) === 'design';
}

export const DESIGN_ASK_PREFIX = 'Approve designs:';

export function designAskBody(input: { milestoneName: string; designDone: number }): string {
  const tasks = input.designDone === 1 ? '1 design task is' : `${input.designDone} design tasks are`;
  return `${DESIGN_ASK_PREFIX} ${tasks} done on "${input.milestoneName}". Approve the designs in the Portal to unlock build, or request design changes.`;
}

export const LOCKED_LINE = 'Waits for design approval';
