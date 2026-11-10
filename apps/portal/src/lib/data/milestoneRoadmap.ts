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

const PREVIEW_REVIEW_AT = Date.parse('2026-11-03T15:00:00Z');

function previewChild(id: string) {
  return {
    id,
    name: `Subtask ${id}`,
    status: 'To Do',
    isDone: false,
    stage: null,
    resourceCount: 0,
  };
}

function withLongChip(milestone: MilestoneRoadmapView): MilestoneRoadmapView {
  const children = Array.from({ length: 9 }, (_, index) => previewChild(`long-sub-${index}`));
  const done = Array.from({ length: 12 }, (_, index) => ({ ...previewChild(`long-done-${index}`), isDone: true, children: [] }));
  const open = Array.from({ length: 126 }, (_, index) => ({ ...previewChild(`long-open-${index}`), children: [] }));
  const rows = [...done, { ...previewChild('long-parent'), name: 'Parent', children }, ...open];
  const flat = rows.flatMap((row) => [row, ...row.children]);
  return {
    ...milestone,
    rows,
    doneCount: flat.filter((row) => row.isDone).length,
    openCount: flat.filter((row) => !row.isDone).length,
  };
}

function previewMilestone(
  patch: Pick<MilestoneRoadmapView, 'id' | 'name' | 'objective' | 'workStatus' | 'approval'> &
    Partial<Pick<MilestoneRoadmapView, 'decidedAt' | 'resources' | 'note' | 'approverName'>>,
): MilestoneRoadmapView {
  return {
    goals: [],
    note: null,
    approverName: null,
    decidedAt: null,
    publishToWarehaus: true,
    resources: [],
    openCount: 1,
    doneCount: 0,
    countIsDecision: false,
    rows: [],
    ...patch,
  };
}

/**
 * Fixture-only list previews. `?chip=long` stretches the first chip.
 * `?tiles=states` adds an in-progress tile, a reviewed tile, and a shipped tile.
 * An empty search leaves the list alone.
 */
export function applyFixtureMilestonePreview(
  milestones: readonly MilestoneRoadmapView[],
  search: string,
): MilestoneRoadmapView[] {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  let next = [...milestones];
  if (params.get('chip') === 'long' && next[0]) {
    const first = next[0];
    next = [withLongChip(first), ...next.slice(1)];
  }
  if (params.get('tiles') !== 'states') return next;
  return [
    ...next,
    previewMilestone({
      id: 'm-preview-active',
      name: 'Case study',
      objective: 'The case study is in progress.',
      workStatus: 'active',
      approval: 'unreviewed',
    }),
    previewMilestone({
      id: 'm-preview-reviewed',
      name: 'Navigation pass',
      objective: 'The navigation notes were reviewed.',
      workStatus: 'active',
      approval: 'changes_requested',
      decidedAt: PREVIEW_REVIEW_AT,
      resources: [{ id: 'r-nav', title: 'Navigation notes', url: null }],
    }),
    previewMilestone({
      id: 'm-preview-shipped',
      name: 'Brand system',
      objective: 'The brand system is approved.',
      workStatus: 'active',
      approval: 'approved',
      decidedAt: PREVIEW_REVIEW_AT,
      approverName: 'Northwind',
      note: 'Approved with the brand file.',
      resources: [
        { id: 'r-brand', title: 'Brand file', url: null },
        { id: 'r-brand-2', title: 'Logo sheet', url: null },
      ],
    }),
  ];
}
