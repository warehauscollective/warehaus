'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useMutation } from 'convex/react';
import { formatReviewStamp, isPeterEmail, iterationOutcome } from '@convex/_lib/milestoneReview';
import { peterMayApproveDeploy } from '@convex/_lib/previewLink';
import { localPreviewHint, tileLinkChangeDecision, type TileLinkField } from '@convex/_lib/tileLinks';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { userFacingErrorMessage } from '@convex/_lib/userFacingError';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { formatDueDate } from '@convex/_lib/milestoneDetails';
import { nextStatus, statusOptionLock, type MilestoneStatus } from '@convex/_lib/milestoneStatus';
import type { MilestoneRoadmapView, RoadmapChild } from '@convex/_lib/milestones';
import { ProjectBreadcrumb } from '@/components/nav/ProjectBreadcrumb';
import { PortalModal } from '@/components/ui/PortalModal';
import { OutlineButton, PrimaryButton } from '@/components/ui/primitives';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { useMaxWidth } from '@/lib/design/useMaxWidth';
import { useFixtureMilestonePreview } from '@/lib/data/fixtureMilestonePreview';
import { FIXTURE_CONTACTS, FIXTURE_PROJECTS } from '@/lib/data/fixtures';
import { fixtureMilestones } from '@/lib/data/milestoneRoadmap';
import { DueDateMenu, OwnerMenu, StatusMenu, anchoredMenuBox, menuButtons, nextDialogFocus, useMilestoneDetailEdits, type MoveTarget, type OwnerChoice } from './milestoneDetailsEdit';
import { type PortalTask } from '@/lib/data/view-models';
import { displayedTaskStatus } from '@/lib/data/taskStatus';
import { TileStatusControl, milestoneStatusGlyph, useMilestoneStatusMoves } from './MilestoneStatusControl';
import { MilestoneReviewLive, APPROVE_CONFIRM_COPY, APPROVE_CONFIRM_TITLE, RECORDING_APPROVAL, SAVING_APPROVAL_COPY } from './MilestoneReview';
import {
  FieldLabel,
  FieldValue,
  GhostButton,
  MenuActionError,
  MissingMilestoneApi,
  MilestoneListButton,
  PageHeading,
  Panel,
  StatusChip,
  StateCard,
  TabRow,
  fieldStyle,
} from './milestoneChrome';
import {
  activityForMilestone,
  boardCountsFromTasks,
  clientMilestoneEmptyKind,
  goalKey,
  MENU_ERROR_ID,
  milestoneQueryAvailability,
  milestoneResourceChoices,
  milestonesAfterQuery,
  localMonthDay,
  reviewStamp,
  tasksMenuFailure,
  storedMilestoneReview,
  tabIds,
} from './milestoneGuards';

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
  milestoneId?: string | null;
};

type ResourceChoice = { id: string; title: string };

type FixturePatch = Partial<
  Pick<
    MilestoneRoadmapView,
    | 'name'
    | 'objective'
    | 'goals'
    | 'status'
    | 'approval'
    | 'note'
    | 'approverName'
    | 'decidedAt'
    | 'publishToWarehaus'
    | 'resources'
    | 'ownerContactId'
    | 'ownerName'
    | 'dueDate'
    | 'creatorName'
    | 'localPreviewUrl'
    | 'figmaUrl'
  >
> & {
  attachedIds?: string[];
  detachedIds?: string[];
};

type ProjectTab = 'milestones' | 'resources' | 'activity' | 'details';
type MilestoneTab = 'overview' | 'tasks' | 'activity' | 'reviews';

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

function formatWhen(at: number | null): string | null {
  if (at == null) return null;
  return new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Name and decision day. A name alone is not a date. */
export function lastReviewLabel(input: { approverName: string | null; decidedAt: number | null }): string | null {
  const when = formatWhen(input.decidedAt);
  const name = input.approverName?.trim() ? input.approverName.trim() : null;
  if (name && when) return `${name} · ${when}`;
  return when ?? name;
}

/** A `YYYY-MM-DD` value is a calendar day, not a timestamp. */
function calendarDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatCalendarDate(value: string, withYear: boolean): string {
  const date = calendarDate(value);
  if (!date) return value;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' as const } : {}),
    timeZone: 'UTC',
  });
}

/** Project summary date. The list frame includes the year. */
function nextDueLabel(value?: string | null): string {
  if (!value) return '—';
  return formatCalendarDate(value, true);
}

function projectStatusLabel(status?: string | null): string {
  if (!status) return '—';
  if (/^in progress$/i.test(status)) return 'In progress';
  return status;
}

/** Staff and Peter see this while approval is stored and Shipped is not. */
export const AWAITING_MERGE_LINE = 'Approved · awaiting merge and deploy';

/** Clients see a ship date, never an approval date. */
export function clientTileDate(input: { status?: string | null; decidedAt?: number | null }): string | null {
  if (input.status !== 'Shipped') return null;
  if (input.decidedAt == null) return 'Shipped';
  return `Shipped ${localMonthDay(input.decidedAt).label}`;
}

/** Approved milestones show their decision day. Anything else has no date line. */
export function milestoneTileDate(input: {
  approval?: string | null;
  decidedAt?: number | null;
}): string | null {
  if (input.approval !== 'approved') return null;
  if (input.decidedAt == null) return 'Approved';
  return `Approved ${localMonthDay(input.decidedAt).label}`;
}

/**
 * Title-row date. Due while the milestone is open. Approved once it has
 * shipped. The awaiting-merge line stays in the status control, so this
 * returns null for that case.
 */
export function milestoneTileHeadline(input: {
  staff: boolean;
  approval?: string | null;
  status?: string | null;
  decidedAt?: number | null;
  dueDate?: string | null;
}): string | null {
  const awaiting = input.staff && input.approval === 'approved' && input.status !== 'Shipped';
  if (awaiting) return null;
  if (input.staff && input.approval === 'approved' && input.status === 'Shipped') {
    return milestoneTileDate({ approval: 'approved', decidedAt: input.decidedAt });
  }
  if (!input.staff && input.status === 'Shipped') {
    return clientTileDate({ status: 'Shipped', decidedAt: input.decidedAt });
  }
  if (!input.dueDate) return null;
  return `Due ${formatCalendarDate(input.dueDate, false)}`;
}

/**
 * The tile shows the same Status as the details panel. Shipped appears only
 * once it is stored. Approval is the review result, not a status.
 */
export function milestoneTileStatus(input: { status: MilestoneStatus }): { label: MilestoneStatus; glyph: string } {
  return { label: input.status, glyph: milestoneStatusGlyph(input.status) };
}

function progressBase(done: number, total: number, phone: boolean): string {
  return phone ? `${done} / ${total} tasks complete` : `${done} / ${total} complete`;
}

function progressNote(nested: number): string | null {
  if (nested === 1) return 'includes 1 subtask';
  if (nested > 1) return `includes ${nested} subtasks`;
  return null;
}

/** Desktop is `1 / 3 complete`. The phone chip adds the word tasks. Subtasks are named only when there is one. */
export function tileProgressLabel(done: number, total: number, nested: number, phone: boolean): string {
  const base = progressBase(done, total, phone);
  const note = progressNote(nested);
  return note ? `${base} · ${note}` : base;
}

/** The subtask phrase stays on one line. The chip may break after the dot. */
function ProgressCopy({ done, total, nested, phone }: { done: number; total: number; nested: number; phone: boolean }) {
  const note = progressNote(nested);
  const base = progressBase(done, total, phone);
  if (!note) return base;
  return (
    <>
      {base}
      {' · '}
      <span style={{ whiteSpace: 'nowrap' }}>{note}</span>
    </>
  );
}

/**
 * Tile meta is the resource count. The milestone has no last-updated
 * timestamp, so the date line stays Due or Approved and this line does not
 * invent one. Review phrases stay off the tile.
 */
export function tileMetaLine(input: { resources: number }): string {
  return resourceLabel(input.resources);
}

function resourceLabel(count: number): string {
  return count === 1 ? '1 resource' : `${count} resources`;
}

/** Core Links / Visibility tag, Staff only. Staff see it on unpublished tiles. Clients never do. */
function StaffOnlyChip() {
  return (
    <span
      data-testid="milestone-staff-only"
      className="inline-flex shrink-0 items-center"
      style={{
        gap: 5,
        boxSizing: 'border-box',
        height: 23,
        padding: '2px 7px',
        border: '1px solid var(--border-2)',
        borderRadius: 999,
        color: 'var(--muted)',
        fontFamily: 'var(--font-geist), var(--font-body)',
        fontWeight: 500,
        fontSize: 11,
        lineHeight: '17px',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 12,
          height: 12,
          flex: '0 0 12px',
          backgroundColor: 'currentColor',
          WebkitMaskImage: 'url(/icons/links-lock.svg)',
          maskImage: 'url(/icons/links-lock.svg)',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
          WebkitMaskSize: 'contain',
          maskSize: 'contain',
        }}
      />
      Staff only
    </span>
  );
}

/** Resource row under a milestone. Unpublished staff rows name the type and stay staff-only. */
export function resourceAudienceLine(type: string | null | undefined, staff: boolean, published: boolean): string {
  const kind = type?.trim() || 'Resource';
  if (!staff) return `${kind} · Shared with you`;
  return published ? `${kind} · Shared with client` : `${kind} · Staff only`;
}

function taskTotal(milestone: MilestoneRoadmapView): number {
  return milestone.openCount + milestone.doneCount;
}

/** Nested subtasks on the milestone rows. Lane badges on the board come from boardCountsFromTasks. */
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

/** Tasks the detach menu can unlink. A nested child is included only when it is linked to this milestone. */
export function milestoneDetachOptions(
  rows: readonly {
    id: string;
    name: string;
    onMilestone?: boolean;
    children?: readonly { id: string; name: string; onMilestone?: boolean }[];
  }[],
): { id: string; name: string }[] {
  return rows.flatMap((row) => [
    ...(row.onMilestone === false ? [] : [{ id: row.id, name: row.name }]),
    ...(row.children ?? [])
      .filter((child) => child.onMilestone === true)
      .map((child) => ({ id: child.id, name: child.name })),
  ]);
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

function fixtureOwnerChoices(projectId: string): OwnerChoice[] {
  const project = FIXTURE_PROJECTS.find((row) => row.id === projectId);
  if (!project) return [];
  return FIXTURE_CONTACTS.filter(
    (contact) =>
      contact.orgId === project.orgId &&
      contact.role === 'Warehaus Staff' &&
      contact.portalAccess === 'Enabled' &&
      !contact.syncHidden,
  ).map((contact) => ({ id: contact.id, name: contact.name }));
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
  viewerEmail?: string | null;
  activity?: readonly MilestoneActivityItem[];
  activityError?: string | null;
  onBackToProjects?: () => void;
  onOpenTask?: (task: PortalTask) => void;
  resourceChoices?: ResourceChoice[];
  resourcesExtra?: ReactNode;
  renderTasks?: (tasks: PortalTask[]) => ReactNode;
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
  const [tileStagePreview, setTileStagePreview] = useState<string | null>(null);
  const [tileLinkPreview, setTileLinkPreview] = useState<string | null>(null);
  const [tileApprove, setTileApprove] = useState(false);
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
    if (params.get('tiles')) {
      window.setTimeout(() => {
        document.querySelector('[data-testid^="milestone-m-"]')?.scrollIntoView({ block: 'start' });
      }, 50);
    }
  }, [fixtures]);
  const previewMilestoneId = fixtures ? fixtureRows[0]?.id ?? null : null;
  useEffect(() => {
    if (!detailsPreview || !previewMilestoneId) return;
    setOpenMilestoneId((current) => current ?? previewMilestoneId);
  }, [detailsPreview, previewMilestoneId]);

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
          tasks={tasks}
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
          renderTasks={renderTasks}
          onBack={() => setOpenMilestoneId(null)}
          onBackToProjects={page ? onBackToProjects : undefined}
          onFixture={(patch) => patchMilestone(selected.id, patch)}
        />
      ) : (
        <>
          <PageHeading
            measure
            title={project.name}
            subtitle="Project details · Every task belongs to a milestone"
            action={
              staff ? (
                <MilestoneListButton onClick={() => setCreateOpen(true)}>New milestone</MilestoneListButton>
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

              <div className="flex flex-col gap-6 lg:gap-4">
                {milestones.map((milestone, index) => (
                  <MilestoneListCard
                    key={milestone.id}
                    milestone={milestone}
                    staff={staff}
                    isPeter={isPeter || (fixtures && tileApprove)}
                    fixtures={fixtures}
                    stagePreview={index === 0 ? tileStagePreview : null}
                    linkPreview={index === 0 ? tileLinkPreview : null}
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

              {milestones.length > 0 ? (
                <p style={{ fontSize: 13, lineHeight: '20px', color: 'var(--muted)' }}>
                  {staff
                    ? 'Create milestones here. Open a milestone to see its tasks. The open count is not the decision.'
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

const TILE_MENU_WIDTH = 320;
const TILE_MENU_GAP = 8;

/** Place the desktop status menu inside the visible scroll area. Flip above the chip when the menu fits there and not below. */
export function tileStageMenuBox(input: {
  chip: { top: number; right: number; bottom: number };
  menu: { width: number; height: number };
  bounds: { top: number; right: number; bottom: number; left: number };
}): { top: number; left: number; placement: 'up' | 'down' } {
  const { chip, menu, bounds } = input;
  const spaceBelow = bounds.bottom - chip.bottom - TILE_MENU_GAP;
  const spaceAbove = chip.top - bounds.top - TILE_MENU_GAP;
  const placement = spaceBelow < menu.height && spaceAbove >= menu.height ? 'up' : 'down';
  let top = placement === 'up' ? chip.top - TILE_MENU_GAP - menu.height : chip.bottom + TILE_MENU_GAP;
  const minTop = bounds.top + TILE_MENU_GAP;
  const maxTop = Math.max(minTop, bounds.bottom - menu.height - TILE_MENU_GAP);
  top = Math.min(Math.max(top, minTop), maxTop);
  let left = chip.right - menu.width;
  const minLeft = bounds.left + TILE_MENU_GAP;
  const maxLeft = Math.max(minLeft, bounds.right - menu.width - TILE_MENU_GAP);
  left = Math.min(Math.max(left, minLeft), maxLeft);
  return { top, left, placement };
}

function visibleMenuBounds(anchor: HTMLElement): { top: number; right: number; bottom: number; left: number } {
  const scroll = anchor.closest('[data-page-scroll]');
  const scrollRect = scroll?.getBoundingClientRect();
  const top = scrollRect ? Math.max(0, scrollRect.top) : 0;
  const left = scrollRect ? Math.max(0, scrollRect.left) : 0;
  const right = scrollRect ? Math.min(window.innerWidth, scrollRect.right) : window.innerWidth;
  let bottom = scrollRect ? Math.min(window.innerHeight, scrollRect.bottom) : window.innerHeight;
  const dock = document.querySelector('[data-testid="portal-dock"]');
  if (dock instanceof HTMLElement && getComputedStyle(dock).visibility !== 'hidden') {
    const dockTop = dock.getBoundingClientRect().top;
    if (dockTop < bottom) bottom = dockTop;
  }
  return { top, right, bottom, left };
}

function TileStagePopover({
  anchorRef,
  children,
}: {
  anchorRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setHost(document.body);
  }, []);
  useLayoutEffect(() => {
    const menu = menuRef.current;
    const anchor = anchorRef.current;
    if (!menu || !anchor || !host) return;
    const place = () => {
      const chip = anchor.getBoundingClientRect();
      const box = tileStageMenuBox({
        chip: { top: chip.top, right: chip.right, bottom: chip.bottom },
        menu: { width: TILE_MENU_WIDTH, height: menu.offsetHeight },
        bounds: visibleMenuBounds(anchor),
      });
      menu.style.position = 'fixed';
      menu.style.top = `${box.top}px`;
      menu.style.left = `${box.left}px`;
      menu.style.right = 'auto';
      menu.style.bottom = 'auto';
      menu.style.width = `${TILE_MENU_WIDTH}px`;
      menu.style.zIndex = '60';
      menu.dataset.placement = box.placement;
    };
    place();
    const current = menu.querySelector<HTMLButtonElement>('[role="option"][aria-selected="true"]:not(:disabled)');
    current?.focus({ preventScroll: true });
    const scroll = anchor.closest('[data-page-scroll]');
    scroll?.addEventListener('scroll', place, { passive: true });
    window.addEventListener('resize', place);
    const observer = new ResizeObserver(place);
    observer.observe(menu);
    return () => {
      scroll?.removeEventListener('scroll', place);
      window.removeEventListener('resize', place);
      observer.disconnect();
    };
  }, [anchorRef, host]);
  const node = (
    <div
      ref={menuRef}
      className="ds-scope"
      data-testid="tile-stage-popover"
      style={{
        position: 'absolute',
        top: 'calc(100% + 8px)',
        right: 0,
        width: TILE_MENU_WIDTH,
        zIndex: 40,
        background: 'transparent',
      }}
    >
      {children}
    </div>
  );
  return host ? createPortal(node, host) : node;
}

function TileLinkIcon({ kind }: { kind: 'preview' | 'figma' }) {
  const preview = kind === 'preview';
  return (
    <svg width={preview ? 12 : 16} height={preview ? 12 : 16} viewBox={preview ? '0 0 12 12' : '0 0 16 16'} fill="none" aria-hidden="true" style={preview ? undefined : { color: 'var(--muted)' }}>
      {preview ? (
        <>
          <rect x="1" y="2" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" />
          <path d="M5 4.5L7.2 5.5L5 6.5V4.5Z" fill="currentColor" />
          <path d="M4 10.5H8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </>
      ) : (
        <path d="M2 5.5V3H6M10 3H14V5.5M14 9.5V12H10M6 12H2V9.5" stroke="currentColor" strokeWidth="1.33" />
      )}
    </svg>
  );
}

function initialTileMenu(preview?: string | null): boolean {
  return preview === 'menu';
}

const TILE_LINK_SAVE_ERROR = 'Couldn’t save the link. Nothing changed.';

export function MilestoneListCard({
  milestone,
  staff,
  isPeter = false,
  fixtures = false,
  onOpen,
  onSetStatus,
  onAdvance,
  onApprove,
  onSetLink,
  openConfirm = false,
  phone = false,
  cover = false,
  stagePreview = null,
  linkPreview = null,
}: {
  milestone: MilestoneRoadmapView;
  staff: boolean;
  isPeter?: boolean;
  fixtures?: boolean;
  onOpen: () => void;
  /** Staff pick a status from the menu, or undo a play. `expected` is the status last seen. */
  onSetStatus?: (status: MilestoneStatus, expected: MilestoneStatus) => void | Promise<unknown>;
  /** The play button. One step forward from `expected` to `next`. */
  onAdvance?: (expected: MilestoneStatus, next: MilestoneStatus) => void | Promise<unknown>;
  onApprove?: (iteration: number) => Promise<unknown>;
  /** Staff set or clear a tile link. Empty url clears it. */
  onSetLink?: (field: TileLinkField, url: string | null) => void | Promise<unknown>;
  /** Fixture QA opens the one confirm without a click. */
  openConfirm?: boolean;
  /** Fixture phone sheet. The live tile follows the viewport. */
  phone?: boolean;
  /** Fixture dialog stays inside its frame instead of covering the page. */
  cover?: boolean;
  /** Fixture QA. `menu` opens the status menu. */
  stagePreview?: string | null;
  /** Fixture QA. `focus` opens the link modal. `error` opens it on the save failure. */
  linkPreview?: string | null;
}) {
  const [confirm, setConfirm] = useState(openConfirm);
  const [linkField, setLinkField] = useState<TileLinkField | null>(null);
  const [linkDraft, setLinkDraft] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const viewportSheet = useMaxWidth(767);
  // The tile chip switches at lg (1024). Below that, the phone pill is the one on screen.
  const tilePhone = useMaxWidth(1023);
  const phoneSheet = phone || tilePhone;
  const [stageMenuOpen, setStageMenuOpen] = useState(() => (staff ? initialTileMenu(stagePreview) : false));
  const menuAnchorRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const desktopMenuWasOpen = useRef(false);
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  useEffect(() => {
    if (!staff || stagePreview !== 'menu') return;
    setConfirm(false);
    setStageMenuOpen(true);
  }, [staff, stagePreview]);
  useEffect(() => {
    if (!fixtures || (linkPreview !== 'focus' && linkPreview !== 'error')) return;
    setLinkField('localPreview');
    setLinkDraft(linkPreview === 'error' ? 'http://localhost:3200' : '');
    setLinkError(linkPreview === 'error' ? TILE_LINK_SAVE_ERROR : null);
  }, [fixtures, linkPreview]);
  useEffect(() => {
    if (phoneSheet) {
      desktopMenuWasOpen.current = false;
      return;
    }
    if (stageMenuOpen) {
      desktopMenuWasOpen.current = true;
      return;
    }
    if (!desktopMenuWasOpen.current) return;
    desktopMenuWasOpen.current = false;
    const chip = chipRef.current;
    chip?.focus({ preventScroll: true });
    const frame = window.requestAnimationFrame(() => chip?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [stageMenuOpen, phoneSheet]);
  useEffect(() => {
    if (!stageMenuOpen || phoneSheet) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (target instanceof Element && target.closest('[data-testid="tile-stage-popover"]')) return;
      if (target instanceof Element && target.closest('[data-milestone-status-trigger]')) return;
      setStageMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setStageMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [stageMenuOpen, phoneSheet]);
  const canDeploy = peterMayApproveDeploy({
    staff,
    isPeter,
    status: milestone.status,
    approval: milestone.approval,
    previewUrl: milestone.review?.previewUrl,
  });
  const confirmDeploy = () => {
    if (fixtures || !milestone.review || !onApprove) {
      setConfirm(false);
      return;
    }
    setDeploying(true);
    setDeployError(null);
    void onApprove(milestone.review.iteration).then(() => setConfirm(false)).catch((err) => {
      setDeployError(userFacingErrorMessage(err, 'Couldn’t save your approval. Nothing changed. Try again.'));
    }).finally(() => setDeploying(false));
  };
  const total = taskTotal(milestone);
  const moves = useMilestoneStatusMoves({
    status: milestone.status,
    onAdvance: (expected) => onAdvance?.(expected, nextStatus(expected) ?? expected),
    onSet: (next, expected) => onSetStatus?.(next, expected),
  });
  const stage = milestoneTileStatus({ status: moves.shown });
  const subtasks = boardTaskCounts(milestone).nested;
  const awaitingMerge = staff && milestone.approval === 'approved' && milestone.status !== 'Shipped';
  const dateLine = milestoneTileHeadline({
    staff,
    approval: milestone.approval,
    status: milestone.status,
    decidedAt: milestone.decidedAt,
    dueDate: milestone.dueDate,
  });
  const meta = tileMetaLine({ resources: milestone.resources.length });
  const showStaffOnly = staff && milestone.publishToWarehaus === false;
  const localUrl = staff ? milestone.localPreviewUrl ?? null : null;
  const figmaUrl = staff ? milestone.figmaUrl ?? null : null;
  const previewHint = staff ? localPreviewHint(localUrl) : null;
  const openLinkEditor = (field: TileLinkField) => {
    setLinkError(null);
    setLinkDraft(field === 'localPreview' ? (localUrl ?? '') : (figmaUrl ?? ''));
    setLinkField(field);
  };
  const writeLink = async (field: TileLinkField, url: string | null) => {
    if (linkBusy) return;
    setLinkBusy(true);
    setLinkError(null);
    try {
      await onSetLink?.(field, url);
      setLinkField(null);
    } catch (err) {
      setLinkError(userFacingErrorMessage(err, TILE_LINK_SAVE_ERROR));
    } finally {
      setLinkBusy(false);
    }
  };
  const saveLink = () => {
    if (!linkField || linkBusy) return;
    const decision = tileLinkChangeDecision({
      field: linkField,
      from: linkField === 'localPreview' ? localUrl : figmaUrl,
      to: linkDraft,
    });
    if (!decision.ok) {
      setLinkError(decision.reason);
      return;
    }
    if (!decision.wrote) {
      setLinkField(null);
      return;
    }
    void writeLink(linkField, decision.url);
  };
  const closeStageMenu = () => setStageMenuOpen(false);
  const toggleMenu = () => {
    setConfirm(false);
    moves.clearError();
    setStageMenuOpen((current) => !current);
  };
  const pickStatus = (next: MilestoneStatus) => {
    if (statusOptionLock(next)) return;
    setStageMenuOpen(false);
    void moves.pick(next).catch(() => undefined);
  };
  const showDeploy = confirm && !stageMenuOpen;
  const stageTrigger = staff ? (
    <TileStatusControl
      status={stage.label}
      saving={moves.saving}
      open={stageMenuOpen}
      onToggle={toggleMenu}
      playTo={moves.playTo}
      onPlay={() => {
        setStageMenuOpen(false);
        moves.play();
      }}
      buttonRef={chipRef}
      bare={canDeploy}
    />
  ) : (
    <StatusChip label={stage.label} glyph={stage.glyph} />
  );
  const approveButton = canDeploy ? (
    <button
      type="button"
      data-testid="tile-approve-deploy"
      onClick={() => { setStageMenuOpen(false); setConfirm(true); }}
      style={{ width: '100%', height: 42, border: 0, borderRadius: 0, background: '#f59e0b', color: '#0a0a0b', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
    >
      Approve & deploy
    </button>
  ) : null;
  const linkButtonStyle = (dimmed: boolean): CSSProperties => ({
    boxSizing: 'border-box',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    height: 32,
    border: '1px solid var(--border-2)',
    borderRadius: 9,
    padding: '0 10px',
    background: 'transparent',
    color: 'var(--fg)',
    fontFamily: 'var(--font-mono), ui-monospace, monospace',
    fontSize: 11,
    lineHeight: '16px',
    letterSpacing: '0.04em',
    textDecoration: 'none',
    cursor: 'pointer',
    opacity: dimmed ? 0.4 : 1,
  });
  return (
    <article
      data-testid={`milestone-${milestone.id}`}
      className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_max-content] lg:items-start lg:justify-start lg:gap-x-6 lg:gap-y-0"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--panel-radius, 12px)',
        padding: 24,
      }}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex min-w-0 flex-nowrap items-center justify-between gap-3">
          <h2 data-testid="milestone-name" className="text-[21px] leading-[32px] lg:text-[20px] lg:leading-[30px]" style={{ fontFamily: 'var(--font-geist), var(--font-body)', fontWeight: 500 }}>
            {milestone.name}
          </h2>
          {dateLine ? (
            <p data-testid="milestone-due" className="shrink-0" style={{ fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>
              {dateLine}
            </p>
          ) : null}
        </div>
        <p data-testid="milestone-objective" style={{ fontSize: 14, lineHeight: '21px', color: 'var(--muted)' }}>
          {milestone.objective}
        </p>
        {meta ? (
          <div className={showStaffOnly ? 'flex min-w-0 max-w-full items-center' : undefined} style={showStaffOnly ? { gap: 16 } : undefined}>
            <p
              data-testid="milestone-meta"
              className="min-w-0 max-w-full truncate"
              style={{ margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--muted)', overflowWrap: 'anywhere' }}
            >
              {meta}
            </p>
            {showStaffOnly ? <StaffOnlyChip /> : null}
          </div>
        ) : null}
        <div className="flex w-full min-w-0 flex-col items-start gap-4 md:flex-row md:flex-wrap md:items-center">
          <MilestoneListButton tone="outline" onClick={onOpen}>
            {stage.label === 'Ready to Ship' ? (
              <>
                <span className="lg:hidden">Open milestone</span>
                <span className="hidden lg:inline">Milestone Details</span>
              </>
            ) : (
              'Open milestone'
            )}
          </MilestoneListButton>
          {staff ? (
            localUrl ? (
              <a data-testid="milestone-local-preview" className="lg:order-1" href={localUrl} style={linkButtonStyle(false)}>
                <TileLinkIcon kind="preview" />
                <span className="lg:hidden">Preview</span>
                <span className="hidden lg:inline">Local preview</span>
              </a>
            ) : (
              <button type="button" data-testid="milestone-local-preview" className="lg:order-1" onClick={() => openLinkEditor('localPreview')} style={linkButtonStyle(true)}>
                <TileLinkIcon kind="preview" />
                <span className="lg:hidden">Preview</span>
                <span className="hidden lg:inline">Local preview</span>
              </button>
            )
          ) : null}
          {staff && figmaUrl ? (
            <a data-testid="milestone-figma" className="lg:order-3" href={figmaUrl} target="_blank" rel="noreferrer" style={linkButtonStyle(false)}>
              <TileLinkIcon kind="figma" />
              Figma
            </a>
          ) : null}
          {previewHint ? (
            <span data-testid="milestone-preview-hint" className="lg:order-2" style={{ fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>
              {previewHint}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex w-full flex-col items-start gap-3 lg:ml-auto lg:w-max lg:min-w-[174px] lg:items-end">
        <div className="relative w-full" ref={menuAnchorRef}>
          {canDeploy ? (
            <div
              data-testid="milestone-stage-action"
              className="w-full lg:w-[174px]"
              style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid var(--border-2)', borderRadius: 9, background: 'var(--surface)' }}
            >
              {stageTrigger}
              {approveButton}
            </div>
          ) : stageTrigger}
          {staff && stageMenuOpen && !phoneSheet ? (
            <TileStagePopover anchorRef={menuAnchorRef}>
              <StatusMenu current={stage.label} onPick={pickStatus} onClose={closeStageMenu} />
            </TileStagePopover>
          ) : null}
        </div>
        {awaitingMerge ? (
          <p
            data-testid="milestone-awaiting"
            style={{
              margin: 0,
              width: '100%',
              boxSizing: 'border-box',
              border: '1px solid var(--border)',
              borderRadius: 9,
              padding: '8px 10px',
              fontSize: 12,
              lineHeight: '18px',
              color: 'var(--fg)',
            }}
          >
            {AWAITING_MERGE_LINE}
          </p>
        ) : null}
        <span
          className="ds-mono max-w-full whitespace-normal lg:w-max lg:max-w-none lg:whitespace-nowrap"
          data-testid="milestone-progress"
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
          <span className="lg:hidden">
            <ProgressCopy done={milestone.doneCount} total={total} nested={subtasks} phone />
          </span>
          <span className="hidden lg:inline">
            <ProgressCopy done={milestone.doneCount} total={total} nested={subtasks} phone={false} />
          </span>
        </span>
      </div>
      {linkField ? (
        <PortalModal
          testId="milestone-tile-link"
          label={linkField === 'localPreview' ? 'Local preview' : 'Figma'}
          onClose={() => {
            if (!linkBusy) setLinkField(null);
          }}
          narrow={viewportSheet}
          sheet="bottom"
          width={480}
          showFooter={false}
          blueFocus
          locked={linkBusy}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '8px 24px 20px' }}>
            <input
              data-testid="milestone-tile-link-input"
              value={linkDraft}
              onChange={(event) => {
                setLinkDraft(event.target.value);
                if (linkError) setLinkError(null);
              }}
              placeholder={linkField === 'localPreview' ? 'http://localhost:3200' : 'https://www.figma.com/design/…'}
              style={{ ...fieldStyle, width: '100%' }}
              disabled={linkBusy}
            />
            {linkError ? (
              <p role="alert" data-testid="milestone-tile-link-error" style={{ margin: 0, color: 'var(--danger-text)', fontSize: 13, lineHeight: '18px' }}>
                {linkError}
              </p>
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              {(linkField === 'localPreview' ? localUrl : figmaUrl) ? (
                <OutlineButton
                  nowrap
                  onClick={() => {
                    if (!linkField || linkBusy) return;
                    void writeLink(linkField, null);
                  }}
                >
                  Clear
                </OutlineButton>
              ) : null}
              <OutlineButton nowrap onClick={() => { if (!linkBusy) setLinkField(null); }}>Cancel</OutlineButton>
              <button type="button" onClick={saveLink} disabled={linkBusy} style={{ background: 'var(--accent)', color: 'var(--accent-fg)', border: 0, borderRadius: 9, padding: '8px 14px', fontSize: 14, cursor: 'pointer', opacity: linkBusy ? 0.4 : 1 }}>
                Save
              </button>
            </div>
          </div>
        </PortalModal>
      ) : null}
      {moves.error ? (
        <p role="alert" data-testid="tile-status-error" className="lg:col-span-2" style={{ margin: 0, color: 'var(--danger-text)', fontSize: 13, lineHeight: '18px' }}>
          {moves.error}
        </p>
      ) : null}
      {staff ? moves.toast : null}
      {showDeploy ? (
        <PortalModal
          testId="milestone-deploy-confirm"
          label={deploying ? RECORDING_APPROVAL : APPROVE_CONFIRM_TITLE}
          onClose={() => {
            if (!deploying) setConfirm(false);
          }}
          narrow={phone || viewportSheet}
          sheet="bottom"
          header="compact"
          blueFocus
          showIcon={deploying}
          icon="spinner"
          showFooter={false}
          cover={cover}
          focusCancel
          locked={deploying}
          onConfirm={confirmDeploy}
          confirmOnEnter
        >
          <div style={{ padding: phone || viewportSheet ? '8px 16px' : '8px 24px' }}>
            {deploying ? (
              <>
                <p style={{ margin: 0, fontSize: 14, lineHeight: '21px' }}>{SAVING_APPROVAL_COPY}</p>
              </>
            ) : (
              <>
                <p style={{ margin: 0, fontSize: 14, lineHeight: '21px' }}>{APPROVE_CONFIRM_COPY}</p>
                <p style={{ margin: 0, fontSize: 14, lineHeight: '21px' }}>You can’t undo this from the Portal.</p>
              </>
            )}
            {deployError ? <p role="alert" style={{ color: 'var(--danger-text)', fontSize: 14 }}>{deployError}</p> : null}
          </div>
          <div style={{ display: 'flex', flexWrap: 'nowrap', justifyContent: 'flex-end', gap: 8, padding: phone || viewportSheet ? '16px 16px 24px' : '16px 24px 20px' }}>
            {deploying ? null : <OutlineButton nowrap onClick={() => setConfirm(false)}>Cancel</OutlineButton>}
            <button type="button" disabled={deploying} onClick={confirmDeploy} className="inline-flex shrink-0 items-center justify-center gap-2" style={{ background: '#f59e0b', color: '#0a0a0b', border: 0, borderRadius: 9, padding: '8px 14px', fontSize: 14, whiteSpace: 'nowrap', opacity: deploying ? 0.4 : 1 }}>
              {deploying ? 'Approving…' : 'Approve & deploy'}
            </button>
          </div>
        </PortalModal>
      ) : null}
      {stageMenuOpen && phoneSheet ? (
        <PortalModal
          testId="tile-stage-menu"
          scrimTestId="tile-stage-scrim"
          label="Status"
          onClose={closeStageMenu}
          narrow
          sheet="bottom"
          showFooter={false}
          cover={cover}
        >
          <StatusMenu current={stage.label} onPick={pickStatus} onClose={closeStageMenu} sheet />
        </PortalModal>
      ) : null}
    </article>
  );
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
};

function MilestoneDetail(props: {
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
  onOpenTask?: (task: PortalTask) => void;
  resourceChoices: ResourceChoice[];
  renderTasks?: (tasks: PortalTask[]) => ReactNode;
  onBack: () => void;
  onBackToProjects?: () => void;
  onFixture: (patch: FixturePatch) => void;
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
      mutations={{ save, setPublish, setStatus, advance, setOwner, setDueDate, setTileLink, moveProject, attachTask, detachTask, attachPreviewLink, clearPreviewLink }}
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
  renderTasks,
  onBack,
  onBackToProjects,
  onFixture,
  mutations,
  isPeter,
}: {
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
  onOpenTask?: (task: PortalTask) => void;
  resourceChoices: ResourceChoice[];
  renderTasks?: (tasks: PortalTask[]) => ReactNode;
  onBack: () => void;
  onBackToProjects?: () => void;
  onFixture: (patch: FixturePatch) => void;
  mutations: MilestoneMutations;
  isPeter?: boolean;
}) {
  const { save, setPublish, attachTask, detachTask } = mutations;
  const [tab, setTab] = useState<MilestoneTab>('overview');
  const [editing, setEditing] = useState(false);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The review card has its own phone layout. It does not follow CSS breakpoints.
  const phone = useMaxWidth(767);
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
        <ProjectBreadcrumb
          back={{ label: `‹ ${project.name}`, onClick: onBack }}
          trail={[
            { label: 'Projects', onClick: onBackToProjects, testId: 'nav-breadcrumb-parent' },
            { label: project.name, onClick: onBack, testId: 'nav-breadcrumb-middle' },
            { label: 'Milestones', testId: 'nav-breadcrumb-current' },
          ]}
        />
      ) : null}
      <PageHeading
        alignAction
        testId="milestone-name"
        title={milestone.name}
        subtitle={`Milestone · ${inclusiveProgressCopy(milestone.doneCount, total, recordBoard.nested)}`}
        action={undefined}
      />
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
          {staff && milestone.review ? (
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
                  <p data-testid="milestone-counts" style={{ marginTop: 8, fontSize: 13, lineHeight: '20px', color: 'var(--muted)' }}>
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
          {staff ? (
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>
              Assign an existing task from More. A task that is not attached does not appear on this milestone.
            </p>
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

export function MoreMenu({
  milestone,
  busy,
  attachable,
  describedBy,
  onPublish,
  onAttach,
  onDetach,
}: {
  milestone: MilestoneRoadmapView;
  busy: boolean;
  attachable: { id: string; name: string }[];
  describedBy?: string;
  onPublish: () => void;
  onAttach: (taskId: string) => void;
  onDetach: (taskId: string) => void;
}) {
  return (
    <Panel>
      <div className="flex flex-col gap-4">
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
        {milestoneDetachOptions(milestone.rows).length > 0 ? (
          <label className="flex flex-col gap-2" style={{ fontSize: 13, color: 'var(--muted)' }}>
            Remove from milestone
            <select
              data-testid="milestone-detach"
              defaultValue=""
              aria-describedby={describedBy}
              disabled={busy}
              onChange={(event) => {
                const taskId = event.target.value;
                event.target.value = '';
                if (taskId) onDetach(taskId);
              }}
              style={fieldStyle}
            >
              <option value="">Choose a task</option>
              {milestoneDetachOptions(milestone.rows).map((task) => (
                <option key={task.id} value={task.id}>
                  {task.name}
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
              {staff && child.onMilestone ? (
                <button type="button" data-testid="milestone-detach-subtask" disabled={busy} onClick={() => onDetach(child.id)} style={textButton}>
                  Remove from milestone
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function resourceSummary(ids: readonly string[], choices: readonly ResourceChoice[]): string {
  if (ids.length === 0) return 'No resources attached yet';
  const titles = ids
    .map((id) => choices.find((choice) => choice.id === id)?.title)
    .filter((title): title is string => Boolean(title));
  return titles.length > 0 ? titles.join(', ') : `${ids.length} attached`;
}

function AttachResourcesModal({
  choices,
  resourceIds,
  phone,
  onChange,
  onClose,
}: {
  choices: readonly ResourceChoice[];
  resourceIds: readonly string[];
  phone: boolean;
  onChange: (ids: string[]) => void;
  onClose: () => void;
}) {
  return (
    <PortalModal
      testId="milestone-attach-dialog"
      label="Attach resources"
      onClose={onClose}
      narrow={phone}
      sheet="bottom"
      width={760}
      header="default"
      blueFocus
      panelStyle={{ padding: '8px 24px 16px' }}
      footer={
        <div className="flex flex-wrap gap-2">
          <OutlineButton onClick={onClose}>Done</OutlineButton>
        </div>
      }
    >
      {choices.length === 0 ? (
        <p style={{ margin: 0, fontSize: 14, lineHeight: '21px', color: 'var(--muted)' }}>No resources to attach.</p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Project resources">
          {choices.map((choice) => {
            const selected = resourceIds.includes(choice.id);
            return (
              <li key={choice.id}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onChange(selected ? resourceIds.filter((id) => id !== choice.id) : [...resourceIds, choice.id])}
                  className="milestone-field flex w-full items-center gap-3 text-left"
                  style={{
                    border: selected ? '1px solid var(--fg)' : '1px solid var(--border)',
                    borderRadius: 12,
                    padding: '10px 12px',
                    background: selected ? 'var(--surface-2)' : 'transparent',
                    color: 'var(--fg)',
                    cursor: 'pointer',
                  }}
                >
                  <span className="min-w-0 flex-1" style={{ fontSize: 14, fontWeight: 500 }}>{choice.title}</span>
                  <span style={{ fontSize: 13, color: selected ? 'var(--fg)' : 'var(--muted)' }}>{selected ? 'Selected' : 'Attach'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </PortalModal>
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
  const [attachOpen, setAttachOpen] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const objectiveRef = useRef<HTMLTextAreaElement>(null);
  const goalsRef = useRef<HTMLTextAreaElement>(null);
  const phone = useMaxWidth(767);
  return (
    <>
    <PortalModal
      testId="milestone-edit-dialog"
      label="Edit all details"
      onClose={onClose}
      narrow={phone}
      sheet="bottom"
      width={760}
      header="default"
      blueFocus
      hidden={attachOpen}
      panelStyle={{ padding: '8px 24px 16px' }}
      footer={
        <div className="flex flex-wrap gap-2">
          <OutlineButton disabled={busy} onClick={onClose}>
            Cancel
          </OutlineButton>
          <PrimaryButton type="submit" form="milestone-edit-form" disabled={busy}>
            Save milestone
          </PrimaryButton>
        </div>
      }
    >
      <form
        id="milestone-edit-form"
        data-testid="milestone-edit-form"
        className="flex flex-col gap-4"
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
          onOpenAttach={() => setAttachOpen(true)}
        />
        {error ? <FormAlert>{error}</FormAlert> : null}
        {saveError ? <FormAlert>{saveError}</FormAlert> : null}
      </form>
    </PortalModal>
    {attachOpen ? (
      <AttachResourcesModal
        choices={choices}
        resourceIds={resourceIds}
        phone={phone}
        onChange={setResourceIds}
        onClose={() => setAttachOpen(false)}
      />
    ) : null}
    </>
  );
}

function createDialogBounds(anchor: HTMLElement): { top: number; right: number; bottom: number; left: number } {
  const dialog = anchor.closest('[role="dialog"]');
  const dialogRect = dialog?.getBoundingClientRect();
  const header = dialog?.querySelector('[data-modal-header]');
  const footer = dialog?.querySelector('[data-testid="portal-modal-footer"]');
  const top = header ? header.getBoundingClientRect().bottom : (dialogRect?.top ?? 0);
  const bottom = footer ? footer.getBoundingClientRect().top : (dialogRect?.bottom ?? window.innerHeight);
  return {
    top,
    right: dialogRect?.right ?? window.innerWidth,
    bottom,
    left: dialogRect?.left ?? 0,
  };
}

/** Desktop owner and due menus. Portaled so the dialog footer cannot cover them. */
export function FieldMenu({
  anchorRef,
  onClose,
  children,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [host, setHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setHost(document.body);
  }, []);
  useLayoutEffect(() => {
    const menu = menuRef.current;
    const anchor = anchorRef.current;
    if (!menu || !anchor || !host || typeof anchor.getBoundingClientRect !== 'function') return;
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const box = anchoredMenuBox({
        anchor: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
        menu: { width: rect.width, height: menu.offsetHeight },
        bounds: createDialogBounds(anchor),
        align: 'left',
      });
      menu.style.position = 'fixed';
      menu.style.top = `${box.top}px`;
      menu.style.left = `${box.left}px`;
      menu.style.width = `${rect.width}px`;
      menu.style.zIndex = '90';
      menu.dataset.placement = box.placement;
    };
    place();
    menu.querySelector<HTMLElement>('[data-menu-initial-focus]')?.focus({ preventScroll: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    observer?.observe(menu);
    window.addEventListener('resize', place);
    const scroll = anchor.closest('[data-portal-modal-body]');
    scroll?.addEventListener('scroll', place);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', place);
      scroll?.removeEventListener('scroll', place);
    };
  }, [anchorRef, host]);
  useEffect(() => {
    if (!host) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onCloseRef.current();
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [anchorRef, host]);
  useEffect(() => {
    const anchor = anchorRef.current;
    return () => {
      const target = returnFocus.current ?? anchor;
      target?.focus({ preventScroll: true });
      window.requestAnimationFrame(() => target?.focus({ preventScroll: true }));
    };
  }, [anchorRef]);
  if (!host) return null;
  return createPortal(
    <div
      ref={menuRef}
      className="ds-scope"
      data-testid="milestone-field-menu"
      data-menu-layer=""
      style={{ background: 'transparent' }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          returnFocus.current = anchorRef.current;
          onCloseRef.current();
          return;
        }
        if (event.key === 'Tab') {
          event.preventDefault();
          event.stopPropagation();
          const anchor = anchorRef.current;
          returnFocus.current = anchor ? nextDialogFocus(anchor, event.shiftKey) : null;
          onCloseRef.current();
          return;
        }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        const items = menuButtons(menuRef.current);
        const index = items.indexOf(document.activeElement as HTMLElement);
        if (index < 0 || items.length === 0) return;
        event.preventDefault();
        const next = event.key === 'ArrowDown' ? index + 1 : index - 1;
        items[(next + items.length) % items.length]?.focus({ preventScroll: true });
      }}
    >
      {children}
    </div>,
    host,
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
  const ownerQuery = useSafeQuery<OwnerChoice[]>(
    api.milestones.ownerChoices,
    fixtures ? 'skip' : { projectId, hostSlug },
  );
  const people = fixtures ? fixtureOwnerChoices(projectId) : (ownerQuery.data ?? []);
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const [goals, setGoals] = useState('');
  const [resourceIds, setResourceIds] = useState<string[]>([]);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [layer, setLayer] = useState<'form' | 'attach' | 'owner' | 'due'>('form');
  const [fieldErrors, setFieldErrors] = useState<MilestoneFieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const objectiveRef = useRef<HTMLTextAreaElement>(null);
  const goalsRef = useRef<HTMLTextAreaElement>(null);
  const ownerAnchor = useRef<HTMLButtonElement>(null);
  const dueAnchor = useRef<HTMLButtonElement>(null);
  const phone = useMaxWidth(767);
  const ownerName = ownerId ? people.find((person) => person.id === ownerId)?.name ?? null : null;
  const menuSwapped = layer === 'attach' || (phone && (layer === 'owner' || layer === 'due'));
  const picker = (kind: 'owner' | 'due') => (
    kind === 'owner' ? (
      <OwnerMenu
        people={people}
        currentId={ownerId}
        sheet={phone}
        foot="Saved when you create the milestone."
        onPick={(id) => {
          setOwnerId(id);
          setLayer('form');
        }}
        onClose={() => setLayer('form')}
      />
    ) : (
      <DueDateMenu
        value={dueDate}
        sheet={phone}
        foot="Saved when you create the milestone."
        onPick={(next) => {
          setDueDate(next);
          setLayer('form');
        }}
        onClose={() => setLayer('form')}
      />
    )
  );
  return (
    <>
    <PortalModal
      testId="milestone-create-dialog"
      label="New milestone"
      onClose={onClose}
      narrow={phone}
      sheet="bottom"
      width={760}
      header="default"
      blueFocus
      hidden={menuSwapped}
      panelStyle={{ padding: '8px 24px 16px' }}
      footer={
        <div className="flex flex-wrap gap-2">
          <OutlineButton disabled={busy} onClick={onClose}>
            Cancel
          </OutlineButton>
          <PrimaryButton type="submit" form="milestone-create" disabled={busy}>
            Create milestone
          </PrimaryButton>
        </div>
      }
    >
      <form
        id="milestone-create"
        data-testid="milestone-create"
        className="flex flex-col gap-4"
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
              status: 'Planning',
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
              ownerContactId: ownerId,
              ownerName,
              dueDate,
              creatorName: people[0]?.name ?? null,
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
            ...(ownerId ? { ownerContactId: ownerId as Id<'contacts'> } : {}),
            ...(dueDate ? { dueDate } : {}),
          })
            .then(() => onClose())
            .catch((err: unknown) => {
              setError(userFacingErrorMessage(err, 'Could not create the milestone.'));
            })
            .finally(() => setBusy(false));
        }}
      >
        <p style={{ fontSize: 14, lineHeight: '21px', color: 'var(--muted)' }}>
          Describe the outcome. Tasks are added on the milestone.
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
          onOpenAttach={() => setLayer('attach')}
          plan={
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="relative flex flex-col gap-2">
                <span style={{ fontSize: 14 }}>Owner</span>
                <button
                  ref={ownerAnchor}
                  type="button"
                  data-testid="milestone-create-owner"
                  className="milestone-field milestone-picker text-left"
                  data-open={layer === 'owner' ? 'true' : 'false'}
                  onClick={() => setLayer(layer === 'owner' ? 'form' : 'owner')}
                  style={pickerFieldStyle}
                >
                  {ownerName ?? 'Choose a person'}
                </button>
                {layer === 'owner' && !phone ? <FieldMenu anchorRef={ownerAnchor} onClose={() => setLayer('form')}>{picker('owner')}</FieldMenu> : null}
              </div>
              <div className="relative flex flex-col gap-2">
                <span style={{ fontSize: 14 }}>Due date</span>
                <button
                  ref={dueAnchor}
                  type="button"
                  data-testid="milestone-create-due"
                  className="milestone-field milestone-picker text-left"
                  data-open={layer === 'due' ? 'true' : 'false'}
                  onClick={() => setLayer(layer === 'due' ? 'form' : 'due')}
                  style={pickerFieldStyle}
                >
                  {formatDueDate(dueDate) ?? 'Choose a date'}
                </button>
                {layer === 'due' && !phone ? <FieldMenu anchorRef={dueAnchor} onClose={() => setLayer('form')}>{picker('due')}</FieldMenu> : null}
              </div>
            </div>
          }
        />
        <p
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 16,
            fontSize: 13,
            lineHeight: '20px',
            color: 'var(--muted)',
          }}
        >
          The milestone is saved first. Its tasks are added on the milestone.
        </p>
        {error ? <FormAlert>{error}</FormAlert> : null}
      </form>
    </PortalModal>
    {layer === 'attach' ? (
      <AttachResourcesModal
        choices={resourceChoices}
        resourceIds={resourceIds}
        phone={phone}
        onChange={setResourceIds}
        onClose={() => setLayer('form')}
      />
    ) : null}
    {phone && layer === 'owner' ? (
      <PortalModal testId="milestone-create-owner-sheet" label="Owner" onClose={() => setLayer('form')} narrow sheet="bottom" width={390} blueFocus>
        {picker('owner')}
      </PortalModal>
    ) : null}
    {phone && layer === 'due' ? (
      <PortalModal testId="milestone-create-due-sheet" label="Due date" onClose={() => setLayer('form')} narrow sheet="bottom" width={390} blueFocus>
        {picker('due')}
      </PortalModal>
    ) : null}
    </>
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
    <p data-testid="milestone-error" role="alert" style={{ margin: 0, fontSize: 13, lineHeight: '18px', color: 'var(--danger-text)' }}>
      {children}
    </p>
  );
}

function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <span id={id} role="alert" style={{ fontSize: 13, lineHeight: '18px', color: 'var(--danger-text)' }}>
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
  onOpenAttach,
  plan,
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
  onOpenAttach: () => void;
  plan?: ReactNode;
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
          className="milestone-field"
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
          rows={2}
          className="milestone-field"
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
          rows={2}
          className="milestone-field"
          placeholder="Describe the acceptance criteria for this milestone."
          style={{ ...fieldStyle, resize: 'vertical' }}
        />
        {fieldErrors.goals ? <FieldError id="milestone-goals-error">{fieldErrors.goals}</FieldError> : null}
      </label>
      {plan}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <FieldLabel>RESOURCES</FieldLabel>
          <p data-testid="milestone-resource-count" aria-live="polite" style={{ margin: '4px 0 0', fontSize: 14, lineHeight: '21px' }}>
            {resourceSummary(resourceIds, choices)}
          </p>
        </div>
        <OutlineButton testId="milestone-attach-resources" onClick={onOpenAttach}>
          Attach resources
        </OutlineButton>
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
        <p data-testid="activity-error" style={{ fontSize: 14, color: 'var(--danger-text)' }}>
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
        <span data-testid="milestone-task-status">{displayedTaskStatus(row.status, row.stage)}</span>
        {row.stage ? <span data-testid="milestone-task-stage">{row.stage}</span> : null}
        {row.source === 'portal-review' ? <span data-testid="review-tag" className="ds-mono" style={{ border: '1px solid var(--border-2)', borderRadius: 999, padding: '2px 8px' }}>From review</span> : null}
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

/** Form picker trigger. The outline comes from `.milestone-picker`, not from inline style. */
const pickerFieldStyle: CSSProperties = { ...fieldStyle, border: undefined, borderRadius: undefined, cursor: 'pointer' };

const textButton = {
  background: 'none',
  border: 0,
  padding: 0,
  color: 'var(--muted)',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: 13,
} as const;
