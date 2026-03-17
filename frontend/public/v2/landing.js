  // ============================================
  // LANDING — CONFIGURATION
  // ============================================
  var LANDING_TOKENS_DEF = [
    { name: 'USDC', color: '#2775CA', icon: 'icons/tokens/usdc.svg' },
    { name: 'ETH',  color: '#627EEA', icon: 'icons/tokens/eth.svg' },
    { name: 'USDT', color: '#50AF95', icon: 'icons/tokens/usdt.svg' },
    { name: 'WBTC', color: '#F7931A', icon: 'icons/tokens/wbtc.svg' },
  ];

  var LANDING_CHAINS = [
    { name: 'Ethereum',  color: '#627EEA' },
    { name: 'Base',      color: '#0052FF' },
    { name: 'Arbitrum',  color: '#28A0F0' },
    { name: 'Optimism',  color: '#FF0420' },
    { name: 'Polygon',   color: '#8247E5' },
    { name: 'BNB Chain', color: '#F0B90B' },
  ];

  var LANDING_SENDERS = [
    { chain: 0 },
    { chain: 2 },
    { chain: 1 },
  ];

  var LANDING_RECIPIENTS = [
    { chain: 3, token: 0 },
    { chain: 4, token: 2 },
    { chain: 5, token: 1 },
  ];

  var LANDING_PAYOUT_COMBOS = [
    { token: 0, chain: 3, recipIdx: 0 },
    { token: 2, chain: 4, recipIdx: 1 },
    { token: 1, chain: 1, recipIdx: 2 },
    { token: 0, chain: 2, recipIdx: 0 },
    { token: 0, chain: 5, recipIdx: 2 },
    { token: 1, chain: 0, recipIdx: 1 },
    { token: 2, chain: 3, recipIdx: 0 },
    { token: 0, chain: 4, recipIdx: 1 },
  ];

  var LANDING_POOL_SIZE = 16;

  // Avatar icon mapping for flow nodes
  var LANDING_SENDER_ICONS = [
    'icons/chains/eth_chain.svg',
    'icons/chains/arb.svg',
    'icons/chains/base.svg',
  ];

  var LANDING_RECIPIENT_ICONS = [
    'icons/chains/optimism.svg',
    'icons/chains/polygon.svg',
    'icons/chains/bnb.svg',
  ];

  // ============================================
  // LANDING — STATE
  // ============================================
  var _landing = {
    active: false,
    flowActivated: false,
    pathsVisible: false,
    pathAlpha: 0,
    pool: [],
    flights: [],
    payInTimer: null,
    payOutTimer: null,
    animFrame: null,
    observer: null,
    hubClickHandler: null,
    spotlightHandlers: [],
    resizeHandler: null,
    // DOM refs (populated in init)
    flowSection: null,
    flowArea: null,
    canvas: null,
    ctx: null,
    hubEl: null,
    hubPulse: null,
    ripples: [],
    labelIn: null,
    labelOut: null,
    hubBubble: null,
    tokenPoolEl: null,
    senderNodes: null,
    recipientNodes: null,
    spawnTimeouts: [],
  };

  // ============================================
  // LANDING — INIT
  // ============================================
  function landingInit() {
    if (_landing.active) return;
    _landing.active = true;
    _landing.flowActivated = false;
    _landing.pathsVisible = false;
    _landing.pathAlpha = 0;
    _landing.pool = [];
    _landing.flights = [];
    _landing.spawnTimeouts = [];

    // Populate node avatar icons via ICON_MAP
    var section = document.getElementById('view-landing');
    var senderAvatars = section.querySelectorAll('.flow-senders .node-avatar');
    senderAvatars.forEach(function(img, i) {
      img.src = resolveIcon(LANDING_SENDER_ICONS[i]);
    });
    var recipientAvatars = section.querySelectorAll('.flow-recipients .node-avatar');
    recipientAvatars.forEach(function(img, i) {
      img.src = resolveIcon(LANDING_RECIPIENT_ICONS[i]);
    });

    // DOM refs
    _landing.flowSection = document.getElementById('landingFlowSection');
    _landing.flowArea = document.getElementById('landingFlowArea');
    _landing.canvas = document.getElementById('landingFlowCanvas');
    _landing.ctx = _landing.canvas.getContext('2d');
    _landing.hubEl = document.getElementById('landingHub');
    _landing.hubPulse = document.getElementById('landingHubPulse');
    _landing.ripples = [
      document.getElementById('landingRipple1'),
      document.getElementById('landingRipple2'),
      document.getElementById('landingRipple3')
    ];
    _landing.labelIn = document.getElementById('landingLabelIn');
    _landing.labelOut = document.getElementById('landingLabelOut');
    _landing.hubBubble = document.getElementById('landingHubBubble');
    _landing.tokenPoolEl = document.getElementById('landingTokenPool');
    _landing.senderNodes = _landing.flowSection.querySelectorAll('.flow-node.sender');
    _landing.recipientNodes = _landing.flowSection.querySelectorAll('.flow-node.recipient');

    // Reset visibility classes
    _landing.senderNodes.forEach(function(n) { n.classList.remove('visible'); });
    _landing.recipientNodes.forEach(function(n) { n.classList.remove('visible', 'receiving'); });
    _landing.hubEl.classList.remove('visible');
    _landing.labelIn.classList.remove('visible');
    _landing.labelOut.classList.remove('visible');
    _landing.hubBubble.classList.remove('visible', 'hidden');

    // Create token pool
    _landing.tokenPoolEl.innerHTML = '';
    for (var i = 0; i < LANDING_POOL_SIZE; i++) {
      _landing.pool.push(landingCreateToken());
    }

    // Canvas sizing
    landingResizeCanvas();
    _landing.resizeHandler = landingResizeCanvas;
    window.addEventListener('resize', _landing.resizeHandler);

    // Start animation loop
    landingAnimate();

    // IntersectionObserver
    _landing.observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          landingActivateFlow();
        }
      });
    }, { threshold: 0.25 });
    _landing.observer.observe(_landing.flowSection);

    // Hub click
    _landing.hubClickHandler = landingManualBurst;
    _landing.hubEl.addEventListener('click', _landing.hubClickHandler);

    // Feature card + landing card spotlight
    _landing.spotlightHandlers = [];
    section.querySelectorAll('.feature-card, .landing-cards .card').forEach(function(card) {
      var handler = function(e) {
        var rect = card.getBoundingClientRect();
        card.style.setProperty('--mouse-x', (e.clientX - rect.left) + 'px');
        card.style.setProperty('--mouse-y', (e.clientY - rect.top) + 'px');
      };
      card.addEventListener('mousemove', handler);
      _landing.spotlightHandlers.push({ el: card, handler: handler });
    });
  }

  // ============================================
  // LANDING — CLEANUP
  // ============================================
  function landingCleanup() {
    if (!_landing.active) return;
    _landing.active = false;

    // Cancel animation frame
    if (_landing.animFrame) {
      cancelAnimationFrame(_landing.animFrame);
      _landing.animFrame = null;
    }

    // Clear timers
    if (_landing.payInTimer) { clearTimeout(_landing.payInTimer); _landing.payInTimer = null; }
    if (_landing.payOutTimer) { clearTimeout(_landing.payOutTimer); _landing.payOutTimer = null; }

    // Clear spawn timeouts
    _landing.spawnTimeouts.forEach(function(t) { clearTimeout(t); });
    _landing.spawnTimeouts = [];

    // Remove observer
    if (_landing.observer) {
      _landing.observer.disconnect();
      _landing.observer = null;
    }

    // Remove event listeners
    if (_landing.hubClickHandler && _landing.hubEl) {
      _landing.hubEl.removeEventListener('click', _landing.hubClickHandler);
      _landing.hubClickHandler = null;
    }

    if (_landing.resizeHandler) {
      window.removeEventListener('resize', _landing.resizeHandler);
      _landing.resizeHandler = null;
    }

    _landing.spotlightHandlers.forEach(function(item) {
      item.el.removeEventListener('mousemove', item.handler);
    });
    _landing.spotlightHandlers = [];

    // Clean up token pool DOM
    if (_landing.tokenPoolEl) _landing.tokenPoolEl.innerHTML = '';
    _landing.pool = [];
    _landing.flights = [];

    // Reset state
    _landing.flowActivated = false;
    _landing.pathsVisible = false;
    _landing.pathAlpha = 0;
  }

  // ============================================
  // LANDING — TOKEN POOL
  // ============================================
  function landingCreateToken() {
    var el = document.createElement('div');
    el.className = 'flying-token';
    el.innerHTML = '<img class="flying-token-icon" src="" alt=""><div class="flying-token-label"></div>';
    el.style.opacity = '0';
    _landing.tokenPoolEl.appendChild(el);
    return { el: el, active: false, progress: 0 };
  }

  function landingAcquireToken() {
    var t = _landing.pool.find(function(t) { return !t.active; });
    if (!t) { t = landingCreateToken(); _landing.pool.push(t); }
    t.active = true;
    t.progress = 0;
    return t;
  }

  function landingReleaseToken(t) {
    t.active = false;
    t.el.style.opacity = '0';
  }

  // ============================================
  // LANDING — CANVAS SIZING
  // ============================================
  function landingResizeCanvas() {
    if (!_landing.flowArea || !_landing.canvas) return;
    var rect = _landing.flowArea.getBoundingClientRect();
    _landing.canvas.width = rect.width;
    _landing.canvas.height = rect.height;
  }

  // ============================================
  // LANDING — POSITION HELPERS
  // ============================================
  function landingGetNodeCenter(nodeEl) {
    var areaRect = _landing.flowArea.getBoundingClientRect();
    var nodeRect = nodeEl.getBoundingClientRect();
    return {
      x: nodeRect.left + nodeRect.width / 2 - areaRect.left,
      y: nodeRect.top + nodeRect.height / 2 - areaRect.top,
    };
  }

  function landingGetNodeEdge(nodeEl, side) {
    var areaRect = _landing.flowArea.getBoundingClientRect();
    var nodeRect = nodeEl.getBoundingClientRect();
    var y = nodeRect.top + nodeRect.height / 2 - areaRect.top;
    if (side === 'right') {
      return { x: nodeRect.right - areaRect.left + 4, y: y };
    }
    return { x: nodeRect.left - areaRect.left - 4, y: y };
  }

  function landingGetHubCenter() {
    return landingGetNodeCenter(_landing.hubEl);
  }

  // ============================================
  // LANDING — BEZIER
  // ============================================
  function landingBezier(t, p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y) {
    var u = 1 - t;
    return {
      x: u*u*u*p0x + 3*u*u*t*p1x + 3*u*t*t*p2x + t*t*t*p3x,
      y: u*u*u*p0y + 3*u*u*t*p1y + 3*u*t*t*p2y + t*t*t*p3y,
    };
  }

  function landingEaseInOutCubic(t) {
    return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
  }

  // ============================================
  // LANDING — FLIGHTS
  // ============================================
  function landingSpawnPayIn() {
    if (!_landing.active) return;
    var sIdx = Math.floor(Math.random() * LANDING_SENDERS.length);
    var tIdx = Math.floor(Math.random() * LANDING_TOKENS_DEF.length);
    var sender = LANDING_SENDERS[sIdx];
    var tokenDef = LANDING_TOKENS_DEF[tIdx];
    var chain = LANDING_CHAINS[sender.chain];

    var token = landingAcquireToken();
    token.el.style.border = 'none';
    token.el.querySelector('.flying-token-icon').src = resolveIcon(tokenDef.icon);
    token.el.querySelector('.flying-token-label').textContent = tokenDef.name;

    var start = landingGetNodeEdge(_landing.senderNodes[sIdx], 'right');
    var end = landingGetHubCenter();
    var dx = end.x - start.x;

    _landing.flights.push({
      token: token,
      type: 'payin',
      startX: start.x, startY: start.y,
      endX: end.x, endY: end.y,
      cp1x: start.x + dx * 0.35,
      cp1y: start.y + (Math.random() - 0.5) * 90,
      cp2x: start.x + dx * 0.65,
      cp2y: end.y + (Math.random() - 0.5) * 70,
      speed: 0.004 + Math.random() * 0.002,
      progress: 0,
      chainColor: chain.color,
    });
  }

  function landingSpawnPayOut() {
    if (!_landing.active) return;
    var count = 3 + Math.floor(Math.random() * 2);
    var shuffled = LANDING_PAYOUT_COMBOS.slice().sort(function() { return Math.random() - 0.5; });
    var batch = shuffled.slice(0, count);

    batch.forEach(function(combo, i) {
      var tid = setTimeout(function() {
        if (!_landing.active) return;
        var tokenDef = LANDING_TOKENS_DEF[combo.token];
        var chain = LANDING_CHAINS[combo.chain];

        var token = landingAcquireToken();
        token.el.style.border = 'none';
        token.el.querySelector('.flying-token-icon').src = resolveIcon(tokenDef.icon);
        token.el.querySelector('.flying-token-label').textContent = tokenDef.name;

        var start = landingGetHubCenter();
        var end = landingGetNodeEdge(_landing.recipientNodes[combo.recipIdx], 'left');
        var dx = end.x - start.x;

        _landing.flights.push({
          token: token,
          type: 'payout',
          recipIdx: combo.recipIdx,
          startX: start.x, startY: start.y,
          endX: end.x, endY: end.y,
          cp1x: start.x + dx * 0.35,
          cp1y: start.y + (Math.random() - 0.5) * 80,
          cp2x: start.x + dx * 0.65,
          cp2y: end.y + (Math.random() - 0.5) * 70,
          speed: 0.003 + Math.random() * 0.0015,
          progress: 0,
          chainColor: chain.color,
        });
      }, i * 200);
      _landing.spawnTimeouts.push(tid);
    });
  }

  // ============================================
  // LANDING — ARRIVAL CALLBACKS
  // ============================================
  function landingTriggerRipples() {
    _landing.ripples.forEach(function(r, i) {
      r.style.animation = 'none';
      void r.offsetWidth;
      r.style.animation = 'landingRippleWave ' + (0.8 + i * 0.2) + 's ease-out ' + (i * 0.12) + 's forwards';
    });
  }

  function landingOnPayInArrive() {
    _landing.hubPulse.classList.remove('active');
    void _landing.hubPulse.offsetWidth;
    _landing.hubPulse.classList.add('active');
  }

  function landingOnPayOutArrive(recipIdx) {
    var node = _landing.recipientNodes[recipIdx];
    node.classList.add('receiving');
    var tid = setTimeout(function() { node.classList.remove('receiving'); }, 500);
    _landing.spawnTimeouts.push(tid);
  }

  // ============================================
  // LANDING — CANVAS: CONNECTION PATHS
  // ============================================
  function landingDrawPaths() {
    var ctx = _landing.ctx;
    if (_landing.pathAlpha < 0.001) return;

    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 1;

    _landing.senderNodes.forEach(function(node) {
      var start = landingGetNodeEdge(node, 'right');
      var end = landingGetHubCenter();
      var dx = end.x - start.x;

      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.bezierCurveTo(
        start.x + dx * 0.4, start.y,
        end.x - dx * 0.3, end.y,
        end.x, end.y
      );
      ctx.strokeStyle = 'rgba(24, 148, 232, ' + (_landing.pathAlpha * 0.1) + ')';
      ctx.stroke();
    });

    _landing.recipientNodes.forEach(function(node) {
      var start = landingGetHubCenter();
      var end = landingGetNodeEdge(node, 'left');
      var dx = end.x - start.x;

      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.bezierCurveTo(
        start.x + dx * 0.3, start.y,
        end.x - dx * 0.4, end.y,
        end.x, end.y
      );
      ctx.strokeStyle = 'rgba(159, 114, 255, ' + (_landing.pathAlpha * 0.1) + ')';
      ctx.stroke();
    });

    ctx.setLineDash([]);
  }

  // ============================================
  // LANDING — CANVAS: TRAILS
  // ============================================
  function landingDrawTrail(flight, eased) {
    var ctx = _landing.ctx;
    var steps = 10;
    var stepSize = 0.025;
    var baseColor = flight.type === 'payin'
      ? [24, 148, 232]
      : [159, 114, 255];

    for (var s = 0; s < steps; s++) {
      var trailT = Math.max(0, eased - s * stepSize);
      var pos = landingBezier(trailT,
        flight.startX, flight.startY,
        flight.cp1x, flight.cp1y,
        flight.cp2x, flight.cp2y,
        flight.endX, flight.endY
      );
      var alpha = (1 - s / steps) * 0.2;
      var radius = 3 - s * 0.3;

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, Math.max(1, radius), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + baseColor[0] + ', ' + baseColor[1] + ', ' + baseColor[2] + ', ' + alpha + ')';
      ctx.fill();
    }
  }

  // ============================================
  // LANDING — ANIMATION LOOP
  // ============================================
  function landingAnimate() {
    if (!_landing.active) return;

    landingResizeCanvas();
    var ctx = _landing.ctx;
    ctx.clearRect(0, 0, _landing.canvas.width, _landing.canvas.height);

    if (_landing.pathsVisible && _landing.pathAlpha < 1) _landing.pathAlpha += 0.02;
    landingDrawPaths();

    for (var i = _landing.flights.length - 1; i >= 0; i--) {
      var f = _landing.flights[i];
      f.progress += f.speed;

      if (f.progress >= 1) {
        if (f.type === 'payin') landingOnPayInArrive();
        else landingOnPayOutArrive(f.recipIdx);
        landingReleaseToken(f.token);
        _landing.flights.splice(i, 1);
        continue;
      }

      var t = f.progress;
      var eased = landingEaseInOutCubic(t);

      var pos = landingBezier(eased,
        f.startX, f.startY,
        f.cp1x, f.cp1y,
        f.cp2x, f.cp2y,
        f.endX, f.endY
      );

      var scale = 1;
      var opacity = 1;
      if (t < 0.1) {
        scale = t / 0.1;
        opacity = scale;
      }
      if (f.type === 'payin' && t > 0.85) {
        var fade = (t - 0.85) / 0.15;
        scale = 1 - fade * 0.5;
        opacity = 1 - fade;
      }
      if (f.type === 'payout' && t > 0.9) {
        opacity = 1 - (t - 0.9) / 0.1;
      }

      f.token.el.style.transform = 'translate(' + (pos.x - 16) + 'px, ' + (pos.y - 16) + 'px) scale(' + scale + ')';
      f.token.el.style.opacity = Math.max(0, opacity);

      landingDrawTrail(f, eased);
    }

    _landing.animFrame = requestAnimationFrame(landingAnimate);
  }

  // ============================================
  // LANDING — SCROLL TRIGGER
  // ============================================
  function landingActivateFlow() {
    if (_landing.flowActivated || !_landing.active) return;
    _landing.flowActivated = true;

    _landing.senderNodes.forEach(function(node, i) {
      var tid = setTimeout(function() { node.classList.add('visible'); }, i * 120);
      _landing.spawnTimeouts.push(tid);
    });

    var tid1 = setTimeout(function() { _landing.hubEl.classList.add('visible'); }, 200);
    _landing.spawnTimeouts.push(tid1);

    _landing.recipientNodes.forEach(function(node, i) {
      var tid = setTimeout(function() { node.classList.add('visible'); }, 350 + i * 120);
      _landing.spawnTimeouts.push(tid);
    });

    var tid2 = setTimeout(function() {
      if (!_landing.active) return;
      _landing.pathsVisible = true;
      _landing.labelIn.classList.add('visible');
      _landing.hubBubble.classList.add('visible');
    }, 800);
    _landing.spawnTimeouts.push(tid2);

    var tid3 = setTimeout(function() {
      if (!_landing.active) return;
      landingStartPayInLoop();
    }, 1000);
    _landing.spawnTimeouts.push(tid3);

    var tid4 = setTimeout(function() {
      if (!_landing.active) return;
      _landing.labelOut.classList.add('visible');
      landingStartPayOutLoop();
    }, 3000);
    _landing.spawnTimeouts.push(tid4);
  }

  function landingStartPayInLoop() {
    if (!_landing.active) return;
    landingSpawnPayIn();
    landingSchedulePayIn();
  }

  function landingSchedulePayIn() {
    if (!_landing.active) return;
    _landing.payInTimer = setTimeout(function() {
      if (!_landing.active) return;
      landingSpawnPayIn();
      landingSchedulePayIn();
    }, 2500 + Math.random() * 1500);
  }

  function landingStartPayOutLoop() {
    if (!_landing.active) return;
    landingSpawnPayOut();
    landingSchedulePayOut();
  }

  function landingSchedulePayOut() {
    if (!_landing.active) return;
    _landing.payOutTimer = setTimeout(function() {
      if (!_landing.active) return;
      landingSpawnPayOut();
      landingSchedulePayOut();
    }, 5000 + Math.random() * 2000);
  }

  function landingManualBurst() {
    landingTriggerRipples();
    landingSpawnPayOut();
    _landing.hubBubble.classList.add('hidden');
    _landing.hubBubble.classList.remove('visible');
  }
