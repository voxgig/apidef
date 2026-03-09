# cmd/ - Build & Test Scripts

Standalone executable build scripts for `voxgig-apidef`.

## build.sh

Unified build script to compile standalone executables for any supported target and platform.

```
cmd/build.sh <target> [os-arch]
```

### Targets

| Target     | Description                            |
|------------|----------------------------------------|
| `bun`      | Bun standalone executable              |
| `deno`     | Deno compiled executable               |
| `node-sea` | Node.js Single Executable Application  |
| `all`      | Build all three targets                |

### OS-Arch (optional)

Omit to build for the current platform. Cross-compilation is supported by `bun` and `deno` (`node-sea` only builds natively).

| OS-Arch        | Platform              |
|----------------|-----------------------|
| `linux-x64`    | Linux x86_64          |
| `linux-arm64`  | Linux aarch64         |
| `darwin-x64`   | macOS x86_64          |
| `darwin-arm64`  | macOS Apple Silicon   |
| `windows-x64`  | Windows x86_64        |

### Examples

```bash
cmd/build.sh bun                    # Bun, current platform
cmd/build.sh bun linux-arm64        # Bun cross-compile for Linux ARM
cmd/build.sh deno darwin-arm64      # Deno for macOS Apple Silicon
cmd/build.sh node-sea               # Node SEA, current platform only
cmd/build.sh all                    # All targets, current platform
```

### Output

Executables are written to `cmd/build/<target>/`:

```
cmd/build/bun/voxgig-apidef
cmd/build/deno/voxgig-apidef
cmd/build/node-sea/voxgig-apidef
```

Cross-compiled builds include the os-arch suffix, e.g. `voxgig-apidef-darwin-arm64`.

### Prerequisites

- **bun**: Bun >= 1.0
- **deno**: Deno >= 1.40 (auto-installed if missing)
- **node-sea**: Node.js >= 20, esbuild, postject (via npx)

## Per-target scripts

Each subdirectory also has its own standalone `build.sh`:

- `cmd/bun/build.sh` - Bun build with all cross-compilation targets
- `cmd/deno/build.sh` - Deno compile with npm specifier entry point
- `cmd/node-sea/build.sh` - Node SEA (esbuild bundle + blob injection)
- `cmd/test/build-and-test.sh` - Build and test all targets, comparing output against a reference Node.js run
