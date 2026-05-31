'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLayout } from '@/components/providers/LayoutProvider';
import { Home, BookOpen, DoorOpen, Users, Palette, Sun, Moon, Monitor } from 'lucide-react';

const MENU_ITEMS = [
  { icon: Home, label: 'Home', href: '/' },
  { icon: BookOpen, label: 'Codex', href: '/codex' },
  { icon: Palette, label: 'Style Guide', href: '/style-guide' },
  { icon: Users, label: 'About', href: '/about' },
  { icon: DoorOpen, label: 'Contact', href: '/contact' },
];

export function MenuOverlay() {
  const { menuOpen, toggleMenu, themeMode, setThemeMode } = useLayout();
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
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

  // Click outside to close
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        toggleMenu();
      }
    };
    // Defer to avoid catching the toggle click itself
    const timer = setTimeout(() => {
      window.addEventListener('click', handleClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('click', handleClick);
    };
  }, [menuOpen, toggleMenu]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
          menuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden="true"
      />

      {/* Menu panel — opens upward above the navbar, same width */}
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Navigation menu"
        className={`fixed left-1/2 -translate-x-1/2 z-50 rounded-2xl backdrop-blur-2xl shadow-[0_0_40px_rgba(0,0,0,0.3)] p-2 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          menuOpen
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
        style={{ bottom: 'calc(1.75rem + 56px + 12px)', width: 'fit-content', minWidth: 'var(--nav-width, auto)', background: 'var(--nav-bg)', borderColor: 'var(--nav-border)', borderWidth: '1px' }}
      >
        <nav className="flex flex-col gap-0.5">
          {MENU_ITEMS.map(({ icon: Icon, label, href }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors"
                style={{
                  color: isActive ? 'var(--nav-text-active)' : 'var(--nav-text)',
                  background: isActive ? 'var(--nav-pill-bg)' : 'transparent',
                }}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </Link>
            );
          })}

          {/* Divider */}
          <div className="h-px mx-2 my-1" style={{ background: 'var(--nav-pill-border)' }} />

          {/* Theme switcher — dark / light / auto */}
          <div className="flex items-center gap-1 mx-2 my-1 rounded-xl p-1" style={{ background: 'var(--nav-pill-bg)' }}>
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
                  className="flex flex-1 items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium transition-all duration-200"
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
        </nav>
      </div>
    </>
  );
}
