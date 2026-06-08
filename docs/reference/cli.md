# Reference: command-line tool

Installing the package provides a `voxgig-apidef` binary
([`bin/voxgig-apidef`](../../bin/voxgig-apidef)).

```sh
npx voxgig-apidef <name> [options]
# or, if installed globally:
voxgig-apidef <name> [options]
```

The first positional argument is the project **name**. The CLI is a thin
wrapper over the [library API](./api.md): it constructs an `ApiDef` instance
and runs a build against a project folder.

## Options

| flag | alias | type | default | meaning |
|------|-------|------|---------|---------|
| `--folder` | `-f` | string | the `<name>` argument | project folder root |
| `--def` | `-d` | string | `''` | path to the spec file (validated to exist) |
| `--watch` | `-w` | boolean | `false` | watch mode |
| `--debug` | `-g` | string | `'info'` | log level / debug output |
| `--help` | `-h` | boolean | — | print help and exit |
| `--version` | `-v` | boolean | — | print version and exit |

```sh
voxgig-apidef petstore --folder ./petstore --def ./def/petstore.yml --debug debug
```

The CLI expects the project folder to contain a `model/` directory with an
`api.jsonic` entry model; it writes generated model files back into the
project folder.

> **Note.** The library interface (`ApiDef.makeBuild` / `apidef.generate`,
> see [the API reference](./api.md)) is the primary, fully-exercised way to
> drive apidef and is what the test suite and downstream Voxgig tooling use.
> Prefer it for programmatic and CI use; reach for the CLI for quick one-off
> runs against an existing project layout.

## Standalone executables

[`cmd/`](../../cmd/) contains packaging scripts that bundle the CLI into a
single self-contained executable via Node SEA, Deno, or Bun. See
[`cmd/README.md`](../../cmd/README.md) and `cmd/RESULTS.md` for the approaches
and their trade-offs.
