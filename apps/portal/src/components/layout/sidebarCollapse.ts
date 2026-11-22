export const SIDEBAR_COLLAPSE_MIN_PX = 1024;
export const SIDEBAR_EXPANDED_PX = 244;
export const SIDEBAR_COLLAPSED_PX = 72;

const PREFIX = 'wh-portal-sidebar';
export const SIDEBAR_USER_KEY = 'wh-portal-sidebar-user';

export type SidebarMode = 'expanded' | 'collapsed';

export type SidebarStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export function sidebarCollapseKey(userId: string): string {
  return `${PREFIX}:${userId}`;
}

function readItem(store: SidebarStore, key: string): string | null {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

/** Missing, blank, or unknown values stay expanded. Another user's key is ignored. */
export function readSidebarMode(store: SidebarStore, userId: string | null | undefined): SidebarMode {
  if (!userId) return 'expanded';
  return readItem(store, sidebarCollapseKey(userId)) === 'collapsed' ? 'collapsed' : 'expanded';
}

export function writeSidebarMode(store: SidebarStore, userId: string, mode: SidebarMode): void {
  try {
    store.setItem(sidebarCollapseKey(userId), mode);
    store.setItem(SIDEBAR_USER_KEY, userId);
  } catch {
    // The rail still toggles for this view when storage is blocked.
  }
}

/** Last signed-in user. The boot script reads this before auth hydrates. */
export function readBootUserId(store: SidebarStore): string | null {
  const userId = readItem(store, SIDEBAR_USER_KEY);
  return userId && userId.trim() ? userId : null;
}

export function readBootSidebarMode(store: SidebarStore): SidebarMode {
  return readSidebarMode(store, readBootUserId(store));
}

export function sidebarCollapseApplies(viewportWidth: number): boolean {
  return viewportWidth >= SIDEBAR_COLLAPSE_MIN_PX;
}

/** Below 1024 the rail is not on screen, so the stored mode does not change its width. */
export function sidebarRailWidth(mode: SidebarMode, viewportWidth: number): number {
  if (!sidebarCollapseApplies(viewportWidth)) return SIDEBAR_EXPANDED_PX;
  return mode === 'collapsed' ? SIDEBAR_COLLAPSED_PX : SIDEBAR_EXPANDED_PX;
}

export function applySidebarDataset(mode: SidebarMode): void {
  if (typeof document === 'undefined') return;
  if (mode === 'collapsed') document.documentElement.dataset.sidebar = 'collapsed';
  else delete document.documentElement.dataset.sidebar;
}

/** Runs in <head> before paint so a saved collapse does not flash the wide rail. */
export const sidebarBootScript = `(function(){try{var user=localStorage.getItem(${JSON.stringify(SIDEBAR_USER_KEY)});if(!user)return;if(localStorage.getItem(${JSON.stringify(PREFIX)}+':'+user)==='collapsed')document.documentElement.dataset.sidebar='collapsed';}catch(e){}})();`;
