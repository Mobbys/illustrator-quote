# Illustrator Quote

Pannello per Adobe Illustrator che aggiunge le **quote** (linee di misura con frecce e testo) agli oggetti selezionati.

## Cosa fa

- **Ogni oggetto**: larghezza e/o altezza di ciascun oggetto selezionato.
- **Selezione**: ingombro totale di tutti gli oggetti selezionati.
- **Distanze**: spazio libero tra oggetti vicini, in orizzontale e in verticale (quote a catena).
- Lati a scelta: sopra, sotto, sinistra, destra.
- Unità mm, cm, pollici, pt, px; decimali; virgola o punto; **scala 1:N** per disegni tecnici.
- Stile: distanza dall'oggetto, stacco, dimensione testo, spessore tratto, colore, terminali (frecce, barrette, punti).
- Funziona con qualsiasi oggetto (tracciati, gruppi, testi, immagini, simboli). Per i gruppi con maschera di ritaglio misura la maschera.
- Opzione per includere lo spessore del tratto nella misura.
- Le quote vanno nel livello **"Quote"**, ognuna in un gruppo: si possono spostare, nascondere o eliminare tutte con un clic.
- Le impostazioni vengono ricordate tra una sessione e l'altra.

## Installazione rapida (senza firma)

1. Scarica il repository (pulsante **Code > Download ZIP**) e scompattalo.
2. Chiudi Illustrator.
3. Esegui lo script:
   - **macOS**: apri il Terminale e lancia `bash scripts/install-mac.sh`
   - **Windows**: doppio clic su `scripts\install-win.bat`
4. Riapri Illustrator: **Finestra > Estensioni > Quote**.

Lo script copia la cartella `extension` nella cartella delle estensioni CEP e attiva `PlayerDebugMode`, che permette a Illustrator di caricare estensioni non firmate.

Percorsi manuali, se preferisci copiare a mano la cartella `extension` (rinominandola `com.mobbys.illustratorquote`):

- macOS: `~/Library/Application Support/Adobe/CEP/extensions/`
- Windows: `%APPDATA%\Adobe\CEP\extensions\`

## Distribuire ai colleghi con un pacchetto .zxp (consigliato)

Un file `.zxp` firmato si installa senza toccare `PlayerDebugMode`.

1. Scarica [ZXPSignCmd](https://github.com/Adobe-CEP/CEP-Resources/tree/master/ZXPSignCMD).
2. Lancia `ZXPSIGN=/percorso/ZXPSignCmd CERT_PASS=unaPassword bash scripts/build-zxp.sh`.
   La prima volta crea un certificato self-signed `cert.p12` (tienilo da parte: serve per firmare gli aggiornamenti).
3. Dai ai colleghi il file `dist/IllustratorQuote-x.y.z.zxp`, che si installa con un installer ZXP
   (ad esempio *ZXP Installer* di aescripts o *Anastasiy's Extension Manager*).

## Come è fatto

È un'estensione **CEP** (Common Extensibility Platform): un pannello HTML/JavaScript dentro Illustrator
che chiama uno script **ExtendScript** per disegnare nel documento.

```
extension/
  CSXS/manifest.xml   dichiarazione dell'estensione (ID, versioni Illustrator supportate, dimensioni pannello)
  index.html          interfaccia del pannello
  css/style.css       stile (si adatta al tema chiaro/scuro di Illustrator)
  js/main.js          logica del pannello, salva le impostazioni, chiama ExtendScript
  jsx/quote.jsx       motore: legge la selezione e disegna linee, frecce e testi
  .debug              abilita il debug remoto su http://localhost:8088 (solo sviluppo)
scripts/
  install-mac.sh, install-win.bat   installazione rapida
  build-zxp.sh                      crea il pacchetto firmato
```

Per modificare il pannello: installalo con lo script, modifica i file direttamente nella cartella delle estensioni
(o crea un link simbolico al repository), poi chiudi e riapri il pannello. Con Illustrator aperto,
`http://localhost:8088` in Chrome mostra la console del pannello.

**Perché CEP e non UXP?** UXP è la piattaforma più recente di Adobe, ma CEP è ancora supportato da Illustrator ed è
quella che funziona su più versioni (dalla CC 2018 in poi), quindi è la scelta più sicura per un team con installazioni diverse.
