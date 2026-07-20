'use client';

import { SkeletonPanel } from '../ui/SkeletonPanel';

interface SceneLoaderProps {
  className?: string;
}

export function SceneLoader({ className }: SceneLoaderProps) {
  return (
    <div className={`flex items-center justify-center ${className ?? ''}`}>
      <SkeletonPanel lines={2} className="w-full h-full min-h-[200px]" />
    </div>
  );
}
