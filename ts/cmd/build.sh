#!/bin/bash
# Unified build script for voxgig-apidef standalone executables.
#
# Usage:
#   cmd/build.sh <target> [os-arch]
#
# Targets:
#   bun         Bun standalone executable
#   deno        Deno compiled executable (esbuild bundle + deno compile)
#   node-sea    Node.js Single Executable Application
#   all         Build all three targets
#
# OS-Arch (optional, defaults to current platform):
#   linux-x64        Linux x86_64
#   linux-arm64      Linux aarch64
#   darwin-x64       macOS x86_64
#   darwin-arm64     macOS Apple Silicon
#   windows-x64      Windows x86_64
#
# Examples:
#   cmd/build.sh bun                    # Bun for current platform
#   cmd/build.sh bun linux-arm64        # Bun cross-compile for Linux ARM
#   cmd/build.sh node-sea               # Node SEA (current platform only)
#   cmd/build.sh deno darwin-arm64      # Deno for macOS Apple Silicon
#   cmd/build.sh all                    # All targets, current platform

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$REPO_ROOT/cmd/build"

TARGET="${1:-}"
OS_ARCH="${2:-}"

PASS=0
FAIL=0
SKIP=0

# ============================================================
# Helpers
# ============================================================

usage() {
  echo "Usage: cmd/build.sh <target> [os-arch]"
  echo ""
  echo "Targets:  bun | deno | node-sea | all"
  echo "OS-Arch:  linux-x64 | linux-arm64 | darwin-x64 | darwin-arm64 | windows-x64"
  echo ""
  echo "If os-arch is omitted, builds for the current platform."
  exit 1
}

report() {
  local status="$1"
  local msg="$2"
  if [ "$status" = "PASS" ]; then
    PASS=$((PASS + 1))
  elif [ "$status" = "FAIL" ]; then
    FAIL=$((FAIL + 1))
  elif [ "$status" = "SKIP" ]; then
    SKIP=$((SKIP + 1))
  fi
  printf "  %-4s: %s\n" "$status" "$msg"
}

exe_name() {
  local base="$1"
  local os_arch="$2"
  if [ -n "$os_arch" ]; then
    base="${base}-${os_arch}"
  fi
  if [[ "$os_arch" == windows-* ]]; then
    base="${base}.exe"
  fi
  echo "$base"
}

verify_exe() {
  local exe="$1"
  local label="$2"
  if [ ! -f "$exe" ]; then
    report "FAIL" "$label: executable not produced"
    return 1
  fi
  ls -lh "$exe"
  # Only test --version and --help for native builds (no cross-compile)
  if [ -z "$OS_ARCH" ]; then
    local ver
    ver=$("$exe" --version 2>&1) || true
    if [ -n "$ver" ]; then
      report "PASS" "$label: --version => $ver"
    else
      report "FAIL" "$label: --version returned empty"
    fi
  else
    report "SKIP" "$label: --version (cross-compiled, cannot execute)"
  fi
  return 0
}

# ============================================================
# Build: Bun
# ============================================================

build_bun() {
  local os_arch="$1"
  local out_dir="$BUILD_DIR/bun"
  mkdir -p "$out_dir"

  echo ""
  echo "=== Building Bun executable ==="

  if ! command -v bun &> /dev/null; then
    report "SKIP" "Bun (bun not installed)"
    return
  fi

  echo "bun $(bun --version)"

  local out_name
  out_name=$(exe_name "voxgig-apidef" "$os_arch")
  local out_file="$out_dir/$out_name"

  local target_flag=""
  if [ -n "$os_arch" ]; then
    # Map os-arch to bun target format: bun-<os>-<arch>
    target_flag="--target=bun-${os_arch}"
  fi

  cd "$REPO_ROOT"
  # shellcheck disable=SC2086
  bun build "$SCRIPT_DIR/bun/entry.js" \
    --compile \
    $target_flag \
    --outfile "$out_file" \
    2>&1

  verify_exe "$out_file" "Bun${os_arch:+ ($os_arch)}"
}

# ============================================================
# Build: Deno
# ============================================================

build_deno() {
  local os_arch="$1"
  local out_dir="$BUILD_DIR/deno"
  mkdir -p "$out_dir"

  echo ""
  echo "=== Building Deno executable ==="

  # Auto-install Deno if missing
  if ! command -v deno &> /dev/null; then
    if [ -x "$HOME/.deno/bin/deno" ]; then
      export PATH="$HOME/.deno/bin:$PATH"
    else
      echo "Deno not found. Installing..."
      curl -fsSL https://deno.land/install.sh | sh 2>&1
      export PATH="$HOME/.deno/bin:$PATH"
    fi
  fi

  if ! command -v deno &> /dev/null; then
    report "SKIP" "Deno (installation failed)"
    return
  fi

  deno --version | head -1

  # Auto-detect CA cert for environments with custom certificates
  if [ -z "${DENO_CERT:-}" ]; then
    for ca in /etc/ssl/certs/ca-certificates.crt /etc/pki/tls/certs/ca-bundle.crt; do
      if [ -f "$ca" ]; then
        export DENO_CERT="$ca"
        break
      fi
    done
  fi

  local out_name
  out_name=$(exe_name "voxgig-apidef" "$os_arch")
  local out_file="$out_dir/$out_name"

  # Step 1: Bundle with esbuild (resolves all CommonJS requires)
  echo "Bundling with esbuild..."
  cd "$REPO_ROOT"
  npx esbuild "$REPO_ROOT/bin/voxgig-apidef" \
    --bundle \
    --platform=node \
    --target=esnext \
    --format=cjs \
    --outfile="$out_dir/deno-bundle.js" \
    --external:fsevents \
    2>&1

  # Step 2: Deno compile the bundle
  local target_flag=""
  if [ -n "$os_arch" ]; then
    # Map os-arch to deno target format
    local deno_target=""
    case "$os_arch" in
      linux-x64)     deno_target="x86_64-unknown-linux-gnu" ;;
      linux-arm64)   deno_target="aarch64-unknown-linux-gnu" ;;
      darwin-x64)    deno_target="x86_64-apple-darwin" ;;
      darwin-arm64)  deno_target="aarch64-apple-darwin" ;;
      windows-x64)   deno_target="x86_64-pc-windows-msvc" ;;
      *)
        report "FAIL" "Deno: unknown os-arch '$os_arch'"
        return
        ;;
    esac
    target_flag="--target $deno_target"
  fi

  echo "Compiling with Deno..."
  # shellcheck disable=SC2086
  deno compile \
    --no-check \
    --allow-read --allow-write --allow-env --allow-net --allow-sys \
    --unstable-detect-cjs \
    $target_flag \
    --output "$out_file" \
    "$out_dir/deno-bundle.js" \
    2>&1

  # Clean up intermediate bundle
  rm -f "$out_dir/deno-bundle.js"

  verify_exe "$out_file" "Deno${os_arch:+ ($os_arch)}"
}

# ============================================================
# Build: Node SEA
# ============================================================

build_node_sea() {
  local os_arch="$1"
  local out_dir="$BUILD_DIR/node-sea"
  mkdir -p "$out_dir"

  echo ""
  echo "=== Building Node SEA executable ==="

  if [ -n "$os_arch" ]; then
    report "SKIP" "Node SEA: cross-compilation not supported"
    return
  fi

  echo "node $(node --version)"

  local out_file="$out_dir/voxgig-apidef"

  # Step 1: Bundle with esbuild
  echo "Bundling with esbuild..."
  cd "$REPO_ROOT"
  npx esbuild "$REPO_ROOT/bin/voxgig-apidef" \
    --bundle \
    --platform=node \
    --target=node20 \
    --format=cjs \
    --outfile="$out_dir/sea-prep.js" \
    --external:fsevents \
    2>&1

  echo "Bundle size: $(wc -c < "$out_dir/sea-prep.js") bytes"

  # Step 2: Generate SEA blob
  echo "Generating SEA blob..."
  cat > "$out_dir/sea-config.json" << SEACONFIG
{
  "main": "$out_dir/sea-prep.js",
  "output": "$out_dir/sea-prep.blob",
  "disableExperimentalSEAWarning": true
}
SEACONFIG

  node --experimental-sea-config "$out_dir/sea-config.json" 2>&1

  # Step 3: Copy node binary and inject blob
  echo "Injecting into node binary..."
  cp "$(which node)" "$out_file"
  npx postject "$out_file" NODE_SEA_BLOB "$out_dir/sea-prep.blob" \
    --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
    2>&1

  # Clean up intermediate files
  rm -f "$out_dir/sea-prep.js" "$out_dir/sea-prep.blob" "$out_dir/sea-config.json"

  verify_exe "$out_file" "Node SEA"
}

# ============================================================
# Main
# ============================================================

if [ -z "$TARGET" ]; then
  usage
fi

mkdir -p "$BUILD_DIR"

case "$TARGET" in
  bun)
    build_bun "$OS_ARCH"
    ;;
  deno)
    build_deno "$OS_ARCH"
    ;;
  node-sea)
    build_node_sea "$OS_ARCH"
    ;;
  all)
    build_bun "$OS_ARCH"
    build_node_sea "$OS_ARCH"
    build_deno "$OS_ARCH"
    ;;
  *)
    echo "Unknown target: $TARGET"
    usage
    ;;
esac

echo ""
echo "============================================"
echo "=== BUILD RESULTS ==="
echo "============================================"
printf "  PASS: %d\n" "$PASS"
printf "  FAIL: %d\n" "$FAIL"
printf "  SKIP: %d\n" "$SKIP"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
