'use client';

import { Menu, X } from 'lucide-react';
import { getPortalTabsForMode } from '@warehaus/logic/portal';
import { usePortalTab } from '@/components/providers/PortalTabProvider';
import { usePortalView } from '@/components/providers/PortalViewProvider';
import { usePortalData } from '@/hooks/usePortalData';

/**
 * Mobile-only top chrome: hamburger (opens the section sidebar drawer) +
 * current main tab title (DASHBOARD / PROJECTS / … — not inner section pills).
 */
export function PortalMobileTopBar() {
  const { activeTab } = usePortalTab();
  const { menuOpen, toggleMenu } = usePortalView();
  const { data } = usePortalData();
  const title =
    getPortalTabsForMode(data.tenant.mode).find((t) => t.value === activeTab)
      ?.label ?? 'PORTAL';

  return (
    <header
      className="fixed inset-x-3 top-3 z-[70] flex items-center gap-3 rounded-2xl px-2 py-2 backdrop-blur-2xl lg:hidden"
      style={{
        background: 'var(--nav-bg)',
        border: '1px solid var(--nav-border)',
        boxShadow: '0 8px 32px color-mix(in oklab, var(--ink) 18%, transparent)',
      }}
    >
      <button
        type="button"
        onClick={toggleMenu}
        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={menuOpen}
        aria-controls="portal-mobile-sidebar"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
        style={{ color: 'var(--nav-text)' }}
      >
        <span className="relative block h-5 w-5" aria-hidden="true">
          <Menu
            className="absolute inset-0 h-5 w-5"
            style={{
              opacity: menuOpen ? 0 : 1,
              transform: menuOpen ? 'rotate(90deg)' : 'rotate(0deg)',
              transition:
                'opacity 200ms ease, transform 250ms cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
          <X
            className="absolute inset-0 h-5 w-5"
            style={{
              opacity: menuOpen ? 1 : 0,
              transform: menuOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition:
                'opacity 200ms ease, transform 250ms cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        </span>
      </button>

      <h1
        className="min-w-0 flex-1 truncate"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '0.95rem',
          fontWeight: 800,
          letterSpacing: '0.12em',
          lineHeight: 1,
          color: 'var(--nav-text)',
        }}
      >
        <span className="block [text-box:trim-both_cap_alphabetic]">{title}</span>
      </h1>
    </header>
  );
}
