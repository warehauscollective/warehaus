'use client';

import { useState, type CSSProperties } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { buildAgent, type RunTool } from '@convex/_lib/agentRun';
import { userFacingErrorMessage } from '@convex/_lib/userFacingError';

export const DRIVER_LABEL = 'BUILD AGENT';
export const DRIVER_HELP = 'Staff only. The frame for this control is still coming.';
export const DRIVER_CLAUDE = 'Claude Code';
export const DRIVER_CURSOR = 'Cursor';

/**
 * Stub beside the repository setting. Staff can pick the agent. The layout
 * waits for the design frame.
 */
export function AgentDriverSettingView({
  driver,
  onPick,
  busy,
  error,
}: {
  driver: RunTool;
  onPick: (driver: RunTool) => void;
  busy?: boolean;
  error?: string | null;
}) {
  return (
    <div data-testid="project-agent-driver" style={{ marginTop: 16 }}>
      <div className="ds-mono" style={{ fontSize: 11, lineHeight: '17px', color: 'var(--muted)' }}>
        {DRIVER_LABEL}
      </div>
      <div className="flex flex-wrap gap-2" style={{ marginTop: 8 }}>
        <button
          type="button"
          data-testid="project-agent-claude"
          aria-pressed={driver === 'claude_code'}
          disabled={busy}
          onClick={() => onPick('claude_code')}
          style={choiceStyle(driver === 'claude_code')}
        >
          {DRIVER_CLAUDE}
        </button>
        <button
          type="button"
          data-testid="project-agent-cursor"
          aria-pressed={driver === 'cursor'}
          disabled={busy}
          onClick={() => onPick('cursor')}
          style={choiceStyle(driver === 'cursor')}
        >
          {DRIVER_CURSOR}
        </button>
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>{error || DRIVER_HELP}</p>
    </div>
  );
}

function choiceStyle(on: boolean): CSSProperties {
  return {
    background: on ? 'var(--fg)' : 'transparent',
    color: on ? 'var(--bg)' : 'var(--fg)',
    border: '1px solid var(--border)',
    borderRadius: 9,
    fontSize: 14,
    fontWeight: 500,
    lineHeight: '21px',
    padding: '8px 12px',
    cursor: 'pointer',
  };
}

export function AgentDriverSetting({
  projectId,
  driver,
  fixtures,
  hostSlug,
}: {
  projectId: string;
  driver: RunTool | null;
  fixtures: boolean;
  hostSlug?: string;
}) {
  const setAgentDriver = useMutation(api.projects.setAgentDriver);
  const [current, setCurrent] = useState<RunTool>(buildAgent(driver));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <AgentDriverSettingView
      driver={current}
      busy={busy}
      error={error}
      onPick={(next) => {
        if (fixtures || next === current) {
          setCurrent(next);
          return;
        }
        setBusy(true);
        setError(null);
        void setAgentDriver({ hostSlug, projectId: projectId as Id<'projects'>, driver: next })
          .then(() => setCurrent(next))
          .catch((caught: unknown) => setError(userFacingErrorMessage(caught, 'Couldn’t save the build agent.')))
          .finally(() => setBusy(false));
      }}
    />
  );
}
