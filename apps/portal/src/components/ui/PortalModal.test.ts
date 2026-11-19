import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import React, { createElement, type ComponentProps, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

Object.assign(globalThis, { React });
const { PortalModal } = await import('./PortalModal');
const PinnedModal = PortalModal as (
  props: Omit<ComponentProps<typeof PortalModal>, 'children'>,
) => ReactElement;

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
    const roadmap = readFileSync(new URL('../projects/ProjectRoadmap.tsx', import.meta.url), 'utf8');
    const create = roadmap.slice(roadmap.indexOf('function CreateMilestone'), roadmap.indexOf('type MilestoneFieldErrors'));
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
