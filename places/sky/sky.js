// Lighthouse Point — interactive parts of "Why is the sky blue?"
// Plain JS, no dependencies. Three pieces: wavelength explorer, sky simulator, violet bar chart.

"use strict";

// ---------- Color helpers ----------

// Approximate display color of a single wavelength (Dan Bruton's classic piecewise fit).
function wavelengthToRGB(w) {
  let r = 0, g = 0, b = 0;
  if (w < 440)      { r = -(w - 440) / 60; b = 1; }
  else if (w < 490) { g = (w - 440) / 50; b = 1; }
  else if (w < 510) { g = 1; b = -(w - 510) / 20; }
  else if (w < 580) { r = (w - 510) / 70; g = 1; }
  else if (w < 645) { r = 1; g = -(w - 645) / 65; }
  else              { r = 1; }
  let f = 1;
  if (w < 420) f = 0.3 + 0.7 * (w - 380) / 40;
  else if (w > 700) f = 0.3 + 0.7 * (780 - w) / 80;
  const c = v => Math.round(255 * Math.pow(Math.max(0, v * f), 0.8));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

// CIE 1931 color-matching functions, multi-lobe Gaussian fit (Wyman, Sloan & Shirley 2013).
function lobe(x, mu, s1, s2) {
  const t = (x - mu) / (x < mu ? s1 : s2);
  return Math.exp(-0.5 * t * t);
}
function cieX(l) { return 1.056 * lobe(l, 599.8, 37.9, 31.0) + 0.362 * lobe(l, 442.0, 16.0, 26.7) - 0.065 * lobe(l, 501.1, 20.4, 26.2); }
function cieY(l) { return 0.821 * lobe(l, 568.8, 46.9, 40.5) + 0.286 * lobe(l, 530.9, 16.3, 31.1); }
function cieZ(l) { return 1.217 * lobe(l, 437.0, 11.8, 36.0) + 0.681 * lobe(l, 459.0, 26.0, 13.8); }

function srgbEncode(v) {
  v = Math.min(1, Math.max(0, v));
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

// Perceived color of a spectrum given as a function of wavelength (nm), shown at a pleasant brightness.
function spectrumToCSS(spec) {
  let X = 0, Y = 0, Z = 0;
  for (let l = 380; l <= 780; l += 2) {
    const s = spec(l);
    X += s * cieX(l); Y += s * cieY(l); Z += s * cieZ(l);
  }
  let r =  3.2406 * X - 1.5372 * Y - 0.4986 * Z;
  let g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
  let b =  0.0557 * X - 0.2040 * Y + 1.0570 * Z;
  r = Math.max(0, r); g = Math.max(0, g); b = Math.max(0, b);
  const m = Math.max(r, g, b) || 1;
  const c = v => Math.round(255 * srgbEncode(v / m));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

// Relative spectral radiance of a 5778 K blackbody (the Sun, roughly).
function planck(lnm) {
  const l = lnm * 1e-9;
  return Math.pow(l, -5) / (Math.exp(1.4388e-2 / (l * 5778)) - 1);
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function fitCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  return dpr;
}

// ---------- 1. Wavelength explorer ----------

(function wavelengthExplorer() {
  const slider = document.getElementById("wl");
  const out = document.getElementById("wlOut");
  const swatch = document.getElementById("swatch");
  const factor = document.getElementById("wlFactor");
  function update() {
    const w = +slider.value;
    out.textContent = w + " nm";
    swatch.style.background = wavelengthToRGB(w);
    const f = Math.pow(700 / w, 4);
    factor.textContent = (f < 1.05 ? "1" : f.toFixed(1)) + "×";
  }
  slider.addEventListener("input", update);
  update();
})();

// ---------- 2. Sky simulator ----------
// Single-scattering atmosphere after Nishita et al. (1993), structured like the well-known
// glsl-atmosphere shader. Units are meters. Rayleigh coefficients are for ~680/550/440 nm.

(function skySimulator() {
  const canvas = document.getElementById("skyCanvas");
  const ctx = canvas.getContext("2d");
  const elSlider = document.getElementById("sunEl");
  const hazeSlider = document.getElementById("haze");
  const equalBox = document.getElementById("equal");
  const elOut = document.getElementById("sunElOut");
  const hazeOut = document.getElementById("hazeOut");
  const readout = document.getElementById("skyReadout");

  const R_PLANET = 6371e3, R_ATMOS = 6471e3;
  const H_RAYLEIGH = 8e3, H_MIE = 1.2e3;
  const SUN_INTENSITY = 22;
  const MIE_G = 0.758;
  const EYE = [0, R_PLANET + 2, 0];
  const VIEW_STEPS = 16, LIGHT_STEPS = 12;
  const EXPOSURE = 1.6;

  // Field of view: looking toward the sun, ±60° sideways, from 8° below to 50° above the horizon.
  const AZ_HALF = 60, EL_TOP = 50, EL_BOTTOM = -8;
  // A coarse buffer while a slider is moving, a sharp one once it settles.
  function makeBuffer(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const x = c.getContext("2d");
    return { canvas: c, ctx: x, img: x.createImageData(w, h), W: w, H: h };
  }
  const FAST = makeBuffer(80, 38), FULL = makeBuffer(200, 96);

  const rad = d => d * Math.PI / 180;

  // Ray-sphere intersection (sphere at origin). Returns [near, far], or null if missed.
  function raySphere(o, d, r) {
    const b = 2 * (o[0] * d[0] + o[1] * d[1] + o[2] * d[2]);
    const c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - r * r;
    const disc = b * b - 4 * c;
    if (disc < 0) return null;
    const s = Math.sqrt(disc);
    return [(-b - s) / 2, (-b + s) / 2];
  }

  // Optical depth toward the sun depends only on altitude and the sun's angle from straight up,
  // so trace it once into a table instead of for every sample. Square-root spacing in altitude
  // puts more rows near the ground, where the air is dense.
  const T_H = 64, T_C = 512, BLOCKED = 1e12;
  const tableR = new Float64Array(T_H * T_C), tableM = new Float64Array(T_H * T_C);
  (function buildTable() {
    const span = R_ATMOS - R_PLANET;
    for (let i = 0; i < T_H; i++) {
      const h = span * Math.pow(i / (T_H - 1), 2);
      const p = [0, R_PLANET + h + 1, 0];
      for (let j = 0; j < T_C; j++) {
        const cos = -1 + 2 * j / (T_C - 1);
        const d = [Math.sqrt(Math.max(0, 1 - cos * cos)), cos, 0];
        const k = i * T_C + j;
        const ground = raySphere(p, d, R_PLANET);
        if (ground && ground[0] > 0) { tableR[k] = tableM[k] = BLOCKED; continue; }
        const step = raySphere(p, d, R_ATMOS)[1] / LIGHT_STEPS;
        let odR = 0, odM = 0;
        for (let s = 0; s < LIGHT_STEPS; s++) {
          const t = step * (s + 0.5);
          const x = p[0] + d[0] * t, y = p[1] + d[1] * t;
          const hh = Math.sqrt(x * x + y * y) - R_PLANET;
          odR += Math.exp(-hh / H_RAYLEIGH) * step;
          odM += Math.exp(-hh / H_MIE) * step;
        }
        tableR[k] = odR; tableM[k] = odM;
      }
    }
  })();

  // Optical depth (Rayleigh, Mie) from point p toward the sun. Null if the planet blocks it.
  const depth = [0, 0];
  function lightDepth(p, sun) {
    const r = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
    const u = Math.sqrt(Math.min(1, Math.max(0, (r - R_PLANET) / (R_ATMOS - R_PLANET)))) * (T_H - 1);
    const cos = (p[0] * sun[0] + p[1] * sun[1] + p[2] * sun[2]) / r;
    const v = (cos + 1) / 2 * (T_C - 1);
    const i0 = Math.min(T_H - 2, Math.floor(u)), j0 = Math.min(T_C - 2, Math.floor(v));
    const fu = u - i0, fv = v - j0;
    const a = i0 * T_C + j0, b = a + T_C;
    const w00 = (1 - fu) * (1 - fv), w01 = (1 - fu) * fv, w10 = fu * (1 - fv), w11 = fu * fv;
    depth[0] = tableR[a] * w00 + tableR[a + 1] * w01 + tableR[b] * w10 + tableR[b + 1] * w11;
    depth[1] = tableM[a] * w00 + tableM[a + 1] * w01 + tableM[b] * w10 + tableM[b + 1] * w11;
    return depth[0] > BLOCKED * 0.01 ? null : depth;
  }

  // Light arriving at the eye from direction d. Writes RGB radiance into out.
  function skyColor(d, sun, kR, kM, out) {
    const atm = raySphere(EYE, d, R_ATMOS);
    let tEnd = atm[1];
    const ground = raySphere(EYE, d, R_PLANET);
    const hitsGround = ground && ground[0] > 0;
    if (hitsGround) tEnd = Math.min(tEnd, ground[0]);

    const step = tEnd / VIEW_STEPS;
    const mu = d[0] * sun[0] + d[1] * sun[1] + d[2] * sun[2];
    const phaseR = 3 / (16 * Math.PI) * (1 + mu * mu);
    const gg = MIE_G * MIE_G;
    const phaseM = 3 / (8 * Math.PI) * ((1 - gg) * (1 + mu * mu)) /
      (Math.pow(1 + gg - 2 * mu * MIE_G, 1.5) * (2 + gg));

    let odR = 0, odM = 0;
    let sumR0 = 0, sumR1 = 0, sumR2 = 0, sumM0 = 0, sumM1 = 0, sumM2 = 0;
    const kMext = kM * 1.11;
    const p = [0, 0, 0];
    for (let i = 0; i < VIEW_STEPS; i++) {
      const t = step * (i + 0.5);
      p[0] = EYE[0] + d[0] * t; p[1] = EYE[1] + d[1] * t; p[2] = EYE[2] + d[2] * t;
      const h = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]) - R_PLANET;
      const dR = Math.exp(-h / H_RAYLEIGH) * step;
      const dM = Math.exp(-h / H_MIE) * step;
      odR += dR; odM += dM;
      const l = lightDepth(p, sun);
      if (!l) continue;
      const tR = odR + l[0], tM = odM + l[1];
      const a0 = Math.exp(-(kR[0] * tR + kMext * tM));
      const a1 = Math.exp(-(kR[1] * tR + kMext * tM));
      const a2 = Math.exp(-(kR[2] * tR + kMext * tM));
      sumR0 += dR * a0; sumR1 += dR * a1; sumR2 += dR * a2;
      sumM0 += dM * a0; sumM1 += dM * a1; sumM2 += dM * a2;
    }
    out[0] = SUN_INTENSITY * (phaseR * kR[0] * sumR0 + phaseM * kM * sumM0);
    out[1] = SUN_INTENSITY * (phaseR * kR[1] * sumR1 + phaseM * kM * sumM1);
    out[2] = SUN_INTENSITY * (phaseR * kR[2] * sumR2 + phaseM * kM * sumM2);

    if (hitsGround) {
      // Dim earthy ground, lit by whatever sunlight survives to the surface.
      const gp = [EYE[0] + d[0] * tEnd, EYE[1] + d[1] * tEnd, EYE[2] + d[2] * tEnd];
      const l = lightDepth(gp, sun);
      if (l) {
        const lit = Math.max(0, sun[1]) * SUN_INTENSITY / Math.PI * 0.12;
        const view = [Math.exp(-(kR[0] * odR + kMext * odM)), Math.exp(-(kR[1] * odR + kMext * odM)), Math.exp(-(kR[2] * odR + kMext * odM))];
        const albedo = [0.22, 0.26, 0.16];
        for (let c = 0; c < 3; c++) {
          out[c] += lit * albedo[c] * view[c] * Math.exp(-(kR[c] * l[0] + kMext * l[1]));
        }
      }
    }
  }

  function params() {
    const equal = equalBox.checked;
    const kR = equal ? [13.0e-6, 13.0e-6, 13.0e-6] : [5.5e-6, 13.0e-6, 22.4e-6];
    const kM = 1e-6 + (+hazeSlider.value / 100) * 80e-6;
    const el = +elSlider.value;
    const sun = [0, Math.sin(rad(el)), -Math.cos(rad(el))];
    return { kR, kM, el, sun };
  }

  // Kasten & Young (1989): how much air sunlight crosses, relative to the sun overhead.
  function airMass(elDeg) {
    const z = 90 - elDeg;
    return 1 / (Math.cos(rad(z)) + 0.50572 * Math.pow(96.07995 - z, -1.6364));
  }

  const tone = v => 1 - Math.exp(-v * EXPOSURE);

  function render(buf) {
    const { kR, kM, el, sun } = params();
    const { img, W, H } = buf;
    const data = img.data;
    const half = W / 2;
    const col = [0, 0, 0];
    for (let y = 0; y < H; y++) {
      const elev = rad(EL_TOP - (y + 0.5) / H * (EL_TOP - EL_BOTTOM));
      const ce = Math.cos(elev), se = Math.sin(elev);
      // The sky is mirror-symmetric around the sun, so compute one half and copy it.
      for (let x = 0; x < half; x++) {
        const az = rad((x + 0.5) / half * AZ_HALF);
        const d = [Math.sin(az) * ce, se, -Math.cos(az) * ce];
        skyColor(d, sun, kR, kM, col);
        const r = Math.round(255 * tone(col[0]));
        const g = Math.round(255 * tone(col[1]));
        const b = Math.round(255 * tone(col[2]));
        let i = (y * W + half + x) * 4;
        data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
        i = (y * W + half - 1 - x) * 4;
        data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
      }
    }
    buf.ctx.putImageData(img, 0, 0);

    fitCanvas(canvas);
    const cw = canvas.width, ch = canvas.height;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(buf.canvas, 0, 0, cw, ch);

    // The sun's disk, tinted by the light that survives the trip through the air.
    const horizonY = ch * EL_TOP / (EL_TOP - EL_BOTTOM);
    const sunLight = lightDepth(EYE, sun);
    let sunCss = null;
    if (sunLight) {
      const T = [0, 1, 2].map(c => Math.exp(-(kR[c] * sunLight[0] + kM * 1.11 * sunLight[1])));
      const disk = T.map(t => Math.round(255 * tone(t * 8)));
      sunCss = `rgb(${disk[0]},${disk[1]},${disk[2]})`;
      const sy = ch * (EL_TOP - el) / (EL_TOP - EL_BOTTOM);
      const r = ch * 0.035;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, cw, horizonY);
      ctx.clip();
      const glow = ctx.createRadialGradient(cw / 2, sy, r * 0.5, cw / 2, sy, r * 4);
      glow.addColorStop(0, `rgba(${disk[0]},${disk[1]},${disk[2]},0.55)`);
      glow.addColorStop(1, `rgba(${disk[0]},${disk[1]},${disk[2]},0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, cw, horizonY);
      ctx.beginPath();
      ctx.arc(cw / 2, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = sunCss;
      ctx.fill();
      ctx.restore();
    }

    elOut.textContent = el.toFixed(el % 1 ? 1 : 0) + "°";
    hazeOut.textContent = hazeSlider.value + "%";
    if (el <= -0.5 || !sunCss) {
      readout.textContent = "The sun has set. The glow you see is sunlight scattered high in the " +
        "atmosphere, where the sun is still shining.";
    } else {
      const am = airMass(Math.max(el, 0));
      readout.innerHTML = `Sunlight is crossing <strong>${am < 10 ? am.toFixed(1) : Math.round(am)}×</strong> ` +
        `as much air as when the sun is straight overhead. Color of the sun's light here: ` +
        `<span class="sun-swatch" style="background:${sunCss}"></span>`;
    }
  }

  let queued = false, settle = 0;
  function schedule() {
    clearTimeout(settle);
    settle = setTimeout(() => render(FULL), 150);
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; render(FAST); });
  }
  elSlider.addEventListener("input", schedule);
  hazeSlider.addEventListener("input", schedule);
  equalBox.addEventListener("change", () => render(FULL));
  window.addEventListener("resize", schedule);
  render(FULL);
})();

// ---------- 3. Why not violet? ----------

(function violetChart() {
  const canvas = document.getElementById("barCanvas");
  const ctx = canvas.getContext("2d");
  const caption = document.getElementById("barCaption");
  const mixSwatch = document.getElementById("mixSwatch");
  const buttons = document.querySelectorAll("button[data-mode]");
  let mode = 0;

  const scatter = l => Math.pow(l, -4);
  const MODES = [
    {
      bar: l => scatter(l),
      mix: l => scatter(l),
      text: "Scattering alone favors violet most of all: light at 380 nm scatters about 11× more than at 700 nm. " +
            "(This assumes sunlight had equal amounts of every color.)",
    },
    {
      bar: l => scatter(l) * planck(l),
      mix: l => scatter(l) * planck(l),
      text: "Real sunlight has less violet than blue to begin with. Violet still scatters the most, but its lead shrinks.",
    },
    {
      bar: l => scatter(l) * planck(l) * cieY(l),
      mix: l => scatter(l) * planck(l),
      text: "Now weighted by how bright each wavelength looks to you. Your eyes barely register violet. " +
            "Middle wavelengths add the most brightness, but the hue comes from the balance between " +
            "your three kinds of color sensors, and for this mix that balance lands on pale blue.",
    },
  ];

  function draw() {
    const dpr = fitCanvas(canvas);
    const cw = canvas.width, ch = canvas.height;
    ctx.clearRect(0, 0, cw, ch);
    const m = MODES[mode];
    const ls = [];
    for (let l = 380; l <= 700; l += 10) ls.push(l);
    const vals = ls.map(m.bar);
    const max = Math.max(...vals);
    const pad = 28 * dpr, base = ch - pad;
    const bw = cw / ls.length;
    ls.forEach((l, i) => {
      const h = (base - 8 * dpr) * vals[i] / max;
      ctx.fillStyle = wavelengthToRGB(l);
      ctx.fillRect(i * bw + bw * 0.12, base - h, bw * 0.76, h);
    });
    ctx.fillStyle = cssVar("--ink-soft");
    ctx.font = `${12 * dpr}px ${cssVar("--sans") || "sans-serif"}`;
    ctx.textBaseline = "top";
    [400, 500, 600, 700].forEach(l => {
      const x = ((l - 380) / 10 + 0.5) * bw;
      ctx.textAlign = l === 700 ? "right" : "center";
      ctx.fillText(l + " nm", l === 700 ? cw : x, base + 8 * dpr);
    });
    caption.textContent = m.text;
    mixSwatch.style.background = spectrumToCSS(m.mix);
  }

  buttons.forEach(b => b.addEventListener("click", () => {
    mode = +b.dataset.mode;
    buttons.forEach(o => o.setAttribute("aria-pressed", String(o === b)));
    draw();
  }));
  window.addEventListener("resize", draw);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", draw);
  draw();
})();
