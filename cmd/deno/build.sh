#!/bin/bash
# Deno compile build script
# Requires: deno >= 1.40 (for improved Node.js compat)
#
# Deno's compile command bundles code + a slimmed-down Deno runtime (denort)
# into a single executable. It supports npm: specifiers for Node.js packages.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

echo "=== Checking for Deno ==="
if ! command -v deno &> /dev/null; then
  echo "Deno is not installed. Attempting to install..."
  curl -fsSL https://deno.land/install.sh | sh 2>&1
  export DENO_INSTALL="$HOME/.deno"
  export PATH="$DENO_INSTALL/bin:$PATH"
fi

if ! command -v deno &> /dev/null; then
  echo "ERROR: Deno installation failed or not in PATH"
  echo "Install manually: curl -fsSL https://deno.land/install.sh | sh"
  exit 1
fi

deno --version

echo ""
echo "=== Attempting Deno compile ==="
cd "$REPO_ROOT"
deno compile \
  --allow-read \
  --allow-write \
  --allow-env \
  --allow-net \
  --allow-sys \
  --node-modules-dir=auto \
  --output "$BUILD_DIR/voxgig-apidef" \
  "$SCRIPT_DIR/main.ts" \
  2>&1

echo ""
echo "=== Result ==="
if [ -f "$BUILD_DIR/voxgig-apidef" ]; then
  ls -lh "$BUILD_DIR/voxgig-apidef"
  echo ""
  echo "Testing --version:"
  "$BUILD_DIR/voxgig-apidef" --version 2>&1 || true
  echo ""
  echo "Testing --help:"
  "$BUILD_DIR/voxgig-apidef" --help 2>&1 || true
else
  echo "Build failed - no executable produced"
fi

# Optionally cross-compile for other targets.
# Uncomment the targets you need.

# TARGETS=(
#   "x86_64-unknown-linux-gnu"
#   "aarch64-unknown-linux-gnu"
#   "x86_64-apple-darwin"
#   "aarch64-apple-darwin"
#   "x86_64-pc-windows-msvc"
# )
#
# for TARGET in "${TARGETS[@]}"; do
#   echo "Cross-compiling for $TARGET..."
#   deno compile \
#     --allow-read \
#     --allow-write \
#     --allow-env \
#     --allow-net \
#     --allow-sys \
#     --node-modules-dir=auto \
#     --target "$TARGET" \
#     --output "$BUILD_DIR/voxgig-apidef-$TARGET" \
#     "$SCRIPT_DIR/main.ts"
#   echo "Built: $BUILD_DIR/voxgig-apidef-$TARGET"
# done
