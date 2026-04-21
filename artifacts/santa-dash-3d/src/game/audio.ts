// Audio rotation manager — picks a random variant from each pool

const BASE = `${import.meta.env.BASE_URL}audio`;

const pools: Record<string, string[]> = {
  ready: range(1, 7).map((i) => `${BASE}/Ready${i}.mp3`),
  jump: range(1, 7).map((i) => `${BASE}/Santajump${i}.mp3`),
  chim: range(1, 9).map((i) => `${BASE}/SantaChim${i}.mp3`),
  trip: range(1, 5).map((i) => `${BASE}/SantaTrip${i}.mp3`),
  end: range(1, 13).map((i) => `${BASE}/SantaEnd${i}.mp3`),
  ice: range(1, 5).map((i) => `${BASE}/SantaIce${i}.mp3`),
};

function range(a: number, b: number) {
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

const elements: Record<string, HTMLAudioElement[]> = {};
let lastIndex: Record<string, number> = {};
let muted = false;
let unlocked = false;

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
}

export function unlockAudio() {
  if (unlocked) return;
  // If preload hasn't populated elements yet, do it now so unlock actually works
  if (Object.keys(elements).length === 0) {
    preloadAudio();
  }
  if (Object.keys(elements).length === 0) return; // still nothing — try again on next gesture
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
}

export function playSound(key: keyof typeof pools) {
  if (muted || !unlocked) return;
  const els = elements[key];
  if (!els || els.length === 0) return;
  let idx = Math.floor(Math.random() * els.length);
  if (els.length > 1 && idx === lastIndex[key]) {
    idx = (idx + 1) % els.length;
  }
  lastIndex[key] = idx;
  const original = els[idx];
  // Clone the node so overlapping plays don't cut each other off
  const node = original.cloneNode(true) as HTMLAudioElement;
  node.volume = original.volume;
  node.play().catch(() => {});
}

export function setMuted(m: boolean) {
  muted = m;
}

export function isMuted() {
  return muted;
}
