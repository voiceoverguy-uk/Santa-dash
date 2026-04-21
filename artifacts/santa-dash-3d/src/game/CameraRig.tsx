import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { World } from "./world";

interface Props {
  world: React.MutableRefObject<World>;
}

export function CameraRig({ world }: Props) {
  const { camera, size } = useThree();
  const targetX = useRef(0);
  const targetY = useRef(2.5);

  useEffect(() => {
    // Adjust camera distance based on aspect ratio so mobile portrait still sees enough
    const isPortrait = size.height > size.width;
    const baseZ = isPortrait ? 18 : 13;
    camera.position.set(4, 4, baseZ);
    (camera as THREE.PerspectiveCamera).fov = isPortrait ? 60 : 50;
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
  }, [camera, size.width, size.height]);

  useFrame((_, dt) => {
    const w = world.current;
    targetX.current = w.santaX + 4;
    // Camera Y follows santa loosely so jumps feel anchored but big drops still visible
    const desiredY = Math.max(2.5, w.santaY - 1.5);
    targetY.current += (desiredY - targetY.current) * Math.min(1, dt * 4);
    camera.position.x += (targetX.current - camera.position.x) * Math.min(1, dt * 5);
    camera.position.y += (targetY.current - camera.position.y) * Math.min(1, dt * 4);
    camera.lookAt(camera.position.x, targetY.current, 0);
  });

  return null;
}
