import type { CSSProperties, ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export type TextSize = 'sm' | 'base' | 'lg';

const SIZE_CLASS: Record<TextSize, string> = {
  sm: 't-sm',
  base: 't-base',
  lg: 't-md',
};

export interface TextProps {
  /** Rendered element — defaults to `p`. */
  as?: ElementType;
  /** Body size: sm / base / lg (→ --t-sm / --t-base / --t-md). */
  size?: TextSize;
  /** Lead paragraph: --t-md, muted, lh 1.5, max 56ch (`.ds-lead`). Overrides `size`. */
  lead?: boolean;
  /** Mute to the secondary text color. */
  muted?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * Text — the Geist body voice. Defaults to 1rem at the brand body line-height
 * (--lh-body, 1.6). `lead` switches to the muted lead-paragraph treatment.
 * Server-safe.
 */
export function Text({
  as,
  size = 'base',
  lead = false,
  muted = false,
  className,
  style,
  children,
}: TextProps) {
  const Tag = (as ?? 'p') as any;
  const base = lead ? 'ds-lead' : SIZE_CLASS[size];

  return (
    <Tag
      className={cn(base, muted && !lead ? 'text-muted' : undefined, className)}
      style={{ lineHeight: lead ? undefined : 'var(--lh-body)', ...style }}
    >
      {children}
    </Tag>
  );
}
