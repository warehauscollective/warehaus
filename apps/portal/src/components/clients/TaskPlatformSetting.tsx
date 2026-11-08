'use client';

import {
  taskPlatformCopy,
  type MilestoneSeam,
  type TaskPlatform,
  type TaskPlatformView,
} from '@warehaus/portal-sync';

export type TaskPlatformPanelModel = TaskPlatformView & {
  saving: boolean;
  error: string | null;
  onChange?: (next: TaskPlatform) => void;
  milestonesRead?: readonly MilestoneSeam[] | null;
  milestonesUnavailable?: boolean;
};

export function LinearMilestoneList({ milestones }: { milestones: readonly MilestoneSeam[] }) {
  if (milestones.length === 0) {
    return (
      <p data-testid="linear-milestones-empty" style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 12 }}>
        No Linear project milestones.
      </p>
    );
  }
  return (
    <ul data-testid="linear-milestones" style={{ marginTop: 12, paddingLeft: 18 }}>
      {milestones.map((milestone) => (
        <li key={milestone.id} style={{ fontSize: 'var(--t-sm)', marginTop: 6 }}>
          <span>{milestone.name}</span>
          <span style={{ color: 'var(--muted)' }}>{` · ${milestone.workStatus} · ${milestone.approval}`}</span>
          {milestone.objective ? <span style={{ display: 'block', color: 'var(--muted)' }}>{milestone.objective}</span> : null}
        </li>
      ))}
    </ul>
  );
}

const CHOICES: Array<{ value: TaskPlatform; label: string }> = [
  { value: 'notion', label: 'Notion' },
  { value: 'linear', label: 'Linear' },
];

export function TaskPlatformSetting({
  platform,
  tasks,
  milestones,
  canChange,
  saving,
  error,
  onChange,
  milestonesRead = null,
  milestonesUnavailable = false,
}: TaskPlatformPanelModel) {
  const copy = taskPlatformCopy({ platform, tasks }, canChange ? 'staff' : 'client');
  return (
    <section
      data-testid="task-platform"
      data-platform={platform}
      data-can-change={canChange ? 'true' : 'false'}
      data-milestones={milestones.ok ? 'ready' : milestones.reason}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 28,
        padding: '1.25rem',
      }}
    >
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--t-md)', margin: 0 }}>Task platform</h3>
      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 4 }}>
        {saving ? 'Saving the task platform.' : copy.body}
      </p>
      {canChange ? (
        <div role="group" aria-label="Task platform" className="mt-4 flex flex-wrap gap-2">
          {CHOICES.map((choice) => {
            const on = platform === choice.value;
            return (
              <button
                key={choice.value}
                type="button"
                data-testid={`task-platform-${choice.value}`}
                aria-pressed={on}
                disabled={saving}
                onClick={() => {
                  if (!on) onChange?.(choice.value);
                }}
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 14,
                  fontWeight: 500,
                  lineHeight: '20px',
                  borderRadius: 999,
                  padding: '6px 12px',
                  border: on ? '1px solid var(--fg)' : '1px solid var(--border)',
                  background: on ? 'var(--fg)' : 'transparent',
                  color: on ? 'var(--bg)' : 'var(--fg)',
                  cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >
                {choice.label}
              </button>
            );
          })}
        </div>
      ) : (
        <p data-testid="task-platform-value" style={{ marginTop: 12, fontWeight: 600 }}>
          {copy.title}
        </p>
      )}
      {platform === 'linear' && milestonesRead ? <LinearMilestoneList milestones={milestonesRead} /> : null}
      {platform === 'linear' && milestonesUnavailable && tasks.ok ? (
        <p data-testid="linear-milestones-unavailable" style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 12 }}>
          Linear project milestones could not be read.
        </p>
      ) : null}
      {error ? (
        <p data-testid="task-platform-error" style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)', marginTop: 12 }}>
          {error}
        </p>
      ) : null}
    </section>
  );
}
