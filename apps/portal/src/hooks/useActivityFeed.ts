'use client';

import { api } from '@convex/_generated/api';
import { useFixturePreview } from '@/components/providers/FixturePreviewProvider';
import { usePortalData } from '@/hooks/usePortalData';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { getHostSlugFromLocation } from '@/lib/auth/host-slug';
import { isConvexConfigured } from '@/lib/convex/client';
import type { PortalActivity } from '@/lib/data/view-models';

/** Staff feed includes internal work. The client feed uses the same item gates as the board. */
export function useActivityFeed(): { items: PortalActivity[]; loading: boolean; error: string | null } {
  const { data, loading } = usePortalData();
  const fixtures = useFixturePreview();
  const configured = isConvexConfigured();
  const isTeam = data.tenant.mode === 'team';
  const hostSlug = typeof window !== 'undefined' ? getHostSlugFromLocation() ?? undefined : undefined;
  const live = configured && data.tenant.ok && !fixtures;
  const staff = useSafeQuery<PortalActivity[]>(
    api.portalData.listActivityForStaff,
    live && isTeam ? { hostSlug } : 'skip',
  );
  const client = useSafeQuery<PortalActivity[]>(
    api.portalData.listActivityForClient,
    live && !isTeam ? { hostSlug } : 'skip',
  );
  const query = isTeam ? staff : client;
  return {
    items: query.data ?? data.activity,
    loading: loading || (live && query.loading && query.data == null),
    error: live ? query.error : null,
  };
}
