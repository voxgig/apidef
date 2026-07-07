#!/bin/bash
# Node.js Single Executable Application (SEA) build script
# Requires: Node.js >= 20 (SEA support), esbuild (for bundling)
#
# This script bundles the CLI into a single JS file, then injects it
# into a copy of the Node.js binary to create a standalone executable.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"
OUTPUT="$BUILD_DIR/voxgig-apidef"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

echo "=== Step 1: Bundle with esbuild ==="
npx esbuild "$REPO_ROOT/bin/voxgig-apidef" \
  --bundle \
  --platform=node \
  --target=node20 \
  --format=cjs \
  --outfile="$BUILD_DIR/sea-prep.js" \
  --define:process.env.NODE_ENV=\"production\" \
  --external:fsevents \
  2>&1

echo ""
echo "Bundle size: $(wc -c < "$BUILD_DIR/sea-prep.js") bytes"

echo ""
echo "=== Step 2: Generate SEA blob ==="
cat > "$BUILD_DIR/sea-config.json" << 'SEACONFIG'
{
  "main": "sea-prep.js",
  "output": "sea-prep.blob",
  "disableExperimentalSEAWarning": true
}
SEACONFIG

cd "$BUILD_DIR"
node --experimental-sea-config sea-config.json 2>&1

echo ""
echo "Blob size: $(wc -c < "$BUILD_DIR/sea-prep.blob") bytes"

echo ""
echo "=== Step 3: Create executable ==="
cp "$(which node)" "$OUTPUT"

# Inject the blob using postject
# On Node 20+, postject is available via npx
npx postject "$OUTPUT" NODE_SEA_BLOB "$BUILD_DIR/sea-prep.blob" \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
  2>&1

echo ""
echo "=== Result ==="
ls -lh "$OUTPUT"
echo ""
echo "Testing --version:"
"$OUTPUT" --version 2>&1 || true
echo ""
echo "Testing --help:"
"$OUTPUT" --help 2>&1 || true
