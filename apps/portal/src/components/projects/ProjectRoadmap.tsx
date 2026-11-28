'use client';

import { groupMilestones } from '@convex/_lib/milestoneTasks';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMaxWidth } from '@/lib/design/useMaxWidth';
import { clearSearchParam, replaceSearch } from '@/lib/nav/clearSearchParam';
import { MILESTONE_PARAM, milestoneFromSearch } from '@/lib/nav/portalLink';
import { DoneGroup } from './DoneGroup';
import { NeedMilestoneBanner } from './NeedMilestoneBanner';
import {
  attachedMilestoneTaskIds,
  readNeedBannerDismissed,
  tasksNeedingMilestone,
  writeNeedBannerDismissed,
} from './needMilestone';
import {
  listedTaskCount,
  milestoneCloseoutState,
  parkedMilestoneTarget,
  RESTORED_MILESTONE_STATUS,
} from '@convex/_lib/closeout';
import { ArchivedChip, MilestoneCloseout } from '@/components/closeout/CloseoutControls';
import {
  useMilestoneCloseoutActions,
  useTaskCloseoutActions,
  type MilestoneCloseoutActions,
} from '@/components/closeout/closeoutActions';
import { CloseoutToastHost } from '@/components/closeout/closeoutToast';
import { ArchivedMilestoneRow, ArchivedTaskRow, type ArchivedProjectView, type ArchivedTask } from './ArchivedView';
import { useMutation } from 'convex/react';
import { isPeterEmail } from '@convex/_lib/milestoneReview';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import type { MilestoneRoadmapView, RoadmapChild } from '@convex/_lib/milestones';
import { ProjectBreadcrumb } from '@/components/nav/ProjectBreadcrumb';
import { PrimaryButton } from '@/components/ui/primitives';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { useFixtureMilestonePreview } from '@/lib/data/fixtureMilestonePreview';
import { fixtureMilestones, withRows } from '@/lib/data/milestoneRoadmap';
import { type PortalTask } from '@/lib/data/view-models';
import { ContextIncompleteChip, GrillingPromptModal, ProjectContextTab, useProjectContext } from './ProjectContext';
import {
  FieldLabel,
  FieldValue,
  MissingMilestoneApi,
  MilestoneListButton,
  PageHeading,
  StateCard,
  TabRow,
} from './milestoneChrome';
import {
  clientMilestoneEmptyKind,
  milestoneQueryAvailability,
  milestonesAfterQuery,
  tabIds,
} from './milestoneGuards';
import { type RoadmapProject, type MilestoneActivityItem, type ResourceChoice, type FixturePatch, nextDueLabel, projectStatusLabel } from './milestoneTile';
import { ProjectResources, ActivityList } from './roadmapParts';
import { MilestoneListCard } from './MilestoneListCard';
import { MilestoneFilterBar, MilestoneFiltersEmpty, type MilestoneListViewChange } from './MilestoneFilterBar';
import { approvalNeedsYou } from './milestoneDetailsEdit';
import {
  emptyMilestoneListView,
  milestoneFilterResult,
  sameMilestoneListView,
  type MilestoneListView,
} from '@/lib/data/milestoneFilters';
import {
  milestoneViewFromSearch,
  openingMilestoneView,
  readStoredMilestoneView,
  searchWithMilestoneView,
  searchWithoutMilestoneFilters,
  sessionMilestoneViewStore,
  writeStoredMilestoneView,
} from '@/lib/data/milestoneFilterAddress';
import { CreateMilestone } from './MilestoneForms';
import { MilestoneDetail } from './MilestoneDetailView';
import { RunnerHealth } from './RunnerStatus';
import { DeployToMain } from './DeployToMain';

export { lastReviewLabel, AWAITING_MERGE_LINE, clientTileDate, milestoneTileDate, milestoneTileHeadline, milestoneTileStatus, tileProgressLabel, tileMetaLine, resourceAudienceLine, milestoneDetachOptions, inclusiveProgressCopy } from './milestoneTile';
export type { MilestoneActivityItem } from './milestoneTile';
export { tileStageMenuBox, MilestoneListCard } from './MilestoneListCard';
export { MoreMenu, FieldMenu } from './MilestoneForms';
export { MilestoneDetailView } from './MilestoneDetailView';

const APPROVAL_LABEL = {
  unreviewed: 'Unreviewed',
  approved: 'Approved',
  changes_requested: 'Changes requested',
} as const;

type ProjectTab = 'milestones' | 'resources' | 'activity' | 'details';

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
  const rows = base.rows
    .filter((row) => !detached.has(row.id))
    .map((row) => ({ ...row, children: row.children.filter((child) => !detached.has(child.id)) }));
  const present = new Set(rows.flatMap((row) => [row.id, ...row.children.map((child) => child.id)]));
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
  return withRows(base, [...rows, ...attached]);
}

/** Fixture rows that are not real tasks still count on the milestone tab. */
function withRowTasks(
  tasks: readonly PortalTask[],
  milestone: MilestoneRoadmapView,
  project: RoadmapProject,
): PortalTask[] {
  const ids = new Set(tasks.map((task) => task.id));
  const extra = milestone.rows.flatMap((row) => [row, ...row.children]).filter((row) => !ids.has(row.id));
  if (extra.length === 0) return tasks as PortalTask[];
  return [
    ...tasks,
    ...extra.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      isDone: row.isDone,
      date: null,
      projectId: project.id,
      projectName: project.name,
      projectStatus: project.status ?? null,
      projectEndDate: project.endDate ?? null,
    })),
  ];
}

export function ProjectRoadmap({
  project,
  tasks,
  staff,
  fixtures,
  live,
  hostSlug,
  clientName,
  viewerEmail = null,
  activity = [],
  activityError = null,
  onBackToProjects,
  onOpenTask,
  resourceChoices = [],
  resourcesExtra,
  details,
}: {
  project: RoadmapProject;
  tasks: readonly PortalTask[];
  staff: boolean;
  fixtures: boolean;
  live: boolean;
  hostSlug?: string;
  clientName?: string | null;
  viewerEmail?: string | null;
  activity?: readonly MilestoneActivityItem[];
  activityError?: string | null;
  onBackToProjects?: () => void;
  onOpenTask?: (task: PortalTask) => void;
  resourceChoices?: ResourceChoice[];
  resourcesExtra?: ReactNode;
  details?: ReactNode;
}) {
  const auth = usePortalAuth();
  const isPeter = isPeterEmail(auth.authUser?.email);
  const approveMilestone = useMutation(api.milestones.approve);
  const approveDesign = useMutation(api.milestones.approveDesign);
  const requestDesignChanges = useMutation(api.milestones.requestDesignChanges);
  const setMilestoneStatus = useMutation(api.milestones.setStatus);
  const advanceMilestone = useMutation(api.milestones.advance);
  const setTileLink = useMutation(api.milestones.setTileLink);
  const [patches, setPatches] = useState<Record<string, FixturePatch>>({});
  const [created, setCreated] = useState<MilestoneRoadmapView[]>([]);
  const [projectTab, setProjectTab] = useState<ProjectTab>('milestones');
  const [openMilestoneId, setOpenMilestoneId] = useState<string | null>(null);
  const [detailsPreview, setDetailsPreview] = useState<string | null>(null);
  const [loopPreview, setLoopPreview] = useState<string | null>(null);
  const [tileStagePreview, setTileStagePreview] = useState<string | null>(null);
  const [tileLinkPreview, setTileLinkPreview] = useState<string | null>(null);
  const [tileApprove, setTileApprove] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [grillingOpen, setGrillingOpen] = useState(false);
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const [needDismissed, setNeedDismissed] = useState(searchParams.get('banner') === 'dismissed');
  const [hideNeedBanner, setHideNeedBanner] = useState(searchParams.get('banner') === 'hidden');
  const [doneExpanded, setDoneExpanded] = useState(searchParams.get('done') === 'open');
  const [milestoneLayout, setMilestoneLayout] = useState<'list' | 'board'>(
    searchParams.get('layout') === 'board' ? 'board' : 'list',
  );
  // The milestone filters. Kept in the address and, per project, for the session. Not saved in Convex.
  const [milestoneView, setMilestoneView] = useState<MilestoneListView>(
    () => milestoneViewFromSearch(searchParams.toString(), staff) ?? emptyMilestoneListView(),
  );
  // True while filters from the address or the session may open Done, until the viewer picks or toggles Done.
  const [openedFiltered, setOpenedFiltered] = useState(true);
  // The address without the filter params, as last read. A filter pick rewrites the address and must not reset the rest.
  const pageSearchRead = useRef<string | null>(null);
  const phone = useMaxWidth(767);
  const projectContext = useProjectContext({ projectId: project.id, staff, fixtures, live, hostSlug });
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
  const fixtureBase = useMemo(
    () => (fixtures ? fixtureMilestones(project, tasks, staff ? 'staff' : 'client') : []),
    [fixtures, project, tasks, staff],
  );
  const fixtureRows = useFixtureMilestonePreview(fixtureBase, fixtures);
  const milestoneActions = useMilestoneCloseoutActions(hostSlug);
  const taskActions = useTaskCloseoutActions(hostSlug);
  // The Archived filter. Staff only. A deployment without the query shows no chip.
  const archivedQuery = useSafeQuery<ArchivedProjectView>(
    api.milestones.listArchivedForProject,
    live && staff ? { projectId, hostSlug } : 'skip',
  );
  const [showArchived, setShowArchived] = useState(false);
  const [fixtureArchivedIds, setFixtureArchivedIds] = useState<string[]>([]);
  // Dismiss lasts for the session, per project. Read after mount so the server and first client render match.
  useEffect(() => {
    if (readNeedBannerDismissed(project.id)) setNeedDismissed(true);
  }, [project.id]);
  useEffect(() => {
    const params = new URLSearchParams(searchKey);
    // The filters: the address wins, then the view kept for this project this session. Unknown values drop.
    const store = sessionMilestoneViewStore();
    const opening = openingMilestoneView({
      search: searchKey,
      stored: readStoredMilestoneView(store, project.id, staff),
      staff,
    });
    setMilestoneView((current) => (sameMilestoneListView(current, opening.view) ? current : opening.view));
    if (opening.from !== 'none') setOpenedFiltered(true);
    if (opening.from === 'address') writeStoredMilestoneView(store, project.id, opening.view);
    if (opening.from === 'stored') replaceSearch(searchWithMilestoneView(window.location.search, opening.view, staff));
    // The rest is read again only when something other than the filters changed.
    const pageSearch = `${fixtures}|${project.id}|${searchWithoutMilestoneFilters(searchKey)}`;
    if (pageSearchRead.current === pageSearch) return;
    pageSearchRead.current = pageSearch;
    setMilestoneLayout(params.get('layout') === 'board' ? 'board' : 'list');
    setDoneExpanded(params.get('done') === 'open');
    // `?milestone=<id>` (a warehaus://milestone link from the Mac app) opens that milestone.
    const linked = milestoneFromSearch(searchKey);
    if (linked) setOpenMilestoneId(linked);
    if (!fixtures) return;
    setNeedDismissed(params.get('banner') === 'dismissed' || readNeedBannerDismissed(project.id));
    setHideNeedBanner(params.get('banner') === 'hidden');
    setDetailsPreview(params.get('details'));
    setTileStagePreview(params.get('tileStage'));
    setTileLinkPreview(params.get('tileLink'));
    setTileApprove(params.get('tiles') === 'ready' || params.has('gate'));
    if (params.get('create') === 'milestone') setCreateOpen(true);
    const pane = params.get('pane') ?? params.get('tab');
    if (pane === 'details' || pane === 'milestones' || pane === 'resources' || pane === 'activity') setProjectTab(pane);
    setLoopPreview(params.get('loop'));
    if (params.get('tiles')) {
      window.setTimeout(() => {
        document.querySelector('[data-testid^="milestone-m-"]')?.scrollIntoView({ block: 'start' });
      }, 50);
    }
  }, [fixtures, searchKey, project.id, staff]);
  const previewMilestoneId = fixtures ? fixtureRows[0]?.id ?? null : null;
  useEffect(() => {
    if ((!detailsPreview && !loopPreview) || !previewMilestoneId) return;
    setOpenMilestoneId((current) => current ?? previewMilestoneId);
  }, [detailsPreview, loopPreview, previewMilestoneId]);

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
  const fixtureAll = fixtures
    ? [...fixtureRows, ...created].map((row) => applyFixtureTasks(row, tasks, patches[row.id]))
    : [];
  const milestones = fixtures
    ? fixtureAll.filter((row) => !fixtureArchivedIds.includes(row.id))
    : milestonesAfterQuery({
        data: query.data,
        error: query.error,
        loading: query.loading,
        previous: rememberedMilestones.current,
      });
  const selected = milestones.find((milestone) => milestone.id === openMilestoneId) ?? null;
  const approvedCount = milestones.filter((milestone) => milestone.approval === 'approved').length;
  const archivedMilestones: ArchivedProjectView['milestones'] = fixtures
    ? fixtureAll.filter((row) => fixtureArchivedIds.includes(row.id)).map((row) => ({ ...row, archivedAt: 0 }))
    : (archivedQuery.data?.milestones ?? []);
  const archivedTasks: ArchivedTask[] = fixtures ? [] : (archivedQuery.data?.tasks ?? []);
  const liveMilestoneIds = new Set(milestones.map((milestone) => milestone.id));
  const archivedWithMilestone = new Set(archivedMilestones.map((milestone) => `${milestone.id}:${milestone.archivedAt}`));
  // Archived tasks with no live milestone to list them under. A task archived with its milestone comes back with it.
  const looseArchivedTasks = archivedTasks.filter(
    (task) =>
      !task.parentTaskId &&
      (!task.milestoneId || !liveMilestoneIds.has(task.milestoneId)) &&
      !archivedWithMilestone.has(`${task.milestoneId}:${task.archivedAt}`),
  );
  const archivedCount = archivedMilestones.length + looseArchivedTasks.length;
  const archivedView = staff && showArchived && archivedCount > 0;
  // A task on an archived milestone has a milestone. It is not asked for one.
  const projectMilestoneIds = new Set([
    ...milestones.map((milestone) => milestone.id),
    ...archivedMilestones.map((milestone) => milestone.id),
  ]);
  const attachedIds = attachedMilestoneTaskIds([...milestones, ...archivedMilestones]);
  const needingMilestone = tasksNeedingMilestone(tasks, projectMilestoneIds, attachedIds);
  const needCount = hideNeedBanner ? 0 : needingMilestone.length;
  // Needs you is an open Ask on the viewer. The approval Ask is the one the loaded list can show.
  const askEmail = viewerEmail ?? auth.authUser?.email ?? null;
  const filterRows = staff
    ? milestones.map((milestone) => ({
        ...milestone,
        needsYou: approvalNeedsYou({ milestone, viewerEmail: askEmail }) != null,
      }))
    : milestones;
  const filters = milestoneFilterResult<MilestoneRoadmapView>(filterRows, milestoneView, staff);
  // A pick: hold it, keep it for the session, and write it to the address. Replace, so Back still leaves the project.
  const keepMilestoneView = (next: MilestoneListView) => {
    setMilestoneView(next);
    setOpenedFiltered(false);
    writeStoredMilestoneView(sessionMilestoneViewStore(), project.id, next);
    replaceSearch(searchWithMilestoneView(window.location.search, next, staff));
  };
  // Filters that came with the page (a shared link, a reload, a return visit) open Done the same way a pick does.
  const doneOpen = doneExpanded || (openedFiltered && filters.onlyShipped);
  const changeMilestoneView: MilestoneListViewChange = (update) => {
    const next = update(milestoneView);
    // Results only in Done would sit behind its collapsed row. A Done that is open stays open.
    if (doneOpen || milestoneFilterResult(filterRows, next, staff).onlyShipped) setDoneExpanded(true);
    keepMilestoneView(next);
  };
  const clearMilestoneView = () => {
    if (doneOpen) setDoneExpanded(true);
    keepMilestoneView(emptyMilestoneListView());
  };
  const toggleDone = () => {
    setOpenedFiltered(false);
    setDoneExpanded(!doneOpen);
  };
  // Only the groups, their counts and the board read the matches. The rest of the page reads `milestones`.
  const milestoneGroups = groupMilestones(filters.matches, staff);
  const openGroups = milestoneGroups.filter((group) => group.id !== 'shipped');
  const shippedGroup = milestoneGroups.find((group) => group.id === 'shipped');
  const boardLayout = milestoneLayout === 'board';
  const stackBoard = boardLayout && phone && doneOpen;
  const projectActivity = activity.filter((item) => item.projectId === project.id);
  const loading = !fixtures && (live ? query.loading : true) && milestones.length === 0;
  const failed = !fixtures && live && query.error != null;
  const archivedChip =
    staff && archivedCount > 0 ? (
      <ArchivedChip active={archivedView} count={archivedCount} onClick={() => setShowArchived((shown) => !shown)} />
    ) : null;
  // No bar while loading, on a load error with no list, with no milestones, or in the Archived view.
  const showFilterBar = !loading && milestones.length > 0 && !archivedView;

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

  const closeoutActions = (milestone: MilestoneRoadmapView, archived: boolean): MilestoneCloseoutActions => {
    if (!fixtures) return milestoneActions(milestone);
    // Fixture previews have no Convex. The change and its Undo stay on this page.
    const previous = milestone.status;
    return {
      markComplete: async () => {
        patchMilestone(milestone.id, { status: 'Shipped' });
        return async () => patchMilestone(milestone.id, { status: previous });
      },
      archive: async () => {
        setFixtureArchivedIds((ids) => [...ids, milestone.id]);
        return async () => setFixtureArchivedIds((ids) => ids.filter((id) => id !== milestone.id));
      },
      restore: async () => {
        if (archived) {
          setFixtureArchivedIds((ids) => ids.filter((id) => id !== milestone.id));
          return async () => setFixtureArchivedIds((ids) => [...ids, milestone.id]);
        }
        patchMilestone(milestone.id, { status: RESTORED_MILESTONE_STATUS });
        return async () => patchMilestone(milestone.id, { status: previous });
      },
    };
  };
  const parkedTargets = milestones.map((milestone) => ({ id: milestone.id, name: milestone.name, status: milestone.status }));
  const closeoutControl = (milestone: MilestoneRoadmapView, archived = false) => (
    <MilestoneCloseout
      name={milestone.name}
      state={milestoneCloseoutState({ status: milestone.status, archived })}
      open={milestone.openCount}
      total={listedTaskCount(milestone.rows)}
      parkedMilestone={parkedMilestoneTarget(parkedTargets, milestone.id) != null}
      actions={closeoutActions(milestone, archived)}
    />
  );

  const milestoneCard = (milestone: MilestoneRoadmapView, narrow = false) => (
    <MilestoneListCard
      key={milestone.id}
      milestone={milestone}
      narrow={narrow}
      closeout={staff ? closeoutControl(milestone) : null}
      staff={staff}
      isPeter={isPeter || (fixtures && tileApprove)}
      fixtures={fixtures}
      stagePreview={milestone.id === milestones[0]?.id ? tileStagePreview : null}
      linkPreview={milestone.id === milestones[0]?.id ? tileLinkPreview : null}
      onOpen={() => setOpenMilestoneId(milestone.id)}
      onSetStatus={async (status, expectedStatus) => {
        if (fixtures) {
          patchMilestone(milestone.id, { status });
          return;
        }
        await setMilestoneStatus({
          hostSlug,
          milestoneId: milestone.id as Id<'milestones'>,
          status,
          expectedStatus,
        });
      }}
      onAdvance={async (expectedStatus, next) => {
        if (fixtures) {
          patchMilestone(milestone.id, { status: next });
          return;
        }
        await advanceMilestone({
          hostSlug,
          milestoneId: milestone.id as Id<'milestones'>,
          expectedStatus,
        });
      }}
      onApprove={(iteration) =>
        approveMilestone({
          hostSlug,
          milestoneId: milestone.id as Id<'milestones'>,
          iteration,
          notes: '',
        })
      }
      onApproveDesign={async () => {
        if (fixtures) {
          patchMilestone(milestone.id, { designApprovedAt: Date.now() });
          return;
        }
        await approveDesign({ hostSlug, milestoneId: milestone.id as Id<'milestones'> });
      }}
      onRequestDesignChanges={async ({ notes, taskIds, newTasks }) => {
        if (fixtures) return;
        await requestDesignChanges({
          hostSlug,
          milestoneId: milestone.id as Id<'milestones'>,
          notes,
          taskIds: taskIds as Id<'tasks'>[],
          newTasks,
        });
      }}
      onSetLink={async (field, url) => {
        if (fixtures) {
          patchMilestone(
            milestone.id,
            field === 'localPreview' ? { localPreviewUrl: url } : { figmaUrl: url },
          );
          return;
        }
        await setTileLink({
          hostSlug,
          milestoneId: milestone.id as Id<'milestones'>,
          field,
          url,
        });
      }}
    />
  );

  const page = Boolean(onBackToProjects);
  // Add repo on the runner chip: the repository setting sits on Project details.
  const openRepoSetting = () => {
    setProjectTab('details');
    window.setTimeout(() => {
      document.querySelector('[data-testid="project-repo-setting"]')?.scrollIntoView({ block: 'center' });
    }, 50);
  };

  return (
    <section data-testid="project-roadmap" className="flex flex-col gap-6">
      {page && !selected ? (
        <ProjectBreadcrumb
          back={{ label: '‹ Projects', onClick: () => onBackToProjects?.() }}
          trail={[
            { label: 'Projects', onClick: () => onBackToProjects?.(), testId: 'nav-breadcrumb-parent' },
            { label: project.name, testId: 'nav-breadcrumb-current' },
          ]}
        />
      ) : null}

      {selected ? (
        <MilestoneDetail
          milestone={selected}
          project={project}
          tasks={fixtures ? withRowTasks(tasks, selected, project) : tasks}
          staff={staff}
          fixtures={fixtures}
          hostSlug={hostSlug}
          isPeter={isPeter}
          viewerEmail={viewerEmail}
          clientName={clientName ?? project.clientName ?? null}
          preview={detailsPreview}
          activity={projectActivity}
          activityError={activityError}
          onOpenTask={onOpenTask}
          resourceChoices={resourceChoices}
          onBack={() => {
            setOpenMilestoneId(null);
            clearSearchParam(MILESTONE_PARAM);
          }}
          onBackToProjects={page ? onBackToProjects : undefined}
          onFixture={(patch) => patchMilestone(selected.id, patch)}
          closeout={staff ? closeoutControl(selected) : null}
          archivedTasks={archivedTasks.filter((task) => task.milestoneId === selected.id)}
          taskCloseout={fixtures ? undefined : taskActions}
        />
      ) : (
        <>
          <PageHeading
            measure
            title={project.name}
            subtitle={
              page && projectTab === 'resources'
                ? staff
                  ? 'Brief, glossary, decisions and resources for this project'
                  : 'Resources for this project'
                : 'Project details · Every task belongs to a milestone'
            }
            action={
              staff ? (
                page && projectTab === 'resources' ? (
                  <MilestoneListButton onClick={() => setGrillingOpen(true)}>Start grilling</MilestoneListButton>
                ) : (
                  <div data-testid="project-heading-actions" className="flex min-w-0 flex-col items-start gap-6 lg:flex-row lg:items-center lg:gap-4">
                    <RunnerHealth
                      projectId={project.id}
                      staff={staff}
                      fixtures={fixtures}
                      live={live}
                      hostSlug={hostSlug}
                      onAddRepo={page && details ? openRepoSetting : undefined}
                    />
                    <DeployToMain projectId={project.id} staff={staff} fixtures={fixtures} live={live} hostSlug={hostSlug} />
                    <MilestoneListButton onClick={() => setCreateOpen(true)}>New milestone</MilestoneListButton>
                  </div>
                )
              ) : null
            }
          />
          {page && staff && projectTab === 'resources' && projectContext.view?.summary.incomplete ? (
            <ContextIncompleteChip />
          ) : null}
          {grillingOpen ? <GrillingPromptModal project={project} onClose={() => setGrillingOpen(false)} /> : null}
          {page ? (
            <TabRow
              label="Project"
              idPrefix="project"
              active={projectTab}
              onChange={(id) => setProjectTab(id as ProjectTab)}
              tabs={[
                { id: 'milestones', label: 'Milestones' },
                { id: 'resources', label: 'Context' },
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
            <ProjectContextTab
              project={project}
              staff={staff}
              fixtures={fixtures}
              hostSlug={hostSlug}
              context={projectContext}
              resources={<ProjectResources project={project} extra={resourcesExtra} />}
            />
          ) : null}
          {projectTab === 'activity' && page ? (
            <ActivityList items={projectActivity} empty="No activity on this project yet." error={activityError} />
          ) : null}
          {projectTab === 'details' && page ? details : null}

          {projectTab === 'milestones' || !page ? (
            <div className="flex flex-col gap-6">
              <section
                data-testid="project-summary-panel"
                className="box-border p-4 lg:p-6"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--panel-radius, 12px)',
                }}
              >
                <div className="grid grid-cols-[155px_155px] gap-4 lg:grid-cols-4 lg:gap-8">
                  <div className="hidden lg:block">
                    <FieldLabel>CLIENT</FieldLabel>
                    <FieldValue>{clientName || project.clientName || '—'}</FieldValue>
                  </div>
                  <div className="hidden lg:block">
                    <FieldLabel>PROJECT STATUS</FieldLabel>
                    <FieldValue>{projectStatusLabel(project.status)}</FieldValue>
                  </div>
                  <div>
                    <FieldLabel>MILESTONES</FieldLabel>
                    <FieldValue>
                      {milestones.length === 0 ? 'None yet' : `${approvedCount} of ${milestones.length} approved`}
                    </FieldValue>
                  </div>
                  <div>
                    <FieldLabel>NEXT DUE</FieldLabel>
                    <FieldValue>{nextDueLabel(project.endDate)}</FieldValue>
                  </div>
                </div>
              </section>

              {loading ? (
                <p style={{ fontSize: 14, color: 'var(--muted)' }}>Loading milestones</p>
              ) : null}
              {failed ? (
                <p data-testid="milestone-query-error" style={{ fontSize: 14, color: 'var(--danger-text)' }}>
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
                    body="Describe an outcome, attach resources and let its tasks show the work needed to finish it."
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
                    kicker="PROJECT · NO MILESTONES"
                    title="No milestones shared yet"
                    body="Nothing on this project has been shared with you yet. Check back when a milestone is published."
                  />
                )
              ) : null}

              {!loading && !failed && staff ? (
                <NeedMilestoneBanner
                  count={needCount}
                  dismissed={needDismissed}
                  onDismiss={() => {
                    setNeedDismissed(true);
                    writeNeedBannerDismissed(project.id);
                  }}
                />
              ) : null}

              {showFilterBar ? (
                <MilestoneFilterBar
                  view={filters.shown}
                  options={filters.options}
                  staff={staff}
                  onChange={changeMilestoneView}
                  onClear={clearMilestoneView}
                >
                  {archivedChip}
                </MilestoneFilterBar>
              ) : (
                archivedChip
              )}

              {archivedView ? (
                <section data-testid="archived-view" className="flex flex-col gap-4">
                  {archivedMilestones.map((milestone) => (
                    <ArchivedMilestoneRow
                      key={milestone.id}
                      milestone={milestone}
                      actions={closeoutActions(milestone, true)}
                    />
                  ))}
                  {looseArchivedTasks.length > 0 ? (
                    <ul
                      data-testid="archived-tasks"
                      style={{
                        listStyle: 'none',
                        margin: 0,
                        padding: '0 24px',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--panel-radius, 12px)',
                      }}
                    >
                      {looseArchivedTasks.map((task, index) => (
                        <ArchivedTaskRow key={task.id} task={task} first={index === 0} actions={taskActions(task.id)} />
                      ))}
                    </ul>
                  ) : null}
                </section>
              ) : filters.noMatches ? (
                <MilestoneFiltersEmpty onClear={clearMilestoneView} />
              ) : boardLayout ? (
                <div
                  data-testid="milestone-board"
                  className={stackBoard ? 'flex flex-col gap-4' : 'flex items-stretch gap-4'}
                >
                  <div className={phone && !stackBoard ? 'flex min-w-0 flex-1 flex-col gap-4' : stackBoard ? 'flex w-full flex-col gap-4' : 'flex w-[358px] shrink-0 flex-col gap-4'}>
                    {openGroups.flatMap((group) => group.milestones).map((milestone) => milestoneCard(milestone, true))}
                  </div>
                  {shippedGroup ? (
                    <DoneGroup
                      count={shippedGroup.milestones.length}
                      layout="board"
                      expanded={doneOpen}
                      stacked={stackBoard}
                      onToggle={toggleDone}
                    >
                      {shippedGroup.milestones.map((milestone) => milestoneCard(milestone, true))}
                    </DoneGroup>
                  ) : null}
                </div>
              ) : (
                <>
                  {openGroups.map((group) => (
                    <section key={group.id} data-testid={`milestone-group-${group.id}`} className="flex flex-col gap-4">
                      <h2
                        className="ds-mono"
                        data-testid="milestone-group-label"
                        style={{ margin: 0, fontSize: 11, lineHeight: '17px', fontWeight: 400, letterSpacing: '0.04em', color: 'var(--muted)' }}
                      >
                        {`${group.label} · ${group.milestones.length}`}
                      </h2>
                      <div className="flex flex-col gap-6 lg:gap-4">
                        {group.milestones.map((milestone) => milestoneCard(milestone))}
                      </div>
                    </section>
                  ))}
                  {shippedGroup ? (
                    <DoneGroup
                      count={shippedGroup.milestones.length}
                      layout="list"
                      expanded={doneOpen}
                      onToggle={toggleDone}
                    >
                      {shippedGroup.milestones.map((milestone) => milestoneCard(milestone))}
                    </DoneGroup>
                  ) : null}
                </>
              )}

              {milestones.length > 0 ? (
                <p style={{ fontSize: 13, lineHeight: '20px', color: 'var(--muted)' }}>
                  {staff
                    ? 'Create milestones here or from Grok Bot / Claude. Tasks only exist inside a milestone.'
                    : 'The open count is not the decision. Approving a milestone does not close its tasks.'}
                </p>
              ) : null}
            </div>
          ) : null}
          </div>
        </>
      )}

      {staff ? <CloseoutToastHost /> : null}
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
