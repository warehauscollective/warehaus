'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { RERUN_ANSWER_LIMIT, RERUN_ANSWER_REQUIRED } from '@convex/_lib/agentRun';
import {
  CAUSE_LABELS,
  FIX_ANSWER,
  FIX_RERUN,
  FIX_STOP,
  RUNNING_LABEL,
  causeTone,
  runningLine,
  type TroubleshootView,
} from '@convex/_lib/troubleshoot';
import { userFacingErrorMessage } from '@convex/_lib/userFacingError';
import { feedTime } from '@/components/projects/MilestoneRunFeed';
import { PrimaryButton } from '@/components/ui/primitives';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { CauseLabel } from './TaskBoard';
import { TaskGlyph } from './TaskGlyph';
import { takeTroubleshootFocus } from './troubleshootFocus';

/** Copy from docs/design/run-troubleshooting.md, character for character. */
export const TROUBLESHOOT_TITLE = 'TROUBLESHOOT';
export const TROUBLESHOOT_STAFF = 'Staff only';
export const ANSWER_PLACEHOLDER = 'Your answer';
export const ANSWER_HINT = "Your answer goes into the next run's prompt.";
export const STOP_HINT = 'Commits already pushed stay on the branch.';
export const LAST_RUN = 'LAST RUN';
export const THIS_RUN = 'THIS RUN';
export const OUTPUT_TITLE = 'OUTPUT · LAST 4 KB';
export const STOP_CONFIRM = {
  title: 'Stop this run?',
  body: 'The runner stops working on this task. Commits it already pushed stay on the branch, and a late result is ignored.',
  cancel: 'Cancel',
  submit: FIX_STOP,
} as const;
export const TROUBLESHOOT_SAVE_ERROR = 'Couldn’t save. Nothing changed.';

const label: CSSProperties = { margin: 0, fontSize: 11, lineHeight: '17px', color: 'var(--muted)' };
const hint: CSSProperties = { margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--muted)' };
const fact: CSSProperties = { margin: 0, fontSize: 12, lineHeight: '18px', overflowWrap: 'anywhere' };

/**
 * `Organism/Troubleshoot` (1352:9984): the cause and reason, the fix, the
 * run's events, a failed run's output, then the branch and last commit. Staff
 * only: a client's task modal never renders it.
 */
export function TroubleshootSection({
  view,
  now,
  busy = false,
  error = null,
  onRerun,
  onAnswer,
  onStop,
}: {
  view: TroubleshootView;
  /** For "last sign of life … ago". */
  now: number;
  busy?: boolean;
  error?: string | null;
  onRerun?: () => void;
  onAnswer?: (answer: string) => void;
  /** Opens the Stop run confirm. */
  onStop?: () => void;
}) {
  const [answer, setAnswer] = useState('');
  const [missing, setMissing] = useState(false);
  const running = view.state === 'running';
  const tone = running ? 'info' : causeTone(view.state as Exclude<TroubleshootView['state'], 'running'>);
  const name = running ? RUNNING_LABEL : CAUSE_LABELS[view.state as Exclude<TroubleshootView['state'], 'running'>];
  const reason = running ? runningLine(view, now) : view.reason;
  const submitAnswer = () => {
    const text = answer.trim();
    if (!text) {
      setMissing(true);
      return;
    }
    setMissing(false);
    onAnswer?.(text);
  };
  return (
    <section data-testid="task-troubleshoot" data-state={view.state} className="flex flex-col" style={{ gap: 12 }}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
          {TROUBLESHOOT_TITLE}
        </h3>
        <span
          className="ds-mono inline-flex items-center"
          data-testid="troubleshoot-staff-only"
          style={{ gap: 6, border: '1px solid var(--border-2)', borderRadius: 999, padding: '2px 8px', fontSize: 12, lineHeight: '18px', color: 'var(--muted)', whiteSpace: 'nowrap' }}
        >
          <TaskGlyph src="/icons/task-lock.svg" size={12} />
          {TROUBLESHOOT_STAFF}
        </span>
      </div>
      <div className="flex flex-col" style={{ gap: 4 }}>
        <CauseLabel label={name} tone={tone} />
        {reason ? (
          <p data-testid="troubleshoot-reason" style={{ margin: 0, fontSize: 14, lineHeight: '21px', overflowWrap: 'anywhere' }}>
            {reason}
          </p>
        ) : null}
      </div>
      {view.state === 'needs_input' ? (
        <form
          className="flex flex-col items-start"
          style={{ gap: 8 }}
          onSubmit={(event) => {
            event.preventDefault();
            submitAnswer();
          }}
        >
          <textarea
            data-testid="troubleshoot-answer"
            aria-label={ANSWER_PLACEHOLDER}
            aria-describedby="troubleshoot-answer-hint"
            aria-invalid={missing || undefined}
            placeholder={ANSWER_PLACEHOLDER}
            value={answer}
            maxLength={RERUN_ANSWER_LIMIT}
            rows={3}
            disabled={busy}
            onChange={(event) => {
              setAnswer(event.target.value);
              if (missing) setMissing(false);
            }}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              minHeight: 84,
              resize: 'vertical',
              background: 'transparent',
              border: `1px solid ${missing ? 'var(--danger)' : 'var(--border-2)'}`,
              borderRadius: 10,
              padding: '10px 12px',
              color: 'var(--fg)',
              font: 'inherit',
              fontSize: 14,
              lineHeight: '21px',
            }}
          />
          <p id="troubleshoot-answer-hint" className="ds-mono" style={hint}>
            {ANSWER_HINT}
          </p>
          {missing ? (
            <p role="alert" style={{ margin: 0, fontSize: 13, lineHeight: '20px', color: 'var(--danger-text)' }}>
              {RERUN_ANSWER_REQUIRED}
            </p>
          ) : null}
          <PrimaryButton type="submit" testId="troubleshoot-fix" height={40} paddingInline={16} disabled={busy}>
            {FIX_ANSWER}
          </PrimaryButton>
        </form>
      ) : null}
      {view.state === 'failed' || view.state === 'stalled' ? (
        <div>
          <PrimaryButton testId="troubleshoot-fix" height={40} paddingInline={16} disabled={busy} onClick={onRerun}>
            {FIX_RERUN}
          </PrimaryButton>
        </div>
      ) : null}
      {running && view.canStop ? (
        <div className="flex flex-col items-start" style={{ gap: 8 }}>
          <button
            type="button"
            data-testid="troubleshoot-stop"
            data-tone="danger"
            disabled={busy}
            onClick={onStop}
            style={{
              height: 42,
              padding: '0 16px',
              borderRadius: 10,
              border: '1px solid var(--danger)',
              background: 'transparent',
              color: 'var(--danger-text)',
              font: 'inherit',
              fontSize: 14,
              fontWeight: 500,
              whiteSpace: 'nowrap',
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.55 : 1,
            }}
          >
            {FIX_STOP}
          </button>
          <p className="ds-mono" style={hint}>
            {STOP_HINT}
          </p>
        </div>
      ) : null}
      {error ? (
        <p role="alert" data-testid="troubleshoot-error" style={{ margin: 0, fontSize: 13, lineHeight: '20px', color: 'var(--danger-text)' }}>
          {error}
        </p>
      ) : null}
      {view.events.length > 0 ? (
        <div className="flex flex-col" style={{ gap: 6 }}>
          <p className="ds-mono" style={label}>
            {running ? THIS_RUN : LAST_RUN}
          </p>
          <ul data-testid="troubleshoot-events" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {view.events.map((event) => (
              <li key={event.id} style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                <span className="ds-mono" style={{ flex: '0 0 64px', fontSize: 12, lineHeight: '21px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                  {feedTime(event.at)}
                </span>
                <span style={{ flex: '1 1 0', minWidth: 0, fontSize: 14, lineHeight: '21px', overflowWrap: 'anywhere' }}>{event.summary}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {view.output ? (
        <div className="flex flex-col" style={{ gap: 6 }}>
          <p className="ds-mono" style={label}>
            {OUTPUT_TITLE}
          </p>
          <pre
            className="ds-mono"
            data-testid="troubleshoot-output"
            tabIndex={0}
            style={{
              margin: 0,
              background: 'var(--surface-2)',
              borderRadius: 10,
              padding: 12,
              fontSize: 12,
              lineHeight: '17px',
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
              maxHeight: 320,
              overflowY: 'auto',
            }}
          >
            {view.output}
          </pre>
        </div>
      ) : null}
      {view.branch || view.commit ? (
        <dl className="ds-mono" style={{ margin: 0, display: 'grid', gridTemplateColumns: '84px minmax(0, 1fr)', gap: '6px 12px' }}>
          {view.branch ? (
            <>
              <dt style={{ ...fact, color: 'var(--muted)' }}>Branch</dt>
              <dd data-testid="troubleshoot-branch" style={fact}>{view.branch}</dd>
            </>
          ) : null}
          {view.commit ? (
            <>
              <dt style={{ ...fact, color: 'var(--muted)' }}>Last commit</dt>
              <dd data-testid="troubleshoot-commit" style={fact}>{view.commit}</dd>
            </>
          ) : null}
        </dl>
      ) : null}
    </section>
  );
}

/**
 * The live section in the task modal. Staff only: the query is `adminQuery`
 * and a client never mounts this. Reads one task's troubleshoot view and
 * renders nothing when there is none. Stop run asks first, through the
 * modal's own confirm sheet.
 */
export function TaskTroubleshootLive({
  taskId,
  hostSlug,
  onRequestStop,
  stopError = null,
  stopping = false,
}: {
  taskId: string;
  hostSlug?: string;
  onRequestStop: () => void;
  stopError?: string | null;
  stopping?: boolean;
}) {
  const live = useSafeQuery<TroubleshootView | null>(api.agent.taskTroubleshoot, { hostSlug, taskId: taskId as Id<'tasks'> });
  const rerun = useMutation(api.agent.rerunTask);
  const answerAndRerun = useMutation(api.agent.answerAndRerun);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const box = useRef<HTMLDivElement>(null);
  const view = live.data ?? null;
  const running = view?.state === 'running';
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, [running]);
  const shown = view != null;
  useEffect(() => {
    // Answer and rerun on the card opened this task: bring the section into view.
    if (!shown || !takeTroubleshootFocus(taskId)) return;
    box.current?.scrollIntoView({ block: 'center' });
    box.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
  }, [shown, taskId]);
  useEffect(() => setError(null), [taskId, view?.state]);
  if (!view) return null;
  const run = (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    void work()
      .catch((caught: unknown) => setError(userFacingErrorMessage(caught, TROUBLESHOOT_SAVE_ERROR)))
      .finally(() => setBusy(false));
  };
  return (
    <div ref={box}>
      <TroubleshootSection
        view={view}
        now={now}
        busy={busy || stopping}
        error={error ?? stopError}
        onRerun={() => run(() => rerun({ hostSlug, taskId: taskId as Id<'tasks'> }))}
        onAnswer={(answer) => run(() => answerAndRerun({ hostSlug, taskId: taskId as Id<'tasks'>, answer }))}
        onStop={onRequestStop}
      />
    </div>
  );
}
