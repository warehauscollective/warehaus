import {
  clientMaySeeProject,
  clientMaySeeTask,
  clientMaySeeTaskDescription,
  isClientSurfaceVisible,
} from '@warehaus/portal-sync';

export type SearchKind = 'project' | 'task' | 'doc' | 'resource';

export type SearchHit = {
  id: string;
  kind: SearchKind;
  title: string;
  /** `type · date · project`, with empty parts omitted. */
  subtitle: string;
  href: string;
  /** First segment of `subtitle`. Drives the type icon. */
  metaType: string;
  metaWhen?: string;
  /** Truncates before the type and date. */
  metaProject?: string;
  /** Set only when the task has a stage. Tasks without one stay unmarked. */
  stage?: string;
  /** Staff only. Omitted for clients, and never rendered on project or task rows. */
  published?: boolean;
};

export type SearchGroups = {
  projects: SearchHit[];
  tasks: SearchHit[];
  docs: SearchHit[];
  resources: SearchHit[];
};

type ProjectRow = {
  _id: string;
  orgId: string;
  name: string;
  description?: string | null;
  status: string;
  type?: string[] | null;
  archive?: boolean;
  publishToWarehaus: boolean;
  syncHiddenAt?: number | null;
  lastSyncedAt?: number | null;
  endDate?: string | null;
};

type TaskRow = {
  _id: string;
  orgId: string;
  projectId: string;
  name: string;
  description?: string | null;
  status: string;
  publishToWarehaus: boolean;
  syncHiddenAt?: number | null;
  stage?: string | null;
  date?: string | null;
  lastEditedTime?: string | null;
  lastSyncedAt?: number | null;
};

type DocRow = {
  _id: string;
  orgId: string;
  projectId?: string | null;
  title: string;
  summary?: string | null;
  docType: string;
  status: string;
  publishToWarehaus: boolean;
  syncHiddenAt?: number | null;
  lastSyncedAt?: number | null;
  updatedAt?: number | null;
};

type ResourceRow = {
  _id: string;
  orgId: string;
  projectId?: string | null;
  title: string;
  description?: string | null;
  type?: string | null;
  publishToWarehaus: boolean;
  archive?: boolean;
  syncHiddenAt?: number | null;
  lastSyncedAt?: number | null;
  updatedAt?: number | null;
};

const LIMIT = 20;

function blank(): SearchGroups {
  return { projects: [], tasks: [], docs: [], resources: [] };
}

function needleOf(query: string): string {
  return query.trim().toLowerCase();
}

function matches(needle: string, parts: Array<string | null | undefined>): boolean {
  if (!needle) return false;
  return parts
    .filter((part): part is string => Boolean(part && part.trim()))
    .join('\n')
    .toLowerCase()
    .includes(needle);
}

function projectGate(project: ProjectRow | null, orgVisible: boolean) {
  if (!project) {
    return {
      name: '',
      types: [] as string[],
      publishToWarehaus: false,
      archive: false,
      hidden: true,
      orgVisible,
    };
  }
  return {
    name: project.name,
    types: project.type ?? [],
    publishToWarehaus: project.publishToWarehaus,
    archive: project.archive ?? false,
    hidden: project.syncHiddenAt != null,
    orgVisible,
  };
}

function clientHit(hit: Omit<SearchHit, 'published'>): SearchHit {
  return {
    id: hit.id,
    kind: hit.kind,
    title: hit.title,
    subtitle: hit.subtitle,
    href: hit.href,
    metaType: hit.metaType,
    ...(hit.metaWhen ? { metaWhen: hit.metaWhen } : {}),
    ...(hit.metaProject ? { metaProject: hit.metaProject } : {}),
    ...(hit.stage ? { stage: hit.stage } : {}),
  };
}

function staffHit(hit: Omit<SearchHit, 'published'> & { published: boolean }): SearchHit {
  return { ...clientHit(hit), published: hit.published };
}

function formatSearchDate(value: string | number | null | undefined): string | null {
  if (value == null || value === '') return null;
  const dateOnly = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  const date = typeof value === 'number'
    ? new Date(value)
    : dateOnly
      ? new Date(Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])))
      : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Granola and Link are resource types. Everything else in that group reads as Doc. */
export function resourceTypeLabel(type: string | null | undefined): string {
  const value = (type ?? '').toLowerCase();
  if (/granola|meeting|note/.test(value)) return 'Granola';
  if (/link|url/.test(value)) return 'Link';
  return 'Doc';
}

function metaOf(type: string, when: string | null, project: string | null): Pick<SearchHit, 'subtitle' | 'metaType' | 'metaWhen' | 'metaProject'> {
  const metaWhen = when?.trim() || undefined;
  const metaProject = project?.trim() || undefined;
  return {
    metaType: type,
    metaWhen,
    metaProject,
    subtitle: [type, metaWhen, metaProject].filter(Boolean).join(' · '),
  };
}

function taskStage(stage: string | null | undefined): string | undefined {
  const value = stage?.trim();
  return value ? value : undefined;
}

/**
 * Tier filter for portal search. Client hits are a fixed key set:
 * id, kind, title, subtitle, href. Notion ids, external ids, sync times,
 * publish flags, sync status, and doc order never leave this function
 * on the client path. Matching ignores those fields too.
 */
export function searchCatalog(input: {
  audience: 'staff' | 'client';
  query: string;
  orgId: string;
  orgVisible: boolean;
  orgNames?: Record<string, string>;
  projects: ProjectRow[];
  tasks: TaskRow[];
  docs: DocRow[];
  resources: ResourceRow[];
}): SearchGroups {
  const needle = needleOf(input.query);
  if (!needle) return blank();
  const staff = input.audience === 'staff';
  if (!staff && !input.orgVisible) return blank();

  const projects = input.projects.filter((project) => staff || project.orgId === input.orgId);
  const projectById = new Map(projects.map((project) => [project._id, project]));

  const visibleProject = (project: ProjectRow | null) => {
    if (staff) return true;
    return clientMaySeeProject(projectGate(project, input.orgVisible));
  };

  const projectHits = projects
    .filter((project) => visibleProject(project))
    .filter((project) =>
      matches(needle, [project.name, project.description, project.status]),
    )
    .slice(0, LIMIT)
    .map((project) => {
      const base = {
        id: project._id,
        kind: 'project' as const,
        title: project.name,
        ...metaOf(
          'Project',
          formatSearchDate(project.lastSyncedAt ?? project.endDate),
          input.orgNames?.[project.orgId] ?? null,
        ),
        href: `/projects/${project._id}`,
      };
      return staff ? staffHit({ ...base, published: project.publishToWarehaus }) : clientHit(base);
    });

  const taskHits = input.tasks
    .filter((task) => staff || task.orgId === input.orgId)
    .filter((task) => {
      if (staff) return true;
      const project = projectById.get(task.projectId) ?? null;
      return clientMaySeeTask({
        publishToWarehaus: task.publishToWarehaus,
        hidden: task.syncHiddenAt != null,
        project: projectGate(project, input.orgVisible),
      });
    })
    .filter((task) => {
      const description =
        staff || clientMaySeeTaskDescription({ publishToWarehaus: task.publishToWarehaus })
          ? task.description
          : null;
      return matches(needle, [task.name, task.status, description]);
    })
    .slice(0, LIMIT)
    .map((task) => {
      // No stage mark, and no change to who can see the task, until Peter decides.
      const stage = taskStage(task.stage);
      const project = projectById.get(task.projectId) ?? null;
      const base = {
        id: task._id,
        kind: 'task' as const,
        title: task.name,
        ...metaOf(
          'Task',
          formatSearchDate(task.date ?? task.lastEditedTime ?? task.lastSyncedAt),
          project?.name ?? null,
        ),
        href: `/tasks/${task._id}`,
        ...(stage ? { stage } : {}),
      };
      return staff ? staffHit({ ...base, published: task.publishToWarehaus }) : clientHit(base);
    });

  const docHits = input.docs
    .filter((doc) => staff || doc.orgId === input.orgId)
    .filter((doc) => {
      if (staff) return true;
      if (!isClientSurfaceVisible(doc) || doc.status !== 'Published' || !doc.publishToWarehaus) return false;
      const project = doc.projectId ? projectById.get(doc.projectId) ?? null : null;
      if (doc.projectId && !project) return false;
      return visibleProject(project);
    })
    .filter((doc) => matches(needle, [doc.title, doc.summary, doc.docType]))
    .slice(0, LIMIT)
    .map((doc) => {
      const project = doc.projectId ? projectById.get(doc.projectId) ?? null : null;
      const base = {
        id: doc._id,
        kind: 'doc' as const,
        title: doc.title,
        ...metaOf('Doc', formatSearchDate(doc.updatedAt ?? doc.lastSyncedAt), project?.name ?? null),
        href: `/docs/${doc._id}`,
      };
      return staff ? staffHit({ ...base, published: doc.publishToWarehaus && doc.status === 'Published' }) : clientHit(base);
    });

  const resourceHits = input.resources
    .filter((resource) => staff || resource.orgId === input.orgId)
    .filter((resource) => {
      if (staff) return true;
      if (!isClientSurfaceVisible(resource) || resource.archive || !resource.publishToWarehaus) return false;
      const project = resource.projectId ? projectById.get(resource.projectId) ?? null : null;
      if (resource.projectId && !project) return false;
      return visibleProject(project);
    })
    .filter((resource) => matches(needle, [resource.title, resource.description, resource.type]))
    .slice(0, LIMIT)
    .map((resource) => {
      const project = resource.projectId ? projectById.get(resource.projectId) ?? null : null;
      const base = {
        id: resource._id,
        kind: 'resource' as const,
        title: resource.title,
        ...metaOf(
          resourceTypeLabel(resource.type),
          formatSearchDate(resource.updatedAt ?? resource.lastSyncedAt),
          project?.name ?? null,
        ),
        href: `/resources/${resource._id}`,
      };
      return staff ? staffHit({ ...base, published: resource.publishToWarehaus }) : clientHit(base);
    });

  return {
    projects: projectHits,
    tasks: taskHits,
    docs: docHits,
    resources: resourceHits,
  };
}
