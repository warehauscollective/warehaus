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
import { MilestoneDetailView } from './ProjectRoadmap';
import type { MilestoneRoadmapView } from '@convex/_lib/milestones';

const STAMP = Date.UTC(2026, 10, 17, 17, 4);

const tasks = [
  { id: 'task-order', name: 'Order-ahead landing page' },
  { id: 'task-wire', name: 'Wireframe pickup flow' },
];

const ready: ReviewSurfaceModel = {
  milestoneId: 'milestone-preview',
  milestoneName: 'Client experience launch',
  iteration: 2,
  workStatus: 'ready',
  approval: 'unreviewed',
  previewUrl: 'localhost:3100/p/warehaus-portal/t/order-ahead',
  prNumber: 108,
  prTitle: 'Order-ahead landing page',
  branch: 'feat/order-ahead',
  commit: 'aacb3e7',
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
    { name: 'Give the mobile review card more room' },
    { name: 'Make the preview link a larger tap target' },
    { name: 'Re-run design check (Product Design Lead)' },
  ],
  history: [
    {
      iteration: 2,
      decision: 'request_changes',
      notes: 'The review card needs more space on mobile, and the preview link should be easier to tap.',
      decidedByName: 'Peter',
      decidedAt: STAMP,
      source: 'portal',
      taskCount: 2,
    },
    {
      iteration: 1,
      decision: 'request_changes',
      notes: 'Make the mobile milestone summary easier to scan.',
      decidedByName: 'Peter',
      decidedAt: STAMP - 5 * 24 * 60 * 60 * 1000,
      source: 'portal',
      taskCount: 2,
    },
  ],
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

function LockMark() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <rect x="2" y="4.5" width="6" height="4.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1" />
      <path d="M3.2 4.5V3.2a1.8 1.8 0 0 1 3.6 0v1.3" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function StageHint({ current, phone = false, confirming = null }: { current: string; phone?: boolean; confirming?: string | null }) {
  const stages = ['Idea', 'Planning', 'Awaiting Go', 'Building', 'Ready to Ship', 'Shipped', 'Parked'];
  if (phone && confirming) {
    return (
      <div data-testid="stage-confirm-sheet" className="flex flex-col gap-3">
        <p style={{ margin: 0, fontSize: 14, lineHeight: '21px' }}>{`Move this task to ${confirming}?`}</p>
        <button type="button" style={{ width: '100%', background: 'transparent', color: 'var(--fg)', border: '1px solid var(--border-2)', borderRadius: 9, padding: '12px 16px' }}>Cancel</button>
        <button type="button" style={{ width: '100%', background: 'var(--accent)', color: 'var(--accent-fg)', border: 0, borderRadius: 9, padding: '12px 16px', fontWeight: 600 }}>Confirm</button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h3 className="ds-mono" style={{ fontSize: 12, letterSpacing: '2.64px', margin: 0 }}>STAGE</h3>
        <span className="ds-mono" style={{ fontSize: 12, color: 'var(--muted)' }}>visible to client</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {stages.map((stage) => {
          const locked = stage !== 'Idea' && stage !== 'Planning';
          const selected = stage === current && !locked;
          return (
            <span
              key={stage}
              className="ds-mono"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                whiteSpace: 'nowrap',
                border: locked ? '1px dashed var(--border-2)' : selected ? '1px solid var(--fg)' : '1px solid var(--border-2)',
                borderRadius: 999,
                padding: '8px 12px',
                background: selected ? 'var(--fg)' : 'transparent',
                color: selected ? 'var(--bg)' : locked ? 'var(--muted)' : 'var(--fg)',
                fontSize: 13,
              }}
            >
              {stage}
              {locked ? <LockMark /> : null}
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
      <StageHint current="Ready to Ship" phone={phone} />
    </section>
  );
}

function DialogFrame({
  kind,
  phone = false,
  busy = false,
  fieldError = null,
  capture,
  model = ready,
}: {
  kind: 'approve' | 'changes';
  phone?: boolean;
  busy?: boolean;
  fieldError?: string | null;
  capture: string;
  model?: ReviewSurfaceModel;
}) {
  return (
    <section
      data-capture={capture}
      data-width={phone ? '390' : '1440'}
      style={{ position: 'relative', width: phone ? 390 : 1108, minHeight: phone ? 760 : 720, overflow: 'hidden', paddingTop: 16 }}
    >
      <MilestoneReviewSurface model={model} layout="card" phone={phone} />
      <ReviewScrim
        phone={phone}
        cover
        confirmOnEnter={kind === 'approve'}
        label={kind === 'approve' ? 'Approve milestone' : 'Request changes'}
        hint={kind === 'changes' ? '⌘↵ to submit · Esc to close' : '↵ to approve · Esc to close'}
        onClose={() => undefined}
        onConfirm={() => undefined}
        footer={
          <ReviewDialogActions
            approve={kind === 'approve'}
            iteration={model.iteration}
            busy={busy}
            phone={phone}
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
          context={{
            milestoneName: model.milestoneName ?? 'Client experience launch',
            iteration: model.iteration,
            prNumber: model.prNumber,
            commit: model.commit,
            designCheck: model.designCheck,
          }}
        />
      </ReviewScrim>
    </section>
  );
}

const idle = async () => undefined;

function pageMilestone(staffReview: boolean): MilestoneRoadmapView {
  const milestone: MilestoneRoadmapView = {
    id: 'm-launch',
    name: 'Client experience launch',
    objective: 'Launch the new client experience: a clear project overview and milestones that carry the brief.',
    goals: ['Clients can review the finished flow at desktop and mobile sizes.'],
    workStatus: staffReview ? 'active' : 'active',
    note: null,
    approverName: staffReview ? 'Peter' : null,
    publishToWarehaus: true,
    resources: [],
    openCount: 5,
    doneCount: 3,
    countIsDecision: false,
    rows: (changes.resultTasks ?? []).map((task, index) => ({
      id: `new-${index}`,
      name: task.name,
      status: 'To Do',
      isDone: false,
      stage: 'Building',
      resourceCount: 0,
      children: [],
    })),
  };
  if (staffReview) {
    milestone.approval = 'changes_requested';
    milestone.decidedAt = STAMP;
    milestone.review = {
      iteration: changes.iteration,
      previewUrl: changes.previewUrl,
      prNumber: changes.prNumber,
      prTitle: changes.prTitle,
      branch: changes.branch,
      commit: changes.commit,
      builtAt: changes.builtAt,
      designCheck: changes.designCheck,
      designCheckNote: changes.designCheckNote,
      history: changes.history,
    };
  }
  return milestone;
}

function MilestonePage({ capture, width, staff }: { capture: string; width: number; staff: boolean }) {
  return (
    <section data-capture={capture} data-width={width === 390 ? '390' : '1440'} style={{ width, paddingTop: 16 }}>
      <MilestoneDetailView
        milestone={pageMilestone(staff)}
        project={{ id: 'p-portal', name: 'Warehaus Portal', publishToWarehaus: true }}
        tasks={[]}
        staff={staff}
        fixtures
        resourceChoices={[]}
        onBack={() => undefined}
        onFixture={() => undefined}
        mutations={{
          decide: idle,
          decideAsClient: idle,
          save: idle,
          setWorkStatus: idle,
          setPublish: idle,
          attachTask: idle,
          detachTask: idle,
        }}
      />
    </section>
  );
}

export function ApprovalsPreview({ theme }: { theme: 'dark' | 'light' }) {
  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    return () => document.documentElement.classList.remove('light');
  }, [theme]);
  return (
    <main className="ds-scope" style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', padding: '48px 32px 32px' }}>
      <style>{'nextjs-portal{display:none !important}'}</style>
      <p className="ds-mono" style={{ letterSpacing: '2.64px', fontSize: 12, color: 'var(--muted)' }}>
        {`APPROVALS PREVIEW · ${theme.toUpperCase()}`}
      </p>
      <div className="mt-8 flex flex-col gap-10">
        {frames.map((frame) => (
          <section key={frame.id} data-capture={frame.id} data-width="1440" style={{ width: frame.width, paddingTop: 16 }}>
            <h2 className="type-heading" style={{ fontSize: 20, margin: '0 0 12px' }}>{frame.title}</h2>
            <MilestoneReviewSurface model={frame.model} layout="card" phone={false} forced={frame.visual ?? null} />
          </section>
        ))}
        {frames.map((frame) => (
          <section key={`${frame.id}-phone`} data-capture={`${frame.id}-phone`} data-width="390" style={{ width: 390, paddingTop: 16 }}>
            <h2 className="type-heading" style={{ fontSize: 20, margin: '0 0 12px' }}>{`${frame.title} · phone`}</h2>
            <MilestoneReviewSurface model={frame.model} layout="card" phone forced={frame.visual ?? null} />
          </section>
        ))}
        <TaskFrame phone={false} />
        <TaskFrame phone />
        <DialogFrame kind="approve" capture="dialog-approve" />
        <DialogFrame kind="approve" model={fixes} capture="dialog-approve-fixes" />
        <DialogFrame kind="approve" fieldError="Couldn’t save your approval. Nothing changed. Try again." capture="dialog-error" />
        <DialogFrame kind="changes" capture="dialog-changes" />
        <DialogFrame kind="changes" busy capture="dialog-saving" />
        <DialogFrame kind="approve" phone capture="m4" />
        <DialogFrame kind="changes" phone capture="m2" />
        <MilestonePage capture="r3" width={1108} staff />
        <MilestonePage capture="r3-phone" width={390} staff />
        <section data-capture="r5" data-width="1440" style={{ width: 1108, paddingTop: 16 }}>
          <MilestoneReviewSurface model={approved} layout="card" />
          <article data-testid="milestone-activity-card" style={{ marginTop: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 28, padding: 24 }}>
            <h3 className="type-heading" style={{ fontSize: 20, lineHeight: '30px', margin: '0 0 12px' }}>Activity</h3>
            <p style={{ margin: 0, fontSize: 14, lineHeight: '21px' }}>Peter approved iteration 2.</p>
            <p className="ds-mono" style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>Nov 17 · Portal</p>
          </article>
        </section>
        <section data-capture="iterations" data-width="1440" style={{ width: 1108, paddingTop: 16 }}>
          <MilestoneReviewSurface model={ready} layout="card" />
        </section>
        <MilestonePage capture="client" width={1108} staff={false} />
        <MilestonePage capture="client-phone" width={390} staff={false} />
        <section data-capture="stage-locked" data-width="1440" style={{ width: 640, paddingTop: 16 }}>
          <StageHint current="Ready to Ship" />
        </section>
        <section data-capture="stage-confirm" data-width="390" className="flex flex-col gap-4" style={{ width: 390, paddingTop: 16 }}>
          <StageHint current="Ready to Ship" phone confirming="Planning" />
        </section>
        <section data-capture="task-phone-card" data-width="390" style={{ width: 390 }}>
          <MilestoneReviewSurface model={ready} layout="card" phone />
        </section>
      </div>
    </main>
  );
}
