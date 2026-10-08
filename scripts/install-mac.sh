#!/bin/bash
# Installa il pannello "Quote" in Illustrator (macOS) senza firma ZXP.
set -e
SRC="$(cd "$(dirname "$0")/../extension" && pwd)"
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/com.mobbys.illustratorquote"

# Permette il caricamento di estensioni non firmate
for v in 8 9 10 11 12 13; do
  defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1
done

rm -rf "$DEST"
mkdir -p "$DEST"
cp -R "$SRC/" "$DEST/"
echo "Installato in: $DEST"
echo "Riavvia Illustrator e apri Finestra > Estensioni > Quote"
