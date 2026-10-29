'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useMutation } from 'convex/react';
import { OutlineButton, Surface } from '@/components/ui/primitives';
import { PortalTilePane, PortalWorkspace } from '@/components/layout/PortalWorkspace';
import { usePortalView } from '@/components/providers/PortalViewProvider';
import {
  activeKpiCaption,
  awaitingKpiCaption,
  projectFilterCounts,
  projectInitials,
  projectListKpis,
  projectListErrorMode,
  projectListQueryError,
  projectListShowsKpis,
  requestProjectCreate,
  EDIT_PROJECT_WRITEBACK_HINT,
  projectListMeta,
  projectMatchesFilter,
  projectProgress,
  projectProgressCopy,
  projectSummaryVisibility,
  projectTaskCount,
  projectTasksSubtitle,
  shippedKpiCaption,
  showProjectPublish,
  sortProjectsByLastUpdated,
  viewerProjects,
  type ProjectListFilter,
} from '@/lib/data/projectList';
import { tenantEyebrow, usePortalData } from '@/hooks/usePortalData';
import { projectsForViewer, viewerIsStaff } from '@/lib/data/portalSnapshotCache';
import { useRetryPortalData } from '@/components/providers/PortalDataRetry';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { getHostSlugFromLocation } from '@/lib/auth/host-slug';
import { isConvexConfigured } from '@/lib/convex/client';
import { useFixturePreview } from '@/components/providers/FixturePreviewProvider';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { useStaffCrossOrg } from '@/hooks/useStaffCrossOrg';
import { api } from '@convex/_generated/api';
import { FIXTURE_CLIENTS, FIXTURE_CONTACTS, FIXTURE_DOCS, FIXTURE_PROJECTS, FIXTURE_RESOURCES, FIXTURE_TASKS } from '@/lib/data/fixtures';
import { warehausLead } from '@/lib/data/clientDetail';
import {
  attachKnownSync,
  type PortalProject,
  type PortalTask,
} from '@/lib/data/view-models';
import { ClientLink } from '@/components/nav/ClientLink';
import { NavBreadcrumb } from '@/components/nav/NavBreadcrumb';
import { clearSearchParam } from '@/lib/nav/clearSearchParam';
import { portalNavDetail } from '@/lib/nav/openPortalHref';
import { PROJECT_UNAVAILABLE_HEADING, projectUnavailableCopy, resolveBoardRoute } from '@/lib/nav/boardRoute';
import { DocsBlock, type DocRow } from '@/components/docs/DocsBlock';
import { NewProjectControl } from '@/components/projects/NewProjectControl';
import { useProjectCreateEnabled } from '@/components/projects/projectCreateFlag';
import {
  NewProjectButton,
  ProjectKpiSkeleton,
  ProjectListFilters,
  ProjectListOutcome,
  ProjectListScreen,
} from '@/components/projects/ProjectListStates';
import { TaskBoard, type BoardRules } from '@/components/tasks/TaskBoard';
import { TaskDetailModal } from '@/components/tasks/TaskDetailModal';
import {
  ItemListCard,
  ItemSaveBanner,
  ItemStaleBanner,
  ItemState,
  NewTaskButton,
  resolveItemRegion,
  taskMatchesListFilter,
  useItemScreen,
  useTaskListFilter,
  type TaskListFilter,
} from '@/components/tasks/itemStates';
import { StatusTable } from '@/components/tasks/StatusKanban';
import { LIVE_TASK_STATUSES, PROJECT_UNAVAILABLE, TASK_STAGES, WRITEBACK_OFF_ERROR, createTaskExternalId, stageMoveRule, statusMoveRule } from '@warehaus/portal-sync';
import type { Id } from '@convex/_generated/dataModel';

const SECTION_TITLE: Record<string, string> = {
  all: 'All projects',
  active: 'Active',
  shipped: 'Shipped',
};

type ProjectRow = PortalProject & {
  clientName?: string | null;
  internal?: boolean;
  taskCount?: number;
  publishToWarehaus?: boolean;
};

export function ProjectsContent() {
  const fixtures = useFixturePreview();
  const configured = isConvexConfigured();
  const { sectionFor, setSectionFor, openLinkedClient } = usePortalView();
  const [createOpen, setCreateOpen] = useState(false);
  const createEnabled = useProjectCreateEnabled();
  const { data, loading, error } = usePortalData();
  const retryPortalData = useRetryPortalData();
  const { portalSession, linkStatus, sessionPending, joining } = usePortalAuth();
  const hostSlug =
    typeof window !== 'undefined' ? getHostSlugFromLocation() ?? undefined : undefined;
  const activeSection = sectionFor('projects');
  const settling = !fixtures && (sessionPending || joining || linkStatus === 'loading');
  const isStaff = viewerIsStaff(portalSession, settling);
  const [filter, setFilter] = useState<ProjectListFilter>('all');
  const [forceEmpty, setForceEmpty] = useState(false);
  const [forceFiltered, setForceFiltered] = useState(false);
  const [forceLoading, setForceLoading] = useState(false);
  const [forceError, setForceError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [taskView, setTaskView] = useState<'board' | 'table'>('board');
  const [fixtureTaskId, setFixtureTaskId] = useState<string | null>(null);
  const [itemScreen, setItemScreen] = useItemScreen(fixtures);
  const [taskFilter, setTaskFilter] = useTaskListFilter(fixtures);
  const [queuedStage, setQueuedStage] = useState<{
    taskId: string;
    stage: string;
    expectedLastEditedTime: string;
    pullRequestLink?: string;
    retryAt: number | null;
  } | null>(null);
  const pathname = usePathname() || '';
  const router = useRouter();
  const moveStatus = useMutation(api.tasks.moveStatus);
  const moveStage = useMutation(api.tasks.moveStage);
  const createTask = useMutation(api.tasks.createTask);
  const rules = useSafeQuery<BoardRules>(
    api.tasks.moveRules,
    !fixtures && configured ? { hostSlug } : 'skip',
  );

  useEffect(() => {
    setQueuedStage(null);
  }, [openId]);

  useEffect(() => {
    const apply = (event?: Event) => {
      const detail = event ? portalNavDetail(event) : null;
      const params = new URLSearchParams(window.location.search);
      const project = detail ? detail.project : params.get('project');
      const task = detail ? detail.task : params.get('task');
      if (project) setOpenId(project);
      if (fixtures && (detail || task)) setFixtureTaskId(task);
    };
    apply();
    window.addEventListener('wh-portal-nav', apply);
    return () => window.removeEventListener('wh-portal-nav', apply);
  }, [fixtures]);

  useEffect(() => {
    if (fixtures && new URLSearchParams(window.location.search).get('list') === 'filtered') return;
    if (activeSection === 'all' || activeSection === 'active' || activeSection === 'shipped') {
      setFilter(activeSection);
    }
  }, [activeSection, fixtures]);

  useEffect(() => {
    if (!fixtures) return;
    const list = new URLSearchParams(window.location.search).get('list');
    setForceEmpty(list === 'empty' || list === 'error');
    setForceFiltered(list === 'filtered');
    setForceLoading(list === 'loading');
    setForceError(list === 'error' || list === 'refresh' ? 'Network error' : null);
    if (list === 'filtered') setFilter('shipped');
  }, [fixtures]);

  const staff = useStaffCrossOrg(!fixtures && configured && isStaff, hostSlug);
  const directory = useSafeQuery<Array<{ id: string; name: string }>>(
    api.clients.listDirectory,
    !fixtures && configured && isStaff ? { hostSlug } : 'skip',
  );
  const clientDocsState = useSafeQuery<DocRow[]>(
    api.clientDocs.listForClient,
    !fixtures && configured && !isStaff && data.tenant.ok ? { hostSlug } : 'skip',
  );

  const projects = useMemo(() => {
    const rows = (
      fixtures
        ? FIXTURE_PROJECTS
        : projectsForViewer({
            isStaff,
            staffProjects: staff.projects,
            clientProjects: data.projects,
          })
    ) as ProjectRow[];
    return attachKnownSync(rows, data.projects);
  }, [fixtures, isStaff, staff.projects, data.projects]);
  const tasks = (
    fixtures
      ? FIXTURE_TASKS.filter((task) => isStaff || (task.publishToWarehaus && !task.syncHidden))
      : isStaff
        ? staff.tasks ?? data.tasks
        : data.tasks
  ) as PortalTask[];
  const docs = (
    fixtures ? FIXTURE_DOCS : isStaff ? staff.docs ?? [] : clientDocsState.data ?? []
  ) as DocRow[];
  const projectsLoading =
    forceLoading ||
    (!fixtures && (settling || (isStaff ? staff.projectsLoading : loading)));

  const listed = useMemo(
    () => (forceFiltered ? projects.filter((project) => !projectMatchesFilter(project, 'shipped')) : projects),
    [projects, forceFiltered],
  );
  const filterCounts = useMemo(
    () => projectFilterCounts(forceEmpty ? [] : listed, isStaff),
    [listed, isStaff, forceEmpty],
  );
  const viewerCount = forceEmpty ? 0 : viewerProjects(listed, isStaff).length;
  const kpis = useMemo(
    () => projectListKpis(forceEmpty ? [] : listed, forceEmpty ? [] : tasks, isStaff),
    [listed, tasks, isStaff, forceEmpty],
  );
  const awaitingCaption = awaitingKpiCaption(kpis.awaitingGo, kpis.awaitingProjects);
  const visible = useMemo(() => {
    if (forceEmpty) return [];
    const rows = listed.filter((project) => {
      if (!isStaff && project.internal) return false;
      return projectMatchesFilter(project, filter);
    });
    return sortProjectsByLastUpdated(rows);
  }, [listed, isStaff, filter, forceEmpty]);

  const chooseFilter = (key: ProjectListFilter) => {
    setFilter(key);
    if (key !== 'internal') setSectionFor('projects', key);
  };

  const accessibleProjectIds = useMemo(
    () => projects.filter((project) => isStaff || !project.internal).map((project) => project.id),
    [projects, isStaff],
  );
  const route = resolveBoardRoute({
    pathname: fixtures && fixtureTaskId ? `/tasks/${fixtureTaskId}` : pathname,
    tasks,
    visibleProjectIds: accessibleProjectIds,
  });
  const selectedId = route.view === 'board' ? route.projectId : openId;
  const openProject = selectedId ? projects.find((project) => project.id === selectedId) ?? null : null;
  const routeTaskId = route.view === 'board' ? route.taskId : null;
  const leadPeople = useSafeQuery<Array<{ name: string; role?: string | null }>>(
    api.contacts.listForOrg,
    !fixtures && configured && isStaff && openProject?.orgId
      ? { orgId: openProject.orgId as Id<'clients'>, hostSlug }
      : 'skip',
  );
  const leadName = !isStaff
    ? data.leadName ?? null
    : fixtures
      ? warehausLead(FIXTURE_CONTACTS.filter((contact) => contact.orgId === openProject?.orgId))
      : warehausLead(leadPeople.data ?? []);

  const closeProject = () => {
    setOpenId(null);
    setFixtureTaskId(null);
    clearSearchParam('project');
    if (!fixtures && (/^\/projects\/[^/]+/.test(pathname) || pathname.startsWith('/tasks/'))) {
      router.push('/projects');
    }
  };

  const closeTask = () => {
    if (fixtures) {
      setFixtureTaskId(null);
      clearSearchParam('task');
      return;
    }
    if (openProject) router.push(`/projects/${openProject.id}`);
    else router.push('/projects');
  };

  const deepLink = /^\/(?:projects|tasks)\/[^/]+/.test(pathname);
  if (!fixtures && projectsLoading && deepLink) {
    return (
      <PortalWorkspace eyebrow={tenantEyebrow(data.tenant, 'Projects')} title="Projects">
        <PortalTilePane>
          <div className="flex flex-col gap-2" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="animate-pulse"
                style={{ height: 72, borderRadius: 12, background: 'var(--bg)', border: '1px solid var(--border)' }}
              />
            ))}
          </div>
        </PortalTilePane>
      </PortalWorkspace>
    );
  }

  if (route.view === 'unavailable' && route.message === PROJECT_UNAVAILABLE) {
    const copy = projectUnavailableCopy();
    return (
      <PortalWorkspace
        eyebrow={tenantEyebrow(data.tenant, 'Project')}
        title={PROJECT_UNAVAILABLE_HEADING}
        breadcrumb={
          <NavBreadcrumb
            back="always"
            onBack={closeProject}
            parent={{ label: 'Projects', onClick: closeProject }}
            current={PROJECT_UNAVAILABLE_HEADING}
          />
        }
      >
        <PortalTilePane>
          <div
            role="alert"
            data-testid="project-unavailable"
            className="flex flex-col items-start gap-3"
            style={{ border: '1px solid var(--danger)', borderRadius: 18, padding: '1rem 1.25rem' }}
          >
            <p style={{ color: 'var(--danger)', fontWeight: 600, fontSize: 14 }}>{copy.title}</p>
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>{copy.detail}</p>
            <OutlineButton onClick={closeProject}>Back to projects</OutlineButton>
          </div>
        </PortalTilePane>
      </PortalWorkspace>
    );
  }

  if (route.view === 'unavailable') {
    return (
      <PortalWorkspace eyebrow={tenantEyebrow(data.tenant, 'Projects')} title="Projects">
        <PortalTilePane>
          <Surface style={{ padding: 'var(--s-5)' }}>
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>{route.message}</p>
          </Surface>
        </PortalTilePane>
      </PortalWorkspace>
    );
  }

  const loadError = projectListQueryError({
    snapshotError: forceError ?? error,
    projectsError: isStaff ? staff.projectsError : null,
    syncError: data.syncMeta.lastError,
  });
  const errorMode = projectsLoading ? 'none' : projectListErrorMode(loadError, viewerCount);
  const retryQueries = () => {
    if (fixtures) {
      setForceError(null);
      setForceLoading(false);
      return;
    }
    retryPortalData();
  };
  const openCreate = () => {
    requestProjectCreate(createEnabled, () => setCreateOpen(true));
  };
  const projectClients = (fixtures ? FIXTURE_CLIENTS : directory.data ?? []).map((client) => ({
    id: client.id,
    name: client.name,
  }));
  const retryTasks = () => {
    if (fixtures) {
      setItemScreen('ready');
      return;
    }
    retryPortalData();
  };
  const clearTaskFilters = () => {
    setTaskFilter('all');
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has('taskFilter')) return;
    url.searchParams.delete('taskFilter');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  };
  const retryQueuedStage = async () => {
    if (!queuedStage || fixtures) return;
    const result = await moveStage({
      hostSlug,
      taskId: queuedStage.taskId as Id<'tasks'>,
      stage: queuedStage.stage,
      expectedLastEditedTime: queuedStage.expectedLastEditedTime,
      pullRequestLink: queuedStage.pullRequestLink,
    });
    if (!result.ok || !result.pending || !result.outboxId) {
      setQueuedStage(null);
      return;
    }
    setQueuedStage({ ...queuedStage, retryAt: null });
  };

  if (openProject) {
    const projectTasks = tasks.filter((task) => task.projectId === openProject.id);
    const activeFilter: TaskListFilter = isStaff ? taskFilter : 'all';
    const visibleTasks = projectTasks.filter((task) => taskMatchesListFilter(task, activeFilter, isStaff));
    const listLoading = !fixtures && (isStaff ? staff.tasksLoading || loading : loading) && projectTasks.length === 0;
    const taskFailed = !fixtures && (Boolean(error) || (isStaff && staff.tasksError != null));
    const itemView = resolveItemRegion({
      fixtures,
      screen: itemScreen,
      loading: listLoading,
      error: taskFailed,
      count: projectTasks.length,
      matched: visibleTasks.length,
      filterActive: activeFilter !== 'all',
    });
    const projectDocs = docs.filter((doc) => {
      if (doc.projectId !== openProject.id) return false;
      if (isStaff) return true;
      return doc.publishToWarehaus !== false && doc.status !== 'Draft';
    });
    const summary = projectSummaryVisibility(isStaff, openProject);
    return (
      <PortalWorkspace
        eyebrow={tenantEyebrow(data.tenant, 'Project')}
        title={openProject.name}
        breadcrumb={
          <NavBreadcrumb
            back="always"
            onBack={closeProject}
            parent={{ label: 'Projects', onClick: closeProject }}
            current={openProject.name}
          />
        }
        actions={
          summary.showEdit ? (
            <div className="hidden md:block">
              <EditProjectButton disabled={summary.editDisabled} />
            </div>
          ) : undefined
        }
      >
        <PortalTilePane>
          <div className="flex h-full min-h-0 min-w-0 flex-col gap-4 overflow-y-auto" data-testid="project-detail" style={{ scrollbarGutter: 'stable' }}>
            <ProjectSummary
              project={openProject}
              tasks={projectTasks}
              leadName={leadName}
              onOpenClient={openLinkedClient}
              summary={summary}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 style={{ fontSize: 18, fontWeight: 600, lineHeight: '26px' }}>Tasks</h2>
                <p data-testid="tasks-subtitle" style={{ marginTop: 4, fontSize: 13, color: 'var(--muted)' }}>
                  {projectTasksSubtitle(isStaff)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ViewToggle view={taskView} onChange={setTaskView} />
                {isStaff ? <NewTaskButton /> : null}
              </div>
            </div>
            {isStaff ? (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Task filters" data-testid="task-filters">
                <TaskFilterChip
                  label="Awaiting go"
                  filter="awaiting"
                  active={activeFilter === 'awaiting'}
                  count={projectTasks.filter((task) => taskMatchesListFilter(task, 'awaiting', true)).length}
                  onClick={() => setTaskFilter(activeFilter === 'awaiting' ? 'all' : 'awaiting')}
                />
                <TaskFilterChip
                  label="Not published"
                  filter="unpublished"
                  active={activeFilter === 'unpublished'}
                  count={projectTasks.filter((task) => taskMatchesListFilter(task, 'unpublished', true)).length}
                  onClick={() => setTaskFilter(activeFilter === 'unpublished' ? 'all' : 'unpublished')}
                />
              </div>
            ) : null}
            <ItemListCard>
              {queuedStage ? (
                <div style={{ marginBottom: 16 }}>
                  <ItemSaveBanner retryAt={queuedStage.retryAt} onRetry={() => { void retryQueuedStage(); }} />
                </div>
              ) : null}
              {itemView.stale ? (
                <div style={{ marginBottom: 16 }}>
                  <ItemStaleBanner onRetry={retryTasks} />
                </div>
              ) : null}
              {itemView.region === 'board' ? (
                taskView === 'board' ? (
              <TaskBoard
                tasks={visibleTasks}
                staff={isStaff}
                loading={listLoading}
                rules={
                  fixtures
                    ? isStaff
                      ? fixtureStaffRules
                      : clientDeniedRules
                    : rules.data ?? (isStaff ? null : clientDeniedRules)
                }
                onOpen={(task) => {
                  setOpenId(openProject.id);
                  if (fixtures) setFixtureTaskId(task.id);
                  else router.push(`/tasks/${task.id}`);
                }}
                onMove={async (request) => {
                  if (fixtures) {
                    if (request.mode === 'stage') return { ok: true, pending: true };
                    return { ok: false, error: WRITEBACK_OFF_ERROR };
                  }
                  if (!request.task.lastEditedTime) {
                    return { ok: false, error: 'This task has no Notion edit time yet. Nothing was sent.' };
                  }
                  const result = request.mode === 'stage'
                    ? await moveStage({
                        hostSlug,
                        taskId: request.task.id as Id<'tasks'>,
                        stage: request.value,
                        expectedLastEditedTime: request.task.lastEditedTime,
                        pullRequestLink: request.pullRequestLink,
                      })
                    : await moveStatus({
                        hostSlug,
                        taskId: request.task.id as Id<'tasks'>,
                        status: request.value,
                        expectedLastEditedTime: request.task.lastEditedTime,
                      });
                  if (!result.ok) return { ok: false, error: result.error };
                  if (request.mode === 'stage' && result.pending === true && result.outboxId) {
                    setQueuedStage({
                      taskId: request.task.id,
                      stage: request.value,
                      expectedLastEditedTime: request.task.lastEditedTime,
                      pullRequestLink: request.pullRequestLink,
                      retryAt: null,
                    });
                  } else if (request.mode === 'stage') {
                    setQueuedStage((current) => (current?.taskId === request.task.id ? null : current));
                  }
                  return { ok: true, pending: result.pending === true };
                }}
                onQuickAdd={async ({ name, status, stage }) => {
                  if (fixtures) return { ok: false, error: 'Fixture preview does not send tasks to Notion.' };
                  if (!openProject.notionPageId || !openProject.orgId) {
                    return { ok: false, error: 'This project is not in Notion yet. Nothing was sent.' };
                  }
                  const result = await createTask({
                    hostSlug,
                    orgId: openProject.orgId as Id<'clients'>,
                    name,
                    status,
                    stage,
                    projectNotionId: openProject.notionPageId,
                    externalId: createTaskExternalId(`${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`),
                  });
                  return result.ok ? { ok: true } : { ok: false, error: result.error };
                }}
              />
                ) : (
              <StatusTable
                tasks={visibleTasks}
                loading={listLoading}
                staff={isStaff}
                onOpen={(task) => {
                  if (fixtures) setFixtureTaskId(task.id);
                  else router.push(`/tasks/${task.id}`);
                }}
              />
                )
              ) : (
                <ItemState
                  screen={itemView.region}
                  staff={isStaff}
                  onClear={clearTaskFilters}
                  onRetry={retryTasks}
                />
              )}
            </ItemListCard>
            <DocsBlock docs={projectDocs} staff={isStaff} loading={projectsLoading && projectDocs.length === 0} />
          </div>
        </PortalTilePane>
        {routeTaskId ? (
          <ProjectTaskOverlay
            taskId={routeTaskId}
            tasks={tasks}
            staff={isStaff}
            hostSlug={hostSlug}
            fixtures={fixtures}
            clientName={openProject.internal ? null : openProject.clientName ?? null}
            resources={(fixtures ? FIXTURE_RESOURCES : staff.resources ?? []) as ResourceOption[]}
            onClose={closeTask}
            onOpenTask={(id) => {
              if (fixtures) setFixtureTaskId(id);
              else router.push(`/tasks/${id}`);
            }}
          />
        ) : null}
      </PortalWorkspace>
    );
  }

  return (
    <PortalWorkspace
      eyebrow={tenantEyebrow(data.tenant, 'Projects')}
      title={activeSection === 'all' ? 'Projects' : (SECTION_TITLE[activeSection] ?? 'Projects')}
      actions={
        isStaff ? (
          <>
            <NewProjectButton variant="primary" enabled={createEnabled} onCreate={openCreate} />
            {createEnabled ? (
              <NewProjectControl
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                clients={projectClients}
                fixtures={fixtures}
                hostSlug={hostSlug}
              />
            ) : null}
          </>
        ) : null
      }
    >
      <PortalTilePane>
        <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto" data-testid="projects-list">
          <ProjectListScreen
            staff={isStaff}
            errorMode={errorMode}
            message={loadError}
            onRetry={retryQueries}
          >
          {projectListShowsKpis(viewerCount, projectsLoading) ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3" data-testid="project-kpis">
              {projectsLoading ? (
                <>
                  <ProjectKpiSkeleton />
                  <ProjectKpiSkeleton />
                  <ProjectKpiSkeleton />
                </>
              ) : (
                <>
                  <KpiCard
                    label="Active"
                    value={String(kpis.active)}
                    hint={activeKpiCaption(kpis.active, kpis.buildingNow)}
                  />
                  <KpiCard
                    label="Awaiting Go"
                    value={String(kpis.awaitingGo)}
                    hint={awaitingCaption.caption}
                    tone={awaitingCaption.hot ? 'var(--danger)' : undefined}
                  />
                  <KpiCard label="Shipped" value={String(kpis.shipped)} hint={shippedKpiCaption()} />
                </>
              )}
            </div>
          ) : null}
          <Surface style={{ padding: 24 }}>
            <div className="flex flex-col" style={{ gap: 4 }}>
              <h2 style={{ fontSize: 18, lineHeight: '26px', fontWeight: 600 }}>All projects</h2>
              <p style={{ fontSize: 13, lineHeight: '19px', color: 'var(--muted)' }}>Sorted by last updated</p>
            </div>
            <ProjectListFilters loading={projectsLoading} viewerCount={viewerCount}>
              {filterCounts.map((chip) => (
                <FilterChip
                  key={chip.key}
                  active={filter === chip.key}
                  count={chip.count}
                  onClick={() => chooseFilter(chip.key)}
                >
                  {chip.label}
                </FilterChip>
              ))}
            </ProjectListFilters>
            <ProjectListOutcome
              loading={projectsLoading}
              viewerCount={viewerCount}
              visibleCount={visible.length}
              staff={isStaff}
              onCreate={openCreate}
              onClear={() => {
                setForceFiltered(false);
                chooseFilter('all');
              }}
              createEnabled={createEnabled}
            >
              <ul className="mt-2">
                {visible.map((project) => {
                  const mine = tasks.filter((task) => task.projectId === project.id);
                  const count = projectTaskCount(mine.length, project.taskCount);
                  const progress = projectProgress({
                    projectId: project.id,
                    progress: project.progress,
                    tasks,
                  });
                  const taskLabel = `${count} ${count === 1 ? 'task' : 'tasks'}`;
                  const progressCopy = projectProgressCopy(progress.percent, count);
                  const showPublish = showProjectPublish(isStaff, project);
                  return (
                    <li key={project.id} className="border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                      <button
                        type="button"
                        data-testid="project-row"
                        onClick={() => {
                          setTaskView('board');
                          setOpenId(project.id);
                        }}
                        className="grid w-full grid-cols-1 items-center gap-2 py-6 text-left md:min-h-[90px] md:grid-cols-[minmax(0,1fr)_150px_90px_120px_16px] md:gap-4"
                        style={{ background: 'transparent', color: 'inherit' }}
                      >
                        <span className="flex min-w-0 items-center gap-4">
                          <span
                            className="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px]"
                            style={{
                              background: 'var(--surface-2)',
                              border: '1px solid var(--border-2, var(--border))',
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                          >
                            {projectInitials(project.name)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="truncate" style={{ fontSize: 16, fontWeight: 500 }}>
                                {project.name}
                              </span>
                              {project.internal ? (
                                <span className="md:hidden">
                                  <InternalTag />
                                </span>
                              ) : null}
                            </span>
                            <span className="ds-mono mt-1 block truncate md:hidden" style={{ fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>
                              {projectListMeta(project, data.tenant.clientName, { phone: true })}
                            </span>
                            <span className="ds-mono mt-1 hidden truncate md:block" style={{ fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>
                              {projectListMeta(project, data.tenant.clientName)}
                            </span>
                          </span>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img alt="" src="/icons/client-chev.svg" width={16} height={16} className="shrink-0 opacity-70 md:hidden" />
                        </span>
                        <span className="flex min-w-0 items-center gap-3 md:w-[150px] md:flex-col md:items-start md:gap-2">
                          <span className="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full md:w-full md:flex-none" style={{ background: 'var(--surface-2)' }}>
                            <span
                              className="block h-1.5 rounded-full"
                              style={{ width: progress.percent == null ? 0 : `${progress.percent}%`, background: 'var(--fg)' }}
                            />
                          </span>
                          <span className="ds-mono shrink-0 whitespace-nowrap" data-testid="project-progress" style={{ fontSize: 11, color: 'var(--muted)' }}>
                            <span className="md:hidden">{progressCopy.phone}</span>
                            <span className="hidden md:inline">{progressCopy.desktop}</span>
                          </span>
                        </span>
                        <span className="ds-mono hidden w-[90px] shrink-0 whitespace-nowrap md:block" style={{ fontSize: 12, color: 'var(--muted)' }}>
                          {taskLabel}
                        </span>
                        <span className="hidden w-[120px] shrink-0 items-center md:flex">
                          {showPublish && project.publishToWarehaus != null ? (
                            <PublishMark published={project.publishToWarehaus} />
                          ) : null}
                        </span>
                        {showPublish && project.publishToWarehaus != null ? (
                          <span className="md:hidden">
                            <PublishMark published={project.publishToWarehaus} />
                          </span>
                        ) : null}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img alt="" src="/icons/client-chev.svg" width={16} height={16} className="hidden shrink-0 opacity-70 md:block" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </ProjectListOutcome>
          </Surface>
          </ProjectListScreen>
        </div>
      </PortalTilePane>
      {routeTaskId ? (
        <ProjectTaskOverlay
          taskId={routeTaskId}
          tasks={tasks}
          staff={isStaff}
          hostSlug={hostSlug}
          fixtures={fixtures}
          clientName={(() => {
            const openTask = tasks.find((item) => item.id === routeTaskId);
            const project = projects.find((item) => item.id === openTask?.projectId);
            return project && !project.internal ? project.clientName ?? null : null;
          })()}
          resources={(fixtures ? FIXTURE_RESOURCES : staff.resources ?? []) as ResourceOption[]}
          onClose={closeTask}
          onOpenTask={(id) => {
            if (fixtures) setFixtureTaskId(id);
            else router.push(`/tasks/${id}`);
          }}
        />
      ) : null}
    </PortalWorkspace>
  );
}

type ResourceOption = {
  id: string;
  name: string;
  type: string | null;
  projectId?: string | null;
  notionPageId?: string | null;
  publishToWarehaus?: boolean;
  updatedAt?: number | null;
  lastSyncedAt?: number | null;
  attachedCount?: number | null;
};

const clientDeniedRules: BoardRules = { actor: 'client', statuses: [], stages: [] };

const fixtureStaffRules: BoardRules = {
  actor: 'staff',
  statuses: LIVE_TASK_STATUSES.map((status) => ({ status, rule: statusMoveRule('staff', status) })),
  stages: TASK_STAGES.map((stage) => ({ stage, rule: stageMoveRule('staff', stage) })),
};

function KpiCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 28,
        padding: 'clamp(1.25rem, 2vw, 2rem)',
      }}
    >
      <p className="ds-mono" style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>
        {label}
      </p>
      <p className="kpi-figure" style={tone ? { color: tone } : undefined}>
        {value}
      </p>
      {hint ? <p style={{ marginTop: 12, fontSize: 14, color: tone ?? 'var(--muted)' }}>{hint}</p> : null}
    </div>
  );
}

function InternalTag() {
  return (
    <span className="ds-mono inline-flex items-center gap-1" style={{ fontSize: 'var(--t-xs)', letterSpacing: '0.08em', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 999, padding: '0.15rem 0.45rem' }}>
      <span aria-hidden>◌</span> INTERNAL
    </span>
  );
}

function ProjectTaskOverlay({
  taskId,
  tasks,
  staff,
  hostSlug,
  fixtures,
  resources,
  clientName = null,
  onClose,
  onOpenTask,
}: {
  taskId: string;
  tasks: PortalTask[];
  staff: boolean;
  hostSlug?: string;
  fixtures: boolean;
  resources: ResourceOption[];
  clientName?: string | null;
  onClose: () => void;
  onOpenTask: (id: string) => void;
}) {
  const task = tasks.find((item) => item.id === taskId) ?? null;
  const taskKey = !fixtures && task ? (task.id as Id<'tasks'>) : null;
  const clientSubs = useSafeQuery<PortalTask[]>(
    api.tasks.listSubtasksForClient,
    taskKey && !staff ? { hostSlug, taskId: taskKey } : 'skip',
  );
  const staffAttached = useSafeQuery<ResourceOption[]>(
    api.sharedResources.listAttachedForStaff,
    taskKey && staff ? { hostSlug, taskId: taskKey } : 'skip',
  );
  const clientAttached = useSafeQuery<ResourceOption[]>(
    api.sharedResources.listAttachedForClient,
    taskKey && !staff ? { hostSlug, taskId: taskKey } : 'skip',
  );
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const apply = () => setPhone(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);
  const subtasks = staff
    ? tasks.filter((item) => item.parentTaskId === taskId)
    : (clientSubs.data ?? []).filter((item) => item.publishToWarehaus !== false);
  const fixtureAttached = fixtures && task
    ? resources.filter((resource) => {
        if (resource.projectId !== task.projectId) return false;
        if (staff) return true;
        return resource.publishToWarehaus !== false;
      })
    : [];
  const attached = staff
    ? fixtures ? fixtureAttached : staffAttached.data ?? []
    : clientAttached.data ?? [];
  return (
    <TaskDetailModal
      task={task}
      staff={staff}
      phone={phone}
      unavailable={!task}
      subtasks={subtasks}
      resources={attached}
      projectResources={resources.filter((resource) => !task?.projectId || resource.projectId === task.projectId)}
      clientName={clientName}
      hostSlug={hostSlug}
      live={!fixtures}
      onClose={onClose}
      onOpenTask={onOpenTask}
    />
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: 'board' | 'table';
  onChange: (view: 'board' | 'table') => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Task view"
      className="inline-flex"
      style={{ padding: 3, borderRadius: 6, background: 'var(--surface-2)' }}
    >
      {([
        ['board', 'Board'],
        ['table', 'Table'],
      ] as const).map(([key, label]) => {
        const active = view === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(key)}
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              fontWeight: 500,
              padding: '6px 10px',
              borderRadius: 4,
              border: 0,
              cursor: 'pointer',
              color: active ? 'var(--bg)' : 'var(--muted)',
              background: active ? 'var(--fg)' : 'transparent',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function TaskFilterChip({
  label,
  filter,
  active,
  count,
  onClick,
}: {
  label: string;
  filter: TaskListFilter;
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid="task-filter"
      data-filter={filter}
      className="inline-flex items-center gap-2 whitespace-nowrap"
      style={{
        fontSize: 13,
        fontWeight: 500,
        padding: '8px 16px',
        borderRadius: 999,
        border: active ? '1px solid var(--border-2)' : '1px solid var(--border)',
        background: active ? 'var(--surface-2)' : 'transparent',
        color: active ? 'var(--fg)' : 'var(--muted)',
        cursor: 'pointer',
      }}
    >
      {label}
      <span className="ds-mono" style={{ fontSize: 11, color: 'var(--faint)' }}>{count}</span>
    </button>
  );
}

function FilterChip({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid="project-filter"
      className="inline-flex items-center gap-2 whitespace-nowrap"
      style={{
        fontSize: 13,
        fontWeight: 500,
        padding: '8px 16px',
        borderRadius: 999,
        border: active ? '1px solid var(--border-2)' : '1px solid var(--border)',
        background: active ? 'var(--surface-2)' : 'transparent',
        color: active ? 'var(--fg)' : 'var(--muted)',
        cursor: 'pointer',
      }}
    >
      {children}
      <span className="ds-mono" style={{ fontSize: 11, color: 'var(--faint)' }}>{count}</span>
    </button>
  );
}

const summaryLabel = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  fontWeight: 400,
  letterSpacing: '0.8px',
  color: 'var(--faint)',
  textTransform: 'uppercase' as const,
};

function EditProjectButton({ disabled, compact = false }: { disabled: boolean; compact?: boolean }) {
  const hintId = useId();
  const button = (
    <button
      type="button"
      disabled={disabled}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : undefined}
      data-testid="edit-project"
      style={{
        pointerEvents: disabled ? 'none' : undefined,
        background: compact ? 'transparent' : 'var(--accent)',
        color: compact ? 'var(--fg)' : 'var(--accent-fg)',
        border: compact ? '1px solid var(--border)' : 0,
        borderRadius: 9,
        fontFamily: 'var(--font-body)',
        fontSize: compact ? 13 : 'var(--t-sm)',
        fontWeight: compact ? 500 : 600,
        padding: compact ? '6px 10px' : '0.65rem 1.1rem',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      Edit project
    </button>
  );
  if (!disabled) return button;
  return (
    <span
      tabIndex={0}
      role="group"
      aria-disabled="true"
      aria-describedby={hintId}
      title={EDIT_PROJECT_WRITEBACK_HINT}
      data-testid="edit-project-hint"
      className="inline-flex"
      style={{ cursor: 'not-allowed' }}
    >
      {button}
      <span id={hintId} className="sr-only">
        {EDIT_PROJECT_WRITEBACK_HINT}
      </span>
    </span>
  );
}

function ProjectSummary({
  project,
  tasks,
  leadName,
  onOpenClient,
  summary,
}: {
  project: ProjectRow;
  tasks: PortalTask[];
  leadName: string | null;
  onOpenClient: (orgId: string) => void;
  summary: ReturnType<typeof projectSummaryVisibility>;
}) {
  const progress = projectProgress({
    projectId: project.id,
    progress: project.progress,
    tasks,
  });
  const count = projectTaskCount(tasks.length, project.taskCount);
  const copy = projectProgressCopy(progress.percent, count);
  return (
    <Surface style={{ padding: 'clamp(1.25rem, 3vw, 3rem)', borderRadius: 36 }}>
      <div data-testid="project-summary">
        <div className="flex items-center gap-4 md:gap-6">
          <span
            className="inline-flex size-16 shrink-0 items-center justify-center rounded-[10px]"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border-2, var(--border))',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {projectInitials(project.name)}
          </span>
          <div className="min-w-0">
            <p style={{ fontSize: 26, lineHeight: '32px', fontWeight: 600 }}>{project.name}</p>
            <div className="mt-1 flex flex-col items-start gap-2 md:flex-row md:flex-wrap md:items-center">
              {project.internal ? (
                <InternalTag />
              ) : (
                <ClientLink name={project.clientName} orgId={project.orgId} onOpen={onOpenClient} />
              )}
              {leadName ? (
                <>
                  <span className="hidden md:inline" style={{ fontSize: 14, color: 'var(--muted)' }}>
                    · Lead: {leadName}
                  </span>
                  <span className="inline-flex items-center gap-1.5 md:hidden" data-testid="project-lead-line">
                    <span style={summaryLabel}>Lead</span>
                    <span style={{ fontSize: 14, color: 'var(--muted)' }}>{leadName}</span>
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </div>
        {summary.showPublish || summary.showSourceNotion ? (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {summary.showPublish && project.publishToWarehaus != null ? (
              <PublishMark published={project.publishToWarehaus} />
            ) : null}
            {summary.showSourceNotion ? (
              <span
                data-testid="source-notion"
                className="inline-flex items-center gap-1"
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '4px 8px',
                }}
              >
                <span className="ds-mono" style={{ fontSize: 10, letterSpacing: '0.8px', color: 'var(--faint)' }}>
                  SOURCE
                </span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>Notion</span>
              </span>
            ) : null}
          </div>
        ) : null}
        {summary.showEdit ? (
          <div className="mt-4 flex justify-end md:hidden">
            <EditProjectButton disabled={summary.editDisabled} compact />
          </div>
        ) : null}
        <div className="mt-6 flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
          <p
            className="ds-mono shrink-0 md:w-[112px]"
            style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--faint)' }}
          >
            Progress
          </p>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 md:flex-nowrap">
            <span
              className="h-1.5 w-full overflow-hidden rounded-full md:w-40 md:shrink-0"
              style={{ background: 'var(--surface-2)' }}
            >
              <span
                className="block h-1.5 rounded-full"
                style={{ width: progress.percent == null ? 0 : `${progress.percent}%`, background: 'var(--fg)' }}
              />
            </span>
            <span data-testid="project-detail-progress" className="whitespace-nowrap" style={{ fontSize: 13, color: 'var(--muted)' }}>
              {copy.desktop}
            </span>
          </div>
        </div>
      </div>
    </Surface>
  );
}

function PublishMark({ published }: { published: boolean }) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-2 whitespace-nowrap"
      data-testid="publish-state"
      style={{ fontSize: 11, letterSpacing: '0.44px', color: 'var(--muted)' }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          boxSizing: 'border-box',
          flex: '0 0 auto',
          background: published ? 'var(--fg)' : 'transparent',
          border: `1px solid ${published ? 'var(--fg)' : 'var(--muted)'}`,
        }}
      />
      {published ? 'Published' : 'Not published'}
    </span>
  );
}
