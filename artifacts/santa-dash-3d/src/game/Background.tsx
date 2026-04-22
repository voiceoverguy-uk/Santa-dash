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

    // Scale the unit-height plane to (viewport + jump headroom) so the
    // painted sky above the rooftops never runs out when Santa jumps.
    // Headroom covers the maximum camera Y rise during a jump (~6 units).
    const HEADROOM = 10;
    const planeH = visibleH + HEADROOM;
    farRef.current.scale.set(planeH, planeH, 1);

    // Anchor the BOTTOM edge of the painted scene to the rooftop line
    // (world y = 0, where brick tops sit). The painted snowy ground at the
    // bottom of snow.jpg therefore always meets the brick tops, regardless
    // of how high the camera rises during a jump. Only follow the camera
    // horizontally for parallax.
    farRef.current.position.set(camera.position.x, planeH / 2, -20);
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
