/**
 * Safe Client Doc body model — only allowlisted block types.
 * Synced workers store JSON of these shapes; the UI never renders raw Notion HTML.
 */

import {
  classifyDocBlock,
  sanitizeInlineText,
  type AllowedDocBlockType,
} from '@warehaus/portal-sync';

export type SafeDocBlock =
  | { type: 'heading_1' | 'heading_2' | 'heading_3'; text: string }
  | { type: 'paragraph' | 'quote' | 'callout'; text: string }
  | { type: 'bulleted_list_item' | 'numbered_list_item'; text: string }
  | { type: 'to_do'; text: string; checked: boolean }
  | { type: 'code'; text: string; language?: string }
  | { type: 'divider' }
  | { type: 'image'; src: string; alt?: string }
  | { type: 'table'; rows: string[][] };

export function parseSafeDocBody(raw: string | null | undefined): SafeDocBlock[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const block = coerceBlock(item);
      return block ? [block] : [];
    });
  } catch {
    // Plain text fallback — treat as paragraphs
    return raw
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((text) => ({ type: 'paragraph' as const, text: sanitizeInlineText(text) }));
  }
}

function coerceBlock(item: unknown): SafeDocBlock | null {
  if (!item || typeof item !== 'object') return null;
  const row = item as Record<string, unknown>;
  const type = String(row.type ?? '');
  const decision = classifyDocBlock(type);
  if (decision.disposition !== 'keep') return null;

  const text =
    typeof row.text === 'string' ? sanitizeInlineText(row.text) : '';

  switch (type as AllowedDocBlockType) {
    case 'heading_1':
    case 'heading_2':
    case 'heading_3':
      return text ? { type: type as 'heading_1' | 'heading_2' | 'heading_3', text } : null;
    case 'paragraph':
    case 'quote':
    case 'callout':
      return text ? { type: type as 'paragraph' | 'quote' | 'callout', text } : null;
    case 'bulleted_list_item':
    case 'numbered_list_item':
      return text
        ? { type: type as 'bulleted_list_item' | 'numbered_list_item', text }
        : null;
    case 'to_do':
      return { type: 'to_do', text, checked: Boolean(row.checked) };
    case 'code':
      return {
        type: 'code',
        text: typeof row.text === 'string' ? row.text : '',
        language: typeof row.language === 'string' ? row.language : undefined,
      };
    case 'divider':
      return { type: 'divider' };
    case 'image': {
      const src = typeof row.src === 'string' ? row.src : '';
      if (!src || /notion\.(so|com)|amazonaws\.com/i.test(src)) return null;
      return {
        type: 'image',
        src,
        alt: typeof row.alt === 'string' ? sanitizeInlineText(row.alt) : undefined,
      };
    }
    case 'table': {
      const rows = Array.isArray(row.rows) ? row.rows : [];
      const cleaned = rows
        .filter((r): r is unknown[] => Array.isArray(r))
        .map((r) => r.map((c) => sanitizeInlineText(String(c ?? ''))));
      return cleaned.length ? { type: 'table', rows: cleaned } : null;
    }
    default:
      return null;
  }
}
