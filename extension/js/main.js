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

  var lastInfo = null;
  function refreshInfo() {
    call("measure", read(), function (res) {
      if (res === lastInfo) { return; }
      lastInfo = res;
      var el = $("info");
      if (!res || res === "undefined" || res.indexOf("EvalScript error") === 0) {
        el.textContent = "Seleziona uno o più oggetti";
        return;
      }
      var p = res.split("|");
      el.textContent = (p[0] === "1" ? "1 oggetto" : p[0] + " oggetti") + " · L " + p[1] + " × A " + p[2];
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
      el.addEventListener("change", function () { save(read()); lastInfo = null; refreshInfo(); });
    });

    $("btnQuote").addEventListener("click", function () {
      var s = read();
      save(s);
      call("quote", s, function (res) {
        status(res, function (n) { return n === "0" ? "Nessuna quota da disegnare." : n + (n === "1" ? " quota aggiunta." : " quote aggiunte."); });
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

    refreshInfo();
    setInterval(refreshInfo, 1000);
  }

  document.addEventListener("DOMContentLoaded", init);
}());
