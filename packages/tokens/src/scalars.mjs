// @warehaus/tokens — scalar design tokens (theme-independent).
//
// Single source of truth for spacing, the fluid type scale, line-heights,
// tracking, layout rhythm, shape (radius/cut), and motion. These are the same
// in light and dark, so they live in :root once.
//
// Web: `npm run tokens` generates src/styles/tokens.generated.css from this.
// Native (later): import these values directly into StyleSheet.
//
// NOTE (Phase 0 scope): colors + theme-scoped neutrals/pillars still live in
// global.css and will be tokenized in a follow-up phase.

/** Flat map keyed by CSS custom-property name (without the leading `--`). */
export const scalars = {
  // Mono voice (Geist Mono is loaded via next/font in the app).
  'font-mono': 'var(--font-geist-mono), ui-monospace, "JetBrains Mono", monospace',

  // Fluid type scale
  't-xs': '0.75rem',
  't-sm': '0.875rem',
  't-base': '1rem',
  't-md': '1.25rem',
  't-lg': '1.5rem',
  't-xl': 'clamp(1.75rem, 1.2rem + 2vw, 2.5rem)',
  't-2xl': 'clamp(2.25rem, 1.4rem + 3.4vw, 3.75rem)',
  't-3xl': 'clamp(3rem, 1.6rem + 5.6vw, 6rem)',

  // Line-height + tracking
  'lh-tight': '1.05',
  'lh-head': '1.12',
  'lh-body': '1.6',
  'ls-display': '-0.01em',
  'ls-eyebrow': '0.22em',

  // Spacing — 4px base, negative-space heavy
  's-1': '0.25rem',
  's-2': '0.5rem',
  's-3': '0.75rem',
  's-4': '1rem',
  's-5': '1.5rem',
  's-6': '2rem',
  's-7': '3rem',
  's-8': '4rem',
  's-9': '6rem',
  's-10': '8rem',
  's-11': '10rem',

  // Section rhythm / layout
  'section-y': 'clamp(4rem, 2rem + 8vw, 8rem)',
  gutter: 'clamp(1.25rem, 0.5rem + 3vw, 3rem)',
  maxw: '1240px',

  // Shape — smooth radius + 45° chamfer cut
  'radius-sm': '10px',
  radius: '18px',
  'radius-lg': '28px',
  'radius-pill': '999px',
  cut: '22px',
  'cut-lg': '40px',

  // Motion
  speed: '180ms',
  ease: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
};

/** Ergonomic grouped view for JS/TS/native consumers. */
export const tokens = {
  font: { mono: scalars['font-mono'] },
  type: {
    xs: scalars['t-xs'],
    sm: scalars['t-sm'],
    base: scalars['t-base'],
    md: scalars['t-md'],
    lg: scalars['t-lg'],
    xl: scalars['t-xl'],
    '2xl': scalars['t-2xl'],
    '3xl': scalars['t-3xl'],
  },
  lineHeight: { tight: scalars['lh-tight'], head: scalars['lh-head'], body: scalars['lh-body'] },
  tracking: { display: scalars['ls-display'], eyebrow: scalars['ls-eyebrow'] },
  space: {
    1: scalars['s-1'], 2: scalars['s-2'], 3: scalars['s-3'], 4: scalars['s-4'],
    5: scalars['s-5'], 6: scalars['s-6'], 7: scalars['s-7'], 8: scalars['s-8'],
    9: scalars['s-9'], 10: scalars['s-10'], 11: scalars['s-11'],
  },
  layout: { sectionY: scalars['section-y'], gutter: scalars.gutter, maxw: scalars.maxw },
  radius: { sm: scalars['radius-sm'], base: scalars.radius, lg: scalars['radius-lg'], pill: scalars['radius-pill'] },
  cut: { base: scalars.cut, lg: scalars['cut-lg'] },
  motion: { speed: scalars.speed, ease: scalars.ease },
};
