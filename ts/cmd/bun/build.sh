#!/bin/bash
# Bun standalone executable build script
# Requires: bun >= 1.0
#
# Bun's --compile flag bundles all dependencies and the Bun runtime
# into a single executable. Cross-compilation is supported via --target.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

echo "=== Bun version ==="
bun --version

echo ""
echo "=== Building standalone executable (current platform) ==="
bun build "$SCRIPT_DIR/entry.js" \
  --compile \
  --outfile "$BUILD_DIR/voxgig-apidef" \
  2>&1

echo ""
echo "=== Result ==="
ls -lh "$BUILD_DIR/voxgig-apidef"

echo ""
echo "Testing --version:"
"$BUILD_DIR/voxgig-apidef" --version 2>&1 || true

echo ""
echo "Testing --help:"
"$BUILD_DIR/voxgig-apidef" --help 2>&1 || true

echo ""
echo "=== Cross-compilation targets (build only, no test) ==="

# Uncomment to build for other platforms:
TARGETS=("bun-linux-x64" "bun-linux-arm64" "bun-darwin-x64" "bun-darwin-arm64" "bun-windows-x64")

for target in "${TARGETS[@]}"; do
  echo ""
  echo "--- Building for $target ---"
  outname="voxgig-apidef-${target}"
  if [[ "$target" == *"windows"* ]]; then
    outname="${outname}.exe"
  fi
  bun build "$SCRIPT_DIR/entry.js" \
    --compile \
    --target="$target" \
    --outfile "$BUILD_DIR/$outname" \
    2>&1 || echo "  FAILED for $target"
  if [ -f "$BUILD_DIR/$outname" ]; then
    ls -lh "$BUILD_DIR/$outname"
  fi
done

echo ""
echo "=== All builds ==="
ls -lh "$BUILD_DIR"/voxgig-apidef*
