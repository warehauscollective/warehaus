import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getPortalTabForPath, getPortalTabsForMode } from '@warehaus/logic';
import { getPortalSidebarSections } from '../data/sidebarSections';
import type { PortalNavDetail } from './openPortalHref';
import {
  allProjectsLeavesDetail,
  isProjectDetailPath,
  leaveProjectDetail,
  readProjectNav,
  readResourceNav,
  runTabHomeClick,
  tabReplaceHref,
} from './tabHome';

/**
 * Staff and client share one dock. 1440 is the desktop rail; 390 is the
 * phone menu. Both call the same tab and "All projects" handlers.
 */
const viewers = [
  { audience: 'staff', mode: 'team', width: 1440 },
  { audience: 'staff', mode: 'team', width: 390 },
  { audience: 'client', mode: 'client', width: 1440 },
  { audience: 'client', mode: 'client', width: 390 },
] as const;

for (const viewer of viewers) {
  describe(`${viewer.audience} at ${viewer.width}`, () => {
    it('sends /projects/:id and /tasks/:id to /projects and keeps the Projects highlight', () => {
      const tabs = getPortalTabsForMode(viewer.mode);
      assert.equal(tabs.find((tab) => tab.value === 'projects')?.href, '/projects');
      assert.equal(
        getPortalSidebarSections('projects', viewer.mode).some((section) => section.key === 'all' && section.label === 'All projects'),
        true,
      );
      assert.equal(tabReplaceHref({ pathname: '/projects/p-site', tab: 'projects' }), '/projects');
      assert.equal(tabReplaceHref({ pathname: '/tasks/t-doing', tab: 'projects' }), '/projects');
      assert.equal(
        tabReplaceHref({ pathname: '/projects/p-site', tab: 'projects', search: '?as=client' }),
        '/projects?as=client',
      );
      assert.equal(
        tabReplaceHref({ pathname: '/resources/r-notes', tab: 'resources', search: '?as=staff' }),
        '/resources?as=staff',
      );
      assert.equal(getPortalTabForPath('/projects/p-site'), 'projects');
      assert.equal(getPortalTabForPath('/tasks/t-doing'), 'projects');
      assert.equal(isProjectDetailPath('/projects/p-site'), true);
      assert.equal(isProjectDetailPath('/tasks/t-doing'), true);

      const pushed: string[] = [];
      const push = (href: string) => pushed.push(href);
      leaveProjectDetail({ pathname: '/projects/p-site', fixtures: false, push });
      leaveProjectDetail({ pathname: '/tasks/t-doing', fixtures: false, push });
      assert.deepEqual(pushed, ['/projects', '/projects']);
    });

    it('sends each other tab to its root from a nested page', () => {
      assert.equal(tabReplaceHref({ pathname: '/projects/p-site', tab: 'dashboard' }), '/');
      assert.equal(tabReplaceHref({ pathname: '/resources/r-notes', tab: 'resources' }), '/resources');
      assert.equal(tabReplaceHref({ pathname: '/docs/d-brief', tab: 'resources' }), '/resources');
      assert.equal(tabReplaceHref({ pathname: '/files/brief.pdf', tab: 'resources' }), '/resources');
      assert.equal(tabReplaceHref({ pathname: '/projects/p-site', tab: 'activity' }), '/activity');
      assert.equal(tabReplaceHref({ pathname: '/projects/p-site', tab: 'account' }), '/account');
      assert.equal(
        tabReplaceHref({
          pathname: '/projects/p-site',
          tab: 'account',
          search: '?client=c-north&section=clients',
        }),
        '/account?client=c-north&section=clients',
      );
      assert.equal(getPortalTabForPath('/resources/r-notes'), 'resources');
      assert.equal(getPortalTabForPath('/'), 'dashboard');
      assert.equal(getPortalTabForPath('/activity'), 'activity');
      assert.equal(getPortalTabForPath('/account'), 'account');
      assert.equal(
        tabReplaceHref({
          pathname: '/account',
          tab: 'account',
          search: '?client=c-north&section=clients&project=p-site',
        }),
        '/account?client=c-north&section=clients',
      );
    });

    it('returns a list-opened project and resource to that tab home', () => {
      const cases = [
        ['projects', '/projects', '?project=p-site&taskView=board', '/projects'],
        ['projects', '/projects', '?as=client&project=p-site&taskView=board', '/projects?as=client'],
        ['projects', '/projects', '?project=p-site&task=t-doing&taskView=board', '/projects'],
        ['resources', '/resources', '?resource=r-notes', '/resources'],
        ['resources', '/resources', '?as=staff&resource=r-notes', '/resources?as=staff'],
        ['projects', '/projects/p-site', '', '/projects'],
        ['projects', '/tasks/t-doing', '', '/projects'],
        ['resources', '/resources/r-notes', '', '/resources'],
      ] as const;
      for (const [tab, pathname, search, expected] of cases) {
        const replaced: string[] = [];
        const events: PortalNavDetail[] = [];
        const href = runTabHomeClick({
          tab,
          location: { pathname, search },
          replace: (next) => replaced.push(next),
          dispatch: (detail) => events.push(detail),
        });
        assert.equal(href, expected);
        assert.deepEqual(replaced, [expected]);
        assert.equal(events.length, 1);
        assert.equal(events[0]?.home, true);
        assert.equal(events[0]?.project, null);
        assert.equal(events[0]?.resource, null);
        const project = readProjectNav({ detail: events[0] ?? null, search: '' });
        assert.equal(project.home, true);
        assert.equal(project.project, null);
        assert.equal(project.task, null);
        const resource = readResourceNav({ detail: events[0] ?? null, search: '', preview: false });
        assert.equal(resource.home, true);
        assert.equal(resource.resource, null);
        assert.equal(resource.doc, null);
      }
      assert.equal(allProjectsLeavesDetail('/projects', '?project=p-site&taskView=board'), true);
      assert.equal(allProjectsLeavesDetail('/projects/p-site', ''), true);
      assert.equal(allProjectsLeavesDetail('/tasks/t-doing', ''), true);
      assert.equal(allProjectsLeavesDetail('/projects', '?as=client'), false);
    });

    it('does not replace when the path is already that root, and stays on /preview', () => {
      assert.equal(tabReplaceHref({ pathname: '/', tab: 'dashboard' }), null);
      assert.equal(tabReplaceHref({ pathname: '/projects', tab: 'projects' }), null);
      assert.equal(tabReplaceHref({ pathname: '/resources', tab: 'resources' }), null);
      assert.equal(tabReplaceHref({ pathname: '/activity', tab: 'activity' }), null);
      assert.equal(tabReplaceHref({ pathname: '/account', tab: 'account' }), null);
      assert.equal(tabReplaceHref({ pathname: '/preview', tab: 'projects' }), null);
      assert.equal(tabReplaceHref({ pathname: '/preview/approvals', tab: 'resources' }), null);
      assert.equal(isProjectDetailPath('/projects'), false);
      const pushed: string[] = [];
      leaveProjectDetail({
        pathname: '/projects',
        fixtures: false,
        push: (href) => pushed.push(href),
      });
      leaveProjectDetail({
        pathname: '/projects/p-site',
        fixtures: true,
        push: (href) => pushed.push(href),
      });
      assert.deepEqual(pushed, []);
      let fired = false;
      assert.equal(
        runTabHomeClick({
          tab: 'projects',
          location: { pathname: '/projects', search: '?as=client' },
          replace: () => {
            fired = true;
          },
          dispatch: () => {
            fired = true;
          },
        }),
        null,
      );
      assert.equal(fired, false);
      assert.equal(
        runTabHomeClick({
          tab: 'resources',
          location: { pathname: '/resources', search: '' },
          replace: () => {
            fired = true;
          },
          dispatch: () => {
            fired = true;
          },
        }),
        null,
      );
      assert.equal(fired, false);
    });
  });
}
