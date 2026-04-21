// Pure game world simulation — separate from rendering so we can mutate refs without React re-renders.

export type ObstacleKind = "chimney" | "snowman" | "ice";
export type CollectibleKind = "presents";

export interface Obstacle {
  id: number;
  kind: ObstacleKind;
  x: number;
  y: number;
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
  topY: number;    // top surface y
  variant: number; // which rooftop sprite
}

let nextId = 1;
const newId = () => nextId++;

export const PLATFORM_TOP = 0;             // ground surface y
export const SANTA_HALF_HEIGHT = 0.95;
export const SANTA_HALF_WIDTH = 0.45;

export class World {
  platforms: Platform[] = [];
  obstacles: Obstacle[] = [];
  collectibles: Collectible[] = [];
  // Santa state
  santaX = 0;
  santaY = PLATFORM_TOP + SANTA_HALF_HEIGHT;
  santaVY = 0;
  onGround = true;
  // Animation
  runFrame = 0;
  hitTimer = 0;       // counts down; while >0, santa is invulnerable / shows hit anim
  hitKind: "chim" | "ice" | null = null;
  // Game progression
  speed = 8;          // units per second
  maxSpeed = 18;
  spawnedTo = 0;      // x up to which we've spawned content
  // Falling off
  isFalling = false;
  fallTimer = 0;

  constructor() {
    this.reset();
  }

  reset() {
    this.platforms = [];
    this.obstacles = [];
    this.collectibles = [];
    this.santaX = 0;
    this.santaY = PLATFORM_TOP + SANTA_HALF_HEIGHT;
    this.santaVY = 0;
    this.onGround = true;
    this.runFrame = 0;
    this.hitTimer = 0;
    this.hitKind = null;
    this.speed = 8;
    this.spawnedTo = 0;
    this.isFalling = false;
    this.fallTimer = 0;
    // Spawn an initial long safe runway so the player can get oriented
    const start: Platform = {
      id: newId(),
      x: -10,
      width: 40,
      topY: PLATFORM_TOP,
      variant: 0,
    };
    this.platforms.push(start);
    this.spawnedTo = start.x + start.width;
  }

  jump() {
    if (this.onGround && this.hitTimer <= 0 && !this.isFalling) {
      this.santaVY = 11;
      this.onGround = false;
      return true;
    }
    return false;
  }

  // returns events that happened this tick
  tick(dt: number): {
    collected: number;
    hit: ObstacleKind | null;
    fellOff: boolean;
  } {
    let collected = 0;
    let hit: ObstacleKind | null = null;
    let fellOff = false;

    // Speed up gradually with distance
    this.speed = Math.min(this.maxSpeed, 8 + this.santaX * 0.004);

    // Move santa forward
    if (!this.isFalling) {
      this.santaX += this.speed * dt;
    } else {
      // small forward drift while falling
      this.santaX += this.speed * 0.3 * dt;
    }

    // Animation frame advance
    const animFps = 24 + (this.speed - 8) * 1.2;
    this.runFrame += animFps * dt;

    // Gravity
    const gravity = -28;
    this.santaVY += gravity * dt;
    this.santaY += this.santaVY * dt;

    // Find the platform Santa is currently above (by feet position)
    const feetX = this.santaX;
    const platform = this.platforms.find(
      (p) => feetX >= p.x + 0.2 && feetX <= p.x + p.width - 0.2,
    );

    if (platform) {
      const surfaceY = platform.topY + SANTA_HALF_HEIGHT;
      if (this.santaY <= surfaceY && this.santaVY <= 0) {
        this.santaY = surfaceY;
        this.santaVY = 0;
        this.onGround = true;
      } else if (this.santaY > surfaceY) {
        this.onGround = false;
      }
    } else {
      this.onGround = false;
      // No platform under feet — santa is falling into a gap
      if (this.santaY < PLATFORM_TOP - 1.5 && !this.isFalling) {
        this.isFalling = true;
        fellOff = true;
      }
    }

    // Hit timer countdown
    if (this.hitTimer > 0) {
      this.hitTimer -= dt;
      if (this.hitTimer <= 0) {
        this.hitKind = null;
      }
    }

    // Falling timer (for game-over delay)
    if (this.isFalling) {
      this.fallTimer += dt;
    }

    // Collisions — only if not invulnerable and not falling
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
          break;
        }
      }
    }

    // Collectible pickups
    for (const c of this.collectibles) {
      if (c.collected) continue;
      const dx = c.x - this.santaX;
      const dy = c.y - this.santaY;
      if (Math.abs(dx) < 0.9 && Math.abs(dy) < 1.0) {
        c.collected = true;
        collected += 1;
      }
    }

    // Cleanup behind santa
    const cullBefore = this.santaX - 30;
    this.platforms = this.platforms.filter((p) => p.x + p.width > cullBefore);
    this.obstacles = this.obstacles.filter((o) => o.x > cullBefore);
    this.collectibles = this.collectibles.filter((c) => c.x > cullBefore);

    // Spawn ahead
    while (this.spawnedTo < this.santaX + 60) {
      this.spawnChunk();
    }

    return { collected, hit, fellOff };
  }

  private spawnChunk() {
    // Gap between platforms — gets bigger with speed
    const speedFactor = (this.speed - 8) / 10; // 0..1
    const gap = 1.5 + Math.random() * (1.5 + speedFactor * 2.5);
    const width = 8 + Math.random() * 12;
    const topY = PLATFORM_TOP + (Math.random() < 0.25 ? (Math.random() * 1.5 - 0.5) : 0);
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

    // Add 0-3 obstacles on this platform
    const obstacleCount = Math.min(3, Math.floor(Math.random() * (1 + speedFactor * 3)));
    const usedX = new Set<number>();
    for (let i = 0; i < obstacleCount; i++) {
      const slot = Math.floor(Math.random() * Math.max(1, Math.floor(width / 3)));
      if (usedX.has(slot)) continue;
      usedX.add(slot);
      const ox = platform.x + 1.5 + slot * 3 + Math.random() * 1.5;
      if (ox > platform.x + width - 1.5) continue;
      const r = Math.random();
      let kind: ObstacleKind;
      let w: number, h: number;
      if (r < 0.4) {
        kind = "chimney"; w = 1.3; h = 1.6;
      } else if (r < 0.75) {
        kind = "snowman"; w = 1.2; h = 1.5;
      } else {
        kind = "ice"; w = 1.6; h = 0.4;
      }
      this.obstacles.push({
        id: newId(),
        kind,
        x: ox,
        y: platform.topY,
        w,
        h,
        hit: false,
      });
    }

    // Add presents (collectibles) — sometimes high (forces jumps), sometimes low
    const collectibleCount = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < collectibleCount; i++) {
      const cx = platform.x + 1 + Math.random() * (width - 2);
      const high = Math.random() < 0.45;
      const cy = platform.topY + (high ? 2.6 + Math.random() * 1.2 : 1.0);
      this.collectibles.push({
        id: newId(),
        kind: "presents",
        x: cx,
        y: cy,
        collected: false,
      });
    }
  }
}
