# How to use the command-line tool

Installing the package provides the `voxgig-apidef` binary. It is a thin
wrapper over the library, run against a project folder in the layout the
[tutorial](../tutorial/getting-started.md) sets up.

## Basic run

```sh
npx voxgig-apidef petstore \
  --folder ./petstore \
  --def ./petstore/def/petstore.yml
```

- The positional argument (`petstore`) is the project **name**, and the
  only positional the CLI takes; a second one is refused with the usage text.
- `--folder` (`-f`) is the project root; if omitted it defaults to the name.
- `--def` (`-d`) points at the spec file (required, and checked to exist).
- `--prefix` (`-p`) sets the filename prefix for generated files; it defaults
  to the name plus a hyphen (`petstore-`).
- `--debug` (`-g`) sets the log level (`debug`, `info`, `warn` or `error`);
  passing it at any level also writes the resolved spec beside the definition
  file as `<def>.full.json`.

A run that reaches the end prints one line naming the model folder and the
entities it found on standard output, and exits `0`. A build that fails prints
the stage it failed after on standard error, and exits `1`.

## Before the first run

The CLI writes into `<folder>/model` and needs the guide entry file there
before it starts, at `<folder>/model/guide/<prefix>guide.aontu`:

```jsonic
@"@voxgig/apidef/model/guide.aontu"
@"./petstore-base-guide.aontu"
```

Without it the CLI stops and prints these two lines for you to save. A
`<prefix>guide.aontu` file from an older project is accepted and renamed on
the first run. See
[the guide file](../reference/configuration.md#the-guide-file) for what goes
in it and how to override a classification there.

## Rebuild on change

`--watch` (`-w`) keeps the process running and rebuilds whenever the spec
file changes:

```sh
voxgig-apidef petstore -f ./petstore -d ./petstore/def/petstore.yml -w
```

## Version and help

```sh
voxgig-apidef --version    # prints the package version
voxgig-apidef --help       # prints usage
```

## Project layout

The CLI expects the project folder to hold `def/` for the spec and `model/`
for the guide entry file, and writes generated model files back under
`model/`. For anything beyond a quick run — CI, custom output locations,
in-memory builds — use the [library API](../reference/api.md), which is the
primary interface and gives you full control over inputs, control flags, and
the returned model.

## Standalone binaries

To ship apidef as a single self-contained executable (no Node install
required), see the packaging scripts under [`ts/cmd/`](../../ts/cmd/) for Node
SEA, Deno, and Bun, with results in `ts/cmd/RESULTS.md`.

For the full flag list see the [CLI reference](../reference/cli.md).
