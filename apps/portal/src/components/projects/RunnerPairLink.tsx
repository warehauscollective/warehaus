'use client';

import { useEffect, useState } from 'react';
import { useMutation } from 'convex/react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { RUNNER_PAIR_QUERY } from '@warehaus/runner-protocol';
import { api } from '@convex/_generated/api';
import { RUNNER_MODAL_TITLE } from '@convex/_lib/runnerHealth';
import { normalizePairingCode, formatPairingCode } from '@convex/_lib/runnerRegistry';
import { PortalModal } from '@/components/ui/PortalModal';
import { useFixturePreview } from '@/components/providers/FixturePreviewProvider';
import { usePortalData } from '@/hooks/usePortalData';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { getHostSlugFromLocation } from '@/lib/auth/host-slug';
import { isConvexConfigured } from '@/lib/convex/client';
import { useMaxWidth } from '@/lib/design/useMaxWidth';
import { RunnerConfirmBody, RunnerPairedBody, RunnerSetupBody } from './RunnerStatus';

type PairingFound = { code: string; proposedRunnerId: string; expiresAt: number; production: boolean };
type Outcome = { ok: true; runnerId?: string } | { ok: false; error: string };

/** The code from `?runnerPair=`, or null when the link has none or it is not a pairing code. */
export function runnerPairCode(value: string | null | undefined): string | null {
  const code = normalizePairingCode(value ?? '');
  return code ? formatPairingCode(code) : null;
}

/**
 * The runner app opens the Portal at `/?runnerPair=<code>` (see
 * `runnerPairUrl`). For signed-in staff this opens Confirm pairing with the
 * code filled in: one Confirm, no typing, no terminal. Anyone else sees
 * nothing, and the code alone pairs nothing. Closing drops the query.
 */
export function RunnerPairLink() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const narrow = useMaxWidth(767);
  const { data } = usePortalData();
  const fixtures = useFixturePreview();
  const staff = data.tenant.mode === 'team';
  const code = runnerPairCode(params.get(RUNNER_PAIR_QUERY));
  const enabled = isConvexConfigured() && staff && !fixtures && data.tenant.ok && code != null;
  const hostSlug = typeof window !== 'undefined' ? getHostSlugFromLocation() ?? undefined : undefined;
  const pairing = useSafeQuery<PairingFound | null>(api.runners.findPairing, enabled ? { code: code ?? '', hostSlug } : 'skip');
  const confirm = useMutation(api.runners.confirmPairing);
  const [runnerId, setRunnerId] = useState('');
  const [pairedId, setPairedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const found = pairing.data;
  useEffect(() => {
    if (found && !runnerId) setRunnerId(found.proposedRunnerId);
  }, [found, runnerId]);

  if (!enabled || !code || found === undefined) return null;
  const close = () => {
    const next = new URLSearchParams(params.toString());
    next.delete(RUNNER_PAIR_QUERY);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const id = runnerId.trim().toLowerCase();
      const result = (await confirm({ code, runnerId: id, hostSlug })) as Outcome;
      if (result.ok) setPairedId(result.runnerId ?? id);
      else setError(result.error);
    } catch (failed) {
      setError(failed instanceof Error ? failed.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  let body;
  if (pairedId) {
    body = <RunnerPairedBody runnerId={pairedId} lastSeen="Not seen yet" onDone={close} />;
  } else if (found === null) {
    // Expired or already used. Say so in the set-up body, without a download nag.
    body = (
      <RunnerSetupBody download={undefined} code={code} onCode={() => undefined} onPair={close} error="No open pairing has that code. Codes expire after 10 minutes. Pair again from the runner app." />
    );
  } else {
    body = (
      <RunnerConfirmBody
        code={found.code}
        production={found.production}
        runnerId={runnerId}
        onRunnerId={setRunnerId}
        onCancel={close}
        onConfirm={submit}
        busy={busy}
        error={error}
      />
    );
  }
  return (
    <PortalModal
      testId="runner-pair-link-dialog"
      scrimTestId="runner-pair-link-scrim"
      label={RUNNER_MODAL_TITLE}
      header="default"
      width={520}
      narrow={narrow}
      sheet={narrow ? 'bottom' : 'center'}
      onClose={close}
      panelStyle={{ padding: '8px 24px 24px' }}
    >
      {body}
    </PortalModal>
  );
}
