import { useMemo, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { OBSTACLES, ROOFTOPS } from "./assets";
import type { World, Platform, Obstacle, Collectible } from "./world";
import { PLATFORM_TOP } from "./world";

interface Props {
  world: React.MutableRefObject<World>;
}

const PLATFORM_HEIGHT = 4; // visual brick height below the top surface
const ROOF_BAND = 0.6;     // top snow-cap band thickness

export function WorldRender({ world }: Props) {
  const roofTextures = useLoader(THREE.TextureLoader, ROOFTOPS);
  const chimneyTex = useLoader(THREE.TextureLoader, OBSTACLES.chimney);
  const snowmanTex = useLoader(THREE.TextureLoader, OBSTACLES.snowman);
  const iceTex = useLoader(THREE.TextureLoader, OBSTACLES.ice);
  const presentsTex = useLoader(THREE.TextureLoader, OBSTACLES.presents);

  useMemo(() => {
    const all = [...roofTextures, chimneyTex, snowmanTex, iceTex, presentsTex];
    for (const t of all) {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearMipMapLinearFilter;
    }
    // Brick texture should tile horizontally
    for (const t of roofTextures) {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.ClampToEdgeWrapping;
    }
  }, [roofTextures, chimneyTex, snowmanTex, iceTex, presentsTex]);

  const platformGroupRef = useRef<THREE.Group>(null);
  const obstacleGroupRef = useRef<THREE.Group>(null);
  const collectibleGroupRef = useRef<THREE.Group>(null);

  // Pools of meshes, keyed by entity id
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
      presentsTex,
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
    g.position.y = p.topY - PLATFORM_HEIGHT / 2;
  }
  for (const [id, mesh] of map) {
    if (!seen.has(id)) {
      group.remove(mesh);
      mesh.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const mat = o.material as THREE.Material | THREE.Material[];
          const mats = Array.isArray(mat) ? mat : [mat];
          for (const m of mats) {
            const anyMat = m as THREE.Material & { map?: THREE.Texture | null; userData?: { ownsTexture?: boolean } };
            if (anyMat.map && anyMat.userData?.ownsTexture) {
              anyMat.map.dispose();
            }
            m.dispose();
          }
        }
      });
      map.delete(id);
    }
  }
}

function buildPlatformMesh(p: Platform, textures: THREE.Texture[]): THREE.Group {
  const g = new THREE.Group();
  const tex = textures[p.variant % textures.length].clone();
  tex.needsUpdate = true;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(Math.max(1, p.width / 4), 1);

  // Brick body
  const bodyMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 });
  bodyMat.userData.ownsTexture = true;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(p.width, PLATFORM_HEIGHT, 2.4),
    bodyMat,
  );
  body.castShadow = false;
  body.receiveShadow = true;
  g.add(body);

  // Snow cap on top
  const snow = new THREE.Mesh(
    new THREE.BoxGeometry(p.width, ROOF_BAND, 2.6),
    new THREE.MeshStandardMaterial({ color: "#f6fbff", roughness: 0.85 }),
  );
  snow.position.y = PLATFORM_HEIGHT / 2;
  g.add(snow);

  // Front-facing dark edge so it reads in 3D
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(p.width, PLATFORM_HEIGHT * 0.5),
    new THREE.MeshBasicMaterial({ color: "#1a0e08", transparent: true, opacity: 0.25 }),
  );
  shadow.position.set(0, -PLATFORM_HEIGHT * 0.25, 1.21);
  g.add(shadow);

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
      let tex = textures.chimneyTex;
      if (o.kind === "snowman") tex = textures.snowmanTex;
      else if (o.kind === "ice") tex = textures.iceTex;
      // Render as a billboard plane sized roughly to the obstacle
      const visW = o.kind === "ice" ? o.w * 1.2 : o.w * 1.6;
      const visH = o.kind === "ice" ? o.h * 1.4 : o.h * 1.8;
      m = new THREE.Mesh(
        new THREE.PlaneGeometry(visW, visH),
        new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          alphaTest: 0.05,
          side: THREE.DoubleSide,
          toneMapped: false,
        }),
      );
      map.set(o.id, m);
      group.add(m);
    }
    m.position.x = o.x;
    m.position.y = o.y + (o.kind === "ice" ? o.h / 2 : (o.kind === "snowman" ? 0.95 : 1.0));
    m.position.z = 0.4;
    m.visible = !o.hit || o.kind === "ice"; // ice stays visible after slipping
  }
  for (const [id, mesh] of map) {
    if (!seen.has(id)) {
      group.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
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
        new THREE.PlaneGeometry(0.95, 0.95),
        new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          alphaTest: 0.05,
          side: THREE.DoubleSide,
          toneMapped: false,
        }),
      );
      map.set(c.id, m);
      group.add(m);
    }
    m.position.x = c.x;
    m.position.y = c.y + Math.sin(performance.now() * 0.004 + c.id) * 0.08;
    m.position.z = 0.5;
    m.rotation.z = Math.sin(performance.now() * 0.003 + c.id) * 0.15;
    m.visible = !c.collected;
  }
  for (const [id, mesh] of map) {
    if (!seen.has(id)) {
      group.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      map.delete(id);
    }
  }
}
