// Quota gli oggetti selezionati con le impostazioni attuali del pannello Quote.
// Compare in File > Script: collegalo a un tasto F creando un'Azione (vedi README).
(function () {
    var ID = "com.mobbys.illustratorquote", opts = {}, i;
    var f = new File(Folder.userData + "/IllustratorQuote/settings.json");
    if (f.exists) {
        f.encoding = "UTF-8";
        f.open("r");
        var text = f.read();
        f.close();
        try { opts = eval("(" + text + ")"); } catch (e) { opts = {}; }
    }
    var candidates = [
        opts.engine,
        Folder.userData + "/Adobe/CEP/extensions/" + ID + "/jsx/quote.jsx",
        "/Library/Application Support/Adobe/CEP/extensions/" + ID + "/jsx/quote.jsx"
    ], engine = null;
    for (i = 0; i < candidates.length; i++) {
        if (candidates[i] && new File(candidates[i]).exists) { engine = new File(candidates[i]); break; }
    }
    if (!engine) { alert("Pannello Quote non trovato: reinstallalo."); return; }
    $.evalFile(engine);
    var res = String(IQ.quote(opts));
    if (res.indexOf("ERR:") === 0) { alert(res.substr(4)); }
}());
