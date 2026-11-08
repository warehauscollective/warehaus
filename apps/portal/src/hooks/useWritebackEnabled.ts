'use client';

import { api } from '@convex/_generated/api';
import { useFixturePreview } from '@/components/providers/FixturePreviewProvider';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { getHostSlugFromLocation } from '@/lib/auth/host-slug';
import { isConvexConfigured } from '@/lib/convex/client';

type SyncHealthFlag = {
  writebackEnabled?: boolean;
};

/**
 * The Convex deployment flag `getSyncHealth` already reads.
 * Unset, loading, fixtures, and any value other than true stay off.
 */
export function useWritebackEnabled(): boolean {
  const fixtures = useFixturePreview();
  const configured = isConvexConfigured();
  const { portalSession } = usePortalAuth();
  const isStaff = Boolean(portalSession?.isStaff);
  const hostSlug = typeof window !== 'undefined' ? getHostSlugFromLocation() ?? undefined : undefined;
  const health = useSafeQuery<SyncHealthFlag>(
    api.portalData.getSyncHealth,
    configured && isStaff && !fixtures ? { hostSlug } : 'skip',
  );
  return health.data?.writebackEnabled === true;
}
