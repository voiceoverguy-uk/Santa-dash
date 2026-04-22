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
    snowTex.anisotropy = 8;
  }, [snowTex]);

  const farRef = useRef<THREE.Mesh>(null);
  const skyRef = useRef<THREE.Mesh>(null);
  const moonRef = useRef<THREE.Mesh>(null);
  const moonGlowRef = useRef<THREE.Mesh>(null);

  const farTex = useMemo(() => {
    const t = snowTex.clone();
    t.needsUpdate = true;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.repeat.set(2, 1);
    return t;
  }, [snowTex]);

  useFrame(({ camera }) => {
    const w = world.current;
    // Pin the backdrop to the camera so it always fills the viewport,
    // independent of how high Santa jumps (camera Y follows him).
    const cx = camera.position.x;
    const cy = camera.position.y;
    if (skyRef.current) skyRef.current.position.set(cx, cy + 4, -30);
    if (moonGlowRef.current) moonGlowRef.current.position.set(cx + 6, cy + 7, -25);
    if (moonRef.current) moonRef.current.position.set(cx + 6, cy + 7, -24);
    if (farRef.current) {
      const m = farRef.current.material as THREE.MeshBasicMaterial;
      if (m.map) m.map.offset.x = (w.santaX * 0.012) % 1;
      farRef.current.position.set(cx, cy + 0.5, -20);
    }
  });

  return (
    <>
      {/* Flat painted sky — single gradient plane, always behind everything */}
      <mesh ref={skyRef} position={[0, 8, -30]}>
        <planeGeometry args={[80, 50]} />
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
      <mesh ref={moonGlowRef} position={[6, 11, -25]}>
        <circleGeometry args={[2.6, 32]} />
        <meshBasicMaterial color="#ffd97a" transparent opacity={0.22} toneMapped={false} />
      </mesh>
      <mesh ref={moonRef} position={[6, 11, -24]}>
        <circleGeometry args={[1.6, 32]} />
        <meshBasicMaterial color="#fff5d8" toneMapped={false} />
      </mesh>

      {/* Snowy mountain backdrop — painted flat, fades into sky at the top */}
      <mesh ref={farRef} position={[0, 4, -20]}>
        <planeGeometry args={[100, 18]} />
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
