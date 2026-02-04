/* ============================================
   OmniFlow Landing Page — Interactions
   ============================================ */

(function () {
  'use strict';

  /* --- 1. Intersection Observer — scroll reveal --- */
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

  /* --- 2. Nav scroll --- */
  const nav = document.querySelector('.nav');
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav__links a');

  function onScroll() {
    const scrollY = window.scrollY;

    // nav shadow
    if (scrollY > 20) {
      nav.classList.add('nav--scrolled');
    } else {
      nav.classList.remove('nav--scrolled');
    }

    // active section
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

  /* --- 3. Smooth scroll for anchor links --- */
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', function (e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        const offset = 72; // nav height
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });

  /* --- 4. Typewriter effect for code block --- */
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
      { text: '});\n\n', cls: 'op' },
      { text: 'console', cls: 'op' },
      { text: '.', cls: 'op' },
      { text: 'log', cls: 'fn' },
      { text: '(', cls: 'op' },
      { text: '`Sent ${payouts.total} USDC across ${payouts.chains} chains`', cls: 'str' },
      { text: ');', cls: 'op' },
    ];

    let typed = false;
    let charIndex = 0;
    let segmentIndex = 0;

    function typeNext() {
      if (segmentIndex >= codeLines.length) {
        // done — add blinking cursor
        const cursor = document.createElement('span');
        cursor.className = 'cursor';
        codeBlock.appendChild(cursor);
        return;
      }

      const seg = codeLines[segmentIndex];
      const char = seg.text[charIndex];

      // Get or create current span
      let span = codeBlock.querySelector(`[data-seg="${segmentIndex}"]`);
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

      const delay = char === '\n' ? 40 : char === ' ' ? 15 : 22;
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

  /* --- 5. Architecture module cycling --- */
  const inputModules = document.querySelectorAll('.arch-input .arch-module');
  const outputModules = document.querySelectorAll('.arch-output .arch-module');
  const archTags = document.querySelectorAll('.arch-tag');
  let activeInput = 0;
  let activeOutput = 0;

  function cycleModules() {
    // Clear all
    inputModules.forEach((m) => m.classList.remove('active'));
    outputModules.forEach((m) => m.classList.remove('active'));
    archTags.forEach((t) => t.classList.remove('active'));

    // Activate next
    inputModules[activeInput].classList.add('active');
    outputModules[activeOutput].classList.add('active');

    // Activate corresponding tags
    const inputName = inputModules[activeInput].getAttribute('data-module');
    const outputName = outputModules[activeOutput].getAttribute('data-module');
    archTags.forEach((t) => {
      if (t.getAttribute('data-module') === inputName || t.getAttribute('data-module') === outputName) {
        t.classList.add('active');
      }
    });

    activeInput = (activeInput + 1) % inputModules.length;
    activeOutput = (activeOutput + 1) % outputModules.length;
  }

  if (inputModules.length > 0) {
    cycleModules();
    setInterval(cycleModules, 2800);
  }
})();
