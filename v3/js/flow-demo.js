/* OmniFlow Flow Demo — How It Works interactive canvas */
(function () {
  'use strict';

  var canvas = document.getElementById('flowDemoCanvas');
  var demoEl = document.getElementById('flowDemo');
  if (!canvas || !demoEl) return;

  var ctx = canvas.getContext('2d');
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isMobile = window.matchMedia('(max-width: 767px)').matches;
  if (reducedMotion || isMobile) return;

  // Nodes
  var senderEls = demoEl.querySelectorAll('.flow-demo__node--sender');
  var recipientEls = demoEl.querySelectorAll('.flow-demo__node--recipient');
  var hubEl = document.getElementById('flowDemoHub');
  var stepEls = demoEl.querySelectorAll('.flow-demo__step');

  // State
  var W, H;
  var phase = 0; // 0=upload, 1=route, 2=execute
  var animId = null;
  var flights = [];
  var lastSpawn = 0;

  // Colors
  var SENDER_COLOR = [24, 148, 232];
  var RECIPIENT_COLORS = [
    [0, 82, 255],    // Base
    [40, 160, 240],  // Arbitrum
    [98, 126, 234],  // Ethereum
    [255, 4, 32],    // Optimism
    [22, 199, 132],  // Sonic
  ];

  function resize() {
    var rect = demoEl.getBoundingClientRect();
    W = canvas.width = rect.width;
    H = canvas.height = rect.height;
  }

  function getCenter(el) {
    var demoRect = demoEl.getBoundingClientRect();
    var elRect = el.getBoundingClientRect();
    return {
      x: elRect.left + elRect.width / 2 - demoRect.left,
      y: elRect.top + elRect.height / 2 - demoRect.top,
    };
  }

  function getEdge(el, side) {
    var demoRect = demoEl.getBoundingClientRect();
    var elRect = el.getBoundingClientRect();
    var y = elRect.top + elRect.height / 2 - demoRect.top;
    if (side === 'right') return { x: elRect.right - demoRect.left + 2, y: y };
    return { x: elRect.left - demoRect.left - 2, y: y };
  }

  function bezier(t, p0, p1, p2, p3) {
    var u = 1 - t;
    return {
      x: u*u*u*p0.x + 3*u*u*t*p1.x + 3*u*t*t*p2.x + t*t*t*p3.x,
      y: u*u*u*p0.y + 3*u*u*t*p1.y + 3*u*t*t*p2.y + t*t*t*p3.y,
    };
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // Draw static connection paths
  function drawPaths(alpha) {
    if (alpha < 0.01) return;
    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 1;

    var hub = getCenter(hubEl);

    for (var si = 0; si < senderEls.length; si++) {
      var start = getEdge(senderEls[si], 'right');
      var dx = hub.x - start.x;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.bezierCurveTo(start.x + dx * 0.4, start.y, hub.x - dx * 0.3, hub.y, hub.x, hub.y);
      ctx.strokeStyle = 'rgba(24, 148, 232, ' + (alpha * 0.15) + ')';
      ctx.stroke();
    }

    for (var ri = 0; ri < recipientEls.length; ri++) {
      var end = getEdge(recipientEls[ri], 'left');
      var dx2 = end.x - hub.x;
      var c = RECIPIENT_COLORS[ri] || SENDER_COLOR;
      ctx.beginPath();
      ctx.moveTo(hub.x, hub.y);
      ctx.bezierCurveTo(hub.x + dx2 * 0.3, hub.y, end.x - dx2 * 0.4, end.y, end.x, end.y);
      ctx.strokeStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (alpha * 0.15) + ')';
      ctx.stroke();
    }

    ctx.setLineDash([]);
  }

  // Spawn a flight (token moving along path)
  function spawnFlight(type) {
    var hub = getCenter(hubEl);
    var start, end, color, idx;

    if (type === 'in') {
      idx = Math.floor(Math.random() * senderEls.length);
      start = getEdge(senderEls[idx], 'right');
      end = hub;
      color = SENDER_COLOR;
    } else {
      idx = Math.floor(Math.random() * recipientEls.length);
      start = hub;
      end = getEdge(recipientEls[idx], 'left');
      color = RECIPIENT_COLORS[idx] || SENDER_COLOR;
    }

    var dx = end.x - start.x;
    flights.push({
      type: type,
      start: start,
      end: end,
      cp1: { x: start.x + dx * 0.35, y: start.y + (Math.random() - 0.5) * 60 },
      cp2: { x: start.x + dx * 0.65, y: end.y + (Math.random() - 0.5) * 50 },
      progress: 0,
      speed: 0.005 + Math.random() * 0.003,
      color: color,
      radius: 3 + Math.random() * 2,
    });
  }

  // Draw flights
  function drawFlights() {
    for (var i = flights.length - 1; i >= 0; i--) {
      var f = flights[i];
      f.progress += f.speed;

      if (f.progress >= 1) {
        flights.splice(i, 1);
        continue;
      }

      var t = easeInOutCubic(f.progress);
      var pos = bezier(t, f.start, f.cp1, f.cp2, f.end);

      // Trail
      for (var s = 0; s < 8; s++) {
        var trailT = Math.max(0, t - s * 0.02);
        var tp = bezier(trailT, f.start, f.cp1, f.cp2, f.end);
        var alpha = (1 - s / 8) * 0.3;
        var r = f.radius - s * 0.3;
        if (r < 0.5) continue;
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + f.color[0] + ',' + f.color[1] + ',' + f.color[2] + ',' + alpha + ')';
        ctx.fill();
      }

      // Glow
      var opacity = 1;
      if (f.progress < 0.1) opacity = f.progress / 0.1;
      if (f.progress > 0.9) opacity = (1 - f.progress) / 0.1;

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, f.radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + f.color[0] + ',' + f.color[1] + ',' + f.color[2] + ',' + (opacity * 0.9) + ')';
      ctx.fill();

      // Outer glow
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, f.radius * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + f.color[0] + ',' + f.color[1] + ',' + f.color[2] + ',' + (opacity * 0.15) + ')';
      ctx.fill();
    }
  }

  // Set phase (0=upload, 1=route, 2=execute)
  function setPhase(p) {
    if (p === phase) return;
    phase = p;

    // Update step indicators
    for (var i = 0; i < stepEls.length; i++) {
      if (i <= p) {
        stepEls[i].classList.add('flow-demo__step--active');
      } else {
        stepEls[i].classList.remove('flow-demo__step--active');
      }
    }

    // Update node visibility
    for (var si = 0; si < senderEls.length; si++) {
      if (p >= 0) {
        senderEls[si].classList.add('is-active');
      } else {
        senderEls[si].classList.remove('is-active');
      }
    }
    for (var ri = 0; ri < recipientEls.length; ri++) {
      if (p >= 2) {
        recipientEls[ri].classList.add('is-active');
      } else {
        recipientEls[ri].classList.remove('is-active');
      }
    }
  }

  // Animation loop
  function animate() {
    resize();
    ctx.clearRect(0, 0, W, H);

    // Draw paths when in route or execute phase
    var pathAlpha = phase >= 1 ? 1 : 0;
    drawPaths(pathAlpha);

    // Spawn flights based on phase
    var now = performance.now();
    if (phase >= 1 && now - lastSpawn > 800) {
      if (phase === 1) {
        spawnFlight('in');
      } else if (phase >= 2) {
        if (Math.random() > 0.5) spawnFlight('in');
        else spawnFlight('out');
      }
      lastSpawn = now;
    }

    drawFlights();
    animId = requestAnimationFrame(animate);
  }

  // Expose setPhase for GSAP ScrollTrigger
  window.__flowDemoSetPhase = setPhase;

  // Initialize
  setPhase(0);
  resize();
  animate();

  // Cleanup on visibility change
  window.addEventListener('omniflow:visibility', function(e) {
    if (e.detail.hidden && animId) {
      cancelAnimationFrame(animId);
      animId = null;
    } else if (!e.detail.hidden && !animId) {
      animate();
    }
  });
})();
