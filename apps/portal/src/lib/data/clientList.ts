export type ClientListFilter = 'all' | 'active' | 'internal' | 'sync';

export type ClientListRow = {
  id: string;
  name: string;
  status: string;
  internal: boolean;
  syncHidden: boolean;
  projectCount: number;
  openTaskCount: number;
  contactCount: number;
  awaitingGoCount?: number;
};

export function clientMatchesFilter(client: ClientListRow, filter: ClientListFilter): boolean {
  if (filter === 'internal') return client.internal;
  if (filter === 'sync') return client.syncHidden;
  if (filter === 'active') return client.status.toLowerCase() === 'active' && !client.syncHidden;
  return true;
}

export function clientListStats(clients: readonly ClientListRow[]) {
  const names = (pick: (client: ClientListRow) => boolean) => clients.filter(pick).map((client) => client.name);
  return {
    total: clients.length,
    active: clients.filter((client) => clientMatchesFilter(client, 'active')).length,
    internal: clients.filter((client) => client.internal).length,
    sync: clients.filter((client) => client.syncHidden).length,
    projects: clients.reduce((sum, client) => sum + client.projectCount, 0),
    withProjects: clients.filter((client) => client.projectCount > 0).length,
    awaiting: clients.reduce((sum, client) => sum + (client.awaitingGoCount ?? 0), 0),
    awaitingNames: names((client) => (client.awaitingGoCount ?? 0) > 0),
    syncNames: names((client) => client.syncHidden),
  };
}

export function singleOrAcross(names: readonly string[], empty: string): string {
  if (names.length === 0) return empty;
  if (names.length === 1) return names[0] ?? empty;
  return `Across ${names.length} clients`;
}

/** KPI cards hide only when the directory total is zero. Loading still shows skeletons. */
export function clientDirectoryShowsKpis(count: number, loading: boolean): boolean {
  return loading || count > 0;
}

/** Chips stay for a filtered-empty list. A true empty set has nothing to filter, and loading hides them. */
export function clientDirectoryShowsFilters(count: number, loading: boolean): boolean {
  return count > 0 && !loading;
}

/** No cached rows: the error card replaces the list. Cached rows: a refresh banner. */
export function clientDirectoryErrorMode(error: string | null, count: number): 'none' | 'empty' | 'refresh' {
  if (!error) return 'none';
  return count > 0 ? 'refresh' : 'empty';
}

export function clientInitials(name: string): string {
  const words = name.replace(/\(.*?\)/g, '').split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (words.length === 0) return '•';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((word) => word[0]!.toUpperCase()).join('');
}
