import { isPortalTab, type PortalTab } from '@warehaus/logic/portal';

/** `?tab=` and `?section=` together open that sidebar section. Either alone is ignored. */
export function readPortalDeepLink(search: string): { tab: PortalTab; section: string } | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const tab = params.get('tab');
  const section = params.get('section');
  if (!tab || !section || !isPortalTab(tab)) return null;
  return { tab, section };
}
