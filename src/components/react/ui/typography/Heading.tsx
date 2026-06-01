import type { CSSProperties, ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type HeadingSize = 'display' | 'h1' | 'h2' | 'h3' | 'md' | 'base' | 'sm';

/** Default size per semantic level (maps to the fluid --t-* scale). */
const SIZE_BY_LEVEL: Record<HeadingLevel, HeadingSize> = {
  1: 'h1',
  2: 'h2',
  3: 'h3',
  4: 'md',
  5: 'base',
  6: 'sm',
};

const SIZE_CLASS: Record<HeadingSize, string> = {
  display: 't-display',
  h1: 't-h1',
  h2: 't-h2',
  h3: 't-h3',
  md: 't-md',
  base: 't-base',
  sm: 't-sm',
};

export interface HeadingProps {
  /** Semantic level — picks the rendered tag (h1–h6) and the default size. */
  level?: HeadingLevel;
  /** Override the rendered element (e.g. a visual h1 that is semantically a div). */
  as?: ElementType;
  /**
   * Display voice: Eurostile Black + italic + UPPERCASE (`.type-display`).
   * Defaults to `true` for every level — the system default heading treatment.
   * Set `false` for the lighter Eurostile-600 sub-head (`.type-heading`).
   */
  display?: boolean;
  /** Expressive lockup: italic Black, lowercase, tight tracking (hero moments). */
  expressive?: boolean;
  /** Force/suppress UPPERCASE independent of the treatment. */
  caps?: boolean;
  /** Force/suppress italic independent of the treatment. */
  italic?: boolean;
  /** Override the size independently of `level`. */
  size?: HeadingSize;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * Heading — the Warehaus display voice. Eurostile Black/italic/UPPERCASE by
 * default (the system heading treatment), backed by the fluid --t-* scale.
 * Server-safe. Composes the global `.type-*`/`.t-*` classes; `caps`/`italic`
 * overrides are emitted as Tailwind utilities so they reliably win over the
 * `@layer components` treatment.
 */
export function Heading({
  level = 2,
  as,
  display = true,
  expressive = false,
  caps,
  italic,
  size,
  className,
  style,
  children,
}: HeadingProps) {
  const Tag = (as ?? `h${level}`) as any;

  const treatment = expressive
    ? 'type-display-expressive'
    : display
      ? 'type-display'
      : 'type-heading';

  const sizeClass = SIZE_CLASS[size ?? SIZE_BY_LEVEL[level]];

  const capsClass = caps === true ? 'uppercase' : caps === false ? 'normal-case' : undefined;
  const italicClass = italic === true ? 'italic' : italic === false ? 'not-italic' : undefined;

  return (
    <Tag className={cn(treatment, sizeClass, capsClass, italicClass, className)} style={style}>
      {children}
    </Tag>
  );
}
