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

// ---- Procedural snow cap texture ----
// A horizontally-tileable painted snow cap with a fluffy humped top edge,
// a soft blue underside shadow, and a row of stalactite-like icicles
// drooping down from the front. Designed to be repeated along the length
// of every platform so the rooftops read as snow-covered houses (matching
// the iOS painted look) instead of plain brick walls.
let _snowCapTex: THREE.Texture | null = null;
function getSnowCapTexture(): THREE.Texture {
  if (_snowCapTex) return _snowCapTex;
  const W = 512;
  const H = 256;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);

  // V layout (top→bottom). These rows are tuned so that, at the chosen
  // CAP_PLANE_H + CAP_CENTER_Y below, the BASE row maps to world y=0 (the
  // brick top) and the SURFACE row maps to world y = SNOW_CAP_HEIGHT (0.55)
  // — i.e. Santa's foot-rest sits exactly on the painted snow surface, not
  // sunk into it.
  //   0..82    : empty (room for hump peaks)
  //   82..170  : snow body  (exactly SNOW_CAP_HEIGHT tall in world units)
  //   170..256 : icicles dripping below the brick top
  const SURFACE_Y = 82;
  const BASE_Y = 170;

  // Snow body — painted off-white with a humped top edge.
  // We shape the top with a smooth wavy curve so it tiles seamlessly
  // (same height at x=0 and x=W).
  const humpAt = (x: number) => {
    const u = (x / W) * Math.PI * 2;
    return (
      Math.sin(u) * 9 +
      Math.sin(u * 2 + 1.3) * 5 +
      Math.sin(u * 3 + 0.4) * 3
    );
  };
  ctx.fillStyle = "#f6fbff";
  ctx.beginPath();
  ctx.moveTo(0, BASE_Y);
  ctx.lineTo(0, SURFACE_Y - humpAt(0));
  for (let x = 0; x <= W; x += 4) {
    ctx.lineTo(x, SURFACE_Y - humpAt(x));
  }
  ctx.lineTo(W, BASE_Y);
  ctx.closePath();
  ctx.fill();

  // Top highlight — bright rim along the very top of each hump
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 4) {
    const y = SURFACE_Y - humpAt(x) + 1.5;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Cool blue underside shadow just above the front edge
  const grad = ctx.createLinearGradient(0, BASE_Y - 22, 0, BASE_Y);
  grad.addColorStop(0, "rgba(255,255,255,0)");
  grad.addColorStop(1, "rgba(120,170,210,0.45)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, BASE_Y - 22, W, 22);

  // Front-edge dark line so the cap reads against the brick below
  ctx.fillStyle = "rgba(80,130,180,0.55)";
  ctx.fillRect(0, BASE_Y, W, 2);

  // Icicles drooping down — varied widths and lengths, distributed so the
  // pattern tiles (we mirror the leftmost icicle as the rightmost).
  const drips = [
    { cx: 30, w: 14, len: 50 },
    { cx: 88, w: 9,  len: 32 },
    { cx: 150, w: 18, len: 70 },
    { cx: 220, w: 11, len: 42 },
    { cx: 280, w: 8,  len: 26 },
    { cx: 340, w: 16, len: 60 },
    { cx: 400, w: 10, len: 38 },
    { cx: 460, w: 12, len: 48 },
  ];
  for (const d of drips) {
    const top = BASE_Y - 2;
    const halfW = d.w / 2;
    // Body — gradient from white at top to translucent icy blue at tip
    const ig = ctx.createLinearGradient(0, top, 0, top + d.len);
    ig.addColorStop(0, "#f8fcff");
    ig.addColorStop(0.55, "#d9ecfb");
    ig.addColorStop(1, "rgba(170,210,235,0.65)");
    ctx.fillStyle = ig;
    ctx.beginPath();
    ctx.moveTo(d.cx - halfW, top);
    ctx.quadraticCurveTo(d.cx - halfW * 0.6, top + d.len * 0.6, d.cx, top + d.len);
    ctx.quadraticCurveTo(d.cx + halfW * 0.6, top + d.len * 0.6, d.cx + halfW, top);
    ctx.closePath();
    ctx.fill();
    // Left-side highlight
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(d.cx - halfW * 0.7, top + 2);
    ctx.quadraticCurveTo(d.cx - halfW * 0.3, top + d.len * 0.55, d.cx - 0.5, top + d.len - 2);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipMapLinearFilter;
  tex.needsUpdate = true;
  _snowCapTex = tex;
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
    // Roof panels: each panel is a discrete sprite covering UV 0..1, with the
    // upper SOURCE_SNOW_FRAC cropped out (the painted snow that shipped on
    // each PNG would otherwise peek out from behind our procedural snow cap).
    // All panels share these textures, so we set the crop once globally.
    for (const t of roofTextures) {
      t.wrapS = THREE.ClampToEdgeWrapping;
      t.wrapT = THREE.ClampToEdgeWrapping;
      t.repeat.set(1, 1 - SOURCE_SNOW_FRAC);
      t.offset.set(0, 0);
      t.needsUpdate = true;
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

// Snow cap geometry constants — derived to match the canvas layout of
// getSnowCapTexture(). The cap plane is positioned so that the row in the
// canvas marked BASE_Y (where the body ends and icicles begin) lines up with
// local y = 0 (the brick top). With those numbers, the painted snow surface
// peaks at local y ≈ SNOW_CAP_HEIGHT, exactly where Santa's feet rest.
const CAP_PLANE_H = 1.6;
const CAP_CENTER_Y = 0.262;          // see derivation in commit notes
const CAP_TILE_WORLD_W = 10;          // one canvas tile = 10 world units
const CAP_OVERHANG = 0.18;            // overhangs brick edge slightly

// Crop the upper ~12% of every rooftop sprite so the painted snow that
// shipped on each PNG doesn't peek out from behind our procedural snow cap.
const SOURCE_SNOW_FRAC = 0.12;

// Source-PNG aspect ratios. Sprites 1 and 7 are the wider end-cap variants
// (124×640), the rest are 102×640. Indexed 1..7 to match filenames.
const PANEL_NATURAL_ASPECT: Record<number, number> = {
  1: 124 / 640,
  2: 102 / 640,
  3: 102 / 640,
  4: 102 / 640,
  5: 102 / 640,
  6: 102 / 640,
  7: 124 / 640,
};
const END_CAP_INDICES = [1, 7] as const;
const BODY_INDICES = [2, 4, 6] as const;
const WINDOW_INDICES = [3, 5] as const;
// Ensure window-bearing panels are spaced out so the rooftop doesn't read
// as a row of windows. Minimum body panels between two window panels.
const MIN_BODY_GAP_BETWEEN_WINDOWS = 3;

// Tiny deterministic PRNG so each platform's panel layout is stable across
// re-renders but adjacent platforms differ.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Plan a sequence of rooftop sprite indices (1..7) that stitches across the
// platform width. Rules:
//   - end-cap sprites (1/7) preferred at the leftmost & rightmost slots
//   - never two identical sprites adjacent
//   - window-bearing sprites (3/5) used sparingly, with at least
//     MIN_BODY_GAP_BETWEEN_WINDOWS body panels between them
function planRooftopPanels(platformId: number, width: number, brickH: number): number[] {
  const rng = mulberry32(platformId * 0x9e3779b9);

  const naturalW = (idx: number) => brickH * PANEL_NATURAL_ASPECT[idx];

  // Pick from a candidate list, avoiding the previous index.
  const pickAvoidPrev = (
    candidates: readonly number[],
    prev: number,
  ): number => {
    const filtered = candidates.filter((i) => i !== prev);
    const list = filtered.length > 0 ? filtered : (candidates as readonly number[]);
    return list[Math.floor(rng() * list.length)];
  };

  const panels: number[] = [];
  let consumed = 0;
  let prev = -1;
  let bodyPanelsSinceWindow = MIN_BODY_GAP_BETWEEN_WINDOWS;

  while (consumed < width - 0.05) {
    const remaining = width - consumed;
    const isFirst = panels.length === 0;
    const endCapW = brickH * PANEL_NATURAL_ASPECT[1];

    let pick: number;
    if (isFirst && remaining >= endCapW * 0.85) {
      // Leftmost slot: prefer end-cap
      pick = pickAvoidPrev(END_CAP_INDICES, prev);
    } else if (remaining <= endCapW * 1.4) {
      // Rightmost-ish: prefer end-cap when there's only ~one slot left
      pick = pickAvoidPrev(END_CAP_INDICES, prev);
    } else {
      // Interior: mostly body, occasional window when the spacing rule allows
      const wantWindow = bodyPanelsSinceWindow >= MIN_BODY_GAP_BETWEEN_WINDOWS && rng() < 0.5;
      pick = wantWindow
        ? pickAvoidPrev(WINDOW_INDICES, prev)
        : pickAvoidPrev(BODY_INDICES, prev);
    }

    panels.push(pick);
    const isWindow = pick === 3 || pick === 5;
    bodyPanelsSinceWindow = isWindow ? 0 : bodyPanelsSinceWindow + 1;
    prev = pick;
    consumed += naturalW(pick);
  }

  return panels;
}

function buildPlatformMesh(p: Platform, textures: THREE.Texture[]): THREE.Group {
  const g = new THREE.Group();
  // Group is anchored at the brick TOP (y = p.topY in world).
  // We render the brick FAÇADE as a stitched row of distinct panel sprites
  // (so wide rooftops don't read as a tiled row of identical windows) and
  // then paint a separate procedural snow cap on top.

  const brickH = PLATFORM_HEIGHT;
  const panels = planRooftopPanels(p.id, p.width, brickH);

  // Panels are sized at their natural aspect; their total natural width
  // rarely matches the platform width exactly, so we uniformly scale them
  // to fit so the row ends flush with both edges of the platform.
  const naturalTotal = panels.reduce(
    (sum, idx) => sum + brickH * PANEL_NATURAL_ASPECT[idx],
    0,
  );
  const xScale = naturalTotal > 0 ? p.width / naturalTotal : 1;

  let xCursor = -p.width / 2;
  for (const idx of panels) {
    const naturalW = brickH * PANEL_NATURAL_ASPECT[idx];
    const panelW = naturalW * xScale;
    const tex = textures[idx - 1]; // textures[] is 0-indexed (sprite 1 → [0])
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    // Don't dispose the shared loader-owned texture when this platform is
    // recycled.
    mat.userData.ownsTexture = false;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(panelW, brickH), mat);
    panel.position.x = xCursor + panelW / 2;
    panel.position.y = -brickH / 2;
    panel.position.z = 0;
    g.add(panel);
    xCursor += panelW;
  }

  // Procedural snow cap on top of the brick — overhangs the front edge
  // with drooping icicles, fluffy humped top edge, soft blue underside.
  const capTex = getSnowCapTexture().clone();
  capTex.needsUpdate = true;
  capTex.wrapS = THREE.RepeatWrapping;
  capTex.wrapT = THREE.ClampToEdgeWrapping;
  // Random horizontal offset per platform so adjacent rooftops don't show
  // the same icicle pattern.
  capTex.offset.x = (p.id * 0.137) % 1;
  const capWidth = p.width + CAP_OVERHANG * 2;
  capTex.repeat.set(capWidth / CAP_TILE_WORLD_W, 1);
  const capMat = new THREE.MeshBasicMaterial({
    map: capTex,
    transparent: true,
    alphaTest: 0.02,
    toneMapped: false,
    depthWrite: false,
  });
  capMat.userData.ownsTexture = true;
  const cap = new THREE.Mesh(
    new THREE.PlaneGeometry(capWidth, CAP_PLANE_H),
    capMat,
  );
  cap.position.y = CAP_CENTER_Y;
  cap.position.z = 0.05;
  cap.renderOrder = 2;
  g.add(cap);

  // Reference SNOW_CAP_HEIGHT to keep the import live (the constant sets the
  // canvas layout in getSnowCapTexture); also helps any future readers.
  void SNOW_CAP_HEIGHT;

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
        visW = o.w * 2.4;
        visH = o.h * 2.6;
      } else if (o.kind === "ice") {
        tex = textures.iceTex;
        visW = o.w * 1.7;
        visH = o.h * 3.2;
      } else if (o.kind === "presents") {
        tex = textures.presentsTex;
        visW = o.w * 2.6;
        visH = o.h * 3.0;
      } else {
        // Chimney — render larger so it reads as a proper freestanding
        // brick chimney rising above the snow cap (matches iOS look).
        tex = textures.chimneyTex;
        visW = o.w * 3.0;
        visH = o.h * 3.6;
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
