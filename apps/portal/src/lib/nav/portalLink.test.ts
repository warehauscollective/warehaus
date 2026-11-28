import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { milestoneFromSearch, portalLinkHref, troubleshootFromSearch } from './portalLink';

describe('portalLinkHref', () => {
  it('opens a task at the Troubleshoot section, and drops any other query', () => {
    assert.equal(portalLinkHref('warehaus://task/abc?section=troubleshoot'), '/tasks/abc?section=troubleshoot');
    assert.equal(portalLinkHref('warehaus://task/abc?section=comments&next=//evil.example'), '/tasks/abc');
    assert.equal(troubleshootFromSearch('?section=troubleshoot'), true);
    assert.equal(troubleshootFromSearch('section=troubleshoot&x=1'), true);
    assert.equal(troubleshootFromSearch('?section=other'), false);
    assert.equal(troubleshootFromSearch(''), false);
  });

  it('opens projects, tasks, resources and docs', () => {
    assert.equal(portalLinkHref('warehaus://project/k975vmerwebjswcbmh27gbp6tx8h175e'), '/projects/k975vmerwebjswcbmh27gbp6tx8h175e');
    assert.equal(portalLinkHref('warehaus://task/m17as35g3paw4dj8tyxra46h998jx2d6'), '/tasks/m17as35g3paw4dj8tyxra46h998jx2d6');
    assert.equal(portalLinkHref('warehaus://resource/r1'), '/resources/r1');
    assert.equal(portalLinkHref('warehaus://doc/d_1'), '/docs/d_1');
  });

  it('opens a milestone on its project page', () => {
    assert.equal(
      portalLinkHref('warehaus://milestone/nn77zctgc8wm54zmdkfxr5zntd8jwsh4?project=k975vmerwebjswcbmh27gbp6tx8h175e'),
      '/projects/k975vmerwebjswcbmh27gbp6tx8h175e?milestone=nn77zctgc8wm54zmdkfxr5zntd8jwsh4',
    );
  });

  it('sends a milestone with no project to Projects', () => {
    assert.equal(portalLinkHref('warehaus://milestone/nn77zctgc8wm54zmdkfxr5zntd8jwsh4'), '/projects');
    assert.equal(portalLinkHref('warehaus://milestone/abc?project='), '/projects');
  });

  it('reads the kind case-insensitively and ignores a trailing slash', () => {
    assert.equal(portalLinkHref('WAREHAUS://Task/abc/'), '/tasks/abc');
  });

  it('refuses other schemes, unknown kinds and odd ids', () => {
    for (const link of [
      'https://warehaus-portal.vercel.app/projects',
      'javascript:alert(1)',
      'warehaus://settings/abc',
      'warehaus://task/',
      'warehaus://task/a/b',
      'warehaus://task/..%2Fadmin',
      'warehaus://task/%E0%A4%A',
      'warehaus://task/' + 'a'.repeat(65),
      'not a link',
      '',
    ]) {
      assert.equal(portalLinkHref(link), null, link);
    }
  });

  it('refuses an odd project id on a milestone link', () => {
    assert.equal(portalLinkHref('warehaus://milestone/abc?project=../x'), '/projects');
  });
});

describe('milestoneFromSearch', () => {
  it('reads ?milestone=', () => {
    assert.equal(milestoneFromSearch('?milestone=nn77zctgc8wm54zmdkfxr5zntd8jwsh4'), 'nn77zctgc8wm54zmdkfxr5zntd8jwsh4');
    assert.equal(milestoneFromSearch('layout=board&milestone=m1'), 'm1');
  });

  it('ignores a missing or odd value', () => {
    assert.equal(milestoneFromSearch(''), null);
    assert.equal(milestoneFromSearch('?milestone='), null);
    assert.equal(milestoneFromSearch('?milestone=a/b'), null);
  });
});
