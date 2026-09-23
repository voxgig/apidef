# Reference: command-line tool

Installing the package provides a `voxgig-apidef` binary
([`ts/bin/voxgig-apidef`](../../ts/bin/voxgig-apidef), a shim over
[`ts/src/cli.ts`](../../ts/src/cli.ts)).

```sh
npx voxgig-apidef <name> [options]
# or, if installed globally:
voxgig-apidef <name> [options]
```

The first positional argument is the project **name**, and the only
positional argument: a second one is refused with the usage text rather than
ignored. The CLI is a thin wrapper over the [library API](./api.md): it calls
`ApiDef.makeBuild` against a project folder and runs one build.

## Options

| flag | alias | type | default | meaning |
|------|-------|------|---------|---------|
| `--folder` | `-f` | string | the `<name>` argument | project folder root |
| `--def` | `-d` | string | — | path to the spec file (required, and checked to exist) |
| `--prefix` | `-p` | string | `<name>-` | filename prefix for generated files (the library's `outprefix`) |
| `--watch` | `-w` | boolean | `false` | rebuild whenever the spec file changes |
| `--debug` | `-g` | string | — | log level (`debug`, `info`, `warn`, `error`); when given, also writes `<def>.full.json` beside the spec |
| `--help` | `-h` | boolean | — | print usage and exit |
| `--version` | `-v` | boolean | — | print the package version and exit |

```sh
voxgig-apidef petstore --folder ./petstore --def ./petstore/def/petstore.yml --debug debug
```

The exit status is `0` for a build that reached the end and `1` otherwise, so
a script can gate on it. The one-line summary of a successful run goes to
standard output; a failed build and every error go to standard error.

## Project layout

The flags map onto the library's inputs like this:

| library input | value |
|---|---|
| `folder` (the output folder) | `<folder>/model` |
| `build.spec.base` | `<folder>/model` |
| `outprefix` | `--prefix`, or `<name>-` |
| `model.def` | `--def`, named relative to `<folder>/def` |

The conventional layout is therefore the one the
[tutorial](../tutorial/getting-started.md) builds:

```
petstore/
  def/petstore.yml               # --def
  model/
    guide/petstore-guide.aontu     # the guide entry file, written once by you
```

The guide entry file must exist before the first run, at
`<folder>/model/guide/<prefix>guide.aontu` (see
[Configuration → The guide file](./configuration.md#the-guide-file)). The CLI
refuses to start without it and prints the two lines to put in it. A guide
file from before the `.aontu` rename (`<prefix>guide.aon`) is accepted and
migrated in place on the first run. The spec file can live anywhere, because
the CLI names it relative to `<folder>/def`, which is where the library's
`<base>/../def/<model.def>` rule looks. Generated files are written under
`<folder>/model`. This layout is pinned by
[`ts/test/cli.test.ts`](../../ts/test/cli.test.ts).

> **Note.** The library interface (`ApiDef.makeBuild` / `apidef.generate`,
> see [the API reference](./api.md)) is the primary, fully-exercised way to
> drive apidef and is what the test suite and downstream Voxgig tooling use.
> Prefer it for programmatic and CI use; reach for the CLI for quick one-off
> runs against an existing project layout.

## Standalone executables

[`ts/cmd/`](../../ts/cmd/) contains packaging scripts that bundle the CLI into a
single self-contained executable via Node SEA, Deno, or Bun. See
[`ts/cmd/README.md`](../../ts/cmd/README.md) and `ts/cmd/RESULTS.md` for the
approaches and their trade-offs.
