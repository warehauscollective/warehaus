'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLayout } from '@/components/providers/LayoutProvider';
import { Sun, Moon, Monitor } from 'lucide-react';

const MENU_ITEMS = [
  { label: 'Home', href: '/' },
  { label: 'Codex', href: '/codex' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
];

const SECONDARY_LINK = { label: 'Style Guide', href: '/style-guide' };

export function MenuOverlay() {
  const { menuOpen, toggleMenu, themeMode, setThemeMode } = useLayout();
  const pathname = usePathname();
  // `themeMode` differs between server (always 'auto') and client (read from
  // localStorage), so gate theme-dependent rendering until after hydration to
  // avoid a mismatch.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  // Close on route change
  useEffect(() => {
    if (menuOpen) toggleMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Close on Escape
  useEffect(() => {
    if (!menuOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') toggleMenu();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [menuOpen, toggleMenu]);

  const secondaryActive = pathname === SECONDARY_LINK.href;

  return (
    <>
      {/* Full-screen blurred backdrop. Clicking the empty area closes the menu;
          the bottom-nav close button stays reachable because the menu layer
          above is pointer-events-none except for its links/controls. */}
      <button
        type="button"
        aria-label="Close menu"
        tabIndex={menuOpen ? 0 : -1}
        onClick={toggleMenu}
        className={`fixed inset-0 z-40 backdrop-blur-2xl transition-opacity duration-300 ${
          menuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{ background: 'color-mix(in oklab, var(--background) 72%, transparent)' }}
      />

      {/* Full-screen menu — no panel/background wrapper, items centered. The
          container itself never captures pointer events; only the interactive
          nav + theme switcher do, so clicks elsewhere fall through to the
          backdrop (close) or the bottom nav (close button). */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={`fixed inset-0 z-50 flex flex-col items-center justify-between px-6 pt-28 pb-28 pointer-events-none transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          menuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        <nav className={`flex flex-1 flex-col items-center justify-center gap-10 sm:gap-12 md:gap-14 ${menuOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
          {MENU_ITEMS.map(({ label, href }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={`font-display font-black italic uppercase tracking-wide leading-none text-5xl sm:text-6xl md:text-7xl transition-opacity duration-200 ${
                  isActive ? 'opacity-100' : 'opacity-50 hover:opacity-100'
                }`}
                style={{ color: 'var(--nav-text-active)' }}
              >
                <span className="[text-box:trim-both_cap_alphabetic]">{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Secondary group — the Style Guide link sits just above the theme
            switcher and the two read as one cluster, set apart from the big
            primary nav above. */}
        <div className="flex flex-col items-center gap-4">
          {/* Style Guide link — much smaller than the primary nav; the padding
              gives it a comfortably larger clickable area. */}
          <Link
            href={SECONDARY_LINK.href}
            aria-current={secondaryActive ? 'page' : undefined}
            className={`font-display font-bold italic uppercase tracking-[0.18em] leading-none text-sm px-4 py-2 rounded-full transition-opacity duration-200 ${
              menuOpen ? 'pointer-events-auto' : 'pointer-events-none'
            } ${secondaryActive ? 'opacity-100' : 'opacity-50 hover:opacity-100'}`}
            style={{ color: 'var(--nav-text-active)' }}
          >
            <span className="[text-box:trim-both_cap_alphabetic]">{SECONDARY_LINK.label}</span>
          </Link>

          {/* Theme switcher — dark / light / auto */}
          <div
            className={`flex items-center gap-1 rounded-full p-1 ${menuOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
            style={{ background: 'var(--nav-surface)', borderColor: 'var(--nav-border)', borderWidth: '1px' }}
          >
            {([
              { mode: 'auto', label: 'Auto', Icon: Monitor },
              { mode: 'light', label: 'Light', Icon: Sun },
              { mode: 'dark', label: 'Dark', Icon: Moon },
            ] as const).map(({ mode, label, Icon }) => {
              const isActive = hydrated && themeMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => !isActive && setThemeMode(mode)}
                  className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium transition-all duration-200"
                  style={{
                    background: isActive ? 'var(--nav-text-active)' : 'transparent',
                    color: isActive ? 'var(--nav-text-inverse)' : 'var(--nav-text-muted)',
                  }}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
