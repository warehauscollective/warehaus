import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React, { createElement, type ComponentProps, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readRoadmapSource } from '../projects/roadmapSource';

Object.assign(globalThis, { React });
const { PortalModal, openingFocus } = await import('./PortalModal');
const PinnedModal = PortalModal as (
  props: Omit<ComponentProps<typeof PortalModal>, 'children'>,
) => ReactElement;

describe('opening focus', () => {
  it('opens on Cancel, then a field, then the first button', () => {
    const base = { panel: 'panel', focusPanel: false };
    assert.equal(openingFocus({ ...base, cancel: 'cancel', field: 'field', button: 'close' }), 'cancel');
    assert.equal(openingFocus({ ...base, field: 'field', button: 'close' }), 'field');
    assert.equal(openingFocus({ ...base, button: 'close' }), 'close');
    assert.equal(openingFocus({ ...base }), null);
  });

  it('with focusPanel, a dialog with no field opens on the panel, so Close has no ring', () => {
    const base = { panel: 'panel', focusPanel: true };
    assert.equal(openingFocus({ ...base, button: 'close' }), 'panel');
    assert.equal(openingFocus({ ...base, field: 'field', button: 'close' }), 'field');
    const render = (focusPanel: boolean) =>
      renderToStaticMarkup(createElement(PinnedModal, { label: 'Runner status', header: 'default', onClose: () => undefined, focusPanel }, createElement('p', null, 'Body')));
    const dialog = (markup: string) => markup.match(/<div[^>]*role="dialog"[^>]*>/)?.[0] ?? '';
    assert.match(dialog(render(true)), /tabindex="-1"/);
    assert.match(dialog(render(true)), /outline:none/);
    assert.equal(dialog(render(false)).includes('tabindex'), false);
  });
});

describe('pinned modal footer', () => {
  it('keeps the footer outside the scroll region', () => {
    const html = renderToStaticMarkup(
      createElement(
        PinnedModal,
        {
          label: 'New milestone',
          onClose: () => undefined,
          footer: createElement('button', { type: 'submit' }, 'Create milestone'),
        },
        createElement('p', null, 'Describe the outcome'),
      ),
    );
    const bodyAt = html.indexOf('data-portal-modal-body');
    const footerAt = html.indexOf('data-testid="portal-modal-footer"');
    assert.ok(bodyAt > -1, 'scroll body');
    assert.ok(footerAt > bodyAt, 'footer follows the scroll body');
    const between = html.slice(html.indexOf('>', bodyAt) + 1, footerAt);
    assert.match(between, /Describe the outcome/);
    assert.equal(between.includes('Create milestone'), false);
    assert.match(html.slice(footerAt), /Create milestone/);
    assert.match(html, /calc\(100dvh - 24px - 82px - env\(safe-area-inset-bottom, 0px\)\)/);
    assert.match(html, /24px 24px calc\(82px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  });

  it('puts New milestone actions in the pinned footer', () => {
    const roadmap = readRoadmapSource();
    const create = roadmap.slice(roadmap.indexOf('function CreateMilestone'), roadmap.indexOf('function milestoneFieldErrors'));
    const form = create.slice(create.indexOf('<form'), create.indexOf('</form>'));
    assert.match(create, /data-testid="portal-modal-footer"|footer=\{/);
    assert.match(create, /form="milestone-create"/);
    assert.match(create, /Create milestone/);
    assert.equal(form.includes('Create milestone'), false);
    assert.equal(form.includes('>Cancel<'), false);
    const edit = roadmap.slice(roadmap.indexOf('function EditDialog'), roadmap.indexOf('function CreateMilestone'));
    const editForm = edit.slice(edit.indexOf('<form'), edit.indexOf('</form>'));
    assert.match(edit, /form="milestone-edit-form"/);
    assert.equal(editForm.includes('Save milestone'), false);
  });
});
