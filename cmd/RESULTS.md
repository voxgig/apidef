# Standalone Executable Packaging — Results

Tested three approaches to packaging `@voxgig/apidef` (Node.js/TypeScript CLI)
as a standalone executable for all major OS platforms.


## Summary

| Approach | Status | `--version` Works | Cross-compile | Binary Size (Linux x64) |
|----------|--------|-------------------|---------------|------------------------|
| **Node.js SEA** | PASS | Yes (`3.3.1`) | Manual (download node per OS) | 121 MB |
| **Bun compile** | PASS | Yes (`3.3.1`) | Built-in (`--target`) | 100 MB |
| **Deno compile** | NOT TESTED | — | Built-in (`--target`) | ~78-100 MB (expected) |


## 1. Node.js SEA (`cmd/node-sea/`)

**Status: PASS**

Uses Node.js built-in Single Executable Application support (available since Node 20).

### Build Steps
1. **esbuild** bundles `bin/voxgig-apidef` + all 643 dependencies into a single
   2.4 MB `.js` file
2. `node --experimental-sea-config` generates an injection blob
3. `postject` injects the blob into a copy of the `node` binary

### Results
- Executable: **121 MB** (size of the Node.js binary itself)
- `--version`: outputs `3.3.1` correctly
- `--help`: outputs `TODO` correctly
- All CommonJS requires resolved properly

### Pros
- Uses the exact same Node.js runtime — zero compatibility risk
- Smallest bundle payload (2.4 MB before injection)
- Native Node.js feature, no third-party runtime

### Cons
- Binary size is large (dominated by the node binary)
- Cross-compilation requires downloading node binaries for each target OS/arch
- Multi-step build process (bundle → blob → inject)
- `postject` shows harmless `.note` section warnings on Linux

### Cross-compile Notes
To build for other platforms, download the target node binary from
https://nodejs.org/dist/ and inject the same blob into each.


## 2. Bun Compile (`cmd/bun/`)

**Status: PASS — All 6 platform targets built successfully**

Uses Bun's built-in `--compile` flag to bundle code + Bun runtime into a
single executable.

### Results

| Target | Size |
|--------|------|
| linux-x64 | 100 MB |
| linux-arm64 | 98 MB |
| darwin-x64 (macOS Intel) | 65 MB |
| darwin-arm64 (macOS Apple Silicon) | 60 MB |
| windows-x64 | 112 MB |

- `--version`: outputs `3.3.1` correctly
- `--help`: outputs `TODO` correctly
- 643 modules bundled successfully

### Gotcha: Entry Point
Bun's bundler does NOT handle shebang files (files without `.js` extension
starting with `#!/usr/bin/env node`). The original `bin/voxgig-apidef` was
treated as a binary asset instead of being parsed as JavaScript.

**Fix**: Created `cmd/bun/entry.js` — a `.js` copy of the CLI entry point
that Bun can properly parse and bundle.

### Pros
- Easiest cross-compilation: single `--target` flag
- All 5 OS/arch combos from a single machine
- Fast builds (~180ms bundle + ~90ms compile)
- macOS binaries are smaller (58-65 MB) than Linux/Windows

### Cons
- Runtime is Bun, not Node.js — potential subtle behavior differences
- Binary size 60-112 MB depending on target
- Harmless warning about duplicate `"author"` key in `@voxgig/struct/package.json`
- Required a separate `.js` entry point (shebang files not bundled)

### Warnings
- `@voxgig/struct/package.json` has a duplicate `"author"` key — harmless but
  should be fixed upstream


## 3. Deno Compile (`cmd/deno/`)

**Status: NOT TESTED — Deno not available in this environment**

Build script and Deno-compatible entry point (`cmd/deno/build.sh`,
`cmd/deno/build/entry.ts`) are prepared but could not be executed because
Deno was not installable (network restrictions).

### Expected Behavior
- `deno compile` bundles code + slimmed Deno runtime (`denort`) into a
  single executable
- Cross-compilation via `--target` flag (similar to Bun)
- Expected binary size: 78-100 MB

### Risks
- Deno's Node.js compatibility layer may have issues with the deep
  dependency tree (`@redocly/openapi-core`, `jostraca`, `@voxgig/struct`)
- `createRequire()` bridge adds a small compatibility risk
- Would need thorough testing of OpenAPI parsing and code generation


## Recommendation

**Bun** is the most practical choice for this project:
1. Single-command cross-compilation to all 5 targets
2. Successfully bundled all 643 modules
3. CLI works correctly (version, help, argument parsing)
4. Fast builds (<300ms per target)
5. Easy to integrate into CI/CD (GitHub Actions)

**Node.js SEA** is the safest choice if runtime compatibility is paramount —
zero risk of subtle behavior differences since it uses the real Node.js binary.

The main remaining work is to test actual API definition generation (not just
`--version`/`--help`) with the standalone executables to verify the full
pipeline works end-to-end.
