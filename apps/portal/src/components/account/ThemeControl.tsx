'use client';

import { useEffect, useState } from 'react';

type ThemeMode = 'auto' | 'light' | 'dark';

function resolvedTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'light' || mode === 'dark') return mode;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(mode: 'light' | 'dark') {
  document.documentElement.classList.toggle('light', mode === 'light');
  try {
    localStorage.setItem('warehaus-theme', mode);
  } catch {
    /* ignore */
  }
}

function ThemeGlyph({ mode }: { mode: 'light' | 'dark' }) {
  const src = mode === 'dark' ? '/icons/theme-moon.svg' : '/icons/theme-sun.svg';
  return (
    <span
      aria-hidden
      className="block"
      style={{
        width: 14,
        height: 14,
        background: 'currentColor',
        WebkitMask: `url(${src}) center / contain no-repeat`,
        mask: `url(${src}) center / contain no-repeat`,
      }}
    />
  );
}

/** Account Appearance only. No other screen mounts a theme control. */
export function ThemeControl() {
  const [mode, setMode] = useState<'light' | 'dark'>('dark');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('warehaus-theme');
      const stored: ThemeMode =
        saved === 'light' || saved === 'dark' || saved === 'auto' ? saved : 'auto';
      setMode(resolvedTheme(stored));
    } catch {
      /* ignore */
    }
  }, []);

  const dark = mode === 'dark';

  return (
    <section data-testid="account-theme" style={cardStyle}>
      <header>
        <h2 style={cardTitle}>Appearance</h2>
        <p style={cardSubtitle}>Theme for this device</p>
      </header>
      <div style={settingRow}>
        <div className="min-w-0 flex-1">
          <p style={settingTitle}>Theme</p>
          <p style={settingBody}>Light or dark. Lives only in Account — not on other screens.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={dark}
          aria-label="Theme"
          data-testid="theme-toggle"
          onClick={() => {
            const next = dark ? 'light' : 'dark';
            try {
              applyTheme(next);
              setMode(next);
              setError(null);
            } catch {
              setError('Could not save your settings');
            }
          }}
          className="relative shrink-0"
          style={{
            width: 64,
            height: 32,
            borderRadius: 999,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            padding: 4,
            display: 'flex',
            justifyContent: dark ? 'flex-end' : 'flex-start',
            cursor: 'pointer',
          }}
        >
          <span
            className="flex items-center justify-center"
            style={{
              width: 24,
              height: 24,
              borderRadius: 999,
              background: 'var(--fg)',
              color: 'var(--bg)',
            }}
          >
            <ThemeGlyph mode={mode} />
          </span>
        </button>
      </div>
      {error ? <p style={errorStyle}>{error}. Try again.</p> : null}
    </section>
  );
}

const cardStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: '2.25rem',
  padding: 'clamp(1.5625rem, 2vw, 3rem)',
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 32,
};

const cardTitle = {
  fontSize: 20,
  fontWeight: 600,
  lineHeight: '26px',
  color: 'var(--fg)',
};

const cardSubtitle = {
  marginTop: 4,
  fontSize: 13,
  lineHeight: '19px',
  color: 'var(--muted)',
};

const settingRow = {
  display: 'flex',
  alignItems: 'center',
  gap: 24,
  paddingTop: 24,
  paddingBottom: 24,
  borderBottom: '1px solid var(--border)',
};

const settingTitle = {
  fontSize: 15,
  fontWeight: 500,
  lineHeight: 'normal',
  color: 'var(--fg)',
};

const settingBody = {
  marginTop: 4,
  fontSize: 13,
  lineHeight: '19px',
  color: 'var(--muted)',
};

const errorStyle = {
  fontSize: 13,
  color: 'var(--danger)',
};
