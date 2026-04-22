// Audio engine — uses Web Audio API for SFX so we can fire unlimited
// concurrent sounds reliably on iOS Safari with a single user-gesture
// unlock. Background music still uses HTMLAudioElement (streaming +
// looping is much simpler that way).

const BASE = `${import.meta.env.BASE_URL}audio`;

function range(a: number, b: number) {
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

const pools: Record<string, string[]> = {
  ready: range(1, 11).map((i) => `${BASE}/ready${i}.mp3`),
  jump: range(1, 6).map((i) => `${BASE}/santajump${i}.mp3`),
  chim: [
    ...range(1, 13).map((i) => `${BASE}/santachim${i}.mp3`),
    ...range(1, 11).map((i) => `${BASE}/fire${i}.mp3`),
  ],
  trip: range(1, 7).map((i) => `${BASE}/santatrip${i}.mp3`),
  ice: [
    ...range(1, 9).map((i) => `${BASE}/santaice${i}.mp3`),
    ...range(1, 10).map((i) => `${BASE}/slip${i}.mp3`),
  ],
  end: [
    ...range(1, 49).map((i) => `${BASE}/endgame${i}.mp3`),
    `${BASE}/endgame50d.mp3`,
  ],
  powerup: range(1, 11).map((i) => `${BASE}/ready${i}.mp3`),
  combo: range(1, 6).map((i) => `${BASE}/santajump${i}.mp3`),
};

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

// --- Web Audio for SFX ---
type AC = AudioContext;
let ctx: AC | null = null;
let sfxGain: GainNode | null = null;
// url -> decoded AudioBuffer, or a pending promise
const buffers: Map<string, AudioBuffer> = new Map();
const pending: Map<string, Promise<AudioBuffer | null>> = new Map();
const lastIndex: Record<string, number> = {};

function getCtx(): AC | null {
  if (ctx) return ctx;
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.7;
    sfxGain.connect(ctx.destination);
    return ctx;
  } catch {
    return null;
  }
}

async function loadBuffer(url: string): Promise<AudioBuffer | null> {
  if (buffers.has(url)) return buffers.get(url)!;
  const existing = pending.get(url);
  if (existing) return existing;
  const c = getCtx();
  if (!c) return null;
  const p = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const arr = await res.arrayBuffer();
      // Some browsers (older Safari) require the callback signature.
      const buf = await new Promise<AudioBuffer>((resolve, reject) => {
        c.decodeAudioData(arr, resolve, reject);
      });
      buffers.set(url, buf);
      return buf;
    } catch {
      return null;
    } finally {
      pending.delete(url);
    }
  })();
  pending.set(url, p);
  return p;
}

function preloadAll() {
  // Kick off decoding for every variant in the background
  for (const urls of Object.values(pools)) {
    for (const u of urls) loadBuffer(u);
  }
}

// --- HTMLAudio for music ---
let bgm: HTMLAudioElement | null = null;
let bgmStarted = false;

const BGM_BASE_VOLUME = 0.35;
const BGM_DUCK_VOLUME = 0.1;
const BGM_DUCK_MS = 550;
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

export function preloadAudio() {
  getCtx();
  preloadAll();
  if (!bgm) {
    bgm = new Audio(`${BASE}/SilentNight.mp3`);
    bgm.loop = true;
    bgm.volume = BGM_BASE_VOLUME;
    bgm.preload = "auto";
  }
}

export function unlockAudio() {
  if (unlocked) return;
  const c = getCtx();
  if (!c) return;
  unlocked = true;

  // Resume the AudioContext inside the gesture — this is the iOS unlock.
  if (c.state === "suspended") {
    c.resume().catch(() => {});
  }
  // Play a silent buffer through Web Audio to fully unlock on iOS.
  try {
    const silent = c.createBuffer(1, 1, 22050);
    const src = c.createBufferSource();
    src.buffer = silent;
    src.connect(c.destination);
    src.start(0);
  } catch {
    /* ignore */
  }

  preloadAll();

  // Music is HTMLAudio — needs its own gesture-driven start.
  if (bgm) {
    try {
      bgm.muted = false;
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
  bgm.play().catch(() => {
    bgmStarted = false;
  });
}

export function playSound(key: keyof typeof pools) {
  if (sfxMuted || !unlocked) return;
  const c = ctx;
  const gain = sfxGain;
  if (!c || !gain) return;
  const urls = pools[key];
  if (!urls || urls.length === 0) return;

  let idx = Math.floor(Math.random() * urls.length);
  if (urls.length > 1 && idx === lastIndex[key]) {
    idx = (idx + 1) % urls.length;
  }
  lastIndex[key] = idx;
  const url = urls[idx];

  if (DUCK_KEYS.has(key as string)) duckMusic(BGM_DUCK_MS);

  // Resume context if it was auto-suspended (mobile background, etc).
  if (c.state === "suspended") c.resume().catch(() => {});

  const cached = buffers.get(url);
  if (cached) {
    playBuffer(c, gain, cached);
    return;
  }
  // Not yet decoded — load and play when ready.
  loadBuffer(url).then((buf) => {
    if (!buf) return;
    playBuffer(c, gain, buf);
  });
}

function playBuffer(c: AC, gain: GainNode, buf: AudioBuffer) {
  try {
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(gain);
    src.start(0);
  } catch {
    /* ignore */
  }
}

export function setSfxMuted(m: boolean) {
  sfxMuted = m;
  savePref(SFX_MUTED_KEY, m);
}
export function isSfxMuted() {
  return sfxMuted;
}

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
export function isMusicMuted() {
  return musicMuted;
}
