'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ProjectRoadmap } from '@/components/projects/ProjectRoadmap';
import { resourcesForProject } from '@/components/projects/milestoneGuards';
import { OutlineButton, Surface } from '@/components/ui/primitives';
import { PhoneScrollInset, PortalTilePane, PortalWorkspace } from '@/components/layout/PortalWorkspace';
import { usePortalView } from '@/components/providers/PortalViewProvider';
import {
  activeKpiCaption,
  awaitingKpiCaption,
  clearProjectListFilters,
  defaultProjectListView,
  effectiveProjectSort,
  normalizeProjectListView,
  projectInitials,
  projectListFixtureScreen,
  projectListKpis,
  projectListErrorMode,
  projectListQueryError,
  projectListShowsKpis,
  requestProjectCreate,
  EDIT_PROJECT_WRITEBACK_HINT,
  projectListMeta,
  projectListViewOptions,
  projectMatchesFilter,
  projectMatchesView,
  projectProgress,
  projectProgressCopy,
  projectSortSubtitle,
  projectSummaryVisibility,
  projectTaskCount,
  projectViewChipCounts,
  projectViewRows,
  pruneProjectListView,
  shippedKpiCaption,
  showProjectPublish,
  sortProjects,
  viewerProjects,
  type ProjectFilterKey,
  type ProjectListFilter,
  type ProjectListMenuOpen,
  type ProjectListView,
} from '@/lib/data/projectList';
import { useActivityFeed } from '@/hooks/useActivityFeed';
import { tenantEyebrow, usePortalData } from '@/hooks/usePortalData';
import { useRetryPortalData } from '@/components/providers/PortalDataRetry';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { getHostSlugFromLocation } from '@/lib/auth/host-slug';
import type { PortalTask } from '@/lib/data/view-models';
import {
  useProjectLead,
  useProjectTask,
  useProjectsPage,
  type ProjectRow,
  type ResourceOption,
} from '@/lib/data/projectsPage';
import { ClientLink } from '@/components/nav/ClientLink';
import { NavBreadcrumb } from '@/components/nav/NavBreadcrumb';
import { clearSearchParam, setSearchParams } from '@/lib/nav/clearSearchParam';
import { CLOSE_TASK_FOR_SEARCH, leaveTaskForSearch } from '@/lib/nav/dockLayer';
import { isProjectDetailPath, leaveProjectDetail, projectStateAfterNav } from '@/lib/nav/tabHome';
import { keepProjectWhileLoading, readTaskListView } from '@/lib/nav/taskListLocation';
import { portalNavDetail } from '@/lib/nav/openPortalHref';
import { clearPortalReturn, peekPortalReturn, takePortalReturn, taskCloseLabel } from '@/lib/nav/portalReturn';
import { PROJECT_UNAVAILABLE_HEADING, projectUnavailableCopy, resolveBoardRoute } from '@/lib/nav/boardRoute';
import { DocsBlock } from '@/components/docs/DocsBlock';
import { NewProjectControl } from '@/components/projects/NewProjectControl';
import { useFixtureCreatePreview, useWritebackEnabled } from '@/hooks/useWritebackEnabled';
import {
  NewProjectButton,
  ProjectKpiSkeleton,
  ProjectListFilters,
  ProjectListOutcome,
  ProjectListScreen,
} from '@/components/projects/ProjectListStates';
import { AgentDriverSetting } from '@/components/projects/AgentDriverSetting';
import { ProjectRepoSetting } from '@/components/projects/ProjectRepoSetting';
import { TaskDetailModal } from '@/components/tasks/TaskDetailModal';
import { PROJECT_UNAVAILABLE } from '@warehaus/portal-sync';

const SECTION_TITLE: Record<string, string> = {
  all: 'All projects',
  active: 'Active',
  shipped: 'Shipped',
};

export function ProjectsContent() {
  const { sectionFor, setSectionFor, openLinkedClient, setOpenProjectId } = usePortalView();
  const [createOpen, setCreateOpen] = useState(false);
  const writebackEnabled = useWritebackEnabled();
  const fixtureCreate = useFixtureCreatePreview();
  const createEnabled = writebackEnabled || fixtureCreate;
  const { data, loading, error } = usePortalData();
  const activityFeed = useActivityFeed();
  const retryPortalData = useRetryPortalData();
  const { portalSession, linkStatus, sessionPending, joining } = usePortalAuth();
  const hostSlug =
    typeof window !== 'undefined' ? getHostSlugFromLocation() ?? undefined : undefined;
  const activeSection = sectionFor('projects');
  const [view, setView] = useState<ProjectListView>(defaultProjectListView);
  const [fixtureMenu, setFixtureMenu] = useState<{ open: ProjectListMenuOpen; expanded: ProjectFilterKey[] }>({
    open: null,
    expanded: [],
  });
  const [forceEmpty, setForceEmpty] = useState(false);
  const [forceFiltered, setForceFiltered] = useState(false);
  const [forceLoading, setForceLoading] = useState(false);
  const [forceError, setForceError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [archivedFixtureIds, setArchivedFixtureIds] = useState<string[]>([]);
  const page = useProjectsPage({
    auth: { portalSession, sessionPending, joining, linkStatus },
    hostSlug,
    snapshot: data,
    snapshotLoading: loading,
    archivedIds: archivedFixtureIds,
  });
  const { preview: fixtures, isStaff, projects, tasks, docs } = page;
  const [taskView, setTaskView] = useState<'board' | 'table'>('board');
  const [fixtureTaskId, setFixtureTaskId] = useState<string | null>(null);
  const pathname = usePathname() || '';
  const router = useRouter();
  useEffect(() => {
    setOpenProjectId(openId);
    return () => setOpenProjectId(null);
  }, [openId, setOpenProjectId]);

  useLayoutEffect(() => {
    const apply = (event?: Event) => {
      const detail = event ? portalNavDetail(event) : null;
      const params = new URLSearchParams(window.location.search);
      const nav = projectStateAfterNav({ detail, search: window.location.search, fixtures });
      if (nav.close) {
        setOpenId(null);
        setFixtureTaskId(null);
        return;
      }
      if (nav.project) setOpenId(nav.project);
      if (params.has('taskView')) setTaskView(readTaskListView(params.get('taskView')));
      if (nav.setFixtureTask) setFixtureTaskId(nav.task);
    };
    apply();
    window.addEventListener('wh-portal-nav', apply);
    return () => window.removeEventListener('wh-portal-nav', apply);
  }, [fixtures]);

  useEffect(() => {
    if (fixtures && new URLSearchParams(window.location.search).get('list') === 'filtered') return;
    if (activeSection === 'all' || activeSection === 'active' || activeSection === 'shipped') {
      // The sidebar sets the chip only. Menu filters stay until Clear filters.
      setView((current) => (current.quick === activeSection ? current : { ...current, quick: activeSection }));
    }
  }, [activeSection, fixtures]);

  useEffect(() => {
    if (!fixtures) return;
    const list = new URLSearchParams(window.location.search).get('list');
    setForceEmpty(list === 'empty' || list === 'error');
    setForceFiltered(list === 'filtered');
    setForceLoading(list === 'loading');
    setForceError(list === 'error' || list === 'refresh' ? 'Network error' : null);
    if (list === 'filtered') setView((current) => ({ ...current, quick: 'shipped' }));
  }, [fixtures]);

  const projectsLoading = forceLoading || page.loading;

  const listed = useMemo(
    () => (forceFiltered ? projects.filter((project) => !projectMatchesFilter(project, 'shipped')) : projects),
    [projects, forceFiltered],
  );
  const viewerCount = forceEmpty ? 0 : viewerProjects(listed, isStaff).length;
  const kpis = useMemo(
    () => projectListKpis(forceEmpty ? [] : listed, forceEmpty ? [] : tasks, isStaff),
    [listed, tasks, isStaff, forceEmpty],
  );
  const awaitingCaption = awaitingKpiCaption(kpis.awaitingGo, kpis.awaitingProjects);
  /** Rows with the percent and task count each one shows, so filters and sorts read the same numbers. */
  const rows = useMemo(() => projectViewRows(forceEmpty ? [] : listed, tasks), [listed, tasks, forceEmpty]);
  const viewOptions = useMemo(() => projectListViewOptions(rows, isStaff), [rows, isStaff]);
  /** What the list applies and the menu shows: staff-only parts stripped for a client, stale picks dropped. */
  const shownView = useMemo(
    () => pruneProjectListView(normalizeProjectListView(view, isStaff), viewOptions),
    [view, isStaff, viewOptions],
  );
  const sort = effectiveProjectSort(shownView, isStaff);
  const filterCounts = useMemo(() => projectViewChipCounts(rows, shownView, isStaff), [rows, shownView, isStaff]);
  const visible = useMemo(
    () => sortProjects(rows.filter((row) => projectMatchesView(row, shownView, isStaff)), sort),
    [rows, shownView, isStaff, sort],
  );

  // Design-review screens: `?list=filters`, `one-filter`, `several-filters`, `sort`, `no-matches`, with `&menu=`.
  const fixtureOptionsKey = JSON.stringify(viewOptions);
  useEffect(() => {
    if (!fixtures) return;
    const params = new URLSearchParams(window.location.search);
    const screen = projectListFixtureScreen(
      params.get('list'),
      params.get('menu'),
      isStaff,
      JSON.parse(fixtureOptionsKey) as typeof viewOptions,
    );
    if (!screen) return;
    setView(screen.view);
    setFixtureMenu({ open: screen.open, expanded: screen.expanded });
  }, [fixtures, isStaff, fixtureOptionsKey]);

  const chooseFilter = (key: ProjectListFilter) => {
    setView((current) => ({ ...current, quick: key }));
    if (key !== 'internal') setSectionFor('projects', key);
  };
  const changeView = useCallback((update: (current: ProjectListView) => ProjectListView) => {
    setView((current) => update(current));
  }, []);
  /** Chip to All and every menu filter to Any. The sort stays. The sidebar follows the chip. */
  const clearView = () => {
    setForceFiltered(false);
    setView((current) => clearProjectListFilters(current));
    setSectionFor('projects', 'all');
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
  const routeProjectId = route.view === 'board' ? route.projectId : null;
  useEffect(() => {
    const onSwap = () => {
      setFixtureTaskId(null);
      const next = leaveTaskForSearch({
        pathname: window.location.pathname,
        search: window.location.search,
        projectId: routeProjectId,
      });
      if (next) router.replace(next);
    };
    window.addEventListener(CLOSE_TASK_FOR_SEARCH, onSwap);
    return () => window.removeEventListener(CLOSE_TASK_FOR_SEARCH, onSwap);
  }, [routeProjectId, router]);
  const leadName = useProjectLead(page, openProject?.orgId, data, hostSlug);

  const closeProject = () => {
    setOpenId(null);
    setFixtureTaskId(null);
    leaveProjectDetail({ pathname, fixtures, push: (href) => router.push(href) });
  };

  useEffect(() => {
    if (isProjectDetailPath(pathname)) return;
    if (new URLSearchParams(window.location.search).get('project')) return;
    setOpenId(null);
    setFixtureTaskId(null);
  }, [pathname]);

  const closeTask = () => {
    const back = takePortalReturn();
    if (fixtures) {
      setFixtureTaskId(null);
      if (back) {
        window.history.pushState(window.history.state, '', back);
        const params = new URLSearchParams(back.split('?')[1] ?? '');
        const tab = params.get('tab');
        window.dispatchEvent(
          new CustomEvent('wh-portal-nav', {
            detail: {
              tab: tab === 'projects' || tab === 'resources' || tab === 'activity' || tab === 'account' || tab === 'dashboard' ? tab : 'dashboard',
              project: params.get('project'),
              task: null,
              doc: params.get('doc'),
              resource: params.get('resource'),
            },
          }),
        );
        return;
      }
      clearSearchParam('task');
      return;
    }
    if (back) {
      router.push(back);
      return;
    }
    if (openProject) router.push(`/projects/${openProject.id}`);
    else router.push('/projects');
  };

  const holdProject = keepProjectWhileLoading({
    fixtures,
    projectsLoading,
    projectFound: openProject != null,
    pathname,
    openId,
  });
  if (holdProject) {
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
          <div className="flex h-full min-h-0 min-w-0 flex-col gap-4" data-testid="project-detail">
            <p style={{ fontSize: 14, color: 'var(--muted)' }}>Loading project</p>
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
            <p style={{ color: 'var(--danger-text)', fontWeight: 600, fontSize: 14 }}>{copy.title}</p>
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
    projectsError: page.error,
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
  const projectClients = page.clients.map((client) => {
    const rows = projects.filter((project) => project.orgId === client.id);
    const counted = 'projectCount' in client && typeof client.projectCount === 'number' ? client.projectCount : rows.length;
    const internal = 'internal' in client ? Boolean(client.internal) : rows.some((project) => project.internal);
    return { id: client.id, name: client.name, projectCount: counted, internal };
  });
  if (openProject) {
    const projectTasks = tasks.filter((task) => task.projectId === openProject.id);
    const projectDocs = docs.filter((doc) => {
      if (doc.projectId !== openProject.id) return false;
      if (isStaff) return true;
      return doc.publishToWarehaus !== false && doc.status !== 'Draft';
    });
    const summary = projectSummaryVisibility(isStaff, openProject);
    const openTask = (task: PortalTask) => {
      clearPortalReturn();
      setOpenId(openProject.id);
      if (fixtures) setFixtureTaskId(task.id);
      else router.push(`/tasks/${task.id}`);
    };
    const resourceChoices = resourcesForProject(
      page.resources,
      openProject.id,
    ).map((resource) => ({ id: resource.id, title: resource.name }));
    return (
      <PortalWorkspace hideHeader eyebrow={tenantEyebrow(data.tenant, 'Project')} title={openProject.name}>
        <PortalTilePane className="project-open-pane">
          <div className="box-border flex h-full min-h-0 w-full min-w-0 max-w-[1108px] flex-col overflow-y-auto" data-testid="project-detail" data-page-scroll="" data-task-view={taskView}>
            <PhoneScrollInset>
            <ProjectRoadmap
              project={openProject}
              tasks={projectTasks}
              staff={isStaff}
              fixtures={fixtures}
              live={page.live}
              hostSlug={hostSlug}
              clientName={openProject.internal ? null : openProject.clientName ?? null}
              viewerEmail={portalSession?.email ?? null}
              activity={activityFeed.items}
              activityError={activityFeed.error}
              onBackToProjects={closeProject}
              onOpenTask={openTask}
              resourceChoices={isStaff ? resourceChoices : []}
              resourcesExtra={
                <DocsBlock docs={projectDocs} staff={isStaff} loading={projectsLoading && projectDocs.length === 0} />
              }
              details={
                <>
            {summary.showEdit ? (
              <div className="hidden justify-end md:flex">
                <EditProjectButton disabled={summary.editDisabled} />
              </div>
            ) : null}
            <ProjectSummary
              project={openProject}
              tasks={projectTasks}
              leadName={leadName}
              onOpenClient={openLinkedClient}
              summary={summary}
            />
            {isStaff ? (
              <div style={{ marginTop: 24 }}>
                <ProjectRepoSetting
                  key={openProject.id}
                  projectId={openProject.id}
                  repo={openProject.agentRepo ?? null}
                  fixtures={fixtures}
                  hostSlug={hostSlug}
                />
                <AgentDriverSetting
                  key={`${openProject.id}-agent`}
                  projectId={openProject.id}
                  driver={openProject.agentDriver ?? null}
                  fixtures={fixtures}
                  hostSlug={hostSlug}
                />
              </div>
            ) : null}
                </>
              }
            />
            </PhoneScrollInset>
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
            resources={page.resources}
            onClose={closeTask}
            onArchived={setArchivedFixtureIds}
            onOpenTask={(id) => {
              clearPortalReturn();
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
        <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto" data-testid="projects-list" data-page-scroll="">
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
              <p data-testid="project-list-sort-line" style={{ fontSize: 13, lineHeight: '19px', color: 'var(--muted)' }}>
                {projectSortSubtitle(sort)}
              </p>
            </div>
            <ProjectListFilters
              loading={projectsLoading}
              viewerCount={viewerCount}
              menu={{
                view: shownView,
                options: viewOptions,
                staff: isStaff,
                onChange: changeView,
                onClear: clearView,
                initialOpen: fixtureMenu.open,
                initialExpanded: fixtureMenu.expanded,
              }}
            >
              {filterCounts.map((chip) => (
                <FilterChip
                  key={chip.key}
                  active={shownView.quick === chip.key}
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
              onClear={clearView}
              createEnabled={createEnabled}
            >
              <ul className="mt-2">
                {visible.map((project) => {
                  const count = project.taskCount;
                  const progress = { percent: project.percent };
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
                          setSearchParams({ project: project.id, taskView: 'board' });
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
          resources={page.resources}
          onClose={closeTask}
          onArchived={setArchivedFixtureIds}
          onOpenTask={(id) => {
            clearPortalReturn();
            if (fixtures) setFixtureTaskId(id);
            else router.push(`/tasks/${id}`);
          }}
        />
      ) : null}
    </PortalWorkspace>
  );
}

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
  onArchived,
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
  onArchived?: (ids: string[]) => void;
}) {
  const data = useProjectTask({ page: { preview: fixtures }, taskId, tasks, staff, hostSlug, resources });
  const { task, subtasks, review } = data;
  const [phone, setPhone] = useState(false);
  const closeLabel = taskCloseLabel(peekPortalReturn());
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const apply = () => setPhone(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);
  return (
    <TaskDetailModal
      task={task}
      staff={staff}
      phone={phone}
      unavailable={!task}
      subtasks={subtasks}
      resources={data.attached}
      projectResources={resources.filter((resource) => !task?.projectId || resource.projectId === task.projectId)}
      clientName={clientName}
      hostSlug={hostSlug}
      live={!fixtures}
      initialStageConfirm={phone ? review.stageConfirm : null}
      initialArchive={review.archive}
      initialMenu={review.menu}
      initialFieldError={review.fieldError}
      initialSourceError={review.sourceError}
      onArchived={onArchived}
      people={data.people}
      projects={data.projects}
      closeLabel={closeLabel}
      onClose={onClose}
      onOpenTask={onOpenTask}
    />
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

function EditProjectButton({ disabled }: { disabled: boolean }) {
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
        background: 'transparent',
        color: 'var(--fg)',
        border: '1px solid var(--border-2, var(--border))',
        borderRadius: 9,
        fontFamily: 'var(--font-body)',
        fontSize: 14,
        fontWeight: 500,
        padding: '12px 16px',
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
      aria-disabled="true"
      aria-describedby={hintId}
      title={EDIT_PROJECT_WRITEBACK_HINT}
      data-testid="edit-project-hint"
      className="item-state-btn inline-flex"
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
            <EditProjectButton disabled={summary.editDisabled} />
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
