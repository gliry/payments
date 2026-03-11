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
    var flowLines = svg.querySelectorAll(".flow-line");
    var centerEngine = svg.querySelector("#centerEngine");

    // Start partially visible
    gsap.set(sourceCards, { opacity: 0.7 });
    gsap.set(recipientCards, { opacity: 0.6 });
    gsap.set(flowLines, { attr: { "stroke-opacity": 0.5 } });

    ScrollTrigger.create({
      trigger: section,
      start: "top top",
      end: "+=200%",
      pin: true,
      scrub: 1,
      onUpdate: function (self) {
        var progress = self.progress;
        var phase = 0;
        if (progress > 0.33) phase = 1;
        if (progress > 0.66) phase = 2;

        // Update step indicators
        for (var i = 0; i < stepEls.length; i++) {
          if (i <= phase) {
            stepEls[i].classList.add("how-it-works__step--active");
          } else {
            stepEls[i].classList.remove("how-it-works__step--active");
          }
        }

        // Phase 0: Upload — highlight sources
        var srcOpacity = progress > 0.1 ? 1 : 0.7;
        for (var si = 0; si < sourceCards.length; si++) {
          sourceCards[si].style.opacity = srcOpacity;
        }

        // Phase 1: Route — highlight flow lines and center
        var lineOpacity = phase >= 1 ? "0.8" : "0.5";
        for (var li = 0; li < flowLines.length; li++) {
          flowLines[li].setAttribute("stroke-opacity", lineOpacity);
          flowLines[li].setAttribute("stroke-width", phase >= 1 ? "3" : "1.5");
        }

        // Phase 2: Execute — highlight recipients
        var rcpOpacity = phase >= 2 ? 1 : 0.6;
        for (var ri = 0; ri < recipientCards.length; ri++) {
          recipientCards[ri].style.opacity = rcpOpacity;
        }
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

  function init() {
    initHeroAnimation();
    initScrollReveal();
    initStaggerReveal();
    initCounters();
    initSplitSections();
    initSplitStickyPins();
    initIsometricScroll();
  }

  if (document.readyState === "complete") {
    init();
  } else {
    window.addEventListener("load", init);
  }
})();
