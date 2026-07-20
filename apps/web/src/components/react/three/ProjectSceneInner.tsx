'use client';

import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
}

interface ProjectSceneInnerProps {
  modelUrl: string;
}

export default function ProjectSceneInner({ modelUrl }: ProjectSceneInnerProps) {
  return (
    <Canvas
      camera={{ position: [0, 1, 3], fov: 50 }}
      className="r3f"
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 5]} intensity={1} />
      <Suspense fallback={null}>
        <Model url={modelUrl} />
      </Suspense>
      <OrbitControls
        enablePan={false}
        enableZoom={true}
        autoRotate
        autoRotateSpeed={1}
      />
    </Canvas>
  );
}
