'use strict';

// ── Time signatures ──────────────────────────────────────────────────────────
//   accent: Set of beat indices that get the loud high-pitch click (downbeats)
//   mid:    Set of beat indices that get a medium click (compound-meter sub-beats)

const TIME_SIGNATURES = {
  '2/4': { beats: 2, accent: new Set([0]),       mid: new Set([])     },
  '3/4': { beats: 3, accent: new Set([0]),       mid: new Set([])     },
  '4/4': { beats: 4, accent: new Set([0]),       mid: new Set([])     },
  '5/4': { beats: 5, accent: new Set([0]),       mid: new Set([])     },
  '6/8': { beats: 6, accent: new Set([0]),       mid: new Set([3])    },
  '7/8': { beats: 7, accent: new Set([0]),       mid: new Set([4])    },
  '9/8': { beats: 9, accent: new Set([0]),       mid: new Set([3, 6]) },
};

// ── MetronomeEngine ──────────────────────────────────────────────────────────

const CLICK_OUTPUT_GAIN = 0.98;
// Play the existing short click sample faster for a brighter, higher-pitched tick.
const CLICK_PITCH_MULTIPLIER = 1.35;
const CLICK_SETTINGS = {
  accent: { duration: 0.026, gain: 0.98 },
  mid:    { duration: 0.023, gain: 0.86 },
  normal: { duration: 0.020, gain: 0.78 },
};

const CLICK_SAMPLE = [
  0.0000, 0.1493, 0.2793, 0.4498, 0.6002, 0.7663, 0.8825, 0.6538,
  0.6455, 0.8591, 0.9546, 1.0000, 0.9137, 0.7856, 0.6291, 0.3225,
  0.0096, -0.2258, -0.3943, -0.4819, -0.5408, -0.5657, -0.5490, -0.5420,
  -0.5435, -0.5380, -0.5116, -0.4435, -0.3429, -0.2157, -0.0647, 0.0880,
  0.2240, 0.3280, 0.3919, 0.4202, 0.4158, 0.3845, 0.3354, 0.2740,
  0.2044, 0.1283, 0.0465, -0.0370, -0.1175, -0.1890, -0.2445, -0.2783,
  -0.2863, -0.2678, -0.2257, -0.1656, -0.0946, -0.0207, 0.0489, 0.1082,
  0.1530, 0.1809, 0.1909, 0.1835, 0.1603, 0.1238, 0.0776, 0.0262,
  -0.0255, -0.0723, -0.1094, -0.1330, -0.1409, -0.1326, -0.1096, -0.0754,
  -0.0344, 0.0080, 0.0468, 0.0774, 0.0967, 0.1029, 0.0961, 0.0778,
  0.0510, 0.0195, -0.0126, -0.0411, -0.0625, -0.0743, -0.0753, -0.0660,
  -0.0481, -0.0243, 0.0015, 0.0257, 0.0446, 0.0559, 0.0580, 0.0511,
  0.0367, 0.0174, -0.0034, -0.0225, -0.0367, -0.0441, -0.0437, -0.0360,
  -0.0227, -0.0064, 0.0101, 0.0237, 0.0324, 0.0347, 0.0306, 0.0212,
  0.0085, -0.0051, -0.0168, -0.0246, -0.0273, -0.0244, -0.0170, -0.0066,
  0.0045, 0.0140, 0.0200, 0.0215, 0.0185, 0.0117, 0.0029, -0.0061,
  -0.0131, -0.0169, -0.0166, -0.0127, -0.0061, 0.0014, 0.0082, 0.0127,
  0.0139, 0.0117, 0.0069, 0.0007, -0.0053, -0.0096, -0.0112, -0.0100,
  -0.0062, -0.0012, 0.0039, 0.0077, 0.0092, 0.0081, 0.0050, 0.0007,
  -0.0035, -0.0065, -0.0075, -0.0064, -0.0035, 0.0002, 0.0036, 0.0057,
  0.0061, 0.0046, 0.0019, -0.0012, -0.0038, -0.0050, -0.0047, -0.0029,
  -0.0003, 0.0022, 0.0039, 0.0042, 0.0031, 0.0011, -0.0011, -0.0028,
  -0.0035, -0.0030, -0.0015, 0.0004, 0.0021, 0.0029, 0.0027, 0.0015,
  -0.0001, -0.0016, -0.0024, -0.0023, -0.0014, -0.0000, 0.0013, 0.0020,
];

class MetronomeEngine {
  constructor() {
    this.bpm = 120;
    this.sig = TIME_SIGNATURES['4/4'];
    this.isPlaying = false;

    this._ctx         = null;
    this._masterGain  = null;
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
      this._masterGain = this._ctx.createGain();
      this._masterGain.gain.value = CLICK_OUTPUT_GAIN;
      this._masterGain.connect(this._ctx.destination);

      this._accentBuf = this._makeClick(CLICK_SETTINGS.accent);
      this._midBuf    = this._makeClick(CLICK_SETTINGS.mid);
      this._clickBuf  = this._makeClick(CLICK_SETTINGS.normal);
    }
    if (this._ctx.state === 'suspended') {
      await this._ctx.resume();
    }
  }

  _makeClick({ duration, gain }) {
    const sr = this._ctx.sampleRate;
    const len = Math.floor(sr * duration);
    const buf = this._ctx.createBuffer(2, len, sr);
    const release = Math.max(1, Math.floor(sr * 0.004));

    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const pos = (i / (len - 1)) * (CLICK_SAMPLE.length - 1);
        const idx = Math.floor(pos);
        const frac = pos - idx;
        const a = CLICK_SAMPLE[idx] ?? 0;
        const b = CLICK_SAMPLE[idx + 1] ?? a;
        const releaseEnv = i > len - release ? Math.max(0, (len - i) / release) : 1;
        d[i] = gain * releaseEnv * (a + (b - a) * frac);
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
      src.playbackRate.value = CLICK_PITCH_MULTIPLIER;
      src.connect(this._masterGain);
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
