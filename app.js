'use strict';

// ── Time signatures ──────────────────────────────────────────────────────────
//   accent: Set of beat indices that get the loud high-pitch click (downbeats)
//   mid:    Set of beat indices that get a medium click (compound-meter sub-beats)

const TIME_SIGNATURES = {
  '2/4': { beats: 2, accent: new Set([0]),       mid: new Set([])     },
  '3/4': { beats: 3, accent: new Set([0]),       mid: new Set([])     },
  '4/4': { beats: 4, accent: new Set([0]),       mid: new Set([2])    },
  '5/4': { beats: 5, accent: new Set([0]),       mid: new Set([])     },
  '6/8': { beats: 6, accent: new Set([0]),       mid: new Set([3])    },
  '7/8': { beats: 7, accent: new Set([0]),       mid: new Set([4])    },
  '9/8': { beats: 9, accent: new Set([0]),       mid: new Set([3, 6]) },
};

// ── MetronomeEngine ──────────────────────────────────────────────────────────

class MetronomeEngine {
  constructor() {
    this.bpm = 120;
    this.sig = TIME_SIGNATURES['4/4'];
    this.isPlaying = false;

    this._ctx         = null;
    this._accentBuf   = null;
    this._midBuf      = null;
    this._clickBuf    = null;

    this._nextBeatTime = 0;
    this._nextBeatIdx  = 0;
    this._queue        = [];   // {beat, time} scheduled ahead for visual sync
    this._schedHandle  = null;
    this._rafHandle    = null;

    this.onBeat = null;  // callback(beatIndex: int)

    this._scheduler = this._scheduler.bind(this);
    this._drawLoop  = this._drawLoop.bind(this);
  }

  // Call from a user-gesture handler the first time, and on visibility restore.
  async initAudio() {
    if (!this._ctx) {
      this._ctx = new AudioContext();
      this._accentBuf = this._makeClick(1400, 0.06, 0.90, 35);
      this._midBuf    = this._makeClick(1000, 0.05, 0.70, 40);
      this._clickBuf  = this._makeClick(750,  0.05, 0.55, 45);
    }
    if (this._ctx.state === 'suspended') {
      await this._ctx.resume();
    }
  }

  _makeClick(freq, duration, amplitude, decayRate) {
    const sr = this._ctx.sampleRate;
    const len = Math.floor(sr * duration);
    const buf = this._ctx.createBuffer(2, len, sr);
    const attack = Math.max(1, Math.floor(sr * 0.001)); // 1 ms ramp to avoid DC click

    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t   = i / sr;
        const env = (i < attack ? i / attack : 1) * Math.exp(-t * decayRate);
        d[i] = amplitude * env * Math.sin(2 * Math.PI * freq * t);
      }
    }
    return buf;
  }

  async start() {
    if (this.isPlaying) return;
    await this.initAudio();

    this._nextBeatIdx  = 0;
    this._queue        = [];
    this._nextBeatTime = this._ctx.currentTime + 0.05; // tiny startup gap
    this.isPlaying     = true;

    this._scheduler();
    this._rafHandle = requestAnimationFrame(this._drawLoop);
  }

  stop() {
    this.isPlaying = false;
    clearTimeout(this._schedHandle);
    cancelAnimationFrame(this._rafHandle);
    this._schedHandle = null;
    this._rafHandle   = null;
    this._queue       = [];
    this.onBeat?.(-1);
  }

  async toggle() {
    this.isPlaying ? this.stop() : await this.start();
  }

  setBpm(v) {
    this.bpm = Math.min(300, Math.max(20, Math.round(v)));
  }

  setSignature(key) {
    this.sig = TIME_SIGNATURES[key];
    if (this.isPlaying) this._nextBeatIdx = 0; // reset to avoid out-of-range beat
  }

  // ── Lookahead scheduler (Chris Wilson pattern) ────────────────────────────
  // Fires every 25 ms, pre-schedules all beats within the next 120 ms.
  // AudioContext.currentTime is the authoritative clock — zero drift.

  _scheduler() {
    const LOOKAHEAD = 0.12; // seconds to schedule ahead
    const ctx = this._ctx;

    while (this._nextBeatTime < ctx.currentTime + LOOKAHEAD) {
      const beat = this._nextBeatIdx % this.sig.beats;
      const buf  = this._bufFor(beat);

      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(this._nextBeatTime);

      this._queue.push({ beat, time: this._nextBeatTime });

      this._nextBeatTime += 60 / this.bpm;
      this._nextBeatIdx++;
    }

    this._schedHandle = setTimeout(this._scheduler, 25);
  }

  _bufFor(beat) {
    if (this.sig.accent.has(beat)) return this._accentBuf;
    if (this.sig.mid.has(beat))    return this._midBuf;
    return this._clickBuf;
  }

  // ── Visual sync via requestAnimationFrame ─────────────────────────────────
  // Dequeues beats whose scheduled time has passed — fires onBeat callback
  // at ~60 fps resolution, tightly coupled to actual audio output time.

  _drawLoop() {
    if (!this.isPlaying) return;
    const now = this._ctx.currentTime;

    while (this._queue.length && this._queue[0].time <= now) {
      this.onBeat?.(this._queue.shift().beat);
    }
    this._rafHandle = requestAnimationFrame(this._drawLoop);
  }
}

// ── PresetStore ──────────────────────────────────────────────────────────────

class PresetStore {
  constructor() {
    this.presets = this._load();
    if (this.presets.length === 0) {
      this.presets = [
        { id: uid(), name: 'Slow Practice', bpm: 60,  sig: '4/4' },
        { id: uid(), name: 'Waltz',         bpm: 120, sig: '3/4' },
        { id: uid(), name: 'Allegro',       bpm: 160, sig: '4/4' },
      ];
      this._save();
    }
  }

  add(name, bpm, sig) {
    const p = { id: uid(), name, bpm, sig };
    this.presets.push(p);
    this._save();
    return p;
  }

  remove(id) {
    this.presets = this.presets.filter(p => p.id !== id);
    this._save();
  }

  _load() {
    try { return JSON.parse(localStorage.getItem('metronome.v1') || '[]'); }
    catch { return []; }
  }

  _save() {
    localStorage.setItem('metronome.v1', JSON.stringify(this.presets));
  }
}

function uid() {
  return (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2));
}

// ── Wake Lock ────────────────────────────────────────────────────────────────

let _wakeLock = null;

async function acquireWakeLock() {
  if (!navigator.wakeLock) return;
  try {
    _wakeLock = await navigator.wakeLock.request('screen');
    _wakeLock.addEventListener('release', () => { _wakeLock = null; });
  } catch { /* denied or unavailable */ }
}

async function releaseWakeLock() {
  await _wakeLock?.release();
  _wakeLock = null;
}

// Re-acquire after the browser restores focus (iOS releases it on tab switch)
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && engine.isPlaying) {
    await engine.initAudio();
    await acquireWakeLock();
  }
});

// ── Globals ──────────────────────────────────────────────────────────────────

const engine  = new MetronomeEngine();
const store   = new PresetStore();
let currentSig = '4/4';
let tapTimes   = [];

// ── DOM refs ─────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const beatRow       = $('beat-row');
const bpmSection    = $('bpm-section');
const bpmValueEl    = $('bpm-value');
const bpmInputEl    = $('bpm-input');
const bpmSlider     = $('bpm-slider');
const playBtn       = $('play-btn');
const playIcon      = $('play-icon');
const stopIcon      = $('stop-icon');
const presetsDialog = $('presets-dialog');
const presetsList   = $('presets-list');
const noPresets     = $('no-presets');
const timeSigRow    = $('time-sig-row');

// ── Init ─────────────────────────────────────────────────────────────────────

function init() {
  buildBeatDots();
  buildSigChips();
  syncSlider();

  // Play / Stop
  playBtn.addEventListener('click', async () => {
    await engine.toggle();
    if (engine.isPlaying) {
      await acquireWakeLock();
    } else {
      await releaseWakeLock();
    }
    renderPlayState();
  });

  // Beat callback → update dots
  engine.onBeat = beat => {
    updateBeatDots(beat);
    // Subtle pulse on play button
    playBtn.style.transform = 'scale(0.94)';
    setTimeout(() => { playBtn.style.transform = ''; }, 80);
  };

  // Slider
  bpmSlider.addEventListener('input', () => {
    engine.setBpm(Number(bpmSlider.value));
    bpmValueEl.textContent = engine.bpm;
    syncSlider();
  });

  // BPM tap-to-edit
  bpmValueEl.addEventListener('click', startBpmEdit);
  bpmValueEl.addEventListener('keydown', e => { if (e.key === 'Enter') startBpmEdit(); });
  bpmInputEl.addEventListener('blur', commitBpmEdit);
  bpmInputEl.addEventListener('keydown', e => { if (e.key === 'Enter') bpmInputEl.blur(); });

  // Nudge buttons with long-press
  setupHold($('btn-minus'), () => nudge(-1));
  setupHold($('btn-plus'),  () => nudge(+1));

  // Tap tempo
  $('btn-tap').addEventListener('click', handleTap);

  // Presets
  $('btn-presets').addEventListener('click', openPresets);
  $('btn-save').addEventListener('click', savePreset);
  $('dialog-done').addEventListener('click', () => presetsDialog.close());
  // Close on backdrop tap
  presetsDialog.addEventListener('click', e => {
    if (e.target === presetsDialog) presetsDialog.close();
  });

  // Service worker (offline support)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// ── Beat dots ────────────────────────────────────────────────────────────────

function buildBeatDots() {
  const sig   = TIME_SIGNATURES[currentSig];
  const small = sig.beats > 6;
  beatRow.innerHTML = '';

  for (let i = 0; i < sig.beats; i++) {
    const dot = document.createElement('div');
    const cls = ['beat-dot'];
    if (small)               cls.push('small');
    if (sig.accent.has(i))   cls.push('accent-dim');
    else if (sig.mid.has(i)) cls.push('mid-dim');
    dot.className = cls.join(' ');
    dot.dataset.i = i;
    beatRow.appendChild(dot);
  }
}

function updateBeatDots(beat) {
  beatRow.querySelectorAll('.beat-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === beat);
  });
}

// ── Time sig chips ────────────────────────────────────────────────────────────

function buildSigChips() {
  timeSigRow.innerHTML = '';
  Object.keys(TIME_SIGNATURES).forEach(key => {
    const btn = document.createElement('button');
    btn.className = 'sig-chip' + (key === currentSig ? ' selected' : '');
    btn.textContent = key;
    btn.addEventListener('click', () => selectSig(key));
    timeSigRow.appendChild(btn);
  });
}

function selectSig(key) {
  currentSig = key;
  engine.setSignature(key);
  timeSigRow.querySelectorAll('.sig-chip').forEach(btn => {
    btn.classList.toggle('selected', btn.textContent === key);
  });
  buildBeatDots();
}

// ── BPM helpers ───────────────────────────────────────────────────────────────

function nudge(step) {
  engine.setBpm(engine.bpm + step);
  bpmValueEl.textContent = engine.bpm;
  bpmSlider.value = engine.bpm;
  syncSlider();
}

function syncSlider() {
  const pct = ((engine.bpm - 20) / 280 * 100).toFixed(1) + '%';
  bpmSlider.style.setProperty('--fill', pct);
  bpmSlider.value = engine.bpm;
}

function startBpmEdit() {
  bpmInputEl.value = engine.bpm;
  bpmSection.classList.add('editing');
  bpmInputEl.focus();
  bpmInputEl.select();
}

function commitBpmEdit() {
  const v = parseInt(bpmInputEl.value, 10);
  if (!isNaN(v)) {
    engine.setBpm(v);
    bpmSlider.value = engine.bpm;
    syncSlider();
  }
  bpmValueEl.textContent = engine.bpm;
  bpmSection.classList.remove('editing');
}

// ── Tap tempo ─────────────────────────────────────────────────────────────────

function handleTap() {
  const now = Date.now();
  tapTimes.push(now);
  tapTimes = tapTimes.filter(t => now - t < 3000); // drop taps older than 3 s

  if (tapTimes.length >= 2) {
    let total = 0;
    for (let i = 1; i < tapTimes.length; i++) total += tapTimes[i] - tapTimes[i - 1];
    const avgMs = total / (tapTimes.length - 1);
    engine.setBpm(Math.round(60000 / avgMs));
    bpmValueEl.textContent = engine.bpm;
    bpmSlider.value = engine.bpm;
    syncSlider();
  }
}

// ── Long-press button ─────────────────────────────────────────────────────────

function setupHold(el, action) {
  let initial = null, repeat = null;

  function press(e) {
    e.preventDefault();
    action();
    initial = setTimeout(() => {
      repeat = setInterval(action, 80);
    }, 380);
  }

  function release() {
    clearTimeout(initial);
    clearInterval(repeat);
    initial = repeat = null;
  }

  el.addEventListener('pointerdown', press);
  el.addEventListener('pointerup',     release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('pointerleave',  release);
}

// ── Play state ────────────────────────────────────────────────────────────────

function renderPlayState() {
  const on = engine.isPlaying;
  playBtn.classList.toggle('playing', on);
  playIcon.hidden = on;
  stopIcon.hidden = !on;
  if (!on) updateBeatDots(-1);
}

// ── Presets ───────────────────────────────────────────────────────────────────

function openPresets() {
  renderPresets();
  presetsDialog.showModal();
}

function savePreset() {
  const name = prompt('Name this preset:', 'My Preset');
  if (!name?.trim()) return;
  store.add(name.trim(), engine.bpm, currentSig);
}

function renderPresets() {
  presetsList.innerHTML = '';
  const hasAny = store.presets.length > 0;
  noPresets.style.display = hasAny ? 'none' : '';

  store.presets.forEach(p => {
    const row = document.createElement('div');
    row.className = 'preset-row';

    const info = document.createElement('div');
    info.className = 'preset-info';
    info.innerHTML =
      `<div class="preset-name">${esc(p.name)}</div>` +
      `<div class="preset-meta">${Math.round(p.bpm)} BPM · ${esc(p.sig)}</div>`;
    info.addEventListener('click', () => loadPreset(p));

    const del = document.createElement('button');
    del.className = 'preset-del';
    del.textContent = '✕';
    del.addEventListener('click', e => {
      e.stopPropagation();
      if (confirm(`Delete "${p.name}"?`)) {
        store.remove(p.id);
        renderPresets();
      }
    });

    row.appendChild(info);
    row.appendChild(del);
    presetsList.appendChild(row);
  });
}

function loadPreset(p) {
  engine.setBpm(p.bpm);
  selectSig(p.sig);
  bpmValueEl.textContent = engine.bpm;
  syncSlider();
  presetsDialog.close();
}

function esc(str) {
  return String(str).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// ── Go ────────────────────────────────────────────────────────────────────────
init();
