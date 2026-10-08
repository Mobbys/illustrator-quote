#!/bin/bash
# Crea un pacchetto firmato .zxp da distribuire ai colleghi.
# Richiede ZXPSignCmd (https://github.com/Adobe-CEP/CEP-Resources/tree/master/ZXPSignCMD)
# nel PATH o indicato con la variabile ZXPSIGN.
set -e
cd "$(dirname "$0")/.."
ZXPSIGN="${ZXPSIGN:-ZXPSignCmd}"
CERT="${CERT:-cert.p12}"
PASS="${CERT_PASS:-cambiami}"
VERSION=$(sed -n 's/.*ExtensionBundleVersion="\([^"]*\)".*/\1/p' extension/CSXS/manifest.xml)
OUT="dist/IllustratorQuote-$VERSION.zxp"

mkdir -p dist
if [ ! -f "$CERT" ]; then
  echo "Creo un certificato self-signed: $CERT"
  "$ZXPSIGN" -selfSignedCert IT Italia Mobbys "Illustrator Quote" "$PASS" "$CERT"
fi
rm -f "$OUT"
# il file .debug serve solo in sviluppo: lo escludiamo dal pacchetto
TMP=$(mktemp -d)
cp -R extension/ "$TMP/extension"
rm -f "$TMP/extension/.debug"
"$ZXPSIGN" -sign "$TMP/extension" "$OUT" "$CERT" "$PASS" -tsa http://timestamp.digicert.com
rm -rf "$TMP"
echo "Creato $OUT"
