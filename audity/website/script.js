// Audity marketing site — minimal progressive enhancement.
(function () {
  "use strict";

  // Year in footer
  var y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();

  // Theme: automatic (follows the OS) with an optional, persisted manual override.
  var root = document.documentElement;
  var themeBtn = document.getElementById("themeToggle");
  var mq = window.matchMedia("(prefers-color-scheme: dark)");
  var effectiveTheme = function () {
    var t = root.getAttribute("data-theme");
    if (t === "light" || t === "dark") return t;
    return mq.matches ? "dark" : "light";
  };
  var syncThemeIcon = function () {
    if (themeBtn) themeBtn.setAttribute("data-mode", effectiveTheme());
  };
  syncThemeIcon();
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var next = effectiveTheme() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("audity-theme", next); } catch (e) {}
      syncThemeIcon();
    });
  }
  // While in auto mode (no manual override), follow OS changes live.
  mq.addEventListener("change", function () {
    if (!root.getAttribute("data-theme")) syncThemeIcon();
  });

  // Nav: subtle border once scrolled + mobile menu toggle
  var nav = document.getElementById("nav");
  var burger = document.getElementById("burger");

  var onScroll = function () {
    if (!nav) return;
    nav.classList.toggle("is-scrolled", window.scrollY > 8);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  if (burger && nav) {
    burger.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      burger.setAttribute("aria-expanded", open ? "true" : "false");
    });
    // Close the mobile menu after navigating
    nav.querySelectorAll(".nav__links a").forEach(function (a) {
      a.addEventListener("click", function () {
        nav.classList.remove("is-open");
        burger.setAttribute("aria-expanded", "false");
      });
    });
  }

  // Scroll reveal — only as enhancement, and only if motion is welcome.
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduce && "IntersectionObserver" in window) {
    var targets = document.querySelectorAll(
      ".section__head, .phase, .card, .tier, .faq details, .cta__inner, .strip__codes"
    );
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e, i) {
          if (e.isIntersecting) {
            // tiny stagger within a viewport batch
            e.target.style.transitionDelay = Math.min(i * 40, 160) + "ms";
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.12 }
    );
    targets.forEach(function (t) {
      t.classList.add("reveal");
      io.observe(t);
    });
  }
})();
