'use client';

import { cn } from '@/lib/utils/cn';

interface SkeletonPanelProps {
  className?: string;
  lines?: number;
}

export function SkeletonPanel({ className, lines = 3 }: SkeletonPanelProps) {
  return (
    <div
      className={cn(
        'rounded-[var(--panel-radius)] border border-border-subtle bg-surface p-[var(--panel-padding)]',
        className,
      )}
    >
      {/* Title skeleton */}
      <div className="mb-4 h-4 w-1/3 animate-pulse rounded bg-surface-elevated" />

      {/* Line skeletons */}
      <div className="space-y-3">
        {Array.from({ length: lines }, (_, i) => (
          <div
            key={i}
            className={cn(
              'h-3 animate-pulse rounded bg-surface-elevated',
              i === lines - 1 ? 'w-2/3' : 'w-full',
            )}
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
