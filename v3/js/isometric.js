/* OmniFlow Isometric Animation
   3-phase token flow: fly in → orbit → burst out */
(function () {
  "use strict";

  var prefersReduced = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  if (prefersReduced) return;

  var svg = document.querySelector(".isometric-svg");
  if (!svg) return;

  var ns = "http://www.w3.org/2000/svg";
  var defs = svg.querySelector("defs");
  var engine = document.getElementById("centerEngine");

  // Source paths (tokens fly in)
  var srcPaths = [
    { id: "pathSrc1", color: "#1894E8" },
    { id: "pathSrc2", color: "#1894E8" },
    { id: "pathSrc3", color: "#1894E8" },
  ];

  // Destination paths (tokens burst out)
  var dstPaths = [
    { id: "pathDst1", color: "#0052FF" },
    { id: "pathDst2", color: "#28A0F0" },
    { id: "pathDst3", color: "#627EEA" },
    { id: "pathDst4", color: "#FF0420" },
    { id: "pathDst5", color: "#E84142" },
  ];

  // ── SOURCE PATH TRACKING ──
  // Update source path start points to follow card float animation
  var srcPathData = [
    {
      pathId: "pathSrc1",
      cardSelector: '.source-card[data-group="src1"]',
      baseX: 166,
      baseY: 71,
    },
    {
      pathId: "pathSrc2",
      cardSelector: '.source-card[data-group="src2"]',
      baseX: 166,
      baseY: 181,
    },
    {
      pathId: "pathSrc3",
      cardSelector: '.source-card[data-group="src3"]',
      baseX: 166,
      baseY: 291,
    },
  ];
  var endX = 390,
    endY = 145;

  function updateSourcePaths() {
    for (var i = 0; i < srcPathData.length; i++) {
      var d = srcPathData[i];
      var pathEl = document.getElementById(d.pathId);
      var card = document.querySelector(d.cardSelector);
      if (!pathEl || !card) continue;

      var style = getComputedStyle(card);
      var t = style.translate || "0 0";
      var parts = t.split(/\s+/);
      var offsetY = parseFloat(parts[1] || 0) || 0;

      var sx = d.baseX;
      var sy = d.baseY + offsetY;

      pathEl.setAttribute(
        "d",
        "M " +
          sx +
          " " +
          sy +
          " C " +
          250 +
          " " +
          sy +
          ", " +
          340 +
          " " +
          endY +
          ", " +
          endX +
          " " +
          endY,
      );
    }
    requestAnimationFrame(updateSourcePaths);
  }
  requestAnimationFrame(updateSourcePaths);

  // Chain icon paths for burst tokens (simplified 12x12 centered at 0,0)
  var chainIcons = {
    "#0052FF": function (g) {
      // Base: cross on blue
      var c = document.createElementNS(ns, "circle");
      c.setAttribute("r", "5"); c.setAttribute("fill", "#0052FF");
      g.appendChild(c);
      var p = document.createElementNS(ns, "path");
      p.setAttribute("d", "M 0 -3.5 L 0 3.5 M -3.5 0 L 3.5 0");
      p.setAttribute("stroke", "white"); p.setAttribute("stroke-width", "1.2"); p.setAttribute("fill", "none");
      g.appendChild(p);
    },
    "#28A0F0": function (g) {
      // Arbitrum: stylized A
      var c = document.createElementNS(ns, "circle");
      c.setAttribute("r", "5"); c.setAttribute("fill", "#1B4ADD");
      g.appendChild(c);
      var p = document.createElementNS(ns, "path");
      p.setAttribute("d", "M -3 3.5 L 0 -3.5 L 3 3.5 M -2 1.5 L 2 1.5");
      p.setAttribute("stroke", "white"); p.setAttribute("stroke-width", "1"); p.setAttribute("fill", "none"); p.setAttribute("stroke-linecap", "round");
      g.appendChild(p);
    },
    "#627EEA": function (g) {
      // Ethereum: diamond
      var p = document.createElementNS(ns, "path");
      p.setAttribute("d", "M 0 -5 L 4.5 0 L 0 5 L -4.5 0 Z");
      p.setAttribute("fill", "#627EEA");
      g.appendChild(p);
      var h = document.createElementNS(ns, "path");
      h.setAttribute("d", "M 0 -5 L 4.5 0 L 0 -1.5 L -4.5 0 Z");
      h.setAttribute("fill", "white"); h.setAttribute("opacity", "0.35");
      g.appendChild(h);
    },
    "#FF0420": function (g) {
      // Optimism: OP text
      var c = document.createElementNS(ns, "circle");
      c.setAttribute("r", "5"); c.setAttribute("fill", "#FF0420");
      g.appendChild(c);
      var t = document.createElementNS(ns, "text");
      t.setAttribute("text-anchor", "middle"); t.setAttribute("y", "2.5");
      t.setAttribute("fill", "white"); t.setAttribute("font-size", "6"); t.setAttribute("font-weight", "700");
      t.setAttribute("font-family", "Sora, sans-serif");
      t.textContent = "OP";
      g.appendChild(t);
    },
    "#E84142": function (g) {
      // Avalanche: triangle
      var c = document.createElementNS(ns, "circle");
      c.setAttribute("r", "5"); c.setAttribute("fill", "#E84142");
      g.appendChild(c);
      var p = document.createElementNS(ns, "path");
      p.setAttribute("d", "M 0 -3 L 3.5 3 L -3.5 3 Z");
      p.setAttribute("fill", "white"); p.setAttribute("opacity", "0.9");
      g.appendChild(p);
    },
  };

  // ── HELPERS ──

  function createToken(color, r) {
    var circle = document.createElementNS(ns, "circle");
    circle.setAttribute("r", r || "4");
    circle.setAttribute("fill", color);
    circle.setAttribute("opacity", "0");
    circle.setAttribute("filter", "url(#pktGlow)");
    circle.classList.add("packet");
    return circle;
  }

  function createChainToken(color) {
    var g = document.createElementNS(ns, "g");
    g.setAttribute("opacity", "0");
    g.setAttribute("filter", "url(#pktGlow)");
    g.classList.add("packet");

    // Background glow circle
    var bg = document.createElementNS(ns, "circle");
    bg.setAttribute("r", "8");
    bg.setAttribute("fill", color);
    bg.setAttribute("opacity", "0.3");
    g.appendChild(bg);

    // Chain-specific icon
    if (chainIcons[color]) {
      chainIcons[color](g);
    } else {
      var fallback = document.createElementNS(ns, "circle");
      fallback.setAttribute("r", "4");
      fallback.setAttribute("fill", color);
      g.appendChild(fallback);
    }

    return g;
  }

  function addMotion(el, pathId, dur, onEnd) {
    var motion = document.createElementNS(ns, "animateMotion");
    motion.setAttribute("dur", dur + "s");
    motion.setAttribute("repeatCount", "1");
    motion.setAttribute("fill", "freeze");

    var mpath = document.createElementNS(ns, "mpath");
    mpath.setAttribute("href", "#" + pathId);
    motion.appendChild(mpath);

    el.appendChild(motion);

    if (onEnd) {
      setTimeout(onEnd, dur * 1000);
    }
  }

  function addFade(el, dur, fadeIn, fadeOut) {
    var anim = document.createElementNS(ns, "animate");
    anim.setAttribute("attributeName", "opacity");
    if (fadeIn && fadeOut) {
      anim.setAttribute("values", "0;0.9;0.9;0");
      anim.setAttribute("keyTimes", "0;0.1;0.85;1");
    } else if (fadeIn) {
      anim.setAttribute("values", "0;0.9");
      anim.setAttribute("keyTimes", "0;0.15");
    } else if (fadeOut) {
      anim.setAttribute("values", "0.9;0.9;0");
      anim.setAttribute("keyTimes", "0;0.8;1");
    }
    anim.setAttribute("dur", dur + "s");
    anim.setAttribute("fill", "freeze");
    el.appendChild(anim);
  }

  // ── 3-PHASE TOKEN FLOW ──

  function spawnFlow() {
    // Pick a random source
    var src = srcPaths[Math.floor(Math.random() * srcPaths.length)];
    var srcPath = document.getElementById(src.id);
    if (!srcPath) return;

    var flyInDur = 1.8;
    var orbitDur = 2.5;
    var flyOutDur = 1.8;

    // Phase 1: Fly in from source card to sphere
    var tokenIn = createToken(src.color, "4");
    addMotion(tokenIn, src.id, flyInDur, function () {
      tokenIn.remove();
      startOrbit();
    });
    addFade(tokenIn, flyInDur, true, false);
    svg.appendChild(tokenIn);

    // Phase 2: Orbit around sphere
    function startOrbit() {
      var tokenOrbit = createToken("#9F72FF", "3.5");
      tokenOrbit.setAttribute("opacity", "0.9");

      var motion = document.createElementNS(ns, "animateMotion");
      motion.setAttribute("dur", orbitDur + "s");
      motion.setAttribute("repeatCount", "1");
      motion.setAttribute("fill", "freeze");

      var mpath = document.createElementNS(ns, "mpath");
      mpath.setAttribute("href", "#orbitPath");
      motion.appendChild(mpath);
      tokenOrbit.appendChild(motion);

      // Pulse while orbiting
      var pulse = document.createElementNS(ns, "animate");
      pulse.setAttribute("attributeName", "opacity");
      pulse.setAttribute("values", "0.9;0.5;0.9;0.5;0.9");
      pulse.setAttribute("dur", orbitDur + "s");
      pulse.setAttribute("fill", "freeze");
      tokenOrbit.appendChild(pulse);

      engine.appendChild(tokenOrbit);

      setTimeout(function () {
        tokenOrbit.remove();
        burstOut();
      }, orbitDur * 1000);
    }

    // Phase 3: Burst out to 2-3 random recipients with chain icons
    function burstOut() {
      var count = 2 + Math.floor(Math.random() * 2); // 2 or 3
      var shuffled = dstPaths.slice().sort(function () {
        return Math.random() - 0.5;
      });

      for (var i = 0; i < count && i < shuffled.length; i++) {
        var dst = shuffled[i];
        var dstPath = document.getElementById(dst.id);
        if (!dstPath) continue;

        var tokenOut = createChainToken(dst.color);
        addMotion(tokenOut, dst.id, flyOutDur);
        addFade(tokenOut, flyOutDur, true, true);
        svg.appendChild(tokenOut);

        // Cleanup
        (function (t) {
          setTimeout(function () {
            t.remove();
          }, (flyOutDur + 0.2) * 1000);
        })(tokenOut);
      }
    }
  }

  // Stagger flows (faster spawn rate)
  setInterval(spawnFlow, 2500);
  setTimeout(spawnFlow, 500);
  setTimeout(spawnFlow, 1500);

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
