import { useEffect, useState } from "react";

export type GameStatus = "menu" | "ready" | "playing" | "dead";

interface State {
  status: GameStatus;
  score: number;
  highScore: number;
  lives: number;
  distance: number;
  hitFlash: number;
}

type Listener = (s: State) => void;

const initial: State = {
  status: "menu",
  score: 0,
  highScore: Number(localStorage.getItem("santaDash:hi") ?? "0"),
  lives: 3,
  distance: 0,
  hitFlash: 0,
};

let state: State = { ...initial };
const listeners = new Set<Listener>();

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
    state = { ...state, status: "ready", score: 0, lives: 3, distance: 0, hitFlash: 0 };
    emit();
  },
  addScore: (n: number) => {
    state = { ...state, score: state.score + n };
    emit();
  },
  loseLife: () => {
    const lives = state.lives - 1;
    state = { ...state, lives, hitFlash: performance.now() };
    if (lives <= 0) {
      const highScore = Math.max(state.score, state.highScore);
      localStorage.setItem("santaDash:hi", String(highScore));
      state = { ...state, status: "dead", highScore };
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
