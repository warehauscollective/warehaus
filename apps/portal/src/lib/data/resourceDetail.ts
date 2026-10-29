/** Read-only resource detail. Recap text is the live description. No second resources database. */

export type RecapSections = {
  summary: string | null;
  decisions: string | null;
  actionItems: string | null;
};

const LABELED_SECTION = /^(summary|decisions|action items)\s*:\s*(.*)$/i;
const BARE_SECTION = /^(?:#{1,3}\s*)?(summary|decisions|action items)\s*:?\s*$/i;

function sectionKey(label: string): keyof RecapSections {
  const name = label.toLowerCase();
  if (name === 'summary') return 'summary';
  if (name === 'decisions') return 'decisions';
  return 'actionItems';
}

/**
 * Split a recap only when the text already has Summary, Decisions, or Action items
 * headings. A single description stays the summary. Missing sections stay null.
 */
export function recapSections(description: string | null | undefined): RecapSections {
  const text = description?.replace(/\r\n/g, '\n').trim() ?? '';
  if (!text) return { summary: null, decisions: null, actionItems: null };
  const lines = text.split('\n');
  const headed = lines.some((line) => {
    const trimmed = line.trim();
    return LABELED_SECTION.test(trimmed) || BARE_SECTION.test(trimmed);
  });
  if (!headed) return { summary: text, decisions: null, actionItems: null };

  const buckets: Record<keyof RecapSections, string[]> = {
    summary: [],
    decisions: [],
    actionItems: [],
  };
  let current: keyof RecapSections | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    const labeled = trimmed.match(LABELED_SECTION);
    if (labeled) {
      current = sectionKey(labeled[1]);
      if (labeled[2]?.trim()) buckets[current].push(labeled[2].trim());
      continue;
    }
    const bare = trimmed.match(BARE_SECTION);
    if (bare) {
      current = sectionKey(bare[1]);
      continue;
    }
    if (current && trimmed) buckets[current].push(trimmed);
  }
  const join = (key: keyof RecapSections) => buckets[key].join('\n').trim() || null;
  return { summary: join('summary'), decisions: join('decisions'), actionItems: join('actionItems') };
}

export function notionNotesHref(notionPageId: string | null | undefined): string | null {
  if (!notionPageId) return null;
  if (/^(portal:|pending:)/i.test(notionPageId)) return null;
  const compact = notionPageId.replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(compact)) return null;
  return `https://www.notion.so/${compact}`;
}

export function usedInTasksSubtitle(count: number): string {
  if (count === 0) return 'Not linked to any task yet';
  const noun = count === 1 ? 'task' : 'tasks';
  return `${count} ${noun} · click to open the task`;
}

export function resourceMeta(type: string | null | undefined, updatedAt: number | null | undefined): string {
  const when =
    updatedAt == null
      ? null
      : new Intl.DateTimeFormat('en-US', {
          month: 'short',
          day: 'numeric',
          timeZone: 'UTC',
        }).format(updatedAt);
  const parts = [type?.trim() || null, when].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Resource';
}
