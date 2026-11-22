'use client';

import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { AGENT_REPO_INVALID, agentRepo } from '@convex/_lib/agentRun';
import { userFacingErrorMessage } from '@convex/_lib/userFacingError';
import { PortalModal } from '@/components/ui/PortalModal';
import { OutlineButton, PrimaryButton } from '@/components/ui/primitives';
import { useMaxWidth } from '@/lib/design/useMaxWidth';

export const REPO_LABEL = 'RUNNER REPOSITORY';
export const REPO_UNSET = 'Not set';
export const REPO_HELP_UNSET =
  'No repository is set, so no runner is handed work for this project. Its milestones wait, planning included.';
export const REPO_HELP_SET = 'A runner is handed this project’s work only when it serves this repository.';
export const REPO_FIELD_HELP = 'Use owner/name, like warehauscollective/warehaus. A GitHub URL works too.';
export const REPO_SAVE_ERROR = 'Couldn’t save the repository. Nothing changed.';
export const REPO_STAFF_ONLY = 'Staff only · clients never see this';
export const CLEAR_TITLE = 'Clear runner repository?';
export const CLEAR_BODY = 'This stops all runner work for this project until a repository is set again.';
export const CLEAR_ERROR = 'Couldn’t clear the repository. Nothing changed.';
export const CLEAR_CANCEL_HINT = 'Can’t cancel while the repository is being cleared.';
export const SAVE_CANCEL_HINT = 'Can’t cancel while the repository is saving.';

export type RepoPreview = 'edit' | 'confirm' | 'clearing' | 'clear-error' | 'saving' | 'helper';

export type RepoDraft =
  | { ok: true; changed: false }
  | { ok: true; changed: true; repo: string }
  | { ok: false; reason: string };

/** What saving the typed value does. Empty changes nothing. Clearing is a separate confirm. */
export function repoDraftDecision(current: string | null, typed: string): RepoDraft {
  const raw = typed.trim();
  if (!raw) return { ok: true, changed: false };
  const repo = agentRepo(raw);
  if (!repo) return { ok: false, reason: AGENT_REPO_INVALID };
  return repo === (current ?? null) ? { ok: true, changed: false } : { ok: true, changed: true, repo };
}

const outlineButton: CSSProperties = {
  background: 'transparent',
  color: 'var(--fg)',
  border: '1px solid var(--border)',
  borderRadius: 9,
  fontSize: 14,
  fontWeight: 500,
  lineHeight: '21px',
  padding: '12px 16px',
  cursor: 'pointer',
};

const dangerButton: CSSProperties = {
  background: 'transparent',
  color: 'var(--danger)',
  border: '1px solid var(--danger)',
  borderRadius: 9,
  fontSize: 14,
  fontWeight: 500,
  lineHeight: '21px',
  padding: '12px 16px',
  cursor: 'pointer',
};

function ClearAlertIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 2.2 18 17.2H2L10 2.2Z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10 7.4v4" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="10" cy="14.2" r="0.9" fill="currentColor" />
    </svg>
  );
}

function HeldButton({
  label,
  hint,
  hintId,
  testId,
  busyLabel,
  busy,
  danger,
  onClick,
}: {
  label: string;
  hint: string;
  hintId: string;
  testId: string;
  busyLabel?: string;
  busy: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  if (!busy) {
    return (
      <button type="button" data-testid={testId} onClick={onClick} style={danger ? dangerButton : outlineButton}>
        {label}
      </button>
    );
  }
  return (
    <span
      tabIndex={0}
      aria-disabled="true"
      aria-describedby={hintId}
      title={hint}
      data-testid={`${testId}-wrap`}
      style={{ cursor: 'not-allowed', display: 'inline-flex' }}
    >
      <button
        type="button"
        disabled
        aria-disabled="true"
        tabIndex={-1}
        data-testid={testId}
        style={{
          ...(danger ? dangerButton : outlineButton),
          opacity: danger ? 0.7 : 0.4,
          pointerEvents: 'none',
          cursor: 'not-allowed',
        }}
      >
        {busyLabel ?? label}
      </button>
    </span>
  );
}

function Hint({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p
      id={id}
      style={{
        alignSelf: 'stretch',
        minWidth: 0,
        maxWidth: '100%',
        margin: 0,
        fontSize: 13,
        lineHeight: '20px',
        color: 'var(--muted)',
        textAlign: 'right',
        whiteSpace: 'normal',
        overflowWrap: 'break-word',
      }}
    >
      {children}
    </p>
  );
}

/**
 * Staff set the GitHub repository a runner works this project in. Until one
 * is set, no runner is handed any of the project's milestones. Clearing uses
 * the shared confirm. Emptying the field and saving does not clear it.
 */
export function ProjectRepoSettingView({
  repo,
  onSave,
  preview,
  narrow: narrowProp,
}: {
  repo: string | null;
  onSave: (repo: string | null) => Promise<void>;
  preview?: RepoPreview;
  /** Phone sheet. Omit it and the viewport decides. */
  narrow?: boolean;
}) {
  const phone = useMaxWidth(767);
  const narrow = narrowProp ?? phone;
  const [editing, setEditing] = useState(preview != null);
  const [draft, setDraft] = useState(repo ?? '');
  const [busy, setBusy] = useState(preview === 'saving');
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(preview === 'confirm' || preview === 'clearing' || preview === 'clear-error');
  const [clearing, setClearing] = useState(preview === 'clearing');
  const [clearFailed, setClearFailed] = useState(preview === 'clear-error');
  useEffect(() => {
    if (!editing) setDraft(repo ?? '');
  }, [repo, editing]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || clearing) return;
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

  const closeConfirm = () => {
    if (clearing) return;
    setConfirming(false);
    setClearFailed(false);
  };

  const clear = async () => {
    if (clearing) return;
    setClearing(true);
    setClearFailed(false);
    try {
      await onSave(null);
      setConfirming(false);
      setEditing(false);
    } catch {
      setClearFailed(true);
    } finally {
      setClearing(false);
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
              disabled={busy || clearing}
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
            <p id="project-repo-hint" data-testid="project-repo-helper" style={{ margin: 0, fontSize: 13, lineHeight: '20px', color: 'var(--muted)' }}>
              {REPO_FIELD_HELP}
            </p>
          )}
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            {repo && !busy ? (
              <button type="button" data-testid="project-repo-clear" className="w-fit" onClick={() => setConfirming(true)} style={dangerButton}>
                Clear repository
              </button>
            ) : null}
            <div className="flex w-full min-w-0 flex-1 flex-col items-end gap-2">
              <div className="flex justify-end gap-2">
                <HeldButton
                  label="Cancel"
                  hint={SAVE_CANCEL_HINT}
                  hintId="project-repo-save-hint"
                  testId="project-repo-cancel"
                  busy={busy}
                  onClick={() => {
                    setEditing(false);
                    setError(null);
                    setDraft(repo ?? '');
                  }}
                />
                <PrimaryButton type="submit" disabled={busy || clearing} testId="project-repo-save">
                  {busy ? 'Saving…' : 'Save repository'}
                </PrimaryButton>
              </div>
              {busy ? <Hint id="project-repo-save-hint">{SAVE_CANCEL_HINT}</Hint> : null}
            </div>
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
      {confirming ? (
        <PortalModal
          testId="clear-repo-dialog"
          scrimTestId="clear-repo-scrim"
          label={CLEAR_TITLE}
          header="compact"
          showIcon
          headerIcon={<ClearAlertIcon />}
          width={520}
          narrow={narrow}
          sheet={narrow ? 'bottom' : 'center'}
          sheetClearance={narrow ? '67px' : undefined}
          focusCancel
          blueFocus
          showFooter={false}
          locked={clearing}
          onClose={closeConfirm}
        >
          <div className="flex flex-col gap-4" style={{ padding: '0 24px 24px' }}>
            <p
              id={clearFailed ? 'clear-repo-error' : undefined}
              role={clearFailed ? 'alert' : undefined}
              data-testid={clearFailed ? 'clear-repo-error' : 'clear-repo-body'}
              style={{ margin: 0, fontSize: 14, lineHeight: '21px', color: clearFailed ? 'var(--danger)' : 'var(--muted)' }}
            >
              {clearFailed ? CLEAR_ERROR : CLEAR_BODY}
            </p>
            <div className="flex w-full min-w-0 flex-col items-end gap-2">
              <div className="flex justify-end gap-2">
                <HeldButton
                  label="Cancel"
                  hint={CLEAR_CANCEL_HINT}
                  hintId="clear-repo-cancel-hint"
                  testId="clear-repo-cancel"
                  busy={clearing}
                  onClick={closeConfirm}
                />
                <HeldButton
                  label="Clear repository"
                  hint={CLEAR_CANCEL_HINT}
                  hintId="clear-repo-cancel-hint"
                  testId="clear-repo-confirm"
                  busyLabel="Clearing…"
                  busy={clearing}
                  danger
                  onClick={() => void clear()}
                />
              </div>
              {clearing ? <Hint id="clear-repo-cancel-hint">{CLEAR_CANCEL_HINT}</Hint> : null}
            </div>
          </div>
        </PortalModal>
      ) : null}
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

/** Fixture page for the repository panel. Writes nothing. */
export function RepoSettingPreview({
  theme,
  phase,
  size,
}: {
  theme: 'dark' | 'light';
  phase: RepoPreview;
  size: '1440' | '390';
}) {
  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    return () => document.documentElement.classList.remove('light');
  }, [theme]);
  const width = size === '390' ? 390 : 720;
  return (
    <main
      className="ds-scope"
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        color: 'var(--fg)',
        padding: size === '390' ? 16 : 32,
      }}
    >
      <style>{'nextjs-portal{display:none !important}'}</style>
      <div style={{ width, maxWidth: '100%' }}>
        <ProjectRepoSettingView
          repo="warehauscollective/warehaus"
          onSave={async () => undefined}
          preview={phase}
          narrow={size === '390'}
        />
      </div>
    </main>
  );
}
