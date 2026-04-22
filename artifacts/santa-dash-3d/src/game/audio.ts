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

// Pools of file-based SFX. Synthesized SFX (coin / lu / click) live in their
// own playSynth path below.
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
  combo: range(1, 6).map((i) => `${BASE}/santajump${i}.mp3`),
  coin: [`${BASE}/coin.mp3`],
  bonus: [`${BASE}/bonus.mp3`],
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
    // Hint the browser to start downloading immediately so the file is ready
    // by the time the user presses Start Run.
    try {
      bgm.load();
    } catch {
      /* ignore */
    }
  }
}

export function unlockAudio() {
  const c = getCtx();
  if (!c) return;

  // Resume the AudioContext inside the gesture — this is the iOS unlock.
  if (c.state === "suspended") {
    c.resume().catch(() => {});
  }

  if (!unlocked) {
    unlocked = true;
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
  }

  // Music is HTMLAudio — start it inside the user gesture so iOS unlocks it.
  // Run this on every gesture so we can recover from a previously-failed
  // start attempt (e.g. file wasn't loaded yet on the first tap).
  if (bgm) {
    try {
      bgm.muted = false;
    } catch {
      /* ignore */
    }
  }
  startMusic();
}

export function startMusic() {
  if (!bgm || musicMuted || bgmStarted) return;
  const el = bgm;
  bgmStarted = true;
  const tryPlay = () => {
    if (musicMuted) return;
    const p = el.play();
    if (p && typeof p.catch === "function") {
      p.then(() => {
        console.log("[audio] bgm playing");
      }).catch((err) => {
        console.warn("[audio] bgm play() rejected:", err?.name, err?.message);
        // If play failed because the audio isn't loaded yet, wait for it
        // to be ready and try again. iOS Safari needs this on slow networks.
        bgmStarted = false;
        const onReady = () => {
          el.removeEventListener("canplaythrough", onReady);
          el.removeEventListener("canplay", onReady);
          if (!musicMuted && !bgmStarted) {
            bgmStarted = true;
            el.play()
              .then(() => console.log("[audio] bgm playing (retry)"))
              .catch((e) => {
                console.warn("[audio] bgm retry rejected:", e?.name, e?.message);
                bgmStarted = false;
              });
          }
        };
        el.addEventListener("canplaythrough", onReady, { once: true });
        el.addEventListener("canplay", onReady, { once: true });
      });
    }
  };
  tryPlay();
}

// Per-pool throttle so a single trigger can't accidentally fire dozens of
// overlapping plays. Especially important for "end" (death sound) which
// must be one-shot per death event.
const POOL_THROTTLE_MS: Partial<Record<keyof typeof pools, number>> = {
  end: 4000,
  ready: 1500,
  trip: 400,
  chim: 200,
  ice: 200,
  coin: 60,
  bonus: 400,
};
const lastPlayedAt: Record<string, number> = {};

export function playSound(key: keyof typeof pools) {
  if (sfxMuted || !unlocked) return;
  const c = ctx;
  const gain = sfxGain;
  if (!c || !gain) return;
  const urls = pools[key];
  if (!urls || urls.length === 0) return;

  const now = performance.now();
  const minGap = POOL_THROTTLE_MS[key] ?? 50;
  if (now - (lastPlayedAt[key] ?? 0) < minGap) return;
  lastPlayedAt[key] = now;

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

// Schedule a sound to play after `delayMs`, but only if the run-token still
// matches when the timer fires. Used so the endgame voice plays a moment
// AFTER santa actually drops between houses.
let endTimer: ReturnType<typeof setTimeout> | null = null;
export function playSoundDelayed(key: keyof typeof pools, delayMs: number) {
  if (key === "end" && endTimer) {
    clearTimeout(endTimer);
    endTimer = null;
  }
  const t = setTimeout(() => {
    if (key === "end") endTimer = null;
    playSound(key);
  }, delayMs);
  if (key === "end") endTimer = t;
}
export function cancelDelayedEnd() {
  if (endTimer) {
    clearTimeout(endTimer);
    endTimer = null;
  }
}

// Reset throttles when a new game starts so previous-session timing can't
// suppress legitimate sound effects.
export function resetSfxThrottles() {
  for (const k of Object.keys(lastPlayedAt)) lastPlayedAt[k] = 0;
  cancelDelayedEnd();
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

// ---- Synthesized SFX (placeholders until coin.wav / LU.mp3 / but.mp3 are
// uploaded). Each is a short, recognisable cue built with oscillators so the
// game has the right "language" of sounds for collect / power-up / button.
type SynthKey = "coin" | "lu" | "click";
const SYNTH_THROTTLE_MS: Record<SynthKey, number> = {
  coin: 60,
  lu: 250,
  click: 120,
};
const lastSynthAt: Record<SynthKey, number> = { coin: 0, lu: 0, click: 0 };

export function playSynth(key: SynthKey) {
  if (sfxMuted) return;
  const c = ctx;
  const gain = sfxGain;
  if (!c || !gain) return;
  const now = performance.now();
  if (now - lastSynthAt[key] < SYNTH_THROTTLE_MS[key]) return;
  lastSynthAt[key] = now;
  if (c.state === "suspended") c.resume().catch(() => {});

  if (key === "coin") {
    // Bright two-note coin "ding" — square + sine pair.
    coinDing(c, gain);
  } else if (key === "lu") {
    // Power-up "level-up" rising arpeggio C → E → G → C
    levelUp(c, gain);
  } else {
    // Soft UI button click
    buttonClick(c, gain);
  }
}

function envelopeNote(
  c: AC,
  out: GainNode,
  freq: number,
  type: OscillatorType,
  startOffset: number,
  duration: number,
  peak: number,
) {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime + startOffset);
  g.gain.setValueAtTime(0, c.currentTime + startOffset);
  g.gain.linearRampToValueAtTime(peak, c.currentTime + startOffset + 0.005);
  g.gain.exponentialRampToValueAtTime(
    0.0001,
    c.currentTime + startOffset + duration,
  );
  osc.connect(g);
  g.connect(out);
  osc.start(c.currentTime + startOffset);
  osc.stop(c.currentTime + startOffset + duration + 0.02);
}

function coinDing(c: AC, out: GainNode) {
  // Classic two-note coin: A5 then E6
  envelopeNote(c, out, 880, "square", 0, 0.08, 0.18);
  envelopeNote(c, out, 1318.5, "square", 0.06, 0.18, 0.22);
  envelopeNote(c, out, 2637, "sine", 0.06, 0.22, 0.1);
}

function levelUp(c: AC, out: GainNode) {
  // C5 E5 G5 C6
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => {
    envelopeNote(c, out, f, "triangle", i * 0.07, 0.16, 0.24);
    envelopeNote(c, out, f * 2, "sine", i * 0.07, 0.18, 0.08);
  });
}

function buttonClick(c: AC, out: GainNode) {
  // Short downward chirp
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(620, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(180, c.currentTime + 0.08);
  g.gain.setValueAtTime(0, c.currentTime);
  g.gain.linearRampToValueAtTime(0.2, c.currentTime + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.1);
  osc.connect(g);
  g.connect(out);
  osc.start();
  osc.stop(c.currentTime + 0.12);
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

// Pause / resume music without changing the user's mute preference.
// Used by the in-game Pause button.
export function pauseMusic() {
  if (!bgm) return;
  try {
    bgm.pause();
  } catch {
    /* ignore */
  }
  bgmStarted = false;
}
export function resumeMusic() {
  if (musicMuted || !unlocked) return;
  if (!bgm) return;
  startMusic();
}
