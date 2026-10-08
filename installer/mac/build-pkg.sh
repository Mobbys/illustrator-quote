#!/bin/bash
# Crea l'installer macOS (.pkg). Va eseguito su un Mac (lo fa GitHub Actions).
set -e
cd "$(dirname "$0")/../.."
VERSION=$(sed -n 's/.*ExtensionBundleVersion="\([^"]*\)".*/\1/p' extension/CSXS/manifest.xml)
ROOT=$(mktemp -d)
cp -R extension/ "$ROOT/"
rm -f "$ROOT/.debug"
chmod +x installer/mac/scripts/*
mkdir -p dist
pkgbuild \
  --root "$ROOT" \
  --identifier com.mobbys.illustratorquote.pkg \
  --version "$VERSION" \
  --install-location "/Library/Application Support/Adobe/CEP/extensions/com.mobbys.illustratorquote" \
  --scripts installer/mac/scripts \
  "dist/IllustratorQuote-$VERSION.pkg"
rm -rf "$ROOT"
echo "Creato dist/IllustratorQuote-$VERSION.pkg"
