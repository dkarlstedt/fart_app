'use strict';

const CX = 200;
const CY = 200;
const REST_RADIUS = 58;
const MAX_RADIUS = 138;
const NUM_PETALS = 12;
const INNER_R_MIN = 14;
const INNER_R_MAX = 40;
const DISC_RADIUS = 148;

const state = {
  handles: [],
  drag: null,
  isPlaying: false,
  audioCtx: null,
  resetTimer: null,
  ctx: null,
};

function initHandles() {
  state.handles = Array.from({ length: NUM_PETALS }, (_, i) => {
    let theta = (i / NUM_PETALS) * Math.PI * 2 - Math.PI / 2;
    if (theta > Math.PI) theta -= 2 * Math.PI;
    return {
      x: CX + Math.cos(theta) * REST_RADIUS,
      y: CY + Math.sin(theta) * REST_RADIUS,
      theta,
    };
  });
}

function drawCrease(ctx, theta, dist, innerR) {
  const startR = innerR;
  const innerW = 2.8;
  const outerW = Math.max(5.5, dist * 0.13);

  ctx.save();
  ctx.translate(CX, CY);
  ctx.rotate(theta);

  ctx.beginPath();
  ctx.moveTo(startR, -innerW);
  ctx.bezierCurveTo(dist * 0.45, -innerW * 1.1, dist * 0.82, -outerW, dist, -outerW);
  ctx.arc(dist, 0, outerW, -Math.PI / 2, Math.PI / 2);
  ctx.bezierCurveTo(dist * 0.82, outerW, dist * 0.45, innerW * 1.1, startR, innerW);
  ctx.closePath();

  const grad = ctx.createLinearGradient(startR, 0, dist, 0);
  grad.addColorStop(0,    'rgba(2,  0,  0, 0.97)');
  grad.addColorStop(0.28, 'rgba(8,  2,  1, 0.88)');
  grad.addColorStop(0.60, 'rgba(16, 5,  2, 0.62)');
  grad.addColorStop(1,    'rgba(26, 8,  4, 0.12)');

  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur  = 9;
  ctx.fillStyle   = grad;
  ctx.fill();
  ctx.restore();
}

function drawOpening(ctx, innerR) {
  const ambient = ctx.createRadialGradient(CX, CY, innerR * 0.15, CX, CY, innerR * 2.6);
  ambient.addColorStop(0,   'rgba(0,0,0,0.88)');
  ambient.addColorStop(0.4, 'rgba(0,0,0,0.58)');
  ambient.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.beginPath();
  ctx.arc(CX, CY, innerR * 2.6, 0, Math.PI * 2);
  ctx.fillStyle = ambient;
  ctx.fill();

  const hole = ctx.createRadialGradient(CX, CY, 0, CX, CY, innerR);
  hole.addColorStop(0,   '#010101');
  hole.addColorStop(0.6, '#0A0202');
  hole.addColorStop(1,   '#2D0806');
  ctx.beginPath();
  ctx.arc(CX, CY, innerR, 0, Math.PI * 2);
  ctx.fillStyle = hole;
  ctx.fill();
}

function render() {
  const ctx = state.ctx;
  ctx.clearRect(0, 0, 400, 400);

  const pulls = state.handles.map(h => {
    const d = Math.hypot(h.x - CX, h.y - CY);
    return Math.max(0, Math.min(1, (d - REST_RADIUS) / (MAX_RADIUS - REST_RADIUS)));
  });
  const avgPull = pulls.reduce((a, b) => a + b, 0) / NUM_PETALS;
  const innerR  = INNER_R_MIN + avgPull * (INNER_R_MAX - INNER_R_MIN);

  ctx.save();
  ctx.shadowColor   = 'rgba(0,0,0,0.95)';
  ctx.shadowBlur    = 38;
  ctx.shadowOffsetY = 7;
  ctx.beginPath();
  ctx.arc(CX, CY, DISC_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = '#1A0504';
  ctx.fill();
  ctx.restore();

  const skin = ctx.createRadialGradient(CX, CY, 2, CX, CY, DISC_RADIUS);
  skin.addColorStop(0,    '#2D0A06');
  skin.addColorStop(0.18, '#6B2516');
  skin.addColorStop(0.50, '#9B4535');
  skin.addColorStop(0.82, '#C06050');
  skin.addColorStop(1,    '#CC7868');
  ctx.beginPath();
  ctx.arc(CX, CY, DISC_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = skin;
  ctx.fill();

  const light = ctx.createRadialGradient(CX - 30, CY - 40, 0, CX, CY, DISC_RADIUS);
  light.addColorStop(0,    'rgba(255,210,170,0.10)');
  light.addColorStop(0.45, 'rgba(255,190,150,0.04)');
  light.addColorStop(1,    'rgba(0,0,0,0)');
  ctx.beginPath();
  ctx.arc(CX, CY, DISC_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = light;
  ctx.fill();

  state.handles.forEach((h, i) => {
    const thisDist = Math.hypot(h.x - CX, h.y - CY);
    const nextH    = state.handles[(i + 1) % NUM_PETALS];
    const nextDist = Math.hypot(nextH.x - CX, nextH.y - CY);
    const midTheta = h.theta + Math.PI / NUM_PETALS;
    drawCrease(ctx, midTheta, (thisDist + nextDist) / 2, innerR);
  });

  drawOpening(ctx, innerR);
}

function clientToCanvas(clientX, clientY) {
  const canvas = document.getElementById('butthole');
  const r = canvas.getBoundingClientRect();
  return {
    x: (clientX - r.left)  * (400 / r.width),
    y: (clientY - r.top)   * (400 / r.height),
  };
}

function nearestHandle(x, y) {
  const dx   = x - CX, dy = y - CY;
  const dist = Math.hypot(dx, dy);
  if (dist < INNER_R_MIN * 0.6 || dist > MAX_RADIUS + 22) return -1;

  const angle = Math.atan2(dy, dx);
  let best = 0, bestDiff = Infinity;
  state.handles.forEach((h, i) => {
    let d = Math.abs(angle - h.theta);
    if (d > Math.PI) d = 2 * Math.PI - d;
    if (d < bestDiff) { bestDiff = d; best = i; }
  });
  return best;
}

function startDrag(index) {
  state.drag = { index };
  document.getElementById('butthole').style.cursor = 'grabbing';
}

function moveDrag(clientX, clientY) {
  if (!state.drag) return;
  const { index } = state.drag;
  const pt    = clientToCanvas(clientX, clientY);
  const theta = state.handles[index].theta;

  const proj = (pt.x - CX) * Math.cos(theta) + (pt.y - CY) * Math.sin(theta);
  const dist = Math.max(REST_RADIUS, Math.min(MAX_RADIUS, proj));

  state.handles[index].x = CX + Math.cos(theta) * dist;
  state.handles[index].y = CY + Math.sin(theta) * dist;
  render();
}

function endDrag() {
  if (!state.drag) return;
  document.getElementById('butthole').style.cursor = 'grab';
  state.drag = null;
}

function computeShapeMetrics() {
  const pulls = state.handles.map(h => {
    const d = Math.hypot(h.x - CX, h.y - CY);
    return Math.max(0, Math.min(1, (d - REST_RADIUS) / (MAX_RADIUS - REST_RADIUS)));
  });
  const avgPull  = pulls.reduce((a, b) => a + b, 0) / NUM_PETALS;
  const maxPull  = Math.max(...pulls);
  const variance = pulls.reduce((s, d) => s + (d - avgPull) ** 2, 0) / NUM_PETALS;
  const asymmetry = Math.min(1, Math.sqrt(variance) * 3);
  return { avgPull, maxPull, asymmetry, tension: 1 - avgPull };
}

function computeAudioFromShape({ avgPull, maxPull, asymmetry, tension }) {
  return {
    filterFreq:  80  + tension   * 220,
    filterQ:      1.0 + asymmetry * 4.0,
    lfoRate:     28  - avgPull   * 16,
    lfoDepth:     0.4 + asymmetry * 0.5,
    masterVolume: 0.35 + avgPull  * 0.55,
    duration:     0.3  + avgPull  * 1.4,
    attackTime:   0.01 + (1 - maxPull) * 0.03,
  };
}

function createBrownNoise(audioCtx, durationSeconds) {
  const sampleRate = audioCtx.sampleRate;
  const frameCount = Math.ceil(sampleRate * (durationSeconds + 0.3));
  const buffer     = audioCtx.createBuffer(1, frameCount, sampleRate);
  const data       = buffer.getChannelData(0);
  let lastOut = 0;
  for (let i = 0; i < frameCount; i++) {
    const white = Math.random() * 2 - 1;
    lastOut  = (lastOut + 0.02 * white) / 1.02;
    data[i]  = lastOut * 3.5;
  }
  return buffer;
}

function createWaveShaperCurve(amount = 80) {
  const n     = 256;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x  = (i * 2) / n - 1;
    curve[i] = (Math.PI + amount) * x / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

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

  const noiseGain  = ctx.createGain();
  noiseGain.gain.value = 0.5;

  const buzzOsc  = ctx.createOscillator();
  buzzOsc.type   = 'sawtooth';
  buzzOsc.frequency.setValueAtTime(filterFreq * 0.65, t0);
  buzzOsc.frequency.exponentialRampToValueAtTime(Math.max(20, filterFreq * 0.45), t0 + duration);

  const buzzFilter = ctx.createBiquadFilter();
  buzzFilter.type  = 'bandpass';
  buzzFilter.frequency.setValueAtTime(filterFreq * 0.9, t0);
  buzzFilter.frequency.exponentialRampToValueAtTime(Math.max(20, filterFreq * 0.6), t0 + duration);
  buzzFilter.Q.value = filterQ * 0.7;

  const buzzGain = ctx.createGain();
  buzzGain.gain.value = 0.35;

  const waveshaper   = ctx.createWaveShaper();
  waveshaper.curve   = createWaveShaperCurve(80);
  waveshaper.oversample = '2x';

  const lfo = ctx.createOscillator();
  lfo.type  = 'sine';
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
  compressor.knee.value      = 6;
  compressor.ratio.value     = 4;
  compressor.attack.value    = 0.001;
  compressor.release.value   = 0.1;

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

  noiseSource.start(t0);  noiseSource.stop(t0 + duration + 0.15);
  buzzOsc.start(t0);      buzzOsc.stop(t0 + duration + 0.15);
  lfo.start(t0);          lfo.stop(t0 + duration + 0.15);

  noiseSource.onended = () => {
    state.isPlaying = false;
    updatePlayButton();
    resetAnimation();
  };
}

function resetAnimation() {
  if (state.resetTimer) clearInterval(state.resetTimer);
  const start = state.handles.map(h => ({ x: h.x, y: h.y }));
  const steps = 30, totalMs = 450;
  let step = 0;

  state.resetTimer = setInterval(() => {
    step++;
    const ease = 1 - Math.pow(1 - step / steps, 3);
    state.handles.forEach((h, i) => {
      const rx = CX + Math.cos(h.theta) * REST_RADIUS;
      const ry = CY + Math.sin(h.theta) * REST_RADIUS;
      h.x = start[i].x + (rx - start[i].x) * ease;
      h.y = start[i].y + (ry - start[i].y) * ease;
    });
    render();
    if (step >= steps) { clearInterval(state.resetTimer); state.resetTimer = null; }
  }, totalMs / steps);
}

function updatePlayButton() {
  document.getElementById('play-btn').classList.toggle('playing', state.isPlaying);
}

function init() {
  const canvas = document.getElementById('butthole');
  const dpr    = window.devicePixelRatio || 1;
  canvas.width  = 400 * dpr;
  canvas.height = 400 * dpr;
  state.ctx = canvas.getContext('2d');
  state.ctx.scale(dpr, dpr);

  initHandles();
  render();

  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    const pt    = clientToCanvas(e.clientX, e.clientY);
    const index = nearestHandle(pt.x, pt.y);
    if (index < 0) return;
    canvas.setPointerCapture(e.pointerId);
    startDrag(index);
  });

  canvas.addEventListener('pointermove', e => {
    if (!state.drag) return;
    e.preventDefault();
    moveDrag(e.clientX, e.clientY);
  });

  canvas.addEventListener('pointerup',     () => endDrag());
  canvas.addEventListener('pointercancel', () => endDrag());

  document.getElementById('play-btn').addEventListener('click', () => playFart());
}

document.addEventListener('DOMContentLoaded', init);
