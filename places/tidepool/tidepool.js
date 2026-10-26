// Tidepool — interactive parts of "What is a Fourier transform actually doing?"
// Plain JS, no dependencies. Three pieces: circles building waves, draw-anything, and sound.

"use strict";

// ---------- Math ----------

// Circles (as signed sine amplitudes) whose sum approaches each target wave.
function waveCoeffs(type, count) {
  const out = [];
  for (let i = 0; out.length < count; i++) {
    if (type === "square") {
      const n = 2 * i + 1;
      out.push({ n, amp: 4 / (n * Math.PI) });
    } else if (type === "saw") {
      const n = i + 1;
      out.push({ n, amp: (n % 2 ? 2 : -2) / (n * Math.PI) });
    } else {
      const n = 2 * i + 1;
      out.push({ n, amp: (i % 2 ? -8 : 8) / (Math.PI * Math.PI * n * n) });
    }
  }
  return out;
}

// The exact wave each series is reaching for.
function targetWave(type, t) {
  const s = Math.sin(t);
  if (type === "square") return s > 0 ? 1 : s < 0 ? -1 : 0;
  if (type === "saw") {
    const u = ((t + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    return u / Math.PI;
  }
  return 2 / Math.PI * Math.asin(s);
}

// Resample a drawn path to n points evenly spaced along its length.
function resample(pts, n) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  const total = cum[cum.length - 1];
  const out = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const target = total * i / n;
    while (j < pts.length - 2 && cum[j + 1] < target) j++;
    const seg = cum[j + 1] - cum[j] || 1;
    const f = (target - cum[j]) / seg;
    out.push({ x: pts[j].x + (pts[j + 1].x - pts[j].x) * f, y: pts[j].y + (pts[j + 1].y - pts[j].y) * f });
  }
  return out;
}

// Discrete Fourier transform of points treated as complex numbers x + iy.
// Each result is one circle: frequency k (turns per loop), radius, and starting angle.
function dft(pts) {
  const N = pts.length, out = [];
  for (let k = -Math.floor(N / 2); k < Math.ceil(N / 2); k++) {
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) {
      const a = -2 * Math.PI * k * n / N;
      re += pts[n].x * Math.cos(a) - pts[n].y * Math.sin(a);
      im += pts[n].x * Math.sin(a) + pts[n].y * Math.cos(a);
    }
    re /= N; im /= N;
    out.push({ k, re, im, r: Math.hypot(re, im) });
  }
  return out;
}

function heartPoints() {
  const pts = [];
  for (let i = 0; i < 300; i++) {
    const t = 2 * Math.PI * i / 300;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    pts.push({ x: 0.5 + x / 40, y: 0.47 + y / 40 });
  }
  return pts;
}

// ---------- Page helpers ----------

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

let colors = {};
function readColors() {
  colors = { ink: cssVar("--ink"), soft: cssVar("--ink-soft"), faint: cssVar("--ink-faint"),
             line: cssVar("--line"), sea: cssVar("--sea"), accent: cssVar("--accent") };
}
readColors();
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", readColors);

function fitCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  return dpr;
}

// Run an animation only while its canvas is on screen, to spare batteries.
function animateWhenVisible(canvas, frame) {
  let visible = true, last = 0, running = false;
  function loop(now) {
    if (!visible) { running = false; return; }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    frame(dt);
    requestAnimationFrame(loop);
  }
  function start() {
    if (running) return;
    running = true; last = 0;
    requestAnimationFrame(loop);
  }
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      if (visible) start();
    }).observe(canvas);
  }
  start();
}

// ---------- 1. Circles make waves ----------

(function circlesToWaves() {
  const canvas = document.getElementById("waveCanvas");
  const ctx = canvas.getContext("2d");
  const slider = document.getElementById("nCircles");
  const out = document.getElementById("nCirclesOut");
  const caption = document.getElementById("waveCaption");
  const buttons = document.querySelectorAll("button[data-wave]");
  const CAPTIONS = {
    square: "Square wave: only odd speeds (1×, 3×, 5×…), with sizes 1, ⅓, ⅕… Watch the corners as you add circles.",
    saw: "Sawtooth: every speed (1×, 2×, 3×…), with sizes 1, ½, ⅓…, alternating direction.",
    triangle: "Triangle: odd speeds again, but the sizes shrink much faster (1, 1⁄9, 1⁄25…). That's why it looks right with only a few circles.",
  };
  let type = "square", coeffs = waveCoeffs(type, 1), t = 0;

  function update() {
    coeffs = waveCoeffs(type, +slider.value);
    out.textContent = slider.value;
    caption.textContent = CAPTIONS[type];
  }
  slider.addEventListener("input", update);
  buttons.forEach(b => b.addEventListener("click", () => {
    type = b.dataset.wave;
    buttons.forEach(o => o.setAttribute("aria-pressed", String(o === b)));
    update();
  }));
  update();

  animateWhenVisible(canvas, dt => {
    const dpr = fitCanvas(canvas);
    const cw = canvas.width, ch = canvas.height;
    ctx.clearRect(0, 0, cw, ch);
    t += dt * 2 * Math.PI / 5;              // one turn of the big circle every 5 seconds
    const R = ch * 0.27, cx = ch * 0.5, cy = ch * 0.5;
    const x0 = ch * 1.1;                    // where the traced wave starts
    const pxPerRad = (cw - x0) / (4 * Math.PI);

    // The target wave, faint and dashed, so you can see how close the circles get.
    ctx.setLineDash([4 * dpr, 5 * dpr]);
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    for (let x = x0; x <= cw; x += 2) {
      const y = cy - R * targetWave(type, t - (x - x0) / pxPerRad);
      x === x0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // The traced wave: the sum of the circles at each earlier moment.
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 2.2 * dpr;
    ctx.beginPath();
    for (let x = x0; x <= cw; x += 1.5) {
      const tt = t - (x - x0) / pxPerRad;
      let y = 0;
      for (const c of coeffs) y += c.amp * Math.sin(c.n * tt);
      x === x0 ? ctx.moveTo(x, cy - R * y) : ctx.lineTo(x, cy - R * y);
    }
    ctx.stroke();

    // The chain of circles.
    let px = cx, py = cy;
    ctx.lineWidth = 1.2 * dpr;
    for (const c of coeffs) {
      const r = R * Math.abs(c.amp);
      if (r > 0.6) {
        ctx.strokeStyle = colors.faint;
        ctx.beginPath(); ctx.arc(px, py, r, 0, 2 * Math.PI); ctx.stroke();
      }
      const nx = px + R * c.amp * Math.cos(c.n * t);
      const ny = py - R * c.amp * Math.sin(c.n * t);
      ctx.strokeStyle = colors.ink;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(nx, ny); ctx.stroke();
      px = nx; py = ny;
    }
    ctx.strokeStyle = colors.soft;
    ctx.setLineDash([2 * dpr, 3 * dpr]);
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x0, py); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = colors.accent;
    ctx.beginPath(); ctx.arc(px, py, 3.5 * dpr, 0, 2 * Math.PI); ctx.fill();
  });
})();

// ---------- 2. Draw anything ----------

(function drawAnything() {
  const canvas = document.getElementById("drawCanvas");
  const ctx = canvas.getContext("2d");
  const slider = document.getElementById("kCircles");
  const out = document.getElementById("kCirclesOut");
  const caption = document.getElementById("drawCaption");
  const exampleBtn = document.getElementById("exampleBtn");
  const N = 200, LOOP_SECONDS = 10;

  let original = [], center = { re: 0, im: 0 }, circles = [], path = [];
  let tau = 0, drawing = null, isHeart = true;

  function setShape(pts) {
    original = resample(pts, N);
    const all = dft(original);
    const dc = all.find(c => c.k === 0);
    center = { re: dc.re, im: dc.im };
    circles = all.filter(c => c.k !== 0).sort((a, b) => b.r - a.r);
    tau = 0;
    rebuildPath();
  }

  // The full path drawn by the first K circles, precomputed so the slider updates instantly.
  function rebuildPath() {
    const K = +slider.value;
    out.textContent = K;
    path = [];
    for (let i = 0; i <= 400; i++) {
      const s = i / 400;
      let x = center.re, y = center.im;
      for (let j = 0; j < K; j++) {
        const c = circles[j], a = 2 * Math.PI * c.k * s;
        x += c.re * Math.cos(a) - c.im * Math.sin(a);
        y += c.re * Math.sin(a) + c.im * Math.cos(a);
      }
      path.push({ x, y });
    }
    caption.textContent = `Rebuilding with ${K} of ${N - 1} circles. Dashed: the original. Solid: what the circles draw.` +
      (isHeart ? " Draw your own shape in the box. The heart is just a placeholder." : "");
  }
  slider.addEventListener("input", rebuildPath);

  function pointFrom(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
  }
  canvas.addEventListener("pointerdown", e => {
    drawing = [pointFrom(e)];
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  canvas.addEventListener("pointermove", e => {
    if (!drawing) return;
    const p = pointFrom(e), q = drawing[drawing.length - 1];
    if (Math.hypot(p.x - q.x, p.y - q.y) > 0.004) drawing.push(p);
  });
  function finish() {
    if (!drawing) return;
    let len = 0;
    for (let i = 1; i < drawing.length; i++) len += Math.hypot(drawing[i].x - drawing[i - 1].x, drawing[i].y - drawing[i - 1].y);
    if (drawing.length >= 8 && len > 0.15) { isHeart = false; setShape(drawing); }
    drawing = null;
  }
  canvas.addEventListener("pointerup", finish);
  canvas.addEventListener("pointercancel", finish);
  exampleBtn.addEventListener("click", () => { isHeart = true; setShape(heartPoints()); });

  setShape(heartPoints());

  animateWhenVisible(canvas, dt => {
    const dpr = fitCanvas(canvas);
    const S = canvas.width;                 // the canvas is square
    ctx.clearRect(0, 0, S, canvas.height);

    if (drawing) {
      ctx.strokeStyle = colors.ink;
      ctx.lineWidth = 2.5 * dpr;
      ctx.lineJoin = ctx.lineCap = "round";
      ctx.beginPath();
      drawing.forEach((p, i) => i ? ctx.lineTo(p.x * S, p.y * S) : ctx.moveTo(p.x * S, p.y * S));
      ctx.stroke();
      return;
    }

    tau = (tau + dt / LOOP_SECONDS) % 1;

    // Your original line, as a dashed guide.
    ctx.strokeStyle = colors.faint;
    ctx.lineWidth = 1.5 * dpr;
    ctx.setLineDash([3 * dpr, 5 * dpr]);
    ctx.beginPath();
    original.forEach((p, i) => i ? ctx.lineTo(p.x * S, p.y * S) : ctx.moveTo(p.x * S, p.y * S));
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    // The whole shape these circles make, shown at once so slider changes are visible immediately.
    ctx.strokeStyle = colors.accent;
    ctx.lineJoin = ctx.lineCap = "round";
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 2.5 * dpr;
    ctx.beginPath();
    path.forEach((p, i) => i ? ctx.lineTo(p.x * S, p.y * S) : ctx.moveTo(p.x * S, p.y * S));
    ctx.stroke();
    ctx.globalAlpha = 1;

    // The trace so far this loop, drawn boldly on top.
    const upto = Math.floor(tau * 400);
    ctx.lineWidth = 3 * dpr;
    ctx.beginPath();
    for (let i = 0; i <= upto; i++) i ? ctx.lineTo(path[i].x * S, path[i].y * S) : ctx.moveTo(path[0].x * S, path[0].y * S);
    ctx.stroke();

    // The circles, biggest first, each riding on the last.
    let x = center.re, y = center.im;
    const K = +slider.value;
    ctx.lineWidth = 1 * dpr;
    for (let j = 0; j < K; j++) {
      const c = circles[j], a = 2 * Math.PI * c.k * tau;
      const nx = x + c.re * Math.cos(a) - c.im * Math.sin(a);
      const ny = y + c.re * Math.sin(a) + c.im * Math.cos(a);
      if (c.r * S > 1) {
        ctx.strokeStyle = colors.faint;
        ctx.globalAlpha = 0.6;
        ctx.beginPath(); ctx.arc(x * S, y * S, c.r * S, 0, 2 * Math.PI); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = colors.ink;
        ctx.beginPath(); ctx.moveTo(x * S, y * S); ctx.lineTo(nx * S, ny * S); ctx.stroke();
      }
      x = nx; y = ny;
    }
    ctx.fillStyle = colors.accent;
    ctx.beginPath(); ctx.arc(x * S, y * S, 4 * dpr, 0, 2 * Math.PI); ctx.fill();
  });
})();

// ---------- 3. Hear it ----------

(function hearIt() {
  const canvas = document.getElementById("soundCanvas");
  const ctx = canvas.getContext("2d");
  const box = document.getElementById("harmonics");
  const playBtn = document.getElementById("playBtn");
  const FUND = 220, COUNT = 6;
  const PRESETS = {
    pure:   [1, 0, 0, 0, 0, 0],
    hollow: [1, 0, 1 / 3, 0, 1 / 5, 0],
    bright: [1, 1 / 2, 1 / 3, 1 / 4, 1 / 5, 1 / 6],
  };
  const ORD = ["1st", "2nd", "3rd", "4th", "5th", "6th"];
  const sliders = [];

  for (let i = 0; i < COUNT; i++) {
    const label = document.createElement("label");
    label.textContent = `${ORD[i]} · ${FUND * (i + 1)} Hz`;
    const input = document.createElement("input");
    Object.assign(input, { type: "range", min: 0, max: 100, step: 1, value: i ? 0 : 100 });
    const o = document.createElement("output");
    label.append(input, o);
    box.appendChild(label);
    input.addEventListener("input", changed);
    sliders.push({ input, o });
  }
  const amps = () => sliders.map(s => s.input.value / 100);

  let audio = null, osc = null, gain = null;

  function applyWave() {
    if (!osc) return;
    const a = amps();
    const real = new Float32Array(COUNT + 1), imag = new Float32Array(COUNT + 1);
    a.forEach((v, i) => { imag[i + 1] = v; });
    const silent = a.every(v => v === 0);
    if (!silent) osc.setPeriodicWave(audio.createPeriodicWave(real, imag));
    gain.gain.setTargetAtTime(silent ? 0 : 0.12, audio.currentTime, 0.03);
  }

  function play() {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
    osc = audio.createOscillator();
    gain = audio.createGain();
    gain.gain.value = 0;
    osc.frequency.value = FUND;
    osc.connect(gain).connect(audio.destination);
    osc.start();
    applyWave();
    playBtn.textContent = "■ Stop";
  }
  function stop() {
    gain.gain.setTargetAtTime(0, audio.currentTime, 0.03);
    osc.stop(audio.currentTime + 0.2);
    osc = gain = null;
    playBtn.textContent = "▶ Play";
  }
  playBtn.addEventListener("click", () => (osc ? stop() : play()));

  document.querySelectorAll("button[data-preset]").forEach(b => b.addEventListener("click", () => {
    PRESETS[b.dataset.preset].forEach((v, i) => { sliders[i].input.value = Math.round(v * 100); });
    changed();
  }));

  function draw() {
    const dpr = fitCanvas(canvas);
    const cw = canvas.width, ch = canvas.height;
    ctx.clearRect(0, 0, cw, ch);
    const a = amps();
    const ys = [];
    let peak = 0;
    for (let x = 0; x <= cw; x += 2) {
      const t = x / cw * 4 * Math.PI;     // two cycles of the fundamental
      let y = 0;
      a.forEach((v, i) => { y += v * Math.sin((i + 1) * t); });
      ys.push(y);
      peak = Math.max(peak, Math.abs(y));
    }
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath(); ctx.moveTo(0, ch / 2); ctx.lineTo(cw, ch / 2); ctx.stroke();
    ctx.strokeStyle = colors.sea;
    ctx.lineWidth = 2.2 * dpr;
    ctx.beginPath();
    ys.forEach((y, i) => {
      const py = ch / 2 - (peak ? y / peak : 0) * ch * 0.4;
      i ? ctx.lineTo(i * 2, py) : ctx.moveTo(0, py);
    });
    ctx.stroke();
  }

  function changed() {
    sliders.forEach(s => { s.o.textContent = s.input.value + "%"; });
    applyWave();
    draw();
  }
  window.addEventListener("resize", draw);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => setTimeout(draw));
  changed();
})();
