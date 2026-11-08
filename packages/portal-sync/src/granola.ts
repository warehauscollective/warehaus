/**
 * Granola ingest.
 * A source note may carry a transcript. Nothing in the stored recap or the
 * client view may. Publish stays off until a later staff action turns it on.
 * Full notes stay in Notion; this module keeps a link, not the note body.
 */

export const GRANOLA_IMPORT_FAILED =
  'The last import did not finish. Existing notes are unchanged.';

export const GRANOLA_PAGE_PREFIX = 'granola:';

const TRANSCRIPT_HEADING = /^(?:#{1,3}\s*)?transcript\b/i;
const RECAP_HEADING = /^(summary|decisions|action items)\b/i;
const LABELED = /^(summary|decisions|action items|transcript)\s*:\s*(.*)$/i;
const BARE = /^(?:#{1,3}\s*)?(summary|decisions|action items|transcript)\s*:?\s*$/i;

export type GranolaSourceNote = {
  id: string;
  title: string;
  /** Source-only. Importers must drop this before writing. */
  transcript?: string | null;
  summary?: string | null;
  decisions?: string | null;
  actionItems?: string | null;
  /** Notion URL of the full note. Stored for staff. Never the note body. */
  notionUrl?: string | null;
  clientSlug?: string | null;
};

export type GranolaRecap = {
  summary: string | null;
  decisions: string | null;
  actionItems: string | null;
};

export type GranolaImportDraft = {
  sourceId: string;
  notionPageId: string;
  externalId: string;
  title: string;
  description: string | null;
  type: 'Meeting notes';
  source: 'granola';
  /** Notion URL only. Absent when the source has no safe link. */
  notesUrl: string | null;
  clientSlug: string | null;
  publishToWarehaus: false;
  status: 'imported' | 'failed';
  error: string | null;
};

export type GranolaRunStatus = {
  configured: boolean;
  lastRunAt: string | null;
  lastError: string | null;
};

/** Fixture source for tests. Not written by the cron. */
export const FIXTURE_GRANOLA_NOTES: readonly GranolaSourceNote[] = [
  {
    id: 'kickoff',
    title: 'Kickoff recap',
    transcript: 'TRANSCRIPT: Ada: the raw speaker turns stay in Notion.',
    summary: 'The menu structure is agreed.',
    decisions: 'Keep one column.',
    actionItems: 'Maya: update the wireframe.',
    notionUrl: 'https://www.notion.so/0123456789abcdef0123456789abcdef',
    clientSlug: 'northwind',
  },
  {
    id: 'standup',
    title: 'Internal standup',
    transcript: 'TRANSCRIPT: only a transcript, no recap.',
    clientSlug: 'northwind',
  },
];

export function granolaPortalPageId(sourceId: string): string {
  const safe = sourceId.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  return `${GRANOLA_PAGE_PREFIX}${safe}`;
}

export function isGranolaPortalPage(notionPageId: string | null | undefined): boolean {
  return typeof notionPageId === 'string' && notionPageId.startsWith(GRANOLA_PAGE_PREFIX);
}

/** True only when a Granola API key is present. The key itself is never returned. */
export function readGranolaSource(env: Record<string, string | undefined>): { configured: boolean } {
  return { configured: Boolean(env.GRANOLA_API_KEY?.trim()) };
}

export function staffNotesHref(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'https:') return null;
    if (parsed.hostname !== 'www.notion.so' && parsed.hostname !== 'notion.so') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function cleanSection(value: string | null | undefined, transcript: string | null): string | null {
  const text = value?.replace(/\r\n/g, '\n').trim() ?? '';
  if (!text) return null;
  if (TRANSCRIPT_HEADING.test(text)) return null;
  if (transcript && text.includes(transcript)) return null;
  return text;
}

function formatRecap(recap: GranolaRecap): string | null {
  const parts: string[] = [];
  if (recap.summary) parts.push(`Summary: ${recap.summary}`);
  if (recap.decisions) parts.push(`Decisions:\n${recap.decisions}`);
  if (recap.actionItems) parts.push(`Action items:\n${recap.actionItems}`);
  return parts.length > 0 ? parts.join('\n') : null;
}

/**
 * Client-facing description. Ordinary copy is unchanged. A transcript block
 * or a speaker-turn dump is dropped, leaving summary, decisions, and action
 * items when those headings are present.
 */
export function clientSafeResourceText(description: string | null | undefined): string | null {
  const text = description?.replace(/\r\n/g, '\n').trim() ?? '';
  if (!text) return null;
  if (!hasTranscriptSignal(text)) return text;
  return formatRecap(extractRecap(text));
}

function hasTranscriptSignal(text: string): boolean {
  if (TRANSCRIPT_HEADING.test(text.trim())) return true;
  const lines = text.split('\n');
  if (lines.some((line) => TRANSCRIPT_HEADING.test(line.trim()))) return true;
  const filled = lines.map((line) => line.trim()).filter(Boolean);
  if (filled.length < 4) return false;
  const speakers = filled.filter(
    (line) => /^[A-Z][A-Za-z .'-]{0,40}:\s+\S/.test(line) && !RECAP_HEADING.test(line),
  );
  return speakers.length >= 4 && speakers.length / filled.length >= 0.6;
}

function sectionKey(label: string): keyof GranolaRecap | 'transcript' {
  const name = label.toLowerCase();
  if (name === 'summary') return 'summary';
  if (name === 'decisions') return 'decisions';
  if (name === 'action items') return 'actionItems';
  return 'transcript';
}

function extractRecap(text: string): GranolaRecap {
  const buckets: Record<keyof GranolaRecap, string[]> = {
    summary: [],
    decisions: [],
    actionItems: [],
  };
  let current: keyof GranolaRecap | 'transcript' | null = null;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    const labeled = trimmed.match(LABELED);
    if (labeled?.[1]) {
      current = sectionKey(labeled[1]);
      if (current !== 'transcript' && labeled[2]?.trim()) buckets[current].push(labeled[2].trim());
      continue;
    }
    const bare = trimmed.match(BARE);
    if (bare?.[1]) {
      current = sectionKey(bare[1]);
      continue;
    }
    if (current && current !== 'transcript' && trimmed) buckets[current].push(trimmed);
  }
  const join = (key: keyof GranolaRecap) => buckets[key].join('\n').trim() || null;
  return { summary: join('summary'), decisions: join('decisions'), actionItems: join('actionItems') };
}

export function importGranolaNote(note: GranolaSourceNote): GranolaImportDraft {
  const sourceId = note.id?.trim() ?? '';
  const title = note.title?.trim() ?? '';
  const transcript = note.transcript?.trim() || null;
  const base = {
    sourceId,
    notionPageId: granolaPortalPageId(sourceId || 'missing'),
    externalId: `wh_grn_${sourceId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'missing'}`,
    title: title || 'Untitled meeting',
    type: 'Meeting notes' as const,
    source: 'granola' as const,
    notesUrl: staffNotesHref(note.notionUrl),
    clientSlug: note.clientSlug?.trim() || null,
    publishToWarehaus: false as const,
  };
  if (!sourceId || !title) {
    return { ...base, description: null, status: 'failed', error: 'Missing title' };
  }
  const recap: GranolaRecap = {
    summary: cleanSection(note.summary, transcript),
    decisions: cleanSection(note.decisions, transcript),
    actionItems: cleanSection(note.actionItems, transcript),
  };
  const description = formatRecap(recap);
  if (!description) {
    return { ...base, description: null, status: 'failed', error: 'No client-safe recap' };
  }
  return { ...base, description, status: 'imported', error: null };
}

/** A published Granola row is client-visible only when it still has a recap. */
export function clientMayOpenGranolaRecap(row: {
  notionPageId?: string | null;
  source?: string | null;
  publishToWarehaus?: boolean;
  description?: string | null;
}): boolean {
  const granola = isGranolaPortalPage(row.notionPageId) || row.source === 'granola';
  if (!granola) return true;
  if (row.publishToWarehaus !== true) return false;
  return clientSafeResourceText(row.description) != null;
}

export function granolaSyncRow(status: GranolaRunStatus): {
  label: 'Granola import';
  value: string;
  tone: 'danger' | 'muted';
} {
  if (status.lastError) return { label: 'Granola import', value: 'Failed', tone: 'danger' };
  if (status.lastRunAt) {
    const date = new Date(status.lastRunAt);
    if (Number.isNaN(date.getTime())) return { label: 'Granola import', value: 'Last run', tone: 'muted' };
    const hh = String(date.getUTCHours()).padStart(2, '0');
    const mm = String(date.getUTCMinutes()).padStart(2, '0');
    return { label: 'Granola import', value: `Last run ${hh}:${mm}`, tone: 'muted' };
  }
  return {
    label: 'Granola import',
    value: status.configured ? 'Not run' : 'Not configured',
    tone: 'muted',
  };
}

/** Staff status only. Drops any error string that quotes a transcript. */
export function staffGranolaStatus(meta: {
  lastSyncedAt?: number | null;
  lastError?: string | null;
  details?: string | null;
} | null): GranolaRunStatus {
  let configured = false;
  if (meta?.details) {
    try {
      const parsed = JSON.parse(meta.details) as { configured?: unknown };
      configured = parsed.configured === true;
    } catch {
      configured = false;
    }
  }
  const raw = meta?.lastError?.trim() || null;
  const lastError = raw && /transcript/i.test(raw) ? GRANOLA_IMPORT_FAILED : raw;
  return {
    configured,
    lastRunAt: meta?.lastSyncedAt ? new Date(meta.lastSyncedAt).toISOString() : null,
    lastError,
  };
}
