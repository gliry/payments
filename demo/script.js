/* ============================================
   OmniFlow Landing Page — Interactions
   ============================================ */

(function () {
  'use strict';

  /* --- URL Params: Video & Autoscroll modes --- */
  const params = new URLSearchParams(window.location.search);
  const isVideoMode = params.get('video') === 'true';
  const isAutoScroll = params.get('autoscroll') === 'true';

  if (isVideoMode) {
    document.body.classList.add('video-mode');
  }

  /* --- 1. Particle Canvas Background --- */
  const canvas = document.getElementById('particle-canvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    const particles = [];
    const PARTICLE_COUNT = 45;
    const COLORS = ['#1894E8', '#9F72FF', '#62E2A4', '#627eea', '#0052ff'];

    function resizeCanvas() {
      const hero = canvas.parentElement;
      canvas.width = hero.offsetWidth;
      canvas.height = hero.offsetHeight;
    }

    function createParticle() {
      return {
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 3 + 1.5,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        opacity: Math.random() * 0.04 + 0.08,
      };
    }

    function initParticles() {
      particles.length = 0;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push(createParticle());
      }
    }

    function drawParticles() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.opacity;
        ctx.fill();

        // Connection lines
        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j];
          const dx = p.x - q.x;
          const dy = p.y - q.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.strokeStyle = p.color;
            ctx.globalAlpha = (1 - dist / 150) * 0.06;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(drawParticles);
    }

    resizeCanvas();
    initParticles();
    drawParticles();
    window.addEventListener('resize', () => {
      resizeCanvas();
      initParticles();
    });
  }

  /* --- 2. Intersection Observer — scroll reveal --- */
  if (isVideoMode) {
    // Video mode: reveal everything immediately
    document.querySelectorAll('.reveal').forEach((el) => {
      el.classList.add('revealed');
    });
  } else {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    document.querySelectorAll('.reveal').forEach((el) => {
      revealObserver.observe(el);
    });
  }

  /* --- 3. Counter Animations --- */
  function animateCounter(el, target, duration) {
    const suffix = el.getAttribute('data-suffix') || '';
    const prefix = el.getAttribute('data-prefix');
    const start = performance.now();

    function update(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(eased * target);

      el.textContent = (prefix !== null ? prefix : '') + current.toLocaleString() + suffix;

      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }

    requestAnimationFrame(update);
  }

  if (isVideoMode) {
    // Instantly set counter values
    document.querySelectorAll('.counter').forEach((el) => {
      const target = parseInt(el.getAttribute('data-target'), 10);
      const suffix = el.getAttribute('data-suffix') || '';
      const prefix = el.getAttribute('data-prefix');
      el.textContent = (prefix !== null ? prefix : '') + target.toLocaleString() + suffix;
    });
  } else {
    const counterObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target;
            const target = parseInt(el.getAttribute('data-target'), 10);
            animateCounter(el, target, 1500);
            counterObserver.unobserve(el);
          }
        });
      },
      { threshold: 0.5 }
    );

    document.querySelectorAll('.counter').forEach((el) => {
      counterObserver.observe(el);
    });
  }

  /* --- 4. Nav scroll --- */
  const nav = document.querySelector('.nav');
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav__links a');

  function onScroll() {
    const scrollY = window.scrollY;

    if (scrollY > 20) {
      nav.classList.add('nav--scrolled');
    } else {
      nav.classList.remove('nav--scrolled');
    }

    let current = '';
    sections.forEach((section) => {
      const top = section.offsetTop - 120;
      if (scrollY >= top) {
        current = section.getAttribute('id');
      }
    });

    navLinks.forEach((link) => {
      link.classList.remove('active');
      if (link.getAttribute('href') === '#' + current) {
        link.classList.add('active');
      }
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* --- 5. Smooth scroll for anchor links --- */
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', function (e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        const offset = 72;
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });

  /* --- Helper: Instant fill code block --- */
  function instantFillCodeBlock(container, segments, prefix) {
    segments.forEach((seg, i) => {
      const span = document.createElement('span');
      span.className = seg.cls;
      span.setAttribute('data-seg', (prefix || '') + i);
      span.textContent = seg.text;
      container.appendChild(span);
    });
    const cursor = document.createElement('span');
    cursor.className = 'cursor';
    container.appendChild(cursor);
  }

  /* --- 6. Typewriter effect for API code block --- */
  const codeBlock = document.getElementById('typewriter-code');
  if (codeBlock) {
    const codeLines = [
      { text: 'import', cls: 'kw' },
      { text: ' { OmniFlow } ', cls: 'op' },
      { text: 'from', cls: 'kw' },
      { text: " '@omniflow/sdk'", cls: 'str' },
      { text: ';\n\n', cls: 'op' },
      { text: '// Batch payout across chains', cls: 'cm' },
      { text: '\n', cls: 'op' },
      { text: 'const', cls: 'kw' },
      { text: ' payouts = ', cls: 'op' },
      { text: 'await', cls: 'kw' },
      { text: ' omni.', cls: 'op' },
      { text: 'batchPayout', cls: 'fn' },
      { text: '({\n', cls: 'op' },
      { text: '  source: ', cls: 'op' },
      { text: "'ethereum'", cls: 'str' },
      { text: ',\n', cls: 'op' },
      { text: '  recipients: [\n', cls: 'op' },
      { text: '    { to: ', cls: 'op' },
      { text: "'vitalik.eth'", cls: 'str' },
      { text: ',  chain: ', cls: 'op' },
      { text: "'base'", cls: 'str' },
      { text: ',     amount: ', cls: 'op' },
      { text: '1000', cls: 'num' },
      { text: ' },\n', cls: 'op' },
      { text: '    { to: ', cls: 'op' },
      { text: "'alice.eth'", cls: 'str' },
      { text: ',    chain: ', cls: 'op' },
      { text: "'arbitrum'", cls: 'str' },
      { text: ',  amount: ', cls: 'op' },
      { text: '2500', cls: 'num' },
      { text: ' },\n', cls: 'op' },
      { text: '    { to: ', cls: 'op' },
      { text: "'bob.eth'", cls: 'str' },
      { text: ',      chain: ', cls: 'op' },
      { text: "'polygon'", cls: 'str' },
      { text: ',   amount: ', cls: 'op' },
      { text: '500', cls: 'num' },
      { text: '  },\n', cls: 'op' },
      { text: '  ],\n', cls: 'op' },
      { text: '  token: ', cls: 'op' },
      { text: "'USDC'", cls: 'str' },
      { text: ',\n', cls: 'op' },
      { text: '  gasless: ', cls: 'op' },
      { text: 'true', cls: 'kw' },
      { text: ',\n', cls: 'op' },
      { text: '});\n', cls: 'op' },
    ];

    if (isVideoMode) {
      instantFillCodeBlock(codeBlock, codeLines, '');
    } else {
      let typed = false;
      let charIndex = 0;
      let segmentIndex = 0;

      function typeNext() {
        if (segmentIndex >= codeLines.length) {
          const cursor = document.createElement('span');
          cursor.className = 'cursor';
          codeBlock.appendChild(cursor);
          return;
        }

        const seg = codeLines[segmentIndex];
        const char = seg.text[charIndex];

        let span = codeBlock.querySelector('[data-seg="' + segmentIndex + '"]');
        if (!span) {
          span = document.createElement('span');
          span.className = seg.cls;
          span.setAttribute('data-seg', segmentIndex);
          codeBlock.appendChild(span);
        }

        span.textContent += char;
        charIndex++;

        if (charIndex >= seg.text.length) {
          segmentIndex++;
          charIndex = 0;
        }

        const delay = char === '\n' ? 15 : char === ' ' ? 5 : 8;
        setTimeout(typeNext, delay);
      }

      const typeObserver = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && !typed) {
            typed = true;
            typeNext();
            typeObserver.unobserve(codeBlock);
          }
        },
        { threshold: 0.3 }
      );

      typeObserver.observe(codeBlock);
    }
  }

  /* --- 7. Typewriter for SDK code block --- */
  const sdkBlock = document.getElementById('typewriter-code-sdk');
  if (sdkBlock) {
    const sdkLines = [
      { text: 'import', cls: 'kw' },
      { text: ' { OmniFlow } ', cls: 'op' },
      { text: 'from', cls: 'kw' },
      { text: " '@omniflow/sdk'", cls: 'str' },
      { text: ';\n\n', cls: 'op' },
      { text: '// Passkey account creation', cls: 'cm' },
      { text: '\n', cls: 'op' },
      { text: 'const', cls: 'kw' },
      { text: ' account = ', cls: 'op' },
      { text: 'await', cls: 'kw' },
      { text: ' omniflow.', cls: 'op' },
      { text: 'createAccount', cls: 'fn' },
      { text: '({\n', cls: 'op' },
      { text: '  passkey: ', cls: 'op' },
      { text: 'true', cls: 'kw' },
      { text: ',\n', cls: 'op' },
      { text: '});\n\n', cls: 'op' },
      { text: 'await', cls: 'kw' },
      { text: ' omniflow.', cls: 'op' },
      { text: 'payout', cls: 'fn' },
      { text: '({\n', cls: 'op' },
      { text: '  to: ', cls: 'op' },
      { text: "'alice.eth'", cls: 'str' },
      { text: ',\n', cls: 'op' },
      { text: '  amount: ', cls: 'op' },
      { text: "'500'", cls: 'str' },
      { text: ',\n', cls: 'op' },
      { text: '  chain: ', cls: 'op' },
      { text: "'base'", cls: 'str' },
      { text: ',\n', cls: 'op' },
      { text: '});\n', cls: 'op' },
    ];

    if (isVideoMode) {
      instantFillCodeBlock(sdkBlock, sdkLines, 'sdk');
    } else {
      let sdkTyped = false;
      let sdkCharIndex = 0;
      let sdkSegIndex = 0;

      function typeSdkNext() {
        if (sdkSegIndex >= sdkLines.length) {
          const cursor = document.createElement('span');
          cursor.className = 'cursor';
          sdkBlock.appendChild(cursor);
          return;
        }

        const seg = sdkLines[sdkSegIndex];
        const char = seg.text[sdkCharIndex];

        let span = sdkBlock.querySelector('[data-seg="sdk' + sdkSegIndex + '"]');
        if (!span) {
          span = document.createElement('span');
          span.className = seg.cls;
          span.setAttribute('data-seg', 'sdk' + sdkSegIndex);
          sdkBlock.appendChild(span);
        }

        span.textContent += char;
        sdkCharIndex++;

        if (sdkCharIndex >= seg.text.length) {
          sdkSegIndex++;
          sdkCharIndex = 0;
        }

        const delay = char === '\n' ? 15 : char === ' ' ? 5 : 8;
        setTimeout(typeSdkNext, delay);
      }

      const sdkTypeObserver = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && !sdkTyped) {
            sdkTyped = true;
            typeSdkNext();
            sdkTypeObserver.unobserve(sdkBlock);
          }
        },
        { threshold: 0.3 }
      );

      sdkTypeObserver.observe(sdkBlock);
    }
  }

  /* --- 8. Architecture — highlight all modules at once (no cycling) --- */
  const inputModules = document.querySelectorAll('.arch-input .arch-module');
  const outputModules = document.querySelectorAll('.arch-output .arch-module');
  const archTags = document.querySelectorAll('.arch-tag');

  function highlightAllModules() {
    inputModules.forEach((m) => m.classList.add('active'));
    outputModules.forEach((m) => m.classList.add('active'));
    archTags.forEach((t) => t.classList.add('active'));
  }

  if (inputModules.length > 0) {
    if (isVideoMode) {
      highlightAllModules();
    } else {
      const archObserver = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) {
            highlightAllModules();
            archObserver.unobserve(entries[0].target);
          }
        },
        { threshold: 0.3 }
      );
      const archSection = document.getElementById('architecture');
      if (archSection) archObserver.observe(archSection);
    }
  }

  /* --- 9. Solution — USDC tokens fly to hub (cycling) --- */
  const convergenceVisual = document.getElementById('convergence-visual');
  if (convergenceVisual) {
    const usdcTokens = convergenceVisual.querySelectorAll('.usdc-fly');
    var FLIGHT_DURATION = 3000;
    var STAGGER = 400;

    function animateToken(token, delay) {
      var from = token.getAttribute('data-from').split(',');
      var to = token.getAttribute('data-to').split(',');
      var startX = parseFloat(from[0]);
      var startY = parseFloat(from[1]);
      var endX = parseFloat(to[0]);
      var endY = parseFloat(to[1]);

      setTimeout(function () {
        token.setAttribute('x', startX);
        token.setAttribute('y', startY);
        token.style.opacity = '1';

        var start = performance.now();
        function step(now) {
          var t = Math.min((now - start) / FLIGHT_DURATION, 1);
          // ease-in-out
          var ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          var x = startX + (endX - startX) * ease;
          var y = startY + (endY - startY) * ease;
          token.setAttribute('x', x);
          token.setAttribute('y', y);
          token.style.opacity = t < 0.9 ? '1' : String(1 - (t - 0.9) / 0.1);

          if (t < 1) {
            requestAnimationFrame(step);
          } else {
            token.style.opacity = '0';
          }
        }
        requestAnimationFrame(step);
      }, delay);
    }

    function flyAllTokens() {
      usdcTokens.forEach(function (token, i) {
        animateToken(token, i * STAGGER);
      });
      // Total cycle: last token starts + flight duration + small gap
      var totalCycle = (usdcTokens.length - 1) * STAGGER + FLIGHT_DURATION + 500;
      setTimeout(flyAllTokens, totalCycle);
    }

    if (isVideoMode) {
      flyAllTokens();
    } else {
      var convObserver = new IntersectionObserver(
        function (entries) {
          if (entries[0].isIntersecting) {
            flyAllTokens();
            convObserver.unobserve(convergenceVisual);
          }
        },
        { threshold: 0.3 }
      );
      convObserver.observe(convergenceVisual);
    }
  }

  /* --- 10. Batch demo animation --- */
  const batchTable = document.getElementById('batch-table');
  const batchTimerEl = document.getElementById('batch-timer-value');
  if (batchTable) {
    const rows = batchTable.querySelectorAll('.batch-row');
    let batchAnimated = false;

    function animateBatchTimer() {
      if (!batchTimerEl) return;
      const startTime = performance.now();
      const targetTime = 3.2;

      function updateTimer() {
        const elapsed = (performance.now() - startTime) / 1000;
        const display = Math.min(elapsed, targetTime);
        batchTimerEl.textContent = display.toFixed(1) + 's';
        if (elapsed < targetTime) {
          requestAnimationFrame(updateTimer);
        } else {
          batchTimerEl.textContent = targetTime.toFixed(1) + 's';
        }
      }

      requestAnimationFrame(updateTimer);
    }

    function animateBatchRows() {
      animateBatchTimer();

      rows.forEach((row, i) => {
        const statusEl = row.querySelector('.batch-row__status');

        // Show row with stagger (300ms)
        setTimeout(() => {
          row.classList.add('batch-row--visible');
        }, i * 300);

        // Processing state (400ms after show)
        setTimeout(() => {
          statusEl.setAttribute('data-status', 'processing');
          statusEl.textContent = 'Processing';
        }, i * 300 + 400);

        // Confirmed state (800ms after show)
        setTimeout(() => {
          statusEl.setAttribute('data-status', 'confirmed');
          statusEl.textContent = 'Confirmed';
        }, i * 300 + 800);
      });
    }

    if (isVideoMode) {
      // Instantly show all rows as confirmed
      rows.forEach((row) => {
        row.classList.add('batch-row--visible');
        const statusEl = row.querySelector('.batch-row__status');
        statusEl.setAttribute('data-status', 'confirmed');
        statusEl.textContent = 'Confirmed';
      });
      if (batchTimerEl) batchTimerEl.textContent = '3.2s';
    } else {
      const batchObserver = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && !batchAnimated) {
            batchAnimated = true;
            animateBatchRows();
            batchObserver.unobserve(batchTable);
          }
        },
        { threshold: 0.3 }
      );

      batchObserver.observe(batchTable);
    }
  }

  /* --- 11. Autoscroll mode --- */
  if (isAutoScroll) {
    const allSections = document.querySelectorAll('section[id]');
    const SECONDS_PER_SECTION = 5;
    let currentSection = 0;

    function scrollToNextSection() {
      if (currentSection >= allSections.length) return;
      const target = allSections[currentSection];
      const offset = 72;
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
      currentSection++;

      if (currentSection < allSections.length) {
        setTimeout(scrollToNextSection, SECONDS_PER_SECTION * 1000);
      }
    }

    // Start autoscroll after a brief delay
    setTimeout(scrollToNextSection, SECONDS_PER_SECTION * 1000);
  }

  /* --- 12. Keyboard navigation (ArrowDown / ArrowUp) --- */
  const allNavSections = Array.from(document.querySelectorAll('section[id]'));
  const navOffset = 72;

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();

    // Find current section based on scroll position
    let currentIndex = 0;
    const scrollY = window.scrollY;
    for (let i = 0; i < allNavSections.length; i++) {
      if (scrollY >= allNavSections[i].offsetTop - navOffset - 10) {
        currentIndex = i;
      }
    }

    let targetIndex;
    if (e.key === 'ArrowDown') {
      targetIndex = Math.min(currentIndex + 1, allNavSections.length - 1);
    } else {
      targetIndex = Math.max(currentIndex - 1, 0);
    }

    const target = allNavSections[targetIndex];
    const top = target.getBoundingClientRect().top + window.scrollY - navOffset;
    window.scrollTo({ top, behavior: 'smooth' });
  });
})();
