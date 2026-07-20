'use client';

import { AnimatedCounter } from '@/components/react/ui/AnimatedCounter';
import { StatusIndicator } from '@/components/react/ui/StatusIndicator';
import { Eyebrow, Mono } from '@/components/react/ui/typography';
import { BasePanel } from './BasePanel';

interface DataPanelProps {
  label: string;
  value: number;
  suffix?: string;
  trend?: 'up' | 'down' | 'neutral';
  status?: 'online' | 'offline' | 'busy';
}

const trendIcons: Record<string, { symbol: string; color: string }> = {
  up: { symbol: '\u2191', color: 'text-success' },
  down: { symbol: '\u2193', color: 'text-warning' },
  neutral: { symbol: '\u2192', color: 'text-muted' },
};

export function DataPanel({
  label,
  value,
  suffix,
  trend,
  status,
}: DataPanelProps) {
  return (
    <BasePanel>
      <div className="flex items-start justify-between">
        <div>
          <Eyebrow className="text-xs" style={{ color: 'var(--muted)' }}>{label}</Eyebrow>
          <Mono className="mt-1 block font-display text-2xl font-semibold text-foreground">
            <AnimatedCounter target={value} suffix={suffix} />
            {trend && (
              <span
                className={`ml-2 text-sm ${trendIcons[trend].color}`}
              >
                {trendIcons[trend].symbol}
              </span>
            )}
          </Mono>
        </div>
        {status && (
          <StatusIndicator status={status} label={status} size="md" />
        )}
      </div>
    </BasePanel>
  );
}
