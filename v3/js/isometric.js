/* OmniFlow Isometric Hero Animation
   Spawns glowing packets along SVG paths */
(function() {
  'use strict';

  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) return;

  var svg = document.querySelector('.hero__isometric');
  if (!svg) return;

  // Path IDs and their colors
  var pathConfigs = [
    { id: 'pathSrc1', color: '#1894E8' },
    { id: 'pathSrc2', color: '#1894E8' },
    { id: 'pathSrc3', color: '#1894E8' },
    { id: 'pathDst1', color: '#0052FF' },
    { id: 'pathDst2', color: '#28A0F0' },
    { id: 'pathDst3', color: '#627EEA' },
    { id: 'pathDst4', color: '#FF0420' },
    { id: 'pathDst5', color: '#E84142' },
  ];

  // Create packet using SVG animateMotion
  function spawnPacket() {
    var config = pathConfigs[Math.floor(Math.random() * pathConfigs.length)];
    var pathEl = document.getElementById(config.id);
    if (!pathEl) return;

    var ns = 'http://www.w3.org/2000/svg';
    var circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('r', '4');
    circle.setAttribute('fill', config.color);
    circle.setAttribute('opacity', '0.9');
    circle.classList.add('packet');

    // Glow via filter
    var filterId = 'pktGlow_' + Date.now() + Math.random();
    var filter = document.createElementNS(ns, 'filter');
    filter.setAttribute('id', filterId);
    filter.setAttribute('x', '-100%');
    filter.setAttribute('y', '-100%');
    filter.setAttribute('width', '300%');
    filter.setAttribute('height', '300%');
    var blur = document.createElementNS(ns, 'feGaussianBlur');
    blur.setAttribute('in', 'SourceGraphic');
    blur.setAttribute('stdDeviation', '3');
    filter.appendChild(blur);
    svg.querySelector('defs').appendChild(filter);

    circle.setAttribute('filter', 'url(#' + filterId + ')');

    // animateMotion
    var animMotion = document.createElementNS(ns, 'animateMotion');
    animMotion.setAttribute('dur', '2s');
    animMotion.setAttribute('repeatCount', '1');
    animMotion.setAttribute('fill', 'freeze');

    var mpath = document.createElementNS(ns, 'mpath');
    mpath.setAttributeNS('http://www.w3.org/1999/xlink', 'href', '#' + config.id);
    animMotion.appendChild(mpath);

    // Fade in/out via animate
    var animOpacity = document.createElementNS(ns, 'animate');
    animOpacity.setAttribute('attributeName', 'opacity');
    animOpacity.setAttribute('values', '0;0.9;0.9;0');
    animOpacity.setAttribute('keyTimes', '0;0.1;0.85;1');
    animOpacity.setAttribute('dur', '2s');
    animOpacity.setAttribute('fill', 'freeze');

    circle.appendChild(animMotion);
    circle.appendChild(animOpacity);
    svg.appendChild(circle);

    // Cleanup after animation
    setTimeout(function() {
      circle.remove();
      filter.remove();
    }, 2200);
  }

  // Spawn packets at intervals
  setInterval(spawnPacket, 1500);
  // Initial burst
  setTimeout(spawnPacket, 300);
  setTimeout(spawnPacket, 800);

  // ── HOVER INTERACTIONS ──

  // Highlight paths matching a data-group
  function highlightGroup(group, on) {
    var lines = document.querySelectorAll('.flow-line[data-group="' + group + '"]');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (on) {
        line.setAttribute('stroke-opacity', '0.9');
        line.setAttribute('stroke-width', '2.5');
        line.style.animationDuration = '0.4s';
      } else {
        line.setAttribute('stroke-opacity', '0.4');
        line.setAttribute('stroke-width', '1.5');
        line.style.animationDuration = '';
      }
    }
  }

  // Source cards hover
  var sourceCards = document.querySelectorAll('.source-card');
  for (var i = 0; i < sourceCards.length; i++) {
    (function(card) {
      var group = card.getAttribute('data-group');
      card.addEventListener('mouseenter', function() { highlightGroup(group, true); });
      card.addEventListener('mouseleave', function() { highlightGroup(group, false); });
      card.style.cursor = 'pointer';
    })(sourceCards[i]);
  }

  // Recipient cards hover
  var recipientCards = document.querySelectorAll('.recipient-card');
  for (var i = 0; i < recipientCards.length; i++) {
    (function(card) {
      var group = card.getAttribute('data-group');
      card.addEventListener('mouseenter', function() { highlightGroup(group, true); });
      card.addEventListener('mouseleave', function() { highlightGroup(group, false); });
      card.style.cursor = 'pointer';
    })(recipientCards[i]);
  }

  // Center engine hover — pulse all paths
  var center = document.getElementById('centerEngine');
  if (center) {
    center.style.cursor = 'pointer';
    center.addEventListener('mouseenter', function() {
      var lines = document.querySelectorAll('.flow-line');
      for (var j = 0; j < lines.length; j++) {
        lines[j].setAttribute('stroke-opacity', '0.8');
        lines[j].setAttribute('stroke-width', '2');
      }
    });
    center.addEventListener('mouseleave', function() {
      var lines = document.querySelectorAll('.flow-line');
      for (var j = 0; j < lines.length; j++) {
        lines[j].setAttribute('stroke-opacity', '0.4');
        lines[j].setAttribute('stroke-width', '1.5');
      }
    });
  }

})();
