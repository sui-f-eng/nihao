(() => {
  const root = document.documentElement;
  const canvas = document.getElementById("fx-canvas");
  const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });

  const parallaxEls = Array.from(document.querySelectorAll("[data-parallax]"));
  const revealEls = Array.from(document.querySelectorAll("[data-reveal]"));
  const meterText = document.getElementById("meterText");
  const meterBar = document.getElementById("meterBar");

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dprCap = prefersReducedMotion ? 1.5 : 2;

  let w = 0;
  let h = 0;
  let dpr = 1;

  // Mouse -> shared light field target
  const mouse = {
    x: 0,
    y: 0,
    tx: 0,
    ty: 0,
  };

  // A small "sprite" to draw particles fast.
  const sprite = makeParticleSprite(64);

  function makeParticleSprite(size) {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const cctx = c.getContext("2d");

    const r = size / 2;
    const g = cctx.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, "rgba(55,255,214,1)");
    g.addColorStop(0.18, "rgba(97,168,255,1)");
    g.addColorStop(0.45, "rgba(166,107,255,0.55)");
    g.addColorStop(0.7, "rgba(97,168,255,0.18)");
    g.addColorStop(1, "rgba(0,0,0,0)");

    cctx.fillStyle = g;
    cctx.fillRect(0, 0, size, size);
    return c;
  }

  // Particles
  let particles = [];
  let particleCount = 110;

  function resize() {
    const nextDpr = Math.min(dprCap, window.devicePixelRatio || 1);
    dpr = nextDpr;
    w = Math.max(1, window.innerWidth);
    h = Math.max(1, window.innerHeight);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const area = w * h;
    particleCount = prefersReducedMotion ? 70 : Math.min(130, Math.max(85, Math.floor(area / 52000)));

    // Keep mouse defaults stable after resize
    if (!mouse.x && !mouse.y) {
      mouse.x = w * 0.55;
      mouse.y = h * 0.45;
      mouse.tx = mouse.x;
      mouse.ty = mouse.y;
    }

    initParticles();
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function initParticles() {
    particles = new Array(particleCount).fill(0).map(() => {
      const z = Math.random(); // depth in [0,1]
      const speed = prefersReducedMotion ? rand(0.08, 0.22) : rand(0.12, 0.32);
      const angle = rand(0, Math.PI * 2);
      const phase = rand(0, Math.PI * 2);
      return {
        x: rand(-80, w + 80),
        y: rand(-80, h + 80),
        vx: Math.cos(angle) * speed * 12,
        vy: Math.sin(angle) * speed * 12,
        z,
        size: rand(4.5, 10) * (0.55 + z),
        phase,
      };
    });
  }

  window.addEventListener("resize", resize, { passive: true });

  // Mouse interaction
  window.addEventListener(
    "pointermove",
    (e) => {
      mouse.tx = e.clientX;
      mouse.ty = e.clientY;
      root.style.setProperty("--mouse-x", String(mouse.tx / Math.max(1, w)));
      root.style.setProperty("--mouse-y", String(mouse.ty / Math.max(1, h)));
    },
    { passive: true }
  );

  let pulse = 0;
  window.addEventListener("pointerdown", () => {
    pulse = 1;
  });

  // Smooth reveal (IntersectionObserver)
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.16, rootMargin: "0px 0px -10% 0px" }
  );

  for (const el of revealEls) {
    const delay = Number(el.dataset.delay || 0);
    el.style.setProperty("--delay", `${delay}ms`);
    io.observe(el);
  }

  // Smooth scrolling buttons
  document.addEventListener("click", (e) => {
    const btn = e.target && e.target.closest && e.target.closest("[data-scroll-to]");
    if (!btn) return;
    const sel = btn.getAttribute("data-scroll-to");
    const target = document.querySelector(sel);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // Count-up metrics when visible
  const metrics = document.querySelectorAll("[data-metric]");
  let metricsStarted = false;

  const metricsIO = new IntersectionObserver(
    (entries) => {
      if (metricsStarted) return;
      for (const entry of entries) {
        if (entry.isIntersecting) {
          metricsStarted = true;
          animateMetrics();
          metricsIO.disconnect();
          break;
        }
      }
    },
    { threshold: 0.25 }
  );

  const metricsHost = document.getElementById("metrics");
  if (metricsHost) metricsIO.observe(metricsHost);

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function animateMetrics() {
    const list = Array.from(metrics);
    const start = performance.now();
    const dur = prefersReducedMotion ? 700 : 1400;

    function tick(now) {
      const t = Math.min(1, (now - start) / dur);
      const k = easeOutCubic(t);
      for (const el of list) {
        const vEl = el.querySelector(".metric-value");
        const from = Number(el.dataset.from || 0);
        const to = Number(el.dataset.count || 0);
        const suffix = String(el.dataset.suffix || "");
        const val = from + (to - from) * k;
        const intVal = suffix === "%" || suffix === "fps" ? Math.round(val) : Math.round(val);
        if (vEl) vEl.textContent = String(intVal) + suffix;
      }
      if (t < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  // Card micro-tilt
  const cardEls = Array.from(document.querySelectorAll("[data-card]"));

  function resetCard(card) {
    card.style.transform = "translate3d(0, 0, 0) scale(1) rotateX(0deg) rotateY(0deg)";
    card.style.setProperty("--cx", "50%");
    card.style.setProperty("--cy", "50%");
  }

  for (const card of cardEls) resetCard(card);

  if (!prefersReducedMotion) {
    for (const card of cardEls) {
      card.addEventListener(
        "pointermove",
        (e) => {
          const rect = card.getBoundingClientRect();
          const x = (e.clientX - rect.left) / Math.max(1, rect.width);
          const y = (e.clientY - rect.top) / Math.max(1, rect.height);
          const rx = (0.5 - y) * 10;
          const ry = (x - 0.5) * 12;
          card.style.setProperty("--cx", `${x * 100}%`);
          card.style.setProperty("--cy", `${y * 100}%`);
          card.style.transform = `translate3d(0, 0, 0) scale(1) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
        },
        { passive: true }
      );
      card.addEventListener("pointerleave", () => resetCard(card));
    }
  }

  // Intro / pulse controls
  let introDuration = prefersReducedMotion ? 1600 : 2600;
  let introStart = performance.now();
  let lastFrameTime = 0;
  let frameSkipMs = prefersReducedMotion ? 85 : 0; // reduce redraw frequency when needed

  function replayOpening() {
    introStart = performance.now();
    pulse = 1;
    document.body.classList.add("is-intro");
    root.style.setProperty("--pulse", "0");
    setTimeout(() => document.body.classList.remove("is-intro"), introDuration + 120);
  }

  const btnPulse = document.getElementById("btnPulse");
  const btnRewind = document.getElementById("btnRewind");
  const btnFocus = document.getElementById("btnFocus");

  if (btnPulse) btnPulse.addEventListener("click", () => (pulse = 1));
  if (btnRewind) btnRewind.addEventListener("click", replayOpening);
  if (btnFocus) btnFocus.addEventListener("click", () => (pulse = 1.2));

  // Main animation loop (requestAnimationFrame)
  function tick(now) {
    if (frameSkipMs > 0 && now - lastFrameTime < frameSkipMs) {
      requestAnimationFrame(tick);
      return;
    }
    lastFrameTime = now;

    const dt = Math.min(0.033, (now - (tick._last || now)) / 1000);
    tick._last = now;
    tick._dt = dt;

    // Intro progress for CSS + canvas intensity
    const introT = Math.min(1, (now - introStart) / introDuration);
    root.style.setProperty("--intro", introT.toFixed(4));

    // Mouse smoothing
    const smooth = prefersReducedMotion ? 0.07 : 0.11;
    mouse.x += (mouse.tx - mouse.x) * (1 - Math.pow(1 - smooth, dt * 60));
    mouse.y += (mouse.ty - mouse.y) * (1 - Math.pow(1 - smooth, dt * 60));

    // Pulse decay
    pulse = Math.max(0, pulse - dt * (prefersReducedMotion ? 0.65 : 0.85));
    const pulse01 = Math.min(1.15, pulse);
    root.style.setProperty("--pulse", pulse01.toFixed(3));

    // Parallax
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const scrollT = maxScroll > 0 ? window.scrollY / maxScroll : 0;
    const mxN = mouse.x / Math.max(1, w) - 0.5;

    for (const el of parallaxEls) {
      const speed = Number(el.dataset.parallax || 0);
      const y = (scrollT - 0.02) * window.innerHeight * speed;
      const x = mxN * speed * 26;
      el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
    }

    // Update meter UI via CSS var + occasional text update
    const signal = Math.round(100 * (0.25 + pulse01 * 0.65 + (Math.abs(mxN) * 0.18)));
    if (meterText) meterText.textContent = `Signal: ${Math.min(100, signal)}`;
    if (meterBar) meterBar.style.filter = `drop-shadow(0 0 ${18 + pulse01 * 18}px rgba(55,255,214,${0.18 + pulse01 * 0.18}))`;

    // Canvas draw
    if (!prefersReducedMotion || introT < 0.999) {
      drawParticles(now, introT, pulse01);
    } else {
      // Still draw occasionally to keep mouse glow responsive.
      drawParticles(now, introT, pulse01 * 0.7);
    }

    requestAnimationFrame(tick);
  }

  function drawParticles(now, introT, pulse01) {
    if (!ctx) return;
    const cx = w * 0.52;
    const cy = h * 0.46;
    const step = tick._dt || 0.016;
    const k = step * 60;

    // Trail: subtle persistence keeps it smooth.
    ctx.globalCompositeOperation = "source-over";
    const fade = prefersReducedMotion ? 0.16 : 0.1;
    const a = (0.12 + (1 - introT) * 0.06) * (prefersReducedMotion ? 1.05 : 1);
    ctx.fillStyle = `rgba(5, 6, 17, ${Math.min(0.24, fade + a)})`;
    ctx.fillRect(0, 0, w, h);

    // Warp ring during intro
    if (introT < 1) {
      ctx.globalCompositeOperation = "lighter";
      const ringR = (0.12 + introT * 0.62) * Math.min(w, h);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = `rgba(97, 168, 255, ${0.12 + introT * 0.22})`;
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = `rgba(55, 255, 214, ${0.08 + introT * 0.18})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, ringR * 0.72, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.globalCompositeOperation = "lighter";

    // Update + draw particles
    const influenceBase = 160;
    const maxDist2 = Math.pow(influenceBase + 90 * pulse01, 2);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      // Flow field (gentle)
      const t = now * 0.001;
      const flow = (0.14 + p.z * 0.55) * (prefersReducedMotion ? 0.75 : 1);
      p.vx += Math.sin(t * (0.55 + p.z * 0.9) + p.phase) * flow * 0.22 * k;
      p.vy += Math.cos(t * (0.47 + p.z * 0.8) + p.phase * 0.7) * flow * 0.18 * k;

      // Subtle center pull to keep cohesion
      const dxC = cx - p.x;
      const dyC = cy - p.y;
      p.vx += dxC * (0.000006 + p.z * 0.00001) * k;
      p.vy += dyC * (0.000006 + p.z * 0.00001) * k;

      // Mouse repulsion
      const dx = p.x - mouse.x;
      const dy = p.y - mouse.y;
      const dist2 = dx * dx + dy * dy;
      if (dist2 < maxDist2) {
        const dist = Math.sqrt(dist2) + 0.001;
        const minD = influenceBase + 120 * p.z;
        const m = 1 - dist / Math.max(1, minD);
        const strength = m * m * (0.75 + p.z * 0.9) * (0.9 + pulse01 * 0.6);
        p.vx += (dx / dist) * strength * 4.8 * k;
        p.vy += (dy / dist) * strength * 4.2 * k;
      }

      // Integrate
      const fric = prefersReducedMotion ? 0.86 : 0.8;
      p.vx *= Math.pow(fric, k);
      p.vy *= Math.pow(fric, k);
      p.x += p.vx * step;
      p.y += p.vy * step;

      // Wrap
      const margin = 90;
      if (p.x < -margin) p.x = w + margin;
      else if (p.x > w + margin) p.x = -margin;
      if (p.y < -margin) p.y = h + margin;
      else if (p.y > h + margin) p.y = -margin;

      // Draw particle sprite
      const size = p.size * (0.78 + p.z * 0.7) * (0.95 + pulse01 * 0.4);
      const alpha = (0.12 + p.z * 0.45) * (0.65 + introT * 0.55);
      ctx.globalAlpha = alpha;
      ctx.drawImage(sprite, p.x - size / 2, p.y - size / 2, size, size);

      // Lines to nearby particles (O(n^2), cap by distance)
      if (!prefersReducedMotion && (i % 2 === 0)) {
        for (let j = i + 1; j < particles.length; j += 1) {
          const q = particles[j];
          const ddx = p.x - q.x;
          const ddy = p.y - q.y;
          const dd2 = ddx * ddx + ddy * ddy;
          if (dd2 > 140 * 140) continue;

          const zAvg = (p.z + q.z) * 0.5;
          if (Math.abs(p.z - q.z) > 0.45) continue;

          const d = Math.sqrt(dd2) || 1;
          const m = 1 - d / 140;
          const lineA = m * (0.05 + zAvg * 0.09) * (0.8 + pulse01 * 0.8);
          if (lineA <= 0.01) continue;

          ctx.globalAlpha = lineA;
          ctx.strokeStyle = `rgba(97, 168, 255, ${lineA})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.stroke();
        }
      }
    }

    ctx.globalAlpha = 1;
  }

  // Ticker: keep loop friendly on resize
  function initTicker() {
    const track = document.getElementById("tickerTrack");
    if (!track) return;
    // If motion is reduced, ticker CSS already disables; no extra needed.
  }

  // Start
  resize();
  initTicker();

  // Kick intro
  document.body.classList.add("is-intro");
  setTimeout(() => document.body.classList.remove("is-intro"), introDuration + 120);

  requestAnimationFrame(tick);
})();

