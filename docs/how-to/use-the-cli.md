# How to use the command-line tool

Installing the package provides the `voxgig-apidef` binary. It is a thin
wrapper over the library against a project folder.

## Basic run

```sh
npx voxgig-apidef petstore \
  --folder ./petstore \
  --def ./petstore/def/petstore.yml \
  --debug info
```

- The positional argument (`petstore`) is the project **name**.
- `--folder` (`-f`) is the project root; if omitted it defaults to the name.
- `--def` (`-d`) points at the spec file (it is checked to exist).
- `--debug` (`-g`) sets the log level (`info`, `debug`, …).

## Version and help

```sh
voxgig-apidef --version    # prints the package version
voxgig-apidef --help       # prints usage
```

## Project layout

The CLI expects the project folder to contain a `model/` directory it can use
as the build base, and writes generated model files back into the project. For
anything beyond a quick run — CI, custom output locations, in-memory builds —
use the [library API](../reference/api.md), which is the primary interface and
gives you full control over inputs, control flags, and the returned model.

## Standalone binaries

To ship apidef as a single self-contained executable (no Node install
required), see the packaging scripts under [`cmd/`](../../cmd/) for Node SEA,
Deno, and Bun, with results in `cmd/RESULTS.md`.

For the full flag list see the [CLI reference](../reference/cli.md).
