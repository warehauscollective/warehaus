'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useMutation } from 'convex/react';
import { formatReviewStamp, iterationOutcome } from '@convex/_lib/milestoneReview';
import { userFacingErrorMessage } from '@convex/_lib/userFacingError';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { type MilestoneStatus } from '@convex/_lib/milestoneStatus';
import type { MilestoneRoadmapView } from '@convex/_lib/milestones';
import { ProjectBreadcrumb } from '@/components/nav/ProjectBreadcrumb';
import { OutlineButton } from '@/components/ui/primitives';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { useMaxWidth } from '@/lib/design/useMaxWidth';
import { FIXTURE_PROJECTS } from '@/lib/data/fixtures';
import { useMilestoneDetailEdits, type MoveTarget, type OwnerChoice } from './milestoneDetailsEdit';
import { type PortalTask } from '@/lib/data/view-models';
import { MilestoneReviewLive } from './MilestoneReview';
import {
  GhostButton,
  MenuActionError,
  PageHeading,
  Panel,
  StateCard,
  TabRow,
} from './milestoneChrome';
import {
  activityForMilestone,
  boardCountsFromTasks,
  goalKey,
  MENU_ERROR_ID,
  milestoneResourceChoices,
  reviewStamp,
  tasksMenuFailure,
  storedMilestoneReview,
  tabIds,
} from './milestoneGuards';
import { type RoadmapProject, type MilestoneActivityItem, type ResourceChoice, type FixturePatch, lastReviewLabel, resourceAudienceLine, taskTotal, boardTaskCounts, nestedCopy, milestoneDetachOptions, inclusiveProgressCopy, milestoneTasks, fixtureOwnerChoices } from './milestoneTile';
import { ActivityList } from './roadmapParts';
import { MoreMenu, EditDialog } from './MilestoneForms';
import { MilestoneLoopLive, fixtureLoopModel, loopSubtitleLine, milestoneLoopSubtitle } from './MilestoneLoop';
import type { MilestoneTaskActions } from './milestoneBoard';
import { milestoneNestedToOpen, milestoneTaskToOpen } from './milestoneBoard';
import { MilestoneTaskBoard, type MoveTaskStatus } from './MilestoneTaskBoard';
import type { TaskCloseoutActions } from '@/components/closeout/closeoutActions';
import type { ArchivedTask } from './ArchivedView';
import { MilestoneRunFeedLive } from './MilestoneRunFeed';

type MilestoneTab = 'overview' | 'tasks' | 'activity' | 'reviews';

export const TASKS_TITLE = 'Tasks';

/** Figma P04 heading. The count shows at 1440 only; the phone board panel carries it. */
export function tasksSubtitle(input: { count: number; phone: boolean }): string {
  const base = 'Work needed to complete this milestone';
  if (input.phone) return base;
  return `${base} · ${input.count === 1 ? '1 task' : `${input.count} tasks`}`;
}

type MilestoneMutations = {
  save: (args: {
    hostSlug?: string;
    milestoneId: Id<'milestones'>;
    name: string;
    objective: string;
    goals: string[];
    resourceIds: Id<'sharedResources'>[];
  }) => Promise<unknown>;
  setPublish: (args: {
    hostSlug?: string;
    milestoneId: Id<'milestones'>;
    publishToWarehaus: boolean;
  }) => Promise<unknown>;
  setStatus?: (args: {
    hostSlug?: string;
    milestoneId: Id<'milestones'>;
    status: MilestoneStatus;
    expectedStatus?: MilestoneStatus;
  }) => Promise<unknown>;
  advance?: (args: {
    hostSlug?: string;
    milestoneId: Id<'milestones'>;
    expectedStatus: MilestoneStatus;
  }) => Promise<unknown>;
  setOwner?: (args: {
    hostSlug?: string;
    milestoneId: Id<'milestones'>;
    ownerContactId: Id<'contacts'> | null;
  }) => Promise<unknown>;
  setDueDate?: (args: {
    hostSlug?: string;
    milestoneId: Id<'milestones'>;
    dueDate: string | null;
  }) => Promise<unknown>;
  setTileLink?: (args: {
    hostSlug?: string;
    milestoneId: Id<'milestones'>;
    field: 'localPreview' | 'figma';
    url: string | null;
  }) => Promise<unknown>;
  moveProject?: (args: {
    hostSlug?: string;
    milestoneId: Id<'milestones'>;
    projectId: Id<'projects'>;
  }) => Promise<unknown>;
  attachTask: (args: {
    hostSlug?: string;
    milestoneId: Id<'milestones'>;
    taskId: Id<'tasks'>;
  }) => Promise<unknown>;
  detachTask: (args: {
    hostSlug?: string;
    milestoneId: Id<'milestones'>;
    taskId: Id<'tasks'>;
  }) => Promise<unknown>;
  attachPreviewLink?: (args: {
    hostSlug?: string;
    milestoneId: Id<'milestones'>;
    url: string;
  }) => Promise<{ ok: boolean; reason?: string }>;
  clearPreviewLink?: (args: { hostSlug?: string; milestoneId: Id<'milestones'> }) => Promise<unknown>;
  /** Task writes on the Tasks tab. Absent in fixture previews. */
  tasks?: MilestoneTaskActions;
  /** A card's status move on the Tasks board. Absent in fixture previews. */
  moveTaskStatus?: MoveTaskStatus;
};

export function MilestoneDetail(props: {
  milestone: MilestoneRoadmapView;
  project: RoadmapProject;
  tasks: readonly PortalTask[];
  staff: boolean;
  fixtures: boolean;
  hostSlug?: string;
  isPeter?: boolean;
  viewerEmail?: string | null;
  clientName?: string | null;
  preview?: string | null;
  activity?: readonly MilestoneActivityItem[];
  activityError?: string | null;
  /** `nested` is the task's child tasks on this milestone, for the task modal's list. */
  onOpenTask?: (task: PortalTask, nested?: PortalTask[]) => void;
  resourceChoices: ResourceChoice[];
  onBack: () => void;
  onBackToProjects?: () => void;
  onFixture: (patch: FixturePatch) => void;
  /** Staff "…" control in the header: Mark complete, Archive, or Restore. */
  closeout?: ReactNode;
  /** This milestone's archived tasks, for the Archived filter on the task list. */
  archivedTasks?: readonly ArchivedTask[];
  /** Task close-out writes. Absent in fixture previews. */
  taskCloseout?: (taskId: string) => TaskCloseoutActions;
}) {
  const save = useMutation(api.milestones.save);
  const setPublish = useMutation(api.milestones.setPublish);
  const setStatus = useMutation(api.milestones.setStatus);
  const advance = useMutation(api.milestones.advance);
  const setOwner = useMutation(api.milestones.setOwner);
  const setDueDate = useMutation(api.milestones.setDueDate);
  const setTileLink = useMutation(api.milestones.setTileLink);
  const moveProject = useMutation(api.milestones.moveProject);
  const attachTask = useMutation(api.milestones.attachTask);
  const detachTask = useMutation(api.milestones.detachTask);
  const attachPreviewLink = useMutation(api.milestones.attachPreviewLink);
  const clearPreviewLink = useMutation(api.milestones.clearPreviewLink);
  const addTask = useMutation(api.milestones.addTask);
  const editTask = useMutation(api.milestones.editTask);
  const removeTask = useMutation(api.milestones.removeTask);
  const reorderTasks = useMutation(api.milestones.reorderTasks);
  const moveTaskStatus = useMutation(api.tasks.moveStatus);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadedTargets, setLoadedTargets] = useState<MoveTarget[]>([]);
  const [moveListOpen, setMoveListOpen] = useState(false);
  const [ownerListOpen, setOwnerListOpen] = useState(false);
  const ownerQuery = useSafeQuery<OwnerChoice[]>(
    api.milestones.ownerChoices,
    !props.fixtures && props.staff && ownerListOpen
      ? { projectId: props.project.id as Id<'projects'>, hostSlug: props.hostSlug }
      : 'skip',
  );
  const owners = props.fixtures ? fixtureOwnerChoices(props.project.id) : (ownerQuery.data ?? []);
  const targetPage = useSafeQuery<{ projects: MoveTarget[]; continueCursor: string | null; isDone: boolean }>(
    api.milestones.listMoveTargets,
    !props.fixtures && props.staff && moveListOpen
      ? { projectId: props.project.id as Id<'projects'>, hostSlug: props.hostSlug, cursor }
      : 'skip',
  );
  useEffect(() => {
    const rows = targetPage.data?.projects;
    if (!rows) return;
    setLoadedTargets((current) => {
      const seen = new Set(current.map((item) => item.id));
      const next = [...current];
      for (const row of rows) {
        if (row.id === props.project.id || seen.has(row.id)) continue;
        next.push(row);
        seen.add(row.id);
      }
      return next.length === current.length ? current : next;
    });
  }, [targetPage.data, props.project.id]);
  const moveTargets = props.fixtures
    ? FIXTURE_PROJECTS.filter((item) => item.id !== props.project.id).map((item) => ({ id: item.id, name: item.name }))
    : loadedTargets;
  const [loopPreview, setLoopPreview] = useState<string | null>(null);
  const [loopUpdatedAt, setLoopUpdatedAt] = useState<number | null>(null);
  useEffect(() => {
    if (!props.fixtures) return;
    const params = new URLSearchParams(window.location.search);
    setLoopPreview(params.get('loop'));
    // Fixture capture of the real stamp: `?updated=5` reads as changed five minutes ago.
    const minutes = Number(params.get('updated') ?? '');
    setLoopUpdatedAt(params.has('updated') && Number.isFinite(minutes) && minutes >= 0 ? Date.now() - minutes * 60_000 : null);
  }, [props.fixtures]);
  return (
    <MilestoneDetailView
      {...props}
      moveTargets={moveTargets}
      onMoveListOpen={setMoveListOpen}
      onOwnerListOpen={setOwnerListOpen}
      owners={owners}
      onLoadMoreTargets={
        targetPage.data?.continueCursor
          ? () => setCursor(targetPage.data?.continueCursor ?? null)
          : undefined
      }
      loopPreview={loopPreview}
      loopUpdatedAt={loopUpdatedAt}
      loop={
        props.staff ? (
          <MilestoneLoopLive
            milestone={props.milestone}
            staff={props.staff}
            fixtures={props.fixtures}
            hostSlug={props.hostSlug}
            loopPreview={loopPreview}
            actions={{ addTask, editTask, removeTask, reorderTasks }}
            onStatus={(status) => props.onFixture({ status })}
          />
        ) : null
      }
      mutations={{ save, setPublish, setStatus, advance, setOwner, setDueDate, setTileLink, moveProject, attachTask, detachTask, attachPreviewLink, clearPreviewLink, tasks: { addTask, editTask, removeTask, reorderTasks }, moveTaskStatus }}
    />
  );
}

export function MilestoneDetailView({
  milestone,
  project,
  tasks,
  staff,
  fixtures,
  hostSlug,
  viewerEmail = null,
  clientName = null,
  preview = null,
  moveTargets = [],
  onMoveListOpen,
  onOwnerListOpen,
  owners = [],
  onLoadMoreTargets,
  activity = [],
  activityError = null,
  onOpenTask,
  resourceChoices,
  onBack,
  onBackToProjects,
  onFixture,
  mutations,
  isPeter,
  loop = null,
  loopPreview = null,
  loopUpdatedAt = null,
  closeout = null,
  archivedTasks = [],
  taskCloseout,
}: {
  closeout?: ReactNode;
  archivedTasks?: readonly ArchivedTask[];
  taskCloseout?: (taskId: string) => TaskCloseoutActions;
  milestone: MilestoneRoadmapView;
  project: RoadmapProject;
  tasks: readonly PortalTask[];
  staff: boolean;
  fixtures: boolean;
  hostSlug?: string;
  viewerEmail?: string | null;
  clientName?: string | null;
  preview?: string | null;
  moveTargets?: readonly MoveTarget[];
  onMoveListOpen?: (open: boolean) => void;
  onOwnerListOpen?: (open: boolean) => void;
  owners?: readonly OwnerChoice[];
  onLoadMoreTargets?: () => void;
  activity?: readonly MilestoneActivityItem[];
  activityError?: string | null;
  /** `nested` is the task's child tasks on this milestone, for the task modal's list. */
  onOpenTask?: (task: PortalTask, nested?: PortalTask[]) => void;
  resourceChoices: ResourceChoice[];
  onBack: () => void;
  onBackToProjects?: () => void;
  onFixture: (patch: FixturePatch) => void;
  mutations: MilestoneMutations;
  isPeter?: boolean;
  loop?: ReactNode;
  loopPreview?: string | null;
  /** Fixture capture only: a stand-in last-change time for the Updated stamp. */
  loopUpdatedAt?: number | null;
}) {
  const { save, setPublish, attachTask, detachTask } = mutations;
  const [tab, setTab] = useState<MilestoneTab>('overview');
  const [editing, setEditing] = useState(false);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The review card has its own phone layout. It does not follow CSS breakpoints.
  const phone = useMaxWidth(767);
  const tasksPage = tab === 'tasks';
  const locked = milestone.approval === 'approved';
  const total = taskTotal(milestone);
  const recordBoard = boardTaskCounts(milestone);
  const shownTasks = milestoneTasks(tasks, milestone);
  const board = boardCountsFromTasks(shownTasks);
  const storedReview = storedMilestoneReview(milestone);
  const milestoneActivity = activityForMilestone(activity, milestone.id);
  const choices = milestoneResourceChoices(
    resourceChoices,
    milestone.resources.map((resource) => ({ id: resource.id, title: resource.title })),
  );
  const taken = new Set(milestoneDetachOptions(milestone.rows).map((task) => task.id));
  const attachable = (milestone.attachableTasks ?? []).filter((task) => !taken.has(task.id));
  const reviewLine = lastReviewLabel({ approverName: milestone.approverName, decidedAt: milestone.decidedAt ?? null });
  const edits = useMilestoneDetailEdits({
    milestone,
    projectName: project.name,
    currentProjectId: project.id,
    clientName: clientName ?? project.clientName,
    staff,
    fixtures,
    hostSlug,
    viewerEmail,
    moveTargets,
    preview,
    showFields: tab === 'overview',
    reviewLine,
    suspended: editing,
    onClaim: () => {
      setEditing(false);
    },
    onFixture,
    onLoadMoreTargets,
    onMoveListOpen,
    onOwnerListOpen,
    owners,
    mutations: {
      setStatus: mutations.setStatus ?? (async () => undefined),
      advance: mutations.advance ?? (async () => undefined),
      setOwner: mutations.setOwner ?? (async () => undefined),
      setDueDate: mutations.setDueDate ?? (async () => undefined),
      setTileLink: mutations.setTileLink,
      setPublish,
      moveProject: mutations.moveProject ?? (async () => undefined),
      attachPreviewLink: mutations.attachPreviewLink,
      clearPreviewLink: mutations.clearPreviewLink,
    },
  });

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(userFacingErrorMessage(err, 'Could not save the milestone.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {onBackToProjects ? (
        tasksPage ? (
          // Figma P04: Tasks is a page under the milestone. Back and the last crumb lead to its overview.
          <ProjectBreadcrumb
            back={{ label: `‹ ${milestone.name}`, onClick: () => setTab('overview') }}
            trail={[
              { label: 'Projects', onClick: onBackToProjects, testId: 'nav-breadcrumb-parent' },
              { label: project.name, onClick: onBack, testId: 'nav-breadcrumb-middle' },
              { label: milestone.name, onClick: () => setTab('overview'), testId: 'nav-breadcrumb-current' },
            ]}
          />
        ) : (
          <ProjectBreadcrumb
            back={{ label: `‹ ${project.name}`, onClick: onBack }}
            trail={[
              { label: 'Projects', onClick: onBackToProjects, testId: 'nav-breadcrumb-parent' },
              { label: project.name, onClick: onBack, testId: 'nav-breadcrumb-middle' },
              { label: 'Milestones', testId: 'nav-breadcrumb-current' },
            ]}
          />
        )
      ) : null}
      {tasksPage ? (
        <PageHeading
          alignAction
          testId="milestone-tasks-title"
          title={TASKS_TITLE}
          subtitle={tasksSubtitle({ count: board.lanes, phone })}
          action={
            phone ? undefined : (
              <OutlineButton testId="milestone-tasks-overview" nowrap onClick={() => setTab('overview')}>
                Milestone overview
              </OutlineButton>
            )
          }
        />
      ) : (
      <PageHeading
        alignAction
        testId="milestone-name"
        title={milestone.name}
        subtitle={(() => {
          const frame = loopPreview ? fixtureLoopModel(loopPreview) : null;
          if (frame?.subtitle && loopUpdatedAt != null) return loopSubtitleLine(frame.subtitle, undefined, loopUpdatedAt);
          if (frame?.subtitle) return loopSubtitleLine(frame.subtitle, frame.desktopStamp);
          const live = staff ? milestoneLoopSubtitle(milestone) : null;
          if (live) return loopSubtitleLine(live.text, undefined, live.updatedAt);
          return `Milestone · ${inclusiveProgressCopy(milestone.doneCount, total, recordBoard.nested)}`;
        })()}
        action={staff && closeout ? <span data-testid="milestone-header-overflow" className="inline-flex">{closeout}</span> : undefined}
      />
      )}
      <TabRow
        label="Milestone"
        idPrefix="milestone"
        active={tab}
        onChange={(id) => setTab(id as MilestoneTab)}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'tasks', label: `Tasks · ${board.lanes}` },
          ...(staff ? [{ id: 'reviews' as const, label: `Reviews · ${milestone.review?.history.length ?? 0}` }] : []),
          { id: 'activity', label: 'Activity' },
        ]}
      />
      <div role="tabpanel" id={tabIds('milestone', tab).panel} aria-labelledby={tabIds('milestone', tab).tab}>

      {tab === 'overview' ? (
        <div className="flex flex-col gap-6">
          {loop}
          {staff && milestone.review && !loop ? (
            <MilestoneReviewLive milestone={milestone} hostSlug={hostSlug} isPeter={isPeter} phone={phone} />
          ) : null}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="order-first w-full lg:order-last lg:w-[292px] lg:shrink-0">
            {edits.fields}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-6">
            <Panel>
              <h2 style={{ fontSize: 20, lineHeight: '30px', fontWeight: 500 }}>What we’re delivering</h2>
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
                  <p style={{ marginTop: 8, fontSize: 13, lineHeight: '20px', color: 'var(--muted)' }}>
                    Work comes from this milestone’s brief and reviews.
                  </p>
                  <p data-testid="milestone-counts" className="sr-only">
                    <span data-testid="milestone-done-count">{milestone.doneCount}</span>
                    {' complete. '}
                    <span data-testid="milestone-open-count">{milestone.openCount}</span>
                    {' still open.'}
                    {recordBoard.nested > 0 ? ` ${nestedCopy(recordBoard.nested)}` : ''}
                    {' The open count is not the decision.'}
                  </p>
                </div>
                <OutlineButton nowrap onClick={() => setTab('tasks')}>View tasks · {board.lanes}</OutlineButton>
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
                          {resourceAudienceLine(resource.type, staff, milestone.publishToWarehaus)}
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
            {staff ? (
              <Panel>
                <h2 style={{ fontSize: 18, lineHeight: '27px', fontWeight: 500 }}>Latest review</h2>
                <p style={{ marginTop: 12, fontSize: 14, color: 'var(--muted)' }}>
                  Notes stay on the review card. Clients do not see them.
                </p>
              </Panel>
            ) : null}
            {staff ? (
              <div className="flex flex-wrap items-center gap-3">
                <GhostButton testId="milestone-edit" disabled={locked || busy} onClick={() => { setError(null); setEditing(true); }}>
                  Edit all details
                </GhostButton>
                <GhostButton onClick={() => setMore((current) => !current)}>More ···</GhostButton>
                <p style={{ fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>
                  Add tasks on the Tasks tab. Assign an existing task from More.
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
                describedBy={error && !editing ? MENU_ERROR_ID : undefined}
                onPublish={() => edits.askPublish()}
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
            {error && !editing ? (
              <MenuActionError error={error} onDismiss={() => setError(null)} />
            ) : null}
          </div>
        </div>
        </div>
      ) : null}

      {tab === 'tasks' ? (
        <div className="flex flex-col gap-4">
          {tasksMenuFailure({ tab, error, editing }).show && error ? (
            <MenuActionError error={error} onDismiss={() => setError(null)} />
          ) : null}
          <MilestoneTaskBoard
            milestone={milestone}
            project={project}
            tasks={tasks}
            staff={staff}
            fixtures={fixtures}
            hostSlug={hostSlug}
            actions={mutations.tasks}
            moveStatus={mutations.moveTaskStatus}
            archivedTasks={archivedTasks}
            taskCloseout={taskCloseout}
            onOpenTask={
              onOpenTask
                ? (taskId) => {
                    const open = { taskId, milestone, tasks, project };
                    const task = milestoneTaskToOpen(open);
                    if (task) onOpenTask(task, milestoneNestedToOpen(open));
                  }
                : undefined
            }
          />
          {staff ? (
            <div className="flex flex-wrap items-center gap-3">
              <GhostButton testId="milestone-tasks-more" onClick={() => setMore((current) => !current)}>
                Assign existing task
              </GhostButton>
            </div>
          ) : null}
          {more && staff ? (
            <MoreMenu
              milestone={milestone}
              busy={busy}
              attachable={attachable}
              describedBy={error && !editing ? MENU_ERROR_ID : undefined}
              onPublish={() => edits.askPublish()}
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
        </div>
      ) : null}

      {tab === 'reviews' && staff ? (
        <section data-testid="milestone-reviews" className="flex flex-col gap-2">
          {(milestone.review?.history.length ?? 0) === 0 ? (
            <StateCard kicker="Reviews" title="No reviews yet" body="Approvals and change requests land here." />
          ) : (
            <ul className="flex flex-col" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {milestone.review?.history.map((item) => (
                <li key={`${item.iteration}-${item.decidedAt}`} style={{ borderTop: '1px solid var(--border)', padding: '12px 0' }}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="ds-mono" style={{ fontSize: 12, lineHeight: '18px' }}>
                      {`ITERATION ${item.iteration} · ${formatReviewStamp(item.decidedAt)}`}
                    </span>
                    <span className="ds-mono" style={{ border: '1px solid var(--border-2)', borderRadius: 999, padding: '3px 8px', fontSize: 12 }}>
                      {iterationOutcome({
                        iteration: item.iteration,
                        currentIteration: milestone.review?.iteration ?? item.iteration,
                        decision: item.decision,
                        status: milestone.status,
                      })}
                    </span>
                  </div>
                  {item.notes ? <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: '21px' }}>{item.notes}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {tab === 'activity' ? (
        <div className="flex flex-col gap-4">
          {staff ? (
            <MilestoneRunFeedLive
              milestoneId={milestone.id}
              planning={milestone.planning ?? null}
              fixtures={fixtures}
              hostSlug={hostSlug}
            />
          ) : null}
          <ActivityList
            items={[
              ...(staff && storedReview
                ? [
                    {
                      id: storedReview.id,
                      name: milestone.name,
                      type: 'milestone.decision',
                      summary: storedReview.note || storedReview.approval,
                      timestamp: reviewStamp(storedReview.decidedAt),
                      projectId: project.id,
                      milestoneId: milestone.id,
                    },
                  ]
                : []),
              ...milestoneActivity.filter((item) => item.id !== storedReview?.id),
            ]}
            empty="No activity on this milestone yet."
            error={activityError}
          />
        </div>
      ) : null}
      </div>

      {edits.overlay}
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
