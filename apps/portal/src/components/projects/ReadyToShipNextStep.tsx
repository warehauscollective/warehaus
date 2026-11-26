'use client';

import { useState } from 'react';
import type { MilestoneRoadmapView } from '@convex/_lib/milestones';
import { userFacingErrorMessage } from '@convex/_lib/userFacingError';
import { OutlineButton, PrimaryButton } from '@/components/ui/primitives';
import { GhostButton } from './milestoneChrome';
import { approvedByLine, nextStepCopy, readyToShipNextStep, type BlockingTask } from './readyToShip';
import { taskTotal } from './milestoneTile';

export type NextStepActions = {
  openTask: (taskId: string) => void;
  parkTask: (taskId: string) => Promise<unknown>;
  moveTask: (taskId: string, toMilestoneId: string) => Promise<unknown>;
  markShipped: () => Promise<unknown>;
};

export const NEXT_STEP_SAVE_ERROR = 'Couldn’t save that. Nothing changed.';

const eyebrow = {
  margin: 0,
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  lineHeight: '18px',
  letterSpacing: '2.64px',
  fontWeight: 500,
  color: 'var(--muted)',
} as const;
const caption = { margin: 0, fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: '18px', color: 'var(--muted)' } as const;

function Dot() {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true" style={{ flex: '0 0 auto', color: 'var(--fg)' }}>
      <circle cx="4" cy="4" r="4" fill="currentColor" />
    </svg>
  );
}

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: '0 0 auto', marginTop: 2 }}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function taskMeta(task: BlockingTask): string {
  return [task.status || 'To Do', task.nested ? 'subtask' : null].filter(Boolean).join(' · ');
}

/**
 * The Ready to Ship next step under the approved review card. Figma
 * NextStepCard 1141:42728. Staff only. One action at a time: the tasks that
 * block Shipped, or Mark shipped, or the shipped record.
 */
export function ReadyToShipNextStep({
  milestone,
  staff,
  phone,
  actions,
  moveTargets = [],
}: {
  milestone: MilestoneRoadmapView;
  staff: boolean;
  phone: boolean;
  /** Absent in fixture previews. The buttons then show but do nothing. */
  actions?: NextStepActions;
  moveTargets?: readonly { id: string; name: string }[];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [target, setTarget] = useState('');
  const step = readyToShipNextStep(milestone, staff);
  const copy = nextStepCopy(step, { doneCount: milestone.doneCount, total: taskTotal(milestone), shippedAt: milestone.shippedAt ?? null });
  if (!copy) return null;

  const run = (key: string, work: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    void work()
      .then(() => {
        setMoving(null);
        setTarget('');
      })
      .catch((caught: unknown) => setError(userFacingErrorMessage(caught, NEXT_STEP_SAVE_ERROR)))
      .finally(() => setBusy(null));
  };

  return (
    <section
      data-testid="ready-to-ship-next-step"
      data-kind={step.kind}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: phone ? 16 : 20,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: phone ? 20 : '28px 32px',
      }}
    >
      <div className="flex items-center gap-[10px]">
        <Dot />
        <p data-testid="next-step-eyebrow" style={eyebrow}>{copy.eyebrow}</p>
      </div>
      <div className="flex flex-col gap-1">
        <h2 data-testid="next-step-title" style={{ margin: 0, fontSize: 20, lineHeight: '30px', fontWeight: 600 }}>{copy.title}</h2>
        <p style={step.kind === 'blocked' ? { margin: 0, fontSize: 14, lineHeight: '21px', color: 'var(--muted)' } : caption}>{copy.body}</p>
      </div>

      {step.kind === 'blocked' ? (
        <ul
          data-testid="next-step-blocking"
          className="m-0 flex list-none flex-col p-0"
          style={{ border: '1px solid var(--border-2, var(--border))', borderRadius: 10, overflow: 'hidden' }}
        >
          {step.blocking.map((task, index) => (
            <li
              key={task.id}
              data-testid="next-step-task"
              style={{
                background: 'var(--surface-2)',
                borderTop: index > 0 ? '1px solid var(--border-2, var(--border))' : undefined,
                padding: phone ? '12px 14px' : '14px 16px',
              }}
            >
              <div className={phone ? 'flex flex-col gap-[10px]' : 'flex items-center gap-4'}>
                <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
                  <button
                    type="button"
                    data-testid="next-step-task-name"
                    onClick={() => actions?.openTask(task.id)}
                    style={{ all: 'unset', cursor: 'pointer', fontSize: 14, lineHeight: '21px', textDecoration: 'underline', textUnderlineOffset: 3, overflowWrap: 'anywhere' }}
                  >
                    {task.name}
                  </button>
                  <p style={caption}>{taskMeta(task)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <GhostButton testId="next-step-open" onClick={() => actions?.openTask(task.id)}>Open</GhostButton>
                  <GhostButton
                    testId="next-step-park"
                    disabled={busy != null || !actions}
                    onClick={() => actions && run(`park:${task.id}`, () => actions.parkTask(task.id))}
                  >
                    {busy === `park:${task.id}` ? 'Parking…' : 'Park'}
                  </GhostButton>
                  {task.nested ? null : (
                    <GhostButton
                      testId="next-step-move"
                      disabled={busy != null || !actions || moveTargets.length === 0}
                      onClick={() => {
                        setError(null);
                        setTarget('');
                        setMoving((current) => (current === task.id ? null : task.id));
                      }}
                    >
                      Move to…
                    </GhostButton>
                  )}
                </div>
              </div>
              {moving === task.id ? (
                <div data-testid="next-step-move-picker" className={phone ? 'mt-3 flex flex-col gap-2' : 'mt-3 flex items-center gap-2'}>
                  <label className="sr-only" htmlFor={`move-${task.id}`}>Move {task.name} to</label>
                  <select
                    id={`move-${task.id}`}
                    data-testid="next-step-move-target"
                    value={target}
                    onChange={(event) => setTarget(event.target.value)}
                    style={{
                      flex: 1,
                      minHeight: 42,
                      background: 'var(--surface)',
                      color: 'var(--fg)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: '0 10px',
                      fontSize: 14,
                    }}
                  >
                    <option value="">Pick a milestone</option>
                    {moveTargets.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                  <OutlineButton
                    testId="next-step-move-confirm"
                    disabled={!target || busy != null}
                    onClick={() => actions && target && run(`move:${task.id}`, () => actions.moveTask(task.id, target))}
                  >
                    {busy === `move:${task.id}` ? 'Moving…' : 'Move'}
                  </OutlineButton>
                  <GhostButton onClick={() => setMoving(null)}>Cancel</GhostButton>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {step.kind === 'shipped' ? (
        <ul data-testid="next-step-record" className="m-0 flex list-none flex-col gap-[6px] p-0">
          <li className="flex items-start gap-2" style={{ fontSize: 14, lineHeight: '21px' }}>
            <Check />
            <span>{approvedByLine({ approverName: milestone.approverName, decidedAt: milestone.decidedAt })}</span>
          </li>
          <li className="flex items-start gap-2" style={{ fontSize: 14, lineHeight: '21px' }}>
            <Check />
            <span>{copy.footer}</span>
          </li>
        </ul>
      ) : (
        <div className={phone ? 'flex flex-col gap-3' : 'flex items-center gap-4'}>
          <p style={{ ...caption, flex: 1 }}>{copy.footer}</p>
          {step.kind === 'clear' ? (
            <PrimaryButton
              testId="next-step-mark-shipped"
              className={phone ? 'w-full' : undefined}
              disabled={busy != null || !actions}
              onClick={() => actions && run('ship', actions.markShipped)}
            >
              {busy === 'ship' ? 'Marking shipped…' : 'Mark shipped'}
            </PrimaryButton>
          ) : (
            <OutlineButton
              testId="next-step-mark-shipped"
              className={phone ? 'w-full' : undefined}
              disabled
              disabledOpacity={0.4}
            >
              Mark shipped
            </OutlineButton>
          )}
        </div>
      )}

      {error ? (
        <p role="alert" data-testid="next-step-error" style={{ margin: 0, fontSize: 13, lineHeight: '18px', color: 'var(--danger-text)' }}>
          {error}
        </p>
      ) : null}
    </section>
  );
}
