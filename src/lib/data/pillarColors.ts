import type { PillarTab } from '@/components/providers/LayoutProvider';

/**
 * Centralized pillar color system.
 *
 * All colors reference CSS variables defined in global.css,
 * so they automatically adapt between dark and light themes.
 *
 * Usage:
 *   import { PILLAR_COLORS } from '@/lib/data/pillarColors';
 *   const colors = PILLAR_COLORS[activeTab];
 *   <div style={{ color: colors.primary }}>...</div>
 *   <div className={colors.tw.text}>...</div>
 */

export interface PillarColorSet {
  /** CSS variable values — use in style={{ }} props */
  primary: string;
  secondary: string;
  dim: string;
  glow: string; // rgb triplet for rgba(), e.g. "var(--dream-glow)"
  surface: string;
  border: string;
  bgDeep: string;
  bgMid: string;

  /** Tailwind utility classes — use in className props */
  tw: {
    text: string;
    textSecondary: string;
    textDim: string;
    bg: string;
    bgSurface: string;
    border: string;
    ring: string;
  };

  /** Static hex values for contexts that can't use CSS vars (SVG, Three.js) */
  hex: {
    dark: { primary: string; secondary: string };
    light: { primary: string; secondary: string };
  };
}

export const PILLAR_COLORS: Record<PillarTab, PillarColorSet> = {
  dream: {
    primary: 'var(--dream-primary)',
    secondary: 'var(--dream-secondary)',
    dim: 'var(--dream-dim)',
    glow: 'var(--dream-glow)',
    surface: 'var(--dream-surface)',
    border: 'var(--dream-border)',
    bgDeep: 'var(--dream-bg-deep)',
    bgMid: 'var(--dream-bg-mid)',
    tw: {
      text: 'text-dream',
      textSecondary: 'text-dream-secondary',
      textDim: 'text-dream-dim',
      bg: 'bg-dream',
      bgSurface: 'bg-dream-surface',
      border: 'border-dream-border',
      ring: 'ring-dream',
    },
    hex: {
      dark: { primary: '#818cf8', secondary: '#a5b4fc' },
      light: { primary: '#4338ca', secondary: '#6366f1' },
    },
  },
  design: {
    primary: 'var(--design-primary)',
    secondary: 'var(--design-secondary)',
    dim: 'var(--design-dim)',
    glow: 'var(--design-glow)',
    surface: 'var(--design-surface)',
    border: 'var(--design-border)',
    bgDeep: 'var(--design-bg-deep)',
    bgMid: 'var(--design-bg-mid)',
    tw: {
      text: 'text-design',
      textSecondary: 'text-design-secondary',
      textDim: 'text-design-dim',
      bg: 'bg-design',
      bgSurface: 'bg-design-surface',
      border: 'border-design-border',
      ring: 'ring-design',
    },
    hex: {
      dark: { primary: '#f97316', secondary: '#fbbf24' },
      light: { primary: '#c2410c', secondary: '#ea580c' },
    },
  },
  develop: {
    primary: 'var(--develop-primary)',
    secondary: 'var(--develop-secondary)',
    dim: 'var(--develop-dim)',
    glow: 'var(--develop-glow)',
    surface: 'var(--develop-surface)',
    border: 'var(--develop-border)',
    bgDeep: 'var(--develop-bg-deep)',
    bgMid: 'var(--develop-bg-mid)',
    tw: {
      text: 'text-develop',
      textSecondary: 'text-develop-secondary',
      textDim: 'text-develop-dim',
      bg: 'bg-develop',
      bgSurface: 'bg-develop-surface',
      border: 'border-develop-border',
      ring: 'ring-develop',
    },
    hex: {
      dark: { primary: '#10b981', secondary: '#34d399' },
      light: { primary: '#047857', secondary: '#059669' },
    },
  },
};

/** Helper: get rgba string from a pillar's glow token */
export function pillarGlow(tab: PillarTab, opacity: number): string {
  return `rgba(var(--${tab}-glow), ${opacity})`;
}

/** Helper: get the current pillar's CSS variable value */
export function pillarVar(tab: PillarTab, tier: 'primary' | 'secondary' | 'dim' | 'surface' | 'border' | 'bg-deep' | 'bg-mid'): string {
  return `var(--${tab}-${tier})`;
}
