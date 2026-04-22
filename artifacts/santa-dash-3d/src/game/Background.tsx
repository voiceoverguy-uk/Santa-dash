import { useMemo, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { BG } from "./assets";
import type { World } from "./world";

interface Props {
  world: React.MutableRefObject<World>;
}

export function Background({ world }: Props) {
  const snowTex = useLoader(THREE.TextureLoader, BG.snow);

  useMemo(() => {
    snowTex.colorSpace = THREE.SRGBColorSpace;
    snowTex.wrapS = THREE.RepeatWrapping;
    snowTex.wrapT = THREE.ClampToEdgeWrapping;
    snowTex.repeat.set(1, 1);
    snowTex.anisotropy = 8;
  }, [snowTex]);

  const farRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const w = world.current;
    // Parallax — using texture offset rather than mesh position keeps the
    // backdrop visually anchored at every camera position
    if (farRef.current) {
      const m = farRef.current.material as THREE.MeshBasicMaterial;
      if (m.map) {
        m.map.offset.x = (w.santaX * 0.012) % 1;
      }
      farRef.current.position.x = w.santaX;
    }
  });

  // Single snowy mountain backdrop — we used to render a second tighter-tiled
  // copy in front for "depth", but because it's the same source image it just
  // looked like a doubled scene. One layer reads cleaner.
  const farTex = useMemo(() => {
    const t = snowTex.clone();
    t.needsUpdate = true;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.repeat.set(2, 1);
    return t;
  }, [snowTex]);

  return (
    <>
      {/* Sky gradient */}
      <mesh position={[0, 10, -70]}>
        <planeGeometry args={[500, 80]} />
        <shaderMaterial
          attach="material"
          args={[{
            uniforms: {},
            vertexShader: `
              varying vec2 vUv;
              void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
              }
            `,
            fragmentShader: `
              varying vec2 vUv;
              void main() {
                vec3 top = vec3(0.05, 0.10, 0.22);
                vec3 mid = vec3(0.20, 0.27, 0.48);
                vec3 horizon = vec3(0.95, 0.62, 0.50);
                float t = vUv.y;
                vec3 col = mix(horizon, mid, smoothstep(0.0, 0.45, t));
                col = mix(col, top, smoothstep(0.55, 1.0, t));
                gl_FragColor = vec4(col, 1.0);
              }
            `,
          }]}
        />
      </mesh>

      {/* Soft moon */}
      <mesh position={[10, 17, -55]}>
        <circleGeometry args={[2.6, 32]} />
        <meshBasicMaterial color="#fff5d8" toneMapped={false} />
      </mesh>
      <mesh position={[10, 17, -55.1]}>
        <circleGeometry args={[3.8, 32]} />
        <meshBasicMaterial color="#ffd97a" transparent opacity={0.22} toneMapped={false} />
      </mesh>

      {/* Far snowy mountain backdrop — big, soft, tiles smoothly. Custom shader
          so the top edge fades out into the sky and there's no visible seam. */}
      <mesh ref={farRef} position={[0, 6, -45]}>
        <planeGeometry args={[160, 26]} />
        <shaderMaterial
          attach="material"
          transparent
          args={[{
            uniforms: { map: { value: farTex } },
            vertexShader: `
              varying vec2 vUv;
              void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
              }
            `,
            fragmentShader: `
              uniform sampler2D map;
              varying vec2 vUv;
              void main() {
                vec4 tex = texture2D(map, vUv);
                // Fade out the top 35% so the plane edge disappears into the sky
                float topFade = smoothstep(1.0, 0.65, vUv.y);
                gl_FragColor = vec4(tex.rgb, tex.a * topFade);
              }
            `,
          }]}
        />
      </mesh>

    </>
  );
}
