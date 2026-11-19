/**
 * Staff-only tile links. The local preview is a localhost URL. The Figma
 * link is an https figma.com URL. Neither is the Vercel review preview.
 * Empty input clears the field. The same stored value writes nothing.
 */

export const LOCAL_PREVIEW_INVALID = 'Use a localhost link, like http://localhost:3200.';
export const FIGMA_LINK_INVALID = 'Use an https figma.com link.';

export type TileLinkField = 'localPreview' | 'figma';

export type TileLinkDecision =
  | { ok: true; wrote: false }
  | { ok: true; wrote: true; url: string | null }
  | { ok: false; reason: string };

function clean(value: string | null): string {
  return value?.trim() ?? '';
}

/** http://localhost or http://127.0.0.1, with an optional port and path. */
export function normalizeLocalPreviewUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (host !== 'localhost' && host !== '127.0.0.1') return null;
  if (url.port) {
    const port = Number(url.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  }
  return url.toString();
}

/** https://figma.com or https://www.figma.com, with a path. */
export function normalizeFigmaUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (host !== 'figma.com' && host !== 'www.figma.com') return null;
  if (url.pathname === '/' || url.pathname === '') return null;
  return url.toString();
}

export function tileLinkChangeDecision(input: {
  field: TileLinkField;
  from: string | null;
  to: string | null;
}): TileLinkDecision {
  const raw = clean(input.to);
  if (!raw) {
    if (!clean(input.from)) return { ok: true, wrote: false };
    return { ok: true, wrote: true, url: null };
  }
  const url = input.field === 'localPreview' ? normalizeLocalPreviewUrl(raw) : normalizeFigmaUrl(raw);
  if (!url) {
    return { ok: false, reason: input.field === 'localPreview' ? LOCAL_PREVIEW_INVALID : FIGMA_LINK_INVALID };
  }
  if (url === clean(input.from)) return { ok: true, wrote: false };
  return { ok: true, wrote: true, url };
}

/** Host shown beside the local preview button. No URL means the preview is not running. */
export function localPreviewHint(url: string | null | undefined): string {
  if (!url) return 'preview not running';
  try {
    const parsed = new URL(url);
    return parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
  } catch {
    return 'preview not running';
  }
}
