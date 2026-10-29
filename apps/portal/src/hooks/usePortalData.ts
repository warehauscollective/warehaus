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
import { FIXTURE_CLIENT_SNAPSHOT, FIXTURE_SNAPSHOT } from '@/lib/data/fixtures';
import { useFixtureAudience, useFixturePreview } from '@/components/providers/FixturePreviewProvider';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { portalFailure } from '@/lib/data/projectList';

/** Survives a Try again remount so a failed refetch can keep the last rows. */
let cachedSnapshot: PortalSnapshot | null = null;

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

/** Tab-root eyebrow. Staff reads `● PORTAL · {section} · ADMIN`. */
export function tenantEyebrow(tenant: PortalTenantMeta, section: string): string {
  if (tenant.mode === 'client' && tenant.clientName) {
    return `● PORTAL · ${section} · ${tenant.clientName}`;
  }
  return `● PORTAL · ${section} · ADMIN`;
}

export { type PortalSnapshot, type PortalTenantMeta } from '@/lib/data/view-models';

/**
 * Portal data — Convex reactive snapshot only (Phase 3 cutover).
 * Requires `NEXT_PUBLIC_CONVEX_URL` + signed-in linked Contact.
 */
export function usePortalData() {
  const fixtures = useFixturePreview();
  const audience = useFixtureAudience();
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
      return {
        data: audience === 'client' ? FIXTURE_CLIENT_SNAPSHOT : FIXTURE_SNAPSHOT,
        loading: false,
        error: null,
      };
    }
    if (!configured) {
      return {
        data: EMPTY,
        loading: false,
        error: 'Convex is not configured (NEXT_PUBLIC_CONVEX_URL).',
      };
    }

    if (!ready) {
      // A Try again remount settles auth before the snapshot resubscribes.
      // Dropping the cache on that tick would wipe the rows a refresh error needs.
      const settling = sessionPending || joining || linkStatus === 'loading';
      if (!settling) cachedSnapshot = null;
      return {
        data: cachedSnapshot ?? EMPTY,
        loading: settling && cachedSnapshot == null,
        error: null,
      };
    }

    if (snapshotState.error) {
      const failure = portalFailure({ snapshotError: snapshotState.error, syncError: null });
      return {
        data: cachedSnapshot ?? EMPTY,
        loading: false,
        error: failure.snapshotError,
      };
    }

    if (convexSnapshot === undefined) {
      return { data: cachedSnapshot ?? EMPTY, loading: cachedSnapshot == null, error: null };
    }

    const loaded = convexSnapshot as PortalSnapshot;
    cachedSnapshot = loaded;
    const failure = portalFailure({
      snapshotError: null,
      syncError: loaded.syncMeta.lastError,
    });
    return {
      data: loaded,
      loading: false,
      error: failure.snapshotError,
    };
  }, [
    fixtures,
    audience,
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
