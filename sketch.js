// ============================================================
// LUMI — Algorithmic Agent
// AY26 Assignment 2: Algorithmic Agent
// NUS ID2109/ID3109 Design Platforms C
// ============================================================

// ── Agent Properties ────────────────────────────────────────
let energy = 50;       // 0-100: affects glow, pulse speed
let alertness = 0;     // 0-100: affects size, tentacle extension
let mood = 'calm';     // calm | curious | excited | startled

// ── State Machine ───────────────────────────────────────────
// States: dormant → aware → curious → excited → startled → dormant
// Reactive overrides: angry (camera covered), dizzy (shake), scared (loud mic)
const STATES = ['dormant', 'aware', 'curious', 'excited', 'startled', 'angry', 'dizzy', 'scared'];
let state = 'dormant';
let stateTimer = 0;

// ── Visual properties ────────────────────────────────────────
let pulsePhase = 0;
let tentacles = [];
const NUM_TENTACLES = 8;
let bodyRadius = 80;
let targetRadius = 80;

// ── Sensor state ─────────────────────────────────────────────
let micLevel = 0;
let tiltX = 0, tiltY = 0;    // from deviceorientation
let isTouching = false;
let touchX = 0, touchY = 0;
let micStream = null;
let analyser = null;
let micActive = false;

// Camera cover detection (brightness sampling)
let camVideo = null;
let camSampleCanvas = null;
let camSampleCtx = null;
let camBrightness = 1;       // 0 dark → 1 bright
let camVariance = 1;
let camCovered = false;
let camCoverFrames = 0;
let camActive = false;

// Shake detection (devicemotion)
let shakeIntensity = 0;
let lastAccel = { x: 0, y: 0, z: 0 };
let motionActive = false;
let dizzySpin = 0;

// Particle system
let particles = [];

// Scared (loud mic) debounce
let loudFrames = 0;

// Mouse-shake fallback history (desktop)
let mouseHistory = [];

// ── Color palettes per mood ──────────────────────────────────
const PALETTES = {
  calm:     { h: 180, s: 80, b: 90 },
  curious:  { h: 200, s: 70, b: 95 },
  excited:  { h: 160, s: 90, b: 100 },
  startled: { h: 280, s: 85, b: 100 },
  angry:    { h: 0,   s: 95, b: 100 },
  dizzy:    { h: 50,  s: 95, b: 100 },
  scared:   { h: 25,  s: 95, b: 100 },
};

// ── p5 lifecycle ─────────────────────────────────────────────
function setup() {
  const cnv = createCanvas(windowWidth, windowHeight - 110);
  cnv.style('position', 'fixed');
  cnv.style('top', '0');
  cnv.style('left', '0');
  colorMode(HSB, 360, 100, 100, 100);
  noStroke();

  for (let i = 0; i < NUM_TENTACLES; i++) {
    tentacles.push({
      angle: (TWO_PI / NUM_TENTACLES) * i,
      length: 0,
      targetLength: 0,
      wave: random(TWO_PI),
      speed: random(0.02, 0.05),
    });
  }

  noLoop(); // started once user awakens LUMI
}

function draw() {
  clear();
  if (state === 'angry') background(0, 70, 8, 95);
  else if (state === 'dizzy') background(45, 40, 8, 95);
  else if (state === 'scared') background(20, 55, 8, 95);
  else background(220, 40, 5, 95);

  let cx = width / 2;
  let cy = height / 2;

  updateAgent();

  // Wobble when dizzy, jitter when angry, tremble when scared
  if (state === 'dizzy') {
    cx += sin(dizzySpin * 1.1) * 18;
    cy += cos(dizzySpin * 0.9) * 14;
  } else if (state === 'angry') {
    cx += random(-2.5, 2.5);
    cy += random(-2.5, 2.5);
  } else if (state === 'scared') {
    cx += random(-1.5, 1.5);
    cy += random(-1.5, 1.5);
  }

  drawAura(cx, cy);
  drawTentacles(cx, cy);
  drawBody(cx, cy);
  drawFace(cx, cy);
  drawParticles();
  updateUI();

  stateTimer++;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight - 110);
}

// ── Input ────────────────────────────────────────────────────
function touchStarted() {
  isTouching = true;
  touchX = mouseX;
  touchY = mouseY;
  handleTouch();
  return false;
}
function touchEnded() { isTouching = false; return false; }
function mousePressed() {
  isTouching = true;
  touchX = mouseX;
  touchY = mouseY;
  handleTouch();
  return false;
}
function mouseReleased() { isTouching = false; return false; }

// ── Agent logic ──────────────────────────────────────────────
function updateAgent() {
  pulsePhase += 0.04;

  // Mic RMS on time-domain
  if (analyser) {
    const buf = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(buf);
    let sumSq = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / buf.length);
    const level = Math.min(rms * 3.5, 1);
    const alpha = level > micLevel ? 0.5 : 0.15;
    micLevel = lerp(micLevel, level, alpha);
  } else {
    micLevel = lerp(micLevel, 0, 0.1);
  }

  sampleCamera();

  shakeIntensity = lerp(shakeIntensity, 0, 0.05);

  if (state === 'dizzy') dizzySpin += 0.15;
  else dizzySpin *= 0.92;

  energy = constrain(energy - 0.03 + micLevel * 0.5, 0, 100);

  const tiltMag = Math.sqrt(tiltX * tiltX + tiltY * tiltY);
  const targetAlert = constrain(
    tiltMag * 1.5 + (isTouching ? 30 : 0) + micLevel * 60,
    0, 100
  );
  alertness = lerp(alertness, targetAlert, 0.08);

  if (state === 'scared') {
    targetRadius = 55 + sin(pulsePhase * 3) * 4;
  } else {
    targetRadius = map(alertness, 0, 100, 70, 110) + sin(pulsePhase * map(energy, 0, 100, 0.5, 2)) * 8;
  }
  bodyRadius = lerp(bodyRadius, targetRadius, 0.1);

  for (let t of tentacles) {
    if (state === 'scared') {
      t.targetLength = 15 + random(-3, 3);
    } else {
      t.targetLength = map(alertness, 0, 100, 20, 120) + random(-5, 5);
    }
    t.length = lerp(t.length, t.targetLength, 0.06);
    t.wave += t.speed;
  }

  updateState();

  if (state === 'excited' || state === 'startled') {
    if (Math.random() < 0.3) spawnParticle();
  }

  particles = particles.filter(pt => pt.life > 0);
  for (let pt of particles) {
    pt.x += pt.vx;
    pt.y += pt.vy;
    pt.vy += 0.05;
    pt.life -= 2;
  }
}

function updateState() {
  const prevState = state;

  if (micLevel > 0.35) loudFrames = Math.min(loudFrames + 3, 30);
  else loudFrames = Math.max(loudFrames - 1, 0);
  const isLoud = loudFrames > 3;

  // Priority: dizzy (shake) > scared (loud mic) > angry (camera cover)
  if (shakeIntensity > 18 && state !== 'dizzy') {
    transitionTo('dizzy');
  } else if (isLoud && state !== 'dizzy' && state !== 'scared') {
    transitionTo('scared');
  } else if (camCovered && state !== 'dizzy' && state !== 'scared' && state !== 'angry') {
    transitionTo('angry');
  }

  if (state === 'dizzy') {
    mood = 'dizzy';
    if (stateTimer > 90 && shakeIntensity < 4) transitionTo('aware');
  } else if (state === 'scared') {
    mood = 'scared';
    if (!isLoud && stateTimer > 45 && micLevel < 0.2) transitionTo('aware');
  } else if (state === 'angry') {
    mood = 'angry';
    if (!camCovered && stateTimer > 60) transitionTo('aware');
  } else if (state === 'dormant') {
    mood = 'calm';
    if (alertness > 15 || micLevel > 0.1) transitionTo('aware');
  } else if (state === 'aware') {
    mood = 'calm';
    if (alertness > 40 || micLevel > 0.2) transitionTo('curious');
    if (stateTimer > 180 && alertness < 10) transitionTo('dormant');
  } else if (state === 'curious') {
    mood = 'curious';
    if (alertness > 70 || micLevel > 0.4) transitionTo('excited');
    if (isTouching) transitionTo('excited');
    if (stateTimer > 300 && alertness < 20) transitionTo('aware');
  } else if (state === 'excited') {
    mood = 'excited';
    if (micLevel > 0.7 || alertness > 90) transitionTo('startled');
    if (stateTimer > 240 && alertness < 40) transitionTo('curious');
  } else if (state === 'startled') {
    mood = 'startled';
    if (stateTimer > 120) transitionTo('curious');
  }

  if (state !== prevState) document.getElementById('state-label').textContent = state;
}

function transitionTo(newState) {
  state = newState;
  stateTimer = 0;
}

// ── Drawing ──────────────────────────────────────────────────
function drawAura(cx, cy) {
  const pal = PALETTES[mood];
  const glowRadius = bodyRadius * map(energy, 0, 100, 1.5, 3.0);
  const alpha = map(energy, 0, 100, 10, 35);

  for (let r = glowRadius; r > 0; r -= glowRadius * 0.1) {
    const a = map(r, 0, glowRadius, alpha, 0);
    fill(pal.h, pal.s, pal.b, a);
    ellipse(cx, cy, r * 2, r * 2);
  }
}

function drawTentacles(cx, cy) {
  const pal = PALETTES[mood];
  for (let t of tentacles) {
    const waveOff = sin(t.wave) * 20;
    const baseX = cx + cos(t.angle) * bodyRadius * 0.8;
    const baseY = cy + sin(t.angle) * bodyRadius * 0.8;
    const endX = cx + cos(t.angle + 0.3) * (bodyRadius + t.length) + waveOff;
    const endY = cy + sin(t.angle + 0.3) * (bodyRadius + t.length);

    stroke(pal.h, pal.s - 10, pal.b, 60);
    strokeWeight(2.5);
    noFill();

    beginShape();
    curveVertex(baseX, baseY);
    curveVertex(baseX, baseY);
    const mx = (baseX + endX) / 2 + sin(t.wave * 1.5) * 30;
    const my = (baseY + endY) / 2 + cos(t.wave * 1.3) * 20;
    curveVertex(mx, my);
    curveVertex(endX, endY);
    curveVertex(endX, endY);
    endShape();
    noStroke();
  }
}

function drawBody(cx, cy) {
  const pal = PALETTES[mood];
  const r = bodyRadius;

  fill(pal.h, pal.s - 20, pal.b - 20, 70);
  ellipse(cx, cy, r * 2.2, r * 2);

  const energyGlow = map(energy, 0, 100, 40, 85);
  fill(pal.h, pal.s, energyGlow, 90);
  ellipse(cx, cy, r * 1.8, r * 1.6);

  fill(pal.h + 20, pal.s - 30, 100, 60);
  ellipse(cx, cy, r * 0.9, r * 0.8);

  const pulseSz = r * (1.9 + sin(pulsePhase * 2) * 0.1);
  stroke(pal.h, 60, 100, 20);
  strokeWeight(1.5);
  noFill();
  ellipse(cx, cy, pulseSz * 2, pulseSz * 1.8);
  noStroke();
}

function drawFace(cx, cy) {
  const pal = PALETTES[mood];
  const eyeSpread = map(alertness, 0, 100, 14, 22);
  let eyeSize = map(energy, 0, 100, 4, 9);
  if (state === 'scared') eyeSize *= 1.5;

  fill(pal.h, 20, 100, 90);
  ellipse(cx - eyeSpread, cy - 8, eyeSize * 2, eyeSize * 2.5);
  ellipse(cx + eyeSpread, cy - 8, eyeSize * 2, eyeSize * 2.5);

  const pupilOff = 3;
  const tiltOffX = constrain(tiltX * 0.05, -pupilOff, pupilOff);
  const tiltOffY = constrain(tiltY * 0.05, -pupilOff, pupilOff);
  fill(pal.h - 30, 90, 20, 95);

  if (state === 'dizzy') {
    noFill();
    stroke(pal.h - 30, 90, 20, 95);
    strokeWeight(1.5);
    for (const ex of [cx - eyeSpread, cx + eyeSpread]) {
      push();
      translate(ex, cy - 8);
      rotate(dizzySpin);
      beginShape();
      for (let a = 0; a < TWO_PI * 2; a += 0.3) {
        const rr = a * eyeSize * 0.22;
        vertex(cos(a) * rr, sin(a) * rr);
      }
      endShape();
      pop();
    }
    noStroke();
  } else {
    ellipse(cx - eyeSpread + tiltOffX, cy - 8 + tiltOffY, eyeSize * 0.9, eyeSize * 1.2);
    ellipse(cx + eyeSpread + tiltOffX, cy - 8 + tiltOffY, eyeSize * 0.9, eyeSize * 1.2);
  }

  if (state === 'angry') {
    stroke(pal.h, 90, 90, 95);
    strokeWeight(3);
    const browY = cy - 8 - eyeSize * 1.6;
    const browLen = eyeSize * 1.8;
    line(cx - eyeSpread - browLen * 0.6, browY - 3,
         cx - eyeSpread + browLen * 0.4, browY + 5);
    line(cx + eyeSpread + browLen * 0.6, browY - 3,
         cx + eyeSpread - browLen * 0.4, browY + 5);
    noStroke();
  }

  stroke(pal.h, 30, 100, 70);
  strokeWeight(2);
  noFill();
  if (state === 'angry') {
    stroke(pal.h, 90, 90, 95);
    strokeWeight(2.5);
    arc(cx, cy + 20, 26, 18, PI, TWO_PI);
    strokeWeight(1);
    line(cx - 10, cy + 14, cx + 10, cy + 14);
  } else if (state === 'dizzy') {
    stroke(pal.h - 20, 60, 100, 85);
    strokeWeight(2);
    beginShape();
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const mx = cx - 14 + t * 28;
      const my = cy + 14 + sin(t * PI * 3 + dizzySpin) * 3;
      vertex(mx, my);
    }
    endShape();
  } else if (state === 'scared') {
    stroke(pal.h, 80, 100, 90);
    fill(pal.h - 10, 70, 20, 95);
    const wobble = sin(frameCount * 0.6) * 1.2;
    ellipse(cx, cy + 14, 10 + wobble, 14 + wobble);
    noFill();
  } else if (state === 'startled') {
    ellipse(cx, cy + 14, 14, 18);
  } else if (state === 'excited') {
    arc(cx, cy + 10, 28, 20, 0, PI);
  } else if (state === 'curious') {
    arc(cx, cy + 10, 18, 12, 0, PI);
  } else {
    line(cx - 10, cy + 14, cx + 10, cy + 14);
  }
  noStroke();
}

function drawParticles() {
  for (let pt of particles) {
    fill(pt.h, 80, 100, pt.life);
    ellipse(pt.x, pt.y, pt.size, pt.size);
  }
}

function spawnParticle() {
  const cx = width / 2;
  const cy = height / 2;
  const angle = random(TWO_PI);
  const speed = random(1, 4);
  particles.push({
    x: cx + cos(angle) * bodyRadius,
    y: cy + sin(angle) * bodyRadius,
    vx: cos(angle) * speed,
    vy: sin(angle) * speed - 2,
    size: random(3, 8),
    h: PALETTES[mood].h + random(-30, 30),
    life: 80,
  });
}

function handleTouch() {
  energy = constrain(energy + 15, 0, 100);
  alertness = constrain(alertness + 25, 0, 100);
  for (let i = 0; i < 6; i++) spawnParticle();
}

function updateUI() {
  document.getElementById('energy-fill').style.width = energy + '%';
  document.getElementById('alert-fill').style.width = alertness + '%';
}

// ── Sensor init — triggered by the AWAKEN button ─────────────
async function initAgent() {
  document.getElementById('permission-overlay').style.display = 'none';
  document.getElementById('ui').style.display = 'flex';

  // Fire all permission requests synchronously inside the user gesture.
  // iOS Safari invalidates the gesture after the first `await`.
  const orientPromise = (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function')
    ? DeviceOrientationEvent.requestPermission().catch(() => 'denied')
    : Promise.resolve('granted');

  const motionPromise = (typeof DeviceMotionEvent !== 'undefined' &&
      typeof DeviceMotionEvent.requestPermission === 'function')
    ? DeviceMotionEvent.requestPermission().catch(() => 'denied')
    : Promise.resolve('granted');

  const micPromise = navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
  const camPromise = navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: 64, height: 48 }, audio: false,
  }).catch(() => null);

  const orientRes = await orientPromise;
  if (orientRes === 'granted') attachOrientation();

  const motionRes = await motionPromise;
  if (motionRes === 'granted') attachMotion();

  attachMouseShakeFallback();

  const micStreamRes = await micPromise;
  if (micStreamRes) {
    try {
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(micStreamRes);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      micStream = micStreamRes;
      micActive = true;
      document.getElementById('mic-status').textContent = 'mic: active';
    } catch (e) {
      document.getElementById('mic-status').textContent = 'mic: error';
    }
  } else {
    document.getElementById('mic-status').textContent = 'mic: denied — use touch/motion';
  }

  const camStreamRes = await camPromise;
  if (camStreamRes) {
    await initCameraFromStream(camStreamRes);
  } else {
    document.getElementById('cam-status').textContent = 'cam: denied';
  }

  // Start the sketch
  loop();

  document.getElementById('feed-btn').addEventListener('click', () => {
    energy = Math.min(energy + 20, 100);
    transitionTo(alertness > 40 ? 'curious' : 'aware');
    for (let i = 0; i < 5; i++) spawnParticle();
  });
  document.getElementById('calm-btn').addEventListener('click', () => {
    alertness = Math.max(alertness - 40, 0);
    transitionTo('aware');
  });
  document.getElementById('play-btn').addEventListener('click', () => {
    alertness = Math.min(alertness + 50, 100);
    transitionTo('excited');
  });
}

function attachOrientation() {
  window.addEventListener('deviceorientation', (e) => {
    tiltX = e.gamma || 0;
    tiltY = e.beta || 0;
  });
}

function attachMotion() {
  window.addEventListener('devicemotion', (e) => {
    const a = e.accelerationIncludingGravity || e.acceleration;
    if (!a) return;
    const dx = (a.x || 0) - lastAccel.x;
    const dy = (a.y || 0) - lastAccel.y;
    const dz = (a.z || 0) - lastAccel.z;
    const delta = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (delta > 3) shakeIntensity = Math.min(shakeIntensity + delta, 60);
    lastAccel = { x: a.x || 0, y: a.y || 0, z: a.z || 0 };
    motionActive = true;
  });
}

function attachMouseShakeFallback() {
  window.addEventListener('mousemove', (e) => {
    const now = performance.now();
    mouseHistory.push({ x: e.clientX, y: e.clientY, t: now });
    mouseHistory = mouseHistory.filter(s => now - s.t < 300);
    if (mouseHistory.length < 5) return;
    let reversals = 0;
    for (let i = 2; i < mouseHistory.length; i++) {
      const dx1 = mouseHistory[i - 1].x - mouseHistory[i - 2].x;
      const dx2 = mouseHistory[i].x - mouseHistory[i - 1].x;
      if (dx1 * dx2 < 0 && Math.abs(dx2) > 8) reversals++;
    }
    if (reversals >= 3) shakeIntensity = Math.min(shakeIntensity + 12, 60);
  });
}

async function initCameraFromStream(stream) {
  try {
    if (!stream.getVideoTracks || stream.getVideoTracks().length === 0) {
      document.getElementById('cam-status').textContent = 'cam: no video track';
      return;
    }
    camVideo = document.createElement('video');
    camVideo.srcObject = stream;
    camVideo.setAttribute('playsinline', '');
    camVideo.setAttribute('autoplay', '');
    camVideo.muted = true;
    // iOS Safari won't play display:none videos — keep it in DOM but invisible.
    camVideo.style.cssText = 'position:fixed;top:0;left:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1;';
    document.body.appendChild(camVideo);
    await camVideo.play();
    camSampleCanvas = document.createElement('canvas');
    camSampleCanvas.width = 32;
    camSampleCanvas.height = 24;
    camSampleCtx = camSampleCanvas.getContext('2d', { willReadFrequently: true });
    camActive = true;
    document.getElementById('cam-status').textContent = 'cam: active';
  } catch (e) {
    document.getElementById('cam-status').textContent = 'cam: play failed — ' + (e.message || e.name);
  }
}

function sampleCamera() {
  if (!camActive || !camVideo || camVideo.readyState < 2) return;
  if (frameCount % 6 !== 0) return;
  try {
    camSampleCtx.drawImage(camVideo, 0, 0, camSampleCanvas.width, camSampleCanvas.height);
    const data = camSampleCtx.getImageData(0, 0, camSampleCanvas.width, camSampleCanvas.height).data;
    const pixels = data.length / 4;
    let sum = 0;
    const lumas = new Float32Array(pixels);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      const L = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      lumas[j] = L;
      sum += L;
    }
    const meanL = sum / pixels;
    let varSum = 0;
    for (let j = 0; j < pixels; j++) {
      const d = lumas[j] - meanL;
      varSum += d * d;
    }
    const stdDev = Math.sqrt(varSum / pixels) / 255;
    const avg = meanL / 255;

    camBrightness = lerp(camBrightness, avg, 0.3);
    camVariance   = lerp(camVariance, stdDev, 0.3);

    // Covered = dark OR (fairly dark AND very uniform — a finger lets warm reddish
    // light through but the image is flat). Tuned for auto-exposure boosting gain.
    const isDark = camBrightness < 0.18;
    const isFlat = camVariance < 0.06;
    const covered = isDark || (camBrightness < 0.35 && isFlat);

    if (covered) camCoverFrames = Math.min(camCoverFrames + 6, 120);
    else camCoverFrames = Math.max(camCoverFrames - 6, 0);
    camCovered = camCoverFrames > 24;

    const camStatus = document.getElementById('cam-status');
    if (camStatus) {
      camStatus.textContent = `b=${camBrightness.toFixed(2)} v=${camVariance.toFixed(2)} mic=${micLevel.toFixed(2)} shake=${shakeIntensity.toFixed(0)}${camCovered ? ' COVERED' : ''}`;
    }
  } catch (e) { /* video not ready */ }
}
