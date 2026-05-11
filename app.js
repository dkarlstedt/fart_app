'use strict';

const CX = 200;
const CY = 200;
const REST_RADIUS = 55;
const MAX_RADIUS = 135;
const NUM_PETALS = 12;
const INNER_R_MIN = 16;
const INNER_R_MAX = 38;

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

// ─── Geometry ─────────────────────────────────────────────────────────────────

// Rounded sector shape: narrow inner arc → two bowed sides → rounded outer arc.
// 12 of these form a continuous ring of flesh folds.
function buildRidgePath(cx, cy, dist, theta, innerR, N) {
  // Angular half-widths: inner is wider than outer (taper toward tip)
  const innerHalfAng = (Math.PI / N) * 0.75;
  const outerHalfAng = (Math.PI / N) * 0.58;

  const ia1 = theta - innerHalfAng;
  const ia2 = theta + innerHalfAng;
  const oa1 = theta - outerHalfAng;
  const oa2 = theta + outerHalfAng;

  const ix1 = cx + Math.cos(ia1) * innerR,  iy1 = cy + Math.sin(ia1) * innerR;
  const ix2 = cx + Math.cos(ia2) * innerR,  iy2 = cy + Math.sin(ia2) * innerR;
  const ox1 = cx + Math.cos(oa1) * dist,    oy1 = cy + Math.sin(oa1) * dist;
  const ox2 = cx + Math.cos(oa2) * dist,    oy2 = cy + Math.sin(oa2) * dist;

  // Q bezier control points bow the sides slightly outward for organic flare
  const midR = (innerR + dist) * 0.52;
  const mc1x = cx + Math.cos((ia1 + oa1) / 2 - 0.06) * midR;
  const mc1y = cy + Math.sin((ia1 + oa1) / 2 - 0.06) * midR;
  const mc2x = cx + Math.cos((ia2 + oa2) / 2 + 0.06) * midR;
  const mc2y = cy + Math.sin((ia2 + oa2) / 2 + 0.06) * midR;

  return [
    `M ${ix1} ${iy1}`,
    `A ${innerR} ${innerR} 0 0 1 ${ix2} ${iy2}`,   // inner arc CW
    `Q ${mc2x} ${mc2y} ${ox2} ${oy2}`,              // right side (bowed out)
    `A ${dist} ${dist} 0 0 0 ${ox1} ${oy1}`,        // outer arc CCW (rounded tip)
    `Q ${mc1x} ${mc1y} ${ix1} ${iy1}`,              // left side (bowed out)
    'Z',
  ].join(' ');
}

// Dark tapering valley between adjacent ridges — narrow at center, wider at edge.
function buildCreasePath(cx, cy, dist, theta, N) {
  const innerR = 8;
  const innerW = 1.8;
  const outerW = dist * 0.42 * (Math.PI / N); // matches the angular gap between ridges

  const px = -Math.sin(theta);
  const py =  Math.cos(theta);

  const ix = cx + Math.cos(theta) * innerR;
  const iy = cy + Math.sin(theta) * innerR;
  const ox = cx + Math.cos(theta) * dist;
  const oy = cy + Math.sin(theta) * dist;

  const midR = (innerR + dist) * 0.5;
  const midW = (innerW + outerW) * 0.5;
  const mx = cx + Math.cos(theta) * midR;
  const my = cy + Math.sin(theta) * midR;

  return [
    `M ${ix - px * innerW} ${iy - py * innerW}`,
    `Q ${mx - px * midW} ${my - py * midW} ${ox - px * outerW} ${oy - py * outerW}`,
    `A ${dist} ${dist} 0 0 1 ${ox + px * outerW} ${oy + py * outerW}`,
    `Q ${mx + px * midW} ${my + py * midW} ${ix + px * innerW} ${iy + py * innerW}`,
    'Z',
  ].join(' ');
}

function updateShape() {
  const segments = document.querySelectorAll('.segment');
  const creases  = document.querySelectorAll('.crease');
  const handles  = document.querySelectorAll('.handle');
  const opening  = document.getElementById('center-opening');
  const ring     = document.getElementById('inner-ring');

  const pulls = state.handles.map(h => {
    const d = Math.hypot(h.x - CX, h.y - CY);
    return Math.max(0, Math.min(1, (d - REST_RADIUS) / (MAX_RADIUS - REST_RADIUS)));
  });
  const avgPull = pulls.reduce((a, b) => a + b, 0) / NUM_PETALS;
  const innerR = INNER_R_MIN + avgPull * (INNER_R_MAX - INNER_R_MIN);

  state.handles.forEach((h, i) => {
    const dist = Math.hypot(h.x - CX, h.y - CY);

    segments[i].setAttribute('d', buildRidgePath(CX, CY, dist, h.theta, innerR, NUM_PETALS));
    handles[i].setAttribute('cx', h.x);
    handles[i].setAttribute('cy', h.y);

    // Crease sits at the midpoint angle between this ridge and the next
    const nextH = state.handles[(i + 1) % NUM_PETALS];
    const nextDist = Math.hypot(nextH.x - CX, nextH.y - CY);
    const avgDist = (dist + nextDist) / 2;
    const midTheta = h.theta + Math.PI / NUM_PETALS;
    creases[i].setAttribute('d', buildCreasePath(CX, CY, avgDist, midTheta, NUM_PETALS));
  });

  opening.setAttribute('r', innerR);
  ring.setAttribute('r', innerR);
}

// ─── Coordinate conversion ────────────────────────────────────────────────────

function clientToSVG(clientX, clientY) {
  const svg = document.getElementById('butthole');
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

// ─── Drag ─────────────────────────────────────────────────────────────────────

function startDrag(index) {
  state.drag = { index };
  document.querySelectorAll('.handle')[index].classList.add('dragging');
}

function moveDrag(clientX, clientY) {
  if (!state.drag) return;
  const { index } = state.drag;
  const svgPt = clientToSVG(clientX, clientY);
  const theta = state.handles[index].theta;

  const projection = (svgPt.x - CX) * Math.cos(theta) + (svgPt.y - CY) * Math.sin(theta);
  const dist = Math.max(REST_RADIUS, Math.min(MAX_RADIUS, projection));

  state.handles[index].x = CX + Math.cos(theta) * dist;
  state.handles[index].y = CY + Math.sin(theta) * dist;
  updateShape();
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
    filterFreq:   80 + tension * 220,
    filterQ:       1.0 + asymmetry * 4.0,
    lfoRate:      28 - avgPull * 16,
    lfoDepth:      0.4 + asymmetry * 0.5,
    masterVolume:  0.35 + avgPull * 0.55,
    duration:      0.3 + avgPull * 1.4,
    attackTime:    0.01 + (1 - maxPull) * 0.03,
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

function createWaveShaperCurve(amount = 80) {
  const n = 256;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = (Math.PI + amount) * x / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

// surfacePreset: future hook — e.g. { filterQ: 5, lfoRate: 8 } for "hot tub"
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

  const waveshaper = ctx.createWaveShaper();
  waveshaper.curve = createWaveShaperCurve(80);
  waveshaper.oversample = '2x';

  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = lfoRate + (Math.random() * 4 - 2);

  const lfoDepthGain = ctx.createGain();
  lfoDepthGain.gain.value = lfoDepth;

  const flutterGain = ctx.createGain();
  flutterGain.gain.value = 1 - lfoDepth * 0.8;

  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0, t0);
  envelope.gain.linearRampToValueAtTime(1.0, t0 + attackTime);
  envelope.gain.setValueAtTime(1.0, t0 + attackTime + 0.05);
  envelope.gain.exponentialRampToValueAtTime(0.001, t0 + duration);

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -8;
  compressor.knee.value = 6;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.001;
  compressor.release.value = 0.1;

  const master = ctx.createGain();
  master.gain.value = masterVolume;

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
    const ease = 1 - Math.pow(1 - t, 3);

    state.handles.forEach((h, i) => {
      const restX = CX + Math.cos(h.theta) * REST_RADIUS;
      const restY = CY + Math.sin(h.theta) * REST_RADIUS;
      h.x = startPositions[i].x + (restX - startPositions[i].x) * ease;
      h.y = startPositions[i].y + (restY - startPositions[i].y) * ease;
    });

    updateShape();

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
  updateShape();

  const svg = document.getElementById('butthole');

  svg.addEventListener('pointerdown', e => {
    const isHandle  = e.target.classList.contains('handle');
    const isSegment = e.target.classList.contains('segment');
    if (!isHandle && !isSegment) return;
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

  svg.addEventListener('pointerup',     () => endDrag());
  svg.addEventListener('pointercancel', () => endDrag());

  document.getElementById('play-btn').addEventListener('click', () => playFart());
}

document.addEventListener('DOMContentLoaded', init);
