/* Illustrator Quote - logica del pannello (lato HTML). */
(function () {
  "use strict";

  var STORAGE_KEY = "illustratorQuote.settings";
  var PRESETS_KEY = "illustratorQuote.presets";
  var DEFAULTS = {
    mode: "each",
    top: true, bottom: false, left: true, right: false,
    aligned: false, useVisible: false, lockLayer: false,
    unit: "mm", decimals: 1, scale: 1, comma: true, showUnit: true,
    sizeFactor: 1, offsetMm: 5, gapMm: 1, textGapMm: 1, fontSize: 8, strokeWidth: 0.5,
    endStyle: "arrow", endSize: 5, color: "#e6007e", textColor: "#e6007e"
  };
  var BOOL = ["top", "bottom", "left", "right", "aligned", "useVisible", "lockLayer", "comma", "showUnit"];
  var NUM = ["decimals", "scale", "sizeFactor", "offsetMm", "gapMm", "textGapMm", "fontSize", "strokeWidth", "endSize"];
  var TEXT = ["unit", "endStyle", "color", "textColor"];
  // opzioni di stile: salvate nelle quote del documento e nei preset (le altre restano del pannello)
  var STYLE = ["unit", "decimals", "scale", "comma", "showUnit", "sizeFactor", "offsetMm", "gapMm",
    "textGapMm", "fontSize", "strokeWidth", "endStyle", "endSize", "color", "textColor"];

  var cep = window.__adobe_cep__;
  var $ = function (id) { return document.getElementById(id); };
  var current = { mode: DEFAULTS.mode };

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
      var v = parseFloat(String($(k).value).replace(",", "."));
      s[k] = isNaN(v) ? DEFAULTS[k] : v;
    });
    TEXT.forEach(function (k) { s[k] = $(k).value; });
    s.decimals = Math.max(0, Math.min(4, Math.round(s.decimals)));
    if (s.scale <= 0) { s.scale = 1; }
    if (s.sizeFactor <= 0) { s.sizeFactor = 1; }
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
    var circle = (mode === "diameter" || mode === "radius");
    $("sides").hidden = circle || (mode === "points" && $("aligned").checked);
    $("pointsOpts").hidden = mode !== "points";
    $("visibleOpt").hidden = mode === "points";
  }

  // Applica al pannello uno stile (dal documento, da una quota o da un preset).
  function applyStyle(style) {
    var s = read();
    STYLE.forEach(function (k) { if (style[k] !== undefined && style[k] !== null && style[k] !== "") { s[k] = style[k]; } });
    // stili salvati prima che esistesse il colore del testo: testo dello stesso colore delle linee
    if (!style.textColor && style.color) { s.textColor = style.color; }
    write(s);
    save(s);
  }

  function styleOf(s) {
    var st = {};
    STYLE.forEach(function (k) { st[k] = s[k]; });
    return st;
  }

  // ---------- preset (salvati su questo computer, esportabili su file) ----------

  function loadPresets() {
    try { return JSON.parse(localStorage.getItem(PRESETS_KEY)) || {}; } catch (e) { return {}; }
  }

  function savePresets(p) {
    try { localStorage.setItem(PRESETS_KEY, JSON.stringify(p)); } catch (e) { /* ignora */ }
  }

  function renderPresets(selected) {
    var p = loadPresets(), sel = $("presetList");
    sel.innerHTML = "";
    var first = document.createElement("option");
    first.value = "";
    first.textContent = Object.keys(p).length ? "Scegli un preset…" : "Nessun preset salvato";
    sel.appendChild(first);
    Object.keys(p).sort(function (a, b) { return a.localeCompare(b); }).forEach(function (name) {
      var o = document.createElement("option");
      o.value = name;
      o.textContent = name;
      sel.appendChild(o);
    });
    sel.value = selected && p[selected] ? selected : "";
    $("btnPresetDelete").disabled = !sel.value;
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

  function say(text) { status("OK:", function () { return text; }); }

  var lastState = null, lastDoc = null;
  function refreshState() {
    call("state", read(), function (res) {
      if (res === lastState) { return; }
      lastState = res;
      var st;
      try { st = JSON.parse(res); } catch (e) { st = { doc: "", count: 0, quotes: 0, points: 0 }; }

      // documento appena aperto o cambiato: riprendi lo stile delle sue quote
      if (st.doc !== lastDoc) {
        lastDoc = st.doc;
        if (st.docStyle && st.docStyle.legacyError) {
          status("ERR:Ho trovato le impostazioni del vecchio sistema ma non riesco a leggerle (" + st.docStyle.legacyError + ").");
        } else if (st.docStyle) {
          applyStyle(st.docStyle);
          say(st.docStyle.legacy
            ? "Stile ripreso dalle impostazioni del vecchio sistema di quotatura."
            : "Stile ripreso dalle quote di “" + st.doc + "”.");
          lastState = null;
        }
      }

      var parts = [];
      if (current.mode === "points") {
        parts.push(st.points === 1 ? "1 punto selezionato" : (st.points || 0) + " punti selezionati");
      } else if (st.count) {
        parts.push((st.count === 1 ? "1 oggetto" : st.count + " oggetti") + " · L " + st.w + " × A " + st.h);
      }
      if (st.quotes) {
        parts.push(st.quotes === 1 ? "1 quota selezionata" : st.quotes + " quote selezionate");
      }
      $("info").textContent = parts.length ? parts.join(" · ") : "Seleziona uno o più oggetti";
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

  // Pulsante che chiede un secondo clic di conferma (confirm() non è affidabile nei pannelli CEP).
  function confirmButton(btn, label, action) {
    var original = btn.textContent, timer = null;
    btn.addEventListener("click", function () {
      if (timer) {
        clearTimeout(timer);
        timer = null;
        btn.textContent = original;
        btn.classList.remove("armed");
        action();
        return;
      }
      btn.textContent = label;
      btn.classList.add("armed");
      timer = setTimeout(function () {
        timer = null;
        btn.textContent = original;
        btn.classList.remove("armed");
      }, 3000);
    });
  }

  function init() {
    write(load());
    renderPresets();
    applyTheme();

    // ricorda se "Altre opzioni di stile" è aperto
    try { $("styleMore").open = localStorage.getItem("illustratorQuote.styleMore") === "1"; } catch (e) { /* ignora */ }
    $("styleMore").addEventListener("toggle", function () {
      try { localStorage.setItem("illustratorQuote.styleMore", $("styleMore").open ? "1" : "0"); } catch (e) { /* ignora */ }
    });
    if (cep && cep.addEventListener) {
      cep.addEventListener("com.adobe.csxs.events.ThemeColorChanged", applyTheme);
    }

    document.querySelectorAll("#mode button").forEach(function (b) {
      b.addEventListener("click", function () { setMode(b.getAttribute("data-value")); save(read()); lastState = null; refreshState(); });
    });
    document.querySelectorAll("input, select").forEach(function (el) {
      if (el.id === "presetList" || el.id === "presetName") { return; }
      el.addEventListener("change", function () { save(read()); setMode(current.mode); lastState = null; refreshState(); });
    });

    document.querySelectorAll("[data-factor]").forEach(function (b) {
      b.addEventListener("click", function () {
        $("sizeFactor").value = b.getAttribute("data-factor");
        save(read());
      });
    });

    $("lockLayer").addEventListener("change", function () {
      call("setLocked", $("lockLayer").checked);
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
          say("Stile copiato dalla quota.");
          lastState = null;
        } else {
          status(res);
        }
      });
    });

    // preset
    $("presetList").addEventListener("change", function () {
      var name = $("presetList").value, p = loadPresets();
      $("btnPresetDelete").disabled = !name;
      if (name && p[name]) {
        applyStyle(p[name]);
        $("presetName").value = name;
        say("Preset “" + name + "” applicato.");
      }
    });
    $("btnPresetSave").addEventListener("click", function () {
      var name = $("presetName").value.trim();
      if (!name) { status("ERR:Scrivi un nome per il preset."); $("presetName").focus(); return; }
      var p = loadPresets();
      var existed = !!p[name];
      p[name] = styleOf(read());
      savePresets(p);
      renderPresets(name);
      say(existed ? "Preset “" + name + "” aggiornato." : "Preset “" + name + "” salvato.");
    });
    $("presetName").addEventListener("keydown", function (e) {
      if (e.key === "Enter") { $("btnPresetSave").click(); }
    });
    confirmButton($("btnPresetDelete"), "Conferma", function () {
      var name = $("presetList").value, p = loadPresets();
      if (!name) { return; }
      delete p[name];
      savePresets(p);
      renderPresets();
      say("Preset “" + name + "” eliminato.");
    });
    $("btnPresetExport").addEventListener("click", function () {
      var p = loadPresets();
      if (!Object.keys(p).length) { status("ERR:Non ci sono preset da esportare."); return; }
      call("exportPresets", JSON.stringify({ illustratorQuotePresets: 1, presets: p }, null, 2), function (res) {
        status(res, function (f) { return f ? "Preset esportati in " + f + "." : ""; });
      });
    });
    $("btnPresetImport").addEventListener("click", function () {
      call("importPresets", undefined, function (res) {
        if (String(res).indexOf("OK:") !== 0) { status(res); return; }
        var text = res.substr(3);
        if (!text) { return; }
        try {
          var data = JSON.parse(text), incoming = data.presets || data, p = loadPresets(), n = 0;
          Object.keys(incoming).forEach(function (name) {
            if (incoming[name] && typeof incoming[name] === "object") { p[name] = incoming[name]; n++; }
          });
          savePresets(p);
          renderPresets();
          say(n === 1 ? "1 preset importato." : n + " preset importati.");
        } catch (e) {
          status("ERR:Il file non contiene preset validi.");
        }
      });
    });

    confirmButton($("btnClear"), "Clicca di nuovo per eliminare", function () {
      call("clearAll", undefined, function (res) {
        status(res, function () { return "Quote eliminate."; });
        lastState = null;
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
