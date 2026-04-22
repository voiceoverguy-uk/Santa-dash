import { useEffect, useState } from "react";
import type { PowerUpKind } from "./world";
import { POWERUP_DURATION } from "./world";

export type GameStatus = "menu" | "ready" | "playing" | "paused" | "dying" | "dead";

export interface PowerUpState {
  kind: PowerUpKind;
  remaining: number; // seconds
  duration: number;  // seconds (full)
}

interface State {
  status: GameStatus;
  score: number;
  highScore: number;
  lives: number;
  distance: number;
  hitFlash: number;
  combo: number;
  multiplier: number;
  bestCombo: number;
  powerUps: Partial<Record<PowerUpKind, PowerUpState>>;
  pickupFlash: { kind: PowerUpKind; at: number } | null;
}

type Listener = (s: State) => void;

const initial: State = {
  status: "menu",
  score: 0,
  highScore: Number(localStorage.getItem("santaDash:hi") ?? "0"),
  lives: 3,
  distance: 0,
  hitFlash: 0,
  combo: 0,
  multiplier: 1,
  bestCombo: 0,
  powerUps: {},
  pickupFlash: null,
};

let state: State = { ...initial };
const listeners = new Set<Listener>();
// Token so a queued "dying → dead" promotion from a previous run can't fire
// after the player has restarted.
let deathToken = 0;

function emit() {
  for (const l of listeners) l(state);
}

export const store = {
  get: () => state,
  set: (patch: Partial<State>) => {
    state = { ...state, ...patch };
    emit();
  },
  subscribe: (l: Listener) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  reset: () => {
    deathToken++;
    state = {
      ...state,
      status: "ready",
      score: 0,
      lives: 3,
      distance: 0,
      hitFlash: 0,
      combo: 0,
      multiplier: 1,
      bestCombo: 0,
      powerUps: {},
      pickupFlash: null,
    };
    emit();
  },
  addScore: (n: number) => {
    state = { ...state, score: state.score + n };
    emit();
  },
  setCombo: (combo: number, multiplier: number) => {
    if (combo === state.combo && multiplier === state.multiplier) return;
    const bestCombo = Math.max(state.bestCombo, combo);
    state = { ...state, combo, multiplier, bestCombo };
    emit();
  },
  setPowerUpTimers: (timers: Record<PowerUpKind, number>) => {
    let changed = false;
    const next: Partial<Record<PowerUpKind, PowerUpState>> = {};
    for (const k of ["magnet", "shield", "double"] as PowerUpKind[]) {
      const remaining = timers[k];
      if (remaining > 0) {
        const prev = state.powerUps[k];
        next[k] = {
          kind: k,
          remaining,
          duration: prev?.duration ?? POWERUP_DURATION[k],
        };
        if (!prev || Math.abs(prev.remaining - remaining) > 0.1) changed = true;
      } else if (state.powerUps[k]) {
        changed = true;
      }
    }
    if (changed) {
      state = { ...state, powerUps: next };
      emit();
    }
  },
  registerPowerUpPickup: (kind: PowerUpKind) => {
    const duration = POWERUP_DURATION[kind];
    state = {
      ...state,
      powerUps: {
        ...state.powerUps,
        [kind]: { kind, remaining: duration, duration },
      },
      pickupFlash: { kind, at: performance.now() },
    };
    emit();
  },
  loseLife: () => {
    const lives = state.lives - 1;
    state = { ...state, lives, hitFlash: performance.now() };
    if (lives <= 0) {
      const highScore = Math.max(state.score, state.highScore);
      localStorage.setItem("santaDash:hi", String(highScore));
      // Enter "dying": world freezes, death audio gets a beat to play, but the
      // Game Over overlay is held back for 1.5s so the player can't tap-restart
      // through the death sound.
      state = { ...state, status: "dying", highScore };
      const dyingToken = ++deathToken;
      setTimeout(() => {
        if (deathToken !== dyingToken) return;
        if (state.status !== "dying") return;
        state = { ...state, status: "dead" };
        emit();
      }, 1500);
    }
    emit();
  },
  setStatus: (status: GameStatus) => {
    state = { ...state, status };
    emit();
  },
  setDistance: (distance: number) => {
    if (Math.abs(distance - state.distance) > 0.5) {
      state = { ...state, distance };
      emit();
    }
  },
};

export function useStore<T>(selector: (s: State) => T): T {
  const [val, setVal] = useState(() => selector(state));
  useEffect(() => {
    const unsub = store.subscribe((s) => setVal(selector(s)));
    return () => { unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return val;
}
