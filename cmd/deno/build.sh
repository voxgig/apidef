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

# Deno needs an entry point that uses npm: specifiers or a local file.
# We create a thin wrapper that imports from the npm package structure.
echo ""
echo "=== Creating Deno-compatible entry point ==="

cat > "$BUILD_DIR/entry.ts" << 'ENTRY'
// Deno-compatible entry point for voxgig-apidef CLI
// This wraps the existing CommonJS CLI to work with Deno's module system.

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

// Point require to the repo root so it can find node_modules
const Path = require("node:path");
const { statSync } = require("node:fs");
const { parseArgs } = require("node:util");

const { Gubu, Fault, One } = require("gubu");
const Pkg = require("../../package.json");
const { ApiDef } = require("../../dist/apidef.js");

let CONSOLE = console;

run();

async function run() {
  try {
    let options = resolveOptions();

    if (options.version) {
      version();
    }

    if (options.help) {
      help();
    }

    if (options.version || options.help) {
      exit();
    }

    options = validateOptions(options);
    await generate(options);
  } catch (err) {
    handleError(err);
  }
}

function exit(err?: Error) {
  let code = 0;
  if (err) {
    code = 1;
  }
  Deno.exit(code);
}

async function generate(options: any) {
  const apidef = new ApiDef({
    debug: options.debug,
  });

  const spec = {
    def: options.def,
    kind: "openapi-3",
    model: Path.join(options.folder, "model/api.jsonic"),
    meta: { name: options.name },
  };

  if (options.watch) {
    await apidef.watch(spec);
  } else {
    await apidef.generate(spec);
  }
}

function resolveOptions() {
  const args = parseArgs({
    allowPositionals: true,
    options: {
      folder: { type: "string" as const, short: "f", default: "" },
      def: { type: "string" as const, short: "d", default: "" },
      watch: { type: "boolean" as const, short: "w" },
      debug: { type: "string" as const, short: "g", default: "info" },
      help: { type: "boolean" as const, short: "h" },
      version: { type: "boolean" as const, short: "v" },
    },
  });

  const options = {
    name: args.positionals[0],
    folder: "" === args.values.folder ? args.positionals[0] : args.values.folder,
    def: args.values.def,
    watch: !!args.values.watch,
    debug: args.values.debug,
    help: !!args.values.help,
    version: !!args.values.version,
  };

  return options;
}

function validateOptions(rawOptions: any) {
  const optShape = Gubu({
    name: Fault("The first argument should be the project name.", String),
    folder: String,
    def: "",
    watch: Boolean,
    debug: One(String, Boolean),
    help: Boolean,
    version: Boolean,
  });

  const err: any[] = [];
  const options = optShape(rawOptions, { err });

  if (err[0]) {
    throw new Error(err[0].text);
  }

  if ("" !== options.def) {
    options.def = Path.resolve(options.def);
    const stat = statSync(options.def, { throwIfNoEntry: false });
    if (null == stat) {
      throw new Error("Definition file not found: " + options.def);
    }
  }

  return options;
}

async function handleError(err: Error) {
  CONSOLE.log("Voxgig API Definition Error:");
  CONSOLE.log(err);
  exit(err);
}

function version() {
  CONSOLE.log(Pkg.version);
}

function help() {
  const s = "TODO";
  CONSOLE.log(s);
}
ENTRY

echo ""
echo "=== Attempting Deno compile ==="
cd "$REPO_ROOT"
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
  --allow-sys \
  --node-modules-dir=auto \
  --output "$BUILD_DIR/voxgig-apidef" \
  "$BUILD_DIR/entry.ts" \
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
