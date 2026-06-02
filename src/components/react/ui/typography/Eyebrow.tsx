import type { CSSProperties, ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export interface EyebrowProps {
  /** Rendered element — defaults to `p`. */
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * Eyebrow — the small mono, uppercase, accent-colored kicker above a heading.
 * (`.ds-eyebrow`). Server-safe. Pass `style={{ color: … }}` to recolor (e.g.
 * to a pillar accent). Canonical implementation — the style-guide `_shared`
 * Eyebrow re-exports this.
 */
export function Eyebrow({ as, className, style, children }: EyebrowProps) {
  const Tag = (as ?? 'p') as any;
  return (
    <Tag className={cn('ds-eyebrow', className)} style={style}>
      {children}
    </Tag>
  );
}
