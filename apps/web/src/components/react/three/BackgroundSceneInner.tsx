'use client';

import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { Mesh } from 'three';

function FloatingGeometry() {
  const meshRef = useRef<Mesh>(null);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    meshRef.current.rotation.x += delta * 0.1;
    meshRef.current.rotation.y += delta * 0.15;
  });

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[1, 1]} />
      <meshStandardMaterial
        color="#00e5ff"
        wireframe
        transparent
        opacity={0.3}
      />
    </mesh>
  );
}

export default function BackgroundSceneInner() {
  return (
    <Canvas
      camera={{ position: [0, 0, 4], fov: 45 }}
      className="r3f"
      gl={{ antialias: false, alpha: true }}
    >
      <ambientLight intensity={0.2} />
      <pointLight position={[5, 5, 5]} intensity={0.5} color="#00e5ff" />
      <FloatingGeometry />
    </Canvas>
  );
}
