import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  ALREADY_REVIEWED,
  NOTES_REQUIRED,
  ONLY_PETER,
  CHAT_CONTACT_MISSING,
  chatContactError,
  STAFF_REQUIRED,
  WAITING_ON_BUILD,
  TASK_STAGE_HINT,
  displayedTaskStatus,
  isPortalReviewTask,
  iterationTaskDrafts,
  normalizeLocalPreview,
  notionWriteAllowedForTask,
  planReview,
  previewStatusPatch,
  RETRY_WAITS_ON_TOKENS,
  reviewChatLine,
  reviewPreviewRetryReady,
  reviewForAudience,
  reviewNotesForAudience,
  roadmapReviewForAudience,
  type PlanReviewInput,
} from './milestoneReview';

const peter = { source: 'portal' as const, role: 'Warehaus Staff' as const, email: 'Peter@warehaus.studio' };
const chat = { source: 'chat' as const, tokenName: 'grok-bot' };

function ready(extra: Partial<PlanReviewInput> = {}): PlanReviewInput {
  return {
    actor: peter,
    currentIteration: 2,
    workStatus: 'ready',
    hasPreview: true,
    iteration: 2,
    decision: 'approve',
    notes: '',
    existing: null,
    appliesTo: [],
    ...extra,
  };
}

describe('milestone review decisions', () => {
  it('approves once and keeps Ready to Ship', () => {
    const planned = planReview(ready());
    assert.equal(planned.ok, true);
    if (!planned.ok || planned.idempotent || planned.decision !== 'approve') return;
    assert.equal(planned.workStatus, 'ready');
  });

  it('is idempotent for the same iteration and decision', () => {
    const again = planReview(
      ready({ existing: { decision: 'approve', notes: '' }, decision: 'approve' }),
    );
    assert.deepEqual(again, { ok: true, idempotent: true, decision: 'approve' });
    const changes = planReview(
      ready({
        decision: 'request_changes',
        notes: 'Tighten the mobile card.',
        existing: { decision: 'request_changes', notes: 'Tighten the mobile card.' },
      }),
    );
    assert.equal(changes.ok, true);
    if (!changes.ok) return;
    assert.equal(changes.idempotent, true);
  });

  it('rejects a different decision on an iteration that already has a review', () => {
    const planned = planReview(
      ready({
        decision: 'request_changes',
        notes: 'Change the card.',
        existing: { decision: 'approve', notes: '' },
      }),
    );
    assert.deepEqual(planned, { ok: false, reason: ALREADY_REVIEWED });
  });

  it('rejects a stale iteration', () => {
    const planned = planReview(ready({ iteration: 1 }));
    assert.equal(planned.ok, false);
    if (planned.ok) return;
    assert.match(planned.reason, /stale/);
    assert.match(planned.reason, /2/);
  });

  it('requires notes to request changes', () => {
    const empty = planReview(ready({ decision: 'request_changes', notes: '   ' }));
    assert.deepEqual(empty, { ok: false, reason: NOTES_REQUIRED });
  });

  it('moves back to Building and writes one task per note group', () => {
    const planned = planReview(
      ready({
        decision: 'request_changes',
        notes: 'Give the mobile review card more room.\n\nMake the preview link a larger tap target.',
      }),
    );
    assert.equal(planned.ok, true);
    if (!planned.ok || planned.idempotent || planned.decision !== 'request_changes') return;
    assert.equal(planned.workStatus, 'active');
    assert.equal(planned.nextIteration, 3);
    assert.equal(planned.tasks.length, 2);
    assert.equal(planned.tasks[0]?.parentTaskId, null);
    const selected = planReview(
      ready({
        decision: 'request_changes',
        notes: 'Needs more room on mobile.',
        appliesTo: [
          { id: 'task-a', name: 'Mobile milestone summary' },
          { id: 'task-b', name: 'Review card layout' },
        ],
      }),
    );
    assert.equal(selected.ok, true);
    if (!selected.ok || selected.idempotent || selected.decision !== 'request_changes') return;
    assert.equal(selected.tasks.length, 2);
    assert.equal(selected.tasks[0]?.parentTaskId, 'task-a');
    assert.match(selected.tasks[1]?.name ?? '', /Review card layout/);
  });

  it('record_milestone_review rejects a non-Peter approve and still lets other staff request changes', () => {
    for (const actor of [
      { source: 'portal' as const, role: 'Client Admin' as const, email: 'jordan@client.test' },
      { source: 'portal' as const, role: 'Client Member' as const, email: 'jordan@client.test' },
      { source: 'portal' as const, role: null, email: 'peter@warehaus.studio' },
    ]) {
      const planned = planReview(ready({ actor }));
      assert.equal(planned.ok, false);
      if (planned.ok) return;
      assert.equal(planned.reason, STAFF_REQUIRED);
    }
    const otherStaff = planReview(
      ready({ actor: { source: 'portal', role: 'Warehaus Staff', email: 'alex@warehaus.studio' }, decision: 'approve' }),
    );
    assert.deepEqual(otherStaff, { ok: false, reason: ONLY_PETER });
    const staffChanges = planReview(
      ready({
        actor: { source: 'portal', role: 'Warehaus Staff', email: 'alex@warehaus.studio' },
        decision: 'request_changes',
        notes: 'Give the card more room.',
      }),
    );
    assert.equal(staffChanges.ok, true);
    const otherBot = planReview(ready({ actor: { source: 'chat', tokenName: 'claude' }, decision: 'approve' }));
    assert.deepEqual(otherBot, { ok: false, reason: ONLY_PETER });
    const peterChat = planReview(ready({ actor: chat }));
    assert.equal(peterChat.ok, true);
    assert.equal(chatContactError('approve'), ONLY_PETER);
    assert.equal(chatContactError('request_changes'), CHAT_CONTACT_MISSING);
    assert.equal(CHAT_CONTACT_MISSING.includes('approve'), false);
  });

  it('hides the review from clients and keeps it for staff', () => {
    const review = { iteration: 2, previewUrl: 'localhost:3100/p/demo', history: [{ iteration: 1 }] };
    assert.equal(reviewForAudience('client', review), null);
    assert.equal(reviewForAudience('staff', review), review);
    assert.equal(reviewForAudience('client', null), null);
  });

  it('refuses a review before the localhost preview exists', () => {
    const planned = planReview(ready({ hasPreview: false }));
    assert.deepEqual(planned, { ok: false, reason: WAITING_ON_BUILD });
  });

  it('keeps Ready to Ship and does not treat approve as shipped', () => {
    const planned = planReview(ready({ workStatus: 'active' }));
    assert.equal(planned.ok, false);
    const shipped = planReview(ready());
    assert.equal(shipped.ok, true);
    if (!shipped.ok || shipped.idempotent) return;
    assert.equal(shipped.workStatus, 'ready');
    assert.equal('shipped' in shipped, false);
  });
});

describe('local preview and chat copy', () => {
  it('accepts only localhost port 3100', () => {
    assert.equal(
      normalizeLocalPreview('http://localhost:3100/p/warehaus-portal/m/client-experience-launch'),
      'localhost:3100/p/warehaus-portal/m/client-experience-launch',
    );
    assert.equal(normalizeLocalPreview('https://localhost:3000/p/demo'), null);
    assert.equal(normalizeLocalPreview('https://example.com/p/demo'), null);
  });

  it('uses the chat sentence with port 3100', () => {
    assert.equal(
      reviewChatLine({
        prNumber: 108,
        iteration: 2,
        previewUrl: 'localhost:3100/p/warehaus-portal/m/client-experience-launch',
      }),
      'PR #108 · Iteration 2 is ready. Open local preview: localhost:3100/p/warehaus-portal/m/client-experience-launch (your Mac, test data). Reply approve, or request changes with your notes.',
    );
  });
});

describe('Ready to Ship status', () => {
  it('keeps the Portal stage hint', () => {
    assert.equal(
      TASK_STAGE_HINT,
      'Staff can set any stage except Shipped. Shipped is set when the pull request merges.',
    );
  });

  it('shows In review instead of In progress', () => {
    assert.equal(displayedTaskStatus('In Progress', 'Ready to Ship'), 'In review');
    assert.equal(displayedTaskStatus('In progress', 'Ready to Ship'), 'In review');
    assert.equal(displayedTaskStatus('in_progress', 'Ready to Ship'), 'In review');
    assert.equal(displayedTaskStatus('Done', 'Ready to Ship'), 'Done');
    assert.equal(displayedTaskStatus('In Progress', 'Building'), 'In Progress');
    assert.equal(displayedTaskStatus('In progress', null), 'In progress');
  });
});

describe('iteration tasks', () => {
  it('creates one draft per paragraph when no task is selected', () => {
    const drafts = iterationTaskDrafts({
      notes: 'First fix.\n\nSecond fix.',
      nextIteration: 3,
      appliesTo: [],
    });
    assert.equal(drafts.length, 2);
    assert.match(drafts[0]?.name ?? '', /^Iteration 3:/);
  });
});

describe('client review notes', () => {
  it('drops review notes from the client milestone payload', () => {
    assert.equal(reviewNotesForAudience('client', "Peter's notes on the pay button"), null);
    assert.equal(reviewNotesForAudience('client', '   '), null);
    assert.equal(reviewNotesForAudience('client', null), null);
    assert.equal(reviewNotesForAudience('staff', '  Keep the ring  '), 'Keep the ring');
    const client = roadmapReviewForAudience('client', {
      approval: 'approved',
      decidedAt: 1,
      note: "Peter's notes",
    });
    assert.equal(client.note, null);
    assert.equal('approval' in client, false);
    assert.equal('decidedAt' in client, false);
    const staff = roadmapReviewForAudience('staff', { approval: 'approved', decidedAt: 1, note: ' Keep ' });
    assert.equal(staff.approval, 'approved');
    assert.equal(staff.decidedAt, 1);
    const milestones = readFileSync(new URL('../milestones.ts', import.meta.url), 'utf8');
    const apply = milestones.slice(milestones.indexOf('async function applyMilestoneReview'), milestones.indexOf('export const decideAsClient'));
    assert.match(apply, /if \(planned\.idempotent\)/);
    assert.equal(apply.includes('note: planned.notes'), false);
    assert.match(milestones, /roadmapReviewForAudience\(audience, milestone\)/);
  });
});

describe('portal-review notion pull', () => {
  it('preserves Convex-only iteration tasks and never writes a Notion page for them', () => {
    assert.equal(isPortalReviewTask('portal-review'), true);
    assert.equal(notionWriteAllowedForTask({ source: 'portal-review', notionPageId: 'real-page' }), false);
    assert.equal(notionWriteAllowedForTask({ source: 'notion', notionPageId: 'portal-review:m:2:0' }), false);
    assert.equal(notionWriteAllowedForTask({ source: 'notion', notionPageId: 'page-1' }), true);
    const hide = readFileSync(new URL('../sync/hide.ts', import.meta.url), 'utf8');
    const unseen = hide.slice(hide.indexOf('export const hideUnseen'), hide.indexOf('export const contactAuthUserId'));
    assert.match(unseen, /notionWriteAllowedForTask\(\{ source: row\.source, notionPageId: row\.notionPageId \}\)/);
    assert.match(unseen, /continue/);
    const upsert = readFileSync(new URL('../sync/upsert.ts', import.meta.url), 'utf8');
    assert.match(upsert, /return existing\._id/);
    assert.match(upsert, /notionWriteAllowedForTask\(\{ source: existing\.source, notionPageId: existing\.notionPageId \}\)/);
    const outbox = readFileSync(new URL('../sync/outbox.ts', import.meta.url), 'utf8');
    assert.match(outbox, /Portal review tasks stay in Convex/);
  });
});

describe('preview lifecycle', () => {
  it('skips a no-op status write and clears a finished build', () => {
    assert.equal(previewStatusPatch({ previewBuild: 'building' }, { build: 'building' }), null);
    assert.equal(previewStatusPatch({}, { deleteStatus: 'removing' })?.previewDelete, 'removing');
    const cleared = previewStatusPatch(
      { previewBuild: 'failed', previewBuildAttempt: 2, previewBuildAt: 5 },
      { build: 'ready' },
    );
    assert.equal(cleared?.previewBuild, undefined);
    assert.equal('previewBuild' in (cleared ?? {}), true);
  });

  it('refuses preview retry until the GitHub and Vercel tokens exist', () => {
    assert.equal(reviewPreviewRetryReady({}), false);
    assert.equal(reviewPreviewRetryReady({ githubToken: 'gh', vercelToken: null }), false);
    assert.equal(reviewPreviewRetryReady({ githubToken: 'gh', vercelToken: 'vc' }), true);
    const source = readFileSync(new URL('../milestones.ts', import.meta.url), 'utf8');
    const retry = source.slice(source.indexOf('export const retryReviewPreview'), source.indexOf('export const reviewForStaff'));
    assert.match(retry, /RETRY_WAITS_ON_TOKENS/);
    assert.match(retry, /retryActorAllowed\(ctx\.identity\.email\)/);
    assert.ok(retry.indexOf('retryActorAllowed') < retry.indexOf('ctx.db.patch'));
    assert.ok(retry.indexOf('RETRY_WAITS_ON_TOKENS') < retry.indexOf('ctx.db.patch'));
  });
});
