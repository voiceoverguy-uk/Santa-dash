import { useStore, store } from "./store";
import { isMuted, setMuted } from "./audio";
import { useState } from "react";

interface Props {
  onStart: () => void;
  onRestart: () => void;
}

export function HUD({ onStart, onRestart }: Props) {
  const status = useStore((s) => s.status);
  const score = useStore((s) => s.score);
  const lives = useStore((s) => s.lives);
  const highScore = useStore((s) => s.highScore);
  const distance = useStore((s) => s.distance);
  const hitFlash = useStore((s) => s.hitFlash);
  const [, force] = useState(0);

  const showFlash = hitFlash > 0 && performance.now() - hitFlash < 280;

  return (
    <>
      {showFlash && <div className="hit-flash" />}

      {(status === "ready" || status === "playing") && (
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
          <button
            className="mute-btn"
            onClick={() => { setMuted(!isMuted()); force((n) => n + 1); }}
            aria-label={isMuted() ? "Unmute" : "Mute"}
          >
            {isMuted() ? "🔇" : "🔊"}
          </button>
        </div>
      )}

      {status === "menu" && (
        <div className="overlay">
          <div className="overlay-card">
            <h1 className="title">Santa Dash <span className="title-3d">3D</span></h1>
            <p className="subtitle">Help Santa hop the rooftops, grab the gifts and dodge the chimneys!</p>
            <button className="btn-festive" onClick={onStart}>Start Run</button>
            <div className="controls-hint">
              <strong>Space</strong> / <strong>↑</strong> / <strong>tap</strong> to jump
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
            {score >= highScore && score > 0 && (
              <div className="new-best">★ New Best! ★</div>
            )}
            {score < highScore && (
              <div className="best">Best: {highScore}</div>
            )}
            <button className="btn-festive" onClick={onRestart}>Run Again</button>
            <button
              className="btn-secondary"
              onClick={() => store.setStatus("menu")}
            >
              Main Menu
            </button>
          </div>
        </div>
      )}
    </>
  );
}
