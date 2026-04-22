import { useMemo, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { SANTA_RUN, SANTA_FALL, SANTA_IDLE, SANTA_HIT, SANTA_HIT_ICE } from "./assets";
import { store } from "./store";
import type { World } from "./world";

interface Props {
  world: React.MutableRefObject<World>;
}

export function Santa({ world }: Props) {
  const runTextures = useLoader(THREE.TextureLoader, SANTA_RUN);
  const fallTextures = useLoader(THREE.TextureLoader, SANTA_FALL);
  const idleTextures = useLoader(THREE.TextureLoader, SANTA_IDLE);
  const hitTextures = useLoader(THREE.TextureLoader, SANTA_HIT);
  const iceTextures = useLoader(THREE.TextureLoader, SANTA_HIT_ICE);

  useMemo(() => {
    const all = [
      ...runTextures, ...fallTextures, ...idleTextures,
      ...hitTextures, ...iceTextures,
    ];
    for (const t of all) {
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.LinearMipMapLinearFilter;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
    }
  }, [runTextures, fallTextures, idleTextures, hitTextures, iceTextures]);

  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const idleTimer = useRef(0);

  useFrame((_, dt) => {
    const w = world.current;
    if (!meshRef.current || !matRef.current) return;
    meshRef.current.position.x = w.santaX;
    meshRef.current.position.y = w.santaY;

    const status = store.get().status;
    const isWaiting = status === "ready" || status === "menu";

    // Choose animation
    let textures = runTextures;
    let frameIndex = 0;
    if (isWaiting && w.onGround && w.hitTimer <= 0 && !w.isFalling) {
      // Standing still on the rooftop before the run begins — play the
      // 15-frame idle (blink + mouth open) at ~12fps.
      idleTimer.current += dt;
      textures = idleTextures;
      frameIndex = Math.floor(idleTimer.current * 12) % idleTextures.length;
    } else if (w.isFalling) {
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
      // Airborne — cycle through the 6-frame fall sequence so Santa's
      // arms wave during the jump arc instead of holding a static pose.
      idleTimer.current += dt;
      textures = fallTextures;
      frameIndex = Math.floor(idleTimer.current * 18) % fallTextures.length;
    } else {
      idleTimer.current = 0;
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
