'use client';

import { cn } from '@/lib/utils/cn';

interface ChatAvatarProps {
  size?: 'sm' | 'md';
  className?: string;
}

const sizeMap = {
  sm: 'h-7 w-7',
  md: 'h-9 w-9',
} as const;

const iconSizeMap = {
  sm: 16,
  md: 20,
} as const;

export function ChatAvatar({ size = 'md', className }: ChatAvatarProps) {
  const dim = iconSizeMap[size];

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-lg',
        'bg-accent/10 ring-1 ring-accent/25',
        sizeMap[size],
        className
      )}
    >
      <svg
        width={dim}
        height={dim}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Antenna */}
        <line
          x1="12"
          y1="2"
          x2="12"
          y2="5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          className="text-accent"
        />
        <circle cx="12" cy="2" r="1" className="fill-accent" />

        {/* Head */}
        <rect
          x="5"
          y="5"
          width="14"
          height="10"
          rx="3"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-accent"
        />

        {/* Eyes */}
        <circle cx="9" cy="10" r="1.5" className="fill-accent" />
        <circle cx="15" cy="10" r="1.5" className="fill-accent" />

        {/* Mouth / speaker grille */}
        <line
          x1="9"
          y1="13"
          x2="15"
          y2="13"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
          className="text-accent/60"
        />

        {/* Neck */}
        <line
          x1="12"
          y1="15"
          x2="12"
          y2="17"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          className="text-accent"
        />

        {/* Body */}
        <rect
          x="7"
          y="17"
          width="10"
          height="5"
          rx="2"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-accent"
        />
      </svg>
    </div>
  );
}
