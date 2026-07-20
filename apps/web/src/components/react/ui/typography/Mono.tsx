import type { CSSProperties, ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export interface MonoProps {
  /** Rendered element — defaults to `span`. Ignored when `code` is set. */
  as?: ElementType;
  /** Render as a semantic `<code>` element. */
  code?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * Mono — Geist Mono with tabular figures (`.ds-mono`). For codes, IDs, and
 * numeric/data contexts that need aligned digits. Server-safe.
 */
export function Mono({ as, code = false, className, style, children }: MonoProps) {
  const Tag = (code ? 'code' : (as ?? 'span')) as any;
  return (
    <Tag className={cn('ds-mono', className)} style={style}>
      {children}
    </Tag>
  );
}
