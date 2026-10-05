'use client';

import { useMemo } from 'react';
import { api } from '@convex/_generated/api';
import {
  type PortalSnapshot,
  type PortalTenantMeta,
} from '@/lib/data/view-models';
import { getHostSlugFromLocation } from '@/lib/auth/host-slug';
import { isConvexConfigured } from '@/lib/convex/client';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { FIXTURE_SNAPSHOT } from '@/lib/data/fixtures';
import { useFixturePreview } from '@/components/providers/FixturePreviewProvider';
import { useSafeQuery } from '@/hooks/useSafeQuery';

const EMPTY_TENANT: PortalTenantMeta = {
  mode: 'team',
  slug: null,
  clientExternalId: null,
  clientName: null,
  ok: true,
};

const EMPTY: PortalSnapshot = {
  clients: [],
  projects: [],
  tasks: [],
  activity: [],
  syncMeta: { lastSyncedAt: null, lastError: null, mode: 'convex' },
  tenant: EMPTY_TENANT,
};

export function tenantEyebrow(tenant: PortalTenantMeta, section: string): string {
  if (tenant.mode === 'client' && tenant.clientName) {
    return `${tenant.clientName} · ${section}`;
  }
  return `Team · ${section}`;
}

export { type PortalSnapshot, type PortalTenantMeta } from '@/lib/data/view-models';

/**
 * Portal data — Convex reactive snapshot only (Phase 3 cutover).
 * Requires `NEXT_PUBLIC_CONVEX_URL` + signed-in linked Contact.
 */
export function usePortalData() {
  const fixtures = useFixturePreview();
  const configured = isConvexConfigured() && !fixtures;
  const { portalSession, linkStatus, sessionPending, joining } = usePortalAuth();
  const ready = Boolean(portalSession) && linkStatus === 'linked';
  const hostSlug =
    typeof window !== 'undefined' ? getHostSlugFromLocation() : null;

  const snapshotState = useSafeQuery<PortalSnapshot>(
    api.portalData.getSnapshot,
    configured && ready ? { hostSlug: hostSlug ?? undefined } : 'skip',
  );
  const convexSnapshot = snapshotState.data;

  return useMemo(() => {
    if (fixtures) {
      return { data: FIXTURE_SNAPSHOT, loading: false, error: null };
    }
    if (!configured) {
      return {
        data: EMPTY,
        loading: false,
        error: 'Convex is not configured (NEXT_PUBLIC_CONVEX_URL).',
      };
    }

    if (!ready) {
      return {
        data: EMPTY,
        loading: sessionPending || joining || linkStatus === 'loading',
        error: null,
      };
    }

    if (snapshotState.error) {
      return { data: EMPTY, loading: false, error: snapshotState.error };
    }

    if (convexSnapshot === undefined) {
      return { data: EMPTY, loading: true, error: null };
    }

    return {
      data: convexSnapshot as PortalSnapshot,
      loading: false,
      error: convexSnapshot.syncMeta.lastError,
    };
  }, [
    fixtures,
    configured,
    ready,
    sessionPending,
    joining,
    linkStatus,
    convexSnapshot,
    snapshotState.error,
  ]);
}

export function activityToneVar(tone: string): string {
  switch (tone) {
    case 'success':
      return 'var(--success)';
    case 'warn':
      return 'var(--warn)';
    case 'danger':
      return 'var(--danger)';
    case 'accent':
      return 'var(--accent)';
    default:
      return 'var(--muted)';
  }
}
