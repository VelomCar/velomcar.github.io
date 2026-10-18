/* =========================================================
   VELOM — Pembaca Spek.txt otomatis
   Mengubah teks spesifikasi bebas dari showroom menjadi data rapi:
   judul, tahun, harga, harga pasaran, warna, odometer, pajak, badge, dll.
   Dipakai oleh halaman customer (index.html) dan admin (admin.html).
   ========================================================= */
(function () {
  "use strict";

  var BRANDS = [
    ["MERCEDES-BENZ", "Mercedes-Benz"], ["MERCEDES BENZ", "Mercedes-Benz"], ["MERCEDES", "Mercedes-Benz"],
    ["MERCY", "Mercedes-Benz"], ["ROLLS-ROYCE", "Rolls-Royce"], ["ROLLS ROYCE", "Rolls-Royce"],
    ["LAND ROVER", "Land Rover"], ["RANGE ROVER", "Land Rover"], ["ASTON MARTIN", "Aston Martin"],
    ["BMW", "BMW"], ["PORSCHE", "Porsche"], ["TOYOTA", "Toyota"], ["LEXUS", "Lexus"], ["HONDA", "Honda"],
    ["AUDI", "Audi"], ["VOLKSWAGEN", "Volkswagen"], ["MINI", "MINI"], ["FERRARI", "Ferrari"],
    ["LAMBORGHINI", "Lamborghini"], ["BENTLEY", "Bentley"], ["MASERATI", "Maserati"], ["JAGUAR", "Jaguar"],
    ["VOLVO", "Volvo"], ["NISSAN", "Nissan"], ["MITSUBISHI", "Mitsubishi"], ["MAZDA", "Mazda"],
    ["SUZUKI", "Suzuki"], ["DAIHATSU", "Daihatsu"], ["HYUNDAI", "Hyundai"], ["KIA", "Kia"],
    ["WULING", "Wuling"], ["TESLA", "Tesla"], ["JEEP", "Jeep"], ["FORD", "Ford"], ["CHEVROLET", "Chevrolet"],
    ["SUBARU", "Subaru"], ["MCLAREN", "McLaren"], ["BYD", "BYD"], ["CHERY", "Chery"],
    ["ALPHARD", "Toyota"], ["VELLFIRE", "Toyota"]
  ];

  var PAINTS = [
    [/skyscraper|nardo|brooklyn|dravit/i, "#7d8288"],
    [/black|hitam|obsidian|sapphire black|carbon black/i, "#0b0b0d"],
    [/white|putih|alpine|mineral white|polar/i, "#e9eaec"],
    [/silver|perak|platinum/i, "#b9bdc3"],
    [/grey|gray|abu|graphite|titanium|selenite/i, "#5d6268"],
    [/red|merah|rosso|melbourne/i, "#8f0e12"],
    [/orange|oranye|kyalami|sakhir|sunset/i, "#c9521c"],
    [/yellow|kuning|giallo|sao paulo/i, "#d6a915"],
    [/blue|biru|portimao|marina|tanzanite|navy/i, "#0f2f6e"],
    [/green|hijau|isle of man|british racing/i, "#1d4a2e"],
    [/brown|coklat|cokelat|bronze/i, "#4a2c1b"],
    [/gold|emas|champagne/i, "#b8975a"],
    [/purple|ungu|violet/i, "#3c1f5c"]
  ];

  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  function findBrand(text) {
    var up = (text || "").toUpperCase();
    for (var i = 0; i < BRANDS.length; i++) {
      var re = new RegExp("(^|[^A-Z])" + esc(BRANDS[i][0]) + "([^A-Z]|$)");
      if (re.test(up)) return { key: BRANDS[i][0], name: BRANDS[i][1] };
    }
    return null;
  }

  function tame(word) {
    // "OPULENCE" -> "Opulence", tapi "LCI", "AMG", "G12", "740Li", "iDrive8" tetap
    if (/\d/.test(word) || word.length <= 3) return word;
    if (word === word.toUpperCase() && /[A-Z]/.test(word)) return word.charAt(0) + word.slice(1).toLowerCase();
    return word;
  }
  function tameText(s) { return s.split(/(\s+|-)/).map(tame).join(""); }

  function sentence(s) {
    s = s.trim().replace(/\s+/g, " ");
    if (!s) return s;
    if (s === s.toUpperCase()) s = s.toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /* ---------- harga ---------- */
  function parseAmount(str) {
    if (str == null) return null;
    if (typeof str === "number") return str;
    var m = String(str).match(/(\d+(?:[.,]\d+)*)\s*(JUTA|JT|MILYAR|MILIAR|M|B)?(?![A-Z])/i);
    if (!m) return null;
    var s = m[1], unit = (m[2] || "").toUpperCase(), v;
    if (unit === "M" || unit === "B" || unit === "MILYAR" || unit === "MILIAR") {
      v = parseFloat(s.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
      if (/^\d{1,2}[.,]\d+$/.test(s)) v = parseFloat(s.replace(",", "."));
      return v * 1000;
    }
    if (unit === "JT" || unit === "JUTA") {
      return parseFloat(s.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
    }
    if (/^\d{1,3}([.,]\d{3})+$/.test(s)) {
      v = parseInt(s.replace(/[.,]/g, ""), 10);
      return v >= 1e6 ? v / 1e6 : v;
    }
    v = parseFloat(s.replace(",", "."));
    if (v >= 1e6) return v / 1e6;
    return v < 20 ? v * 1000 : v;
  }

  function fmtPrice(jt, short) {
    if (jt == null || isNaN(jt)) return "Hubungi kami";
    if (jt >= 1000) {
      return (short ? "" : "Rp ") + (jt / 1000).toLocaleString("id-ID", { maximumFractionDigits: 2 }) + " M";
    }
    return (short ? "" : "Rp ") + Math.round(jt).toLocaleString("id-ID") + " Jt";
  }

  function spokenPrice(jt) {
    if (jt == null) return "silakan hubungi kami";
    if (jt >= 1000) return (jt / 1000).toLocaleString("id-ID", { maximumFractionDigits: 2 }) + " miliar rupiah";
    return Math.round(jt) + " juta rupiah";
  }

  function paintFor(color) {
    var c = (color || "").split(/\s+on\s+/i)[0];
    for (var i = 0; i < PAINTS.length; i++) if (PAINTS[i][0].test(c)) return PAINTS[i][1];
    return "#16171a";
  }

  var BADGES = [
    [/flood\s*free|bebas\s*banjir|banjir\s*free/i, "Bebas Banjir"],
    [/accident|bebas\s*tabrak/i, "Bebas Tabrakan"],
    [/tangan\s*pertama|first\s*hand|1st\s*hand/i, "Tangan Pertama"],
    [/service\s*record/i, "Full Service Record"],
    [/warrant|waranty|garansi/i, "Garansi Aktif"],
    [/\bppf\b/i, "Full PPF"],
    [/surat\s*lengkap|papers?\s*complete|all\s*papers/i, "Surat Lengkap"],
    [/spare\s*key|kunci\s*cadangan/i, "Spare Key"],
    [/low\s*odo/i, "Low Odo"],
    [/inspeksi|inspection/i, "Inspeksi Ready"],
    [/kirim.*indonesia|seluruh\s*indonesia/i, "Kirim Se-Indonesia"]
  ];

  var RE_PRICE = /\b(PRICE|HARGA)\b/i;
  var RE_MARKET = /(MARKET\s*PRICE|PASARAN|HARGA\s*PASAR|HARGA\s*BARU)/i;
  // baris yang tidak ditampilkan ke customer
  var RE_HIDE = /test\s*drive|video\s*call|kredit|leasing|cicilan/i;

  function parse(raw, edits) {
    edits = edits || {};
    raw = (raw || "").replace(/\r/g, "");
    var lines = raw.split("\n").map(function (l) { return l.trim(); });
    var all = lines.join("\n");

    // --- kelompokkan per blok (dipisah baris kosong atau ".") ---
    var blocks = [], cur = [];
    lines.forEach(function (l) {
      if (!l || /^[.\-—–_•*~=]+$/.test(l)) { if (cur.length) blocks.push(cur); cur = []; }
      else cur.push(l);
    });
    if (cur.length) blocks.push(cur);

    // --- judul ---
    var tb = -1, tl = -1;
    for (var b = 0; b < blocks.length && tb < 0; b++) {
      for (var j = 0; j < blocks[b].length; j++) {
        if (findBrand(blocks[b][j]) && !RE_PRICE.test(blocks[b][j])) { tb = b; tl = j; break; }
      }
    }
    if (tb < 0 && blocks.length) { tb = 0; tl = 0; }
    var titleLine = tb >= 0 ? blocks[tb][tl] : "Mobil";
    var segs = titleLine.split("!").map(function (s) { return s.trim(); }).filter(Boolean);
    var titleRaw = segs[0] || titleLine;
    var highlights = segs.slice(1).map(sentence);

    var brandHit = findBrand(titleRaw);
    var brand = brandHit ? brandHit.name : "";
    var years = titleRaw.match(/\b(19[5-9]\d|20[0-4]\d)\b/g);
    var year = years ? years[years.length - 1] : null;
    var model = titleRaw;
    if (brandHit) model = model.replace(new RegExp(esc(brandHit.key), "i"), "");
    model = model.replace(/^\s*(BENZ)\b/i, "");
    if (year) model = model.replace(new RegExp("\\s*\\b" + year + "\\b\\s*$"), "");
    model = tameText(model.replace(/\s+/g, " ").trim());

    // --- tagline ---
    var tags = [];
    if (tb >= 0) {
      blocks[tb].forEach(function (l, i) {
        if (i === tl) return;
        l.split("!").forEach(function (s) {
          s = s.replace(/^FOR\s+SALE\s*/i, "").trim();
          if (s && !RE_PRICE.test(s)) tags.push(sentence(s));
        });
      });
    }

    // --- harga ---
    var price = null, priceNote = "", market = null;
    lines.forEach(function (l) {
      if (RE_MARKET.test(l)) {
        if (market == null) market = parseAmount(l.replace(RE_MARKET, ""));
      } else if (RE_PRICE.test(l) && price == null) {
        var rest = l.replace(/^.*?\b(PRICE|HARGA)\b\s*:?\s*/i, "");
        price = parseAmount(rest);
        priceNote = rest.replace(/^\s*[\d.,]+\s*(JUTA|JT|MILYAR|MILIAR|M|B)?(?![A-Z])/i, "")
          .replace(/[!+]+/g, " ").trim();
        priceNote = priceNote ? priceNote.split(/\s+/).map(function (w) {
          return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        }).join(" ") : "";
      }
    });

    // --- fakta ---
    var m, odo = null, color = null, tax = null, engine = null, trans = null;
    if ((m = all.match(/\bODO(?:METER)?\b\s*:?\s*([\d.,]+\s*(?:rb|ribu|k)?)\s*(miles|mls|mil|km)?/i))) {
      var unit = m[2] ? (/km/i.test(m[2]) ? "km" : "miles") : "";
      odo = (m[1].replace(/\s+/g, "").toLowerCase() + " " + unit).trim();
    }
    if ((m = all.match(/\b(?:COLOU?R|WARNA)\b\s*:?\s*([^\n]+)/i))) color = m[1].trim();
    if (!color) {
      for (var k = 0; k < lines.length; k++) {
        if (/^[A-Za-z ]{3,30}\s+on\s+[A-Za-z ]{3,30}$/i.test(lines[k])) { color = lines[k]; break; }
      }
    }
    if (color) color = color.replace(/\bON\b/gi, "on").split(" ").map(tame).join(" ");
    if ((m = all.match(/\b(?:PAJAK|TAX)\b\s*:?\s*(\d{1,2})\s*[.\/\-]\s*(\d{2,4})/i))) tax = m[1] + "/" + m[2];
    if (/\b(AUTOMATIC|MATIC|STEPTRONIC|AUTO\s*TRANS)/i.test(all)) trans = "Automatic";
    else if (/\bMANUAL\s*TRANS/i.test(all)) trans = "Manual";
    for (var e = 0; e < lines.length; e++) {
      if (/\b\d[.,]\d\s*L\b|\b\d[.,]?\d{3}\s*cc\b/i.test(lines[e]) && !RE_PRICE.test(lines[e])) {
        engine = lines[e].replace(/^engine\s*:?\s*/i, "").replace(/!+$/, "").trim();
        break;
      }
    }
    var nik = (m = all.match(/\bNIK\s*:?\s*(\d{4})/i)) ? m[1] : null;
    var reg = (m = all.match(/\bREG\s*:?\s*(\d{4})/i)) ? m[1] : null;

    var badges = [];
    BADGES.forEach(function (bd) { if (bd[0].test(all) && badges.indexOf(bd[1]) < 0) badges.push(bd[1]); });

    // --- seksi untuk terminal spesifikasi ---
    var sections = [];
    blocks.forEach(function (blk, bi) {
      if (bi === tb) return;
      var ls = blk.filter(function (l) { return !RE_PRICE.test(l) && !RE_MARKET.test(l) && !RE_HIDE.test(l); });
      if (!ls.length) return;
      var head = null;
      var isHead = function (l) { return /[!:]$/.test(l) && l === l.toUpperCase() && l.length <= 42; };
      if (ls.length > 1 && isHead(ls[0]) && !isHead(ls[1])) head = ls.shift().replace(/[!:]+$/, "");
      sections.push({
        header: head,
        lines: ls.map(function (l) {
          var cls = "";
          if (/(FREE|GOOD|BAIK|TERAWAT|READY|AMAN|LENGKAP|COMPLETE)/i.test(l)) cls = "ok";
          else if (l === l.toUpperCase() && /!$/.test(l)) cls = "em";
          return { t: l, cls: cls };
        })
      });
    });

    // --- terapkan editan admin ---
    if (edits.brand) brand = edits.brand;
    if (edits.model) model = edits.model;
    if (edits.year) year = String(edits.year);
    if (edits.price != null && edits.price !== "") price = parseAmount(edits.price);
    if (edits.market != null && edits.market !== "") market = parseAmount(edits.market);
    if (edits.color) color = edits.color;
    if (edits.odo) odo = edits.odo;
    if (edits.tax) tax = edits.tax;
    if (edits.tagline) tags = [edits.tagline];

    var save = (price != null && market != null && market > price) ? market - price : null;
    var title = ((brand ? brand + " " : "") + model).trim();

    var summary = [
      title + (year ? ", tahun " + year : "") + ".",
      tags[0] ? tags[0] + "." : "",
      odo ? "Odometer " + odo.replace("rb", " ribu") + "." : "",
      color ? "Warna " + color + "." : "",
      engine ? "Mesin " + engine + "." : "",
      badges.length ? badges.slice(0, 4).join(", ") + "." : "",
      "Harga " + spokenPrice(price) + (priceNote ? ", " + priceNote.toLowerCase() : "") + ".",
      save ? "Lebih hemat sekitar " + spokenPrice(save) + " dari harga pasaran." : "",
      "Hubungi Velom lewat WhatsApp sekarang."
    ].filter(Boolean).join(" ");

    return {
      brand: brand, model: model || title, title: title, year: year,
      tagline: tags.join(" — "), tags: tags, highlights: highlights,
      price: price, priceText: fmtPrice(price), priceNote: priceNote,
      market: market, marketText: market != null ? fmtPrice(market) : null,
      save: save, saveText: save != null ? fmtPrice(save) : null,
      color: color, paint: paintFor(color), odo: odo, tax: tax, trans: trans, engine: engine,
      nik: nik, reg: reg, badges: badges, sections: sections, summary: summary
    };
  }

  function waLink(number, text) {
    return "https://wa.me/" + number + "?text=" + encodeURIComponent(text);
  }

  window.VelomParse = {
    parse: parse, parseAmount: parseAmount, fmtPrice: fmtPrice, findBrand: findBrand,
    paintFor: paintFor, waLink: waLink, tameText: tameText
  };
})();
