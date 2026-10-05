/** Drop a deep-link query key without a navigation. */
export function clearSearchParam(key: string): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(key)) return;
  url.searchParams.delete(key);
  const qs = url.searchParams.toString();
  window.history.replaceState(null, '', `${url.pathname}${qs ? `?${qs}` : ''}${url.hash}`);
}

/** Set deep-link query keys without a navigation. */
export function setSearchParams(entries: Record<string, string>): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(entries)) {
    url.searchParams.set(key, value);
  }
  const qs = url.searchParams.toString();
  window.history.replaceState(null, '', `${url.pathname}${qs ? `?${qs}` : ''}${url.hash}`);
}
