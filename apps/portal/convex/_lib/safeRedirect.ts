/**
 * Post-login / callback targets must stay on this origin.
 * Only a single-slash relative path is allowed. Protocol-relative URLs,
 * backslash tricks, absolute URLs, and encoded forms of those are rejected.
 */
const SAFE_ORIGIN = 'https://portal.warehaus.local';

export function safeRedirectPath(input: string | null | undefined, fallback = '/'): string {
  if (typeof input !== 'string') return fallback;
  let value = input.trim();
  if (!value || value.length > 2048) return fallback;

  for (let i = 0; i < 5; i++) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(value);
    } catch {
      return fallback;
    }
    if (decoded === value) break;
    value = decoded.trim();
    if (!value || value.length > 2048) return fallback;
  }

  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  if (value.includes('\\') || value.includes('\0')) return fallback;
  if (/[\u0000-\u001F\u007F]/.test(value) || /\s/.test(value)) return fallback;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value) || value.includes('://')) return fallback;
  if (value.toLowerCase().includes('%2f') || value.toLowerCase().includes('%5c')) return fallback;

  let url: URL;
  try {
    url = new URL(value, SAFE_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== SAFE_ORIGIN || url.username || url.password) return fallback;

  const path = `${url.pathname}${url.search}${url.hash}`;
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || path.includes('://')) {
    return fallback;
  }
  return path;
}
