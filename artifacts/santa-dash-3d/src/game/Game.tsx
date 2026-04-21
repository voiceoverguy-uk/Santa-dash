import { Suspense, useEffect, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Santa } from "./Santa";
import { WorldRender } from "./WorldRender";
import { Background } from "./Background";
import { Snow } from "./Snow";
import { CameraRig } from "./CameraRig";
import { HUD } from "./HUD";
import { World } from "./world";
import { store, useStore } from "./store";
import { playSound, preloadAudio, unlockAudio } from "./audio";

// Run-scoped token to invalidate any pending timers from previous runs
let runToken = 0;

export function Game() {
  const worldRef = useRef<World>(new World());
  const status = useStore((s) => s.status);
  const canvasWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    preloadAudio();
  }, []);

  // Keyboard input
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const s = store.get().status;
      if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
        e.preventDefault();
        unlockAudio();
        if (s === "menu" || s === "dead") {
          startGame(worldRef.current);
        } else if (s === "ready" || s === "playing") {
          if (s === "ready") store.setStatus("playing");
          if (worldRef.current.jump()) playSound("jump");
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Touch input — only on the canvas wrapper, not on overlay/HUD buttons.
  // We attach to a dedicated div behind the HUD so taps on buttons aren't intercepted.
  const onCanvasPointerDown = () => {
    unlockAudio();
    const s = store.get().status;
    if (s === "menu") {
      startGame(worldRef.current);
    } else if (s === "ready" || s === "playing") {
      if (s === "ready") store.setStatus("playing");
      if (worldRef.current.jump()) playSound("jump");
    }
    // status==="dead" → require button press (avoid accidental restart)
  };

  const onStart = () => {
    unlockAudio();
    startGame(worldRef.current);
  };
  const onRestart = () => {
    unlockAudio();
    startGame(worldRef.current);
  };

  return (
    <div className="game-root">
      {/* The canvas + a transparent tap layer that captures taps on empty area only */}
      <div
        ref={canvasWrapRef}
        className="canvas-wrap"
        onPointerDown={onCanvasPointerDown}
      >
        <Canvas
          shadows={false}
          dpr={[1, 2]}
          gl={{ antialias: true, powerPreference: "high-performance" }}
          camera={{ position: [4, 4, 13], fov: 50, near: 0.1, far: 200 }}
        >
          <color attach="background" args={["#0a1230"]} />
          <fog attach="fog" args={["#1a2350", 30, 90]} />
          <ambientLight intensity={0.85} />
          <directionalLight position={[6, 12, 8]} intensity={1.1} color="#fff1d6" />
          <directionalLight position={[-8, 6, -4]} intensity={0.4} color="#9ec3ff" />

          <Suspense fallback={null}>
            <Background world={worldRef} />
            <WorldRender world={worldRef} />
            <Santa world={worldRef} />
            <Snow world={worldRef} />
            <CameraRig world={worldRef} />
            <Loop world={worldRef} />
          </Suspense>
        </Canvas>
      </div>

      <HUD onStart={onStart} onRestart={onRestart} />
      {status === "menu" || status === "dead" ? null : (
        <div className="status-tag">{status === "ready" ? "Tap or press Space to begin" : null}</div>
      )}
    </div>
  );
}

function startGame(world: World) {
  runToken++;
  world.reset();
  store.reset();
  playSound("ready");
}

// Drives the world simulation each frame
function Loop({ world }: { world: React.MutableRefObject<World> }) {
  const endPlayedRef = useRef(false);

  useFrame((_, dtRaw) => {
    const status = store.get().status;
    if (status !== "playing") {
      if (status !== "dead") endPlayedRef.current = false;
      else if (!endPlayedRef.current) {
        endPlayedRef.current = true;
        playSound("end");
      }
      return;
    }
    const dt = Math.min(dtRaw, 1 / 30);
    const w = world.current;
    const ev = w.tick(dt);
    if (ev.collected > 0) {
      store.addScore(ev.collected * 10);
    }
    if (ev.hit) {
      if (ev.hit === "ice") playSound("ice");
      else playSound("chim");
      store.loseLife();
    }
    if (ev.fellOff) {
      playSound("trip");
      const myToken = runToken;
      setTimeout(() => {
        if (myToken !== runToken) return; // a new run started
        if (store.get().status !== "playing") return;
        while (store.get().lives > 0) store.loseLife();
      }, 600);
    }
    store.setDistance(w.santaX);
    if (Math.random() < dt * 2) store.addScore(1);
  });
  return null;
}
