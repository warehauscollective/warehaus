import type { LinearOrgRead } from '@warehaus/portal-sync';
import { portalTaskFromLinear, type PortalSnapshot } from '@/lib/data/view-models';

const inflight = new Map<string, Promise<LinearOrgRead>>();
const resolved = new Map<string, { at: number; value: LinearOrgRead }>();
const TTL_MS = 15_000;

/** One Linear action per org while several portal surfaces mount together. */
export function loadSharedLinearRead(
  key: string,
  run: () => Promise<LinearOrgRead>,
): Promise<LinearOrgRead> {
  const hit = resolved.get(key);
  if (hit && hit.value.ok && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.value);
  const pending = inflight.get(key);
  if (pending) return pending;
  const next = run()
    .then((value) => {
      if (value.ok) resolved.set(key, { at: Date.now(), value });
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, next);
  return next;
}

export function applyLinearRead(snapshot: PortalSnapshot, result: LinearOrgRead | null): PortalSnapshot {
  if (!result || snapshot.taskPlatform?.platform !== 'linear') return snapshot;
  if (!result.ok) {
    const miss =
      result.reason === 'not-configured'
        ? ({
            ok: false as const,
            platform: 'linear' as const,
            reason: 'not-configured' as const,
            env: 'LINEAR_API_KEY' as const,
          })
        : ({ ok: false as const, platform: 'linear' as const, reason: 'unavailable' as const });
    return {
      ...snapshot,
      taskPlatform: {
        ...snapshot.taskPlatform,
        tasks: miss,
        milestones: miss,
      },
    };
  }
  if (result.platform !== 'linear') return snapshot;
  return {
    ...snapshot,
    tasks: result.tasks.map(portalTaskFromLinear),
    milestones: result.milestonesUnavailable ? undefined : result.milestones,
    taskPlatform: {
      ...snapshot.taskPlatform,
      tasks: { ok: true, platform: 'linear', count: result.tasks.length },
      milestones: result.milestonesUnavailable
        ? { ok: false, platform: 'linear', reason: 'unavailable' }
        : { ok: true, platform: 'linear', count: result.milestones.length },
    },
  };
}
