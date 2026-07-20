'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
}

export function GlassCard({ children, className }: GlassCardProps) {
  return (
    <div className={cn('glass p-5', className)}>
      {children}
    </div>
  );
}
