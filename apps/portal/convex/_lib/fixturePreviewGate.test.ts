import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fixturePreviewAllowedFrom } from '../../src/lib/data/fixturePreviewGate';
import {
  isMissingConvexFunction,
  staffRosterQueriesDeployedFrom,
} from '../../src/lib/data/staffRoster';

describe('fixture preview gate', () => {
  it('requires the fixtures flag and a non-production Vercel env', () => {
    assert.equal(
      fixturePreviewAllowedFrom({ fixturesFlag: '1', vercelEnv: 'preview', vercel: '1' }),
      true,
    );
    assert.equal(
      fixturePreviewAllowedFrom({ fixturesFlag: '1', vercelEnv: 'development', vercel: '1' }),
      true,
    );
    assert.equal(
      fixturePreviewAllowedFrom({ fixturesFlag: '1', vercelEnv: 'production', vercel: '1' }),
      false,
    );
    assert.equal(fixturePreviewAllowedFrom({ vercelEnv: 'preview', vercel: '1' }), false);
    assert.equal(
      fixturePreviewAllowedFrom({ fixturesFlag: '1', vercelEnv: '', vercel: '1' }),
      false,
    );
    assert.equal(fixturePreviewAllowedFrom({ fixturesFlag: '1', vercel: '1' }), false);
  });

  it('allows local next dev only when the process is not on Vercel', () => {
    assert.equal(fixturePreviewAllowedFrom({ fixturesFlag: '1' }), true);
    assert.equal(fixturePreviewAllowedFrom({}), false);
  });
});

describe('staff roster queries', () => {
  it('stay off unless the deploy flag is set', () => {
    assert.equal(staffRosterQueriesDeployedFrom(undefined), false);
    assert.equal(staffRosterQueriesDeployedFrom(''), false);
    assert.equal(staffRosterQueriesDeployedFrom('1'), true);
  });

  it('recognises a Convex function that is not deployed', () => {
    assert.equal(
      isMissingConvexFunction(
        "Could not find public function for 'projects:listForStaff'. Did you forget to run `npx convex dev`?",
      ),
      true,
    );
    assert.equal(isMissingConvexFunction('Not authenticated'), false);
    assert.equal(isMissingConvexFunction(null), false);
  });
});
