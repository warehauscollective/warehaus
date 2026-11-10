/**
 * Plan for the one-time Milestone One backfill.
 * A project with top-level tasks and no milestone gets one milestone
 * named exactly "Milestone One". Tasks that already have a milestone stay put.
 * Subtasks stay on their parent. The existing attach rule only accepts a top-level task.
 */

export const MILESTONE_ONE_NAME = 'Milestone One';

/** Required by milestone create. This does not generate tasks. */
export const MILESTONE_ONE_OBJECTIVE = 'Tasks already on this project.';

export type MilestoneOneTask = {
  id: string;
  projectId: string;
  parentTaskId: string | null;
  milestoneId: string | null;
};

export type MilestoneOneMilestone = {
  id: string;
  projectId: string;
  name: string;
  createdAt: number;
};

export type MilestoneOneProject = {
  id: string;
  name: string;
};

export type MilestoneOneAction = 'create' | 'reuse' | 'skip';

export type MilestoneOneProjectPlan = {
  projectId: string;
  projectName: string;
  taskCount: number;
  attachedCount: number;
  unassignedCount: number;
  nestedCount: number;
  action: MilestoneOneAction;
  milestoneId: string | null;
  taskIds: string[];
};

export type MilestoneOneCounts = {
  projects: number;
  projectsWithTasks: number;
  leftAlone: number;
  creates: number;
  reuses: number;
  attaches: number;
  alreadyAttached: number;
  nested: number;
  orphans: number;
};

function hasMilestone(milestoneId: string | null | undefined): boolean {
  return milestoneId != null && milestoneId !== '';
}

export function planMilestoneOne(input: {
  projects: readonly MilestoneOneProject[];
  milestones: readonly MilestoneOneMilestone[];
  tasks: readonly MilestoneOneTask[];
}): { projects: MilestoneOneProjectPlan[]; orphans: number } {
  const projectIds = new Set(input.projects.map((project) => project.id));
  let orphans = 0;
  const tasksByProject = new Map<string, MilestoneOneTask[]>();
  for (const task of input.tasks) {
    if (!projectIds.has(task.projectId)) {
      orphans += 1;
      continue;
    }
    const rows = tasksByProject.get(task.projectId) ?? [];
    rows.push(task);
    tasksByProject.set(task.projectId, rows);
  }

  const namedByProject = new Map<string, MilestoneOneMilestone[]>();
  for (const milestone of input.milestones) {
    if (milestone.name !== MILESTONE_ONE_NAME) continue;
    if (!projectIds.has(milestone.projectId)) continue;
    const rows = namedByProject.get(milestone.projectId) ?? [];
    rows.push(milestone);
    namedByProject.set(milestone.projectId, rows);
  }

  const projects = [...input.projects]
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .map((project) => {
      const rows = tasksByProject.get(project.id) ?? [];
      const nested = rows.filter((task) => task.parentTaskId);
      const top = rows.filter((task) => !task.parentTaskId);
      const attached = top.filter((task) => hasMilestone(task.milestoneId));
      const unassigned = top
        .filter((task) => !hasMilestone(task.milestoneId))
        .sort((a, b) => a.id.localeCompare(b.id));
      const existing = (namedByProject.get(project.id) ?? [])
        .slice()
        .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))[0] ?? null;
      const action: MilestoneOneAction = unassigned.length === 0 ? 'skip' : existing ? 'reuse' : 'create';
      return {
        projectId: project.id,
        projectName: project.name,
        taskCount: rows.length,
        attachedCount: attached.length,
        unassignedCount: unassigned.length,
        nestedCount: nested.length,
        action,
        milestoneId: action === 'reuse' ? existing.id : null,
        taskIds: action === 'skip' ? [] : unassigned.map((task) => task.id),
      };
    });

  return { projects, orphans };
}

export function summarizeMilestoneOne(
  projects: readonly MilestoneOneProjectPlan[],
  orphans: number,
): MilestoneOneCounts {
  return {
    projects: projects.length,
    projectsWithTasks: projects.filter((project) => project.taskCount > 0).length,
    leftAlone: projects.filter((project) => project.action === 'skip').length,
    creates: projects.filter((project) => project.action === 'create').length,
    reuses: projects.filter((project) => project.action === 'reuse').length,
    attaches: projects.reduce((sum, project) => sum + project.taskIds.length, 0),
    alreadyAttached: projects.reduce((sum, project) => sum + project.attachedCount, 0),
    nested: projects.reduce((sum, project) => sum + project.nestedCount, 0),
    orphans,
  };
}
