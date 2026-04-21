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
  end: range(1, 49).map((i) => `${BASE}/endgame${i}.mp3`),
};

const elements: Record<string, HTMLAudioElement[]> = {};
const lastIndex: Record<string, number> = {};
let sfxMuted = false;
let musicMuted = false;
let unlocked = false;

let bgm: HTMLAudioElement | null = null;
let bgmStarted = false;

export function preloadAudio() {
  for (const [key, urls] of Object.entries(pools)) {
    elements[key] = urls.map((url) => {
      const a = new Audio(url);
      a.preload = "auto";
      a.volume = 0.7;
      return a;
    });
    lastIndex[key] = -1;
  }
  if (!bgm) {
    bgm = new Audio(`${BASE}/SilentNight.mp3`);
    bgm.loop = true;
    bgm.volume = 0.35;
    bgm.preload = "auto";
  }
}

export function unlockAudio() {
  if (unlocked) return;
  if (Object.keys(elements).length === 0) preloadAudio();
  if (Object.keys(elements).length === 0) return;
  unlocked = true;
  // Touch each pool with a silent play to unlock on iOS/Safari
  for (const els of Object.values(elements)) {
    const a = els[0];
    if (!a) continue;
    a.muted = true;
    a.play().then(() => {
      a.pause();
      a.currentTime = 0;
      a.muted = false;
    }).catch(() => {});
  }
  // Also start music if not muted
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
  const original = els[idx];
  // Clone to allow overlapping playback
  const node = original.cloneNode(true) as HTMLAudioElement;
  node.volume = original.volume;
  node.play().catch(() => {});
}

export function setSfxMuted(m: boolean) { sfxMuted = m; }
export function isSfxMuted() { return sfxMuted; }

export function setMusicMuted(m: boolean) {
  musicMuted = m;
  if (!bgm) return;
  if (m) {
    bgm.pause();
    bgmStarted = false;
  } else if (unlocked) {
    startMusic();
  }
}
export function isMusicMuted() { return musicMuted; }
