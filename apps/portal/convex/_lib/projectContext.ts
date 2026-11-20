/**
 * Pure rules for project context: the brief, glossary, and decisions of one
 * project. Staff-only. Convex is the source of truth; nothing here reaches Notion.
 */

export const BRIEF_FIELDS = [
  { key: 'goal', label: 'Goal' },
  { key: 'audience', label: 'Who it is for' },
  { key: 'outOfScope', label: 'Out of scope' },
  { key: 'doneWhen', label: 'Done when' },
] as const;

export type BriefFieldKey = (typeof BRIEF_FIELDS)[number]['key'];
export type ContextKind = 'brief' | 'term' | 'decision';
export type ContextSource = 'portal' | 'grok' | 'claude' | 'other';

export const CONTEXT_LIMITS = {
  briefField: 1200,
  term: 80,
  definition: 600,
  decisionTitle: 200,
  decisionBody: 2000,
  /** Rows read per kind for one project. One more is read to detect overflow. */
  terms: 200,
  decisions: 200,
} as const;

export type ContextEntry = {
  kind: ContextKind;
  key: string;
  title: string;
  body: string;
  number?: number;
  updatedAt: number;
};

/** Trim and collapse runs of spaces and tabs. Line breaks are kept. */
export function cleanContextText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Single-line version for titles and terms. */
export function cleanContextLine(value: string): string {
  return cleanContextText(value).replace(/\s*\n\s*/g, ' ');
}

/** Two spellings of one term share a key, so a term cannot be added twice. */
export function termKey(term: string): string {
  return cleanContextLine(term).toLowerCase();
}

export function isBriefFieldKey(value: string): value is BriefFieldKey {
  return BRIEF_FIELDS.some((field) => field.key === value);
}

export function briefFieldLabel(key: BriefFieldKey): string {
  return BRIEF_FIELDS.find((field) => field.key === key)!.label;
}

/** Null when the text fits, otherwise the sentence to show. */
export function lengthError(label: string, value: string, max: number): string | null {
  if (value.length > max) return `${label} must be ${max} characters or fewer`;
  return null;
}

export function termError(term: string, definition: string): string | null {
  if (!term) return 'Term is required';
  if (!definition) return 'Definition is required';
  return (
    lengthError('Term', term, CONTEXT_LIMITS.term) ??
    lengthError('Definition', definition, CONTEXT_LIMITS.definition)
  );
}

export function decisionError(title: string, body: string): string | null {
  if (!title) return 'Decision title is required';
  return (
    lengthError('Decision title', title, CONTEXT_LIMITS.decisionTitle) ??
    lengthError('Decision detail', body, CONTEXT_LIMITS.decisionBody)
  );
}

/** Decisions are numbered from 1 in the order they were recorded. Numbers are never reused. */
export function nextDecisionNumber(existing: readonly number[]): number {
  return existing.reduce((max, n) => (n > max ? n : max), 0) + 1;
}

export function decisionKey(number: number): string {
  return String(number).padStart(4, '0');
}

/** A retry of the same decision returns the first one. */
export function findDecisionByTitle<T extends { title: string }>(
  decisions: readonly T[],
  title: string,
): T | null {
  const wanted = cleanContextLine(title).toLowerCase();
  return decisions.find((row) => row.title.toLowerCase() === wanted) ?? null;
}

/** True when a write would store what is already there. */
export function isSameContent(
  existing: { title: string; body: string } | null,
  next: { title: string; body: string },
): boolean {
  return existing != null && existing.title === next.title && existing.body === next.body;
}

export type ContextView = {
  brief: Array<{ key: BriefFieldKey; label: string; body: string; updatedAt: number | null }>;
  terms: Array<{ term: string; definition: string; updatedAt: number }>;
  decisions: Array<{ number: number; id: string; title: string; body: string; recordedAt: number }>;
  summary: {
    briefFieldsSet: number;
    briefComplete: boolean;
    termCount: number;
    decisionCount: number;
    /** No brief field is set yet. Drives the "Context incomplete" chip. */
    incomplete: boolean;
    briefUpdatedAt: number | null;
  };
};

/** Shape stored rows for the Context tab and for bots. */
export function buildContextView(
  entries: ReadonlyArray<ContextEntry & { createdAt: number }>,
): ContextView {
  const briefRows = new Map(entries.filter((e) => e.kind === 'brief').map((e) => [e.key, e]));
  const brief = BRIEF_FIELDS.map((field) => {
    const row = briefRows.get(field.key);
    return { key: field.key, label: field.label, body: row?.body ?? '', updatedAt: row?.updatedAt ?? null };
  });
  const terms = entries
    .filter((e) => e.kind === 'term')
    .map((e) => ({ term: e.title, definition: e.body, updatedAt: e.updatedAt }))
    .sort((a, b) => a.term.localeCompare(b.term, 'en', { sensitivity: 'base' }));
  const decisions = entries
    .filter((e) => e.kind === 'decision' && typeof e.number === 'number')
    .map((e) => ({
      number: e.number as number,
      id: decisionKey(e.number as number),
      title: e.title,
      body: e.body,
      recordedAt: e.createdAt,
    }))
    .sort((a, b) => b.number - a.number);
  const briefFieldsSet = brief.filter((field) => field.body !== '').length;
  const briefTimes = brief.map((field) => field.updatedAt).filter((t): t is number => t != null);
  return {
    brief,
    terms,
    decisions,
    summary: {
      briefFieldsSet,
      briefComplete: briefFieldsSet === BRIEF_FIELDS.length,
      termCount: terms.length,
      decisionCount: decisions.length,
      incomplete: briefFieldsSet === 0,
      briefUpdatedAt: briefTimes.length ? Math.max(...briefTimes) : null,
    },
  };
}

/** Which bot wrote through the API, from its token name. One Grok token serves every Grok chat. */
export function contextSourceForToken(tokenName: string): ContextSource {
  const name = tokenName.trim().toLowerCase();
  if (name.startsWith('grok')) return 'grok';
  if (name.startsWith('claude')) return 'claude';
  return 'other';
}
