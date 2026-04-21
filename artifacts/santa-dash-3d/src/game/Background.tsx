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
  }, [snowTex]);

  const farRef = useRef<THREE.Mesh>(null);
  const midRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const w = world.current;
    if (farRef.current) farRef.current.position.x = w.santaX * 0.05;
    if (midRef.current) midRef.current.position.x = w.santaX * 0.2;
  });

  return (
    <>
      {/* Sky gradient via large plane behind everything */}
      <mesh position={[0, 8, -60]}>
        <planeGeometry args={[400, 80]} />
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
                vec3 top = vec3(0.04, 0.09, 0.18);
                vec3 mid = vec3(0.18, 0.25, 0.45);
                vec3 horizon = vec3(0.85, 0.55, 0.45);
                float t = vUv.y;
                vec3 col = mix(horizon, mid, smoothstep(0.0, 0.5, t));
                col = mix(col, top, smoothstep(0.5, 1.0, t));
                gl_FragColor = vec4(col, 1.0);
              }
            `,
          }]}
        />
      </mesh>

      {/* Far snow mountains — billboard image */}
      <mesh ref={farRef} position={[0, 4, -40]}>
        <planeGeometry args={[160, 26]} />
        <meshBasicMaterial
          map={snowTex}
          toneMapped={false}
          transparent
          opacity={0.85}
        />
      </mesh>

      {/* Mid layer — pine trees as simple silhouettes */}
      <group ref={midRef} position={[0, 0, -18]}>
        <Trees />
      </group>

      {/* Soft moon */}
      <mesh position={[8, 16, -50]}>
        <circleGeometry args={[2.4, 32]} />
        <meshBasicMaterial color="#fff5d8" toneMapped={false} />
      </mesh>
      <mesh position={[8, 16, -50.1]}>
        <circleGeometry args={[3.4, 32]} />
        <meshBasicMaterial color="#ffd97a" transparent opacity={0.25} toneMapped={false} />
      </mesh>
    </>
  );
}

function Trees() {
  const positions = useMemo(() => {
    const out: { x: number; y: number; scale: number; shade: number }[] = [];
    let x = -120;
    while (x < 120) {
      out.push({
        x,
        y: -1 + Math.random() * 0.6,
        scale: 1.5 + Math.random() * 1.8,
        shade: 0.18 + Math.random() * 0.18,
      });
      x += 2.5 + Math.random() * 4;
    }
    return out;
  }, []);

  return (
    <>
      {positions.map((p, i) => (
        <group key={i} position={[p.x, p.y, 0]}>
          <mesh position={[0, p.scale * 1.2, 0]}>
            <coneGeometry args={[p.scale * 0.6, p.scale * 2.4, 6]} />
            <meshStandardMaterial color={`rgb(${Math.round(35 + p.shade * 20)}, ${Math.round(70 + p.shade * 50)}, ${Math.round(50 + p.shade * 30)})`} roughness={0.95} />
          </mesh>
          {/* Snow cap */}
          <mesh position={[0, p.scale * 2.0, 0.05]}>
            <coneGeometry args={[p.scale * 0.45, p.scale * 0.7, 6]} />
            <meshStandardMaterial color="#f6fbff" roughness={0.9} />
          </mesh>
        </group>
      ))}
    </>
  );
}
