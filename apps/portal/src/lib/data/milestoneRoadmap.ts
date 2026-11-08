import {
  buildRoadmap,
  clientMaySeeMilestone,
  type MilestoneRoadmapView,
  type RoadmapTaskInput,
} from '@convex/_lib/milestones';
import type { PortalTask } from '@/lib/data/view-models';

const LAUNCH_ID = 'm-launch';
const DRAFT_ID = 'm-draft';

function gate(project: { name: string; publishToWarehaus?: boolean; internal?: boolean }) {
  return {
    name: project.name,
    types: project.internal ? ['Internal'] : [],
    publishToWarehaus: project.publishToWarehaus !== false,
    archive: false,
    hidden: false,
    orgVisible: true,
  };
}

function toInput(task: PortalTask): RoadmapTaskInput {
  const onLaunch = task.id === 't-doing' || task.id === 't-done';
  return {
    id: task.id,
    name: task.name,
    status: task.status,
    isDone: task.isDone,
    stage: task.stage ?? null,
    pullRequestUrl:
      task.id === 't-doing'
        ? 'https://github.com/warehauscollective/warehaus/pull/83'
        : (task.pullRequestUrl ?? null),
    parentTaskId: task.parentTaskId ?? null,
    milestoneId: onLaunch ? LAUNCH_ID : null,
    milestoneOrder: task.id === 't-done' ? 0 : task.id === 't-doing' ? 1 : null,
    resourceCount: task.resourceCount ?? 0,
    publishToWarehaus: task.publishToWarehaus !== false,
    hidden: task.syncHidden === true,
  };
}

/**
 * Fixture review surface for the Northwind site.
 * The draft milestone is unpublished, so a client never receives it.
 */
export function fixtureMilestones(
  project: { id: string; name: string; publishToWarehaus?: boolean; internal?: boolean },
  tasks: readonly PortalTask[],
  audience: 'staff' | 'client',
): MilestoneRoadmapView[] {
  if (project.id !== 'p-site') return [];
  const projectGate = gate(project);
  const inputs = tasks.filter((task) => task.projectId === project.id).map(toInput);
  const launchRoad = buildRoadmap({
    audience,
    milestoneId: LAUNCH_ID,
    tasks: inputs,
    projectVisibleToClient: true,
  });
  const draftRoad = buildRoadmap({
    audience,
    milestoneId: DRAFT_ID,
    tasks: inputs,
    projectVisibleToClient: true,
  });
  const attachable = inputs
    .filter((task) => !task.parentTaskId && !task.milestoneId && !task.hidden)
    .map((task) => ({ id: task.id, name: task.name }));
  const milestones: MilestoneRoadmapView[] = [
    {
      id: LAUNCH_ID,
      name: 'Launch the homepage',
      objective: 'The homepage matches the approved frame and is ready to review.',
      goals: ['Hero matches the approved frame', 'Menu page stays one column'],
      workStatus: 'ready',
      approval: 'unreviewed',
      note: null,
      approverName: null,
      decidedAt: null,
      publishToWarehaus: true,
      resources: [{ id: 'r-notes', title: 'Kickoff recap', url: 'https://example.com/recap' }],
      openCount: launchRoad.openCount,
      doneCount: launchRoad.doneCount,
      countIsDecision: false,
      rows: launchRoad.rows,
      ...(audience === 'staff'
        ? {
            attachableTasks: attachable,
            resourceChoices: [{ id: 'r-notes', title: 'Kickoff recap' }],
          }
        : {}),
    },
    {
      id: DRAFT_ID,
      name: 'Billing export draft',
      objective: 'Invoices export without a second approval step.',
      goals: ['Export uses the published columns'],
      workStatus: 'draft',
      approval: 'unreviewed',
      note: null,
      approverName: null,
      decidedAt: null,
      publishToWarehaus: false,
      resources: [],
      openCount: draftRoad.openCount,
      doneCount: draftRoad.doneCount,
      countIsDecision: false,
      rows: draftRoad.rows,
      ...(audience === 'staff' ? { attachableTasks: attachable, resourceChoices: [] } : {}),
    },
  ];
  return milestones.filter((milestone) =>
    audience === 'staff'
      ? true
      : clientMaySeeMilestone({ publishToWarehaus: milestone.publishToWarehaus, project: projectGate }),
  );
}
