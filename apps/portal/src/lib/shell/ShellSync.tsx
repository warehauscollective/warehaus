'use client';

import { api } from '@convex/_generated/api';
import { useEffect } from 'react';
import { useFixturePreview } from '@/components/providers/FixturePreviewProvider';
import { usePortalData } from '@/hooks/usePortalData';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { isConvexConfigured } from '@/lib/convex/client';
import { useShell } from './ShellProvider';
import { attentionAdapterFor, postToShell, type AttentionFeedView } from './attentionSync';

/**
 * The shell sync module (ADR-0006, decision 6). Mounted once in PortalShell.
 * One subscription to the Convex attention feed, shown through the adapter for
 * this shell: the Mac app gets an `attention` message, a browser gets the
 * count in the tab title. Renders nothing.
 *
 * Staff only, like the feed. The hello is sent again when notification
 * permission changes, so the feed is sent again too; the app does not notify
 * twice for an alert it has seen.
 */
export function ShellSync() {
  const shell = useShell();
  const { data } = usePortalData();
  const fixtures = useFixturePreview();
  const staff = data.tenant.mode === 'team';
  const enabled = isConvexConfigured() && staff && !fixtures && data.tenant.ok;
  const feed = useSafeQuery<AttentionFeedView>(api.attention.feed, enabled ? {} : 'skip').data;

  useEffect(() => {
    if (!feed) return;
    const adapter = attentionAdapterFor(shell, {
      doc: document,
      post: (message) => postToShell(window, message),
    });
    if (!adapter) return;
    adapter.show(feed);
    return adapter.clear;
  }, [feed, shell]);

  return null;
}
