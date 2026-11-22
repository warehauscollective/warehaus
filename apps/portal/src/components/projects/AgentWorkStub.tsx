'use client';

import { useState, type CSSProperties } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { buildTaskState } from '@convex/_lib/agentRun';
import type { MilestoneRoadmapView } from '@convex/_lib/milestones';
import { userFacingErrorMessage } from '@convex/_lib/userFacingError';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { Panel } from './milestoneChrome';

export const STUB_NOTE = 'This layout is waiting for the design frame.';

type Progress = {
  agentLabel: string;
  planningBlockedReason: string | null;
  tasks: { id: string; order: number; title: string; state: string; commit: string | null; blockedReason: string | null }[];
  events: { id: string; summary: string }[];
};

/**
 * Staff actions for a drafted plan, a blocked run, and Building progress.
 * The frames are not in yet, so this stays a plain list.
 */
export function AgentWorkStub({
  milestone,
  staff,
  fixtures,
  hostSlug,
}: {
  milestone: MilestoneRoadmapView;
  staff: boolean;
  fixtures: boolean;
  hostSlug?: string;
}) {
  const regenerate = useMutation(api.agent.regeneratePlan);
  const retry = useMutation(api.agent.retryBlocked);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const live = useSafeQuery<Progress | null>(
    api.agent.buildingProgress,
    staff && !fixtures && (milestone.status === 'Building' || milestone.planning === 'blocked')
      ? { milestoneId: milestone.id as Id<'milestones'>, hostSlug }
      : 'skip',
  );
  if (!staff) return null;
  const rows = milestone.rows.flatMap((row) => [row, ...row.children]);
  const blocked = rows.filter((row) => row.blockedReason || buildTaskState(row) === 'blocked');
  const planningBlocked = milestone.planning === 'blocked';
  const showPlan = milestone.status === 'Planning';
  const showBuild = milestone.status === 'Building';
  if (!showPlan && !showBuild && !planningBlocked && blocked.length === 0) return null;

  const run = (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    void work()
      .catch((caught: unknown) => setError(userFacingErrorMessage(caught, 'Couldn’t update the milestone.')))
      .finally(() => setBusy(false));
  };

  return (
    <Panel>
      <p className="ds-mono" style={{ margin: 0, fontSize: 11, lineHeight: '17px', color: 'var(--muted)' }}>
        {STUB_NOTE}
      </p>
      {showPlan ? (
        <button
          type="button"
          data-testid="milestone-regenerate"
          disabled={busy || fixtures}
          onClick={() =>
            run(() => regenerate({ hostSlug, milestoneId: milestone.id as Id<'milestones'> }))
          }
          style={buttonStyle}
        >
          Regenerate
        </button>
      ) : null}
      {planningBlocked ? (
        <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: '21px' }}>
          {milestone.planningBlockedReason || live.data?.planningBlockedReason || 'Planning is blocked.'}
          <button
            type="button"
            data-testid="milestone-retry-plan"
            disabled={busy || fixtures}
            onClick={() => run(() => retry({ hostSlug, milestoneId: milestone.id as Id<'milestones'> }))}
            style={{ ...buttonStyle, marginLeft: 8 }}
          >
            Retry
          </button>
        </p>
      ) : null}
      {blocked.map((row) => (
        <p key={row.id} style={{ margin: '8px 0 0', fontSize: 14, lineHeight: '21px' }}>
          {row.name}
          {row.blockedReason ? ` · ${row.blockedReason}` : ''}
          <button
            type="button"
            data-testid={`milestone-retry-${row.id}`}
            disabled={busy || fixtures}
            onClick={() =>
              run(() =>
                retry({
                  hostSlug,
                  milestoneId: milestone.id as Id<'milestones'>,
                  taskId: row.id as Id<'tasks'>,
                }),
              )
            }
            style={{ ...buttonStyle, marginLeft: 8 }}
          >
            Retry
          </button>
        </p>
      ))}
      {showBuild && live.data ? (
        <div style={{ marginTop: 12 }}>
          <p style={{ margin: 0, fontSize: 14, lineHeight: '21px' }}>{live.data.agentLabel}</p>
          <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none' }}>
            {live.data.tasks.map((task) => (
              <li key={task.id} style={{ fontSize: 14, lineHeight: '21px' }}>
                {String(task.order).padStart(2, '0')} {task.title} · {task.state}
                {task.commit ? ` · ${task.commit}` : ''}
                {task.blockedReason ? ` · ${task.blockedReason}` : ''}
              </li>
            ))}
          </ul>
          {live.data.events.slice(0, 5).map((event) => (
            <p key={event.id} style={{ margin: '4px 0 0', fontSize: 13, lineHeight: '20px', color: 'var(--muted)' }}>
              {event.summary}
            </p>
          ))}
        </div>
      ) : null}
      {error ? <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--danger)' }}>{error}</p> : null}
    </Panel>
  );
}

const buttonStyle: CSSProperties = {
  background: 'transparent',
  color: 'var(--fg)',
  border: '1px solid var(--border)',
  borderRadius: 9,
  fontSize: 14,
  padding: '6px 10px',
  cursor: 'pointer',
};
