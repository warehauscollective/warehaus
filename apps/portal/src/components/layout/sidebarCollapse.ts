export const SIDEBAR_COLLAPSE_MIN_PX = 1024;
export const SIDEBAR_EXPANDED_PX = 244;
/** The floating chip. Width stays 244 even though it reserves no column. */
export const SIDEBAR_CHIP_PX = 244;
export const SIDEBAR_CHIP_H_PX = 58;

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

/**
 * What to paint once auth settles.
 * While the session is pending, leave the boot paint alone so the same user does not flash.
 * A resolved id always wins, including a choice made before that id existed.
 * A different account replaces the boot user before paint and becomes the next boot user.
 * Signed out drops the previous account's rail without erasing their saved choice.
 */
export function settleSidebarUser(
  store: SidebarStore,
  userId: string | null,
  pending: boolean,
  held: SidebarMode | null,
): { mode: SidebarMode | null; persist: boolean; held: SidebarMode | null } {
  if (pending) return { mode: null, persist: false, held };
  if (!userId) return { mode: 'expanded', persist: false, held: null };
  if (held) return { mode: held, persist: true, held: null };
  const mode = readSidebarMode(store, userId);
  return { mode, persist: readBootUserId(store) !== userId, held: null };
}

export function sidebarCollapseApplies(viewportWidth: number): boolean {
  return viewportWidth >= SIDEBAR_COLLAPSE_MIN_PX;
}

/**
 * Layout reservation for --portal-rail-w.
 * Expanded desktop keeps 244. The collapsed chip floats, so the column is 0
 * and the page fills in. Below 1024 the sidebar is off and the dock is unchanged.
 */
export function sidebarRailWidth(mode: SidebarMode, viewportWidth: number): number {
  if (!sidebarCollapseApplies(viewportWidth)) return 0;
  return mode === 'collapsed' ? 0 : SIDEBAR_EXPANDED_PX;
}

export function applySidebarDataset(mode: SidebarMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (mode === 'collapsed') root.dataset.sidebar = 'collapsed';
  else delete root.dataset.sidebar;
  const wide =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(`(min-width: ${SIDEBAR_COLLAPSE_MIN_PX}px)`).matches;
  root.style.setProperty('--portal-rail-w', `${sidebarRailWidth(mode, wide ? SIDEBAR_COLLAPSE_MIN_PX : 0)}px`);
}

/** Runs in <head> before paint so a saved collapse does not flash the wide rail. */
export const sidebarBootScript = `(function(){try{var root=document.documentElement;var user=localStorage.getItem(${JSON.stringify(SIDEBAR_USER_KEY)});var collapsed=!!(user&&localStorage.getItem(${JSON.stringify(PREFIX)}+':'+user)==='collapsed');if(collapsed)root.dataset.sidebar='collapsed';var wide=window.matchMedia('(min-width: ${SIDEBAR_COLLAPSE_MIN_PX}px)').matches;root.style.setProperty('--portal-rail-w',(wide&&!collapsed)?'${SIDEBAR_EXPANDED_PX}px':'0px');}catch(e){}})();`;
