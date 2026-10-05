'use client';

import { useEffect } from 'react';
import { WarehausLogo } from '@warehaus/ui';
import { getPortalSidebarSections } from '@/lib/data/sidebarSections';
import { usePortalTab } from '@/components/providers/PortalTabProvider';
import { usePortalView } from '@/components/providers/PortalViewProvider';
import { usePortalData } from '@/hooks/usePortalData';

/**
 * Mobile section drawer — opened by PortalMobileTopBar’s hamburger.
 * Mirrors the desktop left-rail section list for the active dock tab.
 */
export function PortalMobileSidebar() {
  const { activeTab } = usePortalTab();
  const { sectionFor, setSectionFor, menuOpen, setMenuOpen, toggleMenu } =
    usePortalView();
  const { data } = usePortalData();

  const hideSections =
    data.tenant.mode === 'client' && activeTab === 'projects';
  const sections = hideSections
    ? []
    : getPortalSidebarSections(activeTab, data.tenant.mode);
  const activeSection = sectionFor(activeTab);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen, setMenuOpen]);

  const pickSection = (key: string) => {
    setSectionFor(activeTab, key);
    setMenuOpen(false);
  };

  return (
    <>
      <button
        type="button"
        aria-label="Close menu"
        tabIndex={menuOpen ? 0 : -1}
        onClick={toggleMenu}
        className={`fixed inset-0 z-[65] transition-opacity duration-300 lg:hidden ${
          menuOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        style={{
          background: 'color-mix(in oklab, var(--background) 72%, transparent)',
          backdropFilter: 'blur(12px)',
        }}
      />

      <aside
        id="portal-mobile-sidebar"
        aria-label={`${activeTab} sections`}
        aria-hidden={!menuOpen}
        className={`fixed left-3 top-[4.75rem] bottom-[5.5rem] z-[70] flex w-[min(280px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl backdrop-blur-2xl transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] lg:hidden ${
          menuOpen
            ? 'translate-x-0 opacity-100'
            : 'pointer-events-none -translate-x-4 opacity-0'
        }`}
        style={{
          background: 'var(--nav-bg)',
          border: '1px solid var(--nav-border)',
          boxShadow: '0 8px 32px color-mix(in oklab, var(--ink) 18%, transparent)',
        }}
      >
        <div
          className="flex items-center"
          style={{
            padding: 'var(--s-4) var(--s-4)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <WarehausLogo height={20} color="var(--fg)" />
        </div>

        <div
          className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain"
          style={{ padding: 'var(--s-3)' }}
        >
          <p
            className="ds-mono"
            style={{
              fontSize: 'var(--t-xs)',
              textTransform: 'uppercase',
              letterSpacing: '0.16em',
              color: 'var(--muted)',
              marginBottom: 'var(--s-2)',
              paddingInline: '0.35rem',
            }}
          >
            {activeTab}
          </p>

          {sections.length > 0 ? (
            sections.map((s) => {
              const active = activeSection === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => pickSection(s.key)}
                  aria-current={active ? 'true' : undefined}
                  className="text-left transition-colors"
                  style={{
                    fontSize: 'var(--t-sm)',
                    padding: '0.65rem 0.85rem',
                    borderRadius: 12,
                    color: active ? 'var(--fg)' : 'var(--muted)',
                    background: active
                      ? 'color-mix(in oklab, var(--fg) 8%, transparent)'
                      : 'transparent',
                    borderColor: active
                      ? 'color-mix(in oklab, var(--fg) 14%, transparent)'
                      : 'transparent',
                    borderWidth: 1,
                  }}
                >
                  {s.label}
                </button>
              );
            })
          ) : (
            <p
              style={{
                fontSize: 'var(--t-sm)',
                color: 'var(--muted)',
                padding: '0.65rem 0.85rem',
              }}
            >
              No sections for this tab.
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
