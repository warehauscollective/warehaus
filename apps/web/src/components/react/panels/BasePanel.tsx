'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { Heading, Text } from '@/components/react/ui/typography';

interface BasePanelProps {
  title?: string;
  subtitle?: string;
  headerAction?: ReactNode;
  colSpan?: 1 | 2 | 3 | 4;
  rowSpan?: 1 | 2 | 3;
  className?: string;
  children: ReactNode;
}

const colSpanClasses: Record<number, string> = {
  1: 'col-span-1',
  2: 'col-span-2',
  3: 'col-span-3',
  4: 'col-span-4',
};

const rowSpanClasses: Record<number, string> = {
  1: 'row-span-1',
  2: 'row-span-2',
  3: 'row-span-3',
};

export function BasePanel({
  title,
  subtitle,
  headerAction,
  colSpan,
  rowSpan,
  className,
  children,
}: BasePanelProps) {
  const hasHeader = title || subtitle || headerAction;

  return (
    <div
      className={cn(
        'glass p-[var(--panel-padding)] border border-border-subtle transition-colors duration-300 hover:border-accent/40',
        colSpan && colSpanClasses[colSpan],
        rowSpan && rowSpanClasses[rowSpan],
        className,
      )}
    >
      {hasHeader && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && (
              <Heading level={3} display={false} className="truncate text-sm text-foreground">
                {title}
              </Heading>
            )}
            {subtitle && (
              <Text size="sm" muted className="mt-0.5 truncate text-xs">
                {subtitle}
              </Text>
            )}
          </div>
          {headerAction && (
            <div className="shrink-0">{headerAction}</div>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
