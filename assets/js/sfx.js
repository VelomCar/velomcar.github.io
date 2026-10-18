/* =========================================================
   VELOM — Mesin suara (100% disintesis, tanpa file audio)
   - Suara start engine & raungan mesin
   - "Scroll = gas": dengung mesin mengikuti kecepatan scroll
   - Ketikan mesin tik untuk spesifikasi
   - Suara UI (klik, hover, whoosh)
   - Narator suara (Text-to-Speech Bahasa Indonesia)
   ========================================================= */
window.VelomSFX = (function () {
  "use strict";
  var ctx = null, master = null, noiseBuf = null, shaper = null;
  var enabled = false, loop = null, lastTick = 0;

  try { enabled = localStorage.getItem("velom-sound") === "1"; } catch (e) {}

  function init() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    shaper = makeShaper(14);
    return ctx;
  }

  function makeShaper(k) {
    var n = 2048, curve = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var x = i * 2 / n - 1;
      curve[i] = (3 + k) * x * 20 * Math.PI / 180 / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  function ok() { return enabled && init() && ctx.state !== "closed"; }

  function setEnabled(v) {
    enabled = !!v;
    try { localStorage.setItem("velom-sound", enabled ? "1" : "0"); } catch (e) {}
    if (enabled) { init(); if (ctx && ctx.state === "suspended") ctx.resume(); }
    else { setThrottle(0); stopSpeak(); }
    document.documentElement.classList.toggle("sound-on", enabled);
    return enabled;
  }

  function noise(opts) {
    var t = ctx.currentTime + (opts.when || 0);
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    var f = ctx.createBiquadFilter();
    f.type = opts.type || "bandpass";
    f.frequency.setValueAtTime(opts.freq || 2000, t);
    if (opts.freqTo) f.frequency.exponentialRampToValueAtTime(opts.freqTo, t + opts.dur);
    f.Q.value = opts.q || 1;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.gain || 0.2, t + (opts.attack || 0.002));
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t, Math.random() * 1.5); src.stop(t + opts.dur + 0.05);
  }

  function tone(opts) {
    var t = ctx.currentTime + (opts.when || 0);
    var o = ctx.createOscillator();
    o.type = opts.type || "sine";
    o.frequency.setValueAtTime(opts.freq, t);
    if (opts.freqTo) o.frequency.exponentialRampToValueAtTime(opts.freqTo, t + opts.dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.gain || 0.1, t + (opts.attack || 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + opts.dur + 0.05);
  }

  /* ---------- UI ---------- */
  function tick() {
    if (!ok()) return;
    var now = performance.now();
    if (now - lastTick < 28) return;
    lastTick = now;
    noise({ freq: 1600 + Math.random() * 2600, q: 1.4, gain: 0.16, dur: 0.028 });
    tone({ type: "square", freq: 120 + Math.random() * 80, gain: 0.025, dur: 0.018 });
  }
  function ret() {
    if (!ok()) return;
    noise({ type: "lowpass", freq: 500, gain: 0.25, dur: 0.07 });
    noise({ freq: 3000, q: 2, gain: 0.08, dur: 0.12, when: 0.05, freqTo: 900 });
  }
  function ding() {
    if (!ok()) return;
    tone({ freq: 2093, gain: 0.07, dur: 1.1 });
    tone({ freq: 4186, gain: 0.025, dur: 0.6 });
  }
  function hover() {
    if (!ok()) return;
    tone({ freq: 2400, gain: 0.012, dur: 0.035 });
  }
  function click() {
    if (!ok()) return;
    tone({ type: "triangle", freq: 260, freqTo: 90, gain: 0.16, dur: 0.09 });
    noise({ freq: 3500, q: 3, gain: 0.05, dur: 0.03 });
  }
  function whoosh() {
    if (!ok()) return;
    noise({ freq: 250, freqTo: 3200, q: 0.9, gain: 0.18, dur: 0.45, attack: 0.18 });
  }
  function shutter() {
    if (!ok()) return;
    noise({ type: "highpass", freq: 2500, gain: 0.18, dur: 0.04 });
    noise({ type: "highpass", freq: 1800, gain: 0.12, dur: 0.05, when: 0.07 });
  }

  /* ---------- mesin ---------- */
  function engineVoice(when) {
    var t = ctx.currentTime + (when || 0);
    var out = ctx.createGain(); out.gain.value = 0;
    var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 780; lp.Q.value = 3;
    var ws = ctx.createWaveShaper(); ws.curve = shaper; ws.oversample = "2x";
    var mix = ctx.createGain(); mix.gain.value = 0.35;
    var oscs = [["sawtooth", 1, 0], ["square", 0.5, 4], ["sawtooth", 2, -7], ["triangle", 3, 3]].map(function (o) {
      var osc = ctx.createOscillator();
      osc.type = o[0]; osc.detune.value = o[2];
      osc.connect(mix); osc.start(t);
      return { osc: osc, mul: o[1] };
    });
    // getaran silinder
    var am = ctx.createGain(); am.gain.value = 0.7;
    var lfo = ctx.createOscillator(); lfo.type = "square";
    var lfoGain = ctx.createGain(); lfoGain.gain.value = 0.3;
    lfo.connect(lfoGain); lfoGain.connect(am.gain); lfo.start(t);
    mix.connect(ws); ws.connect(lp); lp.connect(am); am.connect(out); out.connect(master);
    return {
      out: out, lp: lp, lfo: lfo, oscs: oscs,
      setFreq: function (f, at, ramp) {
        oscs.forEach(function (o) {
          if (ramp) o.osc.frequency.linearRampToValueAtTime(f * o.mul, at);
          else o.osc.frequency.setValueAtTime(f * o.mul, at);
        });
        if (ramp) lfo.frequency.linearRampToValueAtTime(f / 2, at);
        else lfo.frequency.setValueAtTime(f / 2, at);
      },
      stop: function (at) {
        oscs.forEach(function (o) { o.osc.stop(at); });
        lfo.stop(at);
      }
    };
  }

  /* ---------- V8 muscle car ala Mustang ----------
     Disintesis per letupan silinder: V8 cross-plane, urutan pengapian 1-5-4-8-6-3-7-2
     (bank kanan 1-4, bank kiri 5-8) -> ritme "burble" khas muscle car Amerika. */
  var FIRE_BANK = [0, 1, 0, 1, 1, 0, 1, 0];
  var v8Cache = {};

  function rpmAt(keys, t) {
    if (t <= keys[0][0]) return keys[0][1];
    for (var i = 1; i < keys.length; i++) {
      if (t <= keys[i][0]) {
        var a = keys[i - 1], b = keys[i], u = (t - a[0]) / (b[0] - a[0]);
        u = u * u * (3 - 2 * u);
        return a[1] + (b[1] - a[1]) * u;
      }
    }
    return keys[keys.length - 1][1];
  }

  // dirender tanpa AudioContext (cukup Float32Array, 22 kHz) supaya bisa disiapkan sejak halaman dibuka
  function renderV8(o) {
    var sr = 22050, N = Math.floor(o.dur * sr);
    var L = new Float32Array(N), R = new Float32Array(N);
    var seed = 7, TWO_PI = Math.PI * 2;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    var i, t, v;

    // motor starter: "nging-nging" kompresi
    if (o.starter) {
      var sEnd = Math.floor(o.starter * sr), lpS = 0;
      for (i = 0; i < sEnd; i++) {
        t = i / sr; lpS += ((rnd() * 2 - 1) - lpS) * 0.08;
        var comp = Math.pow(0.5 + 0.5 * Math.sin(TWO_PI * 9.5 * t), 3);
        var fade = Math.min(1, (sEnd - i) / (0.1 * sr));
        v = (lpS * 1.6 * comp + Math.sin(TWO_PI * (520 + 40 * Math.sin(t * 20)) * t) * 0.05 * comp) * fade * 0.55;
        L[i] += v; R[i] += v;
      }
    }

    // letupan tiap silinder
    var phase = 0, slot = 0, last = rpmAt(o.rpm, o.fireFrom || 0);
    for (var s = Math.floor((o.fireFrom || 0) * sr); s < N; s++) {
      t = s / sr;
      var rpm = rpmAt(o.rpm, t);
      if (rpm < 1150) rpm += Math.sin(t * 7.3) * 30 + Math.sin(t * 2.1) * 20; // idle "lope"
      var accel = (rpm - last) * sr; last = rpm;
      phase += rpm / 60 / sr * 4; // 4 pengapian per putaran engkol
      if (phase < 1) continue;
      phase -= 1;
      var bank = FIRE_BANK[slot % 8]; slot++;
      var load = accel > 400 ? 1 : accel < -400 ? 0.4 : 0.72;
      var amp = load * (0.78 + rnd() * 0.44);
      var dec = Math.max(0.0045, Math.min(0.03, 0.026 * 900 / rpm));
      var f = (bank ? 88 : 104) * (1 + (rpm - 800) / 7000);
      var len = Math.min(N - s, Math.floor(dec * 4.5 * sr)), nlp = 0;
      // osilator teredam via rotasi fasor (tanpa sin/exp per sampel = cepat di HP)
      var w1 = TWO_PI * f / sr, w2 = w1 * 2.03, c1 = Math.cos(w1), s1 = Math.sin(w1), c2 = Math.cos(w2), s2 = Math.sin(w2);
      var x1 = 0, y1 = 1, x2 = 0, y2 = 1, e = amp, ed = Math.exp(-1 / (dec * sr)), tx;
      var ml = bank ? 1 : 0.5, mr = bank ? 0.5 : 1;
      for (var j = 0; j < len; j++) {
        nlp += ((rnd() * 2 - 1) - nlp) * 0.3;
        var x = e * (x1 * 0.75 + x2 * 0.22 + nlp * 0.95);
        L[s + j] += x * ml; R[s + j] += x * mr;
        tx = x1 * c1 + y1 * s1; y1 = y1 * c1 - x1 * s1; x1 = tx;
        tx = x2 * c2 + y2 * s2; y2 = y2 * c2 - x2 * s2; x2 = tx;
        e *= ed;
      }
      // "pop & crackle" knalpot saat lepas gas
      if (accel < -2500 && rnd() < 0.07) {
        var plen = Math.min(N - s, Math.floor(0.035 * sr));
        for (var k = 0; k < plen; k++) {
          var pn = (rnd() * 2 - 1) * Math.exp(-k / (0.006 * sr)) * 1.3;
          L[s + k] += pn; R[s + k] += pn * 0.8;
        }
      }
    }

    // fade-out + normalisasi
    var fo = (o.fadeOut || 0.6) * sr, peak = 0, q;
    for (q = 0; q < N; q++) {
      if (q > N - fo) { var g = (N - q) / fo; L[q] *= g; R[q] *= g; }
      peak = Math.max(peak, Math.abs(L[q]), Math.abs(R[q]));
    }
    var norm = peak ? 0.95 / peak : 1;
    for (q = 0; q < N; q++) { L[q] *= norm; R[q] *= norm; }
    return { sr: sr, L: L, R: R };
  }

  var V8_START = {
    dur: 5.8, starter: 0.85, fireFrom: 0.6, fadeOut: 1.4,
    rpm: [[0, 160], [0.6, 200], [0.86, 650], [1.05, 2000], [1.4, 950], [1.6, 950], [1.95, 5400], [2.5, 1150],
      [2.68, 1100], [2.92, 4100], [3.45, 900], [5.8, 760]]
  };
  var V8_REV = { dur: 2.4, fadeOut: 0.7, rpm: [[0, 850], [0.32, 4800], [0.9, 1000], [2.4, 780]] };

  function tanhCurve(d) {
    var n = 2048, c = new Float32Array(n);
    for (var i = 0; i < n; i++) { var x = i * 2 / n - 1; c[i] = Math.tanh(x * d) / Math.tanh(d); }
    return c;
  }

  function playV8(key, opts, vol) {
    var d = v8Cache[key] || (v8Cache[key] = renderV8(opts));
    var buf = ctx.createBuffer(2, d.L.length, d.sr);
    buf.copyToChannel(d.L, 0); buf.copyToChannel(d.R, 1);
    var src = ctx.createBufferSource(); src.buffer = buf;
    var low = ctx.createBiquadFilter(); low.type = "lowshelf"; low.frequency.value = 150; low.gain.value = 8;
    var mid = ctx.createBiquadFilter(); mid.type = "peaking"; mid.frequency.value = 420; mid.Q.value = 1.2; mid.gain.value = -3;
    var ws = ctx.createWaveShaper(); ws.curve = tanhCurve(1.6);
    var lpf = ctx.createBiquadFilter(); lpf.type = "lowpass"; lpf.frequency.value = 3400; lpf.Q.value = 0.7;
    var g = ctx.createGain(); g.gain.value = vol;
    src.connect(low); low.connect(mid); mid.connect(ws); ws.connect(lpf); lpf.connect(g); g.connect(master);
    src.start();
  }

  function engineStart() {
    if (!ok()) return;
    if (ctx.state === "suspended") ctx.resume();
    playV8("start", V8_START, 1);
  }

  function rev() {
    if (!ok()) return;
    playV8("rev", V8_REV, 0.85);
  }

  // siapkan suara lebih awal agar tidak ada jeda saat tombol ditekan
  function warmUp() {
    try {
      if (!v8Cache.start) v8Cache.start = renderV8(V8_START);
      if (!v8Cache.rev) v8Cache.rev = renderV8(V8_REV);
    } catch (e) {}
  }
  // disiapkan diam-diam setelah halaman terbuka
  window.addEventListener("load", function () { setTimeout(warmUp, 600); });

  /* Scroll = gas. v: 0..1 */
  function setThrottle(v) {
    if (!enabled || !ctx) { if (loop) loop.out.gain.setTargetAtTime(0, ctx.currentTime, 0.1); return; }
    if (!loop) { loop = engineVoice(0); loop.setFreq(32, ctx.currentTime); }
    var t = ctx.currentTime;
    v = Math.max(0, Math.min(1, v));
    loop.oscs.forEach(function (o) { o.osc.frequency.setTargetAtTime((32 + v * 85) * o.mul, t, 0.12); });
    loop.lfo.frequency.setTargetAtTime((32 + v * 85) / 2, t, 0.12);
    loop.lp.frequency.setTargetAtTime(450 + v * 1200, t, 0.15);
    loop.out.gain.setTargetAtTime(v < 0.02 ? 0 : 0.04 + v * 0.14, t, v < 0.02 ? 0.35 : 0.08);
  }

  /* ---------- narator ---------- */
  var voice = null;
  function pickVoice() {
    if (!("speechSynthesis" in window)) return null;
    var vs = speechSynthesis.getVoices();
    voice = vs.filter(function (v) { return /^id/i.test(v.lang); })
      .sort(function (a, b) { return (/google|natural|online/i.test(b.name) ? 1 : 0) - (/google|natural|online/i.test(a.name) ? 1 : 0); })[0] || null;
    return voice;
  }
  if ("speechSynthesis" in window) {
    pickVoice();
    speechSynthesis.onvoiceschanged = pickVoice;
  }
  function speak(text, onend) {
    if (!("speechSynthesis" in window)) { if (onend) onend(); return false; }
    stopSpeak();
    var u = new SpeechSynthesisUtterance(text);
    u.lang = "id-ID";
    if (voice || pickVoice()) u.voice = voice;
    u.rate = 1.02; u.pitch = 0.92;
    u.onend = u.onerror = function () { if (onend) onend(); };
    speechSynthesis.speak(u);
    return true;
  }
  function stopSpeak() { if ("speechSynthesis" in window) speechSynthesis.cancel(); }

  return {
    init: init, isOn: function () { return enabled; }, setEnabled: setEnabled,
    tick: tick, ret: ret, ding: ding, hover: hover, click: click, whoosh: whoosh, shutter: shutter,
    engineStart: engineStart, rev: rev, warmUp: warmUp, setThrottle: setThrottle,
    speak: speak, stopSpeak: stopSpeak
  };
})();
