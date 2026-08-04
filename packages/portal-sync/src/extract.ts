/**
 * Notion REST property extractors (fail soft → empty/null).
 */

export function extractTitle(prop: unknown): string {
  const p = prop as { type?: string; title?: Array<{ plain_text?: string }> };
  if (p?.type !== 'title' || !Array.isArray(p.title)) return '';
  return p.title.map((t) => t.plain_text ?? '').join('');
}

export function extractRichText(prop: unknown): string {
  const p = prop as { type?: string; rich_text?: Array<{ plain_text?: string }> };
  if (p?.type !== 'rich_text' || !Array.isArray(p.rich_text)) return '';
  return p.rich_text.map((t) => t.plain_text ?? '').join('');
}

export function extractSelect(prop: unknown): string | null {
  const p = prop as { type?: string; select?: { name?: string } | null };
  if (p?.type !== 'select') return null;
  return p.select?.name ?? null;
}

export function extractStatus(prop: unknown): string | null {
  const p = prop as { type?: string; status?: { name?: string } | null };
  if (p?.type !== 'status') return null;
  return p.status?.name ?? null;
}

export function extractMultiSelect(prop: unknown): string[] {
  const p = prop as { type?: string; multi_select?: Array<{ name?: string }> };
  if (p?.type !== 'multi_select' || !Array.isArray(p.multi_select)) return [];
  return p.multi_select.map((o) => o.name ?? '').filter(Boolean);
}

export function extractCheckbox(prop: unknown): boolean {
  const p = prop as { type?: string; checkbox?: boolean };
  return p?.type === 'checkbox' ? Boolean(p.checkbox) : false;
}

export function extractEmail(prop: unknown): string | null {
  const p = prop as { type?: string; email?: string | null };
  return p?.type === 'email' && p.email ? String(p.email) : null;
}

export function extractPhone(prop: unknown): string | null {
  const p = prop as { type?: string; phone_number?: string | null };
  return p?.type === 'phone_number' && p.phone_number ? String(p.phone_number) : null;
}

export function extractUrl(prop: unknown): string | null {
  const p = prop as { type?: string; url?: string | null };
  return p?.type === 'url' && p.url ? String(p.url) : null;
}

export function extractDateStart(prop: unknown): string | null {
  const p = prop as { type?: string; date?: { start?: string | null } | null };
  if (p?.type !== 'date') return null;
  return p.date?.start ?? null;
}

export function extractNumber(prop: unknown): number | null {
  const p = prop as { type?: string; number?: number | null };
  return p?.type === 'number' && typeof p.number === 'number' ? p.number : null;
}

export function extractRelationIds(prop: unknown): string[] {
  const p = prop as { type?: string; relation?: Array<{ id?: string }> };
  if (p?.type !== 'relation' || !Array.isArray(p.relation)) return [];
  return p.relation.map((r) => r.id ?? '').filter(Boolean);
}

export function extractFormulaBoolean(prop: unknown): boolean | null {
  const p = prop as {
    type?: string;
    formula?: { type?: string; boolean?: boolean | null };
  };
  if (p?.type !== 'formula') return null;
  if (p.formula?.type === 'boolean') return Boolean(p.formula.boolean);
  return null;
}

export function extractRollupNumber(prop: unknown): number | null {
  const p = prop as {
    type?: string;
    rollup?: { type?: string; number?: number | null };
  };
  if (p?.type !== 'rollup') return null;
  if (p.rollup?.type === 'number' && typeof p.rollup.number === 'number') {
    return p.rollup.number;
  }
  return null;
}

export type NotionFileRef = { name: string; url: string };

export function extractFiles(prop: unknown): NotionFileRef[] {
  const p = prop as {
    type?: string;
    files?: Array<{
      name?: string;
      type?: string;
      file?: { url?: string };
      external?: { url?: string };
    }>;
  };
  if (p?.type !== 'files' || !Array.isArray(p.files)) return [];
  return p.files
    .map((f) => {
      const url = f.type === 'external' ? f.external?.url : f.file?.url;
      if (!url) return null;
      return { name: f.name ?? 'file', url };
    })
    .filter((x): x is NotionFileRef => Boolean(x));
}
