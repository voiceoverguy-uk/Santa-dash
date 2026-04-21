// Pure game world simulation — separate from rendering so we can mutate refs without React re-renders.

export type ObstacleKind = "chimney" | "snowman" | "ice";
export type CollectibleKind = "mincepie";

export interface Obstacle {
  id: number;
  kind: ObstacleKind;
  x: number;
  y: number;       // base Y (sits on snow surface)
  w: number;
  h: number;
  hit: boolean;
}

export interface Collectible {
  id: number;
  kind: CollectibleKind;
  x: number;
  y: number;
  collected: boolean;
}

export interface Platform {
  id: number;
  x: number;       // left edge
  width: number;
  topY: number;    // brick top (without snow cap)
  variant: number; // which rooftop sprite
}

let nextId = 1;
const newId = () => nextId++;

export const PLATFORM_TOP = 0;             // brick top y (snow sits on top of this)
export const SNOW_CAP_HEIGHT = 0.55;       // snow cap thickness
export const SANTA_HALF_HEIGHT = 0.95;
export const SANTA_HALF_WIDTH = 0.42;

// The Y where Santa's center sits when feet are on a platform's snow cap
export function santaRestY(platformTopY: number) {
  return platformTopY + SNOW_CAP_HEIGHT + SANTA_HALF_HEIGHT;
}

const GRAVITY = -42;
const JUMP_VELOCITY_INITIAL = 9;       // immediate liftoff (so a tap still pops you up)
const JUMP_HOLD_FORCE = 38;            // additional upward accel while holding
const JUMP_HOLD_MAX_DURATION = 0.28;   // seconds of extra force on hold
const JUMP_RELEASE_VY_CUT = 0.45;      // velocity multiplier when jump is released early

export class World {
  platforms: Platform[] = [];
  obstacles: Obstacle[] = [];
  collectibles: Collectible[] = [];
  // Santa state
  santaX = 0;
  santaY = santaRestY(PLATFORM_TOP);
  santaVY = 0;
  onGround = true;
  // Animation
  runFrame = 0;
  hitTimer = 0;
  hitKind: "chim" | "ice" | null = null;
  // Game progression
  speed = 9;
  maxSpeed = 20;
  spawnedTo = 0;
  // Falling off
  isFalling = false;
  fallTimer = 0;
  // Jump hold tracking (for variable height)
  jumpHeld = false;
  jumpHoldTime = 0;
  // Slip from ice
  slipTimer = 0;

  constructor() { this.reset(); }

  reset() {
    this.platforms = [];
    this.obstacles = [];
    this.collectibles = [];
    this.santaX = 0;
    this.santaY = santaRestY(PLATFORM_TOP);
    this.santaVY = 0;
    this.onGround = true;
    this.runFrame = 0;
    this.hitTimer = 0;
    this.hitKind = null;
    this.speed = 9;
    this.spawnedTo = 0;
    this.isFalling = false;
    this.fallTimer = 0;
    this.jumpHeld = false;
    this.jumpHoldTime = 0;
    this.slipTimer = 0;
    // Initial long safe runway
    const start: Platform = {
      id: newId(),
      x: -10,
      width: 36,
      topY: PLATFORM_TOP,
      variant: 0,
    };
    this.platforms.push(start);
    this.spawnedTo = start.x + start.width;
  }

  // Begin a jump (returns true if a jump actually started)
  startJump() {
    if (this.onGround && this.hitTimer <= 0 && !this.isFalling) {
      this.santaVY = JUMP_VELOCITY_INITIAL;
      this.onGround = false;
      this.jumpHeld = true;
      this.jumpHoldTime = 0;
      return true;
    }
    return false;
  }

  // Release the jump button — cuts upward velocity if still rising (variable jump height)
  endJump() {
    if (this.jumpHeld && this.santaVY > 0) {
      this.santaVY *= JUMP_RELEASE_VY_CUT;
    }
    this.jumpHeld = false;
  }

  tick(dt: number): {
    collected: number;
    hit: ObstacleKind | null;
    fellOff: boolean;
  } {
    let collected = 0;
    let hit: ObstacleKind | null = null;
    let fellOff = false;

    // Speed up gradually
    this.speed = Math.min(this.maxSpeed, 9 + this.santaX * 0.005);

    // Forward motion
    if (!this.isFalling) {
      this.santaX += this.speed * dt;
    } else {
      this.santaX += this.speed * 0.25 * dt;
    }

    // Run animation advance
    const animFps = 26 + (this.speed - 9) * 1.5;
    this.runFrame += animFps * dt;

    // Jump hold extra lift
    if (this.jumpHeld && this.jumpHoldTime < JUMP_HOLD_MAX_DURATION && this.santaVY > 0) {
      this.santaVY += JUMP_HOLD_FORCE * dt;
      this.jumpHoldTime += dt;
    }

    // Gravity
    this.santaVY += GRAVITY * dt;
    this.santaY += this.santaVY * dt;

    // Find platform under feet
    const feetX = this.santaX;
    const platform = this.platforms.find(
      (p) => feetX >= p.x + 0.15 && feetX <= p.x + p.width - 0.15,
    );

    if (platform) {
      const surfaceY = santaRestY(platform.topY);
      if (this.santaY <= surfaceY && this.santaVY <= 0) {
        this.santaY = surfaceY;
        this.santaVY = 0;
        this.onGround = true;
      } else if (this.santaY > surfaceY) {
        this.onGround = false;
      }
    } else {
      this.onGround = false;
      // No platform under feet — fall starts as soon as we drop a tiny bit below the
      // last platform's surface. This guarantees gaps cannot be "skipped" by running.
      if (!this.isFalling && this.santaY < SANTA_HALF_HEIGHT + SNOW_CAP_HEIGHT - 0.1) {
        this.isFalling = true;
        fellOff = true;
      }
    }

    if (this.hitTimer > 0) {
      this.hitTimer -= dt;
      if (this.hitTimer <= 0) this.hitKind = null;
    }
    if (this.slipTimer > 0) this.slipTimer -= dt;
    if (this.isFalling) this.fallTimer += dt;

    // Collisions
    if (this.hitTimer <= 0 && !this.isFalling) {
      const sxL = this.santaX - SANTA_HALF_WIDTH;
      const sxR = this.santaX + SANTA_HALF_WIDTH;
      const syB = this.santaY - SANTA_HALF_HEIGHT;
      const syT = this.santaY + SANTA_HALF_HEIGHT;
      for (const o of this.obstacles) {
        if (o.hit) continue;
        const oxL = o.x - o.w / 2;
        const oxR = o.x + o.w / 2;
        const oyB = o.y;
        const oyT = o.y + o.h;
        if (sxR > oxL && sxL < oxR && syT > oyB && syB < oyT) {
          o.hit = true;
          hit = o.kind;
          this.hitTimer = 0.9;
          this.hitKind = o.kind === "ice" ? "ice" : "chim";
          if (o.kind === "ice") this.slipTimer = 0.5;
          break;
        }
      }
    }

    // Collectibles
    for (const c of this.collectibles) {
      if (c.collected) continue;
      const dx = c.x - this.santaX;
      const dy = c.y - this.santaY;
      if (Math.abs(dx) < 0.85 && Math.abs(dy) < 1.0) {
        c.collected = true;
        collected += 1;
      }
    }

    // Cull behind santa
    const cullBefore = this.santaX - 28;
    this.platforms = this.platforms.filter((p) => p.x + p.width > cullBefore);
    this.obstacles = this.obstacles.filter((o) => o.x > cullBefore);
    this.collectibles = this.collectibles.filter((c) => c.x > cullBefore);

    // Spawn ahead
    while (this.spawnedTo < this.santaX + 60) this.spawnChunk();

    return { collected, hit, fellOff };
  }

  private spawnChunk() {
    const speedFactor = (this.speed - 9) / 11; // 0..1
    // Min jumpable gap is bigger than what running can clear without jumping
    const gap = 3.2 + Math.random() * (1.8 + speedFactor * 2.5);
    const width = 9 + Math.random() * 12;
    const topY = PLATFORM_TOP + (Math.random() < 0.2 ? (Math.random() * 1.2 - 0.4) : 0);
    const variant = Math.floor(Math.random() * 7);
    const platform: Platform = {
      id: newId(),
      x: this.spawnedTo + gap,
      width,
      topY,
      variant,
    };
    this.platforms.push(platform);
    this.spawnedTo = platform.x + width;

    const surfaceY = platform.topY + SNOW_CAP_HEIGHT;

    const obstacleCount = Math.min(3, Math.floor(Math.random() * (1 + speedFactor * 3)));
    const usedSlots = new Set<number>();
    for (let i = 0; i < obstacleCount; i++) {
      const slot = Math.floor(Math.random() * Math.max(1, Math.floor(width / 3.5)));
      if (usedSlots.has(slot)) continue;
      usedSlots.add(slot);
      const ox = platform.x + 1.8 + slot * 3.5 + Math.random() * 1.2;
      if (ox > platform.x + width - 1.5) continue;
      const r = Math.random();
      let kind: ObstacleKind;
      let w: number, h: number;
      if (r < 0.4) {
        kind = "chimney"; w = 1.3; h = 1.7;
      } else if (r < 0.75) {
        kind = "snowman"; w = 1.2; h = 1.55;
      } else {
        kind = "ice"; w = 1.8; h = 0.45;
      }
      this.obstacles.push({
        id: newId(),
        kind,
        x: ox,
        y: surfaceY,
        w, h,
        hit: false,
      });
    }

    // Mince pies
    const collectibleCount = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < collectibleCount; i++) {
      const cx = platform.x + 1 + Math.random() * (width - 2);
      const high = Math.random() < 0.4;
      const cy = surfaceY + SANTA_HALF_HEIGHT + (high ? 1.6 + Math.random() * 1.0 : 0.2);
      this.collectibles.push({
        id: newId(),
        kind: "mincepie",
        x: cx,
        y: cy,
        collected: false,
      });
    }
  }
}
