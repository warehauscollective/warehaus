'use client';

import { usePortalView } from '@/components/providers/PortalViewProvider';

/**
 * Sidebar section is a view mode in the portal workspace (not an intersection
 * observer over a long scrolling page). Kept as a thin alias for callers.
 */
export function useActiveSection(_defaultKey = 'overview') {
  return usePortalView().activeSection;
}
