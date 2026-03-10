/* ═══════════════════════════════════════════
   OmniFlow Animations
   GSAP ScrollTrigger setup for all sections.
   ═══════════════════════════════════════════ */

(function () {
  'use strict';

  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
    console.warn('GSAP/ScrollTrigger not loaded');
    return;
  }

  const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = window.matchMedia('(max-width: 767px)').matches;

  gsap.registerPlugin(ScrollTrigger);

  if (isReducedMotion) {
    gsap.set('[data-animate]', { opacity: 1, y: 0, x: 0, scale: 1 });
    return;
  }

  function initScrollReveal() {
    const elements = document.querySelectorAll('[data-animate="fade-up"]');
    elements.forEach((el) => {
      gsap.from(el, {
        y: 60,
        opacity: 0,
        duration: 0.8,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 85%',
          toggleActions: 'play none none none',
        },
      });
    });
  }

  function initStaggerReveal() {
    const groups = document.querySelectorAll('[data-animate="stagger"]');
    groups.forEach((group) => {
      const children = group.children;
      gsap.from(children, {
        y: 60,
        opacity: 0,
        duration: 0.8,
        stagger: 0.15,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: group,
          start: 'top 85%',
          toggleActions: 'play none none none',
        },
      });
    });
  }

  function initCounters() {
    const counters = document.querySelectorAll('[data-counter]');
    counters.forEach((el) => {
      const target = parseFloat(el.getAttribute('data-counter'));
      const prefix = el.getAttribute('data-counter-prefix') || '';
      const suffix = el.getAttribute('data-counter-suffix') || '';

      const obj = { val: 0 };
      gsap.to(obj, {
        val: target,
        duration: 1.5,
        ease: 'power3.out',
        snap: { val: 1 },
        scrollTrigger: {
          trigger: el,
          start: 'top 85%',
          toggleActions: 'play none none none',
        },
        onUpdate: () => {
          el.textContent = prefix + Math.round(obj.val) + suffix;
        },
      });
    });
  }

  function initHeroAnimation() {
    const hero = document.querySelector('.hero__inner');
    if (!hero) return;

    gsap.from(hero.children, {
      y: 40,
      opacity: 0,
      duration: 1,
      stagger: 0.15,
      ease: 'power2.out',
      delay: 0.3,
    });
  }

  // ── Problem: pinned sequential card reveal ──
  function initProblemPin() {
    var section = document.getElementById('problem');
    var cards = section ? section.querySelectorAll('.problem__card') : [];
    if (!section || cards.length === 0 || isMobile) return;

    // Hide all cards initially
    gsap.set(cards, { opacity: 0, y: 40 });

    var tl = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: '+=' + (cards.length * 50) + '%',
        pin: true,
        scrub: 1,
      }
    });

    // Reveal each card sequentially
    cards.forEach(function(card, i) {
      tl.to(card, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' });
      if (i < cards.length - 1) {
        tl.to({}, { duration: 0.2 }); // pause between cards
      }
    });

    // Hold at end
    tl.to({}, { duration: 0.3 });
  }

  // ── Solution: before → after morph ──
  function initSolutionAnimation() {
    const wrap = document.getElementById('solutionWrap');
    const before = document.getElementById('solutionBefore');
    const after = document.getElementById('solutionAfter');
    if (!wrap || !before || !after) return;

    if (isMobile) {
      gsap.to(before, {
        opacity: 0,
        duration: 0.8,
        scrollTrigger: { trigger: wrap, start: 'top 60%', toggleActions: 'play none none reverse' }
      });
      gsap.to(after, {
        opacity: 1,
        duration: 0.8,
        scrollTrigger: { trigger: wrap, start: 'top 50%', toggleActions: 'play none none reverse' }
      });
    } else {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: '#solution',
          start: 'top top',
          end: '+=150%',
          pin: true,
          scrub: 1,
        }
      });

      tl.to(before, { opacity: 0, scale: 0.9, duration: 0.5 })
        .to(after, { opacity: 1, scale: 1, duration: 0.5 }, '-=0.3');
    }
  }

  // ── How It Works: step progression ──
  function initStepsAnimation() {
    const wrap = document.getElementById('stepsWrap');
    const fill = document.getElementById('stepsLineFill');
    const items = wrap ? wrap.querySelectorAll('.steps__item') : [];
    if (!wrap || items.length === 0) return;

    if (isMobile) {
      // Simple stagger reveal on mobile
      gsap.from(items, {
        y: 40,
        opacity: 0,
        duration: 0.7,
        stagger: 0.15,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: wrap,
          start: 'top 85%',
          toggleActions: 'play none none none',
        },
      });
      return;
    }

    gsap.to(fill, {
      width: '100%',
      ease: 'none',
      scrollTrigger: {
        trigger: wrap,
        start: 'top 70%',
        end: 'bottom 50%',
        scrub: true,
      },
    });

    items.forEach((item) => {
      gsap.from(item, {
        opacity: 0,
        y: 30,
        duration: 0.6,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: item,
          start: 'top 80%',
          toggleActions: 'play none none reverse',
        },
      });
    });
  }

  // ── Flow Demo: pinned scroll-driven phases ──
  function initFlowDemoScroll() {
    var demo = document.getElementById('flowDemo');
    if (!demo || isMobile) return;

    ScrollTrigger.create({
      trigger: '#how-it-works',
      start: 'top top',
      end: '+=200%',
      pin: true,
      scrub: 1,
      onUpdate: function(self) {
        var progress = self.progress;
        var phase = 0;
        if (progress > 0.33) phase = 1;
        if (progress > 0.66) phase = 2;
        if (typeof window.__flowDemoSetPhase === 'function') {
          window.__flowDemoSetPhase(phase);
        }
      }
    });
  }

  function init() {
    initHeroAnimation();
    initScrollReveal();
    initProblemPin();
    initStaggerReveal();
    initCounters();
    initSolutionAnimation();
    initStepsAnimation();
    initFlowDemoScroll();
  }

  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init);
  }
})();
