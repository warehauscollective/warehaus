'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { isConvexConfigured } from '@/lib/convex/client';
import {
  defaultProjectListView,
  normalizeProjectListView,
  sameProjectListView,
  type ProjectListView,
} from '@/lib/data/projectList';
import {
  PROJECT_LIST_VIEW_SAVE_DELAY,
  browserProjectListViewStore,
  currentProjectListView,
  projectListViewSave,
  readStoredProjectListView,
  writeStoredProjectListView,
} from '@/lib/data/projectListViewStore';

type Input = {
  /** The signed-in contact. Null while auth is settling and when signed out. */
  contactId: string | null;
  /** From the same session as `contactId`, so a view is never normalised for the wrong role. */
  isStaff: boolean;
  /** The contact is not known yet but may still arrive. The list waits for it. */
  settling: boolean;
  /** Fixture preview: the view is held in memory only. Nothing is read or saved. */
  fixtures: boolean;
};

type Held = {
  /** The contact this state belongs to. Null in fixture preview and when signed out. */
  owner: string | null;
  /** A change made on this page that Convex has not confirmed. */
  edit: ProjectListView | null;
  /** The browser copy read when this contact's list opened. */
  local: ProjectListView | null;
};

function open(owner: string | null): Held {
  const stored = owner ? readStoredProjectListView(browserProjectListViewStore(), owner) : null;
  // A copy still marked pending was changed here and never confirmed saved
  // (the tab closed first, or the save failed), so it is picked up as a change.
  return { owner, edit: stored?.pending ? stored.view : null, local: stored?.view ?? null };
}

/**
 * The signed-in contact's project list view: the quick filter chip, the menu
 * filters and the sort.
 *
 * Read from `projectListPrefs.getMine` and saved with `saveMine` after a short
 * pause, only when it differs from what is saved. A browser copy keyed by
 * contact id lets the list open already filtered. `ready` is false until one
 * of the two is known, so the caller keeps its loading state and the default
 * view never flashes. A failed read or save keeps the view on screen.
 *
 * The view returned is normalised for the viewer's role. Dropping a saved
 * client, status or stack that no project has now is the caller's
 * `pruneProjectListView`, since it needs the rows. That is for display only:
 * the saved view keeps the value, because staff share one view across client
 * hosts and each host lists different projects.
 */
export function useProjectListView({ contactId, isStaff, settling, fixtures }: Input): {
  view: ProjectListView;
  ready: boolean;
  change: (update: (current: ProjectListView) => ProjectListView) => void;
} {
  const live = !fixtures && isConvexConfigured();
  const owner = live && contactId ? contactId : null;

  const [heldState, setHeld] = useState<Held>(() => open(owner));
  let held = heldState;
  if (held.owner !== owner) {
    // Another contact, or signed out: start from that contact's own copy.
    held = open(owner);
    setHeld(held);
  }

  const remote = useSafeQuery<ProjectListView | null>(api.projectListPrefs.getMine, owner ? {} : 'skip');
  const saveMine = useMutation(api.projectListPrefs.saveMine);
  const saved = owner ? remote.data : undefined;
  const readFailed = Boolean(owner && remote.error);

  const savedKey = saved === undefined ? '' : JSON.stringify(saved);
  const editKey = held.edit ? JSON.stringify(held.edit) : '';
  const localKey = held.local ? JSON.stringify(held.local) : '';
  const view = useMemo(
    () => normalizeProjectListView(currentProjectListView({ edit: held.edit, saved, local: held.local }), isStaff),
    // The keys stand in for the objects, which are new on every Convex update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editKey, savedKey, localKey, isStaff],
  );
  const viewRef = useRef(view);
  viewRef.current = view;

  // With no contact and none coming (signed out, link error) the default view shows and nothing blocks.
  const ready = !live || (owner ? held.local != null || saved !== undefined || readFailed : !settling);

  const change = useCallback((update: (current: ProjectListView) => ProjectListView) => {
    const next = update(viewRef.current);
    if (sameProjectListView(next, viewRef.current)) return;
    viewRef.current = next;
    setHeld((current) => ({ ...current, edit: next }));
  }, []);

  /** A save that is waiting out the pause, so leaving the page can still send it. */
  const waiting = useRef<{ owner: string; view: ProjectListView } | null>(null);
  /** Saves sent and not answered yet. */
  const sending = useRef(0);
  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  const saveRef = useRef(saveMine);
  saveRef.current = saveMine;

  // Convex answered and nothing is being changed here: bring the browser copy in line.
  useEffect(() => {
    if (!owner || editKey || savedKey === '') return;
    const view = (JSON.parse(savedKey) as ProjectListView | null) ?? defaultProjectListView();
    const store = browserProjectListViewStore();
    const stored = readStoredProjectListView(store, owner);
    if (stored && !stored.pending && sameProjectListView(stored.view, view)) return;
    if (!stored && sameProjectListView(view, defaultProjectListView())) return;
    writeStoredProjectListView(store, owner, view, false);
  }, [owner, editKey, savedKey]);

  // A change: keep it in the browser at once, then save it after a pause.
  useEffect(() => {
    if (!owner || !editKey) return;
    const edit = normalizeProjectListView(JSON.parse(editKey), isStaff);
    const known = savedKey === '' ? undefined : (JSON.parse(savedKey) as ProjectListView | null);
    const store = browserProjectListViewStore();
    // While a save is on its way, a change back to what was saved must follow
    // it, or the earlier save would land last. `saveMine` drops a no-op.
    const step = sending.current > 0 && known !== undefined ? 'save' : projectListViewSave(edit, known, readFailed);
    if (step === 'skip') {
      // What is saved already matches. No write.
      waiting.current = null;
      writeStoredProjectListView(store, owner, edit, false);
      setHeld((current) => (current.owner === owner ? { ...current, edit: null, local: edit } : current));
      return;
    }
    writeStoredProjectListView(store, owner, edit, true);
    if (step === 'wait') return;
    waiting.current = { owner, view: edit };
    const timer = window.setTimeout(() => {
      waiting.current = null;
      // On success the query updates and the branch above settles the copy.
      // On failure the view stays on screen and the copy stays pending.
      sending.current += 1;
      void saveMine(edit)
        .catch(() => {})
        .finally(() => {
          sending.current -= 1;
        });
    }, PROJECT_LIST_VIEW_SAVE_DELAY);
    return () => window.clearTimeout(timer);
    // saveMine is stable for the life of the Convex client.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, editKey, savedKey, readFailed, isStaff]);

  // Leaving the list inside the pause still sends the last change.
  useEffect(
    () => () => {
      const last = waiting.current;
      waiting.current = null;
      if (last && last.owner === ownerRef.current) void saveRef.current(last.view).catch(() => {});
    },
    [],
  );

  return { view, ready, change };
}
