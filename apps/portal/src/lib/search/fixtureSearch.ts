import { isOrgVisibleToClients } from '@warehaus/portal-sync';
import { searchCatalog, type SearchGroups } from '@convex/_lib/portalSearch';
import { FIXTURE_CLIENTS, FIXTURE_DOCS, FIXTURE_PROJECTS, FIXTURE_RESOURCES, FIXTURE_TASKS } from '@/lib/data/fixtures';
import { FIXTURE_CLIENT_SESSION, FIXTURE_SESSION } from '@/lib/data/portalFixtures';

/** Local stand-in for api.search while fixtures are on. Same tier filter as Convex. */
export function searchFixtures(audience: 'staff' | 'client', query: string): SearchGroups {
  const org = FIXTURE_CLIENTS.find((client) => client.id === FIXTURE_CLIENT_SESSION.orgId);
  return searchCatalog({
    audience,
    query,
    orgId: audience === 'staff' ? FIXTURE_SESSION.orgId : FIXTURE_CLIENT_SESSION.orgId,
    orgVisible: audience === 'staff' || isOrgVisibleToClients({
      portalAccess: org?.portalAccess === 'Disabled' ? 'Disabled' : 'Enabled',
      syncHiddenAt: org?.syncHidden ? 1 : null,
    }),
    orgNames: Object.fromEntries(FIXTURE_CLIENTS.map((client) => [client.id, client.name])),
    projects: FIXTURE_PROJECTS.map((project) => ({
      _id: project.id,
      orgId: project.orgId,
      name: project.name,
      description: project.description,
      status: project.status,
      type: project.internal ? ['Internal'] : [],
      archive: false,
      publishToWarehaus: project.publishToWarehaus,
      syncHiddenAt: project.syncHidden ? 1 : null,
      lastSyncedAt: project.lastSyncedAt,
      endDate: project.endDate,
    })),
    tasks: FIXTURE_TASKS.map((task) => ({
      _id: task.id,
      orgId: task.orgId,
      projectId: task.projectId,
      name: task.name,
      description: null,
      status: task.status,
      stage: task.stage,
      date: task.date,
      publishToWarehaus: task.publishToWarehaus,
      syncHiddenAt: task.syncHidden ? 1 : null,
      lastSyncedAt: task.lastSyncedAt,
    })),
    docs: FIXTURE_DOCS.map((doc) => ({
      _id: doc.id,
      orgId: doc.orgId,
      projectId: doc.projectId,
      title: doc.title,
      summary: doc.summary,
      docType: doc.docType,
      status: doc.status,
      publishToWarehaus: doc.publishToWarehaus,
      syncHiddenAt: doc.syncHidden ? 1 : null,
      lastSyncedAt: doc.lastSyncedAt,
      updatedAt: 'updatedAt' in doc ? doc.updatedAt : undefined,
    })),
    resources: FIXTURE_RESOURCES.map((resource) => ({
      _id: resource.id,
      orgId: resource.orgId,
      projectId: resource.projectId,
      title: resource.name,
      description: resource.description,
      type: resource.type,
      publishToWarehaus: resource.publishToWarehaus,
      archive: false,
      syncHiddenAt: resource.syncHidden ? 1 : null,
      lastSyncedAt: resource.lastSyncedAt,
      updatedAt: resource.updatedAt,
    })),
  });
}
