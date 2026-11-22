'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { buildAgent, type RunTool } from '@convex/_lib/agentRun';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { useMaxWidth } from '@/lib/design/useMaxWidth';

export const DRIVER_LABEL = 'BUILD AGENT';
export const DRIVER_CLAUDE = "Claude Code (on Peter's Mac)";
export const DRIVER_CURSOR = 'Cursor cloud agent';
export const DRIVER_HELP_CLAUDE =
  "Building runs Claude Code on Peter's Mac, on one branch and one PR. The key stays with the runner, never in this setting.";
export const DRIVER_HELP_CURSOR =
  "Building runs a Cursor cloud agent, on one branch and one PR. The key stays with the runner, never in this setting.";
export const DRIVER_FIELD = 'Build agent';
export const DRIVER_CLAUDE_DETAIL = "Runs on the runner on Peter's Mac, on one branch and one PR.";
export const DRIVER_CURSOR_DETAIL = "Runs in Cursor's cloud, on one branch and one PR. The key stays with the runner.";
export const DRIVER_EDIT_HINT = "This applies the next time a milestone enters Building. It doesn't ask for a key.";
export const DRIVER_SAVE_ERROR = "Couldn't save the build agent. Nothing changed.";
export const DRIVER_SAVING_HINT = "Can't cancel while the agent is saving.";
export const DRIVER_LOCKED = "Can't change the build agent while a milestone is Building.";
export const DRIVER_STAFF = 'Staff only · clients never see this';
export const DRIVER_CHANGE = 'Change agent';
export const DRIVER_SAVE = 'Save agent';
export const DRIVER_SAVING = 'Saving…';
export const DRIVER_CANCEL = 'Cancel';

export type AgentPreview = 'view' | 'editing' | 'saving' | 'error' | 'disabled';

const card: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--panel-radius, 12px)',
  padding: 24,
  marginTop: 16,
};

const outline: CSSProperties = {
  background: 'transparent',
  color: 'var(--fg)',
  border: '1px solid var(--border-2)',
  borderRadius: 9,
  fontSize: 14,
  fontWeight: 500,
  lineHeight: '21px',
  padding: '12px 16px',
  cursor: 'pointer',
};

const primary: CSSProperties = {
  background: 'var(--accent)',
  color: 'var(--accent-fg)',
  border: 0,
  borderRadius: 9,
  fontSize: 14,
  fontWeight: 500,
  lineHeight: '21px',
  padding: '12px 16px',
  cursor: 'pointer',
};

function agentName(driver: RunTool): string {
  return driver === 'cursor' ? DRIVER_CURSOR : DRIVER_CLAUDE;
}

function agentHelp(driver: RunTool): string {
  return driver === 'cursor' ? DRIVER_HELP_CURSOR : DRIVER_HELP_CLAUDE;
}

function Radio({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 16,
        height: 16,
        borderRadius: 999,
        border: on ? '5px solid #3b82f6' : '1.5px solid var(--muted)',
        boxSizing: 'border-box',
        flex: '0 0 auto',
        marginTop: 2,
      }}
    />
  );
}

/**
 * Staff pick the build agent. Clients never see it. There is no key field.
 * Claude Code is the default. The control locks while a milestone is Building.
 */
export function AgentDriverSettingView({
  driver,
  preview,
  locked,
  onSave,
}: {
  driver: RunTool;
  preview?: AgentPreview;
  locked?: boolean;
  onSave: (driver: RunTool) => Promise<void>;
}) {
  const phone = useMaxWidth(767);
  const [phase, setPhase] = useState<AgentPreview>(preview ?? 'view');
  const [choice, setChoice] = useState<RunTool>(preview === 'editing' || preview === 'saving' || preview === 'error' ? 'cursor' : driver);
  const held = locked || preview === 'disabled' || phase === 'disabled';
  useEffect(() => {
    if (!preview) return;
    setPhase(preview === 'disabled' ? 'view' : preview);
    if (preview === 'editing' || preview === 'saving' || preview === 'error') setChoice('cursor');
  }, [preview]);
  useEffect(() => {
    if (held && phase !== 'saving') setPhase('view');
  }, [held, phase]);

  const save = async () => {
    if (held || phase === 'saving') return;
    if (choice === driver) {
      setPhase('view');
      return;
    }
    setPhase('saving');
    try {
      await onSave(choice);
      setPhase('view');
    } catch {
      setPhase('error');
    }
  };

  const editing = phase === 'editing' || phase === 'saving' || phase === 'error';
  const saving = phase === 'saving';
  return (
    <section data-testid="project-agent-driver" data-agent-state={held ? 'disabled' : phase} style={card}>
      <div className={phone ? 'flex flex-col gap-3' : 'flex items-start justify-between gap-4'}>
        <div className="min-w-0 flex-1">
          <p className="ds-mono" style={{ margin: 0, fontSize: 10, lineHeight: '15px', letterSpacing: '0.8px', color: 'var(--muted)' }}>
            {DRIVER_LABEL}
          </p>
          {editing ? null : (
            <p data-testid="project-agent-value" style={{ margin: '6px 0 0', fontSize: 15, lineHeight: '23px' }}>
              {agentName(driver)}
            </p>
          )}
        </div>
        {editing || held ? (
          held ? (
            <span
              tabIndex={0}
              aria-disabled="true"
              aria-describedby="project-agent-locked"
              title={DRIVER_LOCKED}
              style={{ display: 'inline-flex', cursor: 'not-allowed', alignSelf: phone ? 'flex-start' : undefined }}
            >
              <button type="button" disabled tabIndex={-1} data-testid="project-agent-change" style={{ ...outline, opacity: 0.4, cursor: 'not-allowed' }}>
                {DRIVER_CHANGE}
              </button>
            </span>
          ) : null
        ) : (
          <button type="button" data-testid="project-agent-change" onClick={() => { setChoice(driver); setPhase('editing'); }} style={outline}>
            {DRIVER_CHANGE}
          </button>
        )}
      </div>
      {editing ? (
        <div className="flex flex-col gap-3" style={{ paddingTop: 12 }}>
          <p style={{ margin: 0, fontSize: 14, lineHeight: '21px' }}>{DRIVER_FIELD}</p>
          <div className="flex flex-col gap-2" role="radiogroup" aria-label={DRIVER_FIELD}>
            {(['claude_code', 'cursor'] as const).map((option) => {
              const selected = choice === option;
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  data-testid={option === 'cursor' ? 'project-agent-cursor' : 'project-agent-claude'}
                  disabled={saving}
                  onClick={() => setChoice(option)}
                  style={{
                    display: 'flex',
                    gap: 12,
                    textAlign: 'left',
                    width: '100%',
                    background: 'var(--surface)',
                    color: 'var(--fg)',
                    border: selected ? '2px solid #3b82f6' : '1px solid var(--border)',
                    borderRadius: 12,
                    padding: '10px 12px',
                    cursor: saving ? 'default' : 'pointer',
                  }}
                >
                  <Radio on={selected} />
                  <span>
                    <span style={{ display: 'block', fontSize: 14, lineHeight: '21px', fontWeight: 500 }}>
                      {option === 'cursor' ? DRIVER_CURSOR : DRIVER_CLAUDE}
                    </span>
                    <span style={{ display: 'block', marginTop: 2, fontSize: 13, lineHeight: '20px', color: 'var(--muted)' }}>
                      {option === 'cursor' ? DRIVER_CURSOR_DETAIL : DRIVER_CLAUDE_DETAIL}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <p
            id="project-agent-hint"
            role={phase === 'error' ? 'alert' : undefined}
            style={{ margin: 0, fontSize: 13, lineHeight: '20px', color: phase === 'error' ? 'var(--danger)' : 'var(--muted)' }}
          >
            {phase === 'error' ? DRIVER_SAVE_ERROR : DRIVER_EDIT_HINT}
          </p>
          <div className="flex flex-col items-end gap-2">
            <div className="flex justify-end gap-2">
              {saving ? (
                <span tabIndex={0} aria-disabled="true" aria-describedby="project-agent-saving" title={DRIVER_SAVING_HINT} style={{ display: 'inline-flex', cursor: 'not-allowed' }}>
                  <button type="button" disabled tabIndex={-1} data-testid="project-agent-cancel" style={{ ...outline, opacity: 0.4, cursor: 'not-allowed' }}>
                    {DRIVER_CANCEL}
                  </button>
                </span>
              ) : (
                <button type="button" data-testid="project-agent-cancel" onClick={() => setPhase('view')} style={outline}>
                  {DRIVER_CANCEL}
                </button>
              )}
              <button
                type="button"
                data-testid="project-agent-save"
                disabled={saving}
                onClick={() => void save()}
                style={{ ...primary, opacity: saving ? 0.7 : 1, cursor: saving ? 'default' : 'pointer' }}
              >
                {saving ? DRIVER_SAVING : DRIVER_SAVE}
              </button>
            </div>
            {saving ? (
              <p id="project-agent-saving" style={{ margin: 0, fontSize: 13, lineHeight: '20px', color: 'var(--muted)', textAlign: 'right' }}>
                {DRIVER_SAVING_HINT}
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <p id={held ? 'project-agent-locked' : undefined} style={{ margin: '12px 0 0', fontSize: 13, lineHeight: '20px', color: 'var(--muted)' }}>
          {held ? DRIVER_LOCKED : agentHelp(driver)}
        </p>
      )}
      <p className="ds-mono" style={{ margin: '12px 0 0', fontSize: 11, lineHeight: '17px', color: 'var(--muted)' }}>
        {DRIVER_STAFF}
      </p>
    </section>
  );
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
  const lock = useSafeQuery<{ locked: boolean }>(
    api.projects.agentChangeLock,
    fixtures ? 'skip' : { projectId: projectId as Id<'projects'>, hostSlug },
  );
  const [preview, setPreview] = useState<AgentPreview | undefined>(undefined);
  useEffect(() => {
    if (!fixtures) return;
    const value = new URLSearchParams(window.location.search).get('agent');
    if (value === 'editing' || value === 'saving' || value === 'error' || value === 'disabled' || value === 'view') setPreview(value);
  }, [fixtures]);
  const current = buildAgent(driver);
  return (
    <AgentDriverSettingView
      driver={current}
      preview={preview}
      locked={preview === 'disabled' || lock.data?.locked === true}
      onSave={async (next) => {
        if (fixtures) return;
        await setAgentDriver({ hostSlug, projectId: projectId as Id<'projects'>, driver: next });
      }}
    />
  );
}
