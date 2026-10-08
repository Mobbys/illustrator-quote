/* Illustrator Quote - logica del pannello (lato HTML). */
(function () {
  "use strict";

  var STORAGE_KEY = "illustratorQuote.settings";
  var DEFAULTS = {
    mode: "each",
    top: true, bottom: false, left: true, right: false,
    useVisible: false,
    unit: "mm", decimals: 1, scale: 1, comma: true, showUnit: true,
    offsetMm: 5, gapMm: 1, fontSize: 8, strokeWidth: 0.5,
    endStyle: "arrow", endSize: 5, color: "#e6007e"
  };
  var BOOL = ["top", "bottom", "left", "right", "useVisible", "comma", "showUnit"];
  var NUM = ["decimals", "scale", "offsetMm", "gapMm", "fontSize", "strokeWidth", "endSize"];
  var TEXT = ["unit", "endStyle", "color"];
  // opzioni di stile salvate nelle quote del documento (le altre restano del pannello)
  var STYLE = ["unit", "decimals", "scale", "comma", "showUnit", "offsetMm", "gapMm",
    "fontSize", "strokeWidth", "endStyle", "endSize", "color"];

  var cep = window.__adobe_cep__;
  var $ = function (id) { return document.getElementById(id); };

  // ---------- comunicazione con Illustrator ----------

  function evalScript(script, cb) {
    if (!cep) { if (cb) { cb("ERR:Il pannello va aperto dentro Illustrator."); } return; }
    cep.evalScript(script, function (res) { if (cb) { cb(res); } });
  }

  function call(fn, arg, cb) {
    var a = arg === undefined ? "" : JSON.stringify(arg);
    evalScript("IQ." + fn + "(" + a + ")", cb);
  }

  // ---------- impostazioni ----------

  function load() {
    var s = {};
    try { s = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch (e) { s = {}; }
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) { out[k] = (k in s) ? s[k] : DEFAULTS[k]; });
    return out;
  }

  function save(s) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) { /* ignora */ }
  }

  function read() {
    var s = { mode: current.mode };
    BOOL.forEach(function (k) { s[k] = $(k).checked; });
    NUM.forEach(function (k) {
      var v = parseFloat($(k).value);
      s[k] = isNaN(v) ? DEFAULTS[k] : v;
    });
    TEXT.forEach(function (k) { s[k] = $(k).value; });
    s.decimals = Math.max(0, Math.min(4, Math.round(s.decimals)));
    if (s.scale <= 0) { s.scale = 1; }
    return s;
  }

  function write(s) {
    BOOL.forEach(function (k) { $(k).checked = !!s[k]; });
    NUM.forEach(function (k) { $(k).value = s[k]; });
    TEXT.forEach(function (k) { $(k).value = s[k]; });
    setMode(s.mode);
  }

  function setMode(mode) {
    current.mode = mode;
    var btns = document.querySelectorAll("#mode button");
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle("on", btns[i].getAttribute("data-value") === mode);
    }
  }

  // ---------- UI ----------

  function status(res, okText) {
    var el = $("status");
    res = String(res || "");
    if (res.indexOf("ERR:") === 0) {
      el.textContent = res.substr(4);
      el.className = "status error";
    } else {
      el.textContent = okText ? okText(res.replace(/^OK:/, "")) : "";
      el.className = "status";
    }
  }

  // Applica al pannello uno stile letto dal documento.
  function applyStyle(style) {
    var s = read();
    STYLE.forEach(function (k) { if (style[k] !== undefined && style[k] !== null) { s[k] = style[k]; } });
    write(s);
    save(s);
  }

  var lastState = null, lastDoc = null;
  function refreshState() {
    call("state", read(), function (res) {
      if (res === lastState) { return; }
      lastState = res;
      var st;
      try { st = JSON.parse(res); } catch (e) { st = { doc: "", count: 0, quotes: 0 }; }

      // documento appena aperto o cambiato: riprendi lo stile delle sue quote
      if (st.doc !== lastDoc) {
        lastDoc = st.doc;
        if (st.docStyle) {
          applyStyle(st.docStyle);
          status("OK", function () { return "Stile ripreso dalle quote di \u201c" + st.doc + "\u201d."; });
          lastState = null;
        }
      }

      var parts = [];
      if (st.count) {
        parts.push((st.count === 1 ? "1 oggetto" : st.count + " oggetti") + " \u00b7 L " + st.w + " \u00d7 A " + st.h);
      }
      if (st.quotes) {
        parts.push(st.quotes === 1 ? "1 quota selezionata" : st.quotes + " quote selezionate");
      }
      $("info").textContent = parts.length ? parts.join(" \u00b7 ") : "Seleziona uno o pi\u00f9 oggetti";
      $("btnUpdate").disabled = !st.quotes;
      $("btnPick").disabled = !st.quotes;
    });
  }

  function applyTheme() {
    if (!cep || !cep.getHostEnvironment) { return; }
    try {
      var env = JSON.parse(cep.getHostEnvironment());
      var c = env.appSkinInfo.panelBackgroundColor.color;
      document.documentElement.style.setProperty("--bg", "rgb(" + Math.round(c.red) + "," + Math.round(c.green) + "," + Math.round(c.blue) + ")");
      document.body.classList.toggle("light", (c.red + c.green + c.blue) / 3 > 128);
    } catch (e) { /* tema di default */ }
  }

  var current = { mode: DEFAULTS.mode };

  function init() {
    write(load());
    applyTheme();
    if (cep && cep.addEventListener) {
      cep.addEventListener("com.adobe.csxs.events.ThemeColorChanged", applyTheme);
    }

    document.querySelectorAll("#mode button").forEach(function (b) {
      b.addEventListener("click", function () { setMode(b.getAttribute("data-value")); save(read()); });
    });
    document.querySelectorAll("input, select").forEach(function (el) {
      el.addEventListener("change", function () { save(read()); lastState = null; refreshState(); });
    });

    $("btnQuote").addEventListener("click", function () {
      var s = read();
      save(s);
      call("quote", s, function (res) {
        status(res, function (n) { return n === "0" ? "Nessuna quota da disegnare." : n + (n === "1" ? " quota aggiunta." : " quote aggiunte."); });
        lastState = null;
      });
    });
    $("btnUpdate").addEventListener("click", function () {
      var s = read();
      save(s);
      call("update", s, function (res) {
        status(res, function (n) { return n === "1" ? "1 quota aggiornata." : n + " quote aggiornate."; });
        lastState = null;
      });
    });
    $("btnPick").addEventListener("click", function () {
      call("styleOfSelection", undefined, function (res) {
        if (String(res).indexOf("OK:") === 0) {
          try { applyStyle(JSON.parse(res.substr(3))); } catch (e) { /* ignora */ }
          status("OK", function () { return "Stile copiato dalla quota."; });
          lastState = null;
        } else {
          status(res);
        }
      });
    });
    $("btnClear").addEventListener("click", function () {
      if (!window.confirm("Eliminare tutte le quote del documento?")) { return; }
      call("clearAll", undefined, function (res) {
        status(res, function () { return "Quote eliminate."; });
      });
    });
    $("btnToggle").addEventListener("click", function () {
      call("toggleVisible", undefined, function (res) {
        status(res, function (v) { return v === "1" ? "Quote visibili." : "Quote nascoste."; });
      });
    });

    refreshState();
    setInterval(refreshState, 1000);
  }

  document.addEventListener("DOMContentLoaded", init);
}());
