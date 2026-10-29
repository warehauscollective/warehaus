'use client';

import { useEffect, useState } from 'react';

type ThemeMode = 'auto' | 'light' | 'dark';
type ResolvedTheme = 'light' | 'dark';

function applyTheme(mode: ThemeMode) {
  const resolved = resolveTheme(mode, window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('light', resolved === 'light');
  try {
    localStorage.setItem('warehaus-theme', mode);
  } catch {
    /* ignore */
  }
}

export function resolveTheme(mode: ThemeMode, prefersDark: boolean): ResolvedTheme {
  if (mode === 'auto') return prefersDark ? 'dark' : 'light';
  return mode;
}

/** The other explicit theme. Auto stays on the knob as the resolved theme until a click. */
export function nextExplicitTheme(resolved: ResolvedTheme): ResolvedTheme {
  return resolved === 'dark' ? 'light' : 'dark';
}

function ThemeIcon({ theme }: { theme: ResolvedTheme }) {
  if (theme === 'dark') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Account Appearance only. No other screen mounts a theme control. */
export function ThemeControl() {
  const [mode, setMode] = useState<ThemeMode | null>(null);
  const [resolved, setResolved] = useState<ResolvedTheme | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('warehaus-theme');
      const nextMode: ThemeMode = saved === 'light' || saved === 'dark' || saved === 'auto' ? saved : 'auto';
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setMode(nextMode);
      setResolved(resolveTheme(nextMode, prefersDark));
    } catch {
      setMode('auto');
      setResolved('dark');
    }
  }, []);

  const darkOn = resolved === 'dark';

  return (
    <section className="account-card" data-testid="account-theme">
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, lineHeight: '26px', fontWeight: 700, margin: 0 }}>
        Appearance
      </h2>
      <div className="flex items-center justify-between gap-4">
        <p className="min-w-0" style={{ fontSize: 15, lineHeight: '19px', color: 'var(--muted)', margin: 0 }}>
          Choose light or dark for this device.
        </p>
        <span className="inline-flex shrink-0 items-center" style={{ gap: 12 }}>
          {resolved ? (
            <span data-testid="account-theme-label" style={{ fontSize: 15, lineHeight: '18px', fontWeight: 600 }}>
              {darkOn ? 'Dark' : 'Light'}
            </span>
          ) : (
            <span data-testid="account-theme-label" style={{ width: 36, height: 18 }} />
          )}
          {resolved ? (
            <button
              type="button"
              role="switch"
              aria-checked={darkOn}
              aria-label={`Theme, ${darkOn ? 'Dark' : 'Light'}`}
              data-testid="account-theme-toggle"
              data-theme={resolved}
              data-mode={mode ?? undefined}
              onClick={() => {
                try {
                  const next = nextExplicitTheme(resolved);
                  applyTheme(next);
                  setMode(next);
                  setResolved(next);
                  setError(null);
                } catch {
                  setError('Could not save your settings');
                }
              }}
              className="inline-flex shrink-0 items-center"
              style={{
                width: 64,
                height: 32,
                boxSizing: 'border-box',
                borderRadius: 999,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                padding: 4,
                justifyContent: darkOn ? 'flex-end' : 'flex-start',
                cursor: 'pointer',
              }}
            >
              <span
                aria-hidden
                className="inline-flex items-center justify-center"
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 999,
                  background: 'var(--fg)',
                  color: 'var(--bg)',
                }}
              >
                <ThemeIcon theme={resolved} />
              </span>
            </button>
          ) : (
            <span
              data-testid="account-theme-pending"
              aria-hidden
              className="inline-flex shrink-0"
              style={{
                width: 64,
                height: 32,
                boxSizing: 'border-box',
                borderRadius: 999,
                border: '1px solid var(--border)',
              }}
            />
          )}
        </span>
      </div>
      {error ? (
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)', margin: 0 }}>
          {error}. Try again.
        </p>
      ) : null}
    </section>
  );
}
