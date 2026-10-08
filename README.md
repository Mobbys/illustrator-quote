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

## Installazione (per tutti)

1. Vai nella pagina [Releases](https://github.com/Mobbys/illustrator-quote/releases/latest) e scarica il file per il tuo computer:
   - **Windows**: `IllustratorQuote-Setup-x.y.z.exe`
   - **Mac**: `IllustratorQuote-x.y.z.pkg`
2. Chiudi Illustrator e fai **doppio clic** sul file scaricato.
3. Apri Illustrator: **Finestra > Estensioni > Quote**.

Per aggiornare basta installare la versione nuova sopra quella vecchia.

**Avvisi di sicurezza la prima volta.** Gli installer non sono firmati con un certificato a pagamento, quindi il sistema chiede una conferma:

- **Windows** (SmartScreen "Windows ha protetto il PC"): clic su **Ulteriori informazioni > Esegui comunque**.
- **Mac** ("impossibile aprire perché proviene da uno sviluppatore non identificato"): apri **Impostazioni di Sistema > Privacy e sicurezza**, scorri in basso e clic su **Apri comunque**.

Disinstallare: su Windows da **Impostazioni > App**; su Mac eliminando la cartella
`/Library/Application Support/Adobe/CEP/extensions/com.mobbys.illustratorquote`.

## Pubblicare una nuova versione

1. Aggiorna `ExtensionBundleVersion` (e `Version`) in `extension/CSXS/manifest.xml`, per esempio `0.2.0`.
2. Crea e pubblica il tag corrispondente: `git tag v0.2.0 && git push origin v0.2.0`.
3. GitHub Actions crea gli installer Windows e Mac e li pubblica in una nuova Release, pronta da condividere.

Ad ogni push gli installer vengono comunque generati e si trovano tra gli *artifact* della scheda **Actions**, utili per provarli prima di pubblicare.

## Installazione per sviluppo

Chiudi Illustrator e lancia `bash scripts/install-mac.sh` (Mac) o `scripts\install-win.bat` (Windows):
copiano la cartella `extension` tra le estensioni CEP e attivano `PlayerDebugMode`, che permette di caricare estensioni non firmate.
In alternativa `scripts/build-zxp.sh` crea un pacchetto `.zxp` firmato, installabile con *ZXP Installer*
(richiede [ZXPSignCmd](https://github.com/Adobe-CEP/CEP-Resources/tree/master/ZXPSignCMD)).

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
installer/
  windows/installer.nsi             installer .exe (NSIS)
  mac/build-pkg.sh                  installer .pkg
scripts/
  install-mac.sh, install-win.bat   installazione per sviluppo
  build-zxp.sh                      crea un pacchetto .zxp firmato
.github/workflows/build.yml         genera gli installer e la Release
```

Per modificare il pannello: installalo con lo script, modifica i file direttamente nella cartella delle estensioni
(o crea un link simbolico al repository), poi chiudi e riapri il pannello. Con Illustrator aperto,
`http://localhost:8088` in Chrome mostra la console del pannello.

**Perché CEP e non UXP?** UXP è la piattaforma più recente di Adobe, ma CEP è ancora supportato da Illustrator ed è
quella che funziona su più versioni (dalla CC 2018 in poi), quindi è la scelta più sicura per un team con installazioni diverse.
