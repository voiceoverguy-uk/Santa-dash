import { useMemo, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { SANTA_RUN, SANTA_FALL, SANTA_HIT, SANTA_HIT_ICE } from "./assets";
import type { World } from "./world";

interface Props {
  world: React.MutableRefObject<World>;
}

export function Santa({ world }: Props) {
  const runTextures = useLoader(THREE.TextureLoader, SANTA_RUN);
  const fallTextures = useLoader(THREE.TextureLoader, SANTA_FALL);
  const hitTextures = useLoader(THREE.TextureLoader, SANTA_HIT);
  const iceTextures = useLoader(THREE.TextureLoader, SANTA_HIT_ICE);

  useMemo(() => {
    const all = [...runTextures, ...fallTextures, ...hitTextures, ...iceTextures];
    for (const t of all) {
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.LinearMipMapLinearFilter;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
    }
  }, [runTextures, fallTextures, hitTextures, iceTextures]);

  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(() => {
    const w = world.current;
    if (!meshRef.current || !matRef.current) return;
    meshRef.current.position.x = w.santaX;
    meshRef.current.position.y = w.santaY;

    // Choose animation
    let textures = runTextures;
    let frameIndex = 0;
    if (w.isFalling) {
      textures = fallTextures;
      frameIndex = Math.min(
        fallTextures.length - 1,
        Math.floor(w.fallTimer * 14),
      );
    } else if (w.hitTimer > 0) {
      textures = w.hitKind === "ice" ? iceTextures : hitTextures;
      const elapsed = 0.9 - w.hitTimer;
      frameIndex = Math.min(textures.length - 1, Math.floor(elapsed * 22));
    } else if (!w.onGround) {
      // Use a mid-frame from run as a "jump pose" — no dedicated jump frames
      frameIndex = 12;
      textures = runTextures;
    } else {
      frameIndex = Math.floor(w.runFrame) % runTextures.length;
    }

    matRef.current.map = textures[frameIndex] ?? null;
    matRef.current.needsUpdate = true;

    // Slight invulnerability flash
    if (w.hitTimer > 0 && w.hitKind !== "ice") {
      const blink = Math.floor(w.hitTimer * 18) % 2 === 0;
      matRef.current.opacity = blink ? 0.4 : 1;
    } else {
      matRef.current.opacity = 1;
    }
  });

  return (
    <mesh ref={meshRef} position={[0, 1, 0.5]}>
      <planeGeometry args={[2.4, 2.4]} />
      <meshBasicMaterial
        ref={matRef}
        map={runTextures[0]}
        transparent
        alphaTest={0.05}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  );
}
