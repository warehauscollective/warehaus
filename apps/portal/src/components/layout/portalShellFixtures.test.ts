import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

describe('preview fixtures stay on the preview route', () => {
  it('does not statically import the fixture module from the signed-in shell', () => {
    const shell = readFileSync(new URL('./PortalShell.tsx', import.meta.url), 'utf8');
    assert.equal(shell.includes('PreviewModalFixtures'), false);
    assert.equal(shell.includes('components/ui/PreviewModalFixtures'), false);
    const page = readFileSync(new URL('../../../app/preview/page.tsx', import.meta.url), 'utf8');
    assert.match(page, /from '@\/components\/ui\/PreviewModalFixtures'/);
    const fixtures = readFileSync(new URL('../ui/PreviewModalFixtures.tsx', import.meta.url), 'utf8');
    assert.match(fixtures, /MoveSheet/);
    assert.match(fixtures, /NeedsDialog/);
    assert.match(fixtures, /pathname === '\/preview'/);
  });
});
