/**
 * Client-side host → slug (mirrors server tenancy parse for Convex hostSlug args).
 */

export function getHostSlugFromLocation(
  hostname: string = typeof window !== 'undefined' ? window.location.hostname : 'localhost',
): string | null {
  const host = hostname.toLowerCase().split(':')[0] || 'localhost';
  const roots = ['localhost', 'warehaus.vercel.app', 'warehaus.co'];
  const team = 'portal';

  for (const root of roots) {
    if (host === root) return null;
    const suffix = `.${root}`;
    if (host.endsWith(suffix)) {
      const sub = host.slice(0, -suffix.length);
      const label = sub.split('.').filter(Boolean).pop() ?? '';
      if (!label || label === 'www' || label === team) return null;
      return label;
    }
  }
  return null;
}
