import {
  buildRoadmap,
  clientMaySeeMilestone,
  type MilestoneReviewView,
  type MilestoneRoadmapView,
  type RoadmapTaskInput,
} from '@convex/_lib/milestones';
import { roadmapCounts } from '@convex/_lib/milestoneTaskSet';
import type { PortalTask } from '@/lib/data/view-models';
import { designGate } from '@convex/_lib/designGate';

/**
 * A milestone with new rows, its counts worked out by the same rule the
 * server uses. `canClose` is kept only on a staff view, which already has it.
 */
export function withRows(milestone: MilestoneRoadmapView, rows: MilestoneRoadmapView['rows']): MilestoneRoadmapView {
  const { canClose, ...counts } = roadmapCounts(rows);
  return { ...milestone, rows, ...counts, ...('canClose' in milestone ? { canClose } : {}) };
}

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
    // Staff-only in the built roadmap. A client fixture never receives these.
    origin: onLaunch ? (task.id === 't-doing' ? 'review' : 'brief') : null,
    round: task.id === 't-doing' ? 2 : null,
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
    .filter((task) => !task.milestoneId && !task.hidden)
    .map((task) => ({ id: task.id, name: task.name }));
  const milestones: MilestoneRoadmapView[] = [
    {
      id: LAUNCH_ID,
      name: 'Launch the homepage',
      objective: 'The homepage matches the approved frame and is ready to review.',
      goals: ['Hero matches the approved frame', 'Menu page stays one column'],
      status: 'Ready to Ship',
      approval: 'unreviewed',
      note: null,
      approverName: null,
      decidedAt: null,
      publishToWarehaus: true,
      createdAt: Date.UTC(2026, 9, 12),
      ownerContactId: 'ct-maya',
      ownerName: 'Maya Chen',
      dueDate: '2026-11-20',
      creatorName: 'Maya Chen',
      resources: [{ id: 'r-notes', title: 'Kickoff recap', url: 'https://example.com/recap', type: 'Meeting notes' }],
      openCount: launchRoad.openCount,
      doneCount: launchRoad.doneCount,
      ...(launchRoad.canClose != null ? { canClose: launchRoad.canClose } : {}),
      countIsDecision: false,
      rows: launchRoad.rows,
      ...(audience === 'staff'
        ? {
            attachableTasks: attachable,
            resourceChoices: [{ id: 'r-notes', title: 'Kickoff recap' }],
            createdVia: 'grok' as const,
          }
        : {}),
    },
    {
      id: DRAFT_ID,
      name: 'Billing export draft',
      objective: 'Invoices export without a second approval step.',
      goals: ['Export uses the published columns'],
      status: 'Planning',
      approval: 'unreviewed',
      note: null,
      approverName: null,
      decidedAt: null,
      publishToWarehaus: false,
      createdAt: Date.UTC(2026, 9, 20),
      resources: [],
      openCount: draftRoad.openCount,
      doneCount: draftRoad.doneCount,
      ...(draftRoad.canClose != null ? { canClose: draftRoad.canClose } : {}),
      countIsDecision: false,
      rows: draftRoad.rows,
      ...(audience === 'staff'
        ? { attachableTasks: attachable, resourceChoices: [], createdVia: 'portal' as const }
        : {}),
    },
  ];
  return milestones.filter((milestone) =>
    audience === 'staff'
      ? true
      : clientMaySeeMilestone({ publishToWarehaus: milestone.publishToWarehaus, project: projectGate }),
  );
}

const PREVIEW_REVIEW_AT = Date.parse('2026-11-03T15:00:00Z');

/** Fixture Peter tile: Ready to Ship with a review preview so Approve attaches under the stage. */
function readyTileReview(): MilestoneReviewView {
  return {
    iteration: 2,
    previewUrl: 'https://warehaus-portal-git-order-ahead-warehaus-collective.vercel.app',
    prNumber: 108,
    prTitle: 'Order-ahead landing page',
    branch: 'feat/order-ahead',
    commit: 'aacb3e7',
    builtAt: null,
    designCheck: 'pending',
    designCheckNote: null,
    previewBuild: null,
    previewBuildAttempt: null,
    previewBuildAt: null,
    previewDelete: null,
    previewDeleteAttempt: null,
    previewDeleteAt: null,
    deployFinishedAt: null,
    history: [],
  };
}

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

/** Every non-Parked task is Done, so the Shipped option unlocks. */
function withTasksDone(milestone: MilestoneRoadmapView): MilestoneRoadmapView {
  const mark = <T extends { stage?: string | null; status: string; isDone: boolean }>(task: T): T =>
    task.stage === 'Parked' ? task : { ...task, status: 'Done', isDone: true };
  const rows = milestone.rows.map((row) => ({
    ...mark(row),
    children: row.children.map((child) => mark(child)),
  }));
  return withRows(milestone, rows);
}

function withLongChip(milestone: MilestoneRoadmapView): MilestoneRoadmapView {
  const children = Array.from({ length: 9 }, (_, index) => previewChild(`long-sub-${index}`));
  const done = Array.from({ length: 12 }, (_, index) => ({ ...previewChild(`long-done-${index}`), isDone: true, children: [] }));
  const open = Array.from({ length: 126 }, (_, index) => ({ ...previewChild(`long-open-${index}`), children: [] }));
  const rows = [...done, { ...previewChild('long-parent'), name: 'Parent', children }, ...open];
  return withRows(milestone, rows);
}

const LOOP_TITLES = [
  'Design project overview',
  'Design milestone detail',
  'Approve responsive layout',
  'Build milestone overview',
  'Connect resource links',
  'Outline run feed copy',
];

function withLoopFixture(milestone: MilestoneRoadmapView, loop: string): MilestoneRoadmapView {
  const building = loop === 'building' || loop === 'cursor' || loop === 'blocked';
  const rows = loop === 'generating' || loop === 'empty' || loop === 'failed'
    ? []
    : LOOP_TITLES.map((name, index) => ({
        id: `loop-${index + 1}`,
        name,
        status: building && index < 3 ? 'Done' : building && index === 3 && loop === 'blocked' ? 'Blocked' : building && index === 3 ? 'In Progress' : 'To Do',
        isDone: building && index < 3,
        stage: null,
        resourceCount: 0,
        children: [],
        portalOwned: true,
        origin: 'planner' as const,
        ...(building && index < 3 ? { commit: ['4c1e9aa', '7d02b1f', '91ae3c0'][index] } : {}),
        ...(loop === 'blocked' && index === 3 ? { blockedReason: 'runner stopped responding' } : {}),
      }));
  return {
    ...withRows(milestone, rows),
    name: 'Client experience launch',
    status: building ? 'Building' : 'Planning',
    planning: loop === 'generating' ? 'running' : loop === 'failed' ? 'blocked' : undefined,
    ...(loop === 'failed' ? { planningBlockedReason: 'Couldn’t draft tasks' } : {}),
    branch: 'milestone/client-experience-launch',
    prUrl: 'https://github.com/warehauscollective/warehaus/pull/152',
  };
}

const GATE_TITLES: { name: string; kind?: 'design' }[] = [
  { name: 'Design the tile Status box', kind: 'design' },
  { name: 'Design the task Kind field', kind: 'design' },
  { name: 'Build the Status box' },
  { name: 'Build the Kind field' },
  { name: 'Hold build tasks in the runner claim' },
];

/**
 * `?gate=designs|waiting|build`: a visual milestone in Building, in each
 * phase of the design gate. Two design tasks, then three build tasks.
 */
function withDesignGateFixture(milestone: MilestoneRoadmapView, phase: string): MilestoneRoadmapView {
  const designsDone = phase !== 'designs';
  const approvedAt = phase === 'build' ? Date.parse('2026-11-26T15:00:00Z') : null;
  const rows = GATE_TITLES.map((task, index) => {
    const design = task.kind === 'design';
    const done = design ? designsDone || index === 0 : false;
    const doing = design ? !done : approvedAt != null && index === 2;
    return {
      id: `gate-${index + 1}`,
      name: task.name,
      status: done ? 'Done' : doing ? 'In Progress' : 'To Do',
      isDone: done,
      stage: null,
      resourceCount: 0,
      children: [],
      portalOwned: true,
      origin: 'planner' as const,
      ...(design ? { kind: 'design' as const } : {}),
    };
  });
  const gate = designGate(
    rows.map((row) => ({ kind: row.kind ?? null, status: row.status, isDone: row.isDone, stage: null })),
    approvedAt,
  );
  return {
    ...withRows(milestone, rows),
    name: 'Design gate and task kinds',
    status: 'Building',
    ...(approvedAt != null ? { designApprovedAt: approvedAt } : { designApprovedAt: undefined }),
    designGate: { visual: gate.visual, buildLocked: gate.buildLocked, phase: gate.phase },
    branch: 'milestone/design-gate-and-task-kinds',
  };
}

function previewMilestone(
  patch: Pick<MilestoneRoadmapView, 'id' | 'name' | 'objective' | 'status' | 'approval'> &
    Partial<Pick<MilestoneRoadmapView, 'decidedAt' | 'resources' | 'note' | 'approverName' | 'buildRun' | 'rows'>>,
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
 * `?tiles=states` adds an in-progress tile, a reviewed tile, an approved tile awaiting merge, and a tile whose status is Shipped.
 * `?tiles=building` adds four Building tiles, one per Building indicator state: live, Queued, Blocked and Stalled.
 * `?gate=designs|waiting|build` turns the first tile into a visual milestone in each Building phase.
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
  if (params.get('close') === 'ready') {
    next = next.map((milestone, index) => (index === 0 ? withTasksDone(milestone) : milestone));
  }
  if (params.get('tiles') === 'nofigma') {
    return next.map((milestone, index) => (
      index === 0
        ? { ...milestone, localPreviewUrl: 'http://localhost:3201', figmaUrl: null }
        : milestone
    ));
  }
  if (params.get('tiles') === 'links' || params.get('tiles') === 'ready') {
    const ready = params.get('tiles') === 'ready';
    return next.map((milestone, index) => {
      if (index !== 0) return { ...milestone, localPreviewUrl: null, figmaUrl: null };
      return {
        ...milestone,
        localPreviewUrl: 'http://localhost:3200',
        figmaUrl: 'https://www.figma.com/design/TS3DcaCgrIdYf0jhvnMy3k/Portal',
        ...(ready ? { review: readyTileReview() } : {}),
      };
    });
  }
  const gatePhase = params.get('gate');
  if (gatePhase && next[0]) next = [withDesignGateFixture(next[0], gatePhase), ...next.slice(1)];
  const loop = params.get('loop');
  if (loop && next[0]) next = [withLoopFixture(next[0], loop), ...next.slice(1)];
  if (params.get('shipped') === '1' && !next.some((milestone) => milestone.id === 'm-preview-shipped')) {
    next = [
      ...next,
      previewMilestone({
        id: 'm-preview-shipped',
        name: 'Design system foundation',
        objective: 'Core components, tokens and responsive layouts.',
        status: 'Shipped',
        approval: 'approved',
        decidedAt: PREVIEW_REVIEW_AT,
        approverName: 'Northwind',
        resources: [
          { id: 'r-ds', title: 'Tokens', url: null },
          { id: 'r-ds-2', title: 'Components', url: null },
        ],
      }),
    ];
  }
  if (params.get('tiles') === 'building') {
    const now = Date.now();
    const building = (id: string, name: string, buildRun: NonNullable<MilestoneRoadmapView['buildRun']>) =>
      previewMilestone({ id, name, objective: `${name} is Building.`, status: 'Building', approval: 'unreviewed', buildRun });
    return [
      building('m-preview-build-live', 'Live run', { running: true, aliveAt: now, blocked: false }),
      building('m-preview-build-queued', 'Queued run', { running: false, blocked: false }),
      building('m-preview-build-blocked', 'Blocked run', { running: false, blocked: true }),
      building('m-preview-build-stalled', 'Stalled run', { running: true, aliveAt: now - 6 * 60_000, blocked: false }),
      ...next,
    ];
  }
  if (params.get('tiles') !== 'states') return next;
  return [
    ...next,
    previewMilestone({
      id: 'm-preview-active',
      name: 'Case study',
      objective: 'The case study is in progress.',
      status: 'Building',
      approval: 'unreviewed',
    }),
    previewMilestone({
      id: 'm-preview-reviewed',
      name: 'Navigation pass',
      objective: 'The navigation notes were reviewed.',
      status: 'Building',
      approval: 'changes_requested',
      decidedAt: PREVIEW_REVIEW_AT,
      resources: [{ id: 'r-nav', title: 'Navigation notes', url: null }],
    }),
    previewMilestone({
      id: 'm-preview-approved',
      name: 'Approved, awaiting merge',
      objective: 'The brand system is approved.',
      // Approval keeps Ready to Ship. Shipped comes with the deploy, or with Mark complete.
      status: 'Ready to Ship',
      approval: 'approved',
      decidedAt: PREVIEW_REVIEW_AT,
      approverName: 'Northwind',
      note: 'Approved with the brand file.',
      resources: [
        { id: 'r-brand', title: 'Brand file', url: null },
        { id: 'r-brand-2', title: 'Logo sheet', url: null },
      ],
    }),
    previewMilestone({
      id: 'm-preview-shipped',
      name: 'Production launch',
      objective: 'The homepage is shipped.',
      status: 'Shipped',
      approval: 'approved',
      decidedAt: PREVIEW_REVIEW_AT,
      approverName: 'Northwind',
    }),
  ];
}
