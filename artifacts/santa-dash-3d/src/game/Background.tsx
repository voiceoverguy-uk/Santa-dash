import { useMemo, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { BG } from "./assets";
import type { World } from "./world";

interface Props {
  world: React.MutableRefObject<World>;
}

// snow.jpg is an 8832×1242 painted panorama — sky, mountains, painted snowy
// ground, distant trees, etc. We want the WHOLE painting visible vertically
// behind Santa (so the player sees sky → mountains → ground meeting the
// rooftops, just like the iOS original) — never zoomed-in on a middle band.
// Each frame we resize the plane to match the orthographic camera's actual
// visible viewport and pin it behind the camera, scrolling UVs horizontally
// for slow parallax.
const PANORAMA_ASPECT = 8832 / 1242;
// Geometry baseline — actual world size is set via mesh.scale per frame so
// the painting always exactly fills the viewport vertically.
const BASE_PLANE_H = 1;
const BASE_PLANE_W = PANORAMA_ASPECT;

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
    const ortho = camera as THREE.OrthographicCamera;
    if (!farRef.current) return;

    // Compute the actual visible world-space height of the orthographic
    // viewport. (camera.top - camera.bottom) is the unzoomed frustum, divided
    // by zoom gives the true visible world height.
    const visibleH = (ortho.top - ortho.bottom) / ortho.zoom;

    // Scale the unit-height plane to fully fill the viewport vertically while
    // preserving the panorama's natural aspect (so mountains/ground are not
    // stretched).
    farRef.current.scale.set(visibleH, visibleH, 1);

    // Pin the plane to the camera so the full painted scene is always
    // visible no matter how high Santa jumps. UV offset gives the parallax.
    farRef.current.position.set(camera.position.x, camera.position.y, -20);
    farUniforms.uOffset.value = w.santaX * 0.003;
  });

  return (
    <mesh ref={farRef} position={[0, 0, -20]}>
      <planeGeometry args={[BASE_PLANE_W, BASE_PLANE_H]} />
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
