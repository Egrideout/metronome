"use client";

import Script from "next/script";

export default function Home() {
  return (
    <main id="app">
      <div id="beat-row" aria-label="Beat indicator" />

      <section id="bpm-section" aria-label="Tempo controls">
        <div id="bpm-display">
          <div id="bpm-value" role="button" tabIndex={0} aria-label="BPM, tap to edit">120</div>
          <input id="bpm-input" type="number" min="20" max="300" inputMode="numeric" aria-label="Enter BPM" />
          <div id="bpm-label">BPM</div>
        </div>
        <input type="range" id="bpm-slider" min="20" max="300" defaultValue="120" step="1" aria-label="BPM" />
        <div id="controls-row">
          <button id="btn-minus" className="nudge-btn" aria-label="Decrease BPM">−</button>
          <button id="btn-tap" aria-label="Tap tempo">TAP<br />TEMPO</button>
          <button id="btn-plus" className="nudge-btn" aria-label="Increase BPM">+</button>
        </div>
      </section>

      <section id="time-sig-section">
        <div className="section-label">TIME SIGNATURE</div>
        <div id="time-sig-row" role="radiogroup" aria-label="Time signature" />
      </section>

      <button id="play-btn" aria-label="Play">
        <span id="play-icon">▶</span><span id="stop-icon" hidden>■</span>
      </button>

      <div id="presets-bar">
        <button id="btn-presets">☰ Presets</button><button id="btn-save">＋ Save</button>
      </div>

      <dialog id="presets-dialog" aria-label="Presets">
        <div id="dialog-header"><h2>Presets</h2><button id="dialog-done">Done</button></div>
        <div id="presets-list" />
        <p id="no-presets">No presets yet.<br />Tap Save on the main screen.</p>
      </dialog>
      <Script src="/app.js" strategy="afterInteractive" />
    </main>
  );
}
