/* =========================================================
   VELOM — Aplikasi halaman customer
   ========================================================= */
(function () {
  "use strict";
  var CFG = window.VELOM_CONFIG || {};
  var P = window.VelomParse;
  var SFX = window.VelomSFX;
  var Hero = window.VelomHero || { setPaint: function () {}, setProgress: function () {}, setSpeed: function () {} };

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  var mobile = matchMedia("(max-width: 760px)").matches;
  var html = document.documentElement;

  var cars = [], lenis = null, entered = false;
  var WA_ICON = '<svg viewBox="0 0 32 32"><path fill="currentColor" d="M16 3C9 3 3.3 8.6 3.3 15.6c0 2.5.7 4.8 2 6.8L3 29l6.8-2.2c1.9 1 4 1.6 6.2 1.6 7 0 12.7-5.7 12.7-12.7S23 3 16 3zm5.9 15.2c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-.3-.2-1.4-.5-2.6-1.6-1-.9-1.6-1.9-1.8-2.2-.2-.3 0-.5.1-.7l.5-.6c.2-.2.2-.3.3-.6.1-.2 0-.4 0-.6l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.1-1.2 2.8s1.2 3.2 1.4 3.5c.2.2 2.4 3.6 5.7 5 .8.3 1.4.5 1.9.7.8.3 1.6.2 2.2.1.7-.1 1.9-.8 2.2-1.5.3-.8.3-1.4.2-1.5-.1-.3-.3-.4-.6-.5z"/></svg>';

  function escHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ================= DATA ================= */
  function loadData(cb) {
    var s = document.createElement("script");
    s.src = "data/cars.js?v=" + Date.now();
    s.onload = function () { cb(window.VELOM_DATA || { cars: [] }); };
    s.onerror = function () { cb(window.VELOM_DATA || { cars: [] }); };
    document.head.appendChild(s);
  }

  function prepare(data) {
    var order = { ready: 0, booked: 1, sold: 2 };
    cars = (data.cars || []).filter(function (c) { return c.status !== "hidden" && c.photos && c.photos.length; })
      .map(function (c, i) { c.info = P.parse(c.spek, c.edits); c._i = i; return c; })
      .sort(function (a, b) { return ((order[a.status] || 0) - (order[b.status] || 0)) || (a._i - b._i); });
  }

  function carUrl(c) {
    if (!/^https?:/.test(location.protocol)) return "";
    return location.origin + location.pathname + "#/mobil/" + c.id;
  }

  function waText(c, kind) {
    var i = c.info, link = carUrl(c);
    var head = "Halo Velom, saya tertarik dengan *" + i.title + (i.year ? " (" + i.year + ")" : "") + "* — " + i.priceText + ".";
    var body = {
      ask: "Apakah unit ini masih tersedia?",
      lock: "Saya mau *amankan harga di bawah pasaran* ini" + (i.marketText ? " (pasaran " + i.marketText + ")" : "") + ". Bagaimana prosesnya?"
    }[kind || "ask"];
    return head + "\n" + body + (link ? "\n\n" + link : "");
  }
  function wa(text) { return P.waLink(CFG.whatsapp, text); }

  function setupLinks() {
    var general = wa("Halo Velom, saya lihat website Anda dan ingin tanya unit yang tersedia.");
    $$("[data-wa=general]").forEach(function (a) { a.href = general; });
    $("#waDisplay").textContent = CFG.whatsappDisplay || ("+" + CFG.whatsapp);
    if (CFG.instagram) {
      var igUrl = "https://www.instagram.com/" + CFG.instagram + "/";
      [["#igLink", "Instagram @" + CFG.instagram + " ↗"], ["#footIg", "@" + CFG.instagram], ["#navIg", null]].forEach(function (x) {
        var el = $(x[0]); if (!el) return;
        el.hidden = false; el.href = igUrl;
        if (x[1]) el.textContent = x[1];
      });
    }
    $("#year").textContent = new Date().getFullYear();
  }

  /* ================= GATE ================= */
  function setupGate() {
    var bar = $("#gateBar"), txt = $("#gateText"), pct = 0.08;
    bar.style.width = "8%";
    Hero.onLoadProgress = function (p) {
      pct = Math.max(pct, p);
      bar.style.width = Math.round(pct * 100) + "%";
      txt.textContent = "Memanaskan mesin… " + Math.round(pct * 100) + "%";
    };
    Hero.onLoad = function (ok) {
      bar.style.width = "100%";
      txt.textContent = ok ? "Mesin siap" : "Mode foto aktif";
    };
    if (Hero.loaded) Hero.onLoad(true);
    if (Hero.failed) Hero.onLoad(false);

    $("#startBtn").addEventListener("pointerdown", function () { SFX.warmUp(); });
    $("#startBtn").addEventListener("click", function () {
      SFX.setEnabled(true);
      SFX.engineStart();
      askGyro();
      var g = $("#gate");
      g.classList.add("is-ignite");
      // getar mengikuti starter -> mesin hidup -> raungan
      try { if (navigator.vibrate) navigator.vibrate([60, 40, 60, 40, 60, 120, 260, 500, 420]); } catch (e) {}
      setTimeout(enter, 2000);
    });
    $("#silentBtn").addEventListener("click", function () {
      SFX.setEnabled(false);
      askGyro();
      enter();
    });
  }

  function enter() {
    if (entered) return;
    entered = true;
    $("#gate").classList.add("is-out");
    document.body.classList.remove("is-gated");
    $(".speedo").classList.add("is-on");
    if (window.gsap) {
      gsap.from(".hero-title .line > span", { yPercent: 110, duration: 1.3, ease: "expo.out", stagger: 0.12, delay: 0.25 });
      gsap.from(".hero-copy .eyebrow, .hero-sub, .hero-ctas", { y: 30, opacity: 0, duration: 1.1, ease: "expo.out", stagger: 0.08, delay: 0.5 });
      gsap.from(".hero-bigword span", { scale: 1.3, opacity: 0, duration: 2, ease: "expo.out" });
      gsap.from(".hero-stats > div, .hero-paint, .nav", { y: 20, opacity: 0, duration: 1, ease: "expo.out", stagger: 0.06, delay: 0.7 });
    }
    if (lenis) lenis.start();
    setTimeout(function () {
      concierge(fine ? "Halo Boss 👋 <b>Seret mobil 3D</b> untuk memutar, lalu scroll pelan-pelan." : "Halo Boss 👋 <b>Geser mobil 3D</b> ke kiri-kanan untuk memutar, lalu scroll.");
    }, 2200);
    route();
  }

  /* ================= GYRO ================= */
  var gyro = { x: 0, y: 0, on: false };
  function askGyro() {
    var D = window.DeviceOrientationEvent;
    if (!D || fine) return;
    var listen = function () {
      window.addEventListener("deviceorientation", function (e) {
        if (e.gamma == null) return;
        gyro.on = true;
        gyro.x = clamp(e.gamma / 30, -1, 1);
        gyro.y = clamp((e.beta - 45) / 30, -1, 1);
      });
    };
    if (typeof D.requestPermission === "function") {
      D.requestPermission().then(function (s) { if (s === "granted") listen(); }).catch(function () {});
    } else listen();
  }

  /* ================= SCROLL ENGINE ================= */
  function setupScroll() {
    // Smooth scroll hanya untuk mouse/touchpad di PC. HP & browser Instagram pakai scroll bawaan (paling stabil).
    if (window.Lenis && fine && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      try {
        lenis = new Lenis({ lerp: 0.1, smoothWheel: true, syncTouch: false });
        lenis.stop(); // dibuka saat masuk dari layar START
        var raf = function (t) { lenis.raf(t); requestAnimationFrame(raf); };
        requestAnimationFrame(raf);
      } catch (e) { console.warn("[VELOM] smooth scroll off:", e); lenis = null; }
    }
    if (lenis) {
      $$('a[href^="#"]').forEach(function (a) {
        a.addEventListener("click", function (e) {
          var h = a.getAttribute("href");
          if (h.length > 1 && $(h)) { e.preventDefault(); lenis.scrollTo(h === "#top" ? 0 : h, { duration: 1.6 }); }
        });
      });
    }
  }

  var hero = null, heroPin = null, manif = null, words = [], lastY = window.scrollY, vel = 0, odo = 0;
  var speedoFill, speedoNeedle, speedoNum, speedoOdo, nav, lastNavY = 0, capIdx = -1, paintIdx = -1;

  function setupScrollFx() {
    hero = $("#hero"); manif = $("#manifesto"); nav = $(".nav");
    speedoFill = $("#speedoFill"); speedoNeedle = $("#speedoNeedle"); speedoNum = $("#speedoNum"); speedoOdo = $("#speedoOdo");
    // manifesto -> kata per kata
    var hot = /banjir|lengkap|indonesia|putar|dengar|dikurasi|tepat/i;
    manif.innerHTML = manif.textContent.trim().split(/\s+/).map(function (w) {
      return '<span class="w' + (hot.test(w) ? " hot" : "") + '">' + escHtml(w) + "</span>";
    }).join(" ");
    words = $$(".w", manif);
    requestAnimationFrame(tick);
  }

  function tick(now) {
    requestAnimationFrame(tick);
    var y = lenis ? lenis.scroll : window.scrollY;
    var vh = window.innerHeight;
    var raw = lenis ? lenis.velocity : (y - lastY);
    var dy = Math.abs(y - lastY);
    lastY = y;
    vel += (clamp(Math.abs(raw) / 45, 0, 1) - vel) * 0.12;
    if (detailOpen) vel *= 0.9;
    odo += dy;

    // hero
    var hr = hero.getBoundingClientRect();
    var hp = clamp(-hr.top / Math.max(1, hr.height - vh), 0, 1);
    Hero.setProgress(hp);
    Hero.setSpeed(vel);
    if (hr.bottom > 0) heroFx(hp);
    if (SFX.isOn()) SFX.setThrottle(entered && !detailOpen ? vel : 0);

    // speedometer
    var kmh = Math.round(vel * 280);
    speedoFill.style.strokeDashoffset = 250 - vel * 250;
    speedoNeedle.style.transform = "rotate(" + (-125 + vel * 250) + "deg)";
    speedoNum.textContent = kmh;
    speedoOdo.textContent = String(Math.floor(odo / 40)).padStart(6, "0").slice(-6);

    // manifesto
    var mr = manif.getBoundingClientRect();
    if (mr.top < vh && mr.bottom > 0) {
      var mp = clamp((vh * 0.85 - mr.top) / (mr.height + vh * 0.25), 0, 1);
      var n = Math.round(mp * words.length);
      for (var i = 0; i < words.length; i++) words[i].style.opacity = i < n ? 1 : 0.13;
    }

    // kartu: masuk dengan rotasi 3D
    cardFx(vh);

    // nav
    if (!detailOpen) {
      nav.classList.toggle("is-solid", y > 40);
      nav.classList.toggle("is-hidden", y > lastNavY + 4 && y > 300);
      if (y < lastNavY - 4) nav.classList.remove("is-hidden");
      lastNavY = y;
    }
  }

  var caps = null, paintName = null, swatch = null, heroCopy = null, bigword = null;
  function heroFx(p) {
    if (!caps) {
      caps = $$(".cap"); paintName = $("#paintName"); swatch = $(".hero-paint .swatch");
      heroCopy = $(".hero-copy"); bigword = $(".hero-bigword span");
    }
    var ci = p < 0.3 ? 0 : p < 0.62 ? 1 : 2;
    if (ci !== capIdx) { capIdx = ci; caps.forEach(function (c, i) { c.classList.toggle("is-on", i === ci); }); }
    var fade = clamp(1 - p / 0.22, 0, 1);
    heroCopy.style.opacity = fade;
    heroCopy.style.transform = "translateY(" + (-(1 - fade) * 60) + "px)";
    heroCopy.style.pointerEvents = fade < 0.2 ? "none" : "";
    bigword.style.transform = "scale(" + (1 + p * 0.5) + ") translateY(" + (p * -8) + "%)";
    bigword.style.opacity = 1 - p * 0.6;
    if (cars.length) {
      var pi = Math.min(cars.length - 1, Math.floor(p * cars.length * 0.999));
      if (pi !== paintIdx && !detailOpen) {
        paintIdx = pi;
        var c = cars[pi];
        Hero.setPaint(c.info.paint);
      }
    }
  }

  /* ================= MARQUEE ================= */
  function setupMarquee() {
    var names = [];
    cars.forEach(function (c) { if (c.info.brand && names.indexOf(c.info.brand) < 0) names.push(c.info.brand); });
    ["Porsche", "Land Rover", "Lexus", "Toyota Alphard", "Mercedes-Benz", "BMW"].forEach(function (b) { if (names.indexOf(b) < 0) names.push(b); });
    var row = names.map(function (n, i) { return '<span class="' + (i % 2 ? "o" : "") + '">' + escHtml(n) + "</span>"; }).join("");
    $("#marquee").innerHTML = row + row;
  }

  /* ================= GARASI ================= */
  var cardEls = [];
  function setupGarage() {
    $("#statUnits").textContent = cars.filter(function (c) { return c.status !== "sold"; }).length;
    var brands = {};
    cars.forEach(function (c) { var b = c.info.brand || "Lainnya"; brands[b] = (brands[b] || 0) + 1; });
    $("#statBrands").textContent = Object.keys(brands).length;

    var chips = [["*", "Semua", cars.length]].concat(Object.keys(brands).map(function (b) { return [b, b, brands[b]]; }));
    $("#filters").innerHTML = chips.map(function (c, i) {
      return '<button class="chip' + (i ? "" : " is-on") + '" data-f="' + escHtml(c[0]) + '">' + escHtml(c[1]) + "<sup>" + c[2] + "</sup></button>";
    }).join("");
    $("#filters").addEventListener("click", function (e) {
      var b = e.target.closest(".chip"); if (!b) return;
      SFX.click();
      $$(".chip").forEach(function (x) { x.classList.toggle("is-on", x === b); });
      var f = b.dataset.f;
      cardEls.forEach(function (el) {
        var show = f === "*" || el._car.info.brand === f || (!el._car.info.brand && f === "Lainnya");
        el.classList.toggle("is-hidden", !show);
        if (show) { el._seen = false; }
      });
    });

    var deck = $("#deck");
    $("#empty").hidden = cars.length > 0;
    deck.innerHTML = cars.map(function (c, idx) {
      var i = c.info;
      var meta = [i.year, i.odo, i.trans].filter(Boolean).map(escHtml).join(" · ");
      var status = c.status === "sold" ? '<div class="card-status"><span>SOLD</span></div>'
        : c.status === "booked" ? '<div class="card-status booked"><span>BOOKED</span></div>' : "";
      return '<article class="card" data-id="' + escHtml(c.id) + '" data-cursor="Lihat" style="--glow:' + i.paint + '88">' +
        '<div class="card-inner">' +
        '<img class="card-img" src="' + escHtml(c.photos[0]) + '" alt="' + escHtml(i.title) + '" loading="lazy" decoding="async">' +
        '<div class="card-shade"></div><div class="card-holo"></div><div class="card-shine"></div>' +
        '<div class="card-top"><span class="pill">' + escHtml(i.brand || "Unit") + '</span><span class="pill">' + String(idx + 1).padStart(2, "0") + " / " + String(cars.length).padStart(2, "0") + "</span></div>" +
        '<div class="card-dots">' + c.photos.slice(0, 14).map(function (_, k) { return '<i class="' + (k ? "" : "on") + '"></i>'; }).join("") + "</div>" +
        '<div class="card-bottom">' +
        '<h3 class="card-name">' + escHtml(i.model) + "</h3>" +
        '<div class="card-meta">' + meta + "</div>" +
        '<div class="card-price"><b>' + escHtml(i.priceText) + "</b>" + (i.saveText ? '<span class="save">Hemat ' + escHtml(i.saveText.replace("Rp ", "")) + "</span>" : "") + "</div>" +
        "</div>" + status + "</div></article>";
    }).join("");

    cardEls = $$(".card", deck);
    cardEls.forEach(function (el, k) {
      el._car = cars[k];
      el._img = $(".card-img", el);
      el._dots = $$(".card-dots i", el);
      el._photo = 0;
      bindCard(el);
    });

    // Mobile: foto berganti otomatis pada kartu yang paling tengah
    if (!fine) setInterval(function () {
      if (detailOpen) return;
      var vh = window.innerHeight, best = null, bd = 1e9;
      cardEls.forEach(function (el) {
        if (el.classList.contains("is-hidden")) return;
        var r = el.getBoundingClientRect(), d = Math.abs(r.top + r.height / 2 - vh / 2);
        if (d < bd && r.bottom > 0 && r.top < vh) { bd = d; best = el; }
      });
      cardEls.forEach(function (el) { el.classList.toggle("is-scrub", el === best); });
      if (best) showPhoto(best, (best._photo + 1) % best._car.photos.length);
    }, 1500);
  }

  function preload(el) {
    if (el._pre) return; el._pre = true;
    el._car.photos.forEach(function (src) { var im = new Image(); im.src = src; });
  }
  function showPhoto(el, k) {
    if (k === el._photo) return;
    el._photo = k;
    el._img.src = el._car.photos[k];
    el._dots.forEach(function (d, j) { d.classList.toggle("on", j === k); });
  }

  function bindCard(el) {
    el.addEventListener("pointerenter", function () { preload(el); SFX.hover(); });
    el.addEventListener("pointermove", function (e) {
      if (e.pointerType !== "mouse") return;
      var r = el.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      el.classList.add("is-tilting");
      var inner = el.firstChild;
      inner.style.setProperty("--ry", ((x - 0.5) * 22) + "deg");
      inner.style.setProperty("--rx", ((0.5 - y) * 18) + "deg");
      inner.style.setProperty("--mx", x * 100 + "%");
      inner.style.setProperty("--my", y * 100 + "%");
      inner.style.setProperty("--hx", x * 100 + "%");
      inner.style.setProperty("--hy", y * 100 + "%");
      el._img.style.setProperty("--px", ((0.5 - x) * 14) + "px");
      el._img.style.setProperty("--py", ((0.5 - y) * 14) + "px");
      // "putar" foto: posisi kursor = sudut foto
      var n = Math.min(el._car.photos.length, 14);
      showPhoto(el, clamp(Math.floor(x * n), 0, n - 1));
    });
    el.addEventListener("pointerleave", function () {
      el.classList.remove("is-tilting");
      var inner = el.firstChild;
      ["--rx", "--ry", "--mx", "--my"].forEach(function (p) { inner.style.removeProperty(p); });
      el._img.style.removeProperty("--px"); el._img.style.removeProperty("--py");
      showPhoto(el, 0);
    });
    el.addEventListener("click", function (e) {
      SFX.click();
      openDetail(el._car, e.clientX, e.clientY);
    });
  }

  function cardFx(vh) {
    var gx = gyro.on ? gyro.x : 0, gy = gyro.on ? gyro.y : 0;
    for (var i = 0; i < cardEls.length; i++) {
      var el = cardEls[i];
      if (el.classList.contains("is-hidden")) continue;
      var r = el.getBoundingClientRect();
      if (r.top > vh * 1.1 || r.bottom < -50) continue;
      // masuk: dari miring 3D -> rata
      var t = clamp((vh - r.top) / (vh * 0.45), 0, 1);
      var e = 1 - Math.pow(1 - t, 3);
      if (t < 1) {
        el.style.transform = "translate3d(0," + ((1 - e) * 120) + "px," + ((1 - e) * -260) + "px) rotateX(" + ((1 - e) * -42) + "deg)";
        el.style.opacity = 0.15 + e * 0.85;
      } else if (el.style.transform) { el.style.transform = ""; el.style.opacity = ""; }
      // giroskop HP
      if (gyro.on && !fine) {
        var inner = el.firstChild;
        el.classList.add("is-gyro");
        inner.style.setProperty("--ry", (gx * 14) + "deg");
        inner.style.setProperty("--rx", (-gy * 10) + "deg");
        inner.style.setProperty("--mx", (50 + gx * 45) + "%");
        inner.style.setProperty("--my", (50 + gy * 45) + "%");
        inner.style.setProperty("--hx", (50 + gx * 50) + "%");
        inner.style.setProperty("--hy", (50 + gy * 50) + "%");
      }
    }
  }

  /* ================= CURSOR, MAGNET, SERVICES ================= */
  function setupCursor() {
    if (!fine) return;
    var c = $(".cursor"), lab = $(".cursor-label"), x = innerWidth / 2, y = innerHeight / 2, cx = x, cy = y;
    window.addEventListener("pointermove", function (e) { x = e.clientX; y = e.clientY; }, { passive: true });
    document.addEventListener("pointerover", function (e) {
      var t = e.target.closest("[data-cursor]");
      c.classList.toggle("is-big", !!t);
      lab.textContent = t ? t.dataset.cursor : "";
    });
    (function loop() {
      cx += (x - cx) * 0.2; cy += (y - cy) * 0.2;
      c.style.transform = "translate(" + cx + "px," + cy + "px)";
      requestAnimationFrame(loop);
    })();
    $$(".magnetic").forEach(function (m) {
      m.addEventListener("pointermove", function (e) {
        var r = m.getBoundingClientRect();
        m.style.transform = "translate(" + ((e.clientX - r.left - r.width / 2) * 0.18) + "px," + ((e.clientY - r.top - r.height / 2) * 0.3) + "px)";
      });
      m.addEventListener("pointerleave", function () { m.style.transform = ""; });
    });
    $$(".svc").forEach(function (s) {
      s.addEventListener("pointermove", function (e) {
        var r = s.getBoundingClientRect();
        s.style.setProperty("--mx", (e.clientX - r.left) + "px");
        s.style.setProperty("--my", (e.clientY - r.top) + "px");
      });
    });
    $$("a, button").forEach(function (b) { b.addEventListener("pointerenter", function () { SFX.hover(); }); });
  }

  /* ================= SOUND BUTTON ================= */
  function setupSound() {
    html.classList.toggle("sound-on", SFX.isOn());
    $("#soundBtn").addEventListener("click", function () {
      var on = SFX.setEnabled(!SFX.isOn());
      if (on) SFX.rev();
      concierge(on ? "Suara <b>ON</b> 🔊 Scroll untuk menginjak gas." : "Suara dimatikan.", 2600);
    });
  }

  /* ================= CONCIERGE ================= */
  var cTimer = null, cTyping = null, cMuted = false;
  function concierge(msg, dur) {
    if (cMuted) return;
    var b = $("#conciergeBubble"), t = $("#conciergeText");
    clearTimeout(cTimer); clearInterval(cTyping);
    b.classList.add("is-on");
    var tmp = document.createElement("div"); tmp.innerHTML = msg;
    var full = tmp.textContent, k = 0;
    t.textContent = "";
    cTyping = setInterval(function () {
      k += 2;
      if (k >= full.length) { clearInterval(cTyping); t.innerHTML = msg; }
      else t.textContent = full.slice(0, k);
    }, 18);
    cTimer = setTimeout(function () { b.classList.remove("is-on"); }, dur || 6500);
  }
  function setupConcierge() {
    $(".concierge-x").addEventListener("click", function () { $("#conciergeBubble").classList.remove("is-on"); cMuted = true; });
    var said = false;
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (en) {
        if (en[0].isIntersecting && !said && entered) {
          said = true;
          concierge(fine ? "Arahkan kursor ke kartu dan <b>geser kiri-kanan</b> — semua foto ikut berputar." : "<b>Miringkan HP</b> Anda — kartunya ikut bergerak. Ketuk kartu untuk detail.");
        }
      }, { threshold: 0.2 }).observe($("#deck"));
    }
  }

  /* ================= DETAIL ================= */
  var detailOpen = false, detailCar = null, ring = null, typer = null, closingByHash = false;

  function openDetail(car, ox, oy) {
    if (location.hash !== "#/mobil/" + car.id) {
      history.pushState({ car: car.id }, "", "#/mobil/" + car.id);
    }
    renderDetail(car, ox, oy);
  }

  function renderDetail(car, ox, oy) {
    var d = $("#detail"), i = car.info;
    detailCar = car;
    if (ring) ring.destroy();
    if (typer) typer.stop();
    SFX.stopSpeak();

    d.style.setProperty("--ox", (ox != null ? ox : innerWidth / 2) + "px");
    d.style.setProperty("--oy", (oy != null ? oy : innerHeight / 2) + "px");
    d.style.setProperty("--paintGlow", hexA(i.paint === "#0b0b0d" ? "#ff3b1f" : i.paint, 0.5));

    var facts = [
      ["Tahun", i.year ? i.year + (i.nik ? " <small style='display:inline;letter-spacing:0;color:var(--mute)'>· NIK " + i.nik + (i.reg ? " / REG " + i.reg : "") + "</small>" : "") : null],
      ["Odometer", i.odo], ["Warna", i.color], ["Pajak", i.tax], ["Transmisi", i.trans], ["Mesin", i.engine]
    ].filter(function (f) { return f[1]; });

    var others = cars.filter(function (c) { return c !== car; }).slice(0, 6);
    var big = (i.model.split(" ")[0] || i.brand || "VELOM").slice(0, 10);

    d.innerHTML =
      '<div class="d-top"><button class="round-btn d-close" aria-label="Kembali">←</button>' +
      '<span class="eyebrow"><i class="dot"></i>' + escHtml(i.brand || "Velom") + " · " + (cars.indexOf(car) + 1) + "/" + cars.length + "</span>" +
      '<button class="round-btn d-share" aria-label="Bagikan">↗</button></div>' +
      '<div class="d-wrap">' +
      '<div class="d-stage-col"><div class="d-stage" data-cursor="Putar"><div class="d-bigword">' + escHtml(big) + '</div><div class="d-floor"></div><div class="ring"></div>' +
      '<div class="d-hint">← seret untuk memutar · ketuk untuk perbesar →</div></div>' +
      '<div class="d-thumbs">' + car.photos.map(function (p, k) { return '<button data-k="' + k + '" class="' + (k ? "" : "on") + '"><img src="' + escHtml(p) + '" alt="" loading="lazy"></button>'; }).join("") + "</div></div>" +
      '<div class="d-body">' +
      '<div class="d-badges">' + (car.status === "sold" ? '<span class="badge" style="color:var(--fire);border-color:var(--fire)">SOLD</span>' : car.status === "booked" ? '<span class="badge" style="color:var(--gold);border-color:var(--gold)">BOOKED</span>' : '<span class="badge ok">● Ready</span>') +
      i.badges.slice(0, 6).map(function (b) { return '<span class="badge' + (/banjir|tabrakan|garansi/i.test(b) ? " ok" : "") + '">' + escHtml(b) + "</span>"; }).join("") + "</div>" +
      '<h2 class="d-title">' + splitChars(i.title) + "</h2>" +
      (i.tagline || i.highlights.length ? '<p class="d-tag">' + escHtml([i.tagline].concat(i.highlights).filter(Boolean).join(" · ")) + "</p>" : "") +
      '<div class="d-price"><small>Harga</small><div class="d-price-row">' + odoRoll(i.price) +
      (i.marketText ? '<div class="d-market">Pasaran <s>' + escHtml(i.marketText) + "</s>" + (i.saveText ? '<br><span class="save">Hemat ±' + escHtml(i.saveText.replace("Rp ", "")) + "</span>" : "") + "</div>" : "") +
      "</div>" + (i.priceNote ? '<div class="d-note">' + escHtml(i.priceNote) + "</div>" : "") + "</div>" +
      (facts.length ? '<div class="d-facts">' + facts.map(function (f) { return '<div class="fact"><small>' + f[0] + "</small><b>" + (f[0] === "Tahun" ? f[1] : escHtml(f[1])) + "</b></div>"; }).join("") + "</div>" : "") +
      '<div class="terminal"><div class="term-bar"><i></i><i></i><i></i><span>velom://spec-scan</span>' +
      '<button class="term-btn t-voice" title="Bacakan">🔊 Dengarkan</button><button class="term-btn t-skip" title="Tampilkan semua">⏩</button></div>' +
      '<div class="term-body"></div></div>' +
      marketHtml(car) +
      '<div class="d-actions">' +
      '<button class="act d-photos">🖼 Semua Foto</button>' +
      '<button class="act d-share2">↗ Bagikan</button></div>' +
      (others.length ? '<div class="d-more"><h4>Unit lainnya</h4><div class="d-more-row">' + others.map(function (o) {
        return '<button class="mini" data-id="' + escHtml(o.id) + '"><img src="' + escHtml(o.photos[0]) + '" alt="" loading="lazy"><span>' + escHtml(o.info.title) + "<small>" + escHtml(o.info.priceText) + "</small></span></button>";
      }).join("") + "</div></div>" : "") +
      "</div></div>" +
      '<div class="d-cta"><div class="d-cta-info"><small>' + escHtml(i.title) + "</small><b>" + escHtml(i.priceText) + "</b></div>" +
      '<a target="_blank" rel="noopener" href="' + wa(waText(car, "ask")) + '">' + WA_ICON + "Tanya Unit</a></div>";

    d.scrollTop = 0;
    d.setAttribute("aria-hidden", "false");
    void d.offsetWidth;
    d.classList.add("is-open");
    if (!detailOpen) { SFX.whoosh(); }
    detailOpen = true;
    document.body.classList.add("is-locked");
    Hero.setPaint(i.paint);

    // event
    $(".d-close", d).onclick = function () { SFX.click(); closeDetail(); };
    $(".d-share", d).onclick = $(".d-share2", d).onclick = function () { share(car); };
    $(".d-photos", d).onclick = function () { openLightbox(car.photos, ring ? ring.front() : 0); };
    $$(".mini", d).forEach(function (m) {
      m.onclick = function (e) {
        var c = cars.filter(function (x) { return x.id === m.dataset.id; })[0];
        if (c) { SFX.whoosh(); history.replaceState({ car: c.id }, "", "#/mobil/" + c.id); renderDetail(c, e.clientX, e.clientY); }
      };
    });

    ring = makeRing($(".d-stage", d), car.photos, function (k) {
      $$(".d-thumbs button", d).forEach(function (b, j) { b.classList.toggle("on", j === k); });
    });
    $$(".d-thumbs button", d).forEach(function (b) {
      b.onclick = function () { SFX.click(); ring.goTo(+b.dataset.k); };
    });

    // animasi judul & harga
    if (window.gsap) {
      gsap.fromTo($$(".d-title .ch", d), { yPercent: 100, opacity: 0, rotateX: -80 }, { yPercent: 0, opacity: 1, rotateX: 0, duration: 0.9, ease: "expo.out", stagger: 0.018, delay: 0.35 });
      gsap.fromTo($$(".d-badges .badge, .d-tag, .d-price, .d-facts, .terminal", d), { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, ease: "expo.out", stagger: 0.06, delay: 0.45 });
    }
    setTimeout(function () { $$(".odo-roll .dg", d).forEach(function (g) { g.style.transform = "translateY(" + (-g.dataset.d) + "em)"; }); }, 650);

    // terminal spek (mulai saat terlihat)
    typer = makeTyper($(".term-body", d), car);
    var termStarted = false;
    var io = new IntersectionObserver(function (en) {
      if (en[0].isIntersecting && !termStarted) { termStarted = true; typer.start(); io.disconnect(); }
    }, { root: d, threshold: 0.25 });
    io.observe($(".terminal", d));
    $(".t-skip", d).onclick = function () { typer.finish(); };
    var vb = $(".t-voice", d);
    vb.onclick = function () {
      if (vb.classList.contains("is-on")) { SFX.stopSpeak(); vb.classList.remove("is-on"); vb.textContent = "🔊 Dengarkan"; return; }
      var okSpeak = SFX.speak(i.summary, function () { vb.classList.remove("is-on"); vb.textContent = "🔊 Dengarkan"; });
      if (okSpeak) { vb.classList.add("is-on"); vb.textContent = "■ Stop"; }
      else concierge("Maaf, browser ini belum mendukung narator suara.");
    };

    var mk = $(".mk", d);
    if (mk) {
      var mio = new IntersectionObserver(function (en) {
        if (en[0].isIntersecting) { mk.classList.add("is-in"); SFX.whoosh(); mio.disconnect(); }
      }, { root: d, threshold: 0.35 });
      mio.observe(mk);
    }

    setTimeout(function () {
      if (i.saveText) concierge("Unit ini <b>hemat ±" + escHtml(i.saveText.replace("Rp ", "")) + "</b> dari harga pasaran. Mau saya bantu cek ketersediaannya?");
      else concierge("Tekan <b>🔊 Dengarkan</b> untuk mendengar spesifikasinya, atau chat langsung via WhatsApp.");
    }, 2600);
  }

  function closeDetail(fromPop) {
    if (!detailOpen) return;
    detailOpen = false;
    var d = $("#detail");
    d.classList.remove("is-open");
    d.setAttribute("aria-hidden", "true");
    document.body.classList.remove("is-locked");
    SFX.stopSpeak();
    if (typer) typer.stop();
    if (lenis) lenis.start();
    paintIdx = -1;
    setTimeout(function () { if (!detailOpen) { if (ring) ring.destroy(); ring = null; d.innerHTML = ""; } }, 950);
    if (!fromPop && /^#\/mobil\//.test(location.hash)) {
      history.pushState({}, "", location.pathname + location.search);
    }
  }

  function route() {
    var m = location.hash.match(/^#\/mobil\/(.+)$/);
    if (m) {
      var c = cars.filter(function (x) { return x.id === decodeURIComponent(m[1]); })[0];
      if (c && !(detailOpen && detailCar === c)) renderDetail(c);
      if (c) return;
    }
    closeDetail(true);
  }

  function share(car) {
    var url = carUrl(car) || location.href;
    var data = { title: car.info.title, text: car.info.title + " — " + car.info.priceText + " | Velom Car", url: url };
    if (navigator.share) { navigator.share(data).catch(function () {}); return; }
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { concierge("Link unit <b>disalin</b> ✓ Tinggal paste di chat / story."); });
  }

  function splitChars(t) {
    return t.split(" ").map(function (w) {
      return '<span style="display:inline-block;white-space:nowrap">' + w.split("").map(function (ch) {
        return '<span class="ch">' + escHtml(ch) + "</span>";
      }).join("") + "</span>";
    }).join(" ");
  }

  function odoRoll(jt) {
    var txt = P.fmtPrice(jt);
    if (jt == null) return '<div class="odo-roll">' + escHtml(txt) + "</div>";
    var m = txt.match(/^Rp\s([\d.,]+)\s(\w+)$/);
    if (!m) return '<div class="odo-roll">' + escHtml(txt) + "</div>";
    var digits = m[1].split("").map(function (ch) {
      if (!/\d/.test(ch)) return "<span>" + ch + "</span>";
      var col = ""; for (var k = 0; k <= 9; k++) col += "<span>" + k + "</span>";
      return '<span class="dg" data-d="' + ch + '">' + col + "</span>";
    }).join("");
    return '<div class="odo-roll"><span class="unit">Rp</span><span class="digits">' + digits + '</span><span class="unit">' + m[2] + "</span></div>";
  }

  function hexA(hex, a) {
    var h = hex.replace("#", ""); if (h.length === 3) h = h.replace(/(.)/g, "$1$1");
    var n = parseInt(h, 16);
    return "rgba(" + (n >> 16 & 255) + "," + (n >> 8 & 255) + "," + (n & 255) + "," + a + ")";
  }

  /* ---------- cincin foto 3D ---------- */
  function makeRing(stage, photos, onFront) {
    var el = $(".ring", stage), N = Math.min(photos.length, 14);
    var cw = Math.round(Math.min(stage.clientWidth * (mobile ? 0.56 : 0.36), mobile ? 250 : 300));
    el.style.setProperty("--cw", cw + "px");
    var step = 360 / N;
    var R = N > 1 ? Math.round((cw / 2) / Math.tan(Math.PI / N) * 1.12) : 0;
    el.innerHTML = photos.slice(0, N).map(function (p, k) {
      return '<div class="ring-item" data-k="' + k + '" style="transform: rotateY(' + (k * step) + "deg) translateZ(" + R + 'px)"><img src="' + escHtml(p) + '" alt="" draggable="false"></div>';
    }).join("");
    var items = $$(".ring-item", el);
    var angle = 0, vel = 0, drag = false, sx = 0, lx = 0, moved = 0, idle = 0, target = null, alive = true, front = -1;
    var scale = Math.min(1, (stage.clientHeight * 0.78) / (cw * 1.333));

    function down(e) {
      drag = true; sx = lx = e.clientX; moved = 0; vel = 0; target = null;
      try { stage.setPointerCapture(e.pointerId); } catch (er) {}
    }
    function move(e) {
      if (!drag) return;
      var dx = e.clientX - lx; lx = e.clientX; moved += Math.abs(dx);
      vel = dx * (mobile ? 0.45 : 0.3); angle += vel; idle = 0;
    }
    function up(e) {
      if (!drag) return; drag = false;
      if (moved < 6) {
        var it = document.elementFromPoint(e.clientX, e.clientY);
        it = it && it.closest(".ring-item");
        var k = it ? +it.dataset.k : getFront();
        if (k === getFront()) { SFX.shutter(); openLightbox(photos, k); }
        else goTo(k);
      }
    }
    stage.addEventListener("pointerdown", down);
    stage.addEventListener("pointermove", move);
    stage.addEventListener("pointerup", up);
    stage.addEventListener("pointercancel", function () { drag = false; });

    function norm(a) { a = a % 360; return a < 0 ? a + 360 : a; }
    function getFront() { return Math.round(norm(-angle) / step) % N; }
    function goTo(k) {
      var cur = norm(-angle), want = k * step, diff = want - cur;
      if (diff > 180) diff -= 360; if (diff < -180) diff += 360;
      target = angle - diff; idle = 0;
    }

    (function loop() {
      if (!alive) return;
      requestAnimationFrame(loop);
      if (!drag) {
        if (target != null) {
          angle += (target - angle) * 0.1;
          if (Math.abs(target - angle) < 0.05) { angle = target; target = null; }
        } else {
          vel *= 0.94; angle += vel;
          idle++;
          if (Math.abs(vel) < 0.3 && idle > 20 && idle < 160 && N > 1) {
            var snap = Math.round(angle / step) * step; angle += (snap - angle) * 0.08;
          }
          if (idle >= 160) angle -= 0.12;
        }
      }
      el.style.transform = "scale(" + scale + ") translateZ(" + (-R) + "px) rotateY(" + angle + "deg)";
      for (var k = 0; k < items.length; k++) {
        var rel = (k * step + angle) * Math.PI / 180;
        var c = Math.cos(rel);
        items[k].style.opacity = (0.25 + 0.75 * Math.max(0, c)).toFixed(3);
        items[k].style.setProperty("--gl", Math.max(0, Math.sin(rel) * 0.9).toFixed(2));
        items[k].style.zIndex = Math.round(c * 100) + 100;
      }
      var f = getFront();
      if (f !== front) { front = f; onFront(f); if (!drag || moved > 20) SFX.tick(); }
    })();

    return { destroy: function () { alive = false; }, goTo: goTo, front: getFront };
  }

  /* ---------- terminal mesin tik ---------- */
  function makeTyper(body, car) {
    var i = car.info, segs = [];
    var add = function (t, cls) { segs.push({ t: t, cls: cls || "" }); };
    add("velom@garage:~$ ", "p"); add("scan --unit " + car.id + "\n", "em");
    add("› memuat spesifikasi " + (i.brand || "unit") + "…\n", "sys");
    add("› sumber: showroom partner · diperbarui " + (car.date || "") + "\n\n", "sys");
    i.sections.forEach(function (s) {
      if (s.header) add("## " + s.header + "\n", "h");
      s.lines.forEach(function (l) { add("› ", "p"); add(l.t + "\n", l.cls); });
      add("\n");
    });
    add("› harga: ", "p"); add(i.priceText + (i.priceNote ? " (" + i.priceNote + ")" : "") + "\n", "em");
    add("› status: ", "p"); add((car.status === "sold" ? "SOLD" : car.status === "booked" ? "BOOKED" : "READY ✓") + "\n", car.status === "ready" || !car.status ? "ok" : "em");

    var si = 0, ci = 0, timer = null, span = null, done = false, caret = document.createElement("span");
    caret.className = "caret";
    function step() {
      for (var n = 0; n < 2; n++) {
        if (si >= segs.length) { finishUp(); return; }
        var s = segs[si];
        if (!span) { span = document.createElement("span"); span.className = s.cls; body.insertBefore(span, caret); }
        var ch = s.t.charAt(ci++);
        span.textContent += ch;
        if (ch === "\n") { if (s.cls === "h") SFX.ret(); }
        else if (ch !== " ") SFX.tick();
        if (ci >= s.t.length) { si++; ci = 0; span = null; }
      }
      body.scrollTop = body.scrollHeight;
      var nextCh = si < segs.length ? segs[si].t.charAt(ci) : "";
      timer = setTimeout(step, nextCh === "\n" ? 70 : 16);
    }
    function finishUp() {
      if (done) return; done = true; clearTimeout(timer);
      SFX.ding();
    }
    return {
      start: function () { body.innerHTML = ""; body.appendChild(caret); step(); },
      stop: function () { clearTimeout(timer); done = true; },
      finish: function () {
        clearTimeout(timer);
        body.innerHTML = "";
        segs.forEach(function (s) { var sp = document.createElement("span"); sp.className = s.cls; sp.textContent = s.t; body.appendChild(sp); });
        body.appendChild(caret);
        si = segs.length;
        finishUp();
      }
    };
  }

  /* ---------- radar harga pasaran (detail) ---------- */
  function savePct(i) { return Math.round((1 - i.price / i.market) * 100); }
  function hasMarket(i) { return i.price != null && i.market != null && i.market > i.price; }

  function marketHtml(car) {
    var i = car.info, why = CFG.alasanHarga || [], bars;
    if (hasMarket(i)) {
      bars = '<div class="mk-bars">' +
        '<div class="mk-row"><span>Harga pasaran</span><div class="mk-track"><i class="mk-bar mk-mkt" style="--w:100%"></i></div><b><s>' + escHtml(i.marketText) + "</s></b></div>" +
        '<div class="mk-row"><span>Harga Velom</span><div class="mk-track"><i class="mk-bar mk-our" style="--w:' + (i.price / i.market * 100).toFixed(1) + '%"></i></div><b>' + escHtml(i.priceText) + "</b></div></div>" +
        '<div class="mk-save"><div><small>Anda hemat sekitar</small><b>' + escHtml(i.saveText) + '</b></div><div class="mk-pct"><b>' + savePct(i) + '%</b><small>di bawah<br>pasaran</small></div></div>';
    } else {
      bars = '<p class="mk-none">Harga <b>' + escHtml(i.priceText) + "</b> adalah harga cash terbaik kami. Chat WhatsApp untuk perbandingan dengan harga pasaran terbaru.</p>";
    }
    return '<div class="mk"><div class="mk-head"><h3>Radar Harga Pasaran</h3><small>' + (i.marketText ? "pasaran sesuai info showroom" : "") + "</small></div>" + bars +
      '<h4 class="mk-why">Kenapa bisa di bawah pasaran?</h4><ul class="mk-list">' +
      why.slice(0, 4).map(function (r, k) { return "<li><b>0" + (k + 1) + "</b><div><h5>" + escHtml(r[0]) + "</h5><p>" + escHtml(r[1]) + "</p></div></li>"; }).join("") +
      '</ul><a class="btn btn-fire mk-wa" target="_blank" rel="noopener" href="' + wa(waText(car, "lock")) + '">🔒 Amankan harga ini via WhatsApp</a></div>';
  }

  /* ---------- radar harga pasaran (beranda) ---------- */
  function setupMarket() {
    var list = cars.filter(function (c) { return c.status !== "sold" && hasMarket(c.info); });
    var total = list.reduce(function (s, c) { return s + c.info.save; }, 0);
    if (list.length) {
      $("#totalSave").hidden = false;
      $("#totalSaveVal").textContent = P.fmtPrice(total);
      $("#totalSaveSub").textContent = "dari " + list.length + " unit di garasi";
    }
    $("#radar").innerHTML = list.map(function (c) {
      var i = c.info;
      return '<button class="rd" data-id="' + escHtml(c.id) + '" data-cursor="Lihat"><img src="' + escHtml(c.photos[0]) + '" alt="" loading="lazy">' +
        '<div class="rd-main"><div class="rd-top"><b>' + escHtml(i.title) + '</b><span class="save">−' + savePct(i) + "%</span></div>" +
        '<div class="mk-track"><i class="mk-bar mk-mkt" style="--w:100%"></i></div>' +
        '<div class="mk-track"><i class="mk-bar mk-our" style="--w:' + (i.price / i.market * 100).toFixed(1) + '%"></i></div>' +
        '<div class="rd-num"><span>Pasaran <s>' + escHtml(i.marketText) + "</s></span><span>Velom <b>" + escHtml(i.priceText) + "</b></span></div></div></button>";
    }).join("");
    $$(".rd").forEach(function (r) {
      r.addEventListener("click", function (e) {
        var c = cars.filter(function (x) { return x.id === r.dataset.id; })[0];
        if (c) { SFX.click(); openDetail(c, e.clientX, e.clientY); }
      });
    });
    var radar = $("#radar");
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (en) {
        if (en[0].isIntersecting) { radar.classList.add("is-in"); io.disconnect(); }
      }, { threshold: 0.2 });
      io.observe(radar);
    } else radar.classList.add("is-in");

    $("#whyGrid").innerHTML = (CFG.alasanHarga || []).map(function (r, k) {
      return '<div class="svc"><span class="svc-ic">0' + (k + 1) + "</span><h3>" + escHtml(r[0]) + "</h3><p>" + escHtml(r[1]) + "</p></div>";
    }).join("");
    $$(".svc").forEach(function (s) {
      s.addEventListener("pointermove", function (e) {
        var b = s.getBoundingClientRect();
        s.style.setProperty("--mx", (e.clientX - b.left) + "px");
        s.style.setProperty("--my", (e.clientY - b.top) + "px");
      });
    });
  }

  /* ================= LIGHTBOX ================= */
  var lb = { photos: [], k: 0 };
  function openLightbox(photos, k) {
    lb.photos = photos; lb.k = k || 0;
    var box = $("#lightbox");
    box.classList.add("is-open"); box.setAttribute("aria-hidden", "false");
    showLb(0);
  }
  function showLb(dir) {
    var box = $("#lightbox"), img = $("img", box);
    lb.k = (lb.k + dir + lb.photos.length) % lb.photos.length;
    img.style.opacity = 0; img.style.transform = "translateX(" + (dir * 40) + "px) scale(.97)";
    setTimeout(function () {
      img.src = lb.photos[lb.k];
      img.style.opacity = 1; img.style.transform = "";
    }, dir ? 120 : 0);
    $(".lb-count", box).textContent = (lb.k + 1) + " / " + lb.photos.length;
  }
  function closeLb() { var box = $("#lightbox"); box.classList.remove("is-open"); box.setAttribute("aria-hidden", "true"); }
  function setupLightbox() {
    var box = $("#lightbox"), sx = null;
    $(".lb-x", box).onclick = closeLb;
    $(".lb-prev", box).onclick = function () { SFX.click(); showLb(-1); };
    $(".lb-next", box).onclick = function () { SFX.click(); showLb(1); };
    box.addEventListener("pointerdown", function (e) { sx = e.clientX; });
    box.addEventListener("pointerup", function (e) {
      if (sx == null) return;
      var dx = e.clientX - sx; sx = null;
      if (Math.abs(dx) > 50) { SFX.shutter(); showLb(dx < 0 ? 1 : -1); }
      else if (e.target === box) closeLb();
    });
    document.addEventListener("keydown", function (e) {
      if (box.classList.contains("is-open")) {
        if (e.key === "Escape") closeLb();
        if (e.key === "ArrowRight") showLb(1);
        if (e.key === "ArrowLeft") showLb(-1);
      } else if (detailOpen && e.key === "Escape") closeDetail();
    });
  }

  /* ================= REQUEST: jual mobil / cari unit ================= */
  var RQ = {
    jual: {
      head: "Halo Velom 👋, saya mau *JUAL MOBIL*.",
      fields: [["nama", "Nama"], ["kota", "Kota"], ["unit", "Unit"], ["tahun", "Tahun"], ["odo", "Odometer"], ["warna", "Warna"], ["harga", "Harga yang diharapkan"], ["catatan", "Kondisi / catatan"]],
      foot: "Foto unit akan saya kirim di chat ini. Terima kasih 🙏"
    },
    cari: {
      head: "Halo Velom 👋, saya sedang *MENCARI UNIT*.",
      fields: [["nama", "Nama"], ["kota", "Kota"], ["unit", "Unit dicari"], ["tahun", "Tahun"], ["budget", "Budget"], ["warna", "Warna favorit"], ["catatan", "Catatan"]],
      foot: "Mohon dibantu carikan unit di bawah harga pasaran 🙏"
    }
  };

  function setupRequest() {
    var form = $("#rqForm"); if (!form) return;
    var mode = "jual", bubble = $("#rqBubble"), err = $("#rqErr");

    function set() { return $('.rq-set[data-mode="' + mode + '"]', form); }
    function message() {
      var r = RQ[mode], s = set(), lines = [r.head, ""], filled = 0;
      r.fields.forEach(function (f) {
        var el = $('[name="' + f[0] + '"]', s), v = el ? el.value.trim() : "";
        if (v) { lines.push("• " + f[1] + ": " + v); filled++; }
      });
      if (!filled) lines.push("…");
      lines.push("", r.foot);
      return lines.join("\n");
    }
    function render() {
      // tampilkan *tebal* seperti di WhatsApp
      bubble.innerHTML = escHtml(message()).replace(/\*([^*\n]+)\*/g, "<b>$1</b>").replace(/\n/g, "<br>") +
        '<span class="rq-time">' + new Date().toTimeString().slice(0, 5) + " ✓✓</span>";
    }

    $$(".rq-tab", form).forEach(function (t) {
      t.addEventListener("click", function () {
        mode = t.dataset.mode; SFX.click();
        $$(".rq-tab", form).forEach(function (x) { x.classList.toggle("is-on", x === t); });
        $$(".rq-set", form).forEach(function (fs) {
          var on = fs.dataset.mode === mode;
          fs.hidden = !on; fs.disabled = !on;
        });
        err.hidden = true; render();
      });
    });
    form.addEventListener("input", function () { err.hidden = true; render(); SFX.tick(); });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var unit = $('[name="unit"]', set());
      if (!unit.value.trim()) {
        err.textContent = mode === "jual" ? "Isi dulu merk & tipe mobil Anda ya." : "Isi dulu unit yang Anda cari ya.";
        err.hidden = false; unit.focus(); return;
      }
      SFX.click();
      var url = wa(message()), w = window.open(url, "_blank");
      if (!w) location.href = url; // browser Instagram kadang memblokir tab baru
    });
    render();
  }

  /* ================= START ================= */
  setupLinks();
  setupGate();
  setupScroll();
  setupSound();
  setupLightbox();
  setupCursor();
  setupConcierge();
  setupRequest();
  window.addEventListener("popstate", route);

  loadData(function (data) {
    prepare(data);
    if (cars.length) {
      Hero.setPaint(cars[0].info.paint);
      var fb = $(".hero-fallback img"); if (fb) fb.src = cars[0].photos[0];
    }
    setupMarquee();
    setupGarage();
    setupMarket();
    setupScrollFx();
    if (entered) route();
  });
})();
