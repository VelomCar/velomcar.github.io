/* =========================================================
   VELOM — Admin: upload ZIP -> website otomatis
   ========================================================= */
(function () {
  "use strict";
  var CFG = window.VELOM_CONFIG || {};
  var P = window.VelomParse;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var IMG = /\.(jpe?g|png|webp)$/i;

  var cars = [], drafts = [], pending = {}, blobUrl = {}, removed = [], changes = 0;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function src(p) { return blobUrl[p] || p; }
  function slug(t) { return (t || "mobil").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "") || "mobil"; }
  function pad(n) { return String(n).padStart(2, "0"); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem("velom-admin-" + k); localStorage.setItem("velom-admin-" + k, v); } catch (e) { return null; } }

  var toastT;
  function toast(msg, err, ms) {
    var t = $("#toast");
    t.textContent = msg; t.classList.toggle("err", !!err); t.classList.add("on");
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("on"); }, ms || 3200);
  }

  /* ---------------- PIN ---------------- */
  function pinGate() {
    var pin = $("#pin");
    var okSess = false;
    try { okSess = sessionStorage.getItem("velom-pin") === "1"; } catch (e) {}
    if (!CFG.adminPin || okSess) { pin.classList.add("off"); return; }
    var go = function () {
      if ($("#pinInput").value === String(CFG.adminPin)) {
        try { sessionStorage.setItem("velom-pin", "1"); } catch (e) {}
        pin.classList.add("off");
      } else { $("#pinErr").textContent = "PIN salah"; $("#pinInput").value = ""; }
    };
    $("#pinBtn").onclick = go;
    $("#pinInput").onkeydown = function (e) { if (e.key === "Enter") go(); };
    setTimeout(function () { $("#pinInput").focus(); }, 100);
  }

  /* ---------------- DATA ---------------- */
  function loadData() {
    var s = document.createElement("script");
    s.src = "data/cars.js?v=" + Date.now();
    s.onload = s.onerror = function () {
      var d = window.VELOM_DATA || { cars: [] };
      cars = JSON.parse(JSON.stringify(d.cars || []));
      renderStock();
    };
    document.head.appendChild(s);
  }

  function markDirty() {
    changes++;
    $("#pubbar").classList.add("dirty");
    $("#pubText").textContent = changes + " perubahan belum dipublish";
    renderStock();
  }
  function markClean(msg) {
    changes = 0; pending = {}; removed = [];
    $("#pubbar").classList.remove("dirty");
    $("#pubText").textContent = msg || "Semua sudah dipublish ✓";
    renderStock();
  }
  window.addEventListener("beforeunload", function (e) {
    if (changes || drafts.length) { e.preventDefault(); e.returnValue = ""; }
  });

  /* ---------------- ZIP ---------------- */
  function naturalKey(name) {
    var base = name.split("/").pop().replace(/\.[^.]+$/, "");
    var m = base.match(/^(.*?)\s*\((\d+)\)$/), n = 0;
    if (m) { base = m[1]; n = +m[2]; }
    return base.toLowerCase().replace(/\d+/g, function (d) { return d.padStart(8, "0"); }) + "#" + String(n).padStart(4, "0");
  }
  function guessDate(zipName, names) {
    var m = zipName.replace(/\.zip$/i, "").match(/^(\d{1,2})[.\-_](\d{1,2})[.\-_](\d{4})$/);
    if (m && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) return m[3] + "-" + pad(m[2]) + "-" + pad(m[1]);
    for (var i = 0; i < names.length; i++) {
      var d = names[i].match(/(20\d{2})-(\d{2})-(\d{2})/);
      if (d) return d[1] + "-" + d[2] + "-" + d[3];
    }
    return new Date().toISOString().slice(0, 10);
  }
  function decodeText(u8) {
    var t = new TextDecoder("utf-8").decode(u8);
    if ((t.match(/�/g) || []).length > 3) {
      try { t = new TextDecoder("windows-1252").decode(u8); } catch (e) {}
    }
    return t.replace(/^﻿/, "").replace(/\r\n/g, "\n").trim();
  }
  function uniqueId(base) {
    var ids = cars.concat(drafts).map(function (c) { return c.id; });
    var id = base, i = 2;
    while (ids.indexOf(id) >= 0) id = base + "-" + (i++);
    return id;
  }
  function compress(blob, name) {
    if (/\.jpe?g$/i.test(name) && blob.size < 520 * 1024) return Promise.resolve(blob);
    if (!window.createImageBitmap) return Promise.resolve(blob);
    return createImageBitmap(blob).then(function (bmp) {
      var max = 1600, s = Math.min(1, max / Math.max(bmp.width, bmp.height));
      var c = document.createElement("canvas");
      c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      return new Promise(function (res) { c.toBlob(function (b) { res(b || blob); }, "image/jpeg", 0.86); });
    }).catch(function () { return blob; });
  }

  function handleFiles(list) {
    var files = Array.prototype.slice.call(list).filter(function (f) { return /\.zip$/i.test(f.name); });
    if (!files.length) return toast("Pilih file .zip ya", true);
    var chain = Promise.resolve();
    files.forEach(function (f) { chain = chain.then(function () { return processZip(f); }); });
    chain.then(function () { toast("✓ " + files.length + " ZIP terbaca. Cek data, lalu tekan “Masukkan ke Website”."); });
  }

  function processZip(file) {
    toast("Membaca " + file.name + "…", false, 60000);
    return JSZip.loadAsync(file).then(function (zip) {
      var entries = Object.keys(zip.files).map(function (k) { return zip.files[k]; })
        .filter(function (e) { return !e.dir && !/__MACOSX/.test(e.name) && !/(^|\/)\./.test(e.name); });
      var txts = entries.filter(function (e) { return /\.txt$/i.test(e.name); })
        .sort(function (a, b) { return (/spe[ck]/i.test(b.name) ? 1 : 0) - (/spe[ck]/i.test(a.name) ? 1 : 0); });
      var imgs = entries.filter(function (e) { return IMG.test(e.name); })
        .sort(function (a, b) { return naturalKey(a.name) < naturalKey(b.name) ? -1 : 1; });
      if (!imgs.length) { toast(file.name + ": tidak ada foto di dalam ZIP", true); return; }
      return (txts.length ? txts[0].async("uint8array").then(decodeText) : Promise.resolve("")).then(function (spek) {
        var info = P.parse(spek);
        var id = uniqueId(slug(info.title || file.name.replace(/\.zip$/i, "")));
        var photos = [];
        var chain = Promise.resolve();
        imgs.forEach(function (e, k) {
          chain = chain.then(function () { return e.async("blob"); })
            .then(function (b) { return compress(b, e.name); })
            .then(function (b) {
              var path = "cars/" + id + "/" + pad(k + 1) + ".jpg";
              pending[path] = b; blobUrl[path] = URL.createObjectURL(b); photos.push(path);
            });
        });
        return chain.then(function () {
          drafts.unshift({
            id: id, brand: info.brand || "", date: guessDate(file.name, imgs.map(function (e) { return e.name; })),
            photos: photos, spek: spek, status: "ready", edits: {},
            source: "admin:" + file.name, added: new Date().toISOString().slice(0, 19)
          });
          renderDrafts();
        });
      });
    }).catch(function (err) { console.error(err); toast(file.name + ": ZIP tidak bisa dibaca", true); });
  }

  /* ---------------- EDITOR ---------------- */
  var FIELDS = [
    ["brand", "Brand"], ["model", "Model / Judul"], ["year", "Tahun"], ["status", "Status"],
    ["price", "Harga (juta)"], ["market", "Harga pasaran (juta)"],
    ["color", "Warna"], ["odo", "Odometer"], ["tax", "Pajak"], ["tagline", "Tagline", "full"]
  ];

  function baseVal(base, f) {
    if (f === "tagline") return base.tagline || "";
    if (f === "price" || f === "market") return base[f] != null ? String(Math.round(base[f] * 100) / 100) : "";
    return base[f] != null ? String(base[f]) : "";
  }

  function editor(car, mode, onDone) {
    var el = document.createElement("div");
    el.className = "editor";
    var work = JSON.parse(JSON.stringify(car));
    var touched = {};
    Object.keys(work.edits || {}).forEach(function (k) { touched[k] = true; });
    var base = P.parse(work.spek);

    el.innerHTML =
      '<div class="ed-head"><div><h3 class="ed-title"></h3><small>' + esc(work.source || "") + " · " + work.photos.length + " foto · id: " + esc(work.id) + "</small></div>" +
      '<small>' + (mode === "draft" ? "DRAFT — belum masuk website" : "EDIT UNIT") + "</small></div>" +
      '<div class="ed-body"><div><div class="pv-label">Preview kartu</div><div class="pv"><img alt=""><div class="pv-in"><small></small><h4></h4><b></b><span class="save"></span></div></div>' +
      '<div class="parsed"></div></div>' +
      '<div><div class="fields">' + FIELDS.map(function (f) {
        if (f[0] === "status") {
          return '<label>Status<select data-f="status"><option value="ready">Ready</option><option value="booked">Booked</option><option value="hidden">Sembunyikan</option></select></label>';
        }
        return '<label class="' + (f[2] || "") + '">' + f[1] + '<input data-f="' + f[0] + '"></label>';
      }).join("") +
      '<label class="full">Spesifikasi (Spek.txt) — boleh diedit<textarea data-spek></textarea></label></div>' +
      '<div class="pv-label" style="margin-top:16px">Foto — ★ jadikan cover, ◀ ▶ urutkan, ✕ hapus</div><div class="photos"></div></div></div>' +
      '<div class="ed-foot">' + (mode === "draft"
        ? '<button class="btn danger" data-act="drop">Buang</button><button class="btn fire" data-act="ok">✓ Masukkan ke Website</button>'
        : '<button class="btn ghost" data-act="cancel">Batal</button><button class="btn fire" data-act="ok">Simpan</button>') + "</div>";

    var inputs = {};
    $$("[data-f]", el).forEach(function (i) { inputs[i.dataset.f] = i; });
    var ta = $("[data-spek]", el);
    ta.value = work.spek;
    inputs.status.value = work.status || "ready";

    function fill() {
      FIELDS.forEach(function (f) {
        if (f[0] === "status") return;
        var k = f[0];
        inputs[k].placeholder = baseVal(base, k) || "-";
        inputs[k].value = touched[k] && work.edits[k] != null ? work.edits[k] : baseVal(base, k);
      });
    }
    function collect() {
      work.spek = ta.value;
      work.status = inputs.status.value;
      var edits = {};
      FIELDS.forEach(function (f) {
        var k = f[0]; if (k === "status") return;
        var v = inputs[k].value.trim();
        if (touched[k] && v !== "" && v !== baseVal(base, k)) edits[k] = v;
      });
      work.edits = edits;
      work.brand = edits.brand || base.brand || work.brand;
    }
    function preview() {
      var i = P.parse(work.spek, work.edits);
      $(".ed-title", el).textContent = i.title || "(tanpa judul)";
      $(".pv img", el).src = src(work.photos[0] || "");
      $(".pv-in small", el).textContent = [i.brand, i.year, i.odo].filter(Boolean).join(" · ");
      $(".pv-in h4", el).textContent = i.model;
      $(".pv-in b", el).textContent = i.priceText;
      $(".pv-in .save", el).textContent = i.saveText ? "Hemat " + i.saveText.replace("Rp ", "") + " dari pasaran" : "";
      $(".parsed", el).innerHTML = ["Harga: " + i.priceText, i.marketText && "Pasaran: " + i.marketText, i.color && "Warna: " + i.color, i.tax && "Pajak: " + i.tax, i.engine && "Mesin: " + i.engine]
        .concat(i.badges).filter(Boolean).map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("");
    }
    function photos() {
      $(".photos", el).innerHTML = work.photos.map(function (p, k) {
        return '<div class="ph"><img src="' + esc(src(p)) + '" alt="" loading="lazy"><div class="ph-tools">' +
          '<button data-p="left" data-k="' + k + '" title="Geser kiri">◀</button><button data-p="cover" data-k="' + k + '" title="Jadikan cover">★</button>' +
          '<button data-p="del" data-k="' + k + '" title="Hapus">✕</button><button data-p="right" data-k="' + k + '" title="Geser kanan">▶</button></div></div>';
      }).join("");
    }
    $(".photos", el).addEventListener("click", function (e) {
      var b = e.target.closest("[data-p]"); if (!b) return;
      var k = +b.dataset.k, a = work.photos, act = b.dataset.p;
      if (act === "left" && k > 0) a.splice(k - 1, 0, a.splice(k, 1)[0]);
      if (act === "right" && k < a.length - 1) a.splice(k + 1, 0, a.splice(k, 1)[0]);
      if (act === "cover") a.unshift(a.splice(k, 1)[0]);
      if (act === "del") { if (a.length <= 1) return toast("Minimal 1 foto", true); a.splice(k, 1); }
      photos(); preview();
    });
    Object.keys(inputs).forEach(function (k) {
      inputs[k].addEventListener("input", function () { touched[k] = true; collect(); preview(); });
      inputs[k].addEventListener("change", function () { touched[k] = true; collect(); preview(); });
    });
    ta.addEventListener("input", function () { base = P.parse(ta.value); collect(); fill(); collect(); preview(); });

    $(".ed-foot", el).addEventListener("click", function (e) {
      var b = e.target.closest("[data-act]"); if (!b) return;
      collect();
      onDone(b.dataset.act, work);
    });

    fill(); collect(); photos(); preview();
    return el;
  }

  function renderDrafts() {
    var box = $("#drafts");
    box.innerHTML = "";
    drafts.forEach(function (d, idx) {
      box.appendChild(editor(d, "draft", function (act, work) {
        if (act === "drop") {
          d.photos.forEach(function (p) { delete pending[p]; });
          drafts.splice(drafts.indexOf(d), 1);
          renderDrafts();
          return;
        }
        drafts.splice(drafts.indexOf(d), 1);
        // foto yang dihapus di editor tidak perlu diupload
        d.photos.forEach(function (p) { if (work.photos.indexOf(p) < 0) delete pending[p]; });
        cars.unshift(work);
        renderDrafts();
        markDirty();
        $("#stockCount").textContent = cars.length;
        toast("✓ Masuk inventori. Tekan 🚀 Publish agar online.");
      }));
    });
  }

  /* ---------------- INVENTORI ---------------- */
  function renderStock() {
    $("#stockCount").textContent = cars.length;
    var box = $("#stock");
    if (!cars.length) { box.innerHTML = '<div class="empty">Belum ada unit. Upload ZIP di tab “Upload ZIP”.</div>'; return; }
    box.innerHTML = cars.map(function (c, k) {
      var i = P.parse(c.spek, c.edits);
      var isNew = c.photos.some(function (p) { return pending[p]; });
      return '<div class="st" data-k="' + k + '"><img src="' + esc(src(c.photos[0])) + '" alt="" loading="lazy">' +
        "<div><h4>" + esc(i.title) + "</h4><p>" + esc([i.year, i.priceText, c.date].filter(Boolean).join(" · ")) +
        (isNew ? ' <span class="new">• belum dipublish</span>' : "") + "</p></div>" +
        '<div class="st-tools"><select data-a="status">' +
        ["ready", "booked", "hidden"].map(function (s) {
          return '<option value="' + s + '"' + ((c.status || "ready") === s ? " selected" : "") + ">" + { ready: "Ready", booked: "Booked", hidden: "Sembunyi" }[s] + "</option>";
        }).join("") + "</select>" +
        '<button class="icon" data-a="up" title="Naikkan">↑</button><button class="icon" data-a="down" title="Turunkan">↓</button>' +
        '<button class="icon" data-a="edit" title="Edit">✎</button><button class="icon" data-a="poster" title="Poster IG Story">📸</button>' +
        '<button class="btn sold sm" data-a="sold" title="Terjual: hapus unit + semua fotonya">✓ SOLD</button></div></div>';
    }).join("");
  }

  // Hapus unit dari website + tandai fotonya untuk dihapus dari hosting saat Publish
  function removeCar(c) {
    var k = cars.indexOf(c);
    if (k < 0) return;
    cars.splice(k, 1);
    var wasNew = c.photos.every(function (p) { return pending[p]; });
    c.photos.forEach(function (p) { delete pending[p]; });
    if (!wasNew && removed.indexOf(c.id) < 0) removed.push(c.id);
  }

  function removeAll() {
    if (!cars.length) return toast("Inventori sudah kosong", true);
    if (!confirm("Hapus SEMUA " + cars.length + " unit beserta semua fotonya dari website?")) return;
    var t = prompt("Ketik HAPUS untuk konfirmasi:");
    if (!t || t.trim().toUpperCase() !== "HAPUS") return toast("Dibatalkan");
    cars.slice().forEach(removeCar);
    markDirty();
    toast("Semua unit dihapus. Tekan 🚀 Publish agar website ikut kosong.", false, 6000);
  }

  function bindStock() {
    $("#stock").addEventListener("change", function (e) {
      if (e.target.dataset.a !== "status") return;
      var k = +e.target.closest(".st").dataset.k;
      cars[k].status = e.target.value; markDirty();
    });
    $("#stock").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-a]"); if (!b) return;
      var k = +b.closest(".st").dataset.k, a = b.dataset.a, c = cars[k];
      if (a === "up" && k > 0) { cars.splice(k - 1, 0, cars.splice(k, 1)[0]); markDirty(); }
      if (a === "down" && k < cars.length - 1) { cars.splice(k + 1, 0, cars.splice(k, 1)[0]); markDirty(); }
      if (a === "sold") {
        var nm = P.parse(c.spek, c.edits).title;
        if (!confirm("✓ SOLD — " + nm + "\n\nUnit ini akan dihapus dari website beserta " + c.photos.length + " fotonya.\nLanjutkan?")) return;
        removeCar(c);
        markDirty();
        toast("🎉 " + nm + " terjual! Tekan 🚀 Publish untuk menghapusnya dari website.", false, 6000);
      }
      if (a === "edit") openModal(editor(c, "edit", function (act, work) {
        closeModal();
        if (act !== "ok") return;
        cars[cars.indexOf(c)] = work; markDirty();
      }));
      if (a === "poster") poster(c);
    });
  }

  function openModal(node) {
    var b = $("#modalBox"); b.innerHTML = ""; b.appendChild(node);
    $("#modal").classList.add("on"); $("#modal").scrollTop = 0;
    document.body.classList.add("modal-open");
  }
  function closeModal() {
    $("#modal").classList.remove("on"); $("#modalBox").innerHTML = "";
    document.body.classList.remove("modal-open");
  }

  /* ---------------- PUBLISH ---------------- */
  function buildJs() {
    var out = cars.map(function (c) {
      return { id: c.id, brand: c.brand, date: c.date, photos: c.photos, spek: c.spek, status: c.status || "ready", edits: c.edits || {}, source: c.source || "", added: c.added || "" };
    });
    return "window.VELOM_DATA = " + JSON.stringify({ cars: out, updated: new Date().toISOString().slice(0, 19) }, null, 1) + ";\n";
  }
  function usedPending() {
    var used = {};
    cars.forEach(function (c) { c.photos.forEach(function (p) { if (pending[p]) used[p] = pending[p]; }); });
    return used;
  }

  function progressModal(title) {
    var el = document.createElement("div");
    el.className = "poster-wrap";
    el.innerHTML = '<h3 style="font:700 18px var(--display)">' + esc(title) + '</h3><p class="muted p-text">Menyiapkan…</p><div class="progress" style="width:100%"><i></i></div>';
    openModal(el);
    return {
      set: function (t, f) { $(".p-text", el).textContent = t; $(".progress i", el).style.width = Math.round(f * 100) + "%"; },
      done: function () { setTimeout(closeModal, 700); }
    };
  }

  function blobB64(b) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result).split(",")[1]); };
      r.onerror = rej; r.readAsDataURL(b);
    });
  }
  function textB64(s) {
    var bytes = new TextEncoder().encode(s), bin = "";
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  // --- GitHub ---
  function gh() {
    var def = CFG.github || {};
    return {
      owner: store("gh-owner") || def.owner || "", repo: store("gh-repo") || def.repo || "",
      branch: store("gh-branch") || def.branch || "main", token: store("gh-token") || ""
    };
  }
  function ghFetch(method, path, body) {
    var g = gh();
    var url = "https://api.github.com/repos/" + g.owner + "/" + g.repo + "/contents/" +
      path.split("/").map(encodeURIComponent).join("/") + (method === "GET" ? "?ref=" + encodeURIComponent(g.branch) : "");
    return fetch(url, {
      method: method, cache: "no-store",
      headers: { Authorization: "Bearer " + g.token, Accept: "application/vnd.github+json" },
      body: body ? JSON.stringify(body) : undefined
    });
  }
  function ghPut(path, b64, msg) {
    return ghFetch("GET", path).then(function (r) { return r.ok ? r.json() : null; }).then(function (old) {
      return ghFetch("PUT", path, { message: msg, content: b64, branch: gh().branch, sha: old && old.sha ? old.sha : undefined });
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(path + " → " + r.status + " " + t.slice(0, 160)); });
    });
  }
  function ghDeleteDir(dir) {
    return ghFetch("GET", dir).then(function (r) { return r.ok ? r.json() : []; }).then(function (list) {
      var chain = Promise.resolve();
      (Array.isArray(list) ? list : []).forEach(function (f) {
        chain = chain.then(function () { return ghFetch("DELETE", f.path, { message: "Velom: hapus " + f.path, sha: f.sha, branch: gh().branch }); });
      });
      return chain;
    }).catch(function () {});
  }

  function publishGitHub() {
    var g = gh();
    if (!g.owner || !g.repo || !g.token) { switchTab("settings"); return toast("Isi dulu pengaturan GitHub di tab Publish", true); }
    var files = usedPending(), paths = Object.keys(files), total = paths.length + 1 + removed.length, n = 0;
    var pm = progressModal("Publish ke website…");
    var chain = Promise.resolve();
    paths.forEach(function (p) {
      chain = chain.then(function () { pm.set("Upload foto " + (n + 1) + "/" + paths.length, n / total); return blobB64(files[p]); })
        .then(function (b64) { return ghPut(p, b64, "Velom: foto " + p); })
        .then(function () { n++; });
    });
    removed.forEach(function (id) {
      chain = chain.then(function () { pm.set("Menghapus foto lama " + id, n / total); return ghDeleteDir("cars/" + id); }).then(function () { n++; });
    });
    chain.then(function () { pm.set("Update data inventori…", n / total); return ghPut("data/cars.js", textB64(buildJs()), "Velom: update inventori (" + cars.length + " unit)"); })
      .then(function () {
        pm.set("Selesai! Website update dalam ±1 menit.", 1); pm.done();
        markClean("Terpublish ✓ online ±1 menit lagi");
        toast("🚀 Terpublish! Website update dalam ±1 menit.", false, 5000);
      })
      .catch(function (err) { closeModal(); console.error(err); toast("Gagal publish: " + err.message, true, 8000); });
  }

  function testGitHub() {
    saveGh();
    var g = gh();
    if (!g.owner || !g.repo || !g.token) return toast("Lengkapi username, repo & token", true);
    fetch("https://api.github.com/repos/" + g.owner + "/" + g.repo, { headers: { Authorization: "Bearer " + g.token, Accept: "application/vnd.github+json" } })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) return toast("Tidak bisa akses repo: " + (res.j.message || "error"), true, 6000);
        var push = res.j.permissions && res.j.permissions.push;
        toast(push ? "✓ Terhubung ke " + res.j.full_name + " (bisa publish)" : "Terhubung, tapi token belum punya izin tulis", !push, 5000);
      }).catch(function () { toast("Koneksi gagal. Cek internet.", true); });
  }
  function saveGh() {
    store("gh-owner", $("#ghOwner").value.trim());
    store("gh-repo", $("#ghRepo").value.trim());
    store("gh-branch", $("#ghBranch").value.trim() || "main");
    if ($("#ghToken").value.trim()) store("gh-token", $("#ghToken").value.trim());
  }

  // --- Folder (File System Access API) ---
  function writeFile(dir, path, data) {
    var parts = path.split("/"), name = parts.pop(), chain = Promise.resolve(dir);
    parts.forEach(function (p) { chain = chain.then(function (d) { return d.getDirectoryHandle(p, { create: true }); }); });
    return chain.then(function (d) { return d.getFileHandle(name, { create: true }); })
      .then(function (fh) { return fh.createWritable(); })
      .then(function (w) { return w.write(data).then(function () { return w.close(); }); });
  }
  function publishFolder() {
    if (!window.showDirectoryPicker) return toast("Browser ini belum mendukung. Pakai Chrome/Edge di laptop, atau tombol 📦 Paket.", true, 6000);
    var dir;
    window.showDirectoryPicker({ id: "velom-site", mode: "readwrite" }).then(function (d) {
      dir = d;
      return dir.getFileHandle("index.html").catch(function () { throw new Error("NOTSITE"); });
    }).then(function () {
      var files = usedPending(), paths = Object.keys(files), n = 0;
      var pm = progressModal("Menyimpan ke folder…");
      var chain = Promise.resolve();
      paths.forEach(function (p) {
        chain = chain.then(function () { pm.set("Foto " + (++n) + "/" + paths.length, n / (paths.length + 1)); return writeFile(dir, p, files[p]); });
      });
      removed.forEach(function (id) {
        chain = chain.then(function () { return dir.getDirectoryHandle("cars").then(function (c) { return c.removeEntry(id, { recursive: true }); }).catch(function () {}); });
      });
      return chain.then(function () { return writeFile(dir, "data/cars.js", buildJs()); }).then(function () {
        pm.set("Selesai!", 1); pm.done();
        markClean("Tersimpan ke folder ✓");
        toast("💾 Tersimpan. Buka index.html untuk melihat.", false, 5000);
      });
    }).catch(function (err) {
      closeModal();
      if (err && err.name === "AbortError") return;
      toast(err && err.message === "NOTSITE" ? "Folder salah — pilih folder yang berisi index.html (Velom Car Auto Generate Website)" : "Gagal menyimpan: " + (err && err.message), true, 7000);
    });
  }

  // --- Paket ZIP ---
  function publishZip() {
    var z = new JSZip(), files = usedPending();
    z.file("data/cars.js", buildJs());
    Object.keys(files).forEach(function (p) { z.file(p, files[p]); });
    z.file("BACA-SAYA.txt", "Ekstrak isi ZIP ini ke folder website Velom (timpa file lama).\n" +
      (removed.length ? "Hapus juga folder berikut di dalam folder cars/: " + removed.join(", ") + "\n" : ""));
    toast("Menyiapkan paket…");
    z.generateAsync({ type: "blob" }).then(function (b) {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = "velom-update-" + new Date().toISOString().slice(0, 10) + ".zip";
      document.body.appendChild(a); a.click(); a.remove();
      markClean("Paket diunduh ✓ — ekstrak ke folder website");
    });
  }

  /* ---------------- POSTER IG STORY ---------------- */
  function loadImg(s) {
    return new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = rej; im.src = s; });
  }
  function wrap(ctx, text, maxW) {
    var words = text.split(" "), lines = [], line = "";
    words.forEach(function (w) {
      var t = line ? line + " " + w : w;
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
    });
    if (line) lines.push(line);
    return lines;
  }
  function pill(ctx, x, y, text, bg, fg, font, padX, h) {
    ctx.font = font;
    var w = ctx.measureText(text).width + padX * 2;
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fill();
    ctx.fillStyle = fg; ctx.textBaseline = "middle"; ctx.fillText(text, x + padX, y + h / 2 + 2);
    ctx.textBaseline = "alphabetic";
    return w;
  }

  function poster(car) {
    var i = P.parse(car.spek, car.edits);
    var W = 1080, H = 1920, c = document.createElement("canvas");
    c.width = W; c.height = H;
    var ctx = c.getContext("2d");
    var wrapEl = document.createElement("div");
    wrapEl.className = "poster-wrap";
    wrapEl.innerHTML = '<h3 style="font:700 18px var(--display)">Poster Instagram Story</h3><p class="muted">Ukuran 1080×1920 — siap upload ke Story / Reels cover.</p>';
    wrapEl.appendChild(c);
    var row = document.createElement("div"); row.className = "form"; row.style.flexDirection = "row";
    row.innerHTML = '<button class="btn ghost" data-x>Tutup</button><button class="btn fire" data-dl>⬇ Download PNG</button>';
    wrapEl.appendChild(row);
    openModal(wrapEl);
    $("[data-x]", wrapEl).onclick = closeModal;

    Promise.all([
      document.fonts ? document.fonts.load("900 90px Unbounded") : null,
      document.fonts ? document.fonts.load("800 40px Manrope") : null,
      document.fonts ? document.fonts.load("600 30px 'JetBrains Mono'") : null,
      loadImg(src(car.photos[0]))
    ]).then(function (r) {
      var im = r[3];
      var s = Math.max(W / im.width, H / im.height), iw = im.width * s, ih = im.height * s;
      ctx.drawImage(im, (W - iw) / 2, (H - ih) / 2 - 120, iw, ih);
      var g = ctx.createLinearGradient(0, 0, 0, 360); g.addColorStop(0, "rgba(0,0,0,.75)"); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, 360);
      g = ctx.createLinearGradient(0, 860, 0, H); g.addColorStop(0, "rgba(5,5,6,0)"); g.addColorStop(0.45, "rgba(5,5,6,.88)"); g.addColorStop(1, "rgba(5,5,6,1)");
      ctx.fillStyle = g; ctx.fillRect(0, 860, W, H - 860);

      // logo
      ctx.font = "900 58px Unbounded"; ctx.fillStyle = "#ff3b1f"; ctx.fillText("V", 70, 140);
      var vw = ctx.measureText("V").width; ctx.fillStyle = "#fff"; ctx.fillText("ELOM", 70 + vw, 140);
      var st = car.status === "sold" ? "SOLD" : car.status === "booked" ? "BOOKED" : "READY STOCK";
      ctx.font = "600 26px 'JetBrains Mono'";
      var sw = ctx.measureText(st).width + 56;
      pill(ctx, W - 70 - sw, 92, st, car.status === "sold" ? "#ff3b1f" : "rgba(255,255,255,.14)", "#fff", "600 26px 'JetBrains Mono'", 28, 62);

      // dari bawah ke atas
      var y = H - 110;
      ctx.font = "800 34px Manrope";
      var waTxt = "Chat WA  " + (CFG.whatsappDisplay || "+" + CFG.whatsapp);
      pill(ctx, 70, y - 76, waTxt, "#25d366", "#04210f", "800 34px Manrope", 36, 86);
      ctx.font = "600 26px 'JetBrains Mono'"; ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.textAlign = "right";
      ctx.fillText("link di bio ↗", W - 70, y - 26); ctx.textAlign = "left";
      y -= 140;

      if (i.badges.length) {
        var bx = 70, by = y - 54;
        i.badges.slice(0, 4).forEach(function (b) {
          var w = pill(ctx, bx, by, b.toUpperCase(), "rgba(255,255,255,.1)", "#e8e6ea", "600 22px 'JetBrains Mono'", 20, 50);
          bx += w + 12;
        });
        y -= 90;
      }
      if (i.saveText) {
        pill(ctx, 70, y - 58, "HEMAT ±" + i.saveText.replace("Rp ", "").toUpperCase() + (i.marketText ? "  ·  PASARAN " + i.marketText.toUpperCase() : ""), "rgba(61,220,132,.16)", "#3ddc84", "600 24px 'JetBrains Mono'", 22, 56);
        y -= 90;
      }
      if (i.priceNote) {
        ctx.font = "600 26px 'JetBrains Mono'"; ctx.fillStyle = "#ff8a1f"; ctx.fillText(i.priceNote.toUpperCase(), 72, y - 6);
        y -= 56;
      }
      ctx.font = "900 140px Unbounded";
      var pg = ctx.createLinearGradient(70, 0, 900, 0); pg.addColorStop(0, "#ff3b1f"); pg.addColorStop(1, "#ff8a1f");
      ctx.fillStyle = pg; ctx.fillText(i.priceText.replace("Rp ", ""), 140, y);
      ctx.font = "700 46px Unbounded"; ctx.fillStyle = "#fff"; ctx.fillText("Rp", 70, y - 70);
      y -= 190;

      ctx.font = "500 32px Manrope"; ctx.fillStyle = "rgba(255,255,255,.75)";
      ctx.fillText([i.year, i.odo, i.color ? i.color.split(/\s+on\s+/i)[0] : null, i.trans].filter(Boolean).join("  ·  "), 72, y);
      y -= 70;
      var fs = 92, lines;
      do { ctx.font = "800 " + fs + "px Unbounded"; lines = wrap(ctx, i.model, W - 140); fs -= 10; } while (lines.length > 3 && fs > 50);
      ctx.fillStyle = "#fff";
      for (var k = lines.length - 1; k >= 0; k--) { ctx.fillText(lines[k], 66, y); y -= (fs + 10) * 1.12; }
      ctx.font = "600 28px 'JetBrains Mono'"; ctx.fillStyle = "#ff3b1f";
      ctx.fillText(("● " + (i.brand || "VELOM")).toUpperCase(), 72, y + 30);

      $("[data-dl]", wrapEl).onclick = function () {
        try {
          c.toBlob(function (b) {
            var a = document.createElement("a");
            a.href = URL.createObjectURL(b); a.download = "velom-story-" + car.id + ".png";
            document.body.appendChild(a); a.click(); a.remove();
          }, "image/png");
        } catch (e) {
          toast("Buka admin lewat PREVIEW.bat / website online untuk download poster foto lama.", true, 7000);
        }
      };
    }).catch(function () { toast("Foto tidak bisa dimuat untuk poster", true); });
  }

  /* ---------------- UI ---------------- */
  function switchTab(name) {
    $$(".tab").forEach(function (t) { t.classList.toggle("on", t.dataset.tab === name); });
    $$(".panel").forEach(function (p) { p.classList.toggle("on", p.id === "tab-" + name); });
  }

  function init() {
    pinGate();
    $$(".tab").forEach(function (t) { t.onclick = function () { switchTab(t.dataset.tab); }; });
    var drop = $("#drop");
    $("#zipInput").onchange = function (e) { handleFiles(e.target.files); e.target.value = ""; };
    ["dragenter", "dragover"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("over"); }); });
    ["dragleave", "drop"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("over"); }); });
    drop.addEventListener("drop", function (e) { handleFiles(e.dataTransfer.files); });
    $("#modal").addEventListener("click", function (e) { if (e.target.id === "modal") closeModal(); });

    var g = gh();
    $("#ghOwner").value = g.owner; $("#ghRepo").value = g.repo; $("#ghBranch").value = g.branch;
    if (g.token) $("#ghToken").placeholder = "•••••• (tersimpan — isi untuk mengganti)";
    $("#ghSave").onclick = function () { saveGh(); toast("✓ Pengaturan disimpan"); };
    $("#ghTest").onclick = testGitHub;
    $("#pubGh").onclick = publishGitHub;
    $("#pubFolder").onclick = publishFolder;
    $("#pubZip").onclick = publishZip;
    $("#delAll").onclick = removeAll;
    bindStock();
    loadData();
  }
  init();
})();
