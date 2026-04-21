import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { World } from "./world";

interface Props {
  world: React.MutableRefObject<World>;
}

const COUNT = 140;

export function Snow({ world }: Props) {
  const pointsRef = useRef<THREE.Points>(null);
  const positions = useMemo(() => new Float32Array(COUNT * 3), []);
  const velocities = useMemo(
    () => new Float32Array(COUNT).map(() => 0.6 + Math.random() * 1.2),
    [],
  );
  const drifts = useMemo(
    () => new Float32Array(COUNT).map(() => Math.random() * Math.PI * 2),
    [],
  );

  useMemo(() => {
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 60;
      positions[i * 3 + 1] = Math.random() * 22;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 14;
    }
  }, [positions]);

  useFrame((_, dt) => {
    const w = world.current;
    if (!pointsRef.current) return;
    const arr = positions;
    const t = performance.now() * 0.001;
    for (let i = 0; i < COUNT; i++) {
      arr[i * 3 + 1] -= velocities[i] * dt * 4;
      arr[i * 3 + 0] += Math.sin(t + drifts[i]) * dt * 0.4;
      if (arr[i * 3 + 1] < -3) {
        arr[i * 3 + 1] = 22;
        arr[i * 3 + 0] = w.santaX + (Math.random() - 0.5) * 60;
        arr[i * 3 + 2] = (Math.random() - 0.5) * 14;
      }
    }
    pointsRef.current.position.x = 0;
    (pointsRef.current.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={COUNT}
          array={positions}
          itemSize={3}
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#ffffff"
        size={0.18}
        sizeAttenuation
        transparent
        opacity={0.85}
        depthWrite={false}
      />
    </points>
  );
}
