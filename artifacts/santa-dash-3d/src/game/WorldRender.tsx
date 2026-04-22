import { useMemo, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { OBSTACLES, ROOFTOPS } from "./assets";
import type { World, Platform, Obstacle, Collectible, PowerUp, PowerUpKind } from "./world";
import { SNOW_CAP_HEIGHT } from "./world";

interface Props {
  world: React.MutableRefObject<World>;
}

const PLATFORM_HEIGHT = 4.4;

// ---- Procedural power-up textures ----
function makePowerUpTexture(
  emoji: string,
  bg: string,
  glow: string,
): THREE.Texture {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  // Outer glow
  const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.18, size / 2, size / 2, size * 0.5);
  grad.addColorStop(0, glow);
  grad.addColorStop(0.55, glow.replace(/[\d.]+\)$/, "0.35)"));
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  // Disc
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.32, 0, Math.PI * 2);
  const disc = ctx.createRadialGradient(size / 2, size * 0.42, 4, size / 2, size / 2, size * 0.32);
  disc.addColorStop(0, "#ffffff");
  disc.addColorStop(0.4, bg);
  disc.addColorStop(1, shade(bg, -0.35));
  ctx.fillStyle = disc;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.stroke();
  // Glyph
  ctx.font = `${Math.floor(size * 0.45)}px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, size / 2, size / 2 + 6);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function shade(hex: string, amt: number): string {
  // hex like #rrggbb
  const m = hex.match(/^#?([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})$/i);
  if (!m) return hex;
  const adjust = (h: string) => {
    const v = Math.max(0, Math.min(255, Math.round(parseInt(h, 16) * (1 + amt))));
    return v.toString(16).padStart(2, "0");
  };
  return `#${adjust(m[1])}${adjust(m[2])}${adjust(m[3])}`;
}

const POWERUP_STYLE: Record<PowerUpKind, { emoji: string; bg: string; glow: string }> = {
  magnet: { emoji: "🧲", bg: "#d83b3b", glow: "rgba(255,80,80,0.9)" },
  shield: { emoji: "🛡️", bg: "#3a8de8", glow: "rgba(120,200,255,0.9)" },
  double: { emoji: "✨", bg: "#f2b62a", glow: "rgba(255,225,120,0.95)" },
};

export function WorldRender({ world }: Props) {
  const roofTextures = useLoader(THREE.TextureLoader, ROOFTOPS);
  const chimneyTex = useLoader(THREE.TextureLoader, OBSTACLES.chimney);
  const snowmanTex = useLoader(THREE.TextureLoader, OBSTACLES.snowman);
  const iceTex = useLoader(THREE.TextureLoader, OBSTACLES.ice);
  const presentsTex = useLoader(THREE.TextureLoader, OBSTACLES.presents);
  const mincePieTex = useLoader(THREE.TextureLoader, OBSTACLES.mincepie);

  const powerUpTextures = useMemo(() => {
    return {
      magnet: makePowerUpTexture(POWERUP_STYLE.magnet.emoji, POWERUP_STYLE.magnet.bg, POWERUP_STYLE.magnet.glow),
      shield: makePowerUpTexture(POWERUP_STYLE.shield.emoji, POWERUP_STYLE.shield.bg, POWERUP_STYLE.shield.glow),
      double: makePowerUpTexture(POWERUP_STYLE.double.emoji, POWERUP_STYLE.double.bg, POWERUP_STYLE.double.glow),
    } as Record<PowerUpKind, THREE.Texture>;
  }, []);

  useMemo(() => {
    const all = [
      ...roofTextures,
      chimneyTex,
      snowmanTex,
      iceTex,
      presentsTex,
      mincePieTex,
    ];
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
  }, [roofTextures, chimneyTex, snowmanTex, iceTex, presentsTex, mincePieTex]);

  const platformGroupRef = useRef<THREE.Group>(null);
  const obstacleGroupRef = useRef<THREE.Group>(null);
  const collectibleGroupRef = useRef<THREE.Group>(null);
  const powerUpGroupRef = useRef<THREE.Group>(null);
  const auraRef = useRef<THREE.Group>(null);

  const platformMap = useRef(new Map<number, THREE.Group>());
  const obstacleMap = useRef(new Map<number, THREE.Mesh>());
  const collectibleMap = useRef(new Map<number, THREE.Mesh>());
  const powerUpMap = useRef(new Map<number, THREE.Mesh>());

  // Aura meshes
  const shieldAuraRef = useRef<THREE.Mesh | null>(null);
  const magnetAuraRef = useRef<THREE.Mesh | null>(null);

  useFrame(() => {
    const w = world.current;
    syncPlatforms(w.platforms, platformGroupRef.current!, platformMap.current, roofTextures);
    syncObstacles(
      w.obstacles,
      obstacleGroupRef.current!,
      obstacleMap.current,
      { chimneyTex, snowmanTex, iceTex, presentsTex },
    );
    syncCollectibles(
      w.collectibles,
      collectibleGroupRef.current!,
      collectibleMap.current,
      mincePieTex,
    );
    syncPowerUps(
      w.powerUps,
      powerUpGroupRef.current!,
      powerUpMap.current,
      powerUpTextures,
    );
    syncAuras(w, auraRef.current!, shieldAuraRef, magnetAuraRef);
  });

  return (
    <>
      <group ref={platformGroupRef} />
      <group ref={obstacleGroupRef} />
      <group ref={collectibleGroupRef} />
      <group ref={powerUpGroupRef} />
      <group ref={auraRef} />
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

// Each sprite PNG has transparent padding around the actual content. To
// land the visible content on the snow surface (rather than the plane's
// bottom edge, which sits inside the padding), we shift the plane DOWN by
// the bottom-padding fraction of the source image. Measurements below were
// taken from the 1143x1066 source PNGs (mincepie is 1024x1024).
const BOTTOM_PAD_FRAC: Record<string, number> = {
  chimney: 500 / 1066,   // ~0.469
  ice: 331 / 1066,       // ~0.310
  snowman: 421 / 1066,   // ~0.395
  presents: 444 / 1066,  // ~0.417
  mincepie: 142 / 1024,  // ~0.139
};

function syncObstacles(
  obstacles: Obstacle[],
  group: THREE.Group,
  map: Map<number, THREE.Mesh>,
  textures: {
    chimneyTex: THREE.Texture;
    snowmanTex: THREE.Texture;
    iceTex: THREE.Texture;
    presentsTex: THREE.Texture;
  },
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
        visW = o.w * 2.6;
        visH = o.h * 3.0;
      } else if (o.kind === "ice") {
        tex = textures.iceTex;
        visW = o.w * 1.7;
        visH = o.h * 3.2;
      } else if (o.kind === "presents") {
        tex = textures.presentsTex;
        visW = o.w * 2.3;
        visH = o.h * 2.8;
      } else {
        tex = textures.chimneyTex;
        visW = o.w * 2.4;
        visH = o.h * 3.2;
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
    // Position so the visible CONTENT bottom sits on the snow surface (o.y).
    // The plane is taller than the artwork — we offset down to compensate
    // for the transparent padding under the content.
    const visH = (m.geometry as THREE.PlaneGeometry).parameters.height;
    const padFrac = BOTTOM_PAD_FRAC[o.kind] ?? 0;
    m.position.x = o.x;
    m.position.y = o.y + visH / 2 - visH * padFrac;
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

function syncPowerUps(
  powerUps: PowerUp[],
  group: THREE.Group,
  map: Map<number, THREE.Mesh>,
  textures: Record<PowerUpKind, THREE.Texture>,
) {
  const seen = new Set<number>();
  for (const p of powerUps) {
    seen.add(p.id);
    let m = map.get(p.id);
    if (!m) {
      m = new THREE.Mesh(
        new THREE.PlaneGeometry(1.6, 1.6),
        new THREE.MeshBasicMaterial({
          map: textures[p.kind],
          transparent: true,
          alphaTest: 0.02,
          side: THREE.DoubleSide,
          toneMapped: false,
          depthWrite: false,
        }),
      );
      map.set(p.id, m);
      group.add(m);
    }
    const t = performance.now() * 0.003;
    const bob = Math.sin(t + p.id) * 0.18;
    const pulse = 1 + Math.sin(t * 2 + p.id) * 0.06;
    m.position.x = p.x;
    m.position.y = p.y + bob;
    m.position.z = 0.55;
    m.scale.setScalar(pulse);
    m.rotation.z = Math.sin(t * 0.6 + p.id) * 0.12;
    m.visible = !p.collected;
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

function syncAuras(
  w: World,
  group: THREE.Group,
  shieldRef: React.MutableRefObject<THREE.Mesh | null>,
  magnetRef: React.MutableRefObject<THREE.Mesh | null>,
) {
  // Shield bubble around santa
  if (!shieldRef.current) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 1.25, 32),
      new THREE.MeshBasicMaterial({
        color: 0x7dd3fc,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    shieldRef.current = m;
    group.add(m);
  }
  if (!magnetRef.current) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(2.4, 2.65, 48),
      new THREE.MeshBasicMaterial({
        color: 0xff7a7a,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    magnetRef.current = m;
    group.add(m);
  }
  const t = performance.now() * 0.004;
  const sh = shieldRef.current!;
  const ma = magnetRef.current!;
  sh.visible = w.powerUpTimers.shield > 0;
  ma.visible = w.powerUpTimers.magnet > 0;
  sh.position.set(w.santaX, w.santaY, 0.6);
  sh.scale.setScalar(1 + Math.sin(t * 2) * 0.06);
  (sh.material as THREE.MeshBasicMaterial).opacity =
    0.45 + Math.sin(t * 3) * 0.18;
  ma.position.set(w.santaX, w.santaY, 0.55);
  ma.rotation.z = t * 0.6;
  (ma.material as THREE.MeshBasicMaterial).opacity =
    0.25 + Math.sin(t * 2.5) * 0.15;
}
