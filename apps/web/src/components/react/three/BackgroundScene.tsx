'use client';

import { Suspense, lazy, useSyncExternalStore } from 'react';
import { SceneLoader } from './SceneLoader';

const BackgroundCanvas = lazy(() => import('./BackgroundSceneInner'));

const emptySubscribe = () => () => {};
function useIsMounted() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false);
}

interface BackgroundSceneProps {
  className?: string;
}

export function BackgroundScene({ className = '' }: BackgroundSceneProps) {
  const mounted = useIsMounted();

  if (!mounted) return null;

  return (
    <div className={`pointer-events-none ${className}`}>
      <Suspense fallback={<SceneLoader className="h-full w-full" />}>
        <BackgroundCanvas />
      </Suspense>
    </div>
  );
}
