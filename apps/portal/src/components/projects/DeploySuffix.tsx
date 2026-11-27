import type { DeployMark } from '@convex/_lib/deploy';

const DEPLOY_SUFFIX: Record<Exclude<DeployMark, 'none'>, string> = {
  'not-deployed': 'Not deployed',
  deployed: 'Deployed',
};

/** " · Not deployed" or " · Deployed" after Shipped. Staff only: clients get no mark. */
export function DeploySuffix({ status, mark }: { status: string; mark?: DeployMark | null }) {
  if (status !== 'Shipped' || !mark || mark === 'none') return null;
  return (
    <span data-testid="deploy-mark" data-deploy={mark} style={{ color: 'var(--muted)' }}>
      {` · ${DEPLOY_SUFFIX[mark]}`}
    </span>
  );
}
