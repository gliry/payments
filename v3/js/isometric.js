/* OmniFlow Isometric Animation
   Scroll-driven token flow: curve in → 1.5 orbits → curve out
   Sphere occludes tokens via SVG z-order (two containers) */
(function () {
  "use strict";

  var prefersReduced = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  if (prefersReduced) return;

  var svg = document.querySelector(".isometric-svg");
  if (!svg) return;

  var ns = "http://www.w3.org/2000/svg";

  // ── SCROLL-DRIVEN TOKEN SYSTEM ──

  // Orbit paths are inside centerEngine at translate(450,145)
  var ENGINE_TX = 450;
  var ENGINE_TY = 145;
  var ORBIT1_ANGLE = -8 * Math.PI / 180;

  // Source card centers
  var SRC = [
    { x: 166, y: 71 },   // src1
    { x: 166, y: 181 },  // src2
    { x: 166, y: 291 },  // src3
  ];

  // Destination card centers (card x, card y + 28)
  var DST = [
    { x: 750, y: 28 },   // dst1
    { x: 810, y: 119 },  // dst2
    { x: 750, y: 210 },  // dst3
    { x: 810, y: 301 },  // dst4
    { x: 750, y: 392 },  // dst5
  ];

  // 15 tokens: 5 per source, alternating orbits, unified entry at t=0
  var TOKEN_CONFIG = [
    // Source 1 (5 tokens)
    { src: SRC[0], dst: DST[0], orbit: "orbitPath",  entryT: 0.0,  icon: "iconUSDC", stagger: 0.0 },
    { src: SRC[0], dst: DST[1], orbit: "orbitPath2", entryT: 0.0,  icon: "iconUSDT", stagger: 0.016 },
    { src: SRC[0], dst: DST[2], orbit: "orbitPath",  entryT: 0.0,  icon: "iconETH",  stagger: 0.032 },
    { src: SRC[0], dst: DST[3], orbit: "orbitPath2", entryT: 0.0,  icon: "iconUSDC", stagger: 0.048 },
    { src: SRC[0], dst: DST[4], orbit: "orbitPath",  entryT: 0.0,  icon: "iconUSDT", stagger: 0.064 },
    // Source 2 (5 tokens)
    { src: SRC[1], dst: DST[0], orbit: "orbitPath2", entryT: 0.0,  icon: "iconETH",  stagger: 0.008 },
    { src: SRC[1], dst: DST[1], orbit: "orbitPath",  entryT: 0.0,  icon: "iconUSDC", stagger: 0.024 },
    { src: SRC[1], dst: DST[2], orbit: "orbitPath2", entryT: 0.0,  icon: "iconUSDT", stagger: 0.040 },
    { src: SRC[1], dst: DST[3], orbit: "orbitPath",  entryT: 0.0,  icon: "iconETH",  stagger: 0.056 },
    { src: SRC[1], dst: DST[4], orbit: "orbitPath2", entryT: 0.0,  icon: "iconUSDC", stagger: 0.072 },
    // Source 3 (5 tokens)
    { src: SRC[2], dst: DST[0], orbit: "orbitPath",  entryT: 0.0,  icon: "iconUSDT", stagger: 0.004 },
    { src: SRC[2], dst: DST[1], orbit: "orbitPath2", entryT: 0.0,  icon: "iconETH",  stagger: 0.020 },
    { src: SRC[2], dst: DST[2], orbit: "orbitPath",  entryT: 0.0,  icon: "iconUSDC", stagger: 0.036 },
    { src: SRC[2], dst: DST[3], orbit: "orbitPath2", entryT: 0.0,  icon: "iconUSDT", stagger: 0.052 },
    { src: SRC[2], dst: DST[4], orbit: "orbitPath",  entryT: 0.0,  icon: "iconETH",  stagger: 0.068 },
  ];

  var tokenEls = [];
  var backContainer = document.getElementById("scrollTokensBack");
  var frontContainer = document.getElementById("scrollTokensFront");

  // Phase boundaries
  var P1_END = 0.15;   // end of approach curve
  var P2_END = 0.85;   // end of orbit
  var P2_DUR = P2_END - P1_END; // 0.70

  function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }

  // Cubic bezier interpolation
  function cubicBezier(p0, p1, p2, p3, t) {
    var u = 1 - t;
    return {
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    };
  }

  // Get orbit point in SVG coordinates (applies centerEngine transform)
  function getOrbitPoint(orbitPath, t, orbitId) {
    var orbitLen = orbitPath.getTotalLength();
    var pt = orbitPath.getPointAtLength(((t % 1.0) + 1.0) % 1.0 * orbitLen);
    if (orbitId === "orbitPath") {
      var cos = Math.cos(ORBIT1_ANGLE);
      var sin = Math.sin(ORBIT1_ANGLE);
      return {
        x: ENGINE_TX + pt.x * cos - pt.y * sin,
        y: ENGINE_TY + pt.x * sin + pt.y * cos,
      };
    }
    // orbitPath2 has no rotation
    return { x: ENGINE_TX + pt.x, y: ENGINE_TY + pt.y };
  }

  // Token icon colors for glow background
  var ICON_COLORS = {
    iconUSDC: "#2775CA",
    iconUSDT: "#26A17B",
    iconETH: "#627EEA",
  };

  // Precomputed data per token (filled in init)
  var tokenData = [];

  function initScrollTokens() {
    if (!frontContainer) return;

    for (var i = 0; i < TOKEN_CONFIG.length; i++) {
      var cfg = TOKEN_CONFIG[i];

      // Group element for token
      var g = document.createElementNS(ns, "g");
      g.setAttribute("opacity", "0");
      g.classList.add("scroll-token");

      // Glow background circle
      var glow = document.createElementNS(ns, "circle");
      glow.setAttribute("r", "10");
      glow.setAttribute("fill", ICON_COLORS[cfg.icon] || "#1894E8");
      glow.setAttribute("opacity", "0.3");
      glow.setAttribute("filter", "url(#pktGlow)");
      g.appendChild(glow);

      // SVG icon via <use>
      var use = document.createElementNS(ns, "use");
      use.setAttribute("href", "#" + cfg.icon);
      use.setAttribute("width", "16");
      use.setAttribute("height", "16");
      use.setAttribute("x", "-8");
      use.setAttribute("y", "-8");
      g.appendChild(use);

      frontContainer.appendChild(g);
      tokenEls.push(g);

      // Precompute orbit entry/exit points
      var orbitEl = document.getElementById(cfg.orbit);
      var entry = orbitEl ? getOrbitPoint(orbitEl, cfg.entryT, cfg.orbit) : { x: ENGINE_TX, y: ENGINE_TY };
      var exitT = (cfg.entryT + 1.5) % 1.0;
      var exit = orbitEl ? getOrbitPoint(orbitEl, exitT, cfg.orbit) : { x: ENGINE_TX, y: ENGINE_TY };

      // Approach bezier: source → orbit entry (left side)
      var approachCP1 = { x: cfg.src.x + 80, y: cfg.src.y };
      var approachCP2 = { x: entry.x - 50, y: entry.y };

      // Departure bezier: orbit exit (right side) → destination
      var departCP1 = { x: exit.x + 50, y: exit.y };
      var departCP2 = { x: cfg.dst.x - 80, y: cfg.dst.y };

      tokenData.push({
        orbitEl: orbitEl,
        entry: entry,
        exit: exit,
        exitT: exitT,
        approachCP1: approachCP1,
        approachCP2: approachCP2,
        departCP1: departCP1,
        departCP2: departCP2,
      });
    }
  }

  function updateScrollTokens(scrollProgress) {
    if (!frontContainer || tokenEls.length === 0) return;

    for (var i = 0; i < TOKEN_CONFIG.length; i++) {
      var cfg = TOKEN_CONFIG[i];
      var el = tokenEls[i];
      var td = tokenData[i];

      // Effective progress with stagger offset
      var p = clamp((scrollProgress - cfg.stagger) / (1 - cfg.stagger), 0, 1);

      if (p <= 0) {
        el.setAttribute("opacity", "0");
        continue;
      }

      var x, y, opacity;
      var isBehind = false;

      if (p <= P1_END) {
        // Phase 1: Approach curve (source card → orbit entry)
        var t = p / P1_END;
        var pt = cubicBezier(cfg.src, td.approachCP1, td.approachCP2, td.entry, t);
        x = pt.x;
        y = pt.y;
        opacity = t < 0.3 ? t / 0.3 : 1;
        opacity *= 0.9;

      } else if (p <= P2_END) {
        // Phase 2: 1.5 orbits strictly on orbit path
        if (!td.orbitEl) { el.setAttribute("opacity", "0"); continue; }
        var t = (p - P1_END) / P2_DUR;
        var actualT = (cfg.entryT + t * 1.5) % 1.0;
        var orbitPt = getOrbitPoint(td.orbitEl, actualT, cfg.orbit);
        x = orbitPt.x;
        y = orbitPt.y;
        opacity = 0.9;
        // Back half of orbit (t=0→0.5) → behind sphere; front half → in front
        isBehind = actualT < 0.5;

      } else {
        // Phase 3: Departure curve (orbit exit → destination card)
        var t = (p - P2_END) / (1 - P2_END);
        var pt = cubicBezier(td.exit, td.departCP1, td.departCP2, cfg.dst, t);
        x = pt.x;
        y = pt.y;
        opacity = t > 0.7 ? (1 - t) / 0.3 : 1;
        opacity *= 0.9;
      }

      var targetContainer = isBehind ? backContainer : frontContainer;
      if (el.parentNode !== targetContainer) {
        targetContainer.appendChild(el);
      }

      el.setAttribute("transform", "translate(" + x + "," + y + ")");
      el.setAttribute("opacity", String(clamp(opacity, 0, 0.9)));
    }
  }

  // Export for animations.js to call
  window.OmniFlowTokens = {
    init: initScrollTokens,
    update: updateScrollTokens,
  };

  // ── HOVER INTERACTIONS ──

  function highlightGroup(group, on) {
    var card = document.querySelector('[data-group="' + group + '"]');
    if (!card) return;
    if (on) {
      card.style.filter = "brightness(1.3)";
    } else {
      card.style.filter = "";
    }
  }

  var sourceCards = document.querySelectorAll(".source-card");
  for (var i = 0; i < sourceCards.length; i++) {
    (function (card) {
      var group = card.getAttribute("data-group");
      card.addEventListener("mouseenter", function () {
        highlightGroup(group, true);
      });
      card.addEventListener("mouseleave", function () {
        highlightGroup(group, false);
      });
      card.style.cursor = "pointer";
    })(sourceCards[i]);
  }

  var recipientCards = document.querySelectorAll(".recipient-card");
  for (var i = 0; i < recipientCards.length; i++) {
    (function (card) {
      var group = card.getAttribute("data-group");
      card.addEventListener("mouseenter", function () {
        highlightGroup(group, true);
      });
      card.addEventListener("mouseleave", function () {
        highlightGroup(group, false);
      });
      card.style.cursor = "pointer";
    })(recipientCards[i]);
  }

  var center = document.getElementById("centerEngine");
  if (center) {
    center.style.cursor = "pointer";
  }
})();
