// Asset path helpers — all paths are base-prefixed so they work under any deploy path.

const BASE = import.meta.env.BASE_URL;

const pad = (n: number) => String(n).padStart(4, "0");

export const SANTA_RUN: string[] = Array.from({ length: 37 }, (_, i) =>
  `${BASE}sprites/santa/run${pad(i + 1)}.png`,
);

export const SANTA_FALL: string[] = Array.from({ length: 6 }, (_, i) =>
  `${BASE}sprites/santa/fall${pad(i + 1)}.png`,
);

export const SANTA_IDLE: string[] = Array.from({ length: 15 }, (_, i) =>
  `${BASE}sprites/santa/idle${pad(i + 1)}.png`,
);

export const SANTA_HIT: string[] = Array.from({ length: 23 }, (_, i) =>
  `${BASE}sprites/santa/hit${pad(i + 1)}.png`,
);

export const SANTA_HIT_ICE: string[] = Array.from({ length: 16 }, (_, i) =>
  `${BASE}sprites/santa/hitIce${pad(i + 1)}.png`,
);

export const ROOFTOPS: string[] = Array.from({ length: 7 }, (_, i) =>
  `${BASE}sprites/rooftops/${i + 1}.png`,
);

export const OBSTACLES = {
  chimney: `${BASE}sprites/obstacles/chimney.png`,
  snowman: `${BASE}sprites/obstacles/snowman.png`,
  ice: `${BASE}sprites/obstacles/ice.png`,
  presents: `${BASE}sprites/obstacles/presents.png`,
  mincepie: `${BASE}sprites/obstacles/mincepie.png`,
};

export const BG = {
  snow: `${BASE}bg/snow.jpg`,
  dark: `${BASE}bg/dark.jpg`,
};

export const ALL_PRELOAD_TEXTURES: string[] = [
  ...SANTA_RUN,
  ...SANTA_FALL,
  ...SANTA_IDLE,
  ...SANTA_HIT.slice(0, 12),
  ...SANTA_HIT_ICE.slice(0, 12),
  ...ROOFTOPS,
  OBSTACLES.chimney,
  OBSTACLES.snowman,
  OBSTACLES.ice,
  OBSTACLES.presents,
  OBSTACLES.mincepie,
  BG.snow,
];
