// @warehaus/tokens — color system (theme-aware).
//
// The semantic base palette, status colors, and the full Dream/Design/Develop
// pillar system, per theme. Emitted to :root (dark) and :root.light by the web
// generator; importable directly by React Native later.
//
// NOTE: nav (--nav-*), glass, panel, layout vars, fonts, and the `.ds-scope`
// neutral palette still live in global.css (they're app-chrome / rule-level,
// not flat design tokens) — a candidate for a later phase.

/** Flat maps keyed by CSS custom-property name (without the leading `--`). */
export const colorThemes = {
  // Applied at :root (dark is the default theme).
  dark: {
    background: '#050505',
    foreground: '#e8e6e3',
    muted: '#6b6966',
    accent: '#00e5ff',
    surface: '#0d0d0d',
    'surface-elevated': '#141414',
    border: '#1f1f1f',
    'border-subtle': '#161616',
    success: '#22c55e',
    warning: '#f59e0b',
    info: '#3b82f6',

    'dream-primary': '#818cf8',
    'dream-secondary': '#a5b4fc',
    'dream-dim': 'rgba(129, 140, 248, 0.4)',
    'dream-glow': '129, 140, 248',
    'dream-surface': 'rgba(99, 102, 241, 0.08)',
    'dream-border': 'rgba(99, 102, 241, 0.15)',
    'dream-bg-deep': '#1e1b4b',
    'dream-bg-mid': '#0c0a1a',

    'design-primary': '#f97316',
    'design-secondary': '#fbbf24',
    'design-dim': 'rgba(249, 115, 22, 0.4)',
    'design-glow': '249, 115, 22',
    'design-surface': 'rgba(249, 115, 22, 0.08)',
    'design-border': 'rgba(249, 115, 22, 0.15)',
    'design-bg-deep': '#451a03',
    'design-bg-mid': '#0d0805',

    'develop-primary': '#10b981',
    'develop-secondary': '#34d399',
    'develop-dim': 'rgba(16, 185, 129, 0.4)',
    'develop-glow': '16, 185, 129',
    'develop-surface': 'rgba(16, 185, 129, 0.08)',
    'develop-border': 'rgba(16, 185, 129, 0.15)',
    'develop-bg-deep': '#052e16',
    'develop-bg-mid': '#0a120d',
  },

  // Applied at :root.light — only what the light theme overrides (status colors
  // are inherited from dark).
  light: {
    background: '#ededed',
    foreground: '#1a1a1a',
    muted: '#888888',
    accent: '#0099cc',
    surface: '#ffffff',
    'surface-elevated': '#f0f0f0',
    border: '#e0e0e0',
    'border-subtle': '#eaeaea',

    'dream-primary': '#4338ca',
    'dream-secondary': '#6366f1',
    'dream-dim': 'rgba(67, 56, 202, 0.5)',
    'dream-glow': '67, 56, 202',
    'dream-surface': 'rgba(99, 102, 241, 0.06)',
    'dream-border': 'rgba(99, 102, 241, 0.12)',
    'dream-bg-deep': '#e8e5f8',
    'dream-bg-mid': '#f0eef8',

    'design-primary': '#c2410c',
    'design-secondary': '#ea580c',
    'design-dim': 'rgba(194, 65, 12, 0.5)',
    'design-glow': '194, 65, 12',
    'design-surface': 'rgba(249, 115, 22, 0.06)',
    'design-border': 'rgba(249, 115, 22, 0.12)',
    'design-bg-deep': '#fef3e2',
    'design-bg-mid': '#fdf8f0',

    'develop-primary': '#047857',
    'develop-secondary': '#059669',
    'develop-dim': 'rgba(4, 120, 87, 0.5)',
    'develop-glow': '4, 120, 87',
    'develop-surface': 'rgba(16, 185, 129, 0.06)',
    'develop-border': 'rgba(16, 185, 129, 0.12)',
    'develop-bg-deep': '#e2f8f0',
    'develop-bg-mid': '#f0faf5',
  },
};
