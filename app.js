'use strict';

const CX = 200;
const CY = 200;
const REST_RADIUS = 52;
const MAX_RADIUS = 130;
const NUM_PETALS = 8;
const PETAL_HALF_WIDTH = 16;

const state = {
  handles: [],
  drag: null,
  isPlaying: false,
  audioCtx: null,
  resetTimer: null,
};

function initHandles() {
  state.handles = Array.from({ length: NUM_PETALS }, (_, i) => {
    const theta = (i / NUM_PETALS) * Math.PI * 2 - Math.PI / 2;
    return {
      x: CX + Math.cos(theta) * REST_RADIUS,
      y: CY + Math.sin(theta) * REST_RADIUS,
      theta,
    };
  });
}

// Leaf-shaped cubic bezier petal from center to tip and back
function buildPetalPath(cx, cy, tipX, tipY, halfWidth) {
  const dx = tipX - cx;
  const dy = tipY - cy;
  const len = Math.hypot(dx, dy);
  if (len < 1) return `M ${cx} ${cy} Z`;

  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;

  const flare = halfWidth * 1.7;
  const cp1x = cx + px * flare + ux * len * 0.25;
  const cp1y = cy + py * flare + uy * len * 0.25;
  const cp2x = tipX + px * halfWidth * 0.3;
  const cp2y = tipY + py * halfWidth * 0.3;
  const cp3x = tipX - px * halfWidth * 0.3;
  const cp3y = tipY - py * halfWidth * 0.3;
  const cp4x = cx - px * flare + ux * len * 0.25;
  const cp4y = cy - py * flare + uy * len * 0.25;

  return [
    `M ${cx} ${cy}`,
    `C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${tipX} ${tipY}`,
    `C ${cp3x} ${cp3y} ${cp4x} ${cp4y} ${cx} ${cy}`,
    'Z',
  ].join(' ');
}

function updateAllPetals() {
  const petals = document.querySelectorAll('.petal');
  const handles = document.querySelectorAll('.handle');
  const wrinkles = document.querySelectorAll('.wrinkle');

  state.handles.forEach((h, i) => {
    petals[i].setAttribute('d', buildPetalPath(CX, CY, h.x, h.y, PETAL_HALF_WIDTH));
    handles[i].setAttribute('cx', h.x);
    handles[i].setAttribute('cy', h.y);

    // Wrinkle line sits between this petal and the next one
    const midTheta = h.theta + Math.PI / NUM_PETALS;
    wrinkles[i].setAttribute('x1', CX + Math.cos(midTheta) * 15);
    wrinkles[i].setAttribute('y1', CY + Math.sin(midTheta) * 15);
    wrinkles[i].setAttribute('x2', CX + Math.cos(midTheta) * (REST_RADIUS * 0.88));
    wrinkles[i].setAttribute('y2', CY + Math.sin(midTheta) * (REST_RADIUS * 0.88));
  });
}

function clientToSVG(clientX, clientY) {
  const svg = document.getElementById('butthole');
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

function startDrag(index) {
  state.drag = { index };
  document.querySelectorAll('.handle')[index].classList.add('dragging');
}

function moveDrag(clientX, clientY) {
  if (!state.drag) return;
  const { index } = state.drag;
  const svgPt = clientToSVG(clientX, clientY);
  const theta = state.handles[index].theta;

  // Project cursor onto this handle's radial ray from center
  const projection = (svgPt.x - CX) * Math.cos(theta) + (svgPt.y - CY) * Math.sin(theta);
  const dist = Math.max(REST_RADIUS, Math.min(MAX_RADIUS, projection));

  state.handles[index].x = CX + Math.cos(theta) * dist;
  state.handles[index].y = CY + Math.sin(theta) * dist;
  updateAllPetals();
}

function endDrag() {
  if (!state.drag) return;
  document.querySelectorAll('.handle')[state.drag.index].classList.remove('dragging');
  state.drag = null;
}

// ─── Shape metrics ────────────────────────────────────────────────────────────

function computeShapeMetrics() {
  const pulls = state.handles.map(h => {
    const dist = Math.hypot(h.x - CX, h.y - CY);
    return Math.max(0, Math.min(1, (dist - REST_RADIUS) / (MAX_RADIUS - REST_RADIUS)));
  });

  const avgPull = pulls.reduce((a, b) => a + b, 0) / NUM_PETALS;
  const maxPull = Math.max(...pulls);
  const variance = pulls.reduce((s, d) => s + (d - avgPull) ** 2, 0) / NUM_PETALS;
  const asymmetry = Math.min(1, Math.sqrt(variance) * 3);
  const tension = 1 - avgPull;

  return { avgPull, maxPull, asymmetry, tension };
}

function computeAudioFromShape({ avgPull, maxPull, asymmetry, tension }) {
  return {
    filterFreq: 80 + tension * 220,        // tight=300Hz, loose=80Hz
    filterQ: 1.0 + asymmetry * 4.0,        // symmetric=narrow, asymmetric=wide resonance
    lfoRate: 28 - avgPull * 16,            // open=12Hz (slow flutter), tight=28Hz (fast flutter)
    lfoDepth: 0.4 + asymmetry * 0.5,       // asymmetric = wetter = deeper flutter
    masterVolume: 0.35 + avgPull * 0.55,   // 0.35–0.9
    duration: 0.3 + avgPull * 1.4,         // 0.3s–1.7s
    attackTime: 0.01 + (1 - maxPull) * 0.03,
  };
}

// ─── Audio engine ─────────────────────────────────────────────────────────────

function createBrownNoise(audioCtx, durationSeconds) {
  const sampleRate = audioCtx.sampleRate;
  const frameCount = Math.ceil(sampleRate * (durationSeconds + 0.3));
  const buffer = audioCtx.createBuffer(1, frameCount, sampleRate);
  const data = buffer.getChannelData(0);
  let lastOut = 0;
  for (let i = 0; i < frameCount; i++) {
    const white = Math.random() * 2 - 1;
    lastOut = (lastOut + 0.02 * white) / 1.02;
    data[i] = lastOut * 3.5;
  }
  return buffer;
}

// Tanh-style soft-clip curve for grit/saturation
function createWaveShaperCurve(amount = 80) {
  const n = 256;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = (Math.PI + amount) * x / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

// surfacePreset: future hook for reverb/surface modifiers (e.g. { filterQ: 5, lfoRate: 8 })
function playFart(surfacePreset = {}) {
  if (state.isPlaying) return;

  if (!state.audioCtx) {
    state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  const ctx = state.audioCtx;
  if (ctx.state === 'suspended') ctx.resume();

  const params = { ...computeAudioFromShape(computeShapeMetrics()), ...surfacePreset };

  state.isPlaying = true;
  updatePlayButton();

  const t0 = ctx.currentTime + 0.02;
  const { duration, attackTime, filterFreq, filterQ, lfoRate, lfoDepth, masterVolume } = params;

  // Brown noise source — turbulent air
  const noiseBuffer = createBrownNoise(ctx, duration);
  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = noiseBuffer;

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.setValueAtTime(filterFreq, t0);
  noiseFilter.frequency.exponentialRampToValueAtTime(Math.max(20, filterFreq * 0.65), t0 + duration);
  noiseFilter.Q.value = filterQ;

  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.5;

  // Sawtooth oscillator — sphincter buzz (like a lip trill)
  const buzzOsc = ctx.createOscillator();
  buzzOsc.type = 'sawtooth';
  buzzOsc.frequency.setValueAtTime(filterFreq * 0.65, t0);
  buzzOsc.frequency.exponentialRampToValueAtTime(Math.max(20, filterFreq * 0.45), t0 + duration);

  const buzzFilter = ctx.createBiquadFilter();
  buzzFilter.type = 'bandpass';
  buzzFilter.frequency.setValueAtTime(filterFreq * 0.9, t0);
  buzzFilter.frequency.exponentialRampToValueAtTime(Math.max(20, filterFreq * 0.6), t0 + duration);
  buzzFilter.Q.value = filterQ * 0.7;

  const buzzGain = ctx.createGain();
  buzzGain.gain.value = 0.35;

  // Soft-clip waveshaper — adds harmonic grit
  const waveshaper = ctx.createWaveShaper();
  waveshaper.curve = createWaveShaperCurve(80);
  waveshaper.oversample = '2x';

  // LFO for rapid amplitude flutter — creates "brrrt" texture
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = lfoRate + (Math.random() * 4 - 2); // slight randomness each fart

  const lfoDepthGain = ctx.createGain();
  lfoDepthGain.gain.value = lfoDepth;

  const flutterGain = ctx.createGain();
  flutterGain.gain.value = 1 - lfoDepth * 0.8; // DC offset so LFO sweeps from ~0 to 1

  // Amplitude envelope
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0, t0);
  envelope.gain.linearRampToValueAtTime(1.0, t0 + attackTime);
  envelope.gain.setValueAtTime(1.0, t0 + attackTime + 0.05);
  envelope.gain.exponentialRampToValueAtTime(0.001, t0 + duration);

  // Compressor — transparent limiting to prevent clipping
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -8;
  compressor.knee.value = 6;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.001;
  compressor.release.value = 0.1;

  const master = ctx.createGain();
  master.gain.value = masterVolume;

  // Signal graph
  noiseSource.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(waveshaper);

  buzzOsc.connect(buzzFilter);
  buzzFilter.connect(buzzGain);
  buzzGain.connect(waveshaper);

  waveshaper.connect(flutterGain);
  lfo.connect(lfoDepthGain);
  lfoDepthGain.connect(flutterGain.gain);

  flutterGain.connect(envelope);
  envelope.connect(master);
  master.connect(compressor);
  compressor.connect(ctx.destination);

  noiseSource.start(t0);
  noiseSource.stop(t0 + duration + 0.15);
  buzzOsc.start(t0);
  buzzOsc.stop(t0 + duration + 0.15);
  lfo.start(t0);
  lfo.stop(t0 + duration + 0.15);

  noiseSource.onended = () => {
    state.isPlaying = false;
    updatePlayButton();
    resetAnimation();
  };
}

// ─── Reset animation ──────────────────────────────────────────────────────────

function resetAnimation() {
  if (state.resetTimer) clearInterval(state.resetTimer);

  const startPositions = state.handles.map(h => ({ x: h.x, y: h.y }));
  const steps = 30;
  const totalMs = 450;
  let step = 0;

  state.resetTimer = setInterval(() => {
    step++;
    const t = step / steps;
    const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic

    state.handles.forEach((h, i) => {
      const restX = CX + Math.cos(h.theta) * REST_RADIUS;
      const restY = CY + Math.sin(h.theta) * REST_RADIUS;
      h.x = startPositions[i].x + (restX - startPositions[i].x) * ease;
      h.y = startPositions[i].y + (restY - startPositions[i].y) * ease;
    });

    updateAllPetals();

    if (step >= steps) {
      clearInterval(state.resetTimer);
      state.resetTimer = null;
    }
  }, totalMs / steps);
}

function updatePlayButton() {
  document.getElementById('play-btn').classList.toggle('playing', state.isPlaying);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function init() {
  initHandles();
  updateAllPetals();

  const svg = document.getElementById('butthole');

  // Pointerdown on handle or petal — both trigger drag
  svg.addEventListener('pointerdown', e => {
    const isHandle = e.target.classList.contains('handle');
    const isPetal = e.target.classList.contains('petal');
    if (!isHandle && !isPetal) return;
    e.preventDefault();
    const index = parseInt(e.target.dataset.index, 10);
    e.target.setPointerCapture(e.pointerId);
    startDrag(index);
  });

  svg.addEventListener('pointermove', e => {
    if (!state.drag) return;
    e.preventDefault();
    moveDrag(e.clientX, e.clientY);
  });

  svg.addEventListener('pointerup', () => endDrag());
  svg.addEventListener('pointercancel', () => endDrag());

  document.getElementById('play-btn').addEventListener('click', () => playFart());
}

document.addEventListener('DOMContentLoaded', init);
