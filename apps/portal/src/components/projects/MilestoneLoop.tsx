'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { buildTaskState, FEED_LABEL, type AgentEventType, type RunTool } from '@convex/_lib/agentRun';
import type { MilestoneRoadmapView } from '@convex/_lib/milestones';
import { userFacingErrorMessage } from '@convex/_lib/userFacingError';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { useMaxWidth } from '@/lib/design/useMaxWidth';
import { UPDATED_STAMP_TICK_MS, updatedStampText } from '@/lib/data/updatedStamp';
import { feedTime } from './MilestoneRunFeed';
import type { ChecklistActions } from './MilestoneChecklist';

export const LOOP_AWAITING = 'Move to Awaiting Go';
export const LOOP_TRY = 'Try again';
export const LOOP_RETRY = 'Retry';
export const LOOP_GENERATING_REASON = 'Tasks are still being drafted.';
export const LOOP_EMPTY_REASON = 'Add at least one task before moving to Awaiting Go.';
export const LOOP_FAILED_REASON = 'Tasks couldn’t be drafted. Try again, or add a task yourself.';
export const LOOP_ADD = 'Add a task to this milestone';
export const LOOP_ADD_HINT = '↵ to add · Manual';
/** Frame copy for fixture captures only. A live milestone shows its real time through `UpdatedStamp`. */
export const LOOP_UPDATED = 'Updated just now';
export const LOOP_DRAFTS = 'All drafts · editable';
export const LOOP_DRAFT = 'DRAFT';

export type LoopKind = 'generating' | 'drafted' | 'empty' | 'failed' | 'building' | 'cursor' | 'blocked';

export type LoopTask = {
  id: string;
  order: number;
  title: string;
  meta?: string;
  metaTone?: 'muted' | 'danger';
  draft?: boolean;
  editing?: boolean;
  /** Done while Building. The title reads muted. */
  done?: boolean;
  /** The task the agent is on now. A blue mark leads the row. */
  current?: boolean;
};

export type LoopEvent = { time: string; type: string; summary: string };

export type LoopModel = {
  kind: LoopKind;
  eyebrow: string;
  eyebrowTone: 'muted' | 'danger';
  heading: string;
  body: string;
  released?: string;
  progress?: string;
  agentLine?: string;
  prLabel?: string;
  prUrl?: string;
  branchLine?: string;
  events?: LoopEvent[];
  tasks: LoopTask[];
  taskSummary?: string;
  showTasks: boolean;
  addTask: boolean;
  /** "↵ to add · Manual" beside the add field. Drafted and failed show it. Empty does not. */
  addHint?: boolean;
  awaiting: 'hidden' | 'enabled' | 'disabled';
  awaitingReason?: string;
  tryAgain: boolean;
  retry: boolean;
  /** Page subtitle without the desktop-only stamp. */
  subtitle?: string;
  /** Shown after the subtitle at 1440. Omitted at 390. */
  desktopStamp?: string;
};

const TITLES = [
  'Design project overview',
  'Design milestone detail',
  'Approve responsive layout',
  'Build milestone overview',
  'Connect resource links',
  'Outline run feed copy',
] as const;

const CLAUDE_EVENTS: LoopEvent[] = [
  { time: '11:42 AM', type: 'RUN', summary: 'Run started · task 04 Build milestone overview · peter-mbp · Claude Code' },
  { time: '11:31 AM', type: 'COMMIT', summary: 'Commit 91ae3c0 · Approve responsive layout · pushed to milestone/client-experience-launch' },
  { time: '11:18 AM', type: 'TOOL', summary: 'Edited MilestoneReview.tsx · ran 14 tests · all passed' },
];

const CURSOR_EVENTS: LoopEvent[] = [
  { time: '11:42 AM', type: 'RUN', summary: 'Run started · task 04 Build milestone overview · Cursor cloud agent' },
  CLAUDE_EVENTS[1],
  CLAUDE_EVENTS[2],
];

function numbered(titles: readonly string[], map: (title: string, index: number) => LoopTask): LoopTask[] {
  return titles.map((title, index) => map(title, index));
}

/** Frame copy for a fixture capture. Apostrophes and quotes are typographic, as in the frames. */
export function fixtureLoopModel(kind: string): LoopModel | null {
  const tasks = numbered(TITLES, (title, index) => ({ id: `loop-${index + 1}`, order: index + 1, title }));
  if (kind === 'generating') {
    return {
      kind: 'generating',
      eyebrow: 'PLANNING',
      eyebrowTone: 'muted',
      heading: 'Drafting tasks',
      body: 'A planning run is reading the milestone details and the repository. You can keep reading the brief while tasks are prepared.',
      progress: 'Planning run in progress',
      tasks: [],
      showTasks: false,
      addTask: false,
      awaiting: 'disabled',
      awaitingReason: LOOP_GENERATING_REASON,
      tryAgain: false,
      retry: false,
      subtitle: 'Milestone · Drafting tasks',
      desktopStamp: LOOP_UPDATED,
    };
  }
  if (kind === 'drafted') {
    return {
      kind: 'drafted',
      eyebrow: 'PLANNING',
      eyebrowTone: 'muted',
      heading: '6 drafted tasks',
      body: 'Review and edit the drafted tasks, then move this milestone to Awaiting Go.',
      tasks: tasks.map((task, index) => ({ ...task, draft: true, editing: index === 3 })),
      taskSummary: LOOP_DRAFTS,
      showTasks: true,
      addTask: true,
      addHint: true,
      awaiting: 'enabled',
      tryAgain: false,
      retry: false,
      subtitle: 'Milestone · 6 drafted tasks',
      desktopStamp: LOOP_UPDATED,
    };
  }
  if (kind === 'empty') {
    return {
      kind: 'empty',
      eyebrow: 'PLANNING',
      eyebrowTone: 'muted',
      heading: 'No tasks were drafted',
      body: 'The planning run finished without adding any tasks. Add a task yourself, or try drafting again.',
      tasks: [],
      showTasks: false,
      addTask: true,
      awaiting: 'disabled',
      awaitingReason: LOOP_EMPTY_REASON,
      tryAgain: true,
      retry: false,
      subtitle: 'Milestone · No tasks yet',
      desktopStamp: LOOP_UPDATED,
    };
  }
  if (kind === 'failed') {
    return {
      kind: 'failed',
      eyebrow: 'PLANNING',
      eyebrowTone: 'danger',
      heading: 'Couldn’t draft tasks',
      body: 'The milestone and its details are unchanged. Try again, or add a task yourself.',
      tasks: [],
      showTasks: false,
      // The frame has no add field. Product Design Lead's call: the card says "add a task yourself", so it gets the drafted one.
      addTask: true,
      addHint: true,
      awaiting: 'disabled',
      awaitingReason: LOOP_FAILED_REASON,
      tryAgain: true,
      retry: false,
      subtitle: 'Milestone · Couldn’t draft tasks',
      desktopStamp: LOOP_UPDATED,
    };
  }
  if (kind === 'building' || kind === 'cursor') {
    const cursor = kind === 'cursor';
    const commits = ['4c1e9aa', '7d02b1f', '91ae3c0'];
    return {
      kind: cursor ? 'cursor' : 'building',
      eyebrow: 'BUILDING',
      eyebrowTone: 'muted',
      heading: '3 of 6 tasks done',
      body: 'Now building: Build milestone overview',
      agentLine: cursor ? 'Running with Cursor cloud agent' : 'Running with Claude Code (on Peter’s Mac) · peter-mbp',
      prLabel: 'Open pull request · PR #152',
      prUrl: 'https://github.com/warehauscollective/warehaus/pull/152',
      branchLine: cursor
        ? 'milestone/client-experience-launch · Cursor cloud agent'
        : 'milestone/client-experience-launch · peter-mbp · Claude Code',
      events: cursor ? CURSOR_EVENTS : CLAUDE_EVENTS,
      tasks: tasks.map((task, index) => {
        if (index < 3) return { ...task, meta: `Done · ${commits[index]}`, done: true };
        if (index === 3) return { ...task, meta: cursor ? 'In progress · Cursor' : 'In progress · peter-mbp', current: true };
        return { ...task, meta: 'To do' };
      }),
      taskSummary: '3 done · 1 in progress · 2 to do',
      showTasks: true,
      addTask: false,
      awaiting: 'hidden',
      tryAgain: false,
      retry: false,
      subtitle: 'Milestone · 3 of 6 tasks done',
      desktopStamp: LOOP_UPDATED,
    };
  }
  if (kind === 'blocked') {
    return {
      kind: 'blocked',
      eyebrow: 'BUILDING · BLOCKED',
      eyebrowTone: 'danger',
      heading: 'The run is blocked',
      body: 'The Claude Code runner on peter-mbp stopped responding while building “Build milestone overview.”',
      released: 'Released Nov 22, 4:10 PM ET, after it was stuck for 10 minutes.',
      prLabel: 'Open pull request · PR #152',
      prUrl: 'https://github.com/warehauscollective/warehaus/pull/152',
      branchLine: 'milestone/client-experience-launch · last seen 4:00 PM ET',
      tasks: tasks.map((task, index) => {
        if (index < 3) return { ...task, meta: `Done · ${['4c1e9aa', '7d02b1f', '91ae3c0'][index]}`, done: true };
        if (index === 3) return { ...task, meta: 'Blocked · runner stopped responding', metaTone: 'danger' };
        return { ...task, meta: 'To do' };
      }),
      taskSummary: '3 done · 1 blocked · 2 to do',
      showTasks: true,
      addTask: false,
      awaiting: 'hidden',
      tryAgain: false,
      retry: true,
      subtitle: 'Milestone · Run blocked',
      desktopStamp: LOOP_UPDATED,
    };
  }
  return null;
}

const card: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '28px 32px',
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
};

const primary: CSSProperties = {
  background: 'var(--accent)',
  color: 'var(--accent-fg)',
  border: 0,
  borderRadius: 9,
  fontSize: 14,
  fontWeight: 500,
  lineHeight: '21px',
  height: 42,
  padding: '0 16px',
  cursor: 'pointer',
};

const outline: CSSProperties = {
  background: 'transparent',
  color: 'var(--fg)',
  border: '1px solid var(--border-2)',
  borderRadius: 9,
  fontSize: 14,
  fontWeight: 500,
  lineHeight: '21px',
  height: 44,
  padding: '0 16px',
  cursor: 'pointer',
};

function reasonId(testId: string): string {
  return `${testId}-reason`;
}

function DisabledPrimary({ label, reason, testId }: { label: string; reason: string; testId: string }) {
  const id = reasonId(testId);
  return (
    <span tabIndex={0} aria-disabled="true" aria-describedby={id} title={reason} style={{ display: 'inline-flex', cursor: 'not-allowed' }}>
      <button type="button" disabled tabIndex={-1} data-testid={testId} style={{ ...primary, opacity: 0.4, cursor: 'not-allowed' }}>
        {label}
      </button>
    </span>
  );
}

function SkeletonRows() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
      {[0, 1, 2].map((row) => (
        <div key={row} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '6px 0' }}>
          <span style={{ width: 28, height: 10, borderRadius: 4, background: 'var(--muted)' }} />
          <span style={{ flex: 1, height: 10, borderRadius: 4, background: 'var(--muted)' }} />
          <span style={{ width: 72, height: 10, borderRadius: 4, background: 'var(--muted)' }} />
        </div>
      ))}
    </div>
  );
}

/** Inline edit ring. A literal blue border, with the browser focus outline off so it cannot paint as --fg. */
const editField: CSSProperties = {
  flex: 1,
  minWidth: 0,
  border: '2px solid #3b82f6',
  borderRadius: 4,
  outline: 'none',
  boxShadow: 'none',
  background: 'transparent',
  color: 'var(--fg)',
  fontSize: 14,
  lineHeight: '21px',
  padding: '4px 8px',
};

/**
 * Staff loop card for Planning and Building. Retry is the only blocked action.
 * Ready to Ship stays with the runner.
 */
export function MilestoneLoopView({
  model,
  busy,
  onAwaiting,
  onTryAgain,
  onRetry,
  onAdd,
  onRename,
}: {
  model: LoopModel;
  busy?: boolean;
  onAwaiting?: () => void;
  onTryAgain?: () => void;
  onRetry?: () => void;
  onAdd?: (title: string) => void;
  onRename?: (id: string, title: string) => void;
}) {
  const phone = useMaxWidth(767);
  const [adding, setAdding] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const awaitingReason = model.awaitingReason ?? '';
  return (
    <div className="flex flex-col gap-6" data-testid="milestone-loop" data-loop={model.kind}>
      <section style={phone ? { ...card, padding: 20 } : card}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p className="ds-mono" style={{ margin: 0, fontSize: 12, lineHeight: '18px', fontWeight: 500, color: model.eyebrowTone === 'danger' ? 'var(--danger)' : 'var(--muted)' }}>
            {model.eyebrow}
          </p>
          <h2 style={{ margin: 0, fontSize: 20, lineHeight: '28px', fontWeight: 600 }}>{model.heading}</h2>
          <p style={{ margin: 0, fontSize: 14, lineHeight: '21px', color: 'var(--muted)' }}>{model.body}</p>
          {model.released ? <p style={{ margin: 0, fontSize: 14, lineHeight: '21px' }}>{model.released}</p> : null}
          {model.agentLine ? <p style={{ margin: 0, fontSize: 14, lineHeight: '21px', fontWeight: 500 }}>{model.agentLine}</p> : null}
        </div>
        {model.progress ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ margin: 0, fontSize: 14, lineHeight: '21px', fontWeight: 500 }}>{model.progress}</p>
            <div style={{ height: 4, borderRadius: 2, background: 'var(--muted)' }}>
              <div style={{ width: 120, height: 4, borderRadius: 2, background: '#3b82f6' }} />
            </div>
            <SkeletonRows />
          </div>
        ) : null}
        {model.prLabel ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {model.prUrl ? (
              <a href={model.prUrl} style={{ fontSize: 14, lineHeight: '21px', fontWeight: 500, color: '#3b82f6' }}>
                {model.prLabel}
              </a>
            ) : (
              <p style={{ margin: 0, fontSize: 14, lineHeight: '21px', fontWeight: 500, color: '#3b82f6' }}>{model.prLabel}</p>
            )}
            {model.branchLine ? (
              <p className="ds-mono" style={{ margin: 0, fontSize: 11, lineHeight: '17px', color: 'var(--muted)' }}>
                {model.branchLine}
              </p>
            ) : null}
          </div>
        ) : null}
        {model.events && model.events.length > 0 ? (
          <div>
            <p className="ds-mono" style={{ margin: 0, fontSize: 11, lineHeight: '17px', color: 'var(--muted)' }}>
              LATEST FROM THE RUN
            </p>
            {model.events.map((event) => (
              <div
                key={`${event.time}-${event.type}`}
                style={{ display: 'flex', gap: 16, padding: '10px 0', alignItems: 'flex-start' }}
              >
                <div className="ds-mono" style={{ display: 'flex', gap: 10, color: 'var(--muted)', flex: '0 0 auto' }}>
                  <span style={{ width: 68, fontSize: 11, lineHeight: '21px' }}>{event.time}</span>
                  <span style={{ width: 72, fontSize: 10, lineHeight: '21px' }}>{event.type}</span>
                </div>
                <p style={{ margin: 0, flex: 1, minWidth: 0, fontSize: 14, lineHeight: '21px', overflowWrap: 'anywhere' }}>{event.summary}</p>
              </div>
            ))}
          </div>
        ) : null}
        {model.awaiting !== 'hidden' || model.tryAgain || model.retry ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              {model.tryAgain ? (
                <button type="button" data-testid="milestone-try-again" disabled={busy} onClick={onTryAgain} style={outline}>
                  {LOOP_TRY}
                </button>
              ) : null}
              {model.awaiting === 'enabled' ? (
                <button type="button" data-testid="milestone-awaiting" disabled={busy} onClick={onAwaiting} style={primary}>
                  {LOOP_AWAITING}
                </button>
              ) : null}
              {model.awaiting === 'disabled' ? (
                <DisabledPrimary label={LOOP_AWAITING} reason={awaitingReason} testId="milestone-awaiting" />
              ) : null}
              {model.retry ? (
                <button type="button" data-testid="milestone-retry" disabled={busy} onClick={onRetry} style={primary}>
                  {LOOP_RETRY}
                </button>
              ) : null}
            </div>
            {model.awaiting === 'disabled' ? (
              <p id={reasonId('milestone-awaiting')} style={{ margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>
                {awaitingReason}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
      {model.showTasks || model.addTask ? (
        <section
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: phone ? 20 : '20px 24px' }}
          data-testid="milestone-loop-tasks"
        >
          {model.showTasks ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingBottom: 12 }}>
              <p className="ds-mono" style={{ margin: 0, fontSize: 11, lineHeight: '17px', color: 'var(--muted)' }}>
                {`TASKS · ${model.tasks.length}`}
              </p>
              {model.taskSummary ? (
                <p className="ds-mono" style={{ margin: 0, fontSize: 11, lineHeight: '17px', color: 'var(--muted)' }}>
                  {model.taskSummary}
                </p>
              ) : null}
            </div>
          ) : null}
          {model.tasks.map((task) => {
            const open = editing === task.id || task.editing;
            return (
              <div key={task.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '14px 0' }}>
                {task.current ? (
                  <span
                    aria-hidden="true"
                    data-testid="milestone-loop-current"
                    style={{ flex: '0 0 auto', width: 6, height: 6, borderRadius: 3, background: '#3b82f6' }}
                  />
                ) : null}
                <span className="ds-mono" style={{ flex: '0 0 auto', fontSize: 11, lineHeight: '17px', color: 'var(--muted)', minWidth: 14 }}>
                  {String(task.order).padStart(2, '0')}
                </span>
                {open && onRename ? (
                  <input
                    autoFocus
                    aria-label="Task title"
                    value={editing === task.id ? draft : task.title}
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={() => {
                      if (editing === task.id && draft.trim() && draft.trim() !== task.title) onRename(task.id, draft.trim());
                      setEditing(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        if (draft.trim()) onRename(task.id, draft.trim());
                        setEditing(null);
                      }
                    }}
                    style={editField}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (!onRename) return;
                      setEditing(task.id);
                      setDraft(task.title);
                    }}
                    style={
                      task.editing
                        ? { ...editField, textAlign: 'left', cursor: onRename ? 'text' : 'default' }
                        : {
                            flex: 1,
                            textAlign: 'left',
                            background: 'none',
                            border: 0,
                            borderRadius: 4,
                            color: task.done ? 'var(--muted)' : 'var(--fg)',
                            fontSize: 14,
                            lineHeight: '21px',
                            padding: 0,
                            cursor: onRename ? 'text' : 'default',
                          }
                    }
                  >
                    {task.title}
                  </button>
                )}
                {task.draft ? (
                  <span className="ds-mono" style={{ fontSize: 10, lineHeight: '15px', fontWeight: 500, color: '#000', background: 'rgba(0, 0, 0, 0.16)', borderRadius: 4, padding: '2px 6px' }}>
                    {LOOP_DRAFT}
                  </span>
                ) : null}
                {task.meta ? (
                  <span className="ds-mono" style={{ fontSize: 11, lineHeight: '17px', color: task.metaTone === 'danger' ? 'var(--danger)' : 'var(--muted)', marginLeft: 'auto' }}>
                    {task.meta}
                  </span>
                ) : null}
              </div>
            );
          })}
          {model.addTask ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const title = adding.trim();
                if (!title || !onAdd) return;
                onAdd(title);
                setAdding('');
              }}
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '12px 14px',
                color: 'var(--muted)',
              }}
            >
              <span style={{ flex: '0 0 auto', fontSize: 14 }}>+</span>
              <span style={{ position: 'relative', flex: '1 1 auto', minWidth: 0 }}>
                <span
                  aria-hidden="true"
                  style={{
                    display: 'block',
                    visibility: adding ? 'hidden' : 'visible',
                    whiteSpace: 'normal',
                    overflowWrap: 'anywhere',
                    fontSize: 14,
                    lineHeight: '21px',
                    color: 'var(--muted)',
                  }}
                >
                  {LOOP_ADD}
                </span>
                <input
                  aria-label={LOOP_ADD}
                  value={adding}
                  onChange={(event) => setAdding(event.target.value)}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    border: 0,
                    padding: 0,
                    background: 'transparent',
                    color: 'var(--fg)',
                    fontSize: 14,
                    lineHeight: '21px',
                    outline: 'none',
                  }}
                />
              </span>
              {model.addHint ? (
                <span className="ds-mono" data-testid="milestone-loop-add-hint" style={{ flex: '0 0 auto', fontSize: 11, lineHeight: '17px', whiteSpace: 'nowrap' }}>
                  {LOOP_ADD_HINT}
                </span>
              ) : null}
            </form>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

type Progress = {
  agent: RunTool;
  agentLabel: string;
  planningBlockedReason: string | null;
  branch: string | null;
  prUrl: string | null;
  run: { status: string; tool: string; blockedReason: string | null; runnerId: string; endedAt: number | null; lastSeenAt: number | null } | null;
  tasks: { id: string; order: number; title: string; state: string; commit: string | null; blockedReason: string | null }[];
  events: { id: string; type: string; summary: string; at: number }[];
};

function releasedStamp(at: number): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(at));
}

function prNumber(url: string | null | undefined): string | null {
  const match = url ? /\/pull\/(\d+)/.exec(url) : null;
  return match ? match[1] : null;
}

export function liveLoopModel(milestone: MilestoneRoadmapView, progress: Progress | null): LoopModel | null {
  const rows = milestone.rows.flatMap((row) => [row, ...row.children]);
  const planning = milestone.planning;
  let kind: LoopKind | null = null;
  if (milestone.status === 'Planning') {
    if (planning === 'queued' || planning === 'running') kind = 'generating';
    else if (planning === 'blocked') kind = 'failed';
    else kind = rows.length === 0 ? 'empty' : 'drafted';
  } else if (milestone.status === 'Building') {
    const blocked = rows.some((row) => row.blockedReason) || progress?.run?.status === 'failed' || progress?.run?.blockedReason;
    kind = blocked ? 'blocked' : 'building';
  }
  if (!kind) return null;
  if (kind === 'generating' || kind === 'empty' || kind === 'failed' || kind === 'drafted') {
    const base = fixtureLoopModel(kind);
    if (!base) return null;
    if (kind !== 'drafted') return { ...base, desktopStamp: undefined };
    const tasks = rows.map((row, index) => ({
      id: row.id,
      order: index + 1,
      title: row.name,
      draft: true,
    }));
    const drafted = `${tasks.length} drafted ${tasks.length === 1 ? 'task' : 'tasks'}`;
    return {
      ...base,
      desktopStamp: undefined,
      heading: drafted,
      subtitle: `Milestone · ${drafted}`,
      tasks,
      awaiting: tasks.length > 0 ? 'enabled' : 'disabled',
      awaitingReason: tasks.length > 0 ? undefined : LOOP_EMPTY_REASON,
    };
  }
  const agent = progress?.agent ?? 'claude_code';
  const cursor = agent === 'cursor';
  const runner = progress?.run?.runnerId;
  const current = progress?.tasks.find((task) => task.state === 'in_progress' || task.state === 'claimed') ?? progress?.tasks.find((task) => task.state === 'blocked');
  const done = (progress?.tasks ?? []).filter((task) => task.state === 'done').length;
  const total = progress?.tasks.length || rows.length;
  const blockedTask = (progress?.tasks ?? []).find((task) => task.state === 'blocked' || task.blockedReason);
  const number = prNumber(progress?.prUrl ?? milestone.prUrl);
  const branch = progress?.branch ?? milestone.branch;
  const tasks = (progress?.tasks ?? rows.map((row, index) => ({
    id: row.id,
    order: index + 1,
    title: row.name,
    state: buildTaskState(row),
    commit: row.commit ?? null,
    blockedReason: row.blockedReason ?? null,
  }))).map((task) => {
    if (task.state === 'done') return { id: task.id, order: task.order, title: task.title, meta: task.commit ? `Done · ${task.commit}` : 'Done', done: true };
    if (task.state === 'blocked') return { id: task.id, order: task.order, title: task.title, meta: `Blocked · ${task.blockedReason || 'the run stopped'}`, metaTone: 'danger' as const };
    if (task.state === 'in_progress' || task.state === 'claimed') {
      return { id: task.id, order: task.order, title: task.title, meta: cursor ? 'In progress · Cursor' : `In progress${runner ? ` · ${runner}` : ''}`, current: true };
    }
    return { id: task.id, order: task.order, title: task.title, meta: 'To do' };
  });
  const blockedCount = tasks.filter((task) => task.metaTone === 'danger').length;
  const activeCount = tasks.filter((task) => task.meta?.startsWith('In progress')).length;
  const todoCount = tasks.filter((task) => task.meta === 'To do').length;
  if (kind === 'blocked') {
    const who = cursor ? 'Cursor cloud agent' : `Claude Code runner${runner ? ` on ${runner}` : ''}`;
    const name = blockedTask?.title ?? current?.title ?? 'a task';
    const reason = blockedTask?.blockedReason || progress?.run?.blockedReason || milestone.planningBlockedReason;
    return {
      kind: 'blocked',
      eyebrow: 'BUILDING · BLOCKED',
      eyebrowTone: 'danger',
      heading: 'The run is blocked',
      body: reason && !/went quiet/i.test(reason) ? reason : `The ${who} stopped responding while building “${name}.”`,
      released: progress?.run?.endedAt ? `Released ${releasedStamp(progress.run.endedAt)}.` : undefined,
      prLabel: number ? `Open pull request · PR #${number}` : undefined,
      prUrl: progress?.prUrl ?? milestone.prUrl ?? undefined,
      branchLine: [branch, progress?.run?.lastSeenAt ? `last seen ${feedTime(progress.run.lastSeenAt)} ET` : null].filter(Boolean).join(' · ') || undefined,
      tasks,
      taskSummary: `${done} done · ${blockedCount} blocked · ${todoCount} to do`,
      showTasks: tasks.length > 0,
      addTask: false,
      awaiting: 'hidden',
      tryAgain: false,
      retry: true,
      subtitle: 'Milestone · Run blocked',
    };
  }
  return {
    kind: 'building',
    eyebrow: 'BUILDING',
    eyebrowTone: 'muted',
    heading: `${done} of ${total} tasks done`,
    body: current ? `Now building: ${current.title}` : 'Waiting for the next task.',
    agentLine: cursor ? 'Running with Cursor cloud agent' : `Running with Claude Code (on Peter’s Mac)${runner ? ` · ${runner}` : ''}`,
    prLabel: number ? `Open pull request · PR #${number}` : undefined,
    prUrl: progress?.prUrl ?? milestone.prUrl ?? undefined,
    branchLine: [branch, runner && !cursor ? runner : null, cursor ? 'Cursor cloud agent' : agent === 'claude_code' ? 'Claude Code' : null].filter(Boolean).join(' · ') || undefined,
    events: (progress?.events ?? []).slice(0, 3).map((event) => ({
      time: feedTime(event.at),
      type: event.type in FEED_LABEL ? FEED_LABEL[event.type as AgentEventType] : event.type.toUpperCase(),
      summary: event.summary,
    })),
    tasks,
    taskSummary: `${done} done · ${activeCount} in progress · ${blockedCount} blocked · ${todoCount} to do`.replace(' · 0 blocked', ''),
    showTasks: tasks.length > 0,
    addTask: false,
    awaiting: 'hidden',
    tryAgain: false,
    retry: false,
    subtitle: `Milestone · ${done} of ${total} tasks done`,
  };
}

/** Desktop reading of the page subtitle, including the 1440 stamp when the frame has one. */
export function loopSubtitle(model: LoopModel | null): string | null {
  if (!model?.subtitle) return null;
  return model.desktopStamp ? `${model.subtitle} · ${model.desktopStamp}` : model.subtitle;
}

/**
 * "Updated 5m ago" from a real time. Renders nothing on the server and on the
 * first client render, then reads the clock after mount, so the two renders
 * match. Re-reads once a minute. Shown from 1024px up, hidden at 390.
 */
export function UpdatedStamp({ at }: { at: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), UPDATED_STAMP_TICK_MS);
    return () => clearInterval(timer);
  }, []);
  const text = now == null ? null : updatedStampText(at, now);
  if (!text) return null;
  return (
    <span className="portal-detail-stamp" data-testid="milestone-updated-stamp">
      {` · ${text}`}
    </span>
  );
}

/**
 * The subtitle, with the stamp in a span that shows only from 1024px up.
 * `stamp` is fixed frame copy for a fixture capture. `updatedAt` is a live
 * milestone's real last-change time.
 */
export function loopSubtitleLine(text: string, stamp?: string, updatedAt?: number | null): ReactNode {
  if (stamp) {
    return (
      <>
        {text}
        <span className="portal-detail-stamp">{` · ${stamp}`}</span>
      </>
    );
  }
  if (typeof updatedAt !== 'number') return text;
  return (
    <>
      {text}
      <UpdatedStamp at={updatedAt} />
    </>
  );
}

export type LoopPageSubtitle = { text: string; updatedAt?: number };

/**
 * Page subtitle for a live milestone, "Milestone · [status]", and the time it
 * last changed. Fixture captures use the frame line instead.
 */
export function milestoneLoopSubtitle(milestone: MilestoneRoadmapView): LoopPageSubtitle | null {
  const rows = milestone.rows.flatMap((row) => [row, ...row.children]);
  const stamp = typeof milestone.updatedAt === 'number' ? { updatedAt: milestone.updatedAt } : {};
  if (milestone.status === 'Planning') {
    if (milestone.planning === 'queued' || milestone.planning === 'running') return { text: 'Milestone · Drafting tasks', ...stamp };
    if (milestone.planning === 'blocked') return { text: 'Milestone · Couldn’t draft tasks', ...stamp };
    if (rows.length === 0) return { text: 'Milestone · No tasks yet', ...stamp };
    const drafted = `${rows.length} drafted ${rows.length === 1 ? 'task' : 'tasks'}`;
    return { text: `Milestone · ${drafted}`, ...stamp };
  }
  if (milestone.status === 'Building') {
    if (rows.some((row) => row.blockedReason)) return { text: 'Milestone · Run blocked', ...stamp };
    return { text: `Milestone · ${milestone.doneCount} of ${rows.length} tasks done`, ...stamp };
  }
  return null;
}

export function MilestoneLoopLive({
  milestone,
  staff,
  fixtures,
  hostSlug,
  actions,
  onStatus,
  loopPreview = null,
}: {
  milestone: MilestoneRoadmapView;
  staff: boolean;
  fixtures: boolean;
  hostSlug?: string;
  actions?: ChecklistActions;
  onStatus?: (status: 'Awaiting Go') => void;
  /** Fixture capture. Set after mount from `?loop=`. */
  loopPreview?: string | null;
}) {
  const fixture = loopPreview ? fixtureLoopModel(loopPreview) : null;
  const live = useSafeQuery<Progress | null>(
    api.agent.buildingProgress,
    staff && !fixtures && !fixture && (milestone.status === 'Building' || milestone.status === 'Planning')
      ? { milestoneId: milestone.id as Id<'milestones'>, hostSlug }
      : 'skip',
  );
  const regenerate = useMutation(api.agent.regeneratePlan);
  const retry = useMutation(api.agent.retryBlocked);
  const setStatus = useMutation(api.milestones.setStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!staff) return null;
  const model = fixture ?? (fixtures ? null : liveLoopModel(milestone, live.data ?? null));
  if (!model) return null;
  const run = (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    void work()
      .catch((caught: unknown) => setError(userFacingErrorMessage(caught, "Couldn't update the milestone.")))
      .finally(() => setBusy(false));
  };
  const blocked = model.tasks.find((task) => task.metaTone === 'danger');
  return (
    <>
      <MilestoneLoopView
        model={model}
        busy={busy}
        onAwaiting={() => {
          if (fixtures) {
            onStatus?.('Awaiting Go');
            return;
          }
          run(() => setStatus({ hostSlug, milestoneId: milestone.id as Id<'milestones'>, status: 'Awaiting Go', expectedStatus: 'Planning' }));
        }}
        onTryAgain={() => {
          if (fixtures) return;
          run(() => regenerate({ hostSlug, milestoneId: milestone.id as Id<'milestones'> }));
        }}
        onRetry={() => {
          if (fixtures) return;
          run(() =>
            retry({
              hostSlug,
              milestoneId: milestone.id as Id<'milestones'>,
              ...(blocked ? { taskId: blocked.id as Id<'tasks'> } : {}),
            }),
          );
        }}
        onAdd={
          actions
            ? (title) => {
                if (fixtures) return;
                run(() => actions.addTask({ hostSlug, milestoneId: milestone.id as Id<'milestones'>, title }));
              }
            : undefined
        }
        onRename={
          actions
            ? (id, title) => {
                if (fixtures) return;
                run(() => actions.editTask({ hostSlug, milestoneId: milestone.id as Id<'milestones'>, taskId: id as Id<'tasks'>, title }));
              }
            : undefined
        }
      />
      {error ? <p style={{ margin: 0, fontSize: 13, color: 'var(--danger)' }}>{error}</p> : null}
    </>
  );
}
