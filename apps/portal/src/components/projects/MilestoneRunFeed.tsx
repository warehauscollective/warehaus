'use client';

import { useState } from 'react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { FEED_LABEL, FEED_PAGE, feedLimit, runToolLabel, type AgentEventType } from '@convex/_lib/agentRun';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { Panel } from './milestoneChrome';

export const FEED_INTRO = 'Runs, commits and notes for this milestone. Staff only.';
export const FEED_FOOTER = 'Events are short summaries. No secrets, no full logs.';
export const FEED_EMPTY = 'No runs yet';
export const FEED_EMPTY_BODY = 'Events show here once a runner starts work on this milestone.';
export const FEED_PLANNING_QUEUED = 'Waiting for a runner to plan this milestone';
export const FEED_PLANNING_QUEUED_BODY = 'Start the runner on your Mac. It writes the task list from the brief.';
export const FEED_OFFLINE = 'Runner offline';
export const FEED_ERROR = 'The run feed could not load.';
export const FEED_ERROR_BODY = 'Nothing changed. The feed reloads on its own when the connection is back.';

export type RunFeedEvent = { id: string; type: AgentEventType; summary: string; at: number };

export type RunFeedModel = {
  events: RunFeedEvent[];
  hasMore: boolean;
  run: {
    runnerId: string;
    mode: string;
    tool: string;
    status: string;
    kind: string;
    online: boolean;
    lastSeenAt: number | null;
  } | null;
  planning: 'queued' | 'running' | null;
  branch?: string | null;
  prUrl?: string | null;
  /** Open tasks the runner will not take. A person has to close them. */
  waitingOnPerson?: string[];
};

export type RunFeedState = 'loading' | 'error' | 'empty' | 'live' | 'offline' | 'idle';

/** Live means a run is open and its runner called recently. Offline means the run is open and the runner went quiet. */
export function runFeedState(input: { loading: boolean; error: string | null; model: RunFeedModel | null }): RunFeedState {
  if (input.error) return 'error';
  if (input.loading || !input.model) return 'loading';
  if (input.model.events.length === 0) return 'empty';
  const run = input.model.run;
  if (run?.status === 'running') return run.online ? 'live' : 'offline';
  return 'idle';
}

/** Eastern Time, to match the review stamps. */
export function feedTime(at: number): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(at));
}

const mono = { fontSize: 11, lineHeight: '17px', color: 'var(--muted)' } as const;

export function MilestoneRunFeed({
  state,
  model,
  onLoadEarlier,
}: {
  state: RunFeedState;
  model: RunFeedModel | null;
  onLoadEarlier?: () => void;
}) {
  const run = model?.run ?? null;
  const events = model?.events ?? [];
  const head =
    state === 'live' ? 'RUN FEED · LIVE' : state === 'offline' ? `RUN FEED · ${FEED_OFFLINE.toUpperCase()}` : 'RUN FEED';
  return (
    <div className="flex flex-col gap-4" data-testid="milestone-run-feed" data-feed-state={state}>
      <Panel>
        <p style={{ margin: 0, fontSize: 14, lineHeight: '21px', color: 'var(--muted)' }}>{FEED_INTRO}</p>
      </Panel>
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-2" style={{ paddingBottom: 12 }}>
          <p className="ds-mono flex items-center gap-2" style={{ ...mono, margin: 0 }}>
            <span
              aria-hidden
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: state === 'live' ? '#f59e0b' : state === 'offline' || state === 'error' ? 'var(--danger)' : 'var(--border-2)',
              }}
            />
            {head}
          </p>
          {run ? (
            <p className="ds-mono" data-testid="run-feed-runner" style={{ ...mono, margin: 0 }}>
              {`Runner ${run.runnerId} · ${run.mode} · ${runToolLabel(run.tool)}`}
            </p>
          ) : null}
        </div>
        {model?.branch || model?.prUrl ? (
          <p
            className="ds-mono flex flex-wrap items-center gap-x-3 gap-y-1"
            data-testid="run-feed-branch"
            style={{ ...mono, margin: 0, borderTop: '1px solid var(--border)', padding: '10px 0' }}
          >
            {model.branch ? <span style={{ overflowWrap: 'anywhere' }}>{model.branch}</span> : null}
            {model.prUrl ? (
              <a
                href={model.prUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-sm focus-visible:[--tw-outline-style:solid] focus-visible:outline-2 focus-visible:outline-[var(--info)] focus-visible:outline-offset-2"
                style={{ color: 'var(--fg)', textDecoration: 'underline' }}
              >
                {`Pull request #${model.prUrl.split('/').pop() ?? ''}`}
              </a>
            ) : null}
          </p>
        ) : null}
        {model?.waitingOnPerson && model.waitingOnPerson.length > 0 ? (
          <p
            data-testid="run-feed-waiting"
            style={{ margin: 0, borderTop: '1px solid var(--border)', padding: '10px 0', fontSize: 13, lineHeight: '20px', color: 'var(--muted)' }}
          >
            {`Waiting on a person: ${model.waitingOnPerson.join(', ')}. The runner does not take a task that syncs from Notion, so this milestone stays in Building until it is closed.`}
          </p>
        ) : null}
        {state === 'loading' ? (
          <p style={{ margin: 0, borderTop: '1px solid var(--border)', padding: '14px 0', fontSize: 14, color: 'var(--muted)' }}>
            Loading the run feed
          </p>
        ) : null}
        {state === 'error' ? (
          <div role="alert" data-testid="run-feed-error" style={{ borderTop: '1px solid var(--border)', padding: '14px 0' }}>
            <p style={{ margin: 0, fontSize: 14, lineHeight: '21px', color: 'var(--danger-text)' }}>{FEED_ERROR}</p>
            <p style={{ margin: '4px 0 0', fontSize: 13, lineHeight: '20px', color: 'var(--muted)' }}>{FEED_ERROR_BODY}</p>
          </div>
        ) : null}
        {state === 'empty' ? (
          <div data-testid="run-feed-empty" style={{ borderTop: '1px solid var(--border)', padding: '14px 0' }}>
            <p style={{ margin: 0, fontSize: 14, lineHeight: '21px' }}>
              {model?.planning === 'queued' ? FEED_PLANNING_QUEUED : FEED_EMPTY}
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 13, lineHeight: '20px', color: 'var(--muted)' }}>
              {model?.planning === 'queued' ? FEED_PLANNING_QUEUED_BODY : FEED_EMPTY_BODY}
            </p>
          </div>
        ) : null}
        {state === 'offline' && run ? (
          <p
            data-testid="run-feed-offline"
            style={{ margin: 0, borderTop: '1px solid var(--border)', padding: '14px 0', fontSize: 13, lineHeight: '20px', color: 'var(--muted)' }}
          >
            {`${run.runnerId} has not reported for a while. Its open run stays claimed until the runner comes back or ends it.`}
          </p>
        ) : null}
        {events.length > 0 ? (
          <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {events.map((event) => (
              <li
                key={event.id}
                data-testid="run-feed-event"
                data-type={event.type}
                className="flex flex-col gap-1 md:flex-row md:items-baseline md:gap-6"
                style={{ borderTop: '1px solid var(--border)', padding: '14px 0' }}
              >
                <span className="flex items-baseline gap-4 md:w-[142px] md:shrink-0">
                  <time className="ds-mono" dateTime={new Date(event.at).toISOString()} style={{ ...mono, whiteSpace: 'nowrap', width: 60 }}>
                    {feedTime(event.at)}
                  </time>
                  <span
                    className="ds-mono"
                    style={{
                      ...mono,
                      whiteSpace: 'nowrap',
                      ...(event.type === 'blocked' || event.type === 'failed' ? { color: 'var(--danger-text)' } : {}),
                    }}
                  >
                    {FEED_LABEL[event.type]}
                  </span>
                </span>
                <span className="min-w-0" style={{ fontSize: 14, lineHeight: '21px', overflowWrap: 'anywhere' }}>
                  {event.summary}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
        {events.length > 0 ? (
          <div className="flex items-center justify-between gap-3" style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            {model?.hasMore && onLoadEarlier ? (
              <button
                type="button"
                data-testid="run-feed-load-earlier"
                onClick={onLoadEarlier}
                className="rounded-sm focus-visible:[--tw-outline-style:solid] focus-visible:outline-2 focus-visible:outline-[var(--info)] focus-visible:outline-offset-2"
                style={{ background: 'none', border: 0, padding: '6px 0', color: 'var(--fg)', font: 'inherit', fontSize: 14, cursor: 'pointer' }}
              >
                Load earlier
              </button>
            ) : (
              <span />
            )}
            <span className="ds-mono" style={mono}>
              {model?.hasMore ? `Showing ${events.length}` : `Showing all ${events.length}`}
            </span>
          </div>
        ) : null}
      </Panel>
      <p style={{ margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>{FEED_FOOTER}</p>
    </div>
  );
}

const FIXTURE_NOW = Date.UTC(2026, 10, 20, 16, 42);

/** Fixture feed for design QA. `?feed=empty|offline|error` shows the other states. */
export function fixtureRunFeed(view: string | null): { state: RunFeedState; model: RunFeedModel | null } {
  const minute = 60_000;
  const events: RunFeedEvent[] = [
    { id: 'e7', type: 'run', summary: 'Run started · task 05 Apply review feedback · peter-mbp · Claude Code', at: FIXTURE_NOW },
    { id: 'e6', type: 'commit', summary: 'Commit 91ae3c0 · Approve responsive layout · pushed to milestone/client-experience-launch', at: FIXTURE_NOW - 2 * minute },
    { id: 'e5', type: 'tool', summary: 'Edited MilestoneReview.tsx · ran 14 tests · all passed', at: FIXTURE_NOW - 11 * minute },
    { id: 'e4', type: 'blocked', summary: 'Task 06 blocked · needs Figma frame for the mobile summary', at: FIXTURE_NOW - 24 * minute },
    { id: 'e3', type: 'note', summary: 'Peter in Grok Bot: keep the preview link above the fold', at: FIXTURE_NOW - 40 * minute },
    { id: 'e2', type: 'planning', summary: 'Planning run wrote 6 tasks from the brief', at: FIXTURE_NOW - 47 * minute },
    { id: 'e1', type: 'created', summary: 'Milestone created from Grok Bot', at: FIXTURE_NOW - 48 * minute },
  ];
  const run = { runnerId: 'peter-mbp', mode: 'interactive', tool: 'claude_code', status: 'running', kind: 'task', online: true, lastSeenAt: FIXTURE_NOW };
  if (view === 'error') return { state: 'error', model: null };
  if (view === 'empty') return { state: 'empty', model: { events: [], hasMore: false, run: null, planning: null } };
  if (view === 'planning') return { state: 'empty', model: { events: [], hasMore: false, run: null, planning: 'queued' } };
  if (view === 'offline') return { state: 'offline', model: { events, hasMore: true, run: { ...run, online: false }, planning: null } };
  return {
    state: 'live',
    model: {
      events,
      hasMore: true,
      run,
      planning: null,
      branch: 'milestone/client-experience-launch',
      prUrl: 'https://github.com/warehauscollective/warehaus/pull/108',
    },
  };
}

export function MilestoneRunFeedLive({
  milestoneId,
  planning,
  fixtures,
  hostSlug,
}: {
  milestoneId: string;
  planning: 'queued' | 'running' | null;
  fixtures: boolean;
  hostSlug?: string;
}) {
  const [limit, setLimit] = useState(FEED_PAGE);
  const query = useSafeQuery<RunFeedModel | null>(
    api.agent.feedForMilestone,
    fixtures ? 'skip' : { milestoneId: milestoneId as Id<'milestones'>, limit, hostSlug },
  );
  if (fixtures) {
    const view = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('feed');
    const fixture = fixtureRunFeed(view);
    return <MilestoneRunFeed state={fixture.state} model={fixture.model} onLoadEarlier={() => undefined} />;
  }
  const model = query.data ? { ...query.data, planning: query.data.planning ?? planning } : null;
  return (
    <MilestoneRunFeed
      state={runFeedState({ loading: query.loading, error: query.error, model })}
      model={model}
      onLoadEarlier={() => setLimit((current) => feedLimit(current + FEED_PAGE))}
    />
  );
}
