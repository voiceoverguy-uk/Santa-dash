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
    const ortho = camera as THREE.OrthographicCamera;
    const isPortrait = size.height > size.width;
    const visibleWidth = isPortrait ? 14 : 22;
    ortho.zoom = size.width / visibleWidth;
    ortho.position.z = 20;
    ortho.updateProjectionMatrix();
  }, [camera, size.width, size.height]);

  useFrame((_, dt) => {
    const w = world.current;
    targetX.current = w.santaX + 4;
    const desiredY = Math.max(2.5, w.santaY - 1.0);
    targetY.current += (desiredY - targetY.current) * Math.min(1, dt * 4);
    camera.position.x += (targetX.current - camera.position.x) * Math.min(1, dt * 5);
    camera.position.y += (targetY.current - camera.position.y) * Math.min(1, dt * 4);
    camera.lookAt(camera.position.x, camera.position.y, 0);
  });

  return null;
}
