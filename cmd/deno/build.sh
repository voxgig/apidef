#!/bin/bash

# Build standalone executables for voxgig-apidef using deno compile.
# Produces platform-specific binaries in the dist/ folder.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

DIST_DIR="$SCRIPT_DIR/dist"
mkdir -p "$DIST_DIR"

echo "Building voxgig-apidef standalone executable..."

# Build for current platform.
deno compile \
  --allow-read \
  --allow-write \
  --allow-env \
  --allow-net \
  --output "$DIST_DIR/voxgig-apidef" \
  main.ts

echo "Built: $DIST_DIR/voxgig-apidef"

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
#     --target "$TARGET" \
#     --output "$DIST_DIR/voxgig-apidef-$TARGET" \
#     main.ts
#   echo "Built: $DIST_DIR/voxgig-apidef-$TARGET"
# done

echo "Done."
