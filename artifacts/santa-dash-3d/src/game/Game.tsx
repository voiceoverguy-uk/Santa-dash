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

  useEffect(() => {
    preloadAudio();
  }, []);

  // Keyboard input — variable jump (down = start, up = end)
  useEffect(() => {
    const isJumpKey = (code: string) =>
      code === "Space" || code === "ArrowUp" || code === "KeyW";

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isJumpKey(e.code)) return;
      e.preventDefault();
      if (e.repeat) return;
      unlockAudio();
      const s = store.get().status;
      if (s === "menu" || s === "dead") {
        startGame(worldRef.current);
        return;
      }
      if (s === "ready") store.setStatus("playing");
      if (worldRef.current.startJump()) playSound("jump");
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!isJumpKey(e.code)) return;
      worldRef.current.endJump();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Touch on the canvas wrapper — scoped so HUD/menu buttons aren't intercepted
  const onCanvasPointerDown = () => {
    unlockAudio();
    const s = store.get().status;
    if (s === "menu") {
      startGame(worldRef.current);
      return;
    }
    if (s === "dead") return; // dead → require button press
    if (s === "ready") store.setStatus("playing");
    if (worldRef.current.startJump()) playSound("jump");
  };
  const onCanvasPointerUp = () => {
    worldRef.current.endJump();
  };

  const onStart = () => { unlockAudio(); startGame(worldRef.current); };
  const onRestart = () => { unlockAudio(); startGame(worldRef.current); };

  return (
    <div className="game-root">
      <div
        className="canvas-wrap"
        onPointerDown={onCanvasPointerDown}
        onPointerUp={onCanvasPointerUp}
        onPointerCancel={onCanvasPointerUp}
        onPointerLeave={onCanvasPointerUp}
      >
        <Canvas
          shadows={false}
          dpr={[1, 2]}
          gl={{ antialias: true, powerPreference: "high-performance" }}
          camera={{ position: [4, 4, 13], fov: 50, near: 0.1, far: 200 }}
          frameloop="always"
        >
          <color attach="background" args={["#0a1230"]} />
          <fog attach="fog" args={["#1a2350", 36, 100]} />
          <ambientLight intensity={0.95} />
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
      {status === "ready" && (
        <div className="status-tag">Tap or press Space to begin</div>
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
    // Clamp dt — handles tab-switch spikes without making physics jumpy
    const dt = Math.min(dtRaw, 1 / 30);
    const w = world.current;
    const ev = w.tick(dt);
    if (ev.scoreGained > 0) {
      store.addScore(ev.scoreGained);
      if (ev.combo > 0 && ev.combo % 5 === 0) playSound("combo");
    }
    store.setCombo(ev.combo, ev.multiplier);
    store.setPowerUpTimers(w.powerUpTimers);
    if (ev.pickedPowerUp) {
      store.registerPowerUpPickup(ev.pickedPowerUp);
      playSound("powerup");
    }
    if (ev.shieldedHit) {
      // Shield absorbed — same audio cue as obstacle but no life lost
      if (ev.shieldedHit === "ice") playSound("ice");
      else playSound("chim");
      store.set({ hitFlash: performance.now() });
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
        if (myToken !== runToken) return;
        if (store.get().status !== "playing") return;
        while (store.get().lives > 0) store.loseLife();
      }, 700);
    }
    store.setDistance(w.santaX);
    if (Math.random() < dt * 2) store.addScore(1);
  });
  return null;
}
