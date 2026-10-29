import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { retrySharedQuery } from '@/components/providers/PortalDataRetry';

const SNAPSHOT = 'portalData:getSnapshot';
const ARGS = { hostSlug: 'acme' };

type QueryMod = { modifications: Array<{ type: string }> } | null;
type Subscriber = {
  modification: QueryMod;
  unsubscribe: () => QueryMod;
};

/**
 * Loaded at runtime so portal typecheck does not follow Convex browser sources.
 * getSnapshot's args are only `{ hostSlug }`, so Try again cannot change them.
 */
async function loadLocalSyncState(): Promise<
  new () => { subscribe: (path: string, args: Record<string, string>) => Subscriber }
> {
  const href = new URL(
    '../../../../node_modules/convex/src/browser/sync/local_state.ts',
    import.meta.url,
  ).href;
  const mod = (await import(href)) as {
    LocalSyncState: new () => { subscribe: (path: string, args: Record<string, string>) => Subscriber };
  };
  return mod.LocalSyncState;
}

describe('snapshot retry', () => {
  it('queries a failed snapshot again after Try again drops every caller', async () => {
    const LocalSyncState = await loadLocalSyncState();
    const state = new LocalSyncState();
    const bell = state.subscribe(SNAPSHOT, ARGS);
    const dock = state.subscribe(SNAPSHOT, ARGS);
    const page = state.subscribe(SNAPSHOT, ARGS);
    assert.equal(bell.modification?.modifications[0].type, 'Add');
    assert.equal(dock.modification, null);
    assert.equal(page.modification, null);

    assert.equal(page.unsubscribe(), null);
    const pageAgain = state.subscribe(SNAPSHOT, ARGS);
    assert.equal(pageAgain.modification, null);

    const fresh = retrySharedQuery([bell, dock, pageAgain], () => state.subscribe(SNAPSHOT, ARGS));
    assert.equal(fresh.modification?.modifications[0].type, 'Add');
  });
});
