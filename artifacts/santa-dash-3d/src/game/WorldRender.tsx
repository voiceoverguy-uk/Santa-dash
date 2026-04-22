import { useMemo, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { OBSTACLES, ROOFTOPS } from "./assets";
import type { World, Platform, Obstacle, Collectible, PowerUp, PowerUpKind, Decoration } from "./world";
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

// ---- Procedural decoration textures (rooftop pine trees + tiny snowmen) ----
// These are non-collidable background-style props that sit on the snow.
let _pineTex: THREE.Texture | null = null;
function getPineTexture(): THREE.Texture {
  if (_pineTex) return _pineTex;
  const W = 256, H = 384;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);

  // Trunk
  ctx.fillStyle = "#5b3a1f";
  ctx.fillRect(W / 2 - 12, H - 50, 24, 50);
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(W / 2 - 12, H - 50, 6, 50);

  // Three triangular tiers of foliage, painted with a flat dark green base
  // plus lighter highlight bumps and a snow cap on top of each tier.
  const tiers = [
    { y: H - 50,  baseW: W * 0.85, height: 130 },
    { y: H - 150, baseW: W * 0.65, height: 120 },
    { y: H - 245, baseW: W * 0.42, height: 110 },
  ];
  for (const t of tiers) {
    ctx.fillStyle = "#1f5a32";
    ctx.beginPath();
    ctx.moveTo(W / 2 - t.baseW / 2, t.y);
    ctx.lineTo(W / 2, t.y - t.height);
    ctx.lineTo(W / 2 + t.baseW / 2, t.y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#2f7d44";
    ctx.beginPath();
    ctx.moveTo(W / 2 - t.baseW / 2 + 8, t.y - 4);
    ctx.lineTo(W / 2 - 4, t.y - t.height + 18);
    ctx.lineTo(W / 2 + 8, t.y - 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f7fbff";
    ctx.beginPath();
    ctx.arc(W / 2,         t.y - t.height + 6, 9, 0, Math.PI * 2);
    ctx.arc(W / 2 - 24,    t.y - t.height + 22, 11, 0, Math.PI * 2);
    ctx.arc(W / 2 + 24,    t.y - t.height + 22, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(245,250,255,0.85)";
    ctx.beginPath();
    ctx.arc(W / 2 - t.baseW / 2 + 18, t.y - 8, 6, 0, Math.PI * 2);
    ctx.arc(W / 2 + t.baseW / 2 - 18, t.y - 8, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(W / 2, H - 245 - 110 + 4, 8, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipMapLinearFilter;
  _pineTex = tex;
  return tex;
}

// Festive horizontal string of bulbs hanging from a thin dark cord.
// Painted as a single tile-able strip; the renderer animates a "twinkle"
// on the saturated bulb pixels via a custom fragment shader (cord stays
// flat). Tile width chosen so ~6 bulbs fit per world unit.
const LIGHTS_TILE_W = 256;
const LIGHTS_TILE_H = 64;
const LIGHTS_BULBS_PER_TILE = 8;
const LIGHTS_WORLD_TILE_WIDTH = 4; // one tile spans 4 world units
let _lightsTex: THREE.Texture | null = null;
function getLightsTexture(): THREE.Texture {
  if (_lightsTex) return _lightsTex;
  const c = document.createElement("canvas");
  c.width = LIGHTS_TILE_W; c.height = LIGHTS_TILE_H;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, LIGHTS_TILE_W, LIGHTS_TILE_H);

  // Cord — a slightly drooping dark line across the strip.
  const cordY = 12;
  const droop = 6;
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(0, cordY);
  for (let i = 1; i <= LIGHTS_BULBS_PER_TILE; i++) {
    const segX = (i - 0.5) * (LIGHTS_TILE_W / LIGHTS_BULBS_PER_TILE);
    ctx.quadraticCurveTo(
      segX,
      cordY + droop,
      i * (LIGHTS_TILE_W / LIGHTS_BULBS_PER_TILE),
      cordY,
    );
  }
  ctx.stroke();

  // Bulbs — saturated colours so the shader can identify them by
  // chroma (max-min of RGB) and pulse only those pixels.
  const bulbColors = ["#ff3b3b", "#ffd34d", "#46d36c", "#4cb1ff"];
  const bulbR = 6;
  for (let i = 0; i < LIGHTS_BULBS_PER_TILE; i++) {
    const cx = (i + 0.5) * (LIGHTS_TILE_W / LIGHTS_BULBS_PER_TILE);
    const cy = cordY + droop + 4;
    // Tiny vertical wire from cord to bulb top.
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - bulbR - 2);
    ctx.lineTo(cx, cy - bulbR + 1);
    ctx.stroke();
    // Bulb base (small dark cap).
    ctx.fillStyle = "#222";
    ctx.fillRect(cx - 3, cy - bulbR + 1, 6, 3);
    // Bulb body.
    const color = bulbColors[i % bulbColors.length];
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy + 2, bulbR, 0, Math.PI * 2);
    ctx.fill();
    // Specular highlight.
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath();
    ctx.arc(cx - 2, cy, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipMapLinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  _lightsTex = tex;
  return tex;
}

// Christmas wreath — a flat ring of pine boughs with red berries and a
// bow at the bottom. Hung on the brick wall, no animation.
let _wreathTex: THREE.Texture | null = null;
function getWreathTexture(): THREE.Texture {
  if (_wreathTex) return _wreathTex;
  const W = 256, H = 256;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);

  const cx = W / 2, cy = H / 2;
  const outerR = W * 0.42;
  const innerR = W * 0.22;

  // Pine bough ring — paint many small dark green leaf clusters around
  // the ring, with a few lighter highlights for depth.
  const ringR = (outerR + innerR) / 2;
  const clusters = 38;
  for (let i = 0; i < clusters; i++) {
    const a = (i / clusters) * Math.PI * 2;
    const r = ringR + (Math.random() - 0.5) * (outerR - innerR) * 0.4;
    const lx = cx + Math.cos(a) * r;
    const ly = cy + Math.sin(a) * r;
    ctx.fillStyle = i % 5 === 0 ? "#2f7d44" : "#1f5a32";
    ctx.beginPath();
    ctx.arc(lx, ly, 14 + Math.random() * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Inner shadow to read as a ring (cuts the centre).
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";

  // Red berries scattered around the ring.
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = ringR + (Math.random() - 0.5) * (outerR - innerR) * 0.3;
    ctx.fillStyle = "#d3252a";
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r - 1, cy + Math.sin(a) * r - 1, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Red bow at the bottom — two loops + tails.
  const bowY = cy + outerR - 8;
  ctx.fillStyle = "#c41822";
  // Loops
  ctx.beginPath();
  ctx.ellipse(cx - 18, bowY, 16, 10, -0.3, 0, Math.PI * 2);
  ctx.ellipse(cx + 18, bowY, 16, 10, 0.3, 0, Math.PI * 2);
  ctx.fill();
  // Knot
  ctx.fillStyle = "#9a1119";
  ctx.beginPath();
  ctx.ellipse(cx, bowY, 6, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  // Tails
  ctx.fillStyle = "#c41822";
  ctx.beginPath();
  ctx.moveTo(cx - 4, bowY + 4);
  ctx.lineTo(cx - 16, bowY + 22);
  ctx.lineTo(cx - 8, bowY + 22);
  ctx.lineTo(cx - 1, bowY + 6);
  ctx.closePath();
  ctx.moveTo(cx + 4, bowY + 4);
  ctx.lineTo(cx + 16, bowY + 22);
  ctx.lineTo(cx + 8, bowY + 22);
  ctx.lineTo(cx + 1, bowY + 6);
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipMapLinearFilter;
  _wreathTex = tex;
  return tex;
}

let _smallSnowmanTex: THREE.Texture | null = null;
function getSmallSnowmanTexture(): THREE.Texture {
  if (_smallSnowmanTex) return _smallSnowmanTex;
  const W = 192, H = 256;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#f8fbff";
  ctx.beginPath();
  ctx.arc(W / 2, H - 60, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(W / 2, H - 140, 44, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(W / 2, H - 200, 32, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(W / 2 - 28, H - 220, 56, 6);
  ctx.fillRect(W / 2 - 18, H - 248, 36, 28);
  ctx.fillStyle = "#222";
  ctx.beginPath();
  ctx.arc(W / 2 - 9, H - 205, 3, 0, Math.PI * 2);
  ctx.arc(W / 2 + 9, H - 205, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ff8a3d";
  ctx.beginPath();
  ctx.moveTo(W / 2, H - 198);
  ctx.lineTo(W / 2 + 14, H - 195);
  ctx.lineTo(W / 2, H - 192);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#222";
  ctx.beginPath();
  ctx.arc(W / 2, H - 150, 3, 0, Math.PI * 2);
  ctx.arc(W / 2, H - 135, 3, 0, Math.PI * 2);
  ctx.arc(W / 2, H - 120, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(150,190,225,0.25)";
  ctx.beginPath();
  ctx.arc(W / 2 + 18, H - 60, 50, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  _smallSnowmanTex = tex;
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
  const decorationGroupRef = useRef<THREE.Group>(null);
  const obstacleGroupRef = useRef<THREE.Group>(null);
  const collectibleGroupRef = useRef<THREE.Group>(null);
  const powerUpGroupRef = useRef<THREE.Group>(null);
  const auraRef = useRef<THREE.Group>(null);

  const platformMap = useRef(new Map<number, THREE.Group>());
  const decorationMap = useRef(new Map<number, THREE.Mesh>());
  const obstacleMap = useRef(new Map<number, THREE.Mesh>());
  const collectibleMap = useRef(new Map<number, THREE.Mesh>());
  const powerUpMap = useRef(new Map<number, THREE.Mesh>());

  // Aura meshes
  const shieldAuraRef = useRef<THREE.Mesh | null>(null);
  const magnetAuraRef = useRef<THREE.Mesh | null>(null);

  useFrame(() => {
    const w = world.current;
    syncPlatforms(w.platforms, platformGroupRef.current!, platformMap.current, roofTextures);
    syncDecorations(w.decorations, decorationGroupRef.current!, decorationMap.current);
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
      <group ref={decorationGroupRef} />
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
//
// We crop the top SOURCE_SNOW_FRAC of every sprite (the painted snow that
// shipped on each PNG would otherwise peek out from behind our procedural
// snow cap). The plane covers the *cropped* region, so the natural aspect
// must use the visible source height, not the raw 640 px height. Without
// this correction, brick rows and window panes are stretched ~13.6 %
// vertically and the windows look "squashed".
const VISIBLE_PANEL_H_PX = 640 * (1 - SOURCE_SNOW_FRAC);
const PANEL_NATURAL_ASPECT: Record<number, number> = {
  1: 124 / VISIBLE_PANEL_H_PX,
  2: 102 / VISIBLE_PANEL_H_PX,
  3: 102 / VISIBLE_PANEL_H_PX,
  4: 102 / VISIBLE_PANEL_H_PX,
  5: 102 / VISIBLE_PANEL_H_PX,
  6: 102 / VISIBLE_PANEL_H_PX,
  7: 124 / VISIBLE_PANEL_H_PX,
};
const END_CAP_INDICES = [1, 7] as const;
// Sprite 2 is the "canonical" plain brick (sprite 6 is byte-identical to it,
// sprite 4 is a slightly different variant with a darker brick tone and a
// different painted snow cap). Mixing variants produced visible vertical
// seams every ~0.7 world units, breaking the continuous brick wall look from
// the iOS original — so we use ONLY sprite 2 for body fill. Adjacent
// identical sprites are fine here because the brick pattern continues
// seamlessly across the boundary (it's literally the same texture twice).
const BODY_INDICES = [2] as const;
const WINDOW_INDICES = [3, 5] as const;
// Ensure window-bearing panels are spaced out so the rooftop doesn't read
// as a row of identical windows, but stay tight enough that each
// "section" of brick wall feels like its own little house — matching the
// painted row-houses in santa-dash.jpg.
const MIN_BODY_GAP_BETWEEN_WINDOWS = 2;

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
// platform width to form ONE building. Rules (matching the original Santa
// Dash assembly):
//   - the leftmost & rightmost slices are end-caps (sprites 1 / 7)
//   - body fill uses ONE consistent brick variant (sprite 2) — adjacent
//     identical body slices are intentional so the brick pattern stays
//     seamless across slice boundaries
//   - window slices (3/5) avoid adjacency to keep paired windows distinct
//   - every building MUST contain at least one window slice somewhere
//   - long buildings get a second window; otherwise a single window so the
//     façade reads as a real house (1–2 windows), not a row of windows
function planRooftopPanels(platformId: number, width: number, brickH: number): number[] {
  const rng = mulberry32(platformId * 0x9e3779b9);
  const pickAvoidPrev = (
    candidates: readonly number[],
    prev: number,
  ): number => {
    const filtered = candidates.filter((i) => i !== prev);
    const list = filtered.length > 0 ? filtered : (candidates as readonly number[]);
    return list[Math.floor(rng() * list.length)];
  };

  // Each slice is roughly one body sprite wide. We choose the slice count so
  // the total natural width is close to the platform width; the renderer
  // uniformly scales the row to fit exactly.
  const avgSliceW = brickH * PANEL_NATURAL_ASPECT[2]; // 102/640 sprite
  const sliceCount = Math.max(2, Math.round(width / avgSliceW));

  // Window count scales with building length so each ~3 brick panels of
  // wall gets its own window — matching the row-house density of the
  // iOS reference where every visible "section" has a lit window. Still
  // capped so adjacent windows don't pile up.
  let targetWindows = 1;
  if (sliceCount >= 5) targetWindows = 2;
  if (sliceCount >= 9) targetWindows = 3;
  if (sliceCount >= 13) targetWindows = 4;
  if (sliceCount >= 18) targetWindows = 5;

  // Pick which interior slice indices will be windows. Stay away from the
  // end-caps and keep MIN_BODY_GAP_BETWEEN_WINDOWS body panels between any
  // two windows.
  const windowSlots = new Set<number>();
  let attempts = 0;
  while (windowSlots.size < targetWindows && attempts < 80) {
    attempts++;
    if (sliceCount < 3) break; // too small to host an interior window
    const candidates: number[] = [];
    for (let i = 1; i < sliceCount - 1; i++) {
      if (windowSlots.has(i)) continue;
      let ok = true;
      for (const w of windowSlots) {
        if (Math.abs(i - w) <= MIN_BODY_GAP_BETWEEN_WINDOWS) { ok = false; break; }
      }
      if (ok) candidates.push(i);
    }
    if (candidates.length === 0) break;
    windowSlots.add(candidates[Math.floor(rng() * candidates.length)]);
  }
  // Guarantee at least one window even on tiny 2-slice buildings — replace
  // an interior slice (or the rightmost-but-one) so end-caps stay intact.
  if (windowSlots.size === 0 && sliceCount >= 2) {
    windowSlots.add(Math.max(1, Math.floor(sliceCount / 2)));
  }

  const panels: number[] = [];
  let prev = -1;
  for (let i = 0; i < sliceCount; i++) {
    let pick: number;
    if (windowSlots.has(i)) {
      pick = pickAvoidPrev(WINDOW_INDICES, prev);
    } else if (i === 0 || i === sliceCount - 1) {
      pick = pickAvoidPrev(END_CAP_INDICES, prev);
    } else {
      pick = pickAvoidPrev(BODY_INDICES, prev);
    }
    panels.push(pick);
    prev = pick;
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

// Fragment shader for the string-of-lights decoration. Saturated bulb
// pixels (red/yellow/green/blue) get a per-bulb sine pulse based on
// vUv.x and uTime; near-grayscale cord pixels are passed through
// unchanged. Saturation is approximated by max(rgb) - min(rgb).
const LIGHTS_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D map;
  uniform float uTime;
  uniform float uBulbsAcross;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(map, vUv);
    float maxC = max(c.r, max(c.g, c.b));
    float minC = min(c.r, min(c.g, c.b));
    float chroma = maxC - minC;
    float pulse = sin(uTime * 4.0 + vUv.x * uBulbsAcross * 6.2831);
    float boost = 1.0 + chroma * (0.18 + 0.22 * pulse);
    gl_FragColor = vec4(c.rgb * boost, c.a);
  }
`;
const LIGHTS_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

function syncDecorations(
  decorations: Decoration[],
  group: THREE.Group,
  map: Map<number, THREE.Mesh>,
) {
  const nowSec = performance.now() * 0.001;
  const seen = new Set<number>();
  for (const d of decorations) {
    seen.add(d.id);
    let m = map.get(d.id);
    if (!m) {
      m = buildDecorationMesh(d);
      map.set(d.id, m);
      group.add(m);
    }
    const visH = (m.geometry as THREE.PlaneGeometry).parameters.height;
    m.position.x = d.x;
    if (d.kind === "lights" || d.kind === "wreath") {
      // d.y is the artwork CENTER for these (lights drape under the snow
      // cap on the wall; wreath hangs centred on the brick wall).
      m.position.y = d.y;
    } else {
      // Pines / small snowmen — d.y is the bottom of the artwork (sits on
      // snow surface), so lift the plane center up by half its height.
      m.position.y = d.y + visH / 2;
    }
    // Pines and small snowmen sit ABOVE the snow cap (their bottoms are
    // on surfaceY) so a slightly negative z keeps them BEHIND the obstacle
    // plane (z=0.6) and snow cap (z=0.05) without being occluded — the
    // brick body sits at y<topY where they don't overlap.
    // Lights and wreath actually sit ON the brick wall (y at/below topY),
    // so they must render IN FRONT of the brick (positive z) but still
    // behind obstacles.
    if (d.kind === "wreath") {
      m.position.z = 0.02;
    } else if (d.kind === "lights") {
      m.position.z = 0.03;
    } else {
      m.position.z = -0.05;
    }
    if (d.kind === "pine") {
      // Gentle wind sway — phase comes from the id so adjacent trees
      // don't sway in lockstep.
      const t = nowSec * 1.2 + d.id * 0.7;
      m.rotation.z = Math.sin(t) * 0.035;
    } else if (d.kind === "lights") {
      // Drive the twinkle. Per-mesh phase offset so adjacent buildings
      // pulse out of sync.
      const mat = m.material as THREE.ShaderMaterial;
      mat.uniforms.uTime.value = nowSec + d.id * 0.31;
    }
  }
  for (const [id, mesh] of map) {
    if (!seen.has(id)) {
      group.remove(mesh);
      mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material;
      // The "lights" mesh owns a per-instance CLONED texture that lives
      // on a ShaderMaterial uniform. Material.dispose() only releases
      // shader/program resources, not the bound texture, so dispose it
      // explicitly to avoid leaking GPU memory as platforms are culled.
      if (mat instanceof THREE.ShaderMaterial) {
        const u = mat.uniforms.map;
        if (u && u.value && (u.value as THREE.Texture).dispose) {
          (u.value as THREE.Texture).dispose();
        }
      }
      mat.dispose();
      map.delete(id);
    }
  }
}

function buildDecorationMesh(d: Decoration): THREE.Mesh {
  if (d.kind === "lights") {
    const w = d.w ?? 4;
    const h = 0.55;
    // Tile the strip horizontally so bulb spacing stays roughly constant
    // regardless of platform width.
    const tex = getLightsTexture().clone();
    tex.needsUpdate = true;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    const repeats = Math.max(1, w / LIGHTS_WORLD_TILE_WIDTH);
    tex.repeat.set(repeats, 1);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: tex },
        uTime: { value: 0 },
        uBulbsAcross: { value: LIGHTS_BULBS_PER_TILE * repeats },
      },
      vertexShader: LIGHTS_VERTEX_SHADER,
      fragmentShader: LIGHTS_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.renderOrder = 3;
    return mesh;
  }
  if (d.kind === "wreath") {
    const tex = getWreathTexture();
    const baseH = 1.4;
    const h = baseH * d.scale;
    const w = h; // square texture
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        alphaTest: 0.04,
        toneMapped: false,
        depthWrite: false,
      }),
    );
    mesh.renderOrder = 4;
    return mesh;
  }
  // pine / smallsnowman
  const isPine = d.kind === "pine";
  const tex = isPine ? getPineTexture() : getSmallSnowmanTexture();
  // Real-world heights chosen so pines feel like rooftop trees and
  // small snowmen feel like background props. Aspect comes from the
  // canvas size used in the texture functions.
  const baseH = isPine ? 3.4 : 2.0;
  const aspect = isPine ? 256 / 384 : 192 / 256;
  const h = baseH * d.scale;
  const w = h * aspect;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.04,
      toneMapped: false,
      depthWrite: false,
    }),
  );
  mesh.renderOrder = 3;
  return mesh;
}

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
        // Chimney — the chunkiest rooftop feature in the iOS reference,
        // a stout red-brick box with a snow cap rising well above the
        // snow line. Render scale combined with the bigger collision
        // box (w=1.7, h=2.1 in world.ts) gives a chimney whose visible
        // brick stands ~4 world units tall — about as tall as a body
        // panel — matching the painted rooftops in santa-dash.jpg.
        tex = textures.chimneyTex;
        visW = o.w * 3.2;
        visH = o.h * 3.4;
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
