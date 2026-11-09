'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import type { MilestoneRoadmapView, RoadmapChild } from '@convex/_lib/milestones';
import { NavBreadcrumb } from '@/components/nav/NavBreadcrumb';
import { OutlineButton, PrimaryButton } from '@/components/ui/primitives';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { fixtureMilestones } from '@/lib/data/milestoneRoadmap';
import { formatPortalDate, type PortalTask } from '@/lib/data/view-models';
import {
  FieldLabel,
  FieldValue,
  GhostButton,
  MenuActionError,
  MilestoneDialog,
  MissingMilestoneApi,
  PageHeading,
  Panel,
  StatusChip,
  StateCard,
  TabRow,
  fieldStyle,
} from './milestoneChrome';
import {
  ACTIVITY_MILESTONE_ID_GAP,
  boardCountsFromTasks,
  clientMilestoneEmptyKind,
  goalKey,
  MENU_ERROR_ID,
  milestoneQueryAvailability,
  milestoneResourceChoices,
  milestonesAfterQuery,
  reviewStamp,
  tasksMenuFailure,
  storedMilestoneReview,
  tabIds,
} from './milestoneGuards';

const WORK_LABEL = { draft: 'Draft', active: 'In progress', ready: 'Ready for review' } as const;
const APPROVAL_LABEL = {
  unreviewed: 'Unreviewed',
  approved: 'Approved',
  changes_requested: 'Changes requested',
} as const;

type RoadmapProject = {
  id: string;
  name: string;
  status?: string;
  endDate?: string | null;
  clientName?: string | null;
  liveUrl?: string | null;
  figmaLink?: string | null;
  docsUrl?: string | null;
  description?: string | null;
  publishToWarehaus?: boolean;
  internal?: boolean;
};

export type MilestoneActivityItem = {
  id: string;
  name: string;
  type: string;
  summary: string;
  timestamp: string;
  projectId: string | null;
};

type ResourceChoice = { id: string; title: string };

type FixturePatch = Partial<
  Pick<
    MilestoneRoadmapView,
    | 'name'
    | 'objective'
    | 'goals'
    | 'workStatus'
    | 'approval'
    | 'note'
    | 'approverName'
    | 'decidedAt'
    | 'publishToWarehaus'
    | 'resources'
  >
> & {
  attachedIds?: string[];
  detachedIds?: string[];
};

type ProjectTab = 'milestones' | 'resources' | 'activity' | 'details';
type MilestoneTab = 'overview' | 'tasks' | 'reviews' | 'activity';

function mergePatch(milestone: MilestoneRoadmapView, patch: FixturePatch | undefined): MilestoneRoadmapView {
  if (!patch) return milestone;
  const { attachedIds: _attached, detachedIds: _detached, ...fields } = patch;
  return { ...milestone, ...fields };
}

function applyFixtureTasks(
  milestone: MilestoneRoadmapView,
  tasks: readonly PortalTask[],
  patch: FixturePatch | undefined,
): MilestoneRoadmapView {
  const base = mergePatch(milestone, patch);
  const detached = new Set(patch?.detachedIds ?? []);
  const rows = base.rows.filter((row) => !detached.has(row.id));
  const present = new Set(rows.map((row) => row.id));
  const attached = (patch?.attachedIds ?? [])
    .filter((id) => !present.has(id) && !detached.has(id))
    .map((id) => tasks.find((task) => task.id === id))
    .filter((task): task is PortalTask => task != null)
    .map((task) => ({
      id: task.id,
      name: task.name,
      status: task.status,
      isDone: task.isDone,
      stage: task.stage ?? null,
      resourceCount: task.resourceCount ?? 0,
      children: [] as RoadmapChild[],
      ...(task.pullRequestUrl ? { pullRequestUrl: task.pullRequestUrl } : {}),
    }));
  const nextRows = [...rows, ...attached];
  const flat = nextRows.flatMap((row) => [row, ...row.children]);
  return {
    ...base,
    rows: nextRows,
    openCount: flat.filter((row) => !row.isDone).length,
    doneCount: flat.filter((row) => row.isDone).length,
  };
}

function formatWhen(at: number | null): string | null {
  if (at == null) return null;
  return new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function resourceLabel(count: number): string {
  return count === 1 ? '1 resource' : `${count} resources`;
}

function taskTotal(milestone: MilestoneRoadmapView): number {
  return milestone.openCount + milestone.doneCount;
}

/** Lane cards are parent tasks. Subtasks stay on the parent card, so they are not a lane. */
function boardTaskCounts(milestone: MilestoneRoadmapView): { lanes: number; laneDone: number; nested: number } {
  return {
    lanes: milestone.rows.length,
    laneDone: milestone.rows.filter((row) => row.isDone).length,
    nested: milestone.rows.reduce((sum, row) => sum + row.children.length, 0),
  };
}

function nestedCopy(nested: number): string {
  if (nested === 1) return '1 subtask stays on its parent card, not in its own lane.';
  return `${nested} subtasks stay on their parent cards, not in their own lanes.`;
}

/** Inclusive list and overview progress. Lane badges stay on the board. */
export function inclusiveProgressCopy(done: number, total: number, nested: number): string {
  const base = `${done} of ${total} complete`;
  if (nested === 1) return `${base} · includes 1 subtask`;
  if (nested > 1) return `${base} · includes ${nested} subtasks`;
  return base;
}

function milestoneTasks(tasks: readonly PortalTask[], milestone: MilestoneRoadmapView): PortalTask[] {
  const ids = new Set<string>();
  for (const row of milestone.rows) {
    ids.add(row.id);
    for (const child of row.children) ids.add(child.id);
  }
  return tasks.filter((task) => ids.has(task.id));
}

function createdStamp(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function ProjectRoadmap({
  project,
  tasks,
  staff,
  fixtures,
  live,
  hostSlug,
  clientName,
  activity = [],
  activityError = null,
  onBackToProjects,
  onOpenTask,
  resourceChoices = [],
  resourcesExtra,
  renderTasks,
  details,
}: {
  project: RoadmapProject;
  tasks: readonly PortalTask[];
  staff: boolean;
  fixtures: boolean;
  live: boolean;
  hostSlug?: string;
  clientName?: string | null;
  activity?: readonly MilestoneActivityItem[];
  activityError?: string | null;
  onBackToProjects?: () => void;
  onOpenTask?: (task: PortalTask) => void;
  resourceChoices?: ResourceChoice[];
  resourcesExtra?: ReactNode;
  renderTasks?: (tasks: PortalTask[]) => ReactNode;
  details?: ReactNode;
}) {
  const [patches, setPatches] = useState<Record<string, FixturePatch>>({});
  const [created, setCreated] = useState<MilestoneRoadmapView[]>([]);
  const [projectTab, setProjectTab] = useState<ProjectTab>('milestones');
  const [openMilestoneId, setOpenMilestoneId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const rememberedMilestones = useRef<MilestoneRoadmapView[]>([]);
  const projectId = project.id as Id<'projects'>;
  const staffQuery = useSafeQuery<MilestoneRoadmapView[]>(
    api.milestones.listForProject,
    live && staff ? { projectId, hostSlug } : 'skip',
  );
  const clientQuery = useSafeQuery<MilestoneRoadmapView[]>(
    api.milestones.listForClientProject,
    live && !staff ? { projectId, hostSlug } : 'skip',
  );
  const query = staff ? staffQuery : clientQuery;
  const fixtureRows = useMemo(
    () => (fixtures ? fixtureMilestones(project, tasks, staff ? 'staff' : 'client') : []),
    [fixtures, project, tasks, staff],
  );

  const milestoneApi = milestoneQueryAvailability({ fixtures, error: query.error });
  if (milestoneApi === 'fallback') {
    if (!onBackToProjects && !details) return null;
    return (
      <MissingMilestoneApi projectName={project.name} onBack={onBackToProjects}>
        {details}
      </MissingMilestoneApi>
    );
  }
  if (!fixtures && !live && !onBackToProjects) return null;

  if (!fixtures && query.data) rememberedMilestones.current = query.data;
  const milestones = fixtures
    ? [...fixtureRows, ...created].map((row) => applyFixtureTasks(row, tasks, patches[row.id]))
    : milestonesAfterQuery({
        data: query.data,
        error: query.error,
        loading: query.loading,
        previous: rememberedMilestones.current,
      });
  const selected = milestones.find((milestone) => milestone.id === openMilestoneId) ?? null;
  const approvedCount = milestones.filter((milestone) => milestone.approval === 'approved').length;
  const projectActivity = activity.filter((item) => item.projectId === project.id);
  const loading = !fixtures && (live ? query.loading : true) && milestones.length === 0;
  const failed = !fixtures && live && query.error != null;

  const patchMilestone = (id: string, patch: FixturePatch) => {
    setPatches((current) => {
      const prev = current[id] ?? {};
      return {
        ...current,
        [id]: {
          ...prev,
          ...patch,
          ...(patch.attachedIds
            ? { attachedIds: [...(prev.attachedIds ?? []), ...patch.attachedIds] }
            : {}),
          ...(patch.detachedIds
            ? { detachedIds: [...(prev.detachedIds ?? []), ...patch.detachedIds] }
            : {}),
        },
      };
    });
  };

  const page = Boolean(onBackToProjects);

  return (
    <section data-testid="project-roadmap" className="flex flex-col gap-6">
      {page ? (
        <NavBreadcrumb
          back="always"
          onBack={() => {
            if (selected) {
              setOpenMilestoneId(null);
              return;
            }
            onBackToProjects?.();
          }}
          parent={{ label: 'Projects', onClick: () => onBackToProjects?.() }}
          middle={selected ? { label: project.name, onClick: () => setOpenMilestoneId(null) } : undefined}
          current={selected ? selected.name : project.name}
        />
      ) : null}

      {selected ? (
        <MilestoneDetail
          milestone={selected}
          project={project}
          tasks={tasks}
          staff={staff}
          fixtures={fixtures}
          hostSlug={hostSlug}
          activityError={activityError}
          onOpenTask={onOpenTask}
          resourceChoices={resourceChoices}
          renderTasks={renderTasks}
          onBack={() => setOpenMilestoneId(null)}
          onFixture={(patch) => patchMilestone(selected.id, patch)}
        />
      ) : (
        <>
          <PageHeading
            title={project.name}
            subtitle="Project details · Every task belongs to a milestone"
            action={
              staff ? (
                <PrimaryButton onClick={() => setCreateOpen(true)}>New milestone</PrimaryButton>
              ) : null
            }
          />
          {page ? (
            <TabRow
              label="Project"
              idPrefix="project"
              active={projectTab}
              onChange={(id) => setProjectTab(id as ProjectTab)}
              tabs={[
                { id: 'milestones', label: 'Milestones' },
                { id: 'resources', label: 'Resources' },
                { id: 'activity', label: 'Activity' },
                { id: 'details', label: 'Project details' },
              ]}
            />
          ) : null}
          <div
            role={page ? 'tabpanel' : undefined}
            id={page ? tabIds('project', projectTab).panel : undefined}
            aria-labelledby={page ? tabIds('project', projectTab).tab : undefined}
          >
          {projectTab === 'resources' && page ? (
            <ProjectResources project={project} extra={resourcesExtra} />
          ) : null}
          {projectTab === 'activity' && page ? (
            <ActivityList items={projectActivity} empty="No activity on this project yet." error={activityError} />
          ) : null}
          {projectTab === 'details' && page ? details : null}

          {projectTab === 'milestones' || !page ? (
            <>
              <Panel>
                <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
                  <div className="hidden md:block">
                    <FieldLabel>CLIENT</FieldLabel>
                    <FieldValue>{clientName || project.clientName || '—'}</FieldValue>
                  </div>
                  <div className="hidden md:block">
                    <FieldLabel>PROJECT STATUS</FieldLabel>
                    <FieldValue>{project.status || '—'}</FieldValue>
                  </div>
                  <div>
                    <FieldLabel>MILESTONES</FieldLabel>
                    <FieldValue>
                      {milestones.length === 0 ? 'None yet' : `${approvedCount} of ${milestones.length} approved`}
                    </FieldValue>
                  </div>
                  <div>
                    <FieldLabel>NEXT DUE</FieldLabel>
                    <FieldValue>{formatPortalDate(project.endDate)}</FieldValue>
                  </div>
                </div>
              </Panel>

              {loading ? (
                <p style={{ fontSize: 14, color: 'var(--muted)' }}>Loading milestones</p>
              ) : null}
              {failed ? (
                <p data-testid="milestone-query-error" style={{ fontSize: 14, color: 'var(--danger)' }}>
                  {milestones.length > 0
                    ? 'Milestones could not refresh. Showing the last list that loaded.'
                    : 'The milestones could not load.'}
                </p>
              ) : null}

              {!loading && !failed && milestones.length === 0 ? (
                staff ? (
                  <StateCard
                    testId="milestone-empty"
                    kicker="PROJECT · NO MILESTONES"
                    title="Start with a milestone"
                    body="Describe an outcome, attach resources, and let its tasks show the work needed to finish it."
                    action={<PrimaryButton onClick={() => setCreateOpen(true)}>New milestone</PrimaryButton>}
                  />
                ) : clientMilestoneEmptyKind(project) === 'unavailable' ? (
                  <StateCard
                    testId="milestone-unavailable"
                    kicker="CLIENT · NO ACCESS"
                    title="This milestone isn’t available"
                    body="You may not have access, or it may no longer be shared. Internal titles and resources stay hidden."
                    action={
                      onBackToProjects ? (
                        <PrimaryButton onClick={onBackToProjects}>Back to projects</PrimaryButton>
                      ) : null
                    }
                  />
                ) : (
                  <StateCard
                    testId="milestone-none-shared"
                    kicker="MILESTONES"
                    title="No milestones shared yet"
                    body="This project is available to you. Nothing on it has been shared as a milestone."
                  />
                )
              ) : null}

              <div className="flex flex-col gap-4">
                {milestones.map((milestone) => (
                  <MilestoneListCard
                    key={milestone.id}
                    milestone={milestone}
                    staff={staff}
                    onOpen={() => setOpenMilestoneId(milestone.id)}
                  />
                ))}
              </div>

              {milestones.length > 0 ? (
                <p style={{ fontSize: 13, lineHeight: '20px', color: 'var(--muted)' }}>
                  {staff
                    ? 'Create milestones here. Open a milestone to see its tasks. The open count is not the decision.'
                    : 'The open count is not the decision. Approving a milestone does not close its tasks.'}
                </p>
              ) : null}
            </>
          ) : null}
          </div>
        </>
      )}

      {createOpen && staff ? (
        <CreateMilestone
          projectId={projectId}
          fixtures={fixtures}
          hostSlug={hostSlug}
          resourceChoices={resourceChoices}
          onClose={() => setCreateOpen(false)}
          onFixture={(milestone) => {
            setCreated((current) => [...current, milestone]);
            setOpenMilestoneId(milestone.id);
          }}
        />
      ) : null}
    </section>
  );
}

function MilestoneListCard({
  milestone,
  staff,
  onOpen,
}: {
  milestone: MilestoneRoadmapView;
  staff: boolean;
  onOpen: () => void;
}) {
  const total = taskTotal(milestone);
  const progress = boardTaskCounts(milestone);
  const meta =
    milestone.approval === 'approved' && milestone.decidedAt
      ? `Approved ${formatWhen(milestone.decidedAt)}`
      : milestone.approval === 'changes_requested'
        ? APPROVAL_LABEL.changes_requested
        : null;
  return (
    <article
      data-testid={`milestone-${milestone.id}`}
      className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--panel-radius, 12px)',
        padding: 24,
      }}
    >
      <div className="flex items-center justify-between gap-3 md:hidden">
        <StatusChip label={WORK_LABEL[milestone.workStatus]} />
        {meta ? <p style={{ fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>{meta}</p> : null}
      </div>
      <div className="min-w-0 flex-1">
        <h2 data-testid="milestone-name" style={{ fontSize: 20, lineHeight: '30px', fontWeight: 500 }}>
          {milestone.name}
        </h2>
        <p data-testid="milestone-objective" style={{ marginTop: 12, fontSize: 14, lineHeight: '21px', color: 'var(--muted)' }}>
          {milestone.objective}
        </p>
        <div className="mt-3 flex flex-col items-start gap-2 md:flex-row md:flex-wrap md:items-center md:gap-4">
          <span
            className="ds-mono"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '4px 12px',
              fontSize: 11,
              lineHeight: '17px',
              color: 'var(--muted)',
            }}
          >
            {inclusiveProgressCopy(milestone.doneCount, total, progress.nested)}
          </span>
          <span style={{ fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>
            {resourceLabel(milestone.resources.length)} · {reviewStamp(milestone.decidedAt)}
          </span>
          {staff && !milestone.publishToWarehaus ? (
            <span data-testid="milestone-publish" style={{ fontSize: 12, color: 'var(--muted)' }}>
              Not published
            </span>
          ) : null}
        </div>
      </div>
      <div className="hidden flex-col items-start gap-3 md:flex md:w-[174px] md:items-stretch">
        <StatusChip label={WORK_LABEL[milestone.workStatus]} />
        {meta ? <p style={{ fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>{meta}</p> : null}
        <OutlineButton onClick={onOpen}>Open milestone</OutlineButton>
      </div>
      <div className="md:hidden">
        <OutlineButton onClick={onOpen}>Open milestone</OutlineButton>
      </div>
    </article>
  );
}

function MilestoneDetail({
  milestone,
  project,
  tasks,
  staff,
  fixtures,
  hostSlug,
  activityError = null,
  onOpenTask,
  resourceChoices,
  renderTasks,
  onBack,
  onFixture,
}: {
  milestone: MilestoneRoadmapView;
  project: RoadmapProject;
  tasks: readonly PortalTask[];
  staff: boolean;
  fixtures: boolean;
  hostSlug?: string;
  activityError?: string | null;
  onOpenTask?: (task: PortalTask) => void;
  resourceChoices: ResourceChoice[];
  renderTasks?: (tasks: PortalTask[]) => ReactNode;
  onBack: () => void;
  onFixture: (patch: FixturePatch) => void;
}) {
  const decide = useMutation(api.milestones.decide);
  const decideAsClient = useMutation(api.milestones.decideAsClient);
  const save = useMutation(api.milestones.save);
  const setWorkStatus = useMutation(api.milestones.setWorkStatus);
  const setPublish = useMutation(api.milestones.setPublish);
  const attachTask = useMutation(api.milestones.attachTask);
  const detachTask = useMutation(api.milestones.detachTask);
  const [tab, setTab] = useState<MilestoneTab>('overview');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [more, setMore] = useState(false);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteAttempt, setNoteAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = milestone.approval === 'approved';
  const total = taskTotal(milestone);
  const recordBoard = boardTaskCounts(milestone);
  const shownTasks = milestoneTasks(tasks, milestone);
  const board = boardCountsFromTasks(shownTasks);
  const storedReview = storedMilestoneReview(milestone);
  const reviewCount = storedReview ? 1 : 0;
  const choices = milestoneResourceChoices(
    resourceChoices,
    milestone.resources.map((resource) => ({ id: resource.id, title: resource.title })),
  );
  const taken = new Set(milestone.rows.map((row) => row.id));
  const attachable = (milestone.attachableTasks ?? []).filter((task) => !taken.has(task.id));

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the milestone.');
    } finally {
      setBusy(false);
    }
  };

  const onDecide = (decision: 'approved' | 'changes_requested') => {
    const trimmed = note.trim();
    if (!trimmed) {
      setNoteError('A note is required.');
      setNoteAttempt((current) => current + 1);
      return;
    }
    setNoteError(null);
    if (fixtures) {
      onFixture({
        approval: decision,
        note: trimmed,
        approverName: 'You',
        decidedAt: Date.now(),
        ...(decision === 'changes_requested' ? { workStatus: 'active' } : {}),
      });
      setNote('');
      setReviewOpen(false);
      setTab('reviews');
      return;
    }
    const payload = {
      hostSlug,
      milestoneId: milestone.id as Id<'milestones'>,
      decision,
      note: trimmed,
    };
    void run(async () => {
      if (staff) await decide(payload);
      else await decideAsClient(payload);
      setNote('');
      setReviewOpen(false);
      setTab('reviews');
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        testId="milestone-name"
        title={milestone.name}
        subtitle={`Milestone · ${inclusiveProgressCopy(milestone.doneCount, total, recordBoard.nested)}`}
        action={<PrimaryButton onClick={() => { setError(null); setReviewOpen(true); }}>Review milestone</PrimaryButton>}
      />
      <TabRow
        label="Milestone"
        idPrefix="milestone"
        active={tab}
        onChange={(id) => setTab(id as MilestoneTab)}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'tasks', label: `Tasks · ${board.lanes}` },
          { id: 'reviews', label: `Reviews · ${reviewCount}` },
          { id: 'activity', label: 'Activity' },
        ]}
      />
      <div role="tabpanel" id={tabIds('milestone', tab).panel} aria-labelledby={tabIds('milestone', tab).tab}>

      {tab === 'overview' ? (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="order-first w-full lg:order-last lg:w-[292px] lg:shrink-0">
            <Panel>
              <div className="grid grid-cols-2 gap-5 lg:grid-cols-1">
                <p className="ds-mono col-span-2 lg:col-span-1" style={{ fontSize: 11, letterSpacing: '0.08em', color: 'var(--muted)' }}>
                  DETAILS
                </p>
                <div>
                  <FieldLabel>STATUS</FieldLabel>
                  <FieldValue>
                    <span data-testid="milestone-work-status">{WORK_LABEL[milestone.workStatus]}</span>
                  </FieldValue>
                </div>
                <div>
                  <FieldLabel>APPROVAL</FieldLabel>
                  <FieldValue>
                    <span data-testid="milestone-approval">{APPROVAL_LABEL[milestone.approval]}</span>
                  </FieldValue>
                </div>
                {staff ? (
                  <div className="col-span-2 lg:col-span-1">
                    <FieldLabel>VISIBILITY</FieldLabel>
                    <FieldValue>
                      <span data-testid="milestone-publish">
                        {milestone.publishToWarehaus ? 'Shared with client' : 'Not published'}
                      </span>
                    </FieldValue>
                  </div>
                ) : null}
                <div className="col-span-2 lg:col-span-1">
                  <FieldLabel>PROJECT</FieldLabel>
                  <FieldValue>{project.name}</FieldValue>
                </div>
                {milestone.approverName ? (
                  <div className="col-span-2 lg:col-span-1">
                    <FieldLabel>LAST REVIEW</FieldLabel>
                    <FieldValue>{milestone.approverName}</FieldValue>
                  </div>
                ) : null}
              </div>
            </Panel>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-6">
            <Panel>
              <h2 style={{ fontSize: 30, lineHeight: '30px', fontWeight: 500 }}>What we’re delivering</h2>
              <p data-testid="milestone-objective" style={{ marginTop: 16, fontSize: 15, lineHeight: '23px' }}>{milestone.objective}</p>
              <p className="ds-mono" style={{ marginTop: 16, fontSize: 10, lineHeight: '15px', color: 'var(--muted)' }}>
                DONE WHEN
              </p>
              {milestone.goals.length > 0 ? (
                <ul data-testid="milestone-goals" className="mt-2 flex list-none flex-col gap-1">
                  {milestone.goals.map((goal, index) => (
                    <li key={goalKey(index, goal)} style={{ fontSize: 14, lineHeight: '21px', color: 'var(--muted)' }}>
                      {goal}
                    </li>
                  ))}
                </ul>
              ) : (
                <p data-testid="milestone-goals" className="mt-2" style={{ fontSize: 14, color: 'var(--muted)' }}>
                  No completion lines yet.
                </p>
              )}
            </Panel>
            <Panel>
              <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 style={{ fontSize: 18, lineHeight: '27px', fontWeight: 500 }}>
                    {inclusiveProgressCopy(milestone.doneCount, total, recordBoard.nested)}
                  </h2>
                  <p data-testid="milestone-counts" style={{ marginTop: 8, fontSize: 13, lineHeight: '20px', color: 'var(--muted)' }}>
                    <span data-testid="milestone-done-count">{milestone.doneCount}</span>
                    {' complete. '}
                    <span data-testid="milestone-open-count">{milestone.openCount}</span>
                    {' still open.'}
                    {recordBoard.nested > 0 ? ` ${nestedCopy(recordBoard.nested)}` : ''}
                    {' The open count is not the decision.'}
                  </p>
                </div>
                <OutlineButton onClick={() => setTab('tasks')}>View tasks · {board.lanes}</OutlineButton>
              </div>
            </Panel>
            <Panel>
              <div className="flex items-center justify-between gap-4">
                <h2 style={{ fontSize: 20, lineHeight: '30px', fontWeight: 500 }}>
                  Resources · {milestone.resources.length}
                </h2>
                {staff && !locked ? (
                  <GhostButton onClick={() => setEditing(true)}>Attach</GhostButton>
                ) : null}
              </div>
              {milestone.resources.length > 0 ? (
                <ul data-testid="milestone-resources" className="mt-4 flex flex-col gap-2">
                  {milestone.resources.map((resource) => (
                    <li
                      key={resource.id}
                      className="flex flex-wrap items-center justify-between gap-3"
                      style={{
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border)',
                        borderRadius: 12,
                        padding: 16,
                      }}
                    >
                      <span>
                        <span style={{ display: 'block', fontSize: 14, fontWeight: 500 }}>{resource.title}</span>
                        <span style={{ display: 'block', marginTop: 4, fontSize: 12, color: 'var(--muted)' }}>
                          {milestone.publishToWarehaus ? 'Shared with client' : 'On this milestone'}
                        </span>
                      </span>
                      {resource.url ? (
                        <a
                          href={resource.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: 14, fontWeight: 500, color: 'var(--muted)' }}
                        >
                          Open
                        </a>
                      ) : (
                        <span style={{ fontSize: 14, color: 'var(--muted)' }}>No link</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p data-testid="milestone-resources" className="mt-4" style={{ fontSize: 14, color: 'var(--muted)' }}>
                  No resources attached yet.
                </p>
              )}
            </Panel>
            <Panel>
              <h2 style={{ fontSize: 18, lineHeight: '27px', fontWeight: 500 }}>Latest review</h2>
              {milestone.note ? (
                <>
                  <p style={{ marginTop: 12, fontSize: 14, lineHeight: '21px' }}>
                    {reviewCount > 0 ? `Round ${reviewCount} · ` : ''}
                    {APPROVAL_LABEL[milestone.approval]}
                  </p>
                  <p data-testid="milestone-note-saved" style={{ marginTop: 12, fontSize: 14, lineHeight: '21px', color: 'var(--muted)' }}>
                    {milestone.approverName ? `${milestone.approverName}: ` : ''}“{milestone.note}”
                    {formatWhen(milestone.decidedAt) ? ` · ${formatWhen(milestone.decidedAt)}` : ''}
                  </p>
                  <button type="button" onClick={() => setTab('reviews')} style={{ ...textButton, marginTop: 12 }}>
                    View review
                  </button>
                </>
              ) : (
                <p style={{ marginTop: 12, fontSize: 14, color: 'var(--muted)' }}>
                  No review yet. Open work stays listed until a person decides.
                </p>
              )}
            </Panel>
            {staff ? (
              <div className="flex flex-wrap items-center gap-3">
                <GhostButton testId="milestone-edit" disabled={locked || busy} onClick={() => { setError(null); setEditing(true); }}>
                  Edit milestone
                </GhostButton>
                <GhostButton onClick={() => setMore((current) => !current)}>More ···</GhostButton>
                <p style={{ fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>
                  Assign an existing task from More. A new task is not created on this milestone.
                </p>
              </div>
            ) : null}
            {locked ? (
              <p data-testid="milestone-locked" style={{ fontSize: 13, color: 'var(--muted)' }}>
                Approved. Request changes before editing the objective. Open tasks stay open.
              </p>
            ) : null}
            {more && staff ? (
              <MoreMenu
                milestone={milestone}
                busy={busy}
                attachable={attachable}
                describedBy={error && !reviewOpen && !editing ? MENU_ERROR_ID : undefined}
                onWorkStatus={(workStatus) => {
                  if (fixtures) {
                    onFixture({ workStatus });
                    return;
                  }
                  void run(() =>
                    setWorkStatus({
                      hostSlug,
                      milestoneId: milestone.id as Id<'milestones'>,
                      workStatus,
                    }),
                  );
                }}
                onPublish={() => {
                  const publishToWarehaus = !milestone.publishToWarehaus;
                  if (fixtures) {
                    onFixture({ publishToWarehaus });
                    return;
                  }
                  void run(() =>
                    setPublish({
                      hostSlug,
                      milestoneId: milestone.id as Id<'milestones'>,
                      publishToWarehaus,
                    }),
                  );
                }}
                onAttach={(taskId) => {
                  if (fixtures) {
                    onFixture({ attachedIds: [taskId] });
                    return;
                  }
                  void run(() =>
                    attachTask({
                      hostSlug,
                      milestoneId: milestone.id as Id<'milestones'>,
                      taskId: taskId as Id<'tasks'>,
                    }),
                  );
                }}
                onDetach={(taskId) => {
                  if (fixtures) {
                    onFixture({ detachedIds: [taskId] });
                    return;
                  }
                  void run(() =>
                    detachTask({
                      hostSlug,
                      milestoneId: milestone.id as Id<'milestones'>,
                      taskId: taskId as Id<'tasks'>,
                    }),
                  );
                }}
              />
            ) : null}
            {error && !reviewOpen && !editing ? (
              <MenuActionError error={error} onDismiss={() => setError(null)} />
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === 'tasks' ? (
        <div className="flex flex-col gap-4">
          {tasksMenuFailure({ tab, error, reviewOpen, editing }).show && error ? (
            <MenuActionError error={error} onDismiss={() => setError(null)} />
          ) : null}
          <Panel>
            <p data-testid="milestone-board-count" style={{ fontSize: 14, lineHeight: '21px' }}>
              {board.lanes} on the board
              {board.nested > 0 ? `. ${nestedCopy(board.nested)}` : '.'} Open a task to see its brief. The open count is not the decision.
            </p>
          </Panel>
          {board.lanes === 0 ? (
            <StateCard
              testId="milestone-tasks-empty"
              kicker="MILESTONE · NO TASKS YET"
              title="The brief is ready"
              body="No tasks are attached yet. Staff can assign an existing task. This screen does not generate a task breakdown."
              action={
                staff ? (
                  <PrimaryButton onClick={() => setMore(true)}>Assign existing task</PrimaryButton>
                ) : null
              }
            />
          ) : renderTasks ? (
            renderTasks(shownTasks)
          ) : (
            <TaskLines
              milestone={milestone}
              tasks={tasks}
              staff={staff}
              busy={busy}
              onOpenTask={onOpenTask}
              onDetach={(taskId) => {
                if (fixtures) {
                  onFixture({ detachedIds: [taskId] });
                  return;
                }
                void run(() =>
                  detachTask({
                    hostSlug,
                    milestoneId: milestone.id as Id<'milestones'>,
                    taskId: taskId as Id<'tasks'>,
                  }),
                );
              }}
            />
          )}
          {more && staff ? (
            <MoreMenu
              milestone={milestone}
              busy={busy}
              attachable={attachable}
              describedBy={error && !reviewOpen && !editing ? MENU_ERROR_ID : undefined}
              onWorkStatus={(workStatus) => {
                if (fixtures) {
                  onFixture({ workStatus });
                  return;
                }
                void run(() =>
                  setWorkStatus({
                    hostSlug,
                    milestoneId: milestone.id as Id<'milestones'>,
                    workStatus,
                  }),
                );
              }}
              onPublish={() => {
                const publishToWarehaus = !milestone.publishToWarehaus;
                if (fixtures) {
                  onFixture({ publishToWarehaus });
                  return;
                }
                void run(() =>
                  setPublish({
                    hostSlug,
                    milestoneId: milestone.id as Id<'milestones'>,
                    publishToWarehaus,
                  }),
                );
              }}
              onAttach={(taskId) => {
                if (fixtures) {
                  onFixture({ attachedIds: [taskId] });
                  return;
                }
                void run(() =>
                  attachTask({
                    hostSlug,
                    milestoneId: milestone.id as Id<'milestones'>,
                    taskId: taskId as Id<'tasks'>,
                  }),
                );
              }}
              onDetach={(taskId) => {
                if (fixtures) {
                  onFixture({ detachedIds: [taskId] });
                  return;
                }
                void run(() =>
                  detachTask({
                    hostSlug,
                    milestoneId: milestone.id as Id<'milestones'>,
                    taskId: taskId as Id<'tasks'>,
                  }),
                );
              }}
            />
          ) : null}
          {staff ? (
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>
              Assign an existing task from More. A task that is not attached does not appear on this milestone.
            </p>
          ) : null}
        </div>
      ) : null}

      {tab === 'reviews' ? (
        <div className="flex flex-col gap-4">
          {milestone.note ? (
            <Panel>
              <p className="ds-mono" style={{ fontSize: 10, color: 'var(--muted)' }}>
                REVIEW · {milestone.approval === 'changes_requested' ? 'FEEDBACK SAVED' : 'DECIDED'}
              </p>
              <h2 style={{ marginTop: 12, fontSize: 23, lineHeight: '35px', fontWeight: 500 }}>
                {APPROVAL_LABEL[milestone.approval]}
              </h2>
              <p style={{ marginTop: 12, fontSize: 15, lineHeight: '23px', color: 'var(--muted)' }}>
                {milestone.approverName ? `${milestone.approverName}: ` : ''}
                {milestone.note}
              </p>
              <p style={{ marginTop: 12, fontSize: 13, color: 'var(--muted)' }}>
                Existing tasks stay as they are. Approving does not close them.
              </p>
            </Panel>
          ) : (
            <StateCard
              kicker="REVIEW"
              title="No review yet"
              body="A person approves the milestone or sends it back. That decision does not close its tasks."
              action={<PrimaryButton onClick={() => { setError(null); setReviewOpen(true); }}>Review milestone</PrimaryButton>}
            />
          )}
          <p data-testid="milestone-activity-gap" style={{ fontSize: 13, lineHeight: '20px', color: 'var(--muted)' }}>
            {ACTIVITY_MILESTONE_ID_GAP}
          </p>
        </div>
      ) : null}

      {tab === 'activity' ? (
        <div className="flex flex-col gap-4">
          <ActivityList
            items={
              storedReview
                ? [
                    {
                      id: storedReview.id,
                      name: milestone.name,
                      type: 'milestone.decision',
                      summary: storedReview.note || storedReview.approval,
                      timestamp: reviewStamp(storedReview.decidedAt),
                      projectId: project.id,
                    },
                  ]
                : []
            }
            empty="No review is stored on this milestone."
            error={activityError}
          />
          <p data-testid="milestone-activity-gap" style={{ fontSize: 13, lineHeight: '20px', color: 'var(--muted)' }}>
            {ACTIVITY_MILESTONE_ID_GAP}
          </p>
        </div>
      ) : null}
      </div>

      {reviewOpen ? (
        <ReviewDialog
          milestone={milestone}
          note={note}
          error={noteError}
          noteAttempt={noteAttempt}
          saveError={error}
          busy={busy}
          onNote={setNote}
          onClose={() => {
            setReviewOpen(false);
            setNoteError(null);
          }}
          onDecide={onDecide}
        />
      ) : null}
      {editing && staff && !locked ? (
        <EditDialog
          milestone={milestone}
          choices={choices}
          busy={busy}
          saveError={error}
          onClose={() => setEditing(false)}
          onSave={(fields) => {
            if (fixtures) {
              onFixture({
                name: fields.name,
                objective: fields.objective,
                goals: fields.goals,
                resources: fields.resourceIds
                  .map((id) => choices.find((choice) => choice.id === id))
                  .filter((choice): choice is ResourceChoice => choice != null)
                  .map((choice) => ({ id: choice.id, title: choice.title, url: null })),
              });
              setEditing(false);
              return;
            }
            void run(async () => {
              await save({
                hostSlug,
                milestoneId: milestone.id as Id<'milestones'>,
                name: fields.name,
                objective: fields.objective,
                goals: fields.goals,
                resourceIds: fields.resourceIds as Id<'sharedResources'>[],
              });
              setEditing(false);
            });
          }}
        />
      ) : null}
      <span className="sr-only">
        <button type="button" onClick={onBack}>
          Back to milestones
        </button>
      </span>
    </div>
  );
}

export function MoreMenu({
  milestone,
  busy,
  attachable,
  describedBy,
  onWorkStatus,
  onPublish,
  onAttach,
  onDetach,
}: {
  milestone: MilestoneRoadmapView;
  busy: boolean;
  attachable: { id: string; name: string }[];
  describedBy?: string;
  onWorkStatus: (status: MilestoneRoadmapView['workStatus']) => void;
  onPublish: () => void;
  onAttach: (taskId: string) => void;
  onDetach: (taskId: string) => void;
}) {
  return (
    <Panel>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-2" style={{ fontSize: 13, color: 'var(--muted)' }}>
          Work status
          <select
            data-testid="milestone-work-select"
            value={milestone.workStatus}
            aria-describedby={describedBy}
            disabled={busy}
            onChange={(event) => onWorkStatus(event.target.value as MilestoneRoadmapView['workStatus'])}
            style={fieldStyle}
          >
            <option value="draft">Draft</option>
            <option value="active">In progress</option>
            <option value="ready">Ready for review</option>
          </select>
        </label>
        <div>
          <OutlineButton disabled={busy} describedBy={describedBy} onClick={onPublish}>
            {milestone.publishToWarehaus ? 'Unpublish' : 'Publish'}
          </OutlineButton>
        </div>
        <label className="flex flex-col gap-2" style={{ fontSize: 13, color: 'var(--muted)' }}>
          Assign existing task
          <select
            data-testid="milestone-attach"
            defaultValue=""
            aria-describedby={describedBy}
            disabled={busy || attachable.length === 0}
            onChange={(event) => {
              const taskId = event.target.value;
              event.target.value = '';
              if (taskId) onAttach(taskId);
            }}
            style={fieldStyle}
          >
            <option value="">{attachable.length === 0 ? 'No unassigned tasks' : 'Choose a task'}</option>
            {attachable.map((task) => (
              <option key={task.id} value={task.id}>
                {task.name}
              </option>
            ))}
          </select>
        </label>
        {milestone.rows.length > 0 ? (
          <label className="flex flex-col gap-2" style={{ fontSize: 13, color: 'var(--muted)' }}>
            Remove from milestone
            <select
              data-testid="milestone-detach"
              defaultValue=""
              disabled={busy}
              onChange={(event) => {
                const taskId = event.target.value;
                event.target.value = '';
                if (taskId) onDetach(taskId);
              }}
              style={fieldStyle}
            >
              <option value="">Choose a task</option>
              {milestone.rows.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </Panel>
  );
}

function TaskLines({
  milestone,
  tasks,
  staff,
  busy,
  onOpenTask,
  onDetach,
}: {
  milestone: MilestoneRoadmapView;
  tasks: readonly PortalTask[];
  staff: boolean;
  busy: boolean;
  onOpenTask?: (task: PortalTask) => void;
  onDetach: (taskId: string) => void;
}) {
  return (
    <div data-testid="milestone-tasks" className="flex flex-col gap-2">
      {milestone.rows.map((row) => (
        <div key={row.id}>
          <TaskLine
            row={row}
            testId="milestone-task"
            onOpen={
              onOpenTask
                ? () => {
                    const task = tasks.find((item) => item.id === row.id);
                    if (task) onOpenTask(task);
                  }
                : undefined
            }
          />
          {staff ? (
            <button type="button" data-testid="milestone-detach" disabled={busy} onClick={() => onDetach(row.id)} style={textButton}>
              Remove from milestone
            </button>
          ) : null}
          {row.children.map((child) => (
            <div key={child.id} className="pl-4">
              <TaskLine row={child} testId="milestone-subtask" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ReviewDialog({
  milestone,
  note,
  error,
  noteAttempt,
  saveError,
  busy,
  onNote,
  onClose,
  onDecide,
}: {
  milestone: MilestoneRoadmapView;
  note: string;
  error: string | null;
  noteAttempt: number;
  saveError: string | null;
  busy: boolean;
  onNote: (value: string) => void;
  onClose: () => void;
  onDecide: (decision: 'approved' | 'changes_requested') => void;
}) {
  const [mode, setMode] = useState<'changes_requested' | 'approved'>('changes_requested');
  const noteRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!error) return;
    noteRef.current?.focus();
    noteRef.current?.scrollIntoView({ block: 'nearest' });
  }, [error, noteAttempt]);
  return (
    <MilestoneDialog title="Review milestone" onClose={onClose} testId="milestone-review">
      <p style={{ marginTop: 8, fontSize: 14, color: 'var(--muted)' }}>
        {milestone.name}
        {milestone.approval === 'changes_requested' ? ' · Changes were requested' : ''}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode('changes_requested')}
          style={mode === 'changes_requested' ? selectedChip : quietChip}
        >
          Request changes
        </button>
        <button type="button" onClick={() => setMode('approved')} style={mode === 'approved' ? selectedChip : quietChip}>
          Approve milestone
        </button>
      </div>
      <p style={{ marginTop: 16, fontSize: 13, lineHeight: '20px', color: 'var(--muted)' }}>
        Open work stays listed. The open count is not the decision. Approving does not close tasks.
      </p>
      <label className="mt-4 flex flex-col gap-2">
        <span style={{ fontSize: 14 }}>
          {mode === 'approved' ? 'Note' : 'What needs to change?'} <span aria-hidden>*</span>
        </span>
        <textarea
          ref={noteRef}
          data-testid="milestone-note"
          value={note}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'milestone-note-error' : undefined}
          onChange={(event) => onNote(event.target.value)}
          rows={4}
          style={{ ...fieldStyle, resize: 'vertical' }}
        />
        {error ? <FieldError id="milestone-note-error">{error}</FieldError> : null}
      </label>
      {saveError ? <FormAlert>{saveError}</FormAlert> : null}
      <div className="mt-6 flex flex-wrap gap-2">
        <OutlineButton disabled={busy} onClick={onClose}>
          Cancel
        </OutlineButton>
        <span data-testid={mode === 'approved' ? 'milestone-approve' : 'milestone-request'}>
          <PrimaryButton disabled={busy} onClick={() => onDecide(mode)}>
            {mode === 'approved' ? 'Approve milestone' : 'Submit feedback'}
          </PrimaryButton>
        </span>
        <span className="sr-only" data-testid={mode === 'approved' ? 'milestone-request' : 'milestone-approve'} />
      </div>
    </MilestoneDialog>
  );
}

function EditDialog({
  milestone,
  choices,
  busy,
  saveError,
  onClose,
  onSave,
}: {
  milestone: MilestoneRoadmapView;
  choices: ResourceChoice[];
  busy: boolean;
  saveError: string | null;
  onClose: () => void;
  onSave: (fields: { name: string; objective: string; goals: string[]; resourceIds: string[] }) => void;
}) {
  const [name, setName] = useState(milestone.name);
  const [objective, setObjective] = useState(milestone.objective);
  const [goals, setGoals] = useState(milestone.goals.join('\n'));
  const [resourceIds, setResourceIds] = useState(milestone.resources.map((resource) => resource.id));
  const [fieldErrors, setFieldErrors] = useState<MilestoneFieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const objectiveRef = useRef<HTMLTextAreaElement>(null);
  const goalsRef = useRef<HTMLTextAreaElement>(null);
  return (
    <MilestoneDialog title="Edit milestone" onClose={onClose}>
      <form
        data-testid="milestone-edit-form"
        className="mt-4 flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const nextGoals = goals.split('\n').map((line) => line.trim()).filter(Boolean);
          const errors = milestoneFieldErrors(name, objective, goals);
          setFieldErrors(errors);
          const first = firstInvalidField(errors);
          if (first) {
            setError('Enter the missing fields. Nothing was saved.');
            focusField(first, { name: nameRef, objective: objectiveRef, goals: goalsRef });
            return;
          }
          setError(null);
          onSave({ name, objective, goals: nextGoals, resourceIds });
        }}
      >
        <FormFields
          name={name}
          objective={objective}
          goals={goals}
          resourceIds={resourceIds}
          choices={choices}
          fieldErrors={fieldErrors}
          nameRef={nameRef}
          objectiveRef={objectiveRef}
          goalsRef={goalsRef}
          onName={setName}
          onObjective={setObjective}
          onGoals={setGoals}
          onResources={setResourceIds}
        />
        {error ? <FormAlert>{error}</FormAlert> : null}
        {saveError ? <FormAlert>{saveError}</FormAlert> : null}
        <div className="flex flex-wrap gap-2">
          <OutlineButton disabled={busy} onClick={onClose}>
            Cancel
          </OutlineButton>
          <PrimaryButton type="submit" disabled={busy}>
            Save milestone
          </PrimaryButton>
        </div>
      </form>
    </MilestoneDialog>
  );
}

function CreateMilestone({
  projectId,
  fixtures,
  hostSlug,
  resourceChoices,
  onClose,
  onFixture,
}: {
  projectId: Id<'projects'>;
  fixtures: boolean;
  hostSlug?: string;
  resourceChoices: ResourceChoice[];
  onClose: () => void;
  onFixture: (milestone: MilestoneRoadmapView) => void;
}) {
  const create = useMutation(api.milestones.create);
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const [goals, setGoals] = useState('');
  const [resourceIds, setResourceIds] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<MilestoneFieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const objectiveRef = useRef<HTMLTextAreaElement>(null);
  const goalsRef = useRef<HTMLTextAreaElement>(null);
  return (
    <MilestoneDialog title="New milestone" onClose={onClose}>
      <form
        data-testid="milestone-create"
        className="mt-2 flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const nextGoals = goals.split('\n').map((line) => line.trim()).filter(Boolean);
          const errors = milestoneFieldErrors(name, objective, goals);
          setFieldErrors(errors);
          const first = firstInvalidField(errors);
          if (first) {
            setError('Enter the missing fields. Nothing was saved.');
            focusField(first, { name: nameRef, objective: objectiveRef, goals: goalsRef });
            return;
          }
          setError(null);
          if (fixtures) {
            onFixture({
              id: `m-local-${createdStamp()}`,
              name: name.trim(),
              objective: objective.trim(),
              goals: nextGoals,
              workStatus: 'draft',
              approval: 'unreviewed',
              note: null,
              approverName: null,
              decidedAt: null,
              publishToWarehaus: false,
              resources: resourceIds
                .map((id) => resourceChoices.find((choice) => choice.id === id))
                .filter((choice): choice is ResourceChoice => choice != null)
                .map((choice) => ({ id: choice.id, title: choice.title, url: null })),
              openCount: 0,
              doneCount: 0,
              countIsDecision: false,
              rows: [],
            });
            onClose();
            return;
          }
          setBusy(true);
          setError(null);
          void create({
            hostSlug,
            projectId,
            name,
            objective,
            goals: nextGoals,
            ...(resourceIds.length > 0 ? { resourceIds: resourceIds as Id<'sharedResources'>[] } : {}),
          })
            .then(() => onClose())
            .catch((err: unknown) => {
              setError(err instanceof Error ? err.message : 'Could not create the milestone.');
            })
            .finally(() => setBusy(false));
        }}
      >
        <p style={{ fontSize: 14, lineHeight: '21px', color: 'var(--muted)' }}>
          Describe the outcome. The milestone is saved first and stays unpublished until you publish it.
        </p>
        <FormFields
          name={name}
          objective={objective}
          goals={goals}
          resourceIds={resourceIds}
          choices={resourceChoices}
          fieldErrors={fieldErrors}
          nameRef={nameRef}
          objectiveRef={objectiveRef}
          goalsRef={goalsRef}
          onName={setName}
          onObjective={setObjective}
          onGoals={setGoals}
          onResources={setResourceIds}
        />
        <p
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 16,
            fontSize: 14,
            lineHeight: '21px',
            color: 'var(--muted)',
          }}
        >
          The milestone is saved first. Its tasks are added on the milestone. A new milestone starts unpublished.
        </p>
        {error ? <FormAlert>{error}</FormAlert> : null}
        <div className="flex flex-wrap gap-2">
          <OutlineButton disabled={busy} onClick={onClose}>
            Cancel
          </OutlineButton>
          <PrimaryButton type="submit" disabled={busy}>
            Create milestone
          </PrimaryButton>
        </div>
      </form>
    </MilestoneDialog>
  );
}

type MilestoneFieldErrors = { name?: string; objective?: string; goals?: string };
type MilestoneField = keyof MilestoneFieldErrors;

function milestoneFieldErrors(name: string, objective: string, goals: string): MilestoneFieldErrors {
  const errors: MilestoneFieldErrors = {};
  if (!name.trim()) errors.name = 'Enter a milestone name.';
  if (!objective.trim()) errors.objective = 'Enter the brief.';
  if (!goals.split('\n').some((line) => line.trim())) errors.goals = 'Enter at least one completion line.';
  return errors;
}

function firstInvalidField(errors: MilestoneFieldErrors): MilestoneField | null {
  if (errors.name) return 'name';
  if (errors.objective) return 'objective';
  if (errors.goals) return 'goals';
  return null;
}

function focusField(
  field: MilestoneField,
  refs: {
    name: RefObject<HTMLInputElement | null>;
    objective: RefObject<HTMLTextAreaElement | null>;
    goals: RefObject<HTMLTextAreaElement | null>;
  },
) {
  const node = refs[field].current;
  node?.focus();
  node?.scrollIntoView({ block: 'nearest' });
}

function FormAlert({ children }: { children: string }) {
  return (
    <p data-testid="milestone-error" role="alert" style={{ margin: 0, fontSize: 13, lineHeight: '18px', color: 'var(--danger)' }}>
      {children}
    </p>
  );
}

function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <span id={id} role="alert" style={{ fontSize: 13, lineHeight: '18px', color: 'var(--danger)' }}>
      {children}
    </span>
  );
}

function FormFields({
  name,
  objective,
  goals,
  resourceIds,
  choices,
  fieldErrors,
  nameRef,
  objectiveRef,
  goalsRef,
  onName,
  onObjective,
  onGoals,
  onResources,
}: {
  name: string;
  objective: string;
  goals: string;
  resourceIds: string[];
  choices: ResourceChoice[];
  fieldErrors: MilestoneFieldErrors;
  nameRef: RefObject<HTMLInputElement | null>;
  objectiveRef: RefObject<HTMLTextAreaElement | null>;
  goalsRef: RefObject<HTMLTextAreaElement | null>;
  onName: (value: string) => void;
  onObjective: (value: string) => void;
  onGoals: (value: string) => void;
  onResources: (value: string[]) => void;
}) {
  return (
    <>
      <label className="flex flex-col gap-2">
        <span style={{ fontSize: 14 }}>Milestone name *</span>
        <input
          ref={nameRef}
          value={name}
          aria-invalid={fieldErrors.name ? true : undefined}
          aria-describedby={fieldErrors.name ? 'milestone-name-error' : undefined}
          onChange={(event) => onName(event.target.value)}
          style={fieldStyle}
        />
        {fieldErrors.name ? <FieldError id="milestone-name-error">{fieldErrors.name}</FieldError> : null}
      </label>
      <label className="flex flex-col gap-2">
        <span style={{ fontSize: 14 }}>Brief *</span>
        <textarea
          ref={objectiveRef}
          value={objective}
          aria-invalid={fieldErrors.objective ? true : undefined}
          aria-describedby={fieldErrors.objective ? 'milestone-brief-error' : undefined}
          onChange={(event) => onObjective(event.target.value)}
          rows={3}
          placeholder="What should be delivered, and what needs to happen?"
          style={{ ...fieldStyle, resize: 'vertical' }}
        />
        {fieldErrors.objective ? <FieldError id="milestone-brief-error">{fieldErrors.objective}</FieldError> : null}
      </label>
      <label className="flex flex-col gap-2">
        <span style={{ fontSize: 14 }}>Done when *</span>
        <textarea
          ref={goalsRef}
          value={goals}
          aria-invalid={fieldErrors.goals ? true : undefined}
          aria-describedby={fieldErrors.goals ? 'milestone-goals-error' : undefined}
          onChange={(event) => onGoals(event.target.value)}
          rows={3}
          placeholder="One completion line per row. These are not tasks."
          style={{ ...fieldStyle, resize: 'vertical' }}
        />
        {fieldErrors.goals ? <FieldError id="milestone-goals-error">{fieldErrors.goals}</FieldError> : null}
      </label>
      <div>
        <div className="flex items-center justify-between gap-3">
          <FieldLabel>RESOURCES</FieldLabel>
          <span data-testid="milestone-resource-count" aria-live="polite" style={{ fontSize: 13, color: 'var(--muted)' }}>
            {resourceIds.length} selected
          </span>
        </div>
        {choices.length === 0 ? (
          <p style={{ marginTop: 8, fontSize: 14 }}>No resources to attach.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2" aria-label="Attach resources">
            {choices.map((choice) => {
              const selected = resourceIds.includes(choice.id);
              return (
                <li key={choice.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      onResources(selected ? resourceIds.filter((id) => id !== choice.id) : [...resourceIds, choice.id])
                    }
                    className="flex w-full items-center gap-3 text-left"
                    style={{
                      border: selected ? '1px solid var(--fg)' : '1px solid var(--border)',
                      borderRadius: 12,
                      padding: '10px 12px',
                      background: selected ? 'var(--surface-2)' : 'transparent',
                      color: 'var(--fg)',
                      cursor: 'pointer',
                    }}
                  >
                    <span className="min-w-0 flex-1" style={{ fontSize: 14, fontWeight: 500 }}>
                      {choice.title}
                    </span>
                    <span style={{ fontSize: 13, color: selected ? 'var(--fg)' : 'var(--muted)' }}>
                      {selected ? 'Selected' : 'Attach'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

function ProjectResources({ project, extra }: { project: RoadmapProject; extra?: ReactNode }) {
  const links = [
    project.figmaLink ? { label: 'Figma', url: project.figmaLink } : null,
    project.docsUrl ? { label: 'Docs', url: project.docsUrl } : null,
    project.liveUrl ? { label: 'Live site', url: project.liveUrl } : null,
  ].filter((link): link is { label: string; url: string } => link != null);
  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <h2 style={{ fontSize: 20, lineHeight: '30px', fontWeight: 500 }}>Project resources</h2>
        {project.description ? (
          <p style={{ marginTop: 12, fontSize: 14, lineHeight: '21px', color: 'var(--muted)' }}>{project.description}</p>
        ) : null}
        {links.length === 0 ? (
          <p style={{ marginTop: 12, fontSize: 14, color: 'var(--muted)' }}>No project links yet.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {links.map((link) => (
              <li key={link.label}>
                <a href={link.url} target="_blank" rel="noreferrer" style={{ color: 'var(--fg)', fontSize: 14 }}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {extra}
    </div>
  );
}

function ActivityList({
  items,
  empty,
  error,
}: {
  items: readonly MilestoneActivityItem[];
  empty: string;
  error?: string | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p data-testid="activity-error" style={{ fontSize: 14, color: 'var(--danger)' }}>
          {error}
        </p>
      ) : null}
      {items.length === 0 ? (
        <p style={{ fontSize: 14, color: 'var(--muted)' }}>{empty}</p>
      ) : (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.id}>
          <Panel>
            <p style={{ fontSize: 14, fontWeight: 500 }}>{item.name}</p>
            <p style={{ marginTop: 6, fontSize: 14, color: 'var(--muted)' }}>{item.summary || item.type}</p>
            <p className="ds-mono" style={{ marginTop: 8, fontSize: 11, color: 'var(--faint)' }}>
              {item.timestamp}
            </p>
          </Panel>
        </li>
      ))}
    </ul>
      )}
    </div>
  );
}

function TaskLine({
  row,
  testId,
  onOpen,
}: {
  row: RoadmapChild;
  testId: string;
  onOpen?: () => void;
}) {
  const body = (
    <>
      <p style={{ fontSize: 14, fontWeight: 550, minWidth: 0 }}>{row.name}</p>
      <p className="flex flex-wrap items-center gap-2" style={{ fontSize: 12, color: 'var(--muted)' }}>
        <span data-testid="milestone-task-status">{row.status}</span>
        {row.stage ? <span data-testid="milestone-task-stage">{row.stage}</span> : null}
        <span data-testid="milestone-task-resources">{resourceLabel(row.resourceCount)}</span>
        {row.pullRequestUrl ? (
          <a data-testid="milestone-task-pr" href={row.pullRequestUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
            Pull request
          </a>
        ) : null}
      </p>
    </>
  );
  return (
    <div
      data-testid={testId}
      className="flex flex-wrap items-baseline justify-between gap-2"
      style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}
    >
      {onOpen ? (
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-2 text-left" style={{ background: 'none', border: 0, color: 'inherit', cursor: 'pointer', padding: 0 }}>
          {body}
        </button>
      ) : (
        body
      )}
    </div>
  );
}

const textButton = {
  background: 'none',
  border: 0,
  padding: 0,
  color: 'var(--muted)',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: 13,
} as const;

const selectedChip = {
  background: 'var(--accent)',
  color: 'var(--accent-fg)',
  border: '1px solid var(--accent)',
  borderRadius: 9,
  padding: '12px 16px',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
} as const;

const quietChip = {
  background: 'transparent',
  color: 'var(--fg)',
  border: '1px solid var(--border-2)',
  borderRadius: 9,
  padding: '12px 16px',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
} as const;
