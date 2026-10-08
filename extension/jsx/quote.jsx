/*
 * Illustrator Quote - motore ExtendScript.
 *
 * Disegna quote (linee di misura, linee di richiamo, frecce e testo) attorno
 * agli oggetti selezionati. Tutte le quote finiscono nel livello "Quote",
 * ognuna in un gruppo separato, così si possono nascondere o cancellare in blocco.
 *
 * Nota: ExtendScript è ES3, quindi niente let/const, arrow function, forEach, ecc.
 * Coordinate Illustrator: punti (pt), y crescente verso l'alto,
 * bounds = [sinistra, alto, destra, basso].
 */

var IQ = (function () {
    var LAYER_NAME = "Quote";
    var PT_PER_UNIT = { mm: 72 / 25.4, cm: 72 / 2.54, "in": 72, pt: 1, px: 1 };

    var DEFAULTS = {
        unit: "mm",          // unità mostrata nel testo
        decimals: 1,
        comma: true,         // separatore decimale ","
        showUnit: true,      // aggiunge " mm" al testo
        scale: 1,            // scala disegno 1:N (valore reale = misura * N)
        mode: "each",        // each | all | gaps
        top: true,           // larghezza sopra
        bottom: false,       // larghezza sotto
        left: true,          // altezza a sinistra
        right: false,        // altezza a destra
        useVisible: false,   // true = include lo spessore del tratto
        offsetMm: 5,         // distanza linea di quota dall'oggetto
        gapMm: 1,            // stacco tra oggetto e linea di richiamo
        extMm: 1.5,          // sporgenza della linea di richiamo oltre la quota
        textGapMm: 1,        // distanza testo / linea di quota
        fontSize: 8,         // pt
        strokeWidth: 0.5,    // pt
        endSize: 5,          // dimensione terminali in pt
        endStyle: "arrow",   // arrow | tick | dot | none
        color: "#E6007E"
    };

    // ---------- utilità ----------

    function merge(opts) {
        var o = {}, k;
        for (k in DEFAULTS) { if (DEFAULTS.hasOwnProperty(k)) { o[k] = DEFAULTS[k]; } }
        if (opts) { for (k in opts) { if (opts.hasOwnProperty(k)) { o[k] = opts[k]; } } }
        return o;
    }

    function mm(v) { return v * PT_PER_UNIT.mm; }

    function formatLength(pt, o) {
        var factor = PT_PER_UNIT[o.unit] || PT_PER_UNIT.mm;
        var value = Math.abs(pt) / factor * (o.scale || 1);
        var s = value.toFixed(o.decimals);
        if (o.comma) { s = s.replace(".", ","); }
        if (o.showUnit) { s += " " + o.unit; }
        return s;
    }

    function makeColor(doc, hex) {
        hex = String(hex || "#000000").replace("#", "");
        if (hex.length === 3) { hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2); }
        var r = parseInt(hex.substr(0, 2), 16), g = parseInt(hex.substr(2, 2), 16), b = parseInt(hex.substr(4, 2), 16);
        if (isNaN(r) || isNaN(g) || isNaN(b)) { r = g = b = 0; }
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
        rgb.red = r; rgb.green = g; rgb.blue = b;
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

    // ---------- disegno ----------

    // Converte coordinate (lungo, trasversale) in [x, y] a seconda dell'asse.
    function P(axis, along, across) {
        return axis === "h" ? [along, across] : [across, along];
    }

    function addLine(g, pts, ctx) {
        var p = g.pathItems.add();
        p.setEntirePath(pts);
        p.filled = false;
        p.stroked = true;
        p.strokeColor = ctx.color;
        p.strokeWidth = ctx.o.strokeWidth;
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

    // Terminale della quota. sign = -1 se la freccia punta verso "lungo" decrescente.
    function addEnd(g, axis, at, lineAcross, sign, ctx) {
        var s = ctx.o.endSize;
        switch (ctx.o.endStyle) {
        case "arrow":
            var w = s * 0.35;
            addFilled(g, [
                P(axis, at, lineAcross),
                P(axis, at - sign * s, lineAcross + w),
                P(axis, at - sign * s, lineAcross - w)
            ], ctx);
            break;
        case "tick":
            var t = s * 0.5;
            addLine(g, [P(axis, at - t, lineAcross - t), P(axis, at + t, lineAcross + t)], ctx);
            break;
        case "dot":
            var d = s * 0.5;
            var c = P(axis, at, lineAcross);
            var e = g.pathItems.ellipse(c[1] + d / 2, c[0] - d / 2, d, d);
            e.stroked = false;
            e.filled = true;
            e.fillColor = ctx.color;
            break;
        }
    }

    function addLabel(g, axis, along, lineAcross, dir, text, ctx) {
        var tf = g.textFrames.add();
        tf.contents = text;
        var attrs = tf.textRange.characterAttributes;
        attrs.size = ctx.o.fontSize;
        attrs.fillColor = ctx.color;
        if (axis === "v") { tf.rotate(90); }
        var b = tf.geometricBounds;
        var w = b[2] - b[0], h = b[1] - b[3];
        var across = (axis === "h" ? h : w);
        var center = P(axis, along, lineAcross + dir * (mm(ctx.o.textGapMm) + across / 2));
        var cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
        tf.translate(center[0] - cx, center[1] - cy);
        return tf;
    }

    /*
     * Quota lineare generica.
     * axis: "h" misura lungo x, "v" misura lungo y.
     * a, b: { pos: coordinata lungo l'asse, edge: coordinata trasversale da cui parte il richiamo }
     * lineAcross: coordinata trasversale della linea di quota
     * dir: +1 / -1, verso esterno (dove stanno richiami e testo)
     */
    function drawDimension(axis, a, b, lineAcross, dir, ctx) {
        var o = ctx.o;
        var lo = Math.min(a.pos, b.pos), hi = Math.max(a.pos, b.pos);
        var dist = hi - lo;
        if (dist <= 0.0001) { return null; }

        var g = ctx.layer.groupItems.add();
        var label = formatLength(dist, o);
        g.name = "Quota " + label;

        var gap = mm(o.gapMm), ext = mm(o.extMm);
        var pts = [a, b], i;
        for (i = 0; i < 2; i++) {
            var start = pts[i].edge + dir * gap;
            var end = lineAcross + dir * ext;
            // salta il richiamo se l'oggetto è già oltre la linea di quota
            if ((end - start) * dir > 0) {
                addLine(g, [P(axis, pts[i].pos, start), P(axis, pts[i].pos, end)], ctx);
            }
        }

        addLine(g, [P(axis, lo, lineAcross), P(axis, hi, lineAcross)], ctx);

        // se la quota è troppo corta le frecce vanno all'esterno
        var outside = (o.endStyle === "arrow" && dist < o.endSize * 2.5);
        if (outside) {
            addLine(g, [P(axis, lo - o.endSize * 2, lineAcross), P(axis, lo, lineAcross)], ctx);
            addLine(g, [P(axis, hi, lineAcross), P(axis, hi + o.endSize * 2, lineAcross)], ctx);
        }
        addEnd(g, axis, lo, lineAcross, outside ? 1 : -1, ctx);
        addEnd(g, axis, hi, lineAcross, outside ? -1 : 1, ctx);

        addLabel(g, axis, (lo + hi) / 2, lineAcross, dir, label, ctx);
        ctx.count++;
        return g;
    }

    // Larghezza/altezza di un rettangolo sui lati richiesti.
    function quoteRect(r, ctx) {
        var o = ctx.o, off = mm(o.offsetMm);
        if (o.top) {
            drawDimension("h", { pos: r.left, edge: r.top }, { pos: r.right, edge: r.top }, r.top + off, 1, ctx);
        }
        if (o.bottom) {
            drawDimension("h", { pos: r.left, edge: r.bottom }, { pos: r.right, edge: r.bottom }, r.bottom - off, -1, ctx);
        }
        if (o.left) {
            drawDimension("v", { pos: r.bottom, edge: r.left }, { pos: r.top, edge: r.left }, r.left - off, -1, ctx);
        }
        if (o.right) {
            drawDimension("v", { pos: r.bottom, edge: r.right }, { pos: r.top, edge: r.right }, r.right + off, 1, ctx);
        }
    }

    function unionRect(rects) {
        var u = { left: rects[0].left, top: rects[0].top, right: rects[0].right, bottom: rects[0].bottom }, i;
        for (i = 1; i < rects.length; i++) {
            u.left = Math.min(u.left, rects[i].left);
            u.top = Math.max(u.top, rects[i].top);
            u.right = Math.max(u.right, rects[i].right);
            u.bottom = Math.min(u.bottom, rects[i].bottom);
        }
        return u;
    }

    // Distanze libere tra oggetti consecutivi (catena di quote).
    function quoteGaps(rects, ctx) {
        var o = ctx.o, off = mm(o.offsetMm), all = unionRect(rects), i, a, b;
        var byX = rects.slice(0).sort(function (p, q) { return p.left - q.left; });
        var byY = rects.slice(0).sort(function (p, q) { return q.top - p.top; });

        for (i = 0; i < byX.length - 1; i++) {
            a = byX[i]; b = byX[i + 1];
            if (b.left - a.right <= 0) { continue; }
            if (o.top) {
                drawDimension("h", { pos: a.right, edge: a.top }, { pos: b.left, edge: b.top }, all.top + off, 1, ctx);
            }
            if (o.bottom) {
                drawDimension("h", { pos: a.right, edge: a.bottom }, { pos: b.left, edge: b.bottom }, all.bottom - off, -1, ctx);
            }
        }
        for (i = 0; i < byY.length - 1; i++) {
            a = byY[i]; b = byY[i + 1];
            if (a.bottom - b.top <= 0) { continue; }
            if (o.left) {
                drawDimension("v", { pos: b.top, edge: b.left }, { pos: a.bottom, edge: a.left }, all.left - off, -1, ctx);
            }
            if (o.right) {
                drawDimension("v", { pos: b.top, edge: b.right }, { pos: a.bottom, edge: a.right }, all.right + off, 1, ctx);
            }
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
            if (!(o.top || o.bottom || o.left || o.right)) { return "ERR:Scegli almeno un lato."; }

            var rects = [];
            for (i = 0; i < items.length; i++) { rects.push(rect(boundsOf(items[i], o.useVisible))); }

            var ctx = { o: o, doc: doc, layer: getQuoteLayer(doc, true), color: makeColor(doc, o.color), count: 0 };

            if (o.mode === "all") {
                quoteRect(unionRect(rects), ctx);
            } else if (o.mode === "gaps") {
                if (rects.length < 2) { return "ERR:Per le distanze servono almeno 2 oggetti."; }
                quoteGaps(rects, ctx);
            } else {
                for (i = 0; i < rects.length; i++) { quoteRect(rects[i], ctx); }
            }

            // ripristina la selezione originale
            try { doc.selection = items; } catch (e1) {}
            app.redraw();
            return "OK:" + ctx.count;
        } catch (e) {
            return "ERR:" + e.message + (e.line ? " (riga " + e.line + ")" : "");
        }
    }

    // Restituisce larghezza e altezza della selezione (per l'anteprima nel pannello).
    function measure(opts) {
        try {
            if (app.documents.length === 0) { return ""; }
            var doc = app.activeDocument, o = merge(opts), sel = doc.selection, rects = [], i;
            if (!sel || sel.length === 0 || sel.typename === "TextRange") { return ""; }
            for (i = 0; i < sel.length; i++) {
                if (!isOnQuoteLayer(sel[i])) { rects.push(rect(boundsOf(sel[i], o.useVisible))); }
            }
            if (rects.length === 0) { return ""; }
            var u = unionRect(rects);
            return rects.length + "|" + formatLength(u.right - u.left, o) + "|" + formatLength(u.top - u.bottom, o);
        } catch (e) {
            return "";
        }
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

    return { quote: quote, measure: measure, clearAll: clearAll, toggleVisible: toggleVisible };
}());
