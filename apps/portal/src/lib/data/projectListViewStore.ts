/**
 * The browser copy of one contact's project list view, and the rules for
 * which view the list shows and when it is saved. Pure: the store is passed
 * in, so this runs in a test with a plain object. No React, no Convex.
 *
 * Convex (`projectListPrefs`) is the saved view. This copy only lets the list
 * open already filtered before Convex answers.
 */
import {
  defaultProjectListView,
  normalizeProjectListView,
  sameProjectListView,
  type ProjectListView,
} from '@convex/_lib/projectListView';

export type ProjectListViewStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type StoredProjectListView = {
  view: ProjectListView;
  /** True while this view has not been confirmed saved in Convex. */
  pending: boolean;
};

const KEY = 'wh-portal-project-list-view';
const VERSION = 1;

/** Milliseconds between the last change and the save. */
export const PROJECT_LIST_VIEW_SAVE_DELAY = 500;

/** One key per contact, so one person's view is never read for another. */
export function projectListViewKey(contactId: string): string {
  return `${KEY}:${contactId}`;
}

/** The browser's store, or null on the server and where storage is blocked. */
export function browserProjectListViewStore(): ProjectListViewStore | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The copy kept for this contact, or null. A copy written for another contact,
 * another version, or one that does not parse is ignored. The view is read as
 * staff here (nothing stripped): the caller normalises for the viewer's role.
 */
export function readStoredProjectListView(
  store: ProjectListViewStore | null,
  contactId: string,
): StoredProjectListView | null {
  if (!store || !contactId) return null;
  try {
    const raw = store.getItem(projectListViewKey(contactId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed == null || typeof parsed !== 'object') return null;
    const entry = parsed as Record<string, unknown>;
    if (entry.v !== VERSION || entry.contactId !== contactId) return null;
    if (entry.view == null || typeof entry.view !== 'object') return null;
    return { view: normalizeProjectListView(entry.view, true), pending: entry.pending === true };
  } catch {
    return null;
  }
}

/**
 * Keep the copy for this contact. A saved default view is stored as no key,
 * the way Convex stores it as no row. Storage errors are swallowed: the copy
 * is a convenience and must never break the list.
 */
export function writeStoredProjectListView(
  store: ProjectListViewStore | null,
  contactId: string,
  view: ProjectListView,
  pending: boolean,
): void {
  if (!store || !contactId) return;
  try {
    const key = projectListViewKey(contactId);
    if (!pending && sameProjectListView(view, defaultProjectListView())) {
      store.removeItem(key);
      return;
    }
    store.setItem(key, JSON.stringify({ v: VERSION, contactId, view, pending }));
  } catch {
    // Full or blocked storage.
  }
}

export type ProjectListViewSources = {
  /** What this person changed on this page and Convex has not confirmed. */
  edit: ProjectListView | null;
  /** Convex: undefined while unknown, null when no view is saved. */
  saved: ProjectListView | null | undefined;
  /** The browser copy for this contact. */
  local: ProjectListView | null;
};

/**
 * The view the list shows. A change made here wins, then what Convex has,
 * then the browser copy while Convex has not answered, then the default.
 */
export function currentProjectListView(sources: ProjectListViewSources): ProjectListView {
  if (sources.edit) return sources.edit;
  if (sources.saved !== undefined) return sources.saved ?? defaultProjectListView();
  return sources.local ?? defaultProjectListView();
}

export type ProjectListViewSave = 'wait' | 'skip' | 'save';

/**
 * Whether a change should be written. `wait` until Convex has said what is
 * saved, `skip` when the change already matches it, otherwise `save`. When
 * the read failed there is nothing to compare with, so the change is sent and
 * `saveMine` drops it if it matches.
 */
export function projectListViewSave(
  edit: ProjectListView | null,
  saved: ProjectListView | null | undefined,
  readFailed: boolean,
): ProjectListViewSave {
  if (!edit) return 'skip';
  if (saved === undefined) return readFailed ? 'save' : 'wait';
  return sameProjectListView(edit, saved ?? defaultProjectListView()) ? 'skip' : 'save';
}

/**
 * Which way the Projects sidebar and the quick filter chip settle. The sidebar
 * has no Internal entry, so an Internal chip leaves it alone.
 *
 * - `chip`: the sidebar moved since they last agreed, so the chip follows it.
 * - `sidebar`: the chip moved (a saved view loaded, or a pick), so the sidebar follows it.
 */
export function reconcileProjectSection(input: {
  section: string;
  /** The section the two last agreed on. */
  agreed: string;
  quick: ProjectListView['quick'];
}): { set: 'chip'; quick: 'all' | 'active' | 'shipped' } | { set: 'sidebar'; section: string } | null {
  const { section, agreed, quick } = input;
  if (section !== agreed) {
    if (section !== 'all' && section !== 'active' && section !== 'shipped') return null;
    return section === quick ? null : { set: 'chip', quick: section };
  }
  if (quick === 'internal' || quick === section) return null;
  return { set: 'sidebar', section: quick };
}
