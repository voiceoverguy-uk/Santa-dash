// Audio rotation manager — picks a random variant from each pool.
// Also manages a looping background music track.

const BASE = `${import.meta.env.BASE_URL}audio`;

function range(a: number, b: number) {
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

const pools: Record<string, string[]> = {
  ready: range(1, 11).map((i) => `${BASE}/ready${i}.mp3`),
  jump: range(1, 6).map((i) => `${BASE}/santajump${i}.mp3`),
  // Chimney/snowman hit — combine "santachim" (yells) with "fire" (santa-on-fire reactions)
  chim: [
    ...range(1, 13).map((i) => `${BASE}/santachim${i}.mp3`),
    ...range(1, 11).map((i) => `${BASE}/fire${i}.mp3`),
  ],
  trip: range(1, 7).map((i) => `${BASE}/santatrip${i}.mp3`),
  // Ice slip — combine "santaice" with "slip"
  ice: [
    ...range(1, 9).map((i) => `${BASE}/santaice${i}.mp3`),
    ...range(1, 10).map((i) => `${BASE}/slip${i}.mp3`),
  ],
  end: [
    ...range(1, 49).map((i) => `${BASE}/endgame${i}.mp3`),
    `${BASE}/endgame50d.mp3`,
  ],
  // Power-up & combo cues — reuse the cheery "ready" jingles and "santajump"
  // bursts since no dedicated cues ship with the project. Different keys keep
  // the rotation independent so they don't fight the main pools.
  powerup: range(1, 11).map((i) => `${BASE}/ready${i}.mp3`),
  combo: range(1, 6).map((i) => `${BASE}/santajump${i}.mp3`),
};

const elements: Record<string, HTMLAudioElement[]> = {};
const lastIndex: Record<string, number> = {};

const SFX_MUTED_KEY = "santaDash3D.sfxMuted";
const MUSIC_MUTED_KEY = "santaDash3D.musicMuted";

function loadPref(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function savePref(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

let sfxMuted = loadPref(SFX_MUTED_KEY);
let musicMuted = loadPref(MUSIC_MUTED_KEY);
let unlocked = false;

let bgm: HTMLAudioElement | null = null;
let bgmStarted = false;

const BGM_BASE_VOLUME = 0.35;
const BGM_DUCK_VOLUME = 0.1;
const BGM_DUCK_MS = 550;
// SFX that should briefly duck the music while they play.
const DUCK_KEYS = new Set(["chim", "ice", "end", "trip", "powerup"]);
let duckTimer: ReturnType<typeof setTimeout> | null = null;
let duckUntil = 0;

function duckMusic(ms: number) {
  if (!bgm || musicMuted) return;
  bgm.volume = BGM_DUCK_VOLUME;
  duckUntil = Math.max(duckUntil, performance.now() + ms);
  if (duckTimer) clearTimeout(duckTimer);
  const remaining = duckUntil - performance.now();
  duckTimer = setTimeout(() => {
    duckTimer = null;
    if (bgm && !musicMuted) bgm.volume = BGM_BASE_VOLUME;
  }, remaining);
}

// Pre-allocated copies per pool entry so we never need to cloneNode() at
// playtime — iOS Safari blocks .play() on Audio elements that weren't
// "warmed" inside a user gesture, so we warm everything up front.
const COPIES_PER_VARIANT = 2;

export function preloadAudio() {
  for (const [key, urls] of Object.entries(pools)) {
    const list: HTMLAudioElement[] = [];
    for (const url of urls) {
      for (let c = 0; c < COPIES_PER_VARIANT; c++) {
        const a = new Audio(url);
        a.preload = "auto";
        a.volume = 0.7;
        list.push(a);
      }
    }
    elements[key] = list;
    lastIndex[key] = -1;
  }
  if (!bgm) {
    bgm = new Audio(`${BASE}/SilentNight.mp3`);
    bgm.loop = true;
    bgm.volume = BGM_BASE_VOLUME;
    bgm.preload = "auto";
  }
}

export function unlockAudio() {
  if (unlocked) return;
  if (Object.keys(elements).length === 0) preloadAudio();
  if (Object.keys(elements).length === 0) return;
  unlocked = true;
  // iOS Safari requires every Audio element to be touched inside a user
  // gesture before it can be played later. Walk every preloaded element,
  // start it muted, then immediately pause/reset.
  for (const els of Object.values(elements)) {
    for (const a of els) {
      try {
        a.muted = true;
        const p = a.play();
        if (p && typeof p.then === "function") {
          p.then(() => {
            a.pause();
            a.currentTime = 0;
            a.muted = false;
          }).catch(() => {
            a.muted = false;
          });
        }
      } catch {
        /* ignore */
      }
    }
  }
  // Also touch + start music synchronously inside the gesture.
  if (bgm) {
    try {
      bgm.muted = false;
      // Force the load now that we have a gesture
      bgm.load();
    } catch {
      /* ignore */
    }
  }
  startMusic();
}

export function startMusic() {
  if (!bgm || musicMuted || bgmStarted) return;
  bgmStarted = true;
  bgm.play().catch(() => { bgmStarted = false; });
}

export function playSound(key: keyof typeof pools) {
  if (sfxMuted || !unlocked) return;
  const els = elements[key];
  if (!els || els.length === 0) return;
  let idx = Math.floor(Math.random() * els.length);
  if (els.length > 1 && idx === lastIndex[key]) {
    idx = (idx + 1) % els.length;
  }
  lastIndex[key] = idx;
  const node = els[idx];
  try {
    node.currentTime = 0;
  } catch {
    /* ignore — element may not be ready, .play() still resets */
  }
  node.muted = false;
  node.play().catch(() => {});
  if (DUCK_KEYS.has(key as string)) duckMusic(BGM_DUCK_MS);
}

export function setSfxMuted(m: boolean) {
  sfxMuted = m;
  savePref(SFX_MUTED_KEY, m);
}
export function isSfxMuted() { return sfxMuted; }

export function setMusicMuted(m: boolean) {
  musicMuted = m;
  savePref(MUSIC_MUTED_KEY, m);
  if (!bgm) return;
  if (m) {
    bgm.pause();
    bgmStarted = false;
  } else if (unlocked) {
    bgm.volume = BGM_BASE_VOLUME;
    startMusic();
  }
}
export function isMusicMuted() { return musicMuted; }
