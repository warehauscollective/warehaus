'use client';

import { useEffect, useState } from 'react';
import { Surface } from '@/components/ui/primitives';

type ThemeMode = 'auto' | 'light' | 'dark';

function applyTheme(mode: ThemeMode) {
  const resolved =
    mode === 'auto'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : mode;
  document.documentElement.classList.toggle('light', resolved === 'light');
  try {
    localStorage.setItem('warehaus-theme', mode);
  } catch {
    /* ignore */
  }
}

/** Account Appearance only. No other screen mounts a theme control. */
export function ThemeControl() {
  const [mode, setMode] = useState<ThemeMode>('auto');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('warehaus-theme');
      if (saved === 'light' || saved === 'dark' || saved === 'auto') setMode(saved);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div data-testid="account-theme">
    <Surface style={{ padding: 'var(--s-5)' }}>
      <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
        Appearance
      </p>
      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 8 }}>
        Light and dark apply to the whole portal from here.
      </p>
      <div
        role="radiogroup"
        aria-label="Theme"
        className="mt-4 inline-flex"
        style={{
          padding: 3,
          borderRadius: 12,
          border: '1px solid var(--border)',
        }}
      >
        {(['auto', 'light', 'dark'] as const).map((value) => {
          const active = mode === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                try {
                  applyTheme(value);
                  setMode(value);
                  setError(null);
                } catch {
                  setError('Could not save your settings');
                }
              }}
              className="ds-mono"
              style={{
                fontSize: 'var(--t-xs)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                padding: '0.45rem 0.85rem',
                borderRadius: 9,
                border: 0,
                cursor: 'pointer',
                color: active ? 'var(--fg)' : 'var(--muted)',
                background: active ? 'color-mix(in oklab, var(--fg) 10%, transparent)' : 'transparent',
              }}
            >
              {value}
            </button>
          );
        })}
      </div>
      {error ? (
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)', marginTop: 12 }}>
          {error}. Try again.
        </p>
      ) : null}
    </Surface>
    </div>
  );
}
