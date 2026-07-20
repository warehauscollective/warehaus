'use client';

import { cn } from '@/lib/utils/cn';

interface StatusIndicatorProps {
  status: 'online' | 'offline' | 'busy';
  label?: string;
  size?: 'sm' | 'md';
}

const statusColors: Record<StatusIndicatorProps['status'], string> = {
  online: 'bg-success',
  offline: 'bg-muted',
  busy: 'bg-warning',
};

const pingColors: Record<StatusIndicatorProps['status'], string> = {
  online: 'bg-success/60',
  offline: '',
  busy: '',
};

const sizeClasses: Record<NonNullable<StatusIndicatorProps['size']>, string> = {
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
};

export function StatusIndicator({
  status,
  label,
  size = 'sm',
}: StatusIndicatorProps) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative inline-flex">
        {status === 'online' && (
          <span
            className={cn(
              'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
              pingColors[status],
            )}
          />
        )}
        <span
          className={cn(
            'relative inline-block rounded-full',
            sizeClasses[size],
            statusColors[status],
          )}
        />
      </span>
      {label && (
        <span className="text-xs capitalize text-muted">{label}</span>
      )}
    </span>
  );
}
