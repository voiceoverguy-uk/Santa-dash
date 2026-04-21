import { useMemo, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { OBSTACLES, ROOFTOPS } from "./assets";
import type { World, Platform, Obstacle, Collectible } from "./world";
import { PLATFORM_TOP, SNOW_CAP_HEIGHT } from "./world";

interface Props {
  world: React.MutableRefObject<World>;
}

const PLATFORM_HEIGHT = 4.4;

export function WorldRender({ world }: Props) {
  const roofTextures = useLoader(THREE.TextureLoader, ROOFTOPS);
  const chimneyTex = useLoader(THREE.TextureLoader, OBSTACLES.chimney);
  const snowmanTex = useLoader(THREE.TextureLoader, OBSTACLES.snowman);
  const iceTex = useLoader(THREE.TextureLoader, OBSTACLES.ice);
  const mincePieTex = useLoader(THREE.TextureLoader, OBSTACLES.mincepie);

  useMemo(() => {
    const all = [...roofTextures, chimneyTex, snowmanTex, iceTex, mincePieTex];
    for (const t of all) {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearMipMapLinearFilter;
    }
    for (const t of roofTextures) {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.ClampToEdgeWrapping;
    }
  }, [roofTextures, chimneyTex, snowmanTex, iceTex, mincePieTex]);

  const platformGroupRef = useRef<THREE.Group>(null);
  const obstacleGroupRef = useRef<THREE.Group>(null);
  const collectibleGroupRef = useRef<THREE.Group>(null);

  const platformMap = useRef(new Map<number, THREE.Group>());
  const obstacleMap = useRef(new Map<number, THREE.Mesh>());
  const collectibleMap = useRef(new Map<number, THREE.Mesh>());

  useFrame(() => {
    const w = world.current;
    syncPlatforms(w.platforms, platformGroupRef.current!, platformMap.current, roofTextures);
    syncObstacles(
      w.obstacles,
      obstacleGroupRef.current!,
      obstacleMap.current,
      { chimneyTex, snowmanTex, iceTex },
    );
    syncCollectibles(
      w.collectibles,
      collectibleGroupRef.current!,
      collectibleMap.current,
      mincePieTex,
    );
  });

  return (
    <>
      <group ref={platformGroupRef} />
      <group ref={obstacleGroupRef} />
      <group ref={collectibleGroupRef} />
    </>
  );
}

function disposeMesh(mesh: THREE.Mesh) {
  mesh.geometry.dispose();
  const mat = mesh.material as THREE.Material | THREE.Material[];
  const mats = Array.isArray(mat) ? mat : [mat];
  for (const m of mats) {
    const anyMat = m as THREE.Material & { map?: THREE.Texture | null; userData: { ownsTexture?: boolean } };
    if (anyMat.map && anyMat.userData?.ownsTexture) anyMat.map.dispose();
    m.dispose();
  }
}

function syncPlatforms(
  platforms: Platform[],
  group: THREE.Group,
  map: Map<number, THREE.Group>,
  textures: THREE.Texture[],
) {
  const seen = new Set<number>();
  for (const p of platforms) {
    seen.add(p.id);
    let g = map.get(p.id);
    if (!g) {
      g = buildPlatformMesh(p, textures);
      map.set(p.id, g);
      group.add(g);
    }
    g.position.x = p.x + p.width / 2;
    g.position.y = p.topY;
  }
  for (const [id, mesh] of map) {
    if (!seen.has(id)) {
      group.remove(mesh);
      mesh.traverse((o) => { if (o instanceof THREE.Mesh) disposeMesh(o); });
      map.delete(id);
    }
  }
}

function buildPlatformMesh(p: Platform, textures: THREE.Texture[]): THREE.Group {
  const g = new THREE.Group();
  // Group is anchored at the brick TOP (y = p.topY in world).
  // Brick body extends downward from there.

  const tex = textures[p.variant % textures.length].clone();
  tex.needsUpdate = true;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  // Use a tighter horizontal repeat so the windows in the brick texture
  // appear at their natural aspect ratio rather than being stretched wide.
  // Each tile of the brick texture spans ~2.4 world units horizontally.
  const tilesX = Math.max(2, Math.round(p.width / 2.4));
  tex.repeat.set(tilesX, 1);

  // Brick body — sits below the brick top
  const bodyMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 });
  bodyMat.userData.ownsTexture = true;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(p.width, PLATFORM_HEIGHT, 2.4),
    bodyMat,
  );
  body.position.y = -PLATFORM_HEIGHT / 2;
  g.add(body);

  // Snow cap — sits ABOVE the brick top
  const snowMat = new THREE.MeshStandardMaterial({
    color: "#f8fcff",
    roughness: 0.85,
    emissive: "#cfe1ff",
    emissiveIntensity: 0.05,
  });
  const snow = new THREE.Mesh(
    new THREE.BoxGeometry(p.width, SNOW_CAP_HEIGHT, 2.6),
    snowMat,
  );
  snow.position.y = SNOW_CAP_HEIGHT / 2;
  g.add(snow);

  // Slightly drooping snow lip on the front edge for charm
  const lip = new THREE.Mesh(
    new THREE.BoxGeometry(p.width, 0.12, 0.18),
    snowMat,
  );
  lip.position.set(0, -0.02, 1.32);
  g.add(lip);

  return g;
}

function syncObstacles(
  obstacles: Obstacle[],
  group: THREE.Group,
  map: Map<number, THREE.Mesh>,
  textures: { chimneyTex: THREE.Texture; snowmanTex: THREE.Texture; iceTex: THREE.Texture },
) {
  const seen = new Set<number>();
  for (const o of obstacles) {
    seen.add(o.id);
    let m = map.get(o.id);
    if (!m) {
      let tex: THREE.Texture;
      let visW: number, visH: number;
      if (o.kind === "snowman") {
        tex = textures.snowmanTex;
        visW = o.w * 1.6;
        visH = o.h * 1.8;
      } else if (o.kind === "ice") {
        tex = textures.iceTex;
        visW = o.w * 1.3;
        visH = o.h * 2.2;
      } else {
        tex = textures.chimneyTex;
        visW = o.w * 1.6;
        visH = o.h * 1.9;
      }
      m = new THREE.Mesh(
        new THREE.PlaneGeometry(visW, visH),
        new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          alphaTest: 0.05,
          side: THREE.DoubleSide,
          toneMapped: false,
          depthWrite: false,
        }),
      );
      m.renderOrder = 5;
      map.set(o.id, m);
      group.add(m);
    }
    // Position so the bottom of the visual sprite sits on the snow surface (o.y)
    const visH = (m.geometry as THREE.PlaneGeometry).parameters.height;
    m.position.x = o.x;
    m.position.y = o.y + visH / 2;
    m.position.z = 0.6;
    m.visible = !o.hit || o.kind === "ice";
  }
  for (const [id, mesh] of map) {
    if (!seen.has(id)) {
      group.remove(mesh);
      disposeMesh(mesh);
      map.delete(id);
    }
  }
}

function syncCollectibles(
  collectibles: Collectible[],
  group: THREE.Group,
  map: Map<number, THREE.Mesh>,
  tex: THREE.Texture,
) {
  const seen = new Set<number>();
  for (const c of collectibles) {
    seen.add(c.id);
    let m = map.get(c.id);
    if (!m) {
      m = new THREE.Mesh(
        new THREE.PlaneGeometry(1.0, 1.0),
        new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          alphaTest: 0.05,
          side: THREE.DoubleSide,
          toneMapped: false,
          depthWrite: false,
        }),
      );
      m.renderOrder = 6;
      map.set(c.id, m);
      group.add(m);
    }
    m.position.x = c.x;
    m.position.y = c.y + Math.sin(performance.now() * 0.004 + c.id) * 0.08;
    m.position.z = 0.65;
    m.rotation.z = Math.sin(performance.now() * 0.003 + c.id) * 0.18;
    m.visible = !c.collected;
  }
  for (const [id, mesh] of map) {
    if (!seen.has(id)) {
      group.remove(mesh);
      disposeMesh(mesh);
      map.delete(id);
    }
  }
}

// avoid unused import warnings
PLATFORM_TOP;
