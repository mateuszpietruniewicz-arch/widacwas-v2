/* ==========================================================================
   Silnik animacji — odtworzenie mechaniki Framera (agero.framer.website)
   czystym JS: sprężyny (stiffness/damping/mass) → keyframes WAAPI,
   efekt tekstowy per-litera, appear-on-view, scroll-transformacje (sticky
   stack), tickery, pętle, licznik, slider, taby, FAQ, zegar.
   Zero zależności. Respektuje prefers-reduced-motion.
   ========================================================================== */
(() => {
  "use strict";
  document.documentElement.classList.remove("no-js");
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const EASE_IO = "cubic-bezier(0.44, 0, 0.56, 1)";
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------- 1. Sprężyna (jak Framer Motion) → tablica próbek ---------- */
  // Rozwiązanie analityczne tłumionego oscylatora; zwraca funkcję f(t)∈[0..1] (0 = start, 1 = cel)
  function springSolver(stiffness = 100, damping = 10, mass = 1) {
    const w0 = Math.sqrt(stiffness / mass);
    const zeta = damping / (2 * Math.sqrt(stiffness * mass));
    if (zeta < 1) {
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      return (t) => 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + (zeta * w0 / wd) * Math.sin(wd * t));
    }
    if (Math.abs(zeta - 1) < 1e-4) return (t) => 1 - Math.exp(-w0 * t) * (1 + w0 * t);   // krytycznie tłumiona
    // nadkrytycznie tłumiona (np. spring 66/20, 320/60, 300/60 z Agero) — dwa rzeczywiste pierwiastki
    const sq = Math.sqrt(zeta * zeta - 1), r1 = -w0 * (zeta - sq), r2 = -w0 * (zeta + sq);
    return (t) => 1 - (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1);
  }
  // Framer pozwala też podać {duration, bounce} — konwersja jak w motion:
  function springFromBounce(duration = 0.4, bounce = 0.2) {
    const stiffness = Math.pow(2 * Math.PI / duration, 2);
    const damping = 4 * Math.PI * (1 - bounce) / duration;
    return { stiffness, damping, mass: 1 };
  }
  // Czas do ustabilizowania (przesunięcie < 0.5% i mała prędkość), max 3 s
  function springDuration(f) {
    const dt = 1 / 120;
    let settled = 0;
    for (let t = 0; t < 3; t += dt) {
      const v = f(t);
      if (Math.abs(1 - v) < 0.004 && Math.abs(f(t + dt) - v) / dt < 0.02) { settled++; if (settled > 6) return t; }
      else settled = 0;
    }
    return 3;
  }

  /* ---------- 2. Budowa keyframes z "from" → "to" ---------- */
  // from/to: {opacity, x, y, scale, rotate, rotateX, blur, perspective}
  function styleAt(s) {
    const tr = [];
    if (s.perspective) tr.push(`perspective(${s.perspective}px)`);
    if (s.x || s.y) tr.push(`translate3d(${s.x || 0}px, ${s.y || 0}px, 0)`);
    if (s.rotateX) tr.push(`rotateX(${s.rotateX}deg)`);
    if (s.rotate) tr.push(`rotate(${s.rotate}deg)`);
    if (s.scale != null && s.scale !== 1) tr.push(`scale(${s.scale})`);
    const out = { transform: tr.length ? tr.join(" ") : "none" };
    if (s.opacity != null) out.opacity = s.opacity;
    if (s.blur != null) out.filter = `blur(${s.blur}px)`;
    return out;
  }
  function interp(from, to, p) {
    const s = {};
    for (const k of new Set([...Object.keys(from), ...Object.keys(to)])) {
      const a = from[k] ?? (k === "scale" || k === "opacity" ? 1 : 0);
      const b = to[k] ?? (k === "scale" || k === "opacity" ? 1 : 0);
      s[k] = k === "perspective" ? (to[k] || from[k]) : lerp(a, b, p);
    }
    return s;
  }
  /** Animuje element od `from` do `to` z podaną tranzycją Framera. */
  function animate(el, from, to, tr = {}) {
    const delay = (tr.delay || 0) * 1000;
    if (REDUCED) { Object.assign(el.style, styleAt(to)); return null; }
    let anim;
    if (tr.type === "spring") {
      const sp = tr.stiffness ? tr : springFromBounce(tr.duration, tr.bounce ?? 0);
      const f = springSolver(sp.stiffness, sp.damping, sp.mass ?? 1);
      const dur = springDuration(f);
      const N = Math.max(24, Math.round(dur * 60));
      const frames = [];
      for (let i = 0; i <= N; i++) {
        const p = f((i / N) * dur);
        // opacity nie powinna przekraczać 1 przy odbiciu
        const s = interp(from, to, p);
        if (s.opacity != null) s.opacity = clamp(s.opacity, 0, 1);
        if (s.blur != null) s.blur = Math.max(0, s.blur);
        frames.push(styleAt(s));
      }
      anim = el.animate(frames, { duration: dur * 1000, delay, fill: "both", easing: "linear" });
    } else {
      const ease = tr.ease ? `cubic-bezier(${tr.ease.join(",")})` : EASE_IO;
      anim = el.animate([styleAt(from), styleAt(to)], { duration: (tr.duration ?? 0.4) * 1000, delay, fill: "both", easing: ease });
    }
    anim.onfinish = () => { Object.assign(el.style, styleAt(to)); anim.cancel(); el.style.willChange = "auto"; };
    return anim;
  }

  /* ---------- 3. Parser presetów z atrybutu data-appear ----------
     składnia: "y:40 spring:66/20/1 delay:.2 thr:.5"   |   "opacity tween:.4 delay:.7"
     "x:-60", "rotateX:35 scale:.8 y:-10 tween:1 ease:.09,.89,.36,.96"
     Presety nazwane odczytane z Agero: */
  const PRESETS = {
    fade:     "opacity tween:.4 ease:.44,0,.56,1",
    header:   "opacity spring:200/60/1",
    founders: "x:20 tween:.4",
    pill:     "y:20 spring:137/30/1.4",
    pillx:    "x:20 spring:137/30/1.4",
    soft:     "y:12 spring:52/16/1",
    up40:     "y:40 spring:66/20/1 thr:.5",
    left60:   "x:-60 spring:300/60/1 thr:.5",
    up60:     "y:60 spring:320/60/1 delay:.2 thr:0",
    up160:    "y:160 spring:200/40/1 delay:.2 thr:.5",
    up50:     "y:50 tween:1 delay:.2 thr:.5",
    right118: "x:118 tween:.6 delay:.4 thr:.5",
    banner:   "rotateX:35 scale:.8 y:-10 perspective:3962 tween:1 delay:.2 ease:.09,.89,.36,.96 thr:0",
    heroimg:  "scale:1.14 tween:1.2 ease:.09,.89,.36,.96 thr:0",
  };
  function parseAppear(str) {
    let s = str.trim();
    if (PRESETS[s.split(" ")[0]]) s = PRESETS[s.split(" ")[0]] + " " + s.split(" ").slice(1).join(" ");
    const from = { opacity: 0 }, tr = { type: "tween", duration: 0.4 };
    let thr = 0.5, load = false;
    for (const tok of s.split(/\s+/).filter(Boolean)) {
      const [k, v] = tok.split(":");
      if (k === "opacity") continue;
      else if (k === "spring") { const [st, d, m] = v.split("/").map(Number); Object.assign(tr, { type: "spring", stiffness: st, damping: d, mass: m || 1 }); }
      else if (k === "tween") { tr.type = "tween"; tr.duration = +v; }
      else if (k === "ease") tr.ease = v.split(",").map(Number);
      else if (k === "delay") tr.delay = +v;
      else if (k === "thr") thr = +v;
      else if (k === "load") load = true;
      else from[k] = +v;
    }
    return { from, tr, thr, load };
  }

  /* ---------- 4. Efekt tekstowy per-litera (blur 10px, y 10, stagger .05) ---------- */
  function splitChars(el) {
    if (el.dataset.split) return [...el.querySelectorAll(".ch")];
    const text = el.textContent.trim();
    el.textContent = "";
    el.setAttribute("aria-label", text);
    const host = document.createElement("span"); host.setAttribute("aria-hidden", "true");
    const words = text.split(/\s+/), chars = [];
    words.forEach((word, i) => {
      const w = document.createElement("span"); w.style.whiteSpace = "nowrap";  // litery jednego słowa trzymają się razem
      for (const c of word) {
        const sp = document.createElement("span");
        sp.className = "ch"; sp.textContent = c;
        w.appendChild(sp); chars.push(sp);
      }
      host.appendChild(w);
      if (i < words.length - 1) host.appendChild(document.createTextNode(" ")); // spacja łamliwa między słowami
    });
    el.appendChild(host); el.dataset.split = "1";
    return chars;
  }
  function runTextFx(el) {
    const chars = splitChars(el);
    const start = +(el.dataset.textFx || 0);          // startDelay (hero: 1 s)
    const noBlur = el.hasAttribute("data-no-blur");
    chars.forEach((ch, i) => {
      const from = { opacity: 0, y: 10 }; if (!noBlur) from.blur = 10;
      const to = { opacity: 1, y: 0 }; if (!noBlur) to.blur = 0;
      const tr = el.hasAttribute("data-spring")
        ? { type: "spring", duration: 0.4, bounce: 0, delay: start + i * 0.05 }
        : { type: "tween", duration: 0.4, ease: [0.44, 0, 0.56, 1], delay: start + i * 0.05 };
      animate(ch, from, to, tr);
    });
  }

  /* ---------- 5. Appear: na load albo przy wejściu w viewport (raz) ---------- */
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      // pokaż, gdy element wchodzi w viewport — albo gdy został już przewinięty (szybki scroll / kotwica)
      if (!e.isIntersecting && e.boundingClientRect.bottom > 0) continue;
      const el = e.target; io.unobserve(el);
      if (el.hasAttribute("data-text-fx")) runTextFx(el);
      else { const cfg = parseAppear(el.dataset.appear); animate(el, cfg.from, { opacity: 1, x: 0, y: 0, scale: 1, rotateX: 0, perspective: cfg.from.perspective }, cfg.tr); }
    }
  }, { threshold: [0, 0.5, 1], rootMargin: "0px 0px -5% 0px" });

  function initAppear(root = document) {
    root.querySelectorAll("[data-appear]").forEach((el) => {
      const cfg = parseAppear(el.dataset.appear);
      if (cfg.load) animate(el, cfg.from, { opacity: 1, x: 0, y: 0, scale: 1, rotateX: 0, perspective: cfg.from.perspective }, cfg.tr);
      else io.observe(el);
    });
    root.querySelectorAll("[data-text-fx]").forEach((el) => {
      splitChars(el);
      if (el.hasAttribute("data-load")) runTextFx(el); else io.observe(el);
    });
  }

  /* ---------- 6. Ticker (Framer Ticker: speed px/s, gap, fade 12.5%) ---------- */
  function initTickers() {
    document.querySelectorAll(".ticker").forEach((t) => {
      const ul = t.querySelector("ul"); if (!ul) return;
      const speed = +(t.dataset.speed || 50);
      const dir = t.dataset.direction === "right" ? 1 : -1;
      const items = [...ul.children];
      // duplikuj zawartość, aż pasek ma ≥ 2× szerokość kontenera
      const fill = () => { while (ul.scrollWidth < t.clientWidth * 2 + 10 && ul.children.length < 200) items.forEach((li) => ul.appendChild(li.cloneNode(true))); };
      fill();
      // szerokość jednego cyklu = szerokość pierwszego zestawu (z gapem)
      const cycle = () => { const gap = parseFloat(getComputedStyle(ul).gap) || 0; return items.reduce((w, li) => w + li.getBoundingClientRect().width + gap, 0); };
      let anim = null;
      const start = () => {
        if (REDUCED) return;
        const w = cycle(); if (!w) return;
        anim?.cancel();
        // w lewo: 0 → -w ; w prawo: -w → 0 (bez reverse(), które nie działa dla iterations: Infinity)
        const frames = dir === -1
          ? [{ transform: "translateX(0)" }, { transform: `translateX(${-w}px)` }]
          : [{ transform: `translateX(${-w}px)` }, { transform: "translateX(0)" }];
        anim = ul.animate(frames, { duration: (w / speed) * 1000, iterations: Infinity, easing: "linear" });
      };
      start();
      // pasek z odnośnikami zatrzymuje się pod kursorem, inaczej nie da się w nie kliknąć
      if (t.querySelector("a")) {
        t.addEventListener("pointerenter", () => anim && anim.pause());
        t.addEventListener("pointerleave", () => anim && anim.play());
      }
      // pauza poza viewportem (jak Framer)
      new IntersectionObserver(([e]) => { if (!anim) return; e.isIntersecting ? anim.play() : anim.pause(); }).observe(t);
      let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { fill(); start(); }, 200); });
    });
  }

  /* ---------- 7. Scroll-transformacje (rAF): sticky stack + parallax skali ---------- */
  const scrollFx = [];
  function initWorksStack() {
    const pins = [...document.querySelectorAll(".work-pin")];
    pins.forEach((pin, i) => {
      const next = pins[i + 1]; if (!next) return;
      const inner = pin.querySelector(".work-card-in");
      const outerTo = { opacity: 0, rotate: 10, scale: 0.3 };            // Framer: offset 100/200, threshold 1
      const innerTo = i % 2 === 0 ? { opacity: 0.02, rotate: 10, scale: 0.7 } : { opacity: 0.08, rotate: -10, scale: 0.6 };
      let cur = 0;
      scrollFx.push(() => {
        const pinTop = parseFloat(getComputedStyle(pin).top);
        const H = pin.offsetHeight;
        const nextTop = next.getBoundingClientRect().top;
        // 0 → górna krawędź następnej karty dotyka dołu przypiętej; 1 → następna karta całkowicie ją przykryła
        const target = clamp((pinTop + H - nextTop) / H, 0, 1);
        cur += (target - cur) * 0.18;                                   // wygładzenie ≈ spring 500/ease
        if (Math.abs(target - cur) < 0.0005) cur = target;
        const o = interp({}, outerTo, cur), n = interp({}, innerTo, cur * 0.6);
        pin.style.opacity = o.opacity; pin.style.transform = `scale(${o.scale}) rotate(${o.rotate}deg)`;
        inner.style.opacity = n.opacity; inner.style.transform = `scale(${n.scale}) rotate(${n.rotate}deg)`;
      });
    });
  }
  // obraz w tle skaluje się 1.25 → 1 podczas przejazdu sekcji przez viewport (Testimonials BG/Left)
  function initScaleParallax() {
    document.querySelectorAll("[data-scale-parallax]").forEach((el) => {
      const [a, b] = (el.dataset.scaleParallax || "1.25,1").split(",").map(Number);
      scrollFx.push(() => {
        const r = el.getBoundingClientRect(); const vh = innerHeight;
        const p = clamp((vh - r.top) / (vh + r.height), 0, 1);
        el.style.transform = `scale(${lerp(a, b, p)})`;
      });
    });
  }
  // Reveal Text: słowa zapalają się w miarę scrollowania przez akapit
  function initWordReveal() {
    document.querySelectorAll(".reveal-text").forEach((p) => {
      const words = p.textContent.trim().split(/\s+/);
      p.textContent = "";
      const spans = words.map((w, i) => { const s = document.createElement("span"); s.className = "w"; s.textContent = w; p.appendChild(s); if (i < words.length - 1) p.appendChild(document.createTextNode(" ")); return s; });
      scrollFx.push(() => {
        const r = p.getBoundingClientRect(); const vh = innerHeight;
        const p0 = clamp((vh * 0.85 - r.top) / (vh * 0.55), 0, 1);
        const n = Math.round(p0 * spans.length);
        spans.forEach((s, i) => s.classList.toggle("on", i < n));
      });
    });
  }
  function loop() { for (const f of scrollFx) f(); requestAnimationFrame(loop); }

  /* ---------- 8. Pętle (loop / mirror) ---------- */
  function initLoops() {
    if (REDUCED) return;
    document.querySelectorAll("[data-loop-rotate]").forEach((el) => {
      el.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], { duration: (+el.dataset.loopRotate || 5) * 1000, iterations: Infinity, easing: "linear" });
    });
    document.querySelectorAll("[data-loop-float]").forEach((el) => {
      el.animate([{ transform: "translateY(0)" }, { transform: `translateY(${el.dataset.loopFloat || -10}px)` }], { duration: 3000, iterations: Infinity, direction: "alternate", easing: "ease-in-out" });
    });
  }

  /* ---------- 9. Liczniki ---------- */
  function initCounters() {
    const obs = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return; obs.unobserve(e.target);
      const el = e.target, to = parseFloat(el.dataset.count), dec = (el.dataset.count.split(".")[1] || "").length;
      const suf = el.dataset.suffix || "", pre = el.dataset.prefix || "", t0 = performance.now(), D = 1600;
      const tick = (now) => {
        const p = clamp((now - t0) / D, 0, 1), e2 = 1 - Math.pow(1 - p, 3);
        el.textContent = pre + (to * e2).toFixed(dec).replace(".", ",") + suf;
        if (p < 1) requestAnimationFrame(tick);
      };
      REDUCED ? (el.textContent = pre + to.toFixed(dec).replace(".", ",") + suf) : requestAnimationFrame(tick);
    }), { threshold: 0.5 });
    document.querySelectorAll("[data-count]").forEach((el) => obs.observe(el));
  }

  /* ---------- 10. Slider opinii ---------- */
  function initSlider() {
    const s = document.querySelector(".slider"); if (!s) return;
    const track = s.querySelector(".track"), slides = [...track.children], idx = s.querySelector(".cur");
    let i = 0, timer;
    const go = (n) => {
      i = (n + slides.length) % slides.length;
      track.style.transform = `translateX(calc(${-i * 100}% - ${i * 10}px))`;
      idx.textContent = String(i + 1).padStart(2, "0");
      slides.forEach((sl, k) => sl.setAttribute("aria-hidden", k !== i));
    };
    s.querySelector(".prev").onclick = () => { go(i - 1); restart(); };
    s.querySelector(".next").onclick = () => { go(i + 1); restart(); };
    const restart = () => { clearInterval(timer); if (!REDUCED) timer = setInterval(() => go(i + 1), 6000); };
    go(0); restart();
  }

  /* ---------- 11. Taby usług: przełączają się same, klik i klawiatura nadal działają ---------- */
  function initTabs() {
    const wrap = document.querySelector(".services .tabs");
    const tabs = [...document.querySelectorAll(".services .tab")];
    const panels = [...document.querySelectorAll(".services .panel")];
    if (!wrap || tabs.length < 2) return;
    const HOLD = 3400;                          // ile widać jedną usługę
    let i = 0, anim = null, paused = false;
    // sprawdzamy widoczność wprost z geometrii — nie czekamy na pierwszy callback obserwatora
    const visible = () => { const r = wrap.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; };

    // pasek postępu w aktywnej pigułce odmierza czas i zarazem napędza zmianę,
    // więc pauza jest dokładna: zatrzymanie animacji zatrzymuje też odliczanie
    function cycle() {
      if (anim) { anim.cancel(); anim = null; }
      if (REDUCED || paused || !visible()) return;
      const bar = tabs[i].querySelector(".progress");
      if (!bar) return;
      anim = bar.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }],
                         { duration: HOLD, easing: "linear", fill: "both" });
      anim.onfinish = () => show(i + 1);
    }

    function show(k) {
      i = (k + tabs.length) % tabs.length;
      tabs.forEach((x, j) => { x.classList.toggle("active", j === i); x.setAttribute("aria-selected", j === i); });
      panels.forEach((p, j) => p.classList.toggle("active", j === i));
      const p = panels[i];
      animate(p.querySelector(".img-box"), { opacity: 0, x: 118 }, { opacity: 1, x: 0 }, { type: "tween", duration: 0.6, ease: [0.44, 0, 0.56, 1] });
      animate(p.querySelector("p"), { opacity: 0, y: 40 }, { opacity: 1, y: 0 }, { type: "spring", stiffness: 66, damping: 20, mass: 1 });
      animate(p.querySelector(".tags"), { opacity: 0, x: -60 }, { opacity: 1, x: 0 }, { type: "spring", stiffness: 300, damping: 60, mass: 1, delay: 0.3 });
      cycle();
    }

    tabs.forEach((t, k) => t.addEventListener("click", () => show(k)));

    // pauza, kiedy ktoś czyta albo celuje myszą w zakładkę
    const pause = () => { paused = true; if (anim) anim.pause(); };
    const resume = () => { paused = false; if (anim) anim.play(); else cycle(); };
    wrap.addEventListener("pointerenter", pause);
    wrap.addEventListener("pointerleave", resume);
    wrap.addEventListener("focusin", pause);
    wrap.addEventListener("focusout", resume);

    // poza widokiem nic się nie kręci
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting) cycle();
      else if (anim) { anim.cancel(); anim = null; }
    }, { threshold: 0 }).observe(wrap);
  }

  /* ---------- 12. FAQ (grid-template-rows 0fr → 1fr) ---------- */
  function initFaq() {
    document.querySelectorAll(".faq-item").forEach((d) => {
      const sum = d.querySelector("summary");
      sum.addEventListener("click", (e) => {
        e.preventDefault();
        const open = d.classList.contains("open");
        if (open) { d.classList.remove("open"); d.querySelector(".a").addEventListener("transitionend", () => d.removeAttribute("open"), { once: true }); }
        else { d.setAttribute("open", ""); requestAnimationFrame(() => d.classList.add("open")); }
      });
    });
  }

  /* ---------- 13. Zegar w stopce + back to top ---------- */
  function initClock() {
    const el = document.querySelector("[data-clock]"); if (!el) return;
    const tick = () => { el.textContent = new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); };
    tick(); setInterval(tick, 1000);
    document.querySelectorAll("[data-top]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); scrollTo({ top: 0, behavior: REDUCED ? "auto" : "smooth" }); }));
  }

  /* ---------- start ---------- */
  const revealAll = () => document.querySelectorAll("[data-appear], .ch").forEach((el) => { el.style.opacity = 1; el.style.transform = "none"; el.style.filter = "none"; });
  const boot = () => {
    // każdy moduł osobno w try/catch — awaria jednego nie może zatrzymać reszty ani zostawić strony ukrytej
    for (const fn of [initAppear, initTickers, initWorksStack, initScaleParallax, initWordReveal, initLoops, initCounters, initSlider, initTabs, initFaq, initClock]) {
      try { fn(); } catch (err) { console.error("[anim]", fn.name, err); if (fn === initAppear) revealAll(); }
    }
    if (!REDUCED) requestAnimationFrame(loop); else for (const f of scrollFx) f();
  };
  // start po DOM; fonty nie blokują (czekamy na nie max 800 ms, żeby litery nie „skakały” po podmianie kroju)
  const start = () => Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise((r) => setTimeout(r, 800))]).then(boot, boot);
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", start) : start();
})();
