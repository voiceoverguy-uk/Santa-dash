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
// Where the painted snowy ground meets the foreground props (fences,
// snowman, rocks) in snow.jpg, expressed as a fraction of the image
// height measured UP from the bottom edge. Anything below this line is
// just continuous packed snow that should sit behind the brick wall (and
// be hidden by it). Anchoring this row to world y = 0 (the brick top)
// makes the painted ground meet the rooftop snow caps cleanly instead of
// floating above them.
const GROUND_LINE_FROM_BOTTOM = 0.11;

export function Background({ world }: Props) {
  const snowTex = useLoader(THREE.TextureLoader, BG.snow);

  const farTex = useMemo(() => {
    const t = snowTex.clone();
    t.needsUpdate = true;
    t.colorSpace = THREE.SRGBColorSpace;
    // Mirror the panorama at the wrap point so the painted left edge
    // (mountain) and right edge (waterfall/rocks) never butt up against each
    // other and produce a visible seam. Mirroring flips the painting
    // horizontally each repeat, which keeps the horizon and snowy ground
    // continuous across the boundary.
    t.wrapS = THREE.MirroredRepeatWrapping;
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

    // Anchor the painted GROUND LINE of the panorama (where the foreground
    // snow meets the fences/snowman/rocks, ~11 % up from the bottom edge of
    // snow.jpg) to world y = 0 — the rooftop brick top. The lower band of
    // the painting hangs below y = 0 and gets hidden behind the brick wall;
    // sky and mountains fill the rest of the viewport. Plane stays anchored
    // in world Y regardless of camera rise during jumps; only the X follows
    // the camera for parallax.
    const groundOffset = GROUND_LINE_FROM_BOTTOM * planeH;
    farRef.current.position.set(camera.position.x, planeH / 2 - groundOffset, -20);
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
