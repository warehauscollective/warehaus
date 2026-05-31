'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/** The three home-page pillars — these double as chat personas and color themes. */
export type PillarTab = 'dream' | 'design' | 'develop';
/** The three Style Guide tabs. */
export type StyleGuideTab = 'brand' | 'website' | 'portal';
/** The logged-in Portal tabs. */
export type PortalTab = 'dashboard' | 'projects' | 'chatroom' | 'activity' | 'account';
/**
 * Any tab the route-aware navbar can surface. The navbar is fully data-driven
 * from `navTabs.ts` and supports up to 6 tabs per route — add a route's set
 * there and extend this union with any new tab values.
 */
export type ActiveTab = PillarTab | StyleGuideTab | PortalTab;
export type Theme = 'dark' | 'light';
export type ThemeMode = 'dark' | 'light' | 'auto';

interface LayoutContextValue {
  scrollProgress: number;
  setScrollProgress: (v: number) => void;
  sectionProgress: number;
  setSectionProgress: (v: number) => void;
  activeSection: string;
  setActiveSection: (s: string) => void;
  isOnLight: boolean;
  setIsOnLight: (v: boolean) => void;
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  menuOpen: boolean;
  toggleMenu: () => void;
  chatOverlayOpen: boolean;
  toggleChatOverlay: () => void;
  theme: Theme;
  toggleTheme: () => void;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
}

const LayoutContext = createContext<LayoutContextValue | null>(null);

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [scrollProgress, setScrollProgress] = useState(0);
  const [sectionProgress, setSectionProgress] = useState(0);
  const [activeSection, setActiveSection] = useState('hero');
  const [isOnLight, setIsOnLight] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('dream');
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatOverlayOpen, setChatOverlayOpen] = useState(false);
  // Initialize from localStorage + system preference synchronously on the
  // client so the first render matches the `.light` class the blocking
  // script in <head> already applied. Prevents a theme flash during the
  // loading screen / initial hydration.
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'auto';
    const saved = window.localStorage.getItem('warehaus-theme');
    if (saved === 'light' || saved === 'dark' || saved === 'auto') return saved;
    return 'auto';
  });
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return true;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // Resolved theme: in auto mode, follow system preference
  const theme: Theme =
    themeMode === 'auto' ? (systemPrefersDark ? 'dark' : 'light') : themeMode;

  const toggleMenu = useCallback(() => setMenuOpen((p) => !p), []);
  const toggleChatOverlay = useCallback(() => setChatOverlayOpen((p) => !p), []);
  const toggleTheme = useCallback(
    () => setThemeMode((p) => (p === 'light' ? 'dark' : 'light')),
    [],
  );

  // Track system color-scheme preference (only relevant in auto mode,
  // but keeping the listener always-on keeps state fresh when the user
  // switches into auto).
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    // Initial value already set via useState initializer; only subscribe to changes.
    const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Sync resolved theme class on <html> and persist the mode to localStorage
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light');
    } else {
      root.classList.remove('light');
    }
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('warehaus-theme', themeMode);
  }, [themeMode]);


  const value = useMemo<LayoutContextValue>(
    () => ({
      scrollProgress,
      setScrollProgress,
      sectionProgress,
      setSectionProgress,
      activeSection,
      setActiveSection,
      isOnLight,
      setIsOnLight,
      activeTab,
      setActiveTab,
      menuOpen,
      toggleMenu,
      chatOverlayOpen,
      toggleChatOverlay,
      theme,
      toggleTheme,
      themeMode,
      setThemeMode,
    }),
    [
      scrollProgress,
      sectionProgress,
      activeSection,
      isOnLight,
      activeTab,
      menuOpen,
      toggleMenu,
      chatOverlayOpen,
      toggleChatOverlay,
      theme,
      toggleTheme,
      themeMode,
    ],
  );

  return (
    <LayoutContext.Provider value={value}>
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayout() {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error('useLayout must be used within <LayoutProvider>');
  return ctx;
}
