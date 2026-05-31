'use client';

import type { CSSProperties, ReactNode } from 'react';
import { Bevel, type BevelProps } from '@/components/react/ui/Bevel';

/* Shared primitives for the style-guide panels. They recreate the brand
   system's layout vocabulary (.wrap / .section / .card / .btn / .pill) as
   small React components so the three panels stay readable. */

/** Reserve the left sub-nav rail (var set on .ds-scope at lg+). */
export const RAIL_PAD: CSSProperties = { paddingLeft: 'var(--left-sidebar-w, 0px)' };

/** Centered max-width container with the fluid page gutter. */
export function Wrap({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={className}
      style={{
        width: '100%',
        maxWidth: 'var(--maxw)',
        marginInline: 'auto',
        paddingInline: 'var(--gutter)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** A full-section band. Reserves the rail and applies the section rhythm. */
export function Section({
  id,
  children,
  className,
  style,
  pad = true,
}: {
  id: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Apply vertical section rhythm. Set false for custom (hero) bands. */
  pad?: boolean;
}) {
  return (
    <section
      data-section={id}
      className={className}
      style={{ ...RAIL_PAD, ...(pad ? { paddingBlock: 'var(--section-y)' } : null), ...style }}
    >
      {children}
    </section>
  );
}

export function Eyebrow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <p className="ds-eyebrow" style={style}>
      {children}
    </p>
  );
}

export function Pill({
  children,
  accent,
  color,
  style,
}: {
  children: ReactNode;
  accent?: boolean;
  /** Override color (e.g. a status token) for both text and border. */
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={`ds-pill${accent ? ' accent' : ''}`}
      style={color ? { color, borderColor: color, ...style } : style}
    >
      {children}
    </span>
  );
}

/** Heading row: a display H2 with an optional pill on the right. */
export function SectionHead({
  title,
  pill,
  pillAccent,
  style,
}: {
  title: ReactNode;
  pill?: ReactNode;
  pillAccent?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      className="flex items-baseline justify-between gap-4 flex-wrap"
      style={{ marginBottom: 'var(--s-5)', ...style }}
    >
      <h2 className="font-display" style={{ fontSize: 'var(--t-xl)', lineHeight: 'var(--lh-head)' }}>
        {title}
      </h2>
      {pill ? <Pill accent={pillAccent}>{pill}</Pill> : null}
    </div>
  );
}

/** Beveled surface card with the system's default card geometry + padding. */
export function Card({
  children,
  cut = 40,
  shoulder = 14,
  corners = 'br',
  fill = 'var(--surface)',
  stroke = 'var(--border)',
  interactive = false,
  padding = 'var(--s-6)',
  className,
  style,
  inspectorLabel = 'Card',
  ...rest
}: {
  children: ReactNode;
  cut?: number;
  shoulder?: number;
  corners?: BevelProps['corners'];
  fill?: string;
  stroke?: string;
  interactive?: boolean;
  padding?: string;
  className?: string;
  style?: CSSProperties;
  inspectorLabel?: string;
} & Omit<BevelProps, 'children' | 'cut' | 'shoulder' | 'corners' | 'fill' | 'stroke' | 'inspectorLabel'>) {
  return (
    <Bevel
      corners={corners}
      cut={cut}
      shoulder={shoulder}
      fill={fill}
      stroke={stroke}
      inspectorLabel={inspectorLabel}
      className={`ds-card${interactive ? ' ds-card-interactive' : ''}${className ? ` ${className}` : ''}`}
      style={{ padding, color: 'var(--fg)', ...style }}
      {...rest}
    >
      {children}
    </Bevel>
  );
}

/** Chamfered button (primary / secondary / ghost). */
export function DsButton({
  children,
  variant = 'primary',
  as = 'button',
  style,
  inspectorLabel,
  ...rest
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  as?: 'button' | 'span' | 'a';
  style?: CSSProperties;
  inspectorLabel?: string;
  [key: string]: unknown;
}) {
  const fill =
    variant === 'primary' ? 'var(--accent)' : variant === 'ghost' ? 'transparent' : 'transparent';
  const stroke = variant === 'secondary' ? 'var(--border-2)' : 'none';
  const color = variant === 'primary' ? 'var(--accent-fg)' : variant === 'ghost' ? 'var(--muted)' : 'var(--fg)';
  const label = inspectorLabel ?? `Button${typeof children === 'string' ? ` · ${children}` : ` · ${variant}`}`;
  return (
    <Bevel
      as={as}
      corners="br"
      radius={12}
      cut={16}
      shoulder={7}
      fill={fill}
      stroke={stroke}
      inspectorLabel={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--s-2)',
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--t-sm)',
        fontWeight: 600,
        lineHeight: 1,
        cursor: 'pointer',
        padding: '0.85rem 1.4rem',
        color,
        border: 0,
        ...style,
      }}
      {...rest}
    >
      {children}
    </Bevel>
  );
}

/** A bare swatch chip. */
export function Swatch({ background, style }: { background: string; style?: CSSProperties }) {
  return (
    <span
      style={{
        aspectRatio: '1',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border)',
        background,
        ...style,
      }}
    />
  );
}
