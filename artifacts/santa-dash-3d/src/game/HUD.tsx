import { useStore, store } from "./store";
import { isSfxMuted, setSfxMuted, isMusicMuted, setMusicMuted } from "./audio";
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
      )}

      {status === "menu" && (
        <div className="overlay">
          <div className="overlay-card">
            <h1 className="title">Santa Dash</h1>
            <p className="subtitle">Hop the rooftops, grab the mince pies and dodge the chimneys!</p>
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
