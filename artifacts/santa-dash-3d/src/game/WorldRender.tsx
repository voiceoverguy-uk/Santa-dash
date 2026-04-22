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
// Draws a glassy translucent blue bubble (like a Christmas ornament) with a
// bright crescent highlight, then renders the power-up icon centred inside
// so the player can see what's about to be collected.
function makePowerUpTexture(
  glyph: string,
  glyphColor: string,
  isEmoji = false,
): THREE.Texture {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.42;

  // Outer soft halo
  const halo = ctx.createRadialGradient(cx, cy, R * 0.85, cx, cy, R * 1.3);
  halo.addColorStop(0, "rgba(160,210,255,0.55)");
  halo.addColorStop(1, "rgba(160,210,255,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, size, size);

  // Bubble body — translucent blue sphere with darker rim
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  const body = ctx.createRadialGradient(
    cx - R * 0.35, cy - R * 0.4, R * 0.1,
    cx, cy, R,
  );
  body.addColorStop(0, "rgba(190,225,255,0.85)");
  body.addColorStop(0.45, "rgba(50,110,200,0.55)");
  body.addColorStop(0.85, "rgba(15,40,95,0.85)");
  body.addColorStop(1, "rgba(8,20,55,0.95)");
  ctx.fillStyle = body;
  ctx.fill();
  ctx.restore();

  // Inner dark core so the glyph reads on top
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.78, 0, Math.PI * 2);
  const core = ctx.createRadialGradient(cx, cy, R * 0.05, cx, cy, R * 0.78);
  core.addColorStop(0, "rgba(20,40,90,0.55)");
  core.addColorStop(1, "rgba(8,20,55,0.0)");
  ctx.fillStyle = core;
  ctx.fill();
  ctx.restore();

  // Glyph (drawn before highlights so the glass shine sits on top)
  ctx.save();
  ctx.fillStyle = glyphColor;
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 6;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (isEmoji) {
    ctx.font = `${Math.floor(size * 0.42)}px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',serif`;
  } else {
    ctx.font = `900 ${Math.floor(size * 0.46)}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
  }
  ctx.fillText(glyph, cx, cy + 4);
  ctx.restore();

  // Crescent highlight (top-left)
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx - R * 0.32, cy - R * 0.38, R * 0.28, R * 0.18, -0.6, 0, Math.PI * 2);
  const hi = ctx.createRadialGradient(
    cx - R * 0.32, cy - R * 0.38, 0,
    cx - R * 0.32, cy - R * 0.38, R * 0.3,
  );
  hi.addColorStop(0, "rgba(255,255,255,0.95)");
  hi.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = hi;
  ctx.fill();
  ctx.restore();

  // Tiny secondary highlight (bottom-right)
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx + R * 0.42, cy + R * 0.46, R * 0.07, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.fill();
  ctx.restore();

  // Outer glassy rim
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "rgba(180,220,255,0.6)";
  ctx.stroke();
  ctx.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const POWERUP_STYLE: Record<PowerUpKind, { glyph: string; color: string; isEmoji: boolean }> = {
  magnet: { glyph: "🧲", color: "#ff8d8d", isEmoji: true },
  shield: { glyph: "🛡️", color: "#bfe4ff", isEmoji: true },
  double: { glyph: "2×", color: "#ffe07a", isEmoji: false },
  float:  { glyph: "🪶", color: "#c8f5e0", isEmoji: true },
};

export function WorldRender({ world }: Props) {
  const roofTextures = useLoader(THREE.TextureLoader, ROOFTOPS);
  const chimneyTex = useLoader(THREE.TextureLoader, OBSTACLES.chimney);
  const snowmanTex = useLoader(THREE.TextureLoader, OBSTACLES.snowman);
  const iceTex = useLoader(THREE.TextureLoader, OBSTACLES.ice);
  const presentsTex = useLoader(THREE.TextureLoader, OBSTACLES.presents);
  const mincePieTex = useLoader(THREE.TextureLoader, OBSTACLES.mincepie);

  const powerUpTextures = useMemo(() => {
    const out = {} as Record<PowerUpKind, THREE.Texture>;
    (Object.keys(POWERUP_STYLE) as PowerUpKind[]).forEach((k) => {
      const s = POWERUP_STYLE[k];
      out[k] = makePowerUpTexture(s.glyph, s.color, s.isEmoji);
    });
    return out;
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
  // The asset itself already includes the natural snow cap at the top, so
  // we render a single tall body that includes the snow region rather than
  // pasting a separate white block on top (which hid the asset's nicer snow
  // and made the cap look like "a great big chunk of white").

  const srcTex = textures[p.variant % textures.length];
  const tex = srcTex.clone();
  tex.needsUpdate = true;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;

  // Pick horizontal tile count from the source aspect ratio so windows are
  // rendered at their natural shape (~3.4× narrower than they were before).
  const totalH = PLATFORM_HEIGHT + SNOW_CAP_HEIGHT;
  const img = srcTex.image as { width?: number; height?: number } | undefined;
  const aspect = img && img.width && img.height ? img.width / img.height : 102 / 640;
  const tileWidth = Math.max(0.4, totalH * aspect);
  const tilesX = Math.max(1, Math.round(p.width / tileWidth));
  tex.repeat.set(tilesX, 1);

  const bodyMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 });
  bodyMat.userData.ownsTexture = true;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(p.width, totalH, 2.4),
    bodyMat,
  );
  // Top of body sits at +SNOW_CAP_HEIGHT so Santa's foot rest (which the
  // physics already places at p.topY + SNOW_CAP_HEIGHT) lands on the snowy
  // top edge of the source texture.
  body.position.y = SNOW_CAP_HEIGHT - totalH / 2;
  g.add(body);

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
