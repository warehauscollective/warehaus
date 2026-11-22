import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PORTAL_TABS, type PortalTab } from '@warehaus/logic/portal';
import { getPortalSidebarSections } from './sidebarSections';
import { SIDEBAR_ICON_SRC, SIDEBAR_SECTION_ICON, sidebarIconSrc } from './sidebarIcons';

const publicRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../public');

describe('sidebar icon map', () => {
  it('uses the PDL names for each expanded label', () => {
    assert.deepEqual(SIDEBAR_SECTION_ICON.dashboard, {
      overview: 'board',
      'awaiting-go': 'clock',
      'sync-health': 'refresh',
      'needs-attention': 'clock',
      updates: 'refresh',
    });
    assert.deepEqual(SIDEBAR_SECTION_ICON.projects, {
      all: 'layers',
      active: 'target',
      shipped: 'check',
    });
    assert.deepEqual(SIDEBAR_SECTION_ICON.resources, {
      all: 'doc',
      'meeting-notes': 'mic',
      'files-links': 'link',
    });
    assert.deepEqual(SIDEBAR_SECTION_ICON.activity, {
      all: 'clock',
      tasks: 'list',
      sync: 'refresh',
      resources: 'doc',
    });
    assert.deepEqual(SIDEBAR_SECTION_ICON.account, {
      clients: 'building',
      profile: 'user',
      notifications: 'bell',
      team: 'users',
    });
  });

  it('points every section at one existing icon file', () => {
    const seen = new Set<string>();
    for (const mode of ['team', 'client'] as const) {
      for (const tab of PORTAL_TABS) {
        for (const section of getPortalSidebarSections(tab.value as PortalTab, mode)) {
          const src = sidebarIconSrc(tab.value, section.key);
          assert.ok(src, `${mode} ${tab.value} ${section.key}`);
          assert.equal(src.startsWith('/icons/'), true, src);
          assert.equal(existsSync(join(publicRoot, src.slice(1))), true, src);
          seen.add(`${tab.value}:${section.key}`);
        }
      }
    }
    assert.equal(seen.has('account:clients') && seen.has('account:profile'), true);
    assert.equal(sidebarIconSrc('account', 'tokens'), '/icons/links-lock.svg');
    for (const src of Object.values(SIDEBAR_ICON_SRC)) {
      assert.equal(existsSync(join(publicRoot, src.slice(1))), true, src);
    }
  });
});
