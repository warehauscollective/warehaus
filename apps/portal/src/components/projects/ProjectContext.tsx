'use client';

import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { BRIEF_FIELDS, CONTEXT_LIMITS, type BriefFieldKey, type ContextView } from '@convex/_lib/projectContext';
import { userFacingErrorMessage } from '@convex/_lib/userFacingError';
import { PortalModal } from '@/components/ui/PortalModal';
import { OutlineButton, PrimaryButton } from '@/components/ui/primitives';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import {
  FIXTURE_PROJECT_CONTEXT,
  briefMeta,
  contextDate,
  contextSubTabs,
  countMeta,
  grillingPrompt,
  type ContextSubTab,
} from '@/lib/data/projectContextView';
import { FieldLabel, Panel, fieldStyle } from './milestoneChrome';

export type ProjectContextState = {
  view: ContextView | null;
  loading: boolean;
  error: string | null;
};

/**
 * Staff read of one project's context. Clients never run this query: the
 * context is staff only, and a client sees the Resources section alone.
 */
export function useProjectContext(input: {
  projectId: string;
  staff: boolean;
  fixtures: boolean;
  live: boolean;
  hostSlug?: string;
}): ProjectContextState {
  const query = useSafeQuery<ContextView>(
    api.projectContext.get,
    input.live && input.staff && !input.fixtures
      ? { projectId: input.projectId as Id<'projects'>, hostSlug: input.hostSlug }
      : 'skip',
  );
  if (!input.staff) return { view: null, loading: false, error: null };
  if (input.fixtures) return { view: FIXTURE_PROJECT_CONTEXT, loading: false, error: null };
  return { view: query.data ?? null, loading: query.loading, error: query.error };
}

const chipStyle = {
  boxSizing: 'border-box',
  height: 27,
  padding: '4px 12px',
  borderRadius: 999,
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  color: 'var(--muted)',
  fontSize: 11,
  lineHeight: '17px',
  whiteSpace: 'nowrap',
} as const;

function ContextChip({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <span data-testid={testId} className="ds-mono inline-flex shrink-0 items-center" style={chipStyle}>
      {children}
    </span>
  );
}

/** Shown under the project title while no brief field is set. Staff only. */
export function ContextIncompleteChip() {
  return (
    <div className="flex">
      <ContextChip testId="context-incomplete">Context incomplete</ContextChip>
    </div>
  );
}

function SubTabRow({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: ContextSubTab; label: string }[];
  active: ContextSubTab;
  onChange: (id: ContextSubTab) => void;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const index = tabs.findIndex((tab) => tab.id === active);
    const next = tabs[(index + step + tabs.length) % tabs.length];
    onChange(next.id);
    event.currentTarget.querySelector<HTMLButtonElement>(`#context-tab-${next.id}`)?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label="Context sections"
      data-testid="context-sections"
      onKeyDown={onKeyDown}
      className="flex gap-[18px] overflow-x-auto lg:gap-7"
      style={{ borderBottom: '1px solid var(--border)' }}
    >
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            id={`context-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`context-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className="shrink-0"
            style={{
              padding: '0 0 10px',
              marginBottom: -1,
              background: 'transparent',
              border: 0,
              borderBottom: `2px solid ${selected ? 'var(--fg)' : 'transparent'}`,
              color: selected ? 'var(--fg)' : 'var(--muted)',
              fontFamily: 'var(--font-body)',
              fontSize: 14,
              lineHeight: '21px',
              whiteSpace: 'nowrap',
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

const muted = { fontSize: 14, lineHeight: '21px', color: 'var(--muted)' } as const;
const meta = { fontSize: 12, lineHeight: '18px', color: 'var(--muted)' } as const;
const rule = { borderTop: '1px solid var(--border)', paddingTop: 16 } as const;

function SectionHeader({ label, note }: { label: string; note: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <FieldLabel>{label}</FieldLabel>
      <p style={meta}>{note}</p>
    </div>
  );
}

function BriefSection({
  view,
  project,
  fixtures,
  hostSlug,
}: {
  view: ContextView;
  project: { id: string };
  fixtures: boolean;
  hostSlug?: string;
}) {
  const saveBrief = useMutation(api.projectContext.saveBrief);
  const [draft, setDraft] = useState<Record<BriefFieldKey, string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = view.summary.briefFieldsSet > 0;

  const open = () => {
    setError(null);
    setDraft(Object.fromEntries(view.brief.map((field) => [field.key, field.body])) as Record<BriefFieldKey, string>);
  };
  const save = async () => {
    if (!draft) return;
    if (fixtures) {
      setDraft(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveBrief({ projectId: project.id as Id<'projects'>, hostSlug, ...draft });
      setDraft(null);
    } catch (err) {
      setError(userFacingErrorMessage(err, 'The brief was not saved. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  if (draft) {
    return (
      <Panel testId="context-brief">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <SectionHeader label="BRIEF" note="Editing" />
          {BRIEF_FIELDS.map((field) => (
            <label key={field.key} className="flex flex-col gap-1">
              <span style={meta}>{field.label}</span>
              <textarea
                rows={2}
                maxLength={CONTEXT_LIMITS.briefField}
                value={draft[field.key]}
                onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
                style={{ ...fieldStyle, resize: 'vertical' }}
              />
            </label>
          ))}
          {error ? (
            <p role="alert" style={{ fontSize: 14, color: 'var(--danger-text)' }}>
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <PrimaryButton type="submit" disabled={busy}>
              {busy ? 'Saving' : 'Save brief'}
            </PrimaryButton>
            <OutlineButton onClick={() => setDraft(null)} disabled={busy}>
              Cancel
            </OutlineButton>
          </div>
        </form>
      </Panel>
    );
  }

  return (
    <Panel testId="context-brief">
      <div className="flex flex-col gap-4">
        <SectionHeader label="BRIEF" note={briefMeta(view)} />
        {started ? (
          view.brief
            .filter((field) => field.body !== '')
            .map((field) => (
              <div key={field.key} className="flex flex-col gap-1">
                <p style={meta}>{field.label}</p>
                <p style={{ ...muted, whiteSpace: 'pre-wrap' }}>{field.body}</p>
              </div>
            ))
        ) : (
          <p style={muted}>No brief yet. Start a grilling session in Grok or Claude to settle what this project is.</p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <OutlineButton onClick={open} testId="context-edit-brief">
            {started ? 'Edit brief' : 'Write brief'}
          </OutlineButton>
          <ContextChip>Staff only</ContextChip>
        </div>
      </div>
    </Panel>
  );
}

function GlossarySection({ view }: { view: ContextView }) {
  return (
    <Panel testId="context-glossary">
      <div className="flex flex-col gap-4">
        <SectionHeader label="GLOSSARY" note={countMeta(view.terms.length, 'term', 'terms', 'No terms')} />
        {view.terms.length === 0 ? (
          <p style={muted}>No terms yet. They are added as grilling settles them.</p>
        ) : (
          <dl className="flex flex-col gap-4">
            {view.terms.map((row) => (
              <div key={row.term} className="flex flex-col gap-1 lg:flex-row lg:gap-6" style={rule}>
                <dt className="shrink-0 lg:w-[200px]" style={{ fontSize: 14, lineHeight: '21px', fontWeight: 500, color: 'var(--fg)' }}>
                  {row.term}
                </dt>
                <dd className="min-w-0 flex-1" style={{ ...muted, whiteSpace: 'pre-wrap' }}>
                  {row.definition}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </Panel>
  );
}

function DecisionsSection({ view }: { view: ContextView }) {
  return (
    <Panel testId="context-decisions">
      <div className="flex flex-col gap-4">
        <SectionHeader label="DECISIONS" note={countMeta(view.decisions.length, 'recorded', 'recorded', 'None')} />
        {view.decisions.length === 0 ? (
          <p style={muted}>No decisions recorded. Hard-to-reverse choices land here.</p>
        ) : (
          <ol className="flex flex-col gap-4">
            {view.decisions.map((row) => (
              <li key={row.id} className="flex flex-col gap-1 lg:flex-row lg:items-baseline lg:gap-4" style={rule}>
                <span className="ds-mono shrink-0" style={{ fontSize: 11, lineHeight: '17px', color: 'var(--muted)' }}>
                  {row.id}
                  <span className="lg:hidden"> · {contextDate(row.recordedAt)}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span style={{ ...muted, display: 'block' }}>{row.title}</span>
                  {row.body ? (
                    <span style={{ ...meta, display: 'block', marginTop: 4, whiteSpace: 'pre-wrap' }}>{row.body}</span>
                  ) : null}
                </span>
                <span className="hidden shrink-0 lg:inline" style={meta}>
                  {contextDate(row.recordedAt)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Panel>
  );
}

/**
 * The project Context tab. Staff get four sub-tabs: Brief, Glossary, Decisions,
 * Resources. A client gets the resources alone, with no sub-tabs.
 */
export function ProjectContextTab({
  project,
  staff,
  fixtures,
  hostSlug,
  context,
  resources,
}: {
  project: { id: string; name: string };
  staff: boolean;
  fixtures: boolean;
  hostSlug?: string;
  context: ProjectContextState;
  resources: ReactNode;
}) {
  const [tab, setTab] = useState<ContextSubTab>('brief');
  if (!staff) return <>{resources}</>;
  const { view } = context;
  const section = () => {
    if (tab === 'resources') return resources;
    if (context.error) {
      return (
        <Panel>
          <p role="alert" style={{ fontSize: 14, color: 'var(--danger-text)' }}>
            Context could not load. Resources are still available.
          </p>
        </Panel>
      );
    }
    if (!view) return <p style={muted}>{context.loading ? 'Loading context' : 'Context is not available yet.'}</p>;
    if (tab === 'brief') return <BriefSection view={view} project={project} fixtures={fixtures} hostSlug={hostSlug} />;
    if (tab === 'glossary') return <GlossarySection view={view} />;
    return <DecisionsSection view={view} />;
  };
  return (
    <div className="flex flex-col gap-6" data-testid="project-context">
      <SubTabRow tabs={contextSubTabs(view)} active={tab} onChange={setTab} />
      <div role="tabpanel" id={`context-panel-${tab}`} aria-labelledby={`context-tab-${tab}`}>
        {section()}
      </div>
    </div>
  );
}

/** "Start grilling": a prompt to paste into Grok or Claude. The portal runs no model. */
export function GrillingPromptModal({ project, onClose }: { project: { id: string; name: string }; onClose: () => void }) {
  const prompt = grillingPrompt(project);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <PortalModal testId="grilling-prompt-dialog" label="Start grilling" onClose={onClose} header="default">
      <div className="flex flex-col gap-4">
        <p style={muted}>
          Paste this into Grok or Claude. The bot asks the questions and saves the brief, glossary and decisions to this
          project as you answer.
        </p>
        <textarea
          readOnly
          rows={7}
          value={prompt}
          aria-label="Grilling prompt"
          data-testid="grilling-prompt"
          onFocus={(event) => event.currentTarget.select()}
          style={{ ...fieldStyle, resize: 'none', fontFamily: 'var(--font-mono, monospace)', fontSize: 12, lineHeight: '18px' }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <PrimaryButton onClick={() => void copy()}>{copied ? 'Copied' : 'Copy prompt'}</PrimaryButton>
          <OutlineButton onClick={onClose}>Close</OutlineButton>
          <span aria-live="polite" style={meta}>
            {copied ? 'Prompt copied.' : ''}
          </span>
        </div>
      </div>
    </PortalModal>
  );
}
