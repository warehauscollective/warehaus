import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { getPortalTabForPath, getPortalTabsForMode } from '@warehaus/logic';
import { getPortalSidebarSections } from '../data/sidebarSections';
import { isProjectDetailPath, leaveProjectDetail, tabReplaceHref } from './tabHome';

const provider = readFileSync(new URL('../../components/providers/PortalTabProvider.tsx', import.meta.url), 'utf8');
const sidebar = readFileSync(new URL('../../components/layout/PortalSidebar.tsx', import.meta.url), 'utf8');
const projects = readFileSync(new URL('../../components/pages/ProjectsContent.tsx', import.meta.url), 'utf8');
const dock = readFileSync(new URL('../../components/layout/PortalDock.tsx', import.meta.url), 'utf8');

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
    });
  });
}

describe('tab home wiring', () => {
  it('replaces to the tab root unless the pathname is already that href', () => {
    assert.match(provider, /pathname === '\/preview' \|\| pathname\.startsWith\('\/preview\/'\)/);
    assert.match(provider, /tabReplaceHref\(/);
    assert.match(provider, /if \(href\) router\.replace\(href\)/);
    assert.equal(provider.includes('getPortalTabForPath(pathname) !== tab'), false);
    assert.match(dock, /onClick=\{\(\) => setActiveTab\(value\)\}/);
    assert.match(dock, /aria-selected=\{isActive\}/);
    assert.equal(dock.includes('if (!isActive)'), false);
  });

  it('All projects on a detail path uses the same leave as closeProject', () => {
    assert.match(sidebar, /key === 'all' && isProjectDetailPath\(pathname\)/);
    assert.match(sidebar, /leaveProjectDetail\(/);
    assert.match(sidebar, /onSelect=\{selectSection\}/);
    assert.match(projects, /leaveProjectDetail\(/);
    assert.match(projects, /setOpenId\(null\)/);
  });
});
