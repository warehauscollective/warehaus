'use client';

import { useEffect } from 'react';
import { TASK_STAGE_HINT } from '@/lib/data/taskStatus';
import { StatusBadge } from '@/components/ui/primitives';
import {
  MilestoneReviewSurface,
  ReviewDialogActions,
  ReviewDialogBody,
  ReviewScrim,
  type ReviewSurfaceModel,
  type ReviewVisual,
} from './MilestoneReview';
import { MilestoneDialog } from './milestoneChrome';

const STAMP = Date.UTC(2026, 10, 17, 17, 4);

const tasks = [
  { id: 'task-order', name: 'Order-ahead landing page' },
  { id: 'task-wire', name: 'Wireframe pickup flow' },
];

const ready: ReviewSurfaceModel = {
  milestoneId: 'milestone-preview',
  iteration: 2,
  workStatus: 'ready',
  approval: 'unreviewed',
  previewUrl: 'localhost:3100/p/warehaus-portal/t/order-ahead',
  prNumber: 108,
  prTitle: 'Order-ahead landing page',
  branch: 'feat/order-ahead',
  commit: 'a1b2c3d',
  builtAt: STAMP,
  designCheck: 'pass',
  designCheckNote: null,
  history: [{
    iteration: 1,
    decision: 'request_changes',
    notes: 'Tighten the pay button focus ring.',
    decidedByName: 'Peter',
    decidedAt: STAMP,
    source: 'portal',
    taskCount: 1,
  }],
  tasks,
};

const waiting: ReviewSurfaceModel = { ...ready, previewUrl: null, designCheck: 'pending', prNumber: null, prTitle: null, branch: null, commit: null, builtAt: null };
const fixes: ReviewSurfaceModel = {
  ...ready,
  designCheck: 'fixes',
  designCheckNote: '2 design fixes are open (focus ring, mobile sheet radius). You can still approve; they become tasks in the next iteration.',
};
const approved: ReviewSurfaceModel = {
  ...ready,
  approval: 'approved',
  history: [
    { iteration: 2, decision: 'approve', notes: '', decidedByName: 'Peter', decidedAt: STAMP, source: 'portal', taskCount: 0 },
    { iteration: 1, decision: 'request_changes', notes: 'Tighten the pay button focus ring.', decidedByName: 'Peter', decidedAt: STAMP, source: 'portal', taskCount: 1 },
  ],
};
const changes: ReviewSurfaceModel = {
  ...ready,
  iteration: 3,
  workStatus: 'active',
  approval: 'changes_requested',
  previewUrl: null,
  designCheck: 'pending',
  resultTasks: [
    { name: 'Focus ring on the pay button' },
    { name: 'Mobile sheet radius' },
  ],
  history: [{
    iteration: 2,
    decision: 'request_changes',
    notes: 'Tighten the pay button focus ring and the mobile sheet radius.',
    decidedByName: 'Peter',
    decidedAt: STAMP,
    source: 'chat',
    taskCount: 2,
  }],
};

const frames: Array<{ id: string; title: string; visual?: ReviewVisual; model: ReviewSurfaceModel; width: number }> = [
  { id: 'ready', title: 'Ready', model: ready, width: 1108 },
  { id: 'waiting', title: 'No preview yet', model: waiting, width: 1108 },
  { id: 'fixes', title: 'Design fixes needed', model: fixes, width: 1108 },
  { id: 'saving', title: 'Saving', visual: 'saving', model: ready, width: 1108 },
  { id: 'error', title: 'Error', visual: 'error', model: ready, width: 1108 },
  { id: 'approved', title: 'Approved', model: approved, width: 1108 },
  { id: 'changes', title: 'Changes requested', model: changes, width: 1108 },
];

function StageHint({ current }: { current: string }) {
  const stages = ['Idea', 'Planning', 'Awaiting Go', 'Building', 'Ready to Ship', 'Shipped', 'Parked'];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h3 className="ds-mono" style={{ fontSize: 12, letterSpacing: '2.64px', margin: 0 }}>STAGE</h3>
        <span className="ds-mono" style={{ fontSize: 12, color: 'var(--muted)' }}>visible to client</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {stages.map((stage) => {
          const selected = stage === current;
          const locked = stage !== 'Idea' && stage !== 'Planning' && !selected;
          return (
            <span
              key={stage}
              className="ds-mono"
              style={{
                border: selected ? '1px solid var(--fg)' : '1px solid var(--border)',
                borderRadius: 999,
                padding: '8px 12px',
                background: selected ? 'var(--fg)' : 'transparent',
                color: selected ? 'var(--bg)' : locked ? 'var(--muted)' : 'var(--fg)',
                fontSize: 13,
              }}
            >
              {stage}
            </span>
          );
        })}
      </div>
      <p data-testid="task-stage-hint" style={{ fontSize: 12, lineHeight: '17px', color: 'var(--muted)', margin: 0 }}>{TASK_STAGE_HINT}</p>
    </div>
  );
}

function TaskFrame({ phone }: { phone: boolean }) {
  return (
    <section
      data-capture={phone ? 'task-phone' : 'task-desktop'}
      data-width={phone ? '390' : '1440'}
      className="ds-scope flex flex-col gap-4"
      style={{ width: phone ? 390 : 840, background: 'var(--surface)', color: 'var(--fg)', borderRadius: 16, padding: phone ? 16 : 24, border: '1px solid var(--border)' }}
    >
      <p className="ds-mono" style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Warehaus Portal / Task</p>
      <p style={{ margin: 0, background: 'var(--surface-2)', borderRadius: 18, padding: '8px 12px', fontSize: 14, fontWeight: 500 }}>Staff only · hidden from clients</p>
      <h2 className="type-heading" style={{ fontSize: phone ? 20 : 28, lineHeight: phone ? '30px' : '36px', margin: 0 }}>Order-ahead landing page</h2>
      <MilestoneReviewSurface model={ready} layout="row" phone={phone} />
      <div className="flex items-center gap-3">
        <span className="ds-mono" style={{ width: 104, fontSize: 12, color: 'var(--muted)' }}>Status</span>
        <StatusBadge>In review</StatusBadge>
      </div>
      <StageHint current="Ready to Ship" />
    </section>
  );
}

function DialogFrame({
  kind,
  phone = false,
  busy = false,
  fieldError = null,
  capture,
}: {
  kind: 'approve' | 'changes';
  phone?: boolean;
  busy?: boolean;
  fieldError?: string | null;
  capture: string;
}) {
  return (
    <section data-capture={capture} data-width={phone ? '390' : '1440'} style={{ width: phone ? 390 : 680 }}>
      <ReviewScrim
        phone={phone}
        contained
        label={kind === 'approve' ? 'Approve milestone' : 'Request changes'}
        hint={kind === 'changes' ? '⌘↵ to submit · Esc to close' : '↵ to confirm · Esc to close'}
        onClose={() => undefined}
        onConfirm={() => undefined}
        footer={
          <ReviewDialogActions
            approve={kind === 'approve'}
            iteration={ready.iteration}
            busy={busy}
            onCancel={() => undefined}
            onSubmit={() => undefined}
          />
        }
      >
        <ReviewDialogBody
          kind={kind}
          tasks={tasks}
          notes={kind === 'changes' ? 'Tighten the pay button focus ring.' : ''}
          onNotes={() => undefined}
          selected={[]}
          onToggle={() => undefined}
          fieldError={fieldError}
        />
      </ReviewScrim>
    </section>
  );
}

export function ApprovalsPreview({ theme }: { theme: 'dark' | 'light' }) {
  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    return () => document.documentElement.classList.remove('light');
  }, [theme]);
  return (
    <main className="ds-scope" style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', padding: 32 }}>
      <p className="ds-mono" style={{ letterSpacing: '2.64px', fontSize: 12, color: 'var(--muted)' }}>
        {`APPROVALS PREVIEW · ${theme.toUpperCase()}`}
      </p>
      <div className="mt-8 flex flex-col gap-10">
        {frames.map((frame) => (
          <section key={frame.id} data-capture={frame.id} data-width="1440" style={{ width: frame.width }}>
            <h2 className="type-heading" style={{ fontSize: 20, margin: '0 0 12px' }}>{frame.title}</h2>
            <MilestoneReviewSurface model={frame.model} layout="card" phone={false} forced={frame.visual ?? null} />
          </section>
        ))}
        {frames.map((frame) => (
          <section key={`${frame.id}-phone`} data-capture={`${frame.id}-phone`} data-width="390" style={{ width: 390 }}>
            <h2 className="type-heading" style={{ fontSize: 20, margin: '0 0 12px' }}>{`${frame.title} · phone`}</h2>
            <MilestoneReviewSurface model={frame.model} layout="card" phone forced={frame.visual ?? null} />
          </section>
        ))}
        <TaskFrame phone={false} />
        <TaskFrame phone />
        <DialogFrame kind="approve" capture="dialog-approve" />
        <DialogFrame kind="changes" capture="dialog-changes" />
        <DialogFrame kind="changes" capture="r3" />
        <DialogFrame kind="approve" phone capture="m2" />
        <DialogFrame kind="changes" phone capture="m4" />
        <DialogFrame kind="approve" busy capture="dialog-saving" />
        <DialogFrame kind="changes" fieldError="Add a note so the team knows what to change." capture="dialog-error" />
        <section data-capture="r5" data-width="1440" style={{ width: 1108 }}>
          <MilestoneReviewSurface model={approved} layout="card" />
        </section>
        <section data-capture="iterations" data-width="1440" style={{ width: 1108 }}>
          <MilestoneReviewSurface model={ready} layout="card" />
        </section>
        <section data-capture="client" data-width="1440" className="flex flex-col gap-3" style={{ width: 1108 }}>
          <p className="ds-mono" style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>CLIENT · NO REVIEW</p>
          <h2 className="type-heading" style={{ fontSize: 28, lineHeight: '36px', margin: 0 }}>Order-ahead landing page</h2>
          <p style={{ margin: 0, fontSize: 15 }}>Let people order before they arrive.</p>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)' }}>Stage · Ready to Ship</p>
        </section>
        <section data-capture="stage-confirm" data-width="390" className="flex flex-col gap-4" style={{ width: 390 }}>
          <StageHint current="Ready to Ship" />
          <MilestoneDialog
            title="Confirm stage"
            phone
            contained
            trapFocus={false}
            hint="↵ to confirm · Esc to close"
            onClose={() => undefined}
            onConfirm={() => undefined}
            footer={<button type="button" style={{ background: 'var(--accent)', color: 'var(--accent-fg)', border: 0, borderRadius: 9, padding: '10px 16px', fontWeight: 600 }}>Confirm</button>}
          >
            <p style={{ margin: 0, fontSize: 14, lineHeight: '21px' }}>Move this task to Ready to Ship. Peter reviews it from the milestone card.</p>
          </MilestoneDialog>
        </section>
        <section data-capture="task-phone-card" data-width="390" style={{ width: 390 }}>
          <MilestoneReviewSurface model={ready} layout="card" phone />
        </section>
      </div>
    </main>
  );
}
