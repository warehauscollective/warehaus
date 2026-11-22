'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { AGENT_REPO_INVALID, agentRepo } from '@convex/_lib/agentRun';
import { userFacingErrorMessage } from '@convex/_lib/userFacingError';
import { OutlineButton, PrimaryButton } from '@/components/ui/primitives';

export const REPO_LABEL = 'RUNNER REPOSITORY';
export const REPO_UNSET = 'Not set';
export const REPO_HELP_UNSET =
  'No repository is set, so no runner is handed work for this project. Its milestones wait, planning included.';
export const REPO_HELP_SET = 'A runner is handed this project’s work only when it serves this repository.';
export const REPO_SAVE_ERROR = 'Couldn’t save the repository. Nothing changed.';
export const REPO_STAFF_ONLY = 'Staff only · clients never see this';

export type RepoDraft =
  | { ok: true; changed: false }
  | { ok: true; changed: true; repo: string | null }
  | { ok: false; reason: string };

/** What saving the typed value does. Empty clears it. The stored value again changes nothing. */
export function repoDraftDecision(current: string | null, typed: string): RepoDraft {
  const raw = typed.trim();
  if (!raw) return current ? { ok: true, changed: true, repo: null } : { ok: true, changed: false };
  const repo = agentRepo(raw);
  if (!repo) return { ok: false, reason: AGENT_REPO_INVALID };
  return repo === (current ?? null) ? { ok: true, changed: false } : { ok: true, changed: true, repo };
}

/**
 * Staff set the GitHub repository a runner works this project in. Until one
 * is set, no runner is handed any of the project's milestones.
 */
export function ProjectRepoSettingView({
  repo,
  onSave,
}: {
  repo: string | null;
  onSave: (repo: string | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(repo ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!editing) setDraft(repo ?? '');
  }, [repo, editing]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const decision = repoDraftDecision(repo, draft);
    if (!decision.ok) {
      setError(decision.reason);
      return;
    }
    if (!decision.changed) {
      setEditing(false);
      setError(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(decision.repo);
      setEditing(false);
    } catch (err) {
      setError(userFacingErrorMessage(err, REPO_SAVE_ERROR));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      data-testid="project-repo-setting"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--panel-radius, 12px)',
        padding: 24,
      }}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="ds-mono" style={{ margin: 0, fontSize: 10, lineHeight: '15px', letterSpacing: '0.8px', color: 'var(--muted)' }}>
            {REPO_LABEL}
          </p>
          {editing ? null : (
            <p
              data-testid="project-repo-value"
              className={repo ? 'ds-mono' : undefined}
              style={{ margin: '6px 0 0', fontSize: 15, lineHeight: '23px', color: repo ? 'var(--fg)' : 'var(--muted)', overflowWrap: 'anywhere' }}
            >
              {repo ?? REPO_UNSET}
            </p>
          )}
        </div>
        {editing ? null : (
          <OutlineButton
            nowrap
            testId="project-repo-edit"
            blueFocus
            onClick={() => {
              setError(null);
              setDraft(repo ?? '');
              setEditing(true);
            }}
          >
            {repo ? 'Change repository' : 'Set repository'}
          </OutlineButton>
        )}
      </div>
      {editing ? (
        <form onSubmit={submit} className="mt-3 flex flex-col gap-3" data-testid="project-repo-form">
          <label className="flex flex-col gap-2">
            <span style={{ fontSize: 14 }}>GitHub repository</span>
            <input
              autoFocus
              data-testid="project-repo-input"
              value={draft}
              placeholder="owner/name"
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'project-repo-error' : 'project-repo-hint'}
              onChange={(event) => {
                setDraft(event.target.value);
                if (error) setError(null);
              }}
              className="ds-mono focus-visible:[--tw-outline-style:solid] focus-visible:outline-2 focus-visible:outline-[var(--info)] focus-visible:outline-offset-2"
              style={{
                width: '100%',
                border: error ? '1px solid var(--danger)' : '1px solid var(--border)',
                borderRadius: 10,
                background: 'var(--surface-2)',
                color: 'var(--fg)',
                padding: '10px 12px',
                fontSize: 14,
                lineHeight: '21px',
              }}
            />
          </label>
          {error ? (
            <p id="project-repo-error" role="alert" style={{ margin: 0, fontSize: 13, lineHeight: '20px', color: 'var(--danger-text)' }}>
              {error}
            </p>
          ) : (
            <p id="project-repo-hint" style={{ margin: 0, fontSize: 13, lineHeight: '20px', color: 'var(--muted)' }}>
              Use owner/name, like warehauscollective/warehaus. Leave it empty to clear the setting.
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <OutlineButton onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </OutlineButton>
            <PrimaryButton type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save repository'}
            </PrimaryButton>
          </div>
        </form>
      ) : (
        <p data-testid="project-repo-help" style={{ margin: '12px 0 0', fontSize: 13, lineHeight: '20px', color: 'var(--muted)' }}>
          {repo ? REPO_HELP_SET : REPO_HELP_UNSET}
        </p>
      )}
      <p className="ds-mono" style={{ margin: '12px 0 0', fontSize: 11, lineHeight: '17px', color: 'var(--muted)' }}>
        {REPO_STAFF_ONLY}
      </p>
    </section>
  );
}

/** Live control. Fixture previews keep the value in this component and write nothing. */
export function ProjectRepoSetting({
  projectId,
  repo,
  fixtures,
  hostSlug,
}: {
  projectId: string;
  repo: string | null;
  fixtures: boolean;
  hostSlug?: string;
}) {
  const setAgentRepo = useMutation(api.projects.setAgentRepo);
  const [fixtureRepo, setFixtureRepo] = useState<string | null>(repo);
  if (fixtures) {
    return <ProjectRepoSettingView repo={fixtureRepo} onSave={async (next) => setFixtureRepo(next)} />;
  }
  return (
    <ProjectRepoSettingView
      repo={repo}
      onSave={async (next) => {
        await setAgentRepo({ hostSlug, projectId: projectId as Id<'projects'>, repo: next });
      }}
    />
  );
}
