'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useFixturePreview } from '@/components/providers/FixturePreviewProvider';
import { openPortalHref } from '@/lib/nav/openPortalHref';
import { rememberPortalReturn } from '@/lib/nav/portalReturn';

/**
 * One row, one link. Preview stays on /preview and opens the existing
 * task, project, or doc surface. A task remembers this page for Esc.
 */
export function PortalRowLink({
  href,
  className,
  children,
  testId,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  testId?: string;
}) {
  const router = useRouter();
  const fixtures = useFixturePreview();
  return (
    <a
      href={href}
      data-testid={testId}
      className={className ? `portal-row portal-link-row ${className}` : 'portal-row portal-link-row'}
      onClick={(event) => {
        if (event.defaultPrevented) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        if (href.startsWith('/tasks/')) rememberPortalReturn();
        const preview = fixtures || window.location.pathname.startsWith('/preview');
        if (preview) {
          openPortalHref(href, (next) => router.push(next));
          return;
        }
        router.push(href);
      }}
    >
      {children}
    </a>
  );
}
