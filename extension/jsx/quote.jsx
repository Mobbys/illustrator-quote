/*
 * Illustrator Quote - motore ExtendScript.
 *
 * Disegna quote (linee di misura, linee di richiamo, frecce e testo) attorno
 * agli oggetti selezionati. Tutte le quote finiscono nel livello "Quote",
 * ognuna in un gruppo separato, così si possono nascondere o cancellare in blocco.
 * Ogni gruppo salva nella sua nota geometria e stile, per poterlo aggiornare.
 *
 * Nota: ExtendScript è ES3, quindi niente let/const, arrow function, forEach, ecc.
 * Coordinate Illustrator: punti (pt), y crescente verso l'alto,
 * bounds = [sinistra, alto, destra, basso].
 */

var IQ = (function () {
    var VERSION = "0.6.0";
    var LAYER_NAME = "Quote";
    var PT_PER_UNIT = { mm: 72 / 25.4, cm: 72 / 2.54, "in": 72, pt: 1, px: 1 };

    var DEFAULTS = {
        unit: "mm",          // unità mostrata nel testo
        decimals: 1,
        comma: true,         // separatore decimale ","
        showUnit: true,      // aggiunge " mm" al testo
        scale: 1,            // scala disegno 1:N (valore reale = misura * N)
        mode: "each",        // each | all | gaps | points | diameter | radius
        top: true,           // larghezza sopra
        bottom: false,       // larghezza sotto
        left: true,          // altezza a sinistra
        right: false,        // altezza a destra
        aligned: false,      // modalità punti: distanza diretta tra 2 punti
        useVisible: false,   // true = include lo spessore del tratto
        lockLayer: false,    // blocca il livello Quote dopo aver quotato
        sizeFactor: 1,       // moltiplicatore di tutte le dimensioni grafiche
        offsetMm: 5,         // distanza linea di quota dall'oggetto
        gapMm: 1,            // stacco tra oggetto e linea di richiamo
        extMm: 1.5,          // sporgenza della linea di richiamo oltre la quota
        textGapMm: 1,        // distanza testo / linea di quota
        fontSize: 8,         // pt
        strokeWidth: 0.5,    // pt
        endSize: 5,          // dimensione terminali in pt
        endStyle: "arrow",   // arrow | tick | dot | none
        color: "cmyk(0,100,0,0)", // colore di linee e frecce ("#rrggbb" o "cmyk(c,m,y,k)")
        textColor: ""        // colore del testo ("" = come le linee)
    };

    // Opzioni che definiscono lo stile di una quota (salvate dentro ogni quota).
    var STYLE_KEYS = ["unit", "decimals", "comma", "showUnit", "scale", "sizeFactor", "offsetMm", "gapMm",
        "extMm", "textGapMm", "fontSize", "strokeWidth", "endSize", "endStyle", "color", "textColor"];
    var NOTE_PREFIX = "IQ1:";
    var LINE_NAME = "IQ_line";
    // Tag messo sugli oggetti quotati: contiene gli id (",id1,id2,") che li collegano alle loro quote.
    var SRC_TAG = "IQsrc";

    // ---------- utilità ----------

    // JSON minimale (ExtendScript di Illustrator non ha l'oggetto JSON).
    function toJSON(v) {
        var i, k, parts;
        if (v === null || v === undefined) { return "null"; }
        if (typeof v === "number") { return isFinite(v) ? String(v) : "null"; }
        if (typeof v === "boolean") { return v ? "true" : "false"; }
        if (typeof v === "string") {
            return '"' + v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n") + '"';
        }
        if (v instanceof Array) {
            parts = [];
            for (i = 0; i < v.length; i++) { parts.push(toJSON(v[i])); }
            return "[" + parts.join(",") + "]";
        }
        parts = [];
        for (k in v) { if (v.hasOwnProperty(k)) { parts.push(toJSON(k) + ":" + toJSON(v[k])); } }
        return "{" + parts.join(",") + "}";
    }

    function pickStyle(o) {
        var st = {}, i;
        for (i = 0; i < STYLE_KEYS.length; i++) { st[STYLE_KEYS[i]] = o[STYLE_KEYS[i]]; }
        return st;
    }

    // Legge i dati salvati in una quota; null se il gruppo non è una quota.
    function readQuoteData(g) {
        try {
            var n = g.note;
            if (!n || n.indexOf(NOTE_PREFIX) !== 0) { return null; }
            return eval("(" + n.substr(NOTE_PREFIX.length) + ")");
        } catch (e) {
            return null;
        }
    }

    function merge(opts) {
        var o = {}, k;
        for (k in DEFAULTS) { if (DEFAULTS.hasOwnProperty(k)) { o[k] = DEFAULTS[k]; } }
        if (opts) { for (k in opts) { if (opts.hasOwnProperty(k) && opts[k] !== null && opts[k] !== undefined) { o[k] = opts[k]; } } }
        if (!(o.sizeFactor > 0)) { o.sizeFactor = 1; }
        return o;
    }

    function mm(v) { return v * PT_PER_UNIT.mm; }

    // Dimensioni grafiche in pt, già moltiplicate per il fattore.
    function sizes(o) {
        var k = o.sizeFactor;
        return {
            offset: mm(o.offsetMm) * k, gap: mm(o.gapMm) * k, ext: mm(o.extMm) * k,
            textGap: mm(o.textGapMm) * k, font: o.fontSize * k, stroke: o.strokeWidth * k, end: o.endSize * k
        };
    }

    function formatLength(pt, o) {
        var factor = PT_PER_UNIT[o.unit] || PT_PER_UNIT.mm;
        var value = Math.abs(pt) / factor * (o.scale || 1);
        var s = value.toFixed(o.decimals);
        if (o.comma) { s = s.replace(".", ","); }
        if (o.showUnit) { s += " " + o.unit; }
        return s;
    }

    // Un colore è "#rrggbb" oppure "cmyk(c,m,y,k)" con valori 0-100.
    function parseCmyk(v) {
        var m = /^\s*cmyk\(([^)]*)\)\s*$/i.exec(String(v || ""));
        if (!m) { return null; }
        var p = m[1].split(","), out = [], i, n;
        for (i = 0; i < 4; i++) {
            n = parseFloat(p[i]);
            out.push(isNaN(n) ? 0 : Math.max(0, Math.min(100, n)));
        }
        return out;
    }

    function makeColor(doc, value) {
        var cmyk = parseCmyk(value), r, g, b;
        if (cmyk) {
            if (doc.documentColorSpace == DocumentColorSpace.CMYK) {
                var cc = new CMYKColor();
                cc.cyan = cmyk[0]; cc.magenta = cmyk[1]; cc.yellow = cmyk[2]; cc.black = cmyk[3];
                return cc;
            }
            var kk = 1 - cmyk[3] / 100;
            r = 255 * (1 - cmyk[0] / 100) * kk; g = 255 * (1 - cmyk[1] / 100) * kk; b = 255 * (1 - cmyk[2] / 100) * kk;
        } else {
            var hex = String(value || "#000000").replace("#", "");
            if (hex.length === 3) { hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2); }
            r = parseInt(hex.substr(0, 2), 16); g = parseInt(hex.substr(2, 2), 16); b = parseInt(hex.substr(4, 2), 16);
            if (isNaN(r) || isNaN(g) || isNaN(b)) { r = g = b = 0; }
        }
        if (doc.documentColorSpace == DocumentColorSpace.CMYK) {
            var rr = r / 255, gg = g / 255, bb = b / 255;
            var k = 1 - Math.max(rr, gg, bb);
            var c = new CMYKColor();
            if (k >= 1) {
                c.cyan = 0; c.magenta = 0; c.yellow = 0; c.black = 100;
            } else {
                c.cyan = (1 - rr - k) / (1 - k) * 100;
                c.magenta = (1 - gg - k) / (1 - k) * 100;
                c.yellow = (1 - bb - k) / (1 - k) * 100;
                c.black = k * 100;
            }
            return c;
        }
        var rgb = new RGBColor();
        rgb.red = Math.round(r); rgb.green = Math.round(g); rgb.blue = Math.round(b);
        return rgb;
    }

    function getQuoteLayer(doc, create) {
        var layer = null;
        try { layer = doc.layers.getByName(LAYER_NAME); } catch (e) { layer = null; }
        if (!layer && create) {
            layer = doc.layers.add();
            layer.name = LAYER_NAME;
        }
        if (layer && create) {
            layer.locked = false;
            layer.visible = true;
            try { layer.zOrder(ZOrderMethod.BRINGTOFRONT); } catch (e2) {}
        }
        return layer;
    }

    // Blocca il livello Quote se richiesto. Le quote selezionate vanno deselezionate prima.
    function finishLayer(ctx, quotesSelected) {
        if (ctx.o.lockLayer) {
            if (quotesSelected) { try { ctx.doc.selection = null; } catch (e0) {} }
            try { ctx.layer.locked = true; } catch (e1) {}
        }
    }

    function isOnQuoteLayer(item) {
        try {
            var l = item.layer;
            while (l) {
                if (l.name === LAYER_NAME) { return true; }
                l = (l.parent && l.parent.typename === "Layer") ? l.parent : null;
            }
        } catch (e) {}
        return false;
    }

    // Bounds di un oggetto; per i gruppi con maschera usa il tracciato di ritaglio.
    function boundsOf(item, visible) {
        if (item.typename === "GroupItem" && item.clipped) {
            var i;
            for (i = 0; i < item.pageItems.length; i++) {
                var c = item.pageItems[i];
                if (c.typename === "PathItem" && c.clipping) {
                    return visible ? c.visibleBounds : c.geometricBounds;
                }
                if (c.typename === "CompoundPathItem" && c.pathItems.length > 0 && c.pathItems[0].clipping) {
                    return visible ? c.visibleBounds : c.geometricBounds;
                }
            }
        }
        return visible ? item.visibleBounds : item.geometricBounds;
    }

    function rect(b) {
        return { left: b[0], top: b[1], right: b[2], bottom: b[3] };
    }

    // ---------- vettori ----------

    function vadd(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
    function vsub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
    function vmul(a, k) { return [a[0] * k, a[1] * k]; }
    function vdot(a, b) { return a[0] * b[0] + a[1] * b[1]; }
    function vlen(a) { return Math.sqrt(vdot(a, a)); }
    function vnorm(a) { var l = vlen(a); return l > 0 ? [a[0] / l, a[1] / l] : [1, 0]; }
    function vperp(a) { return [-a[1], a[0]]; }

    // ---------- primitive di disegno ----------

    function addLine(g, pts, ctx) {
        var p = g.pathItems.add();
        p.setEntirePath(pts);
        p.filled = false;
        p.stroked = true;
        p.strokeColor = ctx.color;
        p.strokeWidth = ctx.d.stroke;
        p.strokeCap = StrokeCap.BUTTENDCAP;
        return p;
    }

    function addFilled(g, pts, ctx) {
        var p = g.pathItems.add();
        p.setEntirePath(pts);
        p.closed = true;
        p.stroked = false;
        p.filled = true;
        p.fillColor = ctx.color;
        return p;
    }

    function addDot(g, c, diameter, ctx) {
        var e = g.pathItems.ellipse(c[1] + diameter / 2, c[0] - diameter / 2, diameter, diameter);
        e.stroked = false;
        e.filled = true;
        e.fillColor = ctx.color;
        return e;
    }

    // Terminale con la punta in "tip", rivolto nella direzione "out" (vettore unitario).
    function addEnd(g, tip, out, ctx) {
        var s = ctx.d.end, n = vperp(out);
        switch (ctx.o.endStyle) {
        case "arrow":
            var base = vsub(tip, vmul(out, s)), w = s * 0.35;
            addFilled(g, [tip, vadd(base, vmul(n, w)), vsub(base, vmul(n, w))], ctx);
            break;
        case "tick":
            var t = vmul(vnorm(vadd(out, n)), s * 0.7);
            addLine(g, [vsub(tip, t), vadd(tip, t)], ctx);
            break;
        case "dot":
            addDot(g, tip, s * 0.5, ctx);
            break;
        }
    }

    // Testo parallelo alla direzione u, centrato su "at" e spostato verso "side".
    function addLabel(g, text, at, u, side, ctx) {
        var tf = g.textFrames.add();
        tf.contents = text;
        var attrs = tf.textRange.characterAttributes;
        attrs.size = ctx.d.font;
        attrs.fillColor = ctx.textColor;
        var b0 = tf.geometricBounds;
        var h = b0[1] - b0[3];
        // angolo leggibile: tra -90 (escluso) e 90 gradi
        var ang = Math.atan2(u[1], u[0]) * 180 / Math.PI;
        if (ang > 90.01) { ang -= 180; }
        if (ang <= -89.99) { ang += 180; }
        if (Math.abs(ang) > 0.01) { tf.rotate(ang); }
        var c = vadd(at, vmul(side, ctx.d.textGap + h / 2));
        var b = tf.geometricBounds;
        tf.translate(c[0] - (b[0] + b[2]) / 2, c[1] - (b[1] + b[3]) / 2);
        return tf;
    }

    function newGroup(ctx, g) {
        if (g) {
            while (g.pageItems.length > 0) { g.pageItems[0].remove(); }
            return g;
        }
        return ctx.layer.groupItems.add();
    }

    function saveData(g, spec, label, lineStart, ctx) {
        linkSpec(spec, ctx);
        g.name = "Quota " + label;
        spec.line = lineStart;
        spec.style = pickStyle(ctx.o);
        g.note = NOTE_PREFIX + toJSON(spec);
        ctx.count++;
    }

    // ---------- tipi di quota ----------

    /*
     * Quota lineare.
     * spec.a, spec.b: punti misurati [x, y]
     * spec.u: direzione di misura (vettore unitario)
     * spec.n: lato verso cui va la quota (unitario, perpendicolare a u)
     * spec.ref: punto da cui si misura la distanza della linea di quota (di solito il più esterno)
     */
    function drawLinear(spec, ctx, g) {
        var d = ctx.d, u = spec.u, n = spec.n;
        var al = vdot(spec.a, u), bl = vdot(spec.b, u);
        var lo = Math.min(al, bl), hi = Math.max(al, bl), dist = hi - lo;
        if (dist <= 0.0001) { return null; }
        var lineAcross = vdot(spec.ref, n) + d.offset + (spec.shift || 0);
        var at = function (along, across) { return vadd(vmul(u, along), vmul(n, across)); };

        g = newGroup(ctx, g);
        var pts = [spec.a, spec.b], i;
        for (i = 0; i < 2; i++) {
            var start = vdot(pts[i], n) + d.gap;
            var end = lineAcross + d.ext;
            // salta il richiamo se il punto è già oltre la linea di quota
            if (end - start > 0) {
                addLine(g, [at(vdot(pts[i], u), start), at(vdot(pts[i], u), end)], ctx);
            }
        }

        var p1 = at(lo, lineAcross), p2 = at(hi, lineAcross);
        addLine(g, [p1, p2], ctx).name = LINE_NAME;

        // se la quota è troppo corta le frecce vanno all'esterno
        var outside = (ctx.o.endStyle === "arrow" && dist < d.end * 2.5);
        if (outside) {
            addLine(g, [at(lo - d.end * 2, lineAcross), p1], ctx);
            addLine(g, [p2, at(hi + d.end * 2, lineAcross)], ctx);
            addEnd(g, p1, u, ctx);
            addEnd(g, p2, vmul(u, -1), ctx);
        } else {
            addEnd(g, p1, vmul(u, -1), ctx);
            addEnd(g, p2, u, ctx);
        }

        var label = formatLength(dist, ctx.o);
        addLabel(g, label, at((lo + hi) / 2, lineAcross), u, n, ctx);
        saveData(g, spec, label, p1, ctx);
        return g;
    }

    // Diametro: linea attraverso il centro con frecce sulla circonferenza.
    function drawDiameter(spec, ctx, g) {
        var d = ctx.d, u = spec.u, c = spec.c, r = spec.r;
        if (r <= 0.0001) { return null; }
        var p1 = vsub(c, vmul(u, r)), p2 = vadd(c, vmul(u, r));
        g = newGroup(ctx, g);
        var outside = (ctx.o.endStyle === "arrow" && 2 * r < d.end * 3);
        if (outside) {
            addLine(g, [vsub(p1, vmul(u, d.end * 2)), vadd(p2, vmul(u, d.end * 2))], ctx).name = LINE_NAME;
            addEnd(g, p1, u, ctx);
            addEnd(g, p2, vmul(u, -1), ctx);
        } else {
            addLine(g, [p1, p2], ctx).name = LINE_NAME;
            addEnd(g, p1, vmul(u, -1), ctx);
            addEnd(g, p2, u, ctx);
        }
        var label = "Ø " + formatLength(2 * r, ctx.o);
        addLabel(g, label, outside ? vadd(p2, vmul(u, d.end * 4)) : c, u, labelSide(u), ctx);
        saveData(g, spec, label, g.pathItems.getByName(LINE_NAME).pathPoints[0].anchor, ctx);
        return g;
    }

    // Raggio: linea dal centro alla circonferenza, freccia sulla circonferenza.
    function drawRadius(spec, ctx, g) {
        var d = ctx.d, u = spec.u, c = spec.c, r = spec.r;
        if (r <= 0.0001) { return null; }
        var p = vadd(c, vmul(u, r));
        g = newGroup(ctx, g);
        addLine(g, [c, p], ctx).name = LINE_NAME;
        addDot(g, c, Math.max(d.stroke * 3, d.end * 0.3), ctx);
        addEnd(g, p, u, ctx);
        var label = "R " + formatLength(r, ctx.o);
        addLabel(g, label, vadd(c, vmul(u, r / 2)), u, labelSide(u), ctx);
        saveData(g, spec, label, c, ctx);
        return g;
    }

    // Lato del testo: perpendicolare a u, rivolto verso l'alto (o verso sinistra se verticale).
    function labelSide(u) {
        var n = vperp(u);
        if (n[1] < -0.0001 || (Math.abs(n[1]) <= 0.0001 && n[0] > 0)) { n = vmul(n, -1); }
        return n;
    }

    function drawSpec(spec, ctx, g) {
        if (spec.type === "dia") { return drawDiameter(spec, ctx, g); }
        if (spec.type === "rad") { return drawRadius(spec, ctx, g); }
        return drawLinear(spec, ctx, g);
    }

    // Sposta tutti i punti di una specifica (quando la quota è stata spostata a mano).
    function translateSpec(spec, delta) {
        var keys = ["a", "b", "ref", "c"], i;
        for (i = 0; i < keys.length; i++) {
            if (spec[keys[i]]) { spec[keys[i]] = vadd(spec[keys[i]], delta); }
        }
        return spec;
    }

    // ---------- costruzione delle quote ----------

    var UP = [0, 1], DOWN = [0, -1], LEFT = [-1, 0], RIGHT = [1, 0], X = [1, 0], Y = [0, 1];

    // Ogni punto può portare in .s gli indici (in ctx.src) degli oggetti da cui dipende.
    function lin(a, b, u, n, ref) {
        var spec = { type: "lin", a: a, b: b, u: u, n: n, ref: ref };
        if (a.s || b.s || ref.s) { spec.own = { a: a.s || null, b: b.s || null, ref: ref.s || null }; }
        return spec;
    }

    function pt(x, y, s) { var p = [x, y]; p.s = s; return p; }

    // Larghezza/altezza di un rettangolo sui lati richiesti.
    function quoteRect(r, ctx) {
        var o = ctx.o;
        var s = r.s;
        if (o.top) { drawLinear(lin(pt(r.left, r.top, s), pt(r.right, r.top, s), X, UP, pt(r.left, r.top, s)), ctx); }
        if (o.bottom) { drawLinear(lin(pt(r.left, r.bottom, s), pt(r.right, r.bottom, s), X, DOWN, pt(r.left, r.bottom, s)), ctx); }
        if (o.left) { drawLinear(lin(pt(r.left, r.bottom, s), pt(r.left, r.top, s), Y, LEFT, pt(r.left, r.bottom, s)), ctx); }
        if (o.right) { drawLinear(lin(pt(r.right, r.bottom, s), pt(r.right, r.top, s), Y, RIGHT, pt(r.right, r.bottom, s)), ctx); }
    }

    function unionRect(rects) {
        var u = { left: rects[0].left, top: rects[0].top, right: rects[0].right, bottom: rects[0].bottom }, i;
        for (i = 1; i < rects.length; i++) {
            u.left = Math.min(u.left, rects[i].left);
            u.top = Math.max(u.top, rects[i].top);
            u.right = Math.max(u.right, rects[i].right);
            u.bottom = Math.min(u.bottom, rects[i].bottom);
        }
        // il rettangolo complessivo dipende da tutti gli oggetti
        u.s = [];
        for (i = 0; i < rects.length; i++) {
            if (!rects[i].s) { u.s = null; break; }
            u.s = u.s.concat(rects[i].s);
        }
        return u;
    }

    // Distanze libere tra oggetti consecutivi (catena di quote).
    function quoteGaps(rects, ctx) {
        var o = ctx.o, all = unionRect(rects), i, a, b;
        var byX = rects.slice(0).sort(function (p, q) { return p.left - q.left; });
        var byY = rects.slice(0).sort(function (p, q) { return q.top - p.top; });

        for (i = 0; i < byX.length - 1; i++) {
            a = byX[i]; b = byX[i + 1];
            if (b.left - a.right <= 0) { continue; }
            if (o.top) { drawLinear(lin(pt(a.right, a.top, a.s), pt(b.left, b.top, b.s), X, UP, pt(0, all.top, all.s)), ctx); }
            if (o.bottom) { drawLinear(lin(pt(a.right, a.bottom, a.s), pt(b.left, b.bottom, b.s), X, DOWN, pt(0, all.bottom, all.s)), ctx); }
        }
        for (i = 0; i < byY.length - 1; i++) {
            a = byY[i]; b = byY[i + 1];
            if (a.bottom - b.top <= 0) { continue; }
            if (o.left) { drawLinear(lin(pt(b.left, b.top, b.s), pt(a.left, a.bottom, a.s), Y, LEFT, pt(all.left, 0, all.s)), ctx); }
            if (o.right) { drawLinear(lin(pt(b.right, b.top, b.s), pt(a.right, a.bottom, a.s), Y, RIGHT, pt(all.right, 0, all.s)), ctx); }
        }
    }

    // Punti di ancoraggio selezionati (strumento Selezione diretta) negli oggetti selezionati.
    var pointsDiag = "";

    // Solo l'ancoraggio selezionato conta: i punti vicini a quello scelto risultano
    // "selezionati" con LEFTDIRECTION/RIGHTDIRECTION (maniglie visibili) e vanno ignorati.
    function isSelectedPoint(pt) {
        var sel = pt.selected;
        if (sel == PathPointSelection.ANCHORPOINT) { return true; }
        return String(sel).toUpperCase().indexOf("ANCHORPOINT") >= 0;
    }

    function collectPoints(items) {
        var out = [], i, types = {}, errors = [], states = {}, total = 0;
        function walk(it) {
            var j, pts;
            try {
                types[it.typename] = (types[it.typename] || 0) + 1;
                if (it.typename === "PathItem") {
                    // selectedPathPoints contiene solo i punti toccati dalla Selezione diretta
                    try { pts = it.selectedPathPoints; } catch (eSel) { pts = null; }
                    if (!pts || !pts.length) { pts = it.pathPoints; }
                    total += it.pathPoints.length;
                    for (j = 0; j < pts.length; j++) {
                        var key = String(pts[j].selected).replace("PathPointSelection.", "");
                        states[key] = (states[key] || 0) + 1;
                        if (isSelectedPoint(pts[j])) {
                            var a = pts[j].anchor, q = [a[0], a[1]];
                            q.item = it;    // per collegare la quota al punto
                            out.push(q);
                        }
                    }
                } else if (it.typename === "CompoundPathItem") {
                    for (j = 0; j < it.pathItems.length; j++) { walk(it.pathItems[j]); }
                } else if (it.typename === "GroupItem") {
                    for (j = 0; j < it.pageItems.length; j++) { walk(it.pageItems[j]); }
                }
            } catch (e) { errors.push(e.message); }
        }
        for (i = 0; i < items.length; i++) { walk(items[i]); }
        // elimina i doppioni (punti coincidenti)
        var uniq = [], k, dup;
        for (i = 0; i < out.length; i++) {
            dup = false;
            for (k = 0; k < uniq.length; k++) {
                if (Math.abs(uniq[k][0] - out[i][0]) < 0.01 && Math.abs(uniq[k][1] - out[i][1]) < 0.01) { dup = true; break; }
            }
            if (!dup) { uniq.push(out[i]); }
        }
        var t = [], k2;
        for (k2 in types) { if (types.hasOwnProperty(k2)) { t.push(types[k2] + " " + k2); } }
        var st = [], k3;
        for (k3 in states) { if (states.hasOwnProperty(k3)) { st.push(states[k3] + " " + k3); } }
        pointsDiag = "trovati " + uniq.length + " punti in: " + (t.join(", ") || "nessun oggetto") +
            "; punti totali " + total + (st.length ? " (" + st.join(", ") + ")" : "") +
            (errors.length ? "; errore: " + errors[0] : "");
        return uniq;
    }

    // Quote tra punti: catena orizzontale/verticale oppure distanza diretta tra 2 punti.
    function quotePoints(pts, ctx) {
        var o = ctx.o, i;
        if (o.aligned && pts.length === 2) {
            var u = vnorm(vsub(pts[1], pts[0]));
            var n = labelSide(u);
            var ref = vdot(pts[0], n) >= vdot(pts[1], n) ? pts[0] : pts[1];
            var spec = lin(pts[0], pts[1], u, n, ref);
            spec.free = true;   // direzione libera: segue i due punti
            drawLinear(spec, ctx);
            return;
        }
        var top = pts[0], bottom = pts[0], left = pts[0], right = pts[0];
        for (i = 1; i < pts.length; i++) {
            if (pts[i][1] > top[1]) { top = pts[i]; }
            if (pts[i][1] < bottom[1]) { bottom = pts[i]; }
            if (pts[i][0] < left[0]) { left = pts[i]; }
            if (pts[i][0] > right[0]) { right = pts[i]; }
        }
        var byX = pts.slice(0).sort(function (p, q) { return p[0] - q[0]; });
        var byY = pts.slice(0).sort(function (p, q) { return p[1] - q[1]; });
        for (i = 0; i < pts.length - 1; i++) {
            if (Math.abs(byX[i + 1][0] - byX[i][0]) > 0.01) {
                if (o.top) { drawLinear(lin(byX[i], byX[i + 1], X, UP, top), ctx); }
                if (o.bottom) { drawLinear(lin(byX[i], byX[i + 1], X, DOWN, bottom), ctx); }
            }
            if (Math.abs(byY[i + 1][1] - byY[i][1]) > 0.01) {
                if (o.left) { drawLinear(lin(byY[i], byY[i + 1], Y, LEFT, left), ctx); }
                if (o.right) { drawLinear(lin(byY[i], byY[i + 1], Y, RIGHT, right), ctx); }
            }
        }
    }

    // Diametro o raggio di un oggetto: cerchio a 45 gradi, ellisse/altro sulla larghezza.
    function quoteCircle(r, type, ctx) {
        var w = r.right - r.left, h = r.top - r.bottom;
        var c = [(r.left + r.right) / 2, (r.top + r.bottom) / 2];
        var round = Math.abs(w - h) <= Math.max(w, h) * 0.01;
        var u = round ? [Math.SQRT1_2, Math.SQRT1_2] : [1, 0];
        var spec = { type: type, c: c, r: w / 2, u: u };
        if (r.s) { spec.own = { c: r.s }; }
        drawSpec(spec, ctx);
    }

    // ---------- collegamento quote / oggetti (aggiornamento automatico) ----------

    var idCounter = 0;
    function newId() {
        idCounter++;
        return "q" + new Date().getTime().toString(36) + idCounter.toString(36);
    }

    // Aggiunge un id al tag dell'oggetto. Un oggetto copiato si porta dietro gli id
    // vecchi, per questo ogni quotatura ne usa uno nuovo invece di riusarli.
    function tagItem(ctx, item) {
        var i;
        if (!ctx.tagged) { ctx.tagged = []; }
        for (i = 0; i < ctx.tagged.length; i++) {
            if (ctx.tagged[i].item === item) { return ctx.tagged[i].id; }
        }
        var id = ctx.callId + "_" + ctx.tagged.length, tag = null;
        try {
            try { tag = item.tags.getByName(SRC_TAG); } catch (eNo) { tag = null; }
            if (tag) {
                tag.value = String(tag.value || ",") + id + ",";
            } else {
                tag = item.tags.add();
                tag.name = SRC_TAG;
                tag.value = "," + id + ",";
            }
        } catch (e) {
            return null;   // oggetto bloccato o non etichettabile: quota non collegata
        }
        ctx.tagged.push({ item: item, id: id });
        return id;
    }

    function linkItem(ctx, item, r) {
        var id = tagItem(ctx, item);
        if (!id) { return null; }
        ctx.src.push(withUuid({ id: id, b: [r.left, r.top, r.right, r.bottom] }, item));
        return [ctx.src.length - 1];
    }

    function linkPoint(ctx, p) {
        if (!p.item) { return null; }
        var k = -1, i, a;
        try {
            for (i = 0; i < p.item.pathPoints.length; i++) {
                a = p.item.pathPoints[i].anchor;
                if (Math.abs(a[0] - p[0]) < 0.01 && Math.abs(a[1] - p[1]) < 0.01) { k = i; break; }
            }
        } catch (e) { k = -1; }
        if (k < 0) { return null; }
        var id = tagItem(ctx, p.item);
        if (!id) { return null; }
        ctx.src.push(withUuid({ id: id, k: k, p: [p[0], p[1]] }, p.item));
        return [ctx.src.length - 1];
    }

    // Prima di salvare una quota nuova tiene solo gli oggetti che usa davvero.
    function linkSpec(spec, ctx) {
        if (!ctx.src || !spec.own || spec.src) { return; }
        var keys = ["a", "b", "ref", "c"], used = [], map = {}, own = {}, i, j, k, arr;
        for (i = 0; i < keys.length; i++) {
            k = keys[i];
            if (!spec.own.hasOwnProperty(k)) { continue; }
            arr = spec.own[k];
            if (!arr) { delete spec.own; return; }   // un punto non collegato: niente aggiornamento
            own[k] = [];
            for (j = 0; j < arr.length; j++) {
                if (map[arr[j]] === undefined) { map[arr[j]] = used.length; used.push(ctx.src[arr[j]]); }
                own[k].push(map[arr[j]]);
            }
        }
        spec.own = own;
        spec.src = used;
        spec.vis = !!ctx.o.useVisible;
        spec.qid = newId();
    }

    // Stato tenuto in memoria tra un controllo e l'altro (si azzera cambiando documento).
    var auto = { key: null };

    function autoReset(key) {
        auto = { key: key, specs: {}, nspecs: 0, items: {}, scannedAt: -1, undo: {}, skip: {}, pos: {}, seen: {}, gone: {}, removed: {}, known: {}, present: null, count: -1, lastPos: {}, moving: {}, skipMove: {} };
    }

    function parseCached(note) {
        if (auto.specs.hasOwnProperty(note)) { return auto.specs[note]; }
        if (auto.nspecs > 500) { auto.specs = {}; auto.nspecs = 0; }
        var spec = null;
        try { spec = eval("(" + note.substr(NOTE_PREFIX.length) + ")"); } catch (e) { spec = null; }
        auto.specs[note] = spec;
        auto.nspecs++;
        return spec;
    }

    // Cerca nel documento gli oggetti con il tag e li ricorda per id.
    // full: ricerca completa che ricostruisce l'elenco degli oggetti presenti nel documento.
    function scanTags(doc, full) {
        var all = doc.pageItems, i, it, v, ids, j;
        if (full) { auto.items = {}; auto.present = {}; }
        for (i = 0; i < all.length; i++) {
            it = all[i];
            try {
                if (it.tags.length === 0) { continue; }
                v = String(it.tags.getByName(SRC_TAG).value);
            } catch (e) { continue; }
            ids = v.split(",");
            for (j = 0; j < ids.length; j++) {
                if (ids[j] && !auto.items[ids[j]]) { auto.items[ids[j]] = it; }
                if (ids[j] && auto.present) { auto.present[ids[j]] = true; }
            }
        }
    }

    // Gli oggetti selezionati sono quelli che si stanno modificando: ne rilegge il riferimento
    // a ogni controllo, perché dopo un trascinamento quello ricordato può restare sulla posizione vecchia.
    function refreshFromSelection(doc) {
        var sel, seen = 0;
        try { sel = doc.selection; } catch (e) { return; }
        if (!sel || sel.typename === "TextRange") { return; }
        function visit(it) {
            if (seen++ > 300) { return; }
            var v, ids, j;
            try {
                if (it.tags.length > 0) {
                    v = String(it.tags.getByName(SRC_TAG).value);
                    ids = v.split(",");
                    for (j = 0; j < ids.length; j++) { if (ids[j]) { auto.items[ids[j]] = it; } }
                }
            } catch (e1) { /* senza tag */ }
            try {
                if (it.typename === "GroupItem") { for (j = 0; j < it.pageItems.length; j++) { visit(it.pageItems[j]); } }
                else if (it.typename === "CompoundPathItem") { for (j = 0; j < it.pathItems.length; j++) { visit(it.pathItems[j]); } }
            } catch (e2) {}
        }
        var i;
        for (i = 0; i < sel.length; i++) {
            if (!isOnQuoteLayer(sel[i])) { visit(sel[i]); }
        }
    }

    // Identificativo permanente dell'oggetto (Illustrator 2020 e successivi).
    function withUuid(src, item) {
        try { if (item.uuid) { src.u = String(item.uuid); } } catch (e) { /* versione vecchia */ }
        return src;
    }

    // Oggetto collegato, sempre con un riferimento appena letto: quelli ricordati possono
    // restare fermi sulla posizione di prima dopo un trascinamento.
    function resolveSrc(doc, s) {
        if (s.u) {
            try {
                var it = doc.getPageItemFromUuid(s.u);
                if (it) { return it; }
            } catch (e) { /* oggetto eliminato o funzione non disponibile */ }
        }
        return resolveItem(doc, s.id);
    }

    function resolveItem(doc, id) {
        var it = auto.items[id];
        if (it) {
            try { if (it.typename) { return it; } } catch (e) { /* oggetto eliminato */ }
            delete auto.items[id];
        }
        // nuova ricerca solo se nel documento sono cambiati gli oggetti o le quote
        var n;
        try { n = doc.pageItems.length + "/" + getQuoteLayer(doc, false).groupItems.length; } catch (e2) { return null; }
        if (auto.scannedAt === n) { return null; }
        scanTags(doc);
        auto.scannedAt = n;
        return auto.items[id] || null;
    }

    var GONE = "gone";   // l'oggetto collegato non esiste più

    // Valori attuali degli oggetti collegati: bounds o posizione del punto.
    // GONE se un oggetto è stato eliminato, null se non si riesce a leggerlo.
    function currentVals(doc, spec, tick) {
        var out = [], i, s, key, it, v;
        for (i = 0; i < spec.src.length; i++) {
            s = spec.src[i];
            key = s.id + (s.k !== undefined ? "#" + s.k : (spec.vis ? "|v" : "|g"));
            if (!tick.hasOwnProperty(key)) {
                v = null;
                // Illustrator può ancora "trovare" un oggetto eliminato (resta per l'annulla):
                // conta la ricerca completa fatta quando il numero di oggetti è sceso.
                if (auto.known[s.id] && auto.present && !auto.present[s.id]) {
                    it = null;
                } else {
                    it = resolveSrc(doc, s);
                    if (it) { auto.known[s.id] = true; if (auto.present) { auto.present[s.id] = true; } }
                }
                if (!it) { v = GONE; }
                if (it) {
                    try {
                        if (s.k !== undefined) {
                            v = it.pathPoints[s.k].anchor;
                            v = [v[0], v[1]];
                        } else {
                            v = boundsOf(it, spec.vis);
                            v = [v[0], v[1], v[2], v[3]];
                        }
                    } catch (e) { v = null; }
                }
                tick[key] = v;
            }
            if (tick[key] === GONE) { return GONE; }
            if (!tick[key]) { return null; }
            out.push(tick[key]);
        }
        return out;
    }

    function oldVal(s) { return s.k !== undefined ? s.p : s.b; }

    function sameVals(spec, vals) {
        var i, j, o;
        for (i = 0; i < vals.length; i++) {
            o = oldVal(spec.src[i]);
            for (j = 0; j < vals[i].length; j++) {
                if (Math.abs(vals[i][j] - o[j]) > 0.01) { return false; }
            }
        }
        return true;
    }

    function sigOf(vals) {
        var out = [], i, j;
        for (i = 0; i < vals.length; i++) {
            for (j = 0; j < vals[i].length; j++) { out.push(vals[i][j].toFixed(2)); }
        }
        return out.join(",");
    }

    // Rettangolo complessivo [sinistra, alto, destra, basso] degli oggetti indicati.
    function boxOf(idxs, list) {
        var b = list[idxs[0]].slice(0), i, c;
        for (i = 1; i < idxs.length; i++) {
            c = list[idxs[i]];
            b[0] = Math.min(b[0], c[0]); b[1] = Math.max(b[1], c[1]);
            b[2] = Math.max(b[2], c[2]); b[3] = Math.min(b[3], c[3]);
        }
        return b;
    }

    function mapAxis(x, a0, a1, b0, b1) {
        var w = a1 - a0;
        if (Math.abs(w) < 0.0001) { return x + (b0 - a0); }
        return b0 + (x - a0) * (b1 - b0) / w;
    }

    // Porta un punto dalla vecchia geometria dell'oggetto alla nuova (stessa posizione relativa).
    function mapPoint(p, idxs, spec, vals) {
        if (!idxs || !p) { return p; }
        if (idxs.length === 1 && spec.src[idxs[0]].k !== undefined) { return vals[idxs[0]].slice(0); }
        var olds = [], i;
        for (i = 0; i < spec.src.length; i++) { olds.push(oldVal(spec.src[i])); }
        var o = boxOf(idxs, olds), n = boxOf(idxs, vals);
        return [mapAxis(p[0], o[0], o[2], n[0], n[2]), mapAxis(p[1], o[3], o[1], n[3], n[1])];
    }

    // Nuova specifica per oggetti cambiati. "moved" = spostamento della quota fatto a mano.
    function respec(spec, vals, moved) {
        var own = spec.own, i;
        if (spec.type === "lin") {
            spec.shift = (spec.shift || 0) + vdot(moved, spec.n);
            spec.a = mapPoint(spec.a, own.a, spec, vals);
            spec.b = mapPoint(spec.b, own.b, spec, vals);
            spec.ref = mapPoint(spec.ref, own.ref, spec, vals);
            if (spec.free) {
                // distanza diretta: nuova direzione, stesso lato di prima
                var u = vnorm(vsub(spec.b, spec.a)), n = vperp(u);
                if (vdot(n, spec.n) < 0) { n = vmul(n, -1); }
                spec.u = u;
                spec.n = n;
                spec.ref = vdot(spec.a, n) >= vdot(spec.b, n) ? spec.a : spec.b;
            }
        } else {
            var olds = [];
            for (i = 0; i < spec.src.length; i++) { olds.push(oldVal(spec.src[i])); }
            var ob = boxOf(own.c, olds), nb = boxOf(own.c, vals), ow = ob[2] - ob[0];
            if (ow > 0.0001) { spec.r = spec.r * (nb[2] - nb[0]) / ow; }
            spec.c = mapPoint(spec.c, own.c, spec, vals);
        }
        for (i = 0; i < spec.src.length; i++) {
            if (spec.src[i].k !== undefined) { spec.src[i].p = vals[i]; } else { spec.src[i].b = vals[i]; }
        }
        return spec;
    }

    function lineMoved(g, spec) {
        try {
            var p0 = g.pathItems.getByName(LINE_NAME).pathPoints[0].anchor;
            return Math.abs(p0[0] - spec.line[0]) > 0.01 || Math.abs(p0[1] - spec.line[1]) > 0.01;
        } catch (e) { return false; }
    }

    // Ridisegna le quote i cui oggetti sono cambiati. Chiamata dal pannello ogni secondo;
    // con force (tasto Aggiorna) lo fa subito, senza aspettare che l'oggetto stia fermo.
    function autoUpdate(force) {
        try {
            if (app.documents.length === 0) { return "OK:0"; }
            var doc = app.activeDocument;
            if (auto.key !== doc.name) { autoReset(doc.name); }
            // meno oggetti di prima: qualcosa è stato eliminato, rifà l'elenco completo
            var nItems = -1;
            try { nItems = doc.pageItems.length; } catch (eC) {}
            if (nItems >= 0 && (auto.present === null || nItems < auto.count)) { scanTags(doc, true); }
            auto.count = nItems;
            refreshFromSelection(doc);
            var layer = getQuoteLayer(doc, false);
            if (!layer) { return "OK:0"; }
            var groups = layer.groupItems, tick = {}, todo = [], gone = [], i, g, note, spec, q, u, vals, pos, prev, sig, last;
            for (i = 0; i < groups.length; i++) {
                g = groups[i];
                try { note = String(g.note || ""); } catch (eN) { continue; }
                if (note.indexOf(NOTE_PREFIX) !== 0 || note.indexOf('"qid"') < 0) { continue; }
                spec = parseCached(note);
                if (!spec || !spec.src || !spec.own || !spec.qid) { continue; }
                q = spec.qid;
                try { pos = g.position; pos = [pos[0], pos[1]]; } catch (eP) { pos = null; }
                last = auto.lastPos[q];
                auto.lastPos[q] = pos;

                // Ctrl+Z sul nostro aggiornamento: non rifarlo finché l'oggetto non cambia ancora
                u = auto.undo[q];
                if (u) {
                    if (note === u.from) {
                        auto.skip[q] = u.sig;
                        auto.skipMove[q] = note;
                        delete auto.moving[q];
                        delete auto.undo[q];
                    }
                    else if (note !== u.to) { delete auto.undo[q]; }
                }

                vals = currentVals(doc, spec, tick);
                if (vals === GONE) {
                    // oggetto eliminato: elimina anche la quota (confermato al controllo successivo).
                    // Se la quota ricompare (Ctrl+Z) dopo che l'abbiamo tolta, la lasciamo stare.
                    if (auto.removed[q]) { continue; }
                    if (!force && !auto.gone[q]) { auto.gone[q] = true; continue; }
                    auto.removed[q] = true;
                    gone.push(g);
                    continue;
                }
                delete auto.gone[q];
                if (!vals) { continue; }
                if (sameVals(spec, vals)) {
                    auto.pos[q] = pos;   // posizione di riferimento della quota con l'oggetto invariato
                    delete auto.seen[q];
                    // quota spostata a mano: quando è ferma riallunga i richiami fino all'oggetto
                    if (spec.type !== "lin" || !pos) { continue; }
                    if (last && (Math.abs(pos[0] - last[0]) > 0.01 || Math.abs(pos[1] - last[1]) > 0.01)) {
                        auto.moving[q] = true;   // si sta ancora muovendo
                        if (!force) { continue; }
                    }
                    if (!force && (!auto.moving[q] || auto.skipMove[q] === note)) { continue; }
                    delete auto.moving[q];
                    if (!lineMoved(g, spec)) { continue; }
                    todo.push({ g: g, note: note, vals: vals, step: [0, 0] });
                    continue;
                }
                sig = sigOf(vals);
                if (!force && auto.skip[q] === sig) { continue; }
                // aspetta che l'oggetto stia fermo (stessa misura del controllo precedente):
                // così non si ridisegna mentre lo si trascina o si scrivono i numeri
                if (!force && auto.seen[q] !== sig) { auto.seen[q] = sig; continue; }
                delete auto.seen[q];
                delete auto.skip[q];
                prev = auto.pos[q];
                todo.push({ g: g, note: note, vals: vals, step: (pos && prev) ? vsub(pos, prev) : [0, 0] });
            }
            if (todo.length === 0 && gone.length === 0) { return "OK:0"; }

            var wasLocked = layer.locked, wasHidden = !layer.visible, count = 0, t, o, ctx, moved;
            if (wasLocked) { layer.locked = false; }
            if (wasHidden) { layer.visible = true; }
            for (i = 0; i < gone.length; i++) {
                try { gone[i].remove(); count++; } catch (eR) { /* quota bloccata */ }
            }
            for (i = 0; i < todo.length; i++) {
                t = todo[i];
                try {
                    spec = eval("(" + t.note.substr(NOTE_PREFIX.length) + ")");   // copia da modificare
                    moved = [0, 0];
                    if (spec.type === "lin") {
                        // spostamento fatto a mano = quanto si è mosso la linea, meno lo spostamento
                        // fatto in questo istante insieme all'oggetto
                        var p0 = t.g.pathItems.getByName(LINE_NAME).pathPoints[0].anchor;
                        moved = vsub(vsub([p0[0], p0[1]], spec.line), t.step);
                    }
                    respec(spec, t.vals, moved);
                    o = merge(spec.style);
                    ctx = { o: o, d: sizes(o), doc: doc, layer: layer, color: makeColor(doc, o.color), textColor: makeColor(doc, o.textColor || o.color), count: 0 };
                    if (drawSpec(spec, ctx, t.g)) {
                        auto.undo[spec.qid] = { from: t.note, to: String(t.g.note), sig: sigOf(t.vals) };
                        try { pos = t.g.position; auto.pos[spec.qid] = auto.lastPos[spec.qid] = [pos[0], pos[1]]; } catch (eP2) {}
                        count++;
                    }
                } catch (eQ) { /* quota saltata */ }
            }
            if (wasHidden) { layer.visible = false; }
            if (wasLocked) { layer.locked = true; }
            return "OK:" + count;
        } catch (e) {
            return "ERR:" + e.message;
        }
    }

    // ---------- API chiamata dal pannello ----------

    function quote(opts) {
        try {
            if (app.documents.length === 0) { return "ERR:Nessun documento aperto."; }
            var doc = app.activeDocument;
            var o = merge(opts);
            var sel = doc.selection, items = [], i;
            if (!sel || sel.length === 0 || sel.typename === "TextRange") {
                return "ERR:Seleziona almeno un oggetto.";
            }
            for (i = 0; i < sel.length; i++) {
                if (!isOnQuoteLayer(sel[i])) { items.push(sel[i]); }
            }
            if (items.length === 0) { return "ERR:Seleziona almeno un oggetto (le quote vengono ignorate)."; }
            var sided = (o.mode !== "diameter" && o.mode !== "radius" && !(o.mode === "points" && o.aligned));
            if (sided && !(o.top || o.bottom || o.left || o.right)) { return "ERR:Scegli almeno un lato."; }

            var pts = null;
            if (o.mode === "points") {
                pts = collectPoints(items);
                if (pts.length < 2) { return "ERR:Seleziona almeno 2 punti con lo strumento Selezione diretta (A). [" + pointsDiag + "]"; }
                if (o.aligned && pts.length !== 2) { return "ERR:Per la distanza diretta seleziona esattamente 2 punti. [" + pointsDiag + "]"; }
            }

            var rects = [];
            for (i = 0; i < items.length; i++) { rects.push(rect(boundsOf(items[i], o.useVisible))); }

            var ctx = { o: o, d: sizes(o), doc: doc, layer: getQuoteLayer(doc, true), color: makeColor(doc, o.color), textColor: makeColor(doc, o.textColor || o.color), count: 0 };

            // collega le quote agli oggetti, per l'aggiornamento automatico
            ctx.src = [];
            ctx.callId = newId();
            if (o.mode === "points") {
                for (i = 0; i < pts.length; i++) { pts[i].s = linkPoint(ctx, pts[i]); }
            } else {
                for (i = 0; i < rects.length; i++) { rects[i].s = linkItem(ctx, items[i], rects[i]); }
            }

            if (o.mode === "all") {
                quoteRect(unionRect(rects), ctx);
            } else if (o.mode === "gaps") {
                if (rects.length < 2) { return "ERR:Per le distanze servono almeno 2 oggetti."; }
                quoteGaps(rects, ctx);
            } else if (o.mode === "points") {
                quotePoints(pts, ctx);
            } else if (o.mode === "diameter" || o.mode === "radius") {
                for (i = 0; i < rects.length; i++) { quoteCircle(rects[i], o.mode === "diameter" ? "dia" : "rad", ctx); }
            } else {
                for (i = 0; i < rects.length; i++) { quoteRect(rects[i], ctx); }
            }

            // ripristina la selezione originale
            try { doc.selection = items; } catch (e1) {}
            finishLayer(ctx, false);
            app.redraw();
            return "OK:" + ctx.count;
        } catch (e) {
            return "ERR:" + e.message + (e.line ? " (riga " + e.line + ")" : "");
        }
    }

    // Risale dall'oggetto selezionato al gruppo della quota che lo contiene.
    function quoteGroupOf(item) {
        var it = item;
        while (it && it.typename !== "Layer" && it.typename !== "Document") {
            if (it.typename === "GroupItem" && readQuoteData(it)) { return it; }
            it = it.parent;
        }
        return null;
    }

    function selectedQuoteGroups(doc) {
        var sel = doc.selection, out = [], i, j, g, dup;
        if (!sel || sel.typename === "TextRange") { return out; }
        for (i = 0; i < sel.length; i++) {
            g = quoteGroupOf(sel[i]);
            if (!g) { continue; }
            dup = false;
            for (j = 0; j < out.length; j++) { if (out[j] === g) { dup = true; break; } }
            if (!dup) { out.push(g); }
        }
        return out;
    }

    // Stile della quota più recente del documento; se non ci sono quote,
    // prova le impostazioni del vecchio sistema di quotatura. null se non c'è niente.
    function documentStyle(doc) {
        var layer = getQuoteLayer(doc, false), i, d;
        if (layer) {
            for (i = 0; i < layer.groupItems.length && i < 20; i++) {
                d = readQuoteData(layer.groupItems[i]);
                if (d && d.style) { return d.style; }
            }
        }
        return legacyStyle(doc);
    }

    // ---------- impostazioni del vecchio sistema ----------
    // Livello "__DimensionSettingsData__" con un testo "settings" che contiene un JSON tipo:
    // {"offset":10,"strokeWeight":1,"fontSize":12,"textOffset":4,"lineColorName":"Nero",
    //  "multiplier":1,"scaleFactor":1,"outputUnit":"Documento","decimals":2,"showUnits":true}
    // Le distanze (offset, textOffset) sono considerate in punti.

    var LEGACY_LAYER = "__DimensionSettingsData__";

    function hex2(n) { n = Math.max(0, Math.min(255, Math.round(n))); return (n < 16 ? "0" : "") + n.toString(16); }

    function r1(n) { return Math.round(n * 10) / 10; }
    function cmykString(c) { return "cmyk(" + r1(c.cyan) + "," + r1(c.magenta) + "," + r1(c.yellow) + "," + r1(c.black) + ")"; }

    function colorToHex(c) {
        if (!c) { return null; }
        switch (c.typename) {
        case "RGBColor":
            return "#" + hex2(c.red) + hex2(c.green) + hex2(c.blue);
        case "CMYKColor":
            return cmykString(c);
        case "GrayColor":
            var v = 255 * (1 - c.gray / 100);
            return "#" + hex2(v) + hex2(v) + hex2(v);
        case "SpotColor":
            return colorToHex(c.spot.color);
        }
        return null;
    }

    function swatchHex(doc, name) {
        if (!name) { return null; }
        if (/^(nero|black|registration|registro)$/i.test(name)) { return "cmyk(0,0,0,100)"; }
        try { return colorToHex(doc.swatches.getByName(name).color); } catch (e) { return null; }
    }

    function documentUnit(doc) {
        try {
            switch (doc.rulerUnits) {
            case RulerUnits.Millimeters: return "mm";
            case RulerUnits.Centimeters: return "cm";
            case RulerUnits.Inches: return "in";
            case RulerUnits.Pixels: return "px";
            case RulerUnits.Points: return "pt";
            }
        } catch (e) {}
        return "mm";
    }

    // Cerca il livello delle vecchie impostazioni, anche se è un sottolivello
    // o se il nome differisce per maiuscole/spazi.
    function findLegacyLayer(layers) {
        var i, l, found;
        for (i = 0; i < layers.length; i++) {
            l = layers[i];
            if (String(l.name).replace(/\s+/g, "").toLowerCase() === LEGACY_LAYER.toLowerCase()) { return l; }
            if (l.layers && l.layers.length) {
                found = findLegacyLayer(l.layers);
                if (found) { return found; }
            }
        }
        return null;
    }

    // Tutti i testi del livello, anche dentro gruppi e sottolivelli.
    function textFramesIn(container, out) {
        var i;
        try { for (i = 0; i < container.textFrames.length; i++) { out.push(container.textFrames[i]); } } catch (e) {}
        try { for (i = 0; i < container.groupItems.length; i++) { textFramesIn(container.groupItems[i], out); } } catch (e2) {}
        try { for (i = 0; i < container.layers.length; i++) { textFramesIn(container.layers[i], out); } } catch (e3) {}
        return out;
    }

    function parseSettings(text) {
        var s = String(text)
            .replace(/[\u201C\u201D\u201E\u00AB\u00BB]/g, '"')   // virgolette tipografiche
            .replace(/[\u2018\u2019]/g, "'")
            .replace(/[\u0003\r\n]/g, " ");
        var a = s.indexOf("{"), b = s.lastIndexOf("}");
        if (a < 0 || b <= a) { return null; }
        var data = eval("(" + s.substring(a, b + 1) + ")");
        return (data && typeof data === "object") ? data : null;
    }

    // Testi in cui possono stare le impostazioni: contenuto, nota e tag dell'oggetto.
    function candidateTexts(tf) {
        var out = [], i;
        try { out.push(tf.contents); } catch (e1) {}
        try { if (tf.note) { out.push(tf.note); } } catch (e2) {}
        try { for (i = 0; i < tf.tags.length; i++) { out.push(tf.tags[i].value); } } catch (e3) {}
        return out;
    }

    // Legge le vecchie impostazioni. Restituisce { data, diag } dove diag descrive cosa è stato trovato.
    function legacyRead(doc) {
        var layer = findLegacyLayer(doc.layers), frames = [], i, j, texts, data = null, diag;
        if (layer) {
            frames = textFramesIn(layer, []);
            diag = "livello \u201c" + layer.name + "\u201d trovato, " + frames.length + " testi";
        } else {
            try { frames = [doc.textFrames.getByName("settings")]; } catch (eNo) { frames = []; }
            var names = [];
            for (i = 0; i < doc.layers.length && i < 15; i++) { names.push(doc.layers[i].name); }
            diag = "livello " + LEGACY_LAYER + " non trovato (livelli: " + names.join(", ") + ")" +
                (frames.length ? ", ma c'\u00e8 un testo \u201csettings\u201d" : "");
        }
        // prima il testo chiamato "settings", poi gli altri
        frames.sort(function (x, y) { return (y.name === "settings") - (x.name === "settings"); });
        var lastErr = "";
        for (i = 0; i < frames.length && !data; i++) {
            texts = candidateTexts(frames[i]);
            for (j = 0; j < texts.length && !data; j++) {
                try { data = parseSettings(texts[j]); } catch (eParse) { lastErr = eParse.message + " in: " + String(texts[j]).substr(0, 60); }
            }
        }
        if (!data && frames.length) {
            diag += "; testo non leggibile" + (lastErr ? " (" + lastErr + ")" : ": " + String(candidateTexts(frames[0])[0]).substr(0, 60));
        }
        return { data: data, diag: diag };
    }

    // Risultato memorizzato per documento: la ricerca non va ripetuta ogni secondo.
    var legacyCache = { key: null, value: null };

    function legacyStyle(doc, force) {
        var key = doc.name + "|" + doc.layers.length;
        if (!force && legacyCache.key === key) { return legacyCache.value; }
        legacyCache.key = key;
        legacyCache.value = null;
        var r;
        try { r = legacyRead(doc); } catch (e) { r = { data: null, diag: "errore: " + e.message }; }
        legacyCache.diag = r.diag;
        var data = r.data;
        if (!data) { return null; }

        var st = {}, PT_MM = 25.4 / 72;
        if (typeof data.offset === "number") { st.offsetMm = Math.round(data.offset * PT_MM * 100) / 100; }
        if (typeof data.textOffset === "number") { st.textGapMm = Math.round(data.textOffset * PT_MM * 100) / 100; }
        if (typeof data.strokeWeight === "number") { st.strokeWidth = data.strokeWeight; }
        if (typeof data.fontSize === "number") { st.fontSize = data.fontSize; }
        if (typeof data.multiplier === "number" && data.multiplier > 0) { st.sizeFactor = data.multiplier; }
        if (typeof data.scaleFactor === "number" && data.scaleFactor > 0) { st.scale = data.scaleFactor; }
        if (typeof data.decimals === "number") { st.decimals = data.decimals; }
        if (typeof data.showUnits === "boolean") { st.showUnit = data.showUnits; }
        if (data.outputUnit) {
            var u = String(data.outputUnit).toLowerCase();
            if (u === "documento" || u === "document") { st.unit = documentUnit(doc); }
            else if (PT_PER_UNIT[u]) { st.unit = u; }
            else if (/^milli/.test(u)) { st.unit = "mm"; }
            else if (/^centi/.test(u)) { st.unit = "cm"; }
            else if (/^(poll|inch)/.test(u)) { st.unit = "in"; }
            else if (/^(punt|point)/.test(u)) { st.unit = "pt"; }
            else if (/^pix/.test(u)) { st.unit = "px"; }
        }
        var lineColor = swatchHex(doc, data.lineColorName), textColor = swatchHex(doc, data.textColorName);
        if (lineColor || textColor) { st.color = lineColor || textColor; }
        if (textColor) { st.textColor = textColor; }
        st.legacy = true;
        legacyCache.value = st;
        return st;
    }

    // Converte i dati salvati dalla versione 0.2 (quote solo orizzontali/verticali).
    function upgradeSpec(d) {
        if (d.type) { return d; }
        var h = d.axis === "h";
        var P = function (along, across) { return h ? [along, across] : [across, along]; };
        return {
            type: "lin",
            a: P(d.a.pos, d.a.edge), b: P(d.b.pos, d.b.edge),
            u: h ? X : Y,
            n: h ? [0, d.dir] : [d.dir, 0],
            ref: P(d.a.pos, d.ref),
            line: d.line, style: d.style
        };
    }

    // Ridisegna le quote selezionate con il nuovo stile, mantenendo le misure.
    function update(opts) {
        try {
            if (app.documents.length === 0) { return "ERR:Nessun documento aperto."; }
            var doc = app.activeDocument;
            var groups = selectedQuoteGroups(doc), i;
            if (groups.length === 0) { return "ERR:Seleziona una o più quote da aggiornare."; }
            var o = merge(opts);
            var ctx = { o: o, d: sizes(o), doc: doc, layer: getQuoteLayer(doc, true), color: makeColor(doc, o.color), textColor: makeColor(doc, o.textColor || o.color), count: 0 };

            for (i = 0; i < groups.length; i++) {
                var g = groups[i], spec = upgradeSpec(readQuoteData(g));
                // se la quota è stata spostata a mano, sposta anche la geometria salvata
                try {
                    var p0 = g.pathItems.getByName(LINE_NAME).pathPoints[0].anchor;
                    var moved = [p0[0] - spec.line[0], p0[1] - spec.line[1]];
                    // le quote collegate restano attaccate all'oggetto: conta solo lo spostamento di lato
                    if (spec.src && spec.type === "lin") { spec.shift = (spec.shift || 0) + vdot(moved, spec.n); }
                    else { translateSpec(spec, moved); }
                } catch (e1) {}
                drawSpec(spec, ctx, g);
                // in cima al livello: diventa lo stile di riferimento del documento
                try { g.zOrder(ZOrderMethod.BRINGTOFRONT); } catch (e3) {}
            }
            try { doc.selection = groups; } catch (e2) {}
            finishLayer(ctx, true);
            app.redraw();
            return "OK:" + ctx.count;
        } catch (e) {
            return "ERR:" + e.message + (e.line ? " (riga " + e.line + ")" : "");
        }
    }

    // Stile della prima quota selezionata (contagocce).
    function styleOfSelection() {
        try {
            if (app.documents.length === 0) { return "ERR:Nessun documento aperto."; }
            var groups = selectedQuoteGroups(app.activeDocument);
            if (groups.length === 0) { return "ERR:Seleziona una quota."; }
            return "OK:" + toJSON(readQuoteData(groups[0]).style);
        } catch (e) {
            return "ERR:" + e.message;
        }
    }

    // Stato per il pannello: documento attivo, misure della selezione, quote e punti selezionati,
    // stile salvato nel documento. Restituisce JSON.
    function state(opts) {
        var res = { doc: "", count: 0, w: "", h: "", quotes: 0, points: 0, docStyle: null };
        try {
            if (app.documents.length === 0) { return toJSON(res); }
            var doc = app.activeDocument, o = merge(opts), sel = doc.selection, items = [], rects = [], i;
            res.doc = doc.name;
            res.docStyle = documentStyle(doc);
            if (sel && sel.length > 0 && sel.typename !== "TextRange") {
                res.quotes = selectedQuoteGroups(doc).length;
                for (i = 0; i < sel.length; i++) {
                    if (!isOnQuoteLayer(sel[i])) { items.push(sel[i]); }
                }
                if (o.mode === "points") { res.points = collectPoints(items).length; }
                for (i = 0; i < items.length; i++) { rects.push(rect(boundsOf(items[i], o.useVisible))); }
            }
            if (rects.length > 0) {
                var u = unionRect(rects);
                res.count = rects.length;
                res.w = formatLength(u.right - u.left, o);
                res.h = formatLength(u.top - u.bottom, o);
            }
        } catch (e) {}
        return toJSON(res);
    }

    function clearAll() {
        try {
            if (app.documents.length === 0) { return "ERR:Nessun documento aperto."; }
            var layer = getQuoteLayer(app.activeDocument, false);
            if (!layer) { return "OK:0"; }
            layer.locked = false;
            var n = layer.pageItems.length;
            if (app.activeDocument.layers.length > 1) {
                layer.remove();
            } else {
                // un documento deve avere almeno un livello: svuotalo soltanto
                while (layer.pageItems.length > 0) { layer.pageItems[0].remove(); }
            }
            app.redraw();
            return "OK:" + n;
        } catch (e) {
            return "ERR:" + e.message;
        }
    }

    function toggleVisible() {
        try {
            if (app.documents.length === 0) { return "ERR:Nessun documento aperto."; }
            var layer = getQuoteLayer(app.activeDocument, false);
            if (!layer) { return "ERR:Non ci sono quote nel documento."; }
            layer.visible = !layer.visible;
            app.redraw();
            return "OK:" + (layer.visible ? "1" : "0");
        } catch (e) {
            return "ERR:" + e.message;
        }
    }

    // Blocca o sblocca il livello Quote (per poter selezionare le quote).
    function setLocked(locked) {
        try {
            if (app.documents.length === 0) { return "OK:"; }
            var layer = getQuoteLayer(app.activeDocument, false);
            if (layer) { layer.locked = !!locked; }
            return "OK:";
        } catch (e) {
            return "ERR:" + e.message;
        }
    }

    // ---------- preset su file (per condividerli con i colleghi) ----------

    function exportPresets(json) {
        try {
            var f = File.saveDialog("Salva i preset delle quote", "Preset quote:*.json");
            if (!f) { return "OK:"; }
            if (!/\.json$/i.test(f.name)) { f = new File(f.fsName + ".json"); }
            f.encoding = "UTF-8";
            f.open("w");
            f.write(json);
            f.close();
            return "OK:" + f.name;
        } catch (e) {
            return "ERR:" + e.message;
        }
    }

    // Copia delle impostazioni del pannello per lo script File > Script > Quota (scorciatoia da tastiera).
    function saveSettings(json) {
        try {
            var dir = new Folder(Folder.userData + "/IllustratorQuote");
            if (!dir.exists) { dir.create(); }
            var f = new File(dir.fsName + "/settings.json");
            f.encoding = "UTF-8";
            f.open("w");
            f.write(json);
            f.close();
            return "OK:";
        } catch (e) {
            return "ERR:" + e.message;
        }
    }

    // Cartelle Presets/<lingua>/Scripts di questo Illustrator (menu File > Script).
    // Su Windows app.path può essere ".../Support Files", quindi si cerca anche più in alto.
    // Il nome della cartella dipende dalla lingua: Scripts, Script (italiano), Skripten...
    var SCRIPT_DIR = /^(scripts?|skript\w*|scripten)(\.localized)?$/i;
    var scriptDiag = "";

    function scriptFolders() {
        var out = [], bases = [], f = app.path, i, j, k, n, locs, subs, seen = [];
        for (i = 0; i < 4 && f; i++) { bases.push(f); f = f.parent; }
        var isDir = function (x) { return x instanceof Folder; };
        for (n = 0; n < bases.length && !out.length; n++) {
            var tops = bases[n].getFiles(isDir);
            for (i = 0; i < tops.length; i++) {
                if (!/^presets/i.test(tops[i].name)) { continue; }
                locs = tops[i].getFiles(isDir);
                for (j = 0; j < locs.length; j++) {
                    subs = locs[j].getFiles(isDir);
                    for (k = 0; k < subs.length; k++) {
                        if (SCRIPT_DIR.test(decodeURI(subs[k].name))) { out.push(subs[k]); }
                    }
                    if (seen.length < 1) {
                        var names = [];
                        for (k = 0; k < subs.length && k < 30; k++) { names.push(decodeURI(subs[k].name)); }
                        seen.push(locs[j].fsName + ": " + names.join(", "));
                    }
                }
            }
        }
        scriptDiag = seen.join("; ");
        // prima la cartella della lingua di Illustrator
        out.sort(function (a, b) {
            return (b.fsName.indexOf(app.locale) >= 0) - (a.fsName.indexOf(app.locale) >= 0);
        });
        return out;
    }

    // Stato dello script Quota (src vuoto) oppure installazione copiando src in tutte le cartelle Script.
    function shortcutScript(src) {
        try {
            var dirs = scriptFolders(), i, found = 0, copied = 0, err = "";
            if (!dirs.length) { return "ERR:Cartella degli script di Illustrator non trovata vicino a " + app.path.fsName + (scriptDiag ? " (trovato " + scriptDiag + ")" : " (nessuna cartella Presets)") + "."; }
            for (i = 0; i < dirs.length; i++) {
                var target = new File(dirs[i].fsName + "/Quota.jsx");
                if (src) {
                    if (new File(src).copy(target)) { copied++; } else { err = new File(src).error || "copia non riuscita"; }
                }
                if (target.exists) { found++; }
            }
            if (!src) { return "OK:" + (found ? "1" : "0"); }
            if (!copied) {
                // senza permessi: apre le due cartelle per trascinare il file a mano
                try { new File(src).parent.execute(); dirs[0].execute(); } catch (eOpen) {}
                return "ERR:Illustrator non ha i permessi per copiare lo script (" + err + "). Ho aperto le due cartelle: trascina Quota.jsx in " +
                    dirs[0].fsName + " (Windows chiederà conferma), poi riavvia Illustrator.";
            }
            return "OK:Script installato. Riavvia Illustrator: lo trovi in File > Script > Quota.";
        } catch (e) {
            return "ERR:" + e.message;
        }
    }

    function importPresets() {
        try {
            var f = File.openDialog("Apri un file di preset delle quote", "Preset quote:*.json");
            if (!f) { return "OK:"; }
            f.encoding = "UTF-8";
            f.open("r");
            var s = f.read();
            f.close();
            return "OK:" + s;
        } catch (e) {
            return "ERR:" + e.message;
        }
    }

    // Selettore colore di Illustrator (ha i campi CMYK). Restituisce il colore scelto come stringa.
    function pickColor(value) {
        try {
            var doc = app.documents.length ? app.activeDocument : null, start;
            var cmyk = parseCmyk(value);
            if (cmyk || !doc) {
                start = new CMYKColor();
                cmyk = cmyk || [0, 0, 0, 100];
                start.cyan = cmyk[0]; start.magenta = cmyk[1]; start.yellow = cmyk[2]; start.black = cmyk[3];
            } else {
                start = makeColor(doc, value);
            }
            var c = app.showColorPicker(start);
            return "OK:" + (colorToHex(c) || "");
        } catch (e) {
            return "ERR:" + e.message;
        }
    }

    // Caricamento esplicito (pulsante nel pannello) con la diagnosi di cosa è stato trovato.
    function loadLegacy() {
        try {
            if (app.documents.length === 0) { return "ERR:Nessun documento aperto."; }
            var st = legacyStyle(app.activeDocument, true);
            if (!st) { return "ERR:Impostazioni del vecchio sistema non trovate: " + legacyCache.diag + "."; }
            return "OK:" + toJSON(st);
        } catch (e) {
            return "ERR:" + e.message;
        }
    }

    return {
        version: VERSION, loadLegacy: loadLegacy, pickColor: pickColor,
        quote: quote, update: update, autoUpdate: autoUpdate, styleOfSelection: styleOfSelection, state: state,
        clearAll: clearAll, toggleVisible: toggleVisible, setLocked: setLocked,
        exportPresets: exportPresets, importPresets: importPresets, saveSettings: saveSettings, shortcutScript: shortcutScript
    };
}());
