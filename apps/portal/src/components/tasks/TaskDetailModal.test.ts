import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

describe('task detail attach swap', () => {
  const source = readFileSync(new URL('./TaskDetailModal.tsx', import.meta.url), 'utf8');

  it('shows the attach picker in place of the task detail, with one stack', () => {
    assert.match(source, /PortalModalStack/);
    assert.match(source, /key: 'detail'/);
    assert.match(source, /keep: true/);
    assert.match(source, /hidden=\{attach\}/);
    assert.match(source, /open: !attach/);
    assert.match(source, /key: 'attach'/);
    assert.match(source, /open: attach && Boolean\(task\)/);
    const picker = source.slice(source.indexOf('function AttachPicker'), source.indexOf('const inputStyle'));
    assert.equal(picker.includes('portal-modal-scrim'), false);
    assert.equal(picker.includes('data-portal-scrim'), false);
    assert.equal(picker.includes('zIndex: 90'), false);
  });

  it('keeps the webkit blur beside the scrim token', () => {
    const css = readFileSync(new URL('../../styles/global.css', import.meta.url), 'utf8');
    const rule = css.slice(css.indexOf('.ds-scope.portal-modal-scrim'), css.indexOf('.ds-scope .portal-modal-panel'));
    assert.match(rule, /-webkit-backdrop-filter:\s*blur\(40px\)/);
    assert.match(rule, /backdrop-filter:\s*blur\(var\(--scrim-blur\)\)/);
    assert.match(rule, /-webkit-backdrop-filter:\s*none/);
  });
});
