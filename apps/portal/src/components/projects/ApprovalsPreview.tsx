'use client';

import { useEffect } from 'react';
import { NOTES_REQUIRED } from '@convex/_lib/milestoneReview';
import { PREVIEW_LINK_LOCAL } from '@convex/_lib/previewLink';
import { getPortalSidebarSections } from '@/lib/data/sidebarSections';
import { PortalDock } from '@/components/layout/PortalDock';
import { PortalTabSidebar } from '@/components/layout/PortalSidebar';
import { PortalDataRetryProvider } from '@/components/providers/PortalDataRetry';
import { PortalTabProvider } from '@/components/providers/PortalTabProvider';
import { PortalViewProvider } from '@/components/providers/PortalViewProvider';
import { TASK_STAGE_HINT } from '@/lib/data/taskStatus';
import { StatusBadge } from '@/components/ui/primitives';
import {
  APPROVE_CONFIRM_TITLE,
  MilestoneReviewSurface,
  RECORDING_APPROVAL,
  RETRY_FAILED,
  ReviewDialogActions,
  ReviewDialogBody,
  ReviewScrim,
  type ReviewSurfaceModel,
  type ReviewVisual,
} from './MilestoneReview';
import { StageConfirmSheet } from './milestoneChrome';
import { MilestoneDetailView, MilestoneListCard } from './ProjectRoadmap';
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

const waiting: ReviewSurfaceModel = { ...ready, previewUrl: null, designCheck: 'pending' };
const ATTACHED_PREVIEW = 'https://warehaus-portal-git-order-ahead-warehaus-collective.vercel.app';
const attachedLink: ReviewSurfaceModel = {
  ...ready,
  workStatus: 'ready',
  previewUrl: ATTACHED_PREVIEW,
  previewAttachedAt: STAMP,
  designCheck: 'pass',
};
const fixes: ReviewSurfaceModel = {
  ...ready,
  designCheck: 'fixes',
  designFixCount: 2,
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

const buildingModel: ReviewSurfaceModel = {
  ...ready,
  previewUrl: null,
  previewBuild: 'building',
  previewBuildAt: STAMP,
};
const previewFailed: ReviewSurfaceModel = {
  ...ready,
  previewUrl: null,
  previewBuild: 'failed',
  previewBuildAttempt: 2,
  previewBuildAt: STAMP,
};
const deleteFailed: ReviewSurfaceModel = {
  ...approved,
  previewDelete: 'removing',
  previewDeleteAttempt: 2,
  previewDeleteAt: STAMP,
};
const couldntRemove: ReviewSurfaceModel = {
  ...approved,
  previewDelete: 'failed',
  previewDeleteAttempt: 3,
  previewDeleteAt: STAMP,
};
const previewRemoved: ReviewSurfaceModel = {
  ...approved,
  previewUrl: null,
  previewDelete: 'removed',
  previewDeleteAttempt: null,
  previewDeleteAt: STAMP,
};

const frames: Array<{ id: string; title: string; visual?: ReviewVisual; model: ReviewSurfaceModel; width: number; isPeter?: boolean }> = [
  { id: 'ready', title: 'Ready', model: ready, width: 1108, isPeter: true },
  { id: 'ready-staff', title: 'Ready · staff', model: ready, width: 1108, isPeter: false },
  { id: 'waiting', title: 'No preview yet', model: waiting, width: 1108, isPeter: true },
  { id: 'building', title: 'Building preview', model: buildingModel, width: 1108, isPeter: true },
  { id: 'preview-failed', title: 'Preview failed', model: previewFailed, width: 1108, isPeter: false },
  { id: 'fixes', title: 'Design fixes needed', model: fixes, width: 1108, isPeter: true },
  { id: 'saving', title: 'Saving', visual: 'saving', model: ready, width: 1108, isPeter: true },
  { id: 'error', title: 'Error', visual: 'error', model: ready, width: 1108, isPeter: true },
  { id: 'approved', title: 'Approved', model: approved, width: 1108 },
  { id: 'preview-removed', title: 'Preview removed', model: previewRemoved, width: 1108 },
  { id: 'peter-delete-removing', title: 'Peter · delete in progress', model: deleteFailed, width: 1108, isPeter: true },
  { id: 'peter-delete-failed', title: 'Peter · delete failed', model: couldntRemove, width: 1108, isPeter: true },
  { id: 'delete-failed', title: 'Delete failed', model: deleteFailed, width: 1108, isPeter: false },
  { id: 'couldnt-remove', title: 'Couldn’t remove preview', model: couldntRemove, width: 1108, isPeter: false },
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
    return <StageConfirmSheet stage={confirming} onCancel={() => undefined} onConfirm={() => undefined} />;
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h3 className="ds-mono" style={{ fontSize: 12, letterSpacing: '2.64px', margin: 0 }}>STAGE</h3>
        <span className="ds-mono" style={{ fontSize: 12, color: 'var(--muted)' }}>visible to client</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {stages.map((stage) => {
          const selected = stage === current;
          const locked = stage === 'Shipped';
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
                background: locked && selected ? 'var(--surface-2)' : selected ? 'var(--fg)' : 'transparent',
                color: locked ? 'var(--muted)' : selected ? 'var(--bg)' : 'var(--fg)',
                fontSize: 13,
              }}
            >
              {stage}
              {locked ? (
                <span style={{ flexShrink: 0, border: '1px solid var(--border-2)', borderRadius: 999, padding: '3px 8px', fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>
                  ON MERGE
                </span>
              ) : null}
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
      style={{ width: phone ? 390 : 840, boxSizing: 'border-box', background: 'var(--surface)', color: 'var(--fg)', borderRadius: 16, padding: phone ? 16 : 24, border: '1px solid var(--border)' }}
    >
      <p className="ds-mono" style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Warehaus Portal / Task</p>
      <p style={{ margin: 0, background: 'var(--surface-2)', borderRadius: 18, padding: '8px 12px', fontSize: 14, fontWeight: 500 }}>Staff only · hidden from clients</p>
      <h2 className="type-heading" style={{ fontSize: phone ? 20 : 28, lineHeight: phone ? '30px' : '36px', margin: 0 }}>
        Order-ahead landing page
        <span data-testid="review-tag" className="ds-mono" style={{ marginLeft: 8, border: '1px solid var(--border-2)', borderRadius: 999, padding: '2px 8px', fontSize: 12, color: 'var(--muted)' }}>From review</span>
      </h2>
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
      <MilestoneReviewSurface model={model} layout="card" phone={phone} isPeter />
      <ReviewScrim
        phone={phone}
        cover
        confirmOnEnter={kind === 'approve'}
        label={busy && kind === 'approve' ? RECORDING_APPROVAL : kind === 'approve' ? APPROVE_CONFIRM_TITLE : 'Request changes'}
        spinner={busy && kind === 'approve'}
        hideClose={phone && kind === 'approve' || busy && kind === 'approve'}
        actionsRow={phone && kind === 'approve'}
        hideChromeBelow={kind === 'approve' || kind === 'changes'}
        header={kind === 'approve' ? 'compact' : 'default'}
        focusCancel={kind === 'approve'}
        blueFocus
        onClose={() => undefined}
        onConfirm={() => undefined}
        footer={
          <ReviewDialogActions
            approve={kind === 'approve'}
            iteration={model.iteration}
            busy={busy}
            phone={phone}
            submitLabel={fieldError && kind === 'approve' ? 'Try again' : undefined}
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
          saving={busy && kind === 'approve'}
          context={{
            milestoneName: model.milestoneName ?? 'Client experience launch',
            iteration: model.iteration,
            prNumber: model.prNumber,
            commit: model.commit,
            designCheck: model.designCheck,
            designFixCount: model.designFixCount,
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
      previewBuild: null,
      previewBuildAttempt: null,
      previewBuildAt: null,
      previewDelete: null,
      previewDeleteAttempt: null,
      previewDeleteAt: null,
      deployFinishedAt: null,
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
        isPeter={staff}
        fixtures
        resourceChoices={[]}
        onBack={() => undefined}
        onFixture={() => undefined}
        mutations={{
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

const tileMilestone: MilestoneRoadmapView = {
  id: 'm-ready',
  name: 'Client experience launch',
  objective: 'Launch the new client experience.',
  goals: ['Clients can review the finished flow.'],
  workStatus: 'ready',
  approval: 'unreviewed',
  note: null,
  approverName: null,
  publishToWarehaus: true,
  dueDate: '2026-11-19',
  updatedAt: Date.UTC(2026, 10, 20, 15, 0, 0),
  localPreviewUrl: 'http://localhost:3200',
  figmaUrl: 'https://www.figma.com/design/TS3DcaCgrIdYf0jhvnMy3k/Warehaus-Studio?node-id=770-13054',
  resources: [
    { id: 'r-flow', title: 'Client flow', url: null },
    { id: 'r-copy', title: 'Launch copy', url: null },
  ],
  openCount: 0,
  doneCount: 8,
  countIsDecision: false,
  rows: [],
  review: {
    iteration: ready.iteration,
    previewUrl: ready.previewUrl,
    prNumber: ready.prNumber,
    prTitle: ready.prTitle,
    branch: ready.branch,
    commit: ready.commit,
    builtAt: ready.builtAt,
    designCheck: ready.designCheck,
    designCheckNote: ready.designCheckNote,
    previewBuild: null,
    previewBuildAttempt: null,
    previewBuildAt: null,
    previewDelete: null,
    previewDeleteAttempt: null,
    previewDeleteAt: null,
    deployFinishedAt: null,
    history: ready.history,
  },
};

function TaskFromReview({ phone }: { phone: boolean }) {
  return (
    <section data-capture={phone ? 'task-from-review-phone' : 'task-from-review'} data-width={phone ? '390' : '1440'} style={{ width: phone ? 390 : 1108, paddingTop: 16 }}>
      <article className="flex items-center justify-between gap-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 16 }}>
        <span style={{ fontSize: 14 }}>Give the mobile review card more room</span>
        <span data-testid="review-tag" className="ds-mono" style={{ border: '1px solid var(--border-2)', borderRadius: 999, padding: '2px 8px', fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>From review</span>
      </article>
    </section>
  );
}

function OverlayFrame({ kind, phone }: { kind: ApprovalsOverlay; phone: boolean }) {
  const width = phone ? 390 : 1108;
  return (
    <section data-overlay={kind} data-width={phone ? '390' : '1440'} style={{ position: 'relative', width, minHeight: phone ? 760 : 640, overflow: 'hidden', paddingTop: 16 }}>
      {kind === 'confirm-tile' ? (
        <MilestoneListCard
          milestone={tileMilestone}
          staff
          isPeter
          fixtures
          openConfirm
          phone={phone}
          cover
          onOpen={() => undefined}
        />
      ) : (
        <MilestoneReviewSurface
          model={ready}
          layout="card"
          phone={phone}
          isPeter
          cover
          initialDialog={kind === 'request-changes' || kind === 'request-changes-error' ? 'changes' : 'approve'}
          initialError={kind === 'request-changes-error' ? NOTES_REQUIRED : null}
          saveFailed={kind === 'confirm-failed'}
        />
      )}
    </section>
  );
}

function StaffRetryFrame({
  kind,
  phone,
}: {
  kind: 'preview-failed' | 'preview-failed-retrying' | 'preview-failed-after' | 'couldnt-remove' | 'couldnt-remove-retrying' | 'couldnt-remove-after';
  phone: boolean;
}) {
  const after = kind.endsWith('-after');
  const retrying = kind.endsWith('-retrying');
  const remove = kind.startsWith('couldnt-remove');
  const model = after ? (remove ? approved : buildingModel) : remove ? couldntRemove : previewFailed;
  return (
    <section data-overlay={kind} data-width={phone ? '390' : '1440'} style={{ width: phone ? '100%' : 1108, maxWidth: phone ? 390 : undefined, paddingTop: 16 }}>
      <MilestoneReviewSurface
        model={model}
        layout="card"
        phone={phone}
        isPeter={false}
        retrying={retrying}
        onRetry={retrying ? () => undefined : undefined}
      />
    </section>
  );
}

const unpublishedTile: MilestoneRoadmapView = {
  ...tileMilestone,
  id: 'm-draft',
  name: 'Billing export draft',
  objective: 'Invoices export without a second approval step.',
  workStatus: 'draft',
  publishToWarehaus: false,
  resources: [
    { id: 'r-columns', title: 'Invoice columns', url: null },
    { id: 'r-notes', title: 'Export notes', url: null },
  ],
  figmaUrl: null,
  updatedAt: null,
  openCount: 4,
  doneCount: 0,
  review: undefined,
};

function UnpublishedTileFrame({ staff, phone }: { staff: boolean; phone: boolean }) {
  return (
    <section
      data-overlay={staff ? 'tile-unpublished' : 'tile-unpublished-client'}
      data-width={phone ? '390' : '1440'}
      style={{ width: phone ? '100%' : 1108, maxWidth: '100%', paddingTop: 16 }}
    >
      <MilestoneListCard milestone={unpublishedTile} staff={staff} isPeter={false} fixtures phone={phone} onOpen={() => undefined} />
    </section>
  );
}

function TileFrame({ peter, staff = true, phone }: { peter: boolean; staff?: boolean; phone: boolean }) {
  const id = !staff ? 'tile-client' : peter ? 'tile-peter' : 'tile-staff';
  return (
    <section data-overlay={id} data-width={phone ? '390' : '1440'} style={{ width: phone ? 390 : 1108, maxWidth: '100%', paddingTop: 16 }}>
      <MilestoneListCard milestone={tileMilestone} staff={staff} isPeter={peter} fixtures onOpen={() => undefined} />
    </section>
  );
}

function MilestoneChrome({ phone }: { phone: boolean }) {
  const sections = getPortalSidebarSections('projects', 'team');
  return (
    <PortalDataRetryProvider>
      <PortalTabProvider>
        <PortalViewProvider>
          <section data-overlay="milestone-page" data-width={phone ? '390' : '1440'} className="relative" style={{ width: phone ? 390 : 1440, minHeight: 720, paddingBottom: 96 }}>
            <div className="flex items-start">
              {phone ? null : <PortalTabSidebar tab="projects" />}
              <div className="min-w-0 flex-1">
                {phone ? (
                  <nav aria-label="Project sections" data-testid="portal-sidebar">
                    {sections.map((section) => (
                      <span key={section.key} style={{ marginRight: 12, fontSize: 14 }}>{section.label}</span>
                    ))}
                  </nav>
                ) : null}
                <MilestonePage capture={phone ? 'milestone-page-phone' : 'milestone-page'} width={phone ? 390 : 1108} staff />
              </div>
            </div>
            <PortalDock />
          </section>
        </PortalViewProvider>
      </PortalTabProvider>
    </PortalDataRetryProvider>
  );
}

export type ApprovalsOverlay =
  | 'confirm-card'
  | 'confirm-tile'
  | 'request-changes'
  | 'request-changes-error'
  | 'confirm-failed';
export type ApprovalsFocus =
  | 'task-from-review'
  | 'tile-peter'
  | 'tile-staff'
  | 'tile-client'
  | 'preview-failed'
  | 'preview-failed-retrying'
  | 'preview-failed-after'
  | 'couldnt-remove'
  | 'couldnt-remove-retrying'
  | 'couldnt-remove-after'
  | 'retry-unavailable'
  | 'retry-pending'
  | 'retry-error'
  | 'peter-delete-removing'
  | 'peter-delete-failed'
  | 'preview-removed'
  | 'approved'
  | 'staff-delete-removing'
  | 'staff-couldnt-remove'
  | 'milestone-page'
  | 'attach'
  | 'attached'
  | 'remove-confirm'
  | 'preview-link-invalid'
  | 'waiting'
  | 'changes'
  | 'building'
  | 'tile-unpublished'
  | 'tile-unpublished-client';

export type ApprovalsSize = '1440' | '390';

const noopRetry = () => undefined;

function ReviewStateFrame({ kind, phone }: { kind: ApprovalsFocus; phone: boolean }) {
  const width = phone ? '100%' : 1108;
  const shared = { layout: 'card' as const, phone };
  let node = null;
  if (kind === 'retry-unavailable' || kind === 'preview-failed') {
    node = <MilestoneReviewSurface {...shared} model={previewFailed} isPeter={false} />;
  } else if (kind === 'retry-pending' || kind === 'preview-failed-retrying') {
    node = <MilestoneReviewSurface {...shared} model={previewFailed} isPeter={false} retrying onRetry={noopRetry} />;
  } else if (kind === 'retry-error') {
    node = <MilestoneReviewSurface {...shared} model={previewFailed} isPeter={false} onRetry={noopRetry} retryError={RETRY_FAILED} />;
  } else if (kind === 'peter-delete-removing') {
    node = <MilestoneReviewSurface {...shared} model={deleteFailed} isPeter />;
  } else if (kind === 'peter-delete-failed') {
    node = <MilestoneReviewSurface {...shared} model={couldntRemove} isPeter />;
  } else if (kind === 'preview-removed') {
    node = <MilestoneReviewSurface {...shared} model={previewRemoved} isPeter />;
  } else if (kind === 'approved') {
    node = <MilestoneReviewSurface {...shared} model={approved} isPeter />;
  } else if (kind === 'staff-delete-removing') {
    node = <MilestoneReviewSurface {...shared} model={deleteFailed} isPeter={false} />;
  } else if (kind === 'staff-couldnt-remove') {
    node = <MilestoneReviewSurface {...shared} model={couldntRemove} isPeter={false} />;
  }
  if (!node) return null;
  return (
    <section data-overlay={kind} data-width={phone ? '390' : '1440'} style={{ width, maxWidth: phone ? 390 : undefined, paddingTop: 16 }}>
      {node}
    </section>
  );
}

function PreviewLinkFrame({ kind, phone }: { kind: 'attach' | 'attached' | 'remove-confirm' | 'preview-link-invalid'; phone: boolean }) {
  const attaching = kind === 'attach' || kind === 'preview-link-invalid';
  return (
    <section data-overlay={kind} data-width={phone ? '390' : '1440'} style={{ width: phone ? '100%' : 1108, maxWidth: phone ? 390 : undefined, paddingTop: 16 }}>
      <MilestoneReviewSurface
        model={attaching ? waiting : attachedLink}
        layout="card"
        phone={phone}
        isPeter
        staffAttach
        cover={false}
        initialLink={kind === 'attached' ? null : kind === 'remove-confirm' ? 'remove' : 'attach'}
        initialLinkUrl={kind === 'preview-link-invalid' ? 'http://localhost:3100' : attaching ? '' : ATTACHED_PREVIEW}
        initialLinkError={kind === 'preview-link-invalid' ? PREVIEW_LINK_LOCAL : null}
      />
    </section>
  );
}

function isPreviewLinkState(view: ApprovalsFocus): view is 'attach' | 'attached' | 'remove-confirm' | 'preview-link-invalid' {
  return view === 'attach' || view === 'attached' || view === 'remove-confirm' || view === 'preview-link-invalid';
}

function isReviewState(view: ApprovalsFocus): boolean {
  return view === 'retry-unavailable'
    || view === 'retry-pending'
    || view === 'retry-error'
    || view === 'peter-delete-removing'
    || view === 'peter-delete-failed'
    || view === 'preview-removed'
    || view === 'approved'
    || view === 'staff-delete-removing'
    || view === 'staff-couldnt-remove';
}

export function ApprovalsPreview({
  theme,
  overlay = null,
  view = null,
  size = null,
}: {
  theme: 'dark' | 'light';
  overlay?: ApprovalsOverlay | null;
  view?: ApprovalsFocus | null;
  size?: ApprovalsSize | null;
}) {
  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    return () => document.documentElement.classList.remove('light');
  }, [theme]);
  return (
    <main className="ds-scope" style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', padding: size === '390' ? 16 : size === '1440' ? 32 : '48px 32px 32px' }}>
      <style>{'nextjs-portal{display:none !important}'}</style>
      <p className="ds-mono" style={{ letterSpacing: '2.64px', fontSize: 12, color: 'var(--muted)' }}>
        {`APPROVALS PREVIEW · ${theme.toUpperCase()}`}
      </p>
      <div className="mt-8 flex flex-col gap-10">
        {overlay ? (
          <>
            {size === '390' ? null : <OverlayFrame kind={overlay} phone={false} />}
            {size === '1440' ? null : <OverlayFrame kind={overlay} phone />}
          </>
        ) : null}
        {view === 'waiting' || view === 'changes' || view === 'building' ? (
          <section style={{ width: size === '390' ? '100%' : 1108, maxWidth: '100%' }}>
            <MilestoneReviewSurface
              model={view === 'changes' ? changes : view === 'building' ? buildingModel : waiting}
              layout="card"
              phone={size === '390'}
              isPeter
              staffAttach={view === 'waiting'}
            />
          </section>
        ) : null}
        {view === 'task-from-review' ? (
          <>
            <TaskFromReview phone={false} />
            <TaskFromReview phone />
          </>
        ) : null}
        {view === 'tile-unpublished' || view === 'tile-unpublished-client' ? (
          <UnpublishedTileFrame staff={view === 'tile-unpublished'} phone={size === '390'} />
        ) : null}
        {view === 'tile-peter' || view === 'tile-staff' || view === 'tile-client' ? (
          <>
            {size === '390' ? null : (
              <TileFrame peter={view === 'tile-peter'} staff={view !== 'tile-client'} phone={false} />
            )}
            {size === '1440' ? null : (
              <TileFrame peter={view === 'tile-peter'} staff={view !== 'tile-client'} phone />
            )}
          </>
        ) : null}
        {view && isPreviewLinkState(view) ? (
          <>
            {size === '390' ? null : <PreviewLinkFrame kind={view} phone={false} />}
            {size === '1440' ? null : <PreviewLinkFrame kind={view} phone />}
          </>
        ) : null}
        {view && isReviewState(view) ? (
          <>
            {size === '390' ? null : <ReviewStateFrame kind={view} phone={false} />}
            {size === '1440' ? null : <ReviewStateFrame kind={view} phone />}
          </>
        ) : null}
        {view === 'preview-failed' || view === 'preview-failed-retrying' || view === 'preview-failed-after' || view === 'couldnt-remove' || view === 'couldnt-remove-retrying' || view === 'couldnt-remove-after' ? (
          <>
            {size === '390' ? null : <StaffRetryFrame kind={view} phone={false} />}
            {size === '1440' ? null : <StaffRetryFrame kind={view} phone />}
          </>
        ) : null}
        {view === 'milestone-page' ? (
          <>
            <MilestoneChrome phone={false} />
            <MilestoneChrome phone />
          </>
        ) : null}
        {overlay || view ? null : <>
        {frames.map((frame) => (
          <section key={frame.id} data-capture={frame.id} data-width="1440" style={{ width: frame.width, paddingTop: 16 }}>
            <h2 className="type-heading" style={{ fontSize: 20, margin: '0 0 12px' }}>{frame.title}</h2>
            <MilestoneReviewSurface model={frame.model} layout="card" phone={false} isPeter={frame.isPeter !== false} forced={frame.visual ?? null} />
          </section>
        ))}
        {frames.map((frame) => (
          <section key={`${frame.id}-phone`} data-capture={`${frame.id}-phone`} data-width="390" style={{ width: 390, paddingTop: 16 }}>
            <h2 className="type-heading" style={{ fontSize: 20, margin: '0 0 12px' }}>{`${frame.title} · phone`}</h2>
            <MilestoneReviewSurface model={frame.model} layout="card" phone isPeter={frame.isPeter !== false} forced={frame.visual ?? null} />
          </section>
        ))}
        <TaskFrame phone={false} />
        <TaskFrame phone />
        <DialogFrame kind="approve" capture="dialog-approve" />
        <DialogFrame kind="approve" busy capture="dialog-approve-pending" />
        <DialogFrame kind="approve" model={fixes} capture="dialog-approve-fixes" />
        <DialogFrame kind="approve" fieldError="Couldn’t save your approval. Nothing changed. Try again." capture="dialog-error" />
        <DialogFrame kind="changes" capture="dialog-changes" />
        <DialogFrame kind="changes" busy capture="dialog-saving" />
        <DialogFrame kind="approve" phone capture="m4" />
        <DialogFrame kind="changes" phone capture="m2" />
        <MilestonePage capture="r3" width={1108} staff />
        <MilestonePage capture="r3-phone" width={390} staff />
        <section data-capture="r5" data-width="1440" style={{ width: 1108, paddingTop: 16 }}>
          <MilestoneReviewSurface model={approved} layout="card" isPeter />
          <article data-testid="milestone-activity-card" style={{ marginTop: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 28, padding: 24 }}>
            <h3 className="type-heading" style={{ fontSize: 20, lineHeight: '30px', margin: '0 0 12px' }}>Activity</h3>
            <ul className="flex flex-col gap-3" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              <li className="flex items-start gap-2" style={{ fontSize: 14, lineHeight: '21px' }}>
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" style={{ marginTop: 3, flex: '0 0 auto' }}>
                  <path d="M2.5 7.2 5.4 10 11.5 3.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
                </svg>
                <span>Approved by Peter · Nov 17</span>
              </li>
              <li style={{ fontSize: 14, lineHeight: '21px' }}>Design check passed · Nov 17</li>
              <li style={{ fontSize: 14, lineHeight: '21px' }}>Changes requested on iteration 1 · Nov 12</li>
            </ul>
          </article>
        </section>
        <section data-capture="iterations" data-width="1440" style={{ width: 1108, paddingTop: 16 }}>
          <MilestoneReviewSurface model={ready} layout="card" isPeter />
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
          <MilestoneReviewSurface model={ready} layout="card" phone isPeter />
        </section>
        </>}
      </div>
    </main>
  );
}
