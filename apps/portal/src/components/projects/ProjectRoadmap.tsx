'use client';

import { groupMilestones } from '@convex/_lib/milestoneTasks';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { fixtureMilestones } from '@/lib/data/milestoneRoadmap';
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
import { CreateMilestone } from './MilestoneForms';
import { MilestoneDetail } from './MilestoneDetailView';

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
  const nextRows = [...rows, ...attached];
  const flat = nextRows.flatMap((row) => [row, ...row.children]);
  return {
    ...base,
    rows: nextRows,
    openCount: flat.filter((row) => !row.isDone).length,
    doneCount: flat.filter((row) => row.isDone).length,
  };
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
  useEffect(() => {
    if (!fixtures) return;
    const params = new URLSearchParams(window.location.search);
    setDetailsPreview(params.get('details'));
    setTileStagePreview(params.get('tileStage'));
    setTileLinkPreview(params.get('tileLink'));
    setTileApprove(params.get('tiles') === 'ready');
    if (params.get('create') === 'milestone') setCreateOpen(true);
    const pane = params.get('pane') ?? params.get('tab');
    if (pane === 'details' || pane === 'milestones' || pane === 'resources' || pane === 'activity') setProjectTab(pane);
    setLoopPreview(params.get('loop'));
    if (params.get('tiles')) {
      window.setTimeout(() => {
        document.querySelector('[data-testid^="milestone-m-"]')?.scrollIntoView({ block: 'start' });
      }, 50);
    }
  }, [fixtures]);
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
  const attachedIds = new Set(milestones.flatMap((milestone) => milestone.rows.map((row) => row.id)));
  const unassigned = tasks.filter((task) => !task.parentTaskId && !attachedIds.has(task.id));
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
          onBack={() => setOpenMilestoneId(null)}
          onBackToProjects={page ? onBackToProjects : undefined}
          onFixture={(patch) => patchMilestone(selected.id, patch)}
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
                  <MilestoneListButton onClick={() => setCreateOpen(true)}>New milestone</MilestoneListButton>
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

              {!loading && !failed && staff && unassigned.length > 0 ? (
                <StateCard
                  testId="milestone-unassigned"
                  tone="warning"
                  kicker="STAFF · EXISTING TASKS"
                  title={`${unassigned.length} ${unassigned.length === 1 ? 'task needs' : 'tasks need'} a milestone`}
                  body="Assign existing tasks before they appear in the new flow. Do not guess which milestone they belong to."
                />
              ) : null}

              {groupMilestones(milestones, staff).map((group) => (
              <section key={group.id} data-testid={`milestone-group-${group.id}`} className="flex flex-col gap-4">
                <h2
                  className="ds-mono"
                  data-testid="milestone-group-label"
                  style={{ margin: 0, fontSize: 11, lineHeight: '17px', fontWeight: 400, letterSpacing: '0.04em', color: 'var(--muted)' }}
                >
                  {`${group.label} · ${group.milestones.length}`}
                </h2>
                <div className="flex flex-col gap-6 lg:gap-4">
                {group.milestones.map((milestone) => (
                  <MilestoneListCard
                    key={milestone.id}
                    milestone={milestone}
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
                ))}
                </div>
              </section>
              ))}

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
