'use client';

import { useEffect, useMemo, useRef } from 'react';
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
import { usePortalSnapshotCache } from '@/components/providers/PortalDataRetry';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { portalFailure } from '@/lib/data/projectList';
import {
  heldSnapshotFor,
  portalSnapshotKey,
  samePortalSnapshotKey,
} from '@/lib/data/portalSnapshotCache';

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
  const { held, sealed, remember, clear, unseal } = usePortalSnapshotCache();
  const ready = Boolean(portalSession) && linkStatus === 'linked';
  const hostSlug =
    typeof window !== 'undefined' ? getHostSlugFromLocation() : null;
  const key = portalSnapshotKey(portalSession, hostSlug);
  const settling = sessionPending || joining || linkStatus === 'loading';
  const seenIdentity = useRef<string | null>(null);
  const seenSnapshot = useRef<PortalSnapshot | undefined>(undefined);

  const snapshotState = useSafeQuery<PortalSnapshot>(
    api.portalData.getSnapshot,
    configured && ready ? { hostSlug: hostSlug ?? undefined } : 'skip',
  );
  const convexSnapshot = snapshotState.data;

  useEffect(() => {
    if (fixtures || settling || portalSession) return;
    clear();
    unseal();
  }, [fixtures, settling, portalSession, clear, unseal]);

  useEffect(() => {
    if (!key || !held) return;
    if (!samePortalSnapshotKey(held.key, key)) clear();
  }, [key, held, clear]);

  useEffect(() => {
    if (fixtures || sealed || !key || !convexSnapshot) {
      if (!key) seenIdentity.current = null;
      return;
    }
    const id = `${key.userId}\0${key.orgId}\0${key.hostSlug}`;
    // A snapshot object already shown for another identity must not be stored
    // under the new one. Wait until the query returns a new result.
    if (seenSnapshot.current === convexSnapshot && seenIdentity.current !== id) {
      seenIdentity.current = id;
      return;
    }
    seenIdentity.current = id;
    seenSnapshot.current = convexSnapshot;
    remember(key, convexSnapshot);
  }, [fixtures, sealed, key, convexSnapshot, remember]);

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
      return {
        data: EMPTY,
        loading: settling,
        error: null,
      };
    }

    const cached = heldSnapshotFor(held, key, settling);
    if (snapshotState.error) {
      const failure = portalFailure({ snapshotError: snapshotState.error, syncError: null });
      return {
        data: cached ?? EMPTY,
        loading: false,
        error: failure.snapshotError,
      };
    }

    if (convexSnapshot === undefined) {
      return { data: cached ?? EMPTY, loading: cached == null, error: null };
    }

    const loaded = convexSnapshot as PortalSnapshot;
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
    settling,
    held,
    key,
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
