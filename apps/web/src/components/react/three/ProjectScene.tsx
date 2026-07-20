'use client';

import { Suspense, lazy, useSyncExternalStore } from 'react';
import { SceneLoader } from './SceneLoader';

const ThreeScene = lazy(() => import('./ProjectSceneInner'));

const emptySubscribe = () => () => {};
function useIsMounted() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false);
}

interface ProjectSceneProps {
  modelUrl: string;
  className?: string;
}

export function ProjectScene({ modelUrl, className = '' }: ProjectSceneProps) {
  const mounted = useIsMounted();

  if (!mounted) return <SceneLoader className={`h-full w-full ${className}`} />;

  return (
    <div className={`h-full w-full ${className}`}>
      <Suspense fallback={<SceneLoader className="h-full w-full" />}>
        <ThreeScene modelUrl={modelUrl} />
      </Suspense>
    </div>
  );
}
