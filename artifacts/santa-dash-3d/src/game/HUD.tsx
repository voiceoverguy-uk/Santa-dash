import { useStore, store, type PowerUpState } from "./store";
import {
  isSfxMuted,
  setSfxMuted,
  isMusicMuted,
  setMusicMuted,
} from "./audio";
import { useEffect, useState } from "react";
import type { PowerUpKind } from "./world";

interface Props {
  onStart: () => void;
  onRestart: () => void;
}

const POWERUP_META: Record<PowerUpKind, { label: string; icon: string; color: string }> = {
  magnet: { label: "Magnet", icon: "🧲", color: "#ff6b6b" },
  shield: { label: "Shield", icon: "🛡️", color: "#7dd3fc" },
  double: { label: "2× Points", icon: "✨", color: "#ffd97a" },
};

export function HUD({ onStart, onRestart }: Props) {
  const status = useStore((s) => s.status);
  const score = useStore((s) => s.score);
  const lives = useStore((s) => s.lives);
  const highScore = useStore((s) => s.highScore);
  const distance = useStore((s) => s.distance);
  const hitFlash = useStore((s) => s.hitFlash);
  const combo = useStore((s) => s.combo);
  const multiplier = useStore((s) => s.multiplier);
  const bestCombo = useStore((s) => s.bestCombo);
  const powerUps = useStore((s) => s.powerUps);
  const pickupFlash = useStore((s) => s.pickupFlash);
  const [, force] = useState(0);

  // Re-render once per ~150ms while playing so timer bars animate smoothly.
  useEffect(() => {
    if (status !== "playing") return;
    const id = setInterval(() => force((n) => n + 1), 120);
    return () => clearInterval(id);
  }, [status]);

  const showFlash = hitFlash > 0 && performance.now() - hitFlash < 280;
  const activePickup =
    pickupFlash && performance.now() - pickupFlash.at < 1100 ? pickupFlash : null;

  const activePowerUps = (Object.values(powerUps).filter(Boolean) as PowerUpState[]);

  return (
    <>
      {showFlash && <div className="hit-flash" />}

      {(status === "ready" || status === "playing") && (
        <>
          <div className="hud-top">
            <div className="hud-card">
              <div className="hud-label">SCORE</div>
              <div className="hud-value">{score}</div>
            </div>
            <div className="hud-card">
              <div className="hud-label">DISTANCE</div>
              <div className="hud-value">{Math.floor(distance)}m</div>
            </div>
            <div className="hud-card lives">
              {Array.from({ length: 3 }).map((_, i) => (
                <span key={i} className={`heart ${i < lives ? "alive" : "lost"}`}>♥</span>
              ))}
            </div>
            <div className="audio-controls">
              <button
                className="mute-btn"
                onClick={(e) => { e.stopPropagation(); setMusicMuted(!isMusicMuted()); force((n) => n + 1); }}
                aria-label={isMusicMuted() ? "Unmute music" : "Mute music"}
                title={isMusicMuted() ? "Music off" : "Music on"}
              >
                {isMusicMuted() ? "🎵̶" : "🎵"}
              </button>
              <button
                className="mute-btn"
                onClick={(e) => { e.stopPropagation(); setSfxMuted(!isSfxMuted()); force((n) => n + 1); }}
                aria-label={isSfxMuted() ? "Unmute" : "Mute"}
                title={isSfxMuted() ? "Sound off" : "Sound on"}
              >
                {isSfxMuted() ? "🔇" : "🔊"}
              </button>
            </div>
          </div>

          {combo >= 2 && (
            <div className={`combo-badge mult-${Math.min(5, multiplier)}`} key={combo}>
              <div className="combo-count">{combo}<span>×</span></div>
              <div className="combo-mult">{multiplier}× Multiplier</div>
            </div>
          )}

          {activePowerUps.length > 0 && (
            <div className="powerup-stack">
              {activePowerUps.map((pu) => {
                const meta = POWERUP_META[pu.kind];
                const pct = Math.max(0, Math.min(1, pu.remaining / pu.duration));
                return (
                  <div key={pu.kind} className="powerup-chip" style={{ borderColor: meta.color }}>
                    <span className="pu-icon">{meta.icon}</span>
                    <div className="pu-body">
                      <div className="pu-label" style={{ color: meta.color }}>{meta.label}</div>
                      <div className="pu-bar"><div className="pu-bar-fill" style={{ width: `${pct * 100}%`, background: meta.color }} /></div>
                    </div>
                    <span className="pu-time">{pu.remaining.toFixed(1)}s</span>
                  </div>
                );
              })}
            </div>
          )}

          {activePickup && (
            <div className="pickup-toast" key={activePickup.at}>
              <span style={{ marginRight: 8 }}>{POWERUP_META[activePickup.kind].icon}</span>
              {POWERUP_META[activePickup.kind].label} activated!
            </div>
          )}
        </>
      )}

      {status === "menu" && (
        <div className="overlay">
          <div className="overlay-card">
            <h1 className="title">Santa Dash <span className="title-3d">3D</span></h1>
            <p className="subtitle">Hop the rooftops, grab the mince pies and dodge the chimneys!</p>
            <div className="powerup-legend">
              <span><span className="leg-icon">🧲</span> Magnet</span>
              <span><span className="leg-icon">🛡️</span> Shield</span>
              <span><span className="leg-icon">✨</span> 2× Points</span>
            </div>
            <button className="btn-festive" onClick={(e) => { e.stopPropagation(); onStart(); }}>Start Run</button>
            <div className="controls-hint">
              <strong>Space</strong> / <strong>↑</strong> / <strong>tap</strong> to jump
              <div className="hint-secondary">Hold for a bigger jump · short tap for a hop</div>
            </div>
            {highScore > 0 && (
              <div className="best">Best: {highScore}</div>
            )}
          </div>
        </div>
      )}

      {status === "dead" && (
        <div className="overlay">
          <div className="overlay-card">
            <h1 className="title">Game Over</h1>
            <div className="score-final">Score: <span>{score}</span></div>
            <div className="score-final">Distance: <span>{Math.floor(distance)}m</span></div>
            {bestCombo > 1 && (
              <div className="score-final">Best Combo: <span>{bestCombo}×</span></div>
            )}
            {score >= highScore && score > 0 && (
              <div className="new-best">★ New Best! ★</div>
            )}
            {score < highScore && (
              <div className="best">Best: {highScore}</div>
            )}
            <button className="btn-festive" onClick={(e) => { e.stopPropagation(); onRestart(); }}>Run Again</button>
            <button
              className="btn-secondary"
              onClick={(e) => { e.stopPropagation(); store.setStatus("menu"); }}
            >
              Main Menu
            </button>
          </div>
        </div>
      )}
    </>
  );
}
