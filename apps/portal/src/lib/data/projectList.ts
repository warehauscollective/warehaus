import type { PortalProject, PortalTask } from '@/lib/data/view-models';

/**
 * Projects and clients have no brand field. The list meta uses the
 * description, never the stack, until a brand exists in the schema.
 */
export type ProjectListFilter = 'all' | 'active' | 'shipped' | 'internal';

export type ProjectListTask = Pick<PortalTask, 'projectId' | 'isDone' | 'stage'>;

const FILTER_LABEL: Record<ProjectListFilter, string> = {
  all: 'All',
  active: 'Active',
  shipped: 'Shipped',
  internal: 'Internal',
};

function glyphs(value: string): string[] {
  return Array.from(value);
}

/** First letters, by code point, so an emoji is never split into a surrogate. */
export function projectInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  if (parts.length === 1) return glyphs(parts[0]).slice(0, 2).join('').toUpperCase();
  return `${glyphs(parts[0])[0] ?? ''}${glyphs(parts[1])[0] ?? ''}`.toUpperCase();
}

export function projectListMeta(
  project: Pick<PortalProject, 'internal' | 'clientName' | 'description'>,
  fallbackClient: string | null | undefined,
  options?: { phone?: boolean },
): string {
  if (project.internal) {
    return options?.phone ? 'Admin only · never shown to clients' : 'Warehaus (internal) · admin-only';
  }
  const client = project.clientName ?? fallbackClient ?? '';
  const detail = project.description?.trim() ?? '';
  if (client && detail) return `${client} · ${detail}`;
  return client || detail || '—';
}

/** Notion progress is a 0–1 fraction or a 0–100 percent. Null stays unknown. */
export function progressPercent(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(value)) return null;
  const pct = value <= 1 ? Math.round(value * 100) : Math.round(value);
  return Math.min(100, Math.max(0, pct));
}

export function formatProgress(value: number | null | undefined): string {
  const pct = progressPercent(value);
  if (pct == null) return '—';
  return `${pct}%`;
}

export function projectProgress(input: {
  projectId: string;
  progress: number | null | undefined;
  tasks: readonly ProjectListTask[];
}): { percent: number | null; label: string; fromTasks: boolean } {
  const mine = input.tasks.filter((task) => task.projectId === input.projectId);
  if (mine.length > 0) {
    const shipped = mine.filter((task) => task.stage === 'Shipped' || task.isDone).length;
    const percent = Math.round((shipped / mine.length) * 100);
    return { percent, label: `${percent}% of tasks shipped`, fromTasks: true };
  }
  const percent = progressPercent(input.progress);
  if (percent == null) return { percent: null, label: '— shipped', fromTasks: false };
  return { percent, label: `${percent}% shipped`, fromTasks: false };
}

export function isShippedStatus(status: string): boolean {
  return /ship|done/i.test(status);
}

export function viewerProjects<T extends { internal?: boolean }>(projects: readonly T[], staff: boolean): T[] {
  return projects.filter((project) => staff || !project.internal);
}

export function projectMatchesFilter(
  project: { internal?: boolean; status: string },
  filter: ProjectListFilter,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'internal') return project.internal === true;
  if (project.internal) return false;
  if (filter === 'shipped') return isShippedStatus(project.status);
  return !isShippedStatus(project.status);
}

export function projectFilterCounts(
  projects: readonly { internal?: boolean; status: string }[],
  staff: boolean,
): Array<{ key: ProjectListFilter; label: string; count: number }> {
  const visible = viewerProjects(projects, staff);
  const keys: ProjectListFilter[] = staff ? ['all', 'active', 'shipped', 'internal'] : ['all', 'active', 'shipped'];
  return keys.map((key) => ({
    key,
    label: FILTER_LABEL[key],
    count: key === 'all' ? visible.length : visible.filter((project) => projectMatchesFilter(project, key)).length,
  }));
}

/** Staff list only. Clients, internal rows, and a missing flag stay blank. */
export function showProjectPublish(
  staff: boolean,
  project: { internal?: boolean; publishToWarehaus?: boolean | null },
): boolean {
  return staff && !project.internal && project.publishToWarehaus != null;
}

export function sortProjectsByLastUpdated<T extends { lastSyncedAt?: number | null; name: string }>(
  projects: readonly T[],
): T[] {
  return [...projects].sort((a, b) => {
    const left = a.lastSyncedAt ?? Number.NEGATIVE_INFINITY;
    const right = b.lastSyncedAt ?? Number.NEGATIVE_INFINITY;
    if (right !== left) return right - left;
    return a.name.localeCompare(b.name);
  });
}
