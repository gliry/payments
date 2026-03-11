/* ═══════════════════════════════════════════
   OmniFlow Flow Field
   Perlin noise particles that form "OF" logo.
   Trail array approach — no canvas accumulation, no ghost artifacts.
   ═══════════════════════════════════════════ */

(function () {
  "use strict";

  const canvas = document.getElementById("flowCanvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d", { alpha: false });
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  if (reducedMotion) return;

  const mobile = window.matchMedia("(max-width: 767px)").matches;
  const tablet = window.matchMedia(
    "(min-width: 768px) and (max-width: 1279px)",
  ).matches;

  const PARTICLE_COUNT = 300;
  const ATTRACTOR_COUNT = mobile ? 50 : 100;
  const FLOW_OPACITY_MULT = mobile ? 0.7 : 1.0;
  const TRAIL_LENGTH = 30;

  const COLORS = ["#1894E8", "#9F72FF", "#62E2A4", "#627eea", "#0052ff"];
  const ATTRACTOR_COLORS = ["#1894E8", "#9F72FF", "#62E2A4"];
  const TWO_PI = Math.PI * 2;
  const NOISE_SCALE = 0.003;
  const TIME_SCALE = 0.0005;
  const HORIZONTAL_BIAS = 0.3;
  const VORTEX_RADIUS = 150;

  // Attractor spring constants
  const PULL_STRENGTH = 0.025;
  const PULL_MAX_DIST = 250;
  const REFORM_SPEED = 0.012;

  let W, H;
  let mouseX = -9999,
    mouseY = -9999;
  let particles = [];
  let attractors = [];
  let time = 0;
  let paused = false;
  let animId = null;
  let bgColor = "#0B0D12";

  // ── Simplex Noise ──
  const SimplexNoise = (() => {
    const F2 = 0.5 * (Math.sqrt(3) - 1);
    const G2 = (3 - Math.sqrt(3)) / 6;
    const grad3 = [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ];
    const perm = new Uint8Array(512);
    const permMod12 = new Uint8Array(512);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    let s = 42;
    for (let i = 255; i > 0; i--) {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      const j = (s >>> 0) % (i + 1);
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) {
      perm[i] = p[i & 255];
      permMod12[i] = perm[i] % 12;
    }
    function dot2(g, x, y) {
      return g[0] * x + g[1] * y;
    }
    function noise2D(xin, yin) {
      const si = (xin + yin) * F2;
      const i = Math.floor(xin + si);
      const j = Math.floor(yin + si);
      const t = (i + j) * G2;
      const x0 = xin - (i - t);
      const y0 = yin - (j - t);
      let i1, j1;
      if (x0 > y0) {
        i1 = 1;
        j1 = 0;
      } else {
        i1 = 0;
        j1 = 1;
      }
      const x1 = x0 - i1 + G2,
        y1 = y0 - j1 + G2;
      const x2 = x0 - 1 + 2 * G2,
        y2 = y0 - 1 + 2 * G2;
      const ii = i & 255,
        jj = j & 255;
      const gi0 = permMod12[ii + perm[jj]];
      const gi1 = permMod12[ii + i1 + perm[jj + j1]];
      const gi2 = permMod12[ii + 1 + perm[jj + 1]];
      let n0 = 0,
        n1 = 0,
        n2 = 0;
      let t0 = 0.5 - x0 * x0 - y0 * y0;
      if (t0 >= 0) {
        t0 *= t0;
        n0 = t0 * t0 * dot2(grad3[gi0], x0, y0);
      }
      let t1 = 0.5 - x1 * x1 - y1 * y1;
      if (t1 >= 0) {
        t1 *= t1;
        n1 = t1 * t1 * dot2(grad3[gi1], x1, y1);
      }
      let t2 = 0.5 - x2 * x2 - y2 * y2;
      if (t2 >= 0) {
        t2 *= t2;
        n2 = t2 * t2 * dot2(grad3[gi2], x2, y2);
      }
      return 70 * (n0 + n1 + n2);
    }
    return { noise2D };
  })();

  function hexToRGBA(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
  }

  function getTheme() {
    return document.documentElement.getAttribute("data-theme") || "dark";
  }

  function updateBgColor() {
    bgColor = getTheme() === "dark" ? "#0B0D12" : "#FFFFFF";
  }

  function getBaseOpacity() {
    const base = getTheme() === "dark" ? 0.35 : 0.45;
    return base * FLOW_OPACITY_MULT;
  }

  // ── Generate "OF" letter points ──
  function generateOFPoints(cx, cy, size) {
    const points = [];
    const letterSpacing = size * 0.6;
    const oCenter = { x: cx - letterSpacing / 2, y: cy };
    const fCenter = { x: cx + letterSpacing / 2, y: cy };
    const halfH = size * 0.45;
    const halfW = size * 0.25;

    // "O" — ellipse, sample points around perimeter
    const oPoints = mobile ? 25 : 50;
    for (let i = 0; i < oPoints; i++) {
      const angle = (i / oPoints) * TWO_PI;
      points.push({
        x: oCenter.x + Math.cos(angle) * halfW,
        y: oCenter.y + Math.sin(angle) * halfH,
      });
    }

    // "F" — three line segments
    const fLeft = fCenter.x - halfW;
    const fTop = fCenter.y - halfH;
    const fBottom = fCenter.y + halfH;
    const fMid = fCenter.y - halfH * 0.1;

    // Vertical bar (left side of F)
    const vSegments = mobile ? 12 : 24;
    for (let i = 0; i <= vSegments; i++) {
      const t = i / vSegments;
      points.push({
        x: fLeft,
        y: fTop + (fBottom - fTop) * t,
      });
    }

    // Top horizontal bar
    const hSegments = mobile ? 8 : 16;
    for (let i = 1; i <= hSegments; i++) {
      const t = i / hSegments;
      points.push({
        x: fLeft + halfW * 2 * t,
        y: fTop,
      });
    }

    // Middle horizontal bar (slightly shorter)
    const mSegments = mobile ? 6 : 14;
    for (let i = 1; i <= mSegments; i++) {
      const t = i / mSegments;
      points.push({
        x: fLeft + halfW * 1.6 * t,
        y: fMid,
      });
    }

    return points;
  }

  // ── Build attractors from OF points ──
  function buildAttractors() {
    // Position OF in center of screen, shifted slightly right on desktop
    const offsetX = mobile ? 0 : W * 0.22;
    const cx = W / 2 + offsetX;
    const cy = H * 0.45;
    const letterSize = mobile
      ? Math.min(W * 0.7, 200)
      : Math.min(W * 0.35, 350);

    const ofPoints = generateOFPoints(cx, cy, letterSize);

    // Sample ATTRACTOR_COUNT points from ofPoints
    attractors = [];
    const step = Math.max(1, Math.floor(ofPoints.length / ATTRACTOR_COUNT));
    for (let i = 0; i < ofPoints.length; i += step) {
      if (attractors.length >= ATTRACTOR_COUNT) break;
      attractors.push({
        x: ofPoints[i].x,
        y: ofPoints[i].y,
        color: ATTRACTOR_COLORS[attractors.length % ATTRACTOR_COLORS.length],
      });
    }
  }

  class Particle {
    constructor(index) {
      this.index = index;
      this.hasAttractor = index < attractors.length;
      this.trail = [];
      this.reset(true);
    }

    reset(initial) {
      this.x = Math.random() * W;
      this.y = initial ? Math.random() * H : Math.random() * H;
      this.prevX = this.x;
      this.prevY = this.y;
      this.speed = 1.5 + Math.random();
      this.trail = [];

      if (this.hasAttractor) {
        const a = attractors[this.index];
        this.color = a.color;
        this.opacity = 0.3 + Math.random() * 0.2;
        this.lineWidth = 1 + Math.random();
      } else {
        this.color = COLORS[Math.floor(Math.random() * COLORS.length)];
        this.opacity = 0.3 + Math.random() * 0.2;
        this.lineWidth = 1 + Math.random();
      }
    }

    update() {
      this.prevX = this.x;
      this.prevY = this.y;

      // Flow noise
      const noiseVal = SimplexNoise.noise2D(
        this.x * NOISE_SCALE,
        this.y * NOISE_SCALE + time * TIME_SCALE,
      );
      let angle = noiseVal * TWO_PI * 2;

      let vx = Math.cos(angle) * this.speed + HORIZONTAL_BIAS;
      let vy = Math.sin(angle) * this.speed;

      // Mouse vortex
      const dx_m = this.x - mouseX;
      const dy_m = this.y - mouseY;
      const dist_m = Math.sqrt(dx_m * dx_m + dy_m * dy_m);
      if (dist_m < VORTEX_RADIUS && dist_m > 1) {
        const strength = (1 - dist_m / VORTEX_RADIUS) * 3;
        const perpX = -dy_m / dist_m;
        const perpY = dx_m / dist_m;
        const blend = strength / (strength + 1);
        vx = vx * (1 - blend) + perpX * this.speed * 2 * blend;
        vy = vy * (1 - blend) + perpY * this.speed * 2 * blend;
      }

      // Attractor pull (for particles with attractors)
      if (this.hasAttractor) {
        const a = attractors[this.index];
        const dx = a.x - this.x;
        const dy = a.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 1) {
          const strength =
            PULL_STRENGTH * Math.min(1, dist / PULL_MAX_DIST) + REFORM_SPEED;
          vx += dx * strength;
          vy += dy * strength;
        }
      }

      this.x += vx;
      this.y += vy;

      // Wrap edges
      let wrapped = false;
      if (this.x > W) { this.x = 0; wrapped = true; }
      else if (this.x < 0) { this.x = W; wrapped = true; }
      if (this.y > H) { this.y = 0; wrapped = true; }
      else if (this.y < 0) { this.y = H; wrapped = true; }
      if (wrapped) {
        if (this.x <= 0 || this.x >= W) this.y = Math.random() * H;
        this.prevX = this.x;
        this.prevY = this.y;
        this.trail = [];
      }

      // Store trail point
      this.trail.push({ x: this.x, y: this.y });
      if (this.trail.length > TRAIL_LENGTH) {
        this.trail.shift();
      }
    }

    draw() {
      const len = this.trail.length;
      if (len < 2) return;

      ctx.lineWidth = this.lineWidth;
      for (let i = 1; i < len; i++) {
        const age = (len - i) / len;
        const alpha = this.opacity * (1 - age);
        ctx.beginPath();
        ctx.moveTo(this.trail[i - 1].x, this.trail[i - 1].y);
        ctx.lineTo(this.trail[i].x, this.trail[i].y);
        ctx.strokeStyle = hexToRGBA(this.color, alpha);
        ctx.stroke();
      }
    }
  }

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    updateBgColor();
    buildAttractors();

    // Reassign attractors to particles
    for (let i = 0; i < particles.length; i++) {
      particles[i].hasAttractor = i < attractors.length;
    }
  }

  function init() {
    resize();
    particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push(new Particle(i));
    }
  }

  function animate() {
    if (paused) {
      animId = requestAnimationFrame(animate);
      return;
    }

    // Clear entire canvas with background color (alpha: false = opaque canvas)
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, W, H);

    time++;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles[i].update();
      particles[i].draw();
    }

    animId = requestAnimationFrame(animate);
  }

  window.addEventListener("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });
  window.addEventListener("mouseleave", () => {
    mouseX = -9999;
    mouseY = -9999;
  });

  let resizeTimeout;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      resize();
    }, 100);
  });

  window.addEventListener("omniflow:visibility", (e) => {
    paused = e.detail.hidden;
  });

  // Listen for theme changes
  const observer = new MutationObserver(() => updateBgColor());
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  init();
  animate();
})();
