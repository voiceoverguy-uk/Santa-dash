import { useMemo, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { BG } from "./assets";
import type { World } from "./world";

interface Props {
  world: React.MutableRefObject<World>;
}

// snow.jpg is an 8832×1242 painted panorama — the entire backdrop including
// sky, mountains, trees, distant snowmen, fences, frozen waterfall, etc.
// Aspect ratio ~ 7.11. We display it at its true aspect, fill the camera
// viewport vertically, and pan UVs horizontally for a slow parallax behind
// Santa. No procedural sky / moon — the painting handles all of that.
const PANORAMA_ASPECT = 8832 / 1242;
// Plane is sized large enough to fully cover the orthographic viewport in
// any sane aspect ratio (portrait phones included) so the painted scene
// never leaves a clear-color band above or below it. Width follows the
// panorama's true aspect to avoid stretching.
const PANORAMA_PLANE_H = 28;
const PANORAMA_PLANE_W = PANORAMA_PLANE_H * PANORAMA_ASPECT;

export function Background({ world }: Props) {
  const snowTex = useLoader(THREE.TextureLoader, BG.snow);

  const farTex = useMemo(() => {
    const t = snowTex.clone();
    t.needsUpdate = true;
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = 8;
    return t;
  }, [snowTex]);

  const farRef = useRef<THREE.Mesh>(null);

  // Uniform driving the slow horizontal parallax. The fragment shader adds
  // this to the sampled U coordinate so the painted scene drifts behind
  // Santa at roughly 1/3 his apparent speed.
  const farUniforms = useMemo(
    () => ({
      map: { value: farTex },
      uOffset: { value: 0 },
    }),
    [farTex],
  );

  useFrame(({ camera }) => {
    const w = world.current;
    const cx = camera.position.x;
    const cy = camera.position.y;
    if (farRef.current) {
      // Pin the panorama to the camera so it always fills the viewport,
      // independent of how high Santa jumps (camera Y follows him).
      farRef.current.position.set(cx, cy + 1.2, -20);
      // Slow parallax — full panorama loops every ~330 santaX units. The
      // texture wraps via RepeatWrapping so there's no hard reset.
      farUniforms.uOffset.value = w.santaX * 0.003;
    }
  });

  return (
    <mesh ref={farRef} position={[0, 1.2, -20]}>
      <planeGeometry args={[PANORAMA_PLANE_W, PANORAMA_PLANE_H]} />
      <shaderMaterial
        attach="material"
        args={[{
          uniforms: farUniforms,
          vertexShader: `
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            uniform sampler2D map;
            uniform float uOffset;
            varying vec2 vUv;
            void main() {
              vec2 uv = vec2(vUv.x + uOffset, vUv.y);
              gl_FragColor = texture2D(map, uv);
            }
          `,
        }]}
      />
    </mesh>
  );
}
