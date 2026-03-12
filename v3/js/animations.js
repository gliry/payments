/* ═══════════════════════════════════════════
   OmniFlow Animations
   GSAP ScrollTrigger setup for all sections.
   ═══════════════════════════════════════════ */

(function () {
  "use strict";

  if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") {
    console.warn("GSAP/ScrollTrigger not loaded");
    return;
  }

  const isReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const isMobile = window.matchMedia("(max-width: 767px)").matches;

  gsap.registerPlugin(ScrollTrigger);

  if (isReducedMotion) {
    gsap.set("[data-animate]", { opacity: 1, y: 0, x: 0, scale: 1 });
    gsap.set("[data-split-cards] .card", { opacity: 1, y: 0 });
    return;
  }

  function initScrollReveal() {
    const elements = document.querySelectorAll('[data-animate="fade-up"]');
    elements.forEach((el) => {
      gsap.from(el, {
        y: 60,
        opacity: 0,
        duration: 0.8,
        ease: "power2.out",
        scrollTrigger: {
          trigger: el,
          start: "top 85%",
          toggleActions: "play none none none",
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
        ease: "power2.out",
        scrollTrigger: {
          trigger: group,
          start: "top 85%",
          toggleActions: "play none none none",
        },
      });
    });
  }

  function initCounters() {
    const counters = document.querySelectorAll("[data-counter]");
    counters.forEach((el) => {
      const target = parseFloat(el.getAttribute("data-counter"));
      const prefix = el.getAttribute("data-counter-prefix") || "";
      const suffix = el.getAttribute("data-counter-suffix") || "";

      const obj = { val: 0 };
      gsap.to(obj, {
        val: target,
        duration: 1.5,
        ease: "power3.out",
        snap: { val: 1 },
        scrollTrigger: {
          trigger: el,
          start: "top 85%",
          toggleActions: "play none none none",
        },
        onUpdate: () => {
          el.textContent = prefix + Math.round(obj.val) + suffix;
        },
      });
    });
  }

  function initHeroAnimation() {
    const hero = document.querySelector(".hero__inner");
    if (!hero) return;

    gsap.from(hero.children, {
      y: 40,
      opacity: 0,
      duration: 1,
      stagger: 0.15,
      ease: "power2.out",
      delay: 0.3,
    });
  }

  // ── Split-screen card reveal ──
  function initSplitSections() {
    var scrollContainers = document.querySelectorAll("[data-split-cards]");

    scrollContainers.forEach(function (container) {
      var cards = container.querySelectorAll(".card");
      if (cards.length === 0) return;

      if (isMobile) {
        // Simple stagger reveal on mobile
        gsap.from(cards, {
          y: 40,
          opacity: 0,
          duration: 0.7,
          stagger: 0.15,
          ease: "power2.out",
          scrollTrigger: {
            trigger: container,
            start: "top 85%",
            toggleActions: "play none none none",
          },
        });
        return;
      }

      // Desktop: reveal cards as they scroll into view
      cards.forEach(function (card) {
        gsap.to(card, {
          opacity: 1,
          y: 0,
          duration: 0.6,
          ease: "power2.out",
          scrollTrigger: {
            trigger: card,
            start: "top 80%",
            toggleActions: "play none none reverse",
          },
        });
      });
    });
  }

  // ── Isometric section: pinned scroll with phases ──
  function initIsometricScroll() {
    var section = document.getElementById("isometric");
    var svg = document.getElementById("isometricSvg");
    var stepEls = section
      ? section.querySelectorAll(".how-it-works__step")
      : [];
    if (!section || !svg || isMobile) return;

    var sourceCards = svg.querySelectorAll(".source-card");
    var recipientCards = svg.querySelectorAll(".recipient-card");
    var centerEngine = svg.querySelector("#centerEngine");

    var lastPhase = -1;

    // Init scroll-driven tokens
    if (window.OmniFlowTokens) {
      window.OmniFlowTokens.init();
    }

    // Start state: only sources bright
    gsap.set(sourceCards, { opacity: 1 });
    gsap.set(centerEngine, { opacity: 0.2 });
    gsap.set(recipientCards, { opacity: 0.2 });

    ScrollTrigger.create({
      trigger: section,
      start: "top top",
      end: "+=200%",
      pin: true,
      scrub: 1,
      onUpdate: function (self) {
        var progress = self.progress;

        // Update scroll-driven tokens every frame
        if (window.OmniFlowTokens) {
          window.OmniFlowTokens.update(progress);
        }

        var phase = 0;
        if (progress > 0.15) phase = 1;
        if (progress > 0.85) phase = 2;

        // Update step indicators
        for (var i = 0; i < stepEls.length; i++) {
          if (i === phase) {
            stepEls[i].classList.add("how-it-works__step--active");
          } else {
            stepEls[i].classList.remove("how-it-works__step--active");
          }
        }

        // Only animate on phase change
        if (phase === lastPhase) return;
        lastPhase = phase;

        // Exclusive highlighting: active block bright, others dimmed
        gsap.to(sourceCards, {
          opacity: phase === 0 ? 1 : 0.2,
          duration: 0.5,
          ease: "power2.out",
        });
        if (centerEngine) {
          gsap.to(centerEngine, {
            opacity: phase === 1 ? 1 : 0.2,
            duration: 0.5,
            ease: "power2.out",
          });
        }
        gsap.to(recipientCards, {
          opacity: phase === 2 ? 1 : 0.2,
          duration: 0.5,
          ease: "power2.out",
        });

      },
    });
  }

  // ── Split-screen sticky via GSAP pin (replaces CSS sticky) ──
  function initSplitStickyPins() {
    if (isMobile) return;
    document.querySelectorAll(".split-section").forEach(function (section) {
      var sticky = section.querySelector(".split-section__sticky");
      if (!sticky) return;
      ScrollTrigger.create({
        trigger: section,
        start: "top top",
        end: "bottom bottom",
        pin: sticky,
        pinSpacing: false,
      });
    });
  }

  // ── Problem Wall of Pain: horizontal scroll slides ──
  function initProblemWall() {
    var section = document.getElementById("problem");
    if (!section || !section.classList.contains("problem-wall")) return;

    var pin = section.querySelector(".problem-wall__pin");
    var track = document.getElementById("problemTrack");
    var dotsContainer = document.getElementById("problemDots");
    var dots = dotsContainer ? dotsContainer.querySelectorAll(".problem-wall__dot") : [];
    var slides = track.querySelectorAll(".problem-wall__slide");
    var totalSlides = slides.length;
    if (!pin || !track || totalSlides === 0) return;

    ScrollTrigger.create({
      trigger: section,
      start: "top top",
      end: "+=" + (totalSlides * 100) + "%",
      pin: pin,
      scrub: 1,
      onUpdate: function (self) {
        var progress = self.progress;

        // Horizontal translate
        var maxTranslate = (totalSlides - 1) * window.innerWidth;
        var translateX = progress * maxTranslate;
        track.style.transform = "translateX(" + (-translateX) + "px)";

        // Active dot
        var activeIndex = Math.min(
          totalSlides - 1,
          Math.floor(progress * totalSlides)
        );

        for (var i = 0; i < dots.length; i++) {
          dots[i].classList.remove("active", "active--resolve");
          if (i === activeIndex) {
            if (i === totalSlides - 1) {
              dots[i].classList.add("active--resolve");
            } else {
              dots[i].classList.add("active");
            }
          }
        }
      },
      onEnter: function () {
        if (dotsContainer) dotsContainer.classList.add("visible");
      },
      onLeave: function () {
        if (dotsContainer) dotsContainer.classList.remove("visible");
      },
      onEnterBack: function () {
        if (dotsContainer) dotsContainer.classList.add("visible");
      },
      onLeaveBack: function () {
        if (dotsContainer) dotsContainer.classList.remove("visible");
      },
    });
  }

  // ── Section snap (magnetic scroll between full-screen sections) ──
  function initSectionSnap() {
    if (isMobile) return;

    var targets = document.querySelectorAll(
      "#hero, .section:not(#isometric):not(#faq)",
    );
    var totalScroll =
      document.documentElement.scrollHeight - window.innerHeight;
    if (totalScroll <= 0) return;

    var positions = [];
    targets.forEach(function (el) {
      positions.push(el.offsetTop / totalScroll);
    });

    // Add isometric start + end-of-pin positions
    var iso = document.getElementById("isometric");
    if (iso) {
      positions.push(iso.offsetTop / totalScroll);
      var isoEnd = (iso.offsetTop + 2 * window.innerHeight) / totalScroll;
      positions.push(Math.min(isoEnd, 1));
    }

    positions.sort(function (a, b) {
      return a - b;
    });

    ScrollTrigger.create({
      start: 0,
      end: "max",
      snap: {
        snapTo: positions,
        duration: { min: 0.2, max: 0.6 },
        delay: 0.1,
        ease: "power1.inOut",
      },
    });
  }

  function init() {
    initHeroAnimation();
    initScrollReveal();
    initStaggerReveal();
    initCounters();
    initSplitSections();
    initSplitStickyPins();
    initProblemWall();
    initIsometricScroll();
    // initSectionSnap();
  }

  if (document.readyState === "complete") {
    init();
  } else {
    window.addEventListener("load", init);
  }
})();
