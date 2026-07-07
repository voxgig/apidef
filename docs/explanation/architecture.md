# Architecture overview

apidef is a **compiler**. Its source language is OpenAPI/Swagger; its target
is an internal *API model*; and like most compilers it works as a pipeline of
passes, each one enriching a shared data structure.

```
                         ┌─────────────────────────────────────────┐
  OpenAPI / Swagger ───▶ │  parse → guide → transform* → builder* → generate │ ───▶ model/*.aontu
   (YAML or JSON)        └─────────────────────────────────────────┘
                                          │
                                   in-memory apimodel
                                  (entities, ops, flows)
```

## The five stages

Each stage is gated by a control flag (`ctrl.step.*`) so a caller can stop
early — useful for tests and tooling. The stages, in order:

1. **parse** — Read the spec text, parse YAML or JSON into a plain object,
   validate it is OpenAPI/Swagger, and resolve every `$ref` in place
   (recording the original pointer as `x-ref`). Output: `ctx.def`.

2. **guide** — The heuristic heart. Walk `def.paths`, decide which paths
   belong to which **entity**, classify each method as a CRUD **operation** or
   an **action**, and work out parameter **renames** (e.g. `{pet_id}` → `id`).
   Every decision is recorded with a `why_*` trace. Output: `ctx.guide`, and a
   human-editable `base-guide.aontu`.

3. **transform** — Nine ordered passes turn the guide plus the parsed spec
   into the concrete model: `top` (info/servers), `entity`, `operation`,
   `args`, `select`, `field`, `flow`, `flowstep`, `clean`. Output:
   `ctx.apimodel`.

4. **builder** — Render the apimodel to `jsonic` model source: an entity
   builder and a flow builder produce in-memory file descriptors.

5. **generate** — Hand the file descriptors to [`jostraca`](https://github.com/voxgig/jostraca),
   which writes (and three-way merges) the files to disk.

The stages are described field-by-field in [Pipeline stages](../reference/pipeline.md).

## The context object

A single mutable `ctx` (the `ApiDefContext`) threads through every stage. The
important slots:

| slot | written by | holds |
|------|-----------|-------|
| `def` | parse | the parsed, `$ref`-resolved spec |
| `guide` | guide | the classification result |
| `apimodel` | transforms | the model being built (`main.kit.{info,entity,flow}`) |
| `model` | caller | the input model (`name`, `def`, `main.custom`, …) |
| `warn` | all | a warning collector; non-fatal issues are logged and written to `apidef-warnings.txt` |

## External building blocks

apidef leans on the wider Voxgig toolchain rather than reinventing it:

- **[`jsonic`](https://github.com/jsonicjs/jsonic)** / **`@jsonic/yaml`** — parse
  the spec (JSON *and* YAML) and emit the relaxed-JSON model files.
- **[`jostraca`](https://github.com/voxgig/jostraca)** — the file generator. It
  owns `each`/`getx` iteration helpers, the `Project`/`Folder`/`File`/`Content`
  builder DSL, and the merge-on-write behavior that preserves hand edits.
- **[`aontu`](https://github.com/voxgig/aontu)** — a unification engine used by
  downstream model resolution (apidef writes the model; aontu assembles it).
- **`shape`** — lightweight structural validation of options and model inputs.
- **`@voxgig/struct`** / **`@voxgig/util`** — shared data and logging utilities
  (`pino`-based structured logging).

## Two implementations

apidef ships **two** complete implementations of the pipeline:

- **`ts/`** — the canonical TypeScript implementation (this is the published
  npm package).
- **`go/`** — a Go port that reproduces the TypeScript behavior exactly.

They are kept byte-compatible through shared fixtures and golden tests. The
reasoning, and the rules for changing either side, are in
[The canonical build and the parity port](./canonical-and-parity.md).

## Repository map

```
model/     CANONICAL shared aontu model schemas (apidef.aontu, guide.aontu)
ts/        canonical TypeScript implementation + npm package (package.json)
  src/       source (parse, guide, transform/*, builder/*, utility, apidef)
  test/      tests + shared *.tsv fixtures + solar/petstore/taxonomy specs
  dist/      built JS + .d.ts (committed, published)
  model/     mirror of /model (published as @voxgig/apidef/model/*)
  bin/       the voxgig-apidef CLI entry point
  cmd/       standalone-executable packaging (node-sea / deno / bun)
go/        Go parity port (flat package) + *_test.go
  model/     mirror of /model (go:embed, package model)
docs/      this documentation
```

The shared aontu model is canonical at top-level `model/` and mirrored into
`ts/model/` and `go/model/` (each packaging system can only ship files under
its own root). Edit `model/`, then `make sync-model`.
