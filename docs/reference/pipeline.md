# Reference: pipeline stages

The pipeline is driven from [`ts/src/apidef.ts`](../../ts/src/apidef.ts). It
has five gated stages; the third stage (`transformers`) is itself nine ordered
passes. Each stage reads and enriches the shared `ctx`.

## Stage 1 — `parse`

Source: [`ts/src/parse.ts`](../../ts/src/parse.ts).

- Load the spec text from `<base>/../def/<model.def>`.
- Reject empty/comment-only source.
- Parse YAML or JSON via `jsonic` / `@jsonic/yaml`.
- Require `openapi` or `swagger` to be present, else throw `Unsupported`.
- Ensure `components` exists.
- Walk the tree: resolve every `$ref` JSON pointer **in place**, recording the
  original pointer as `x-ref`. Repeated refs to one component share that
  component's nested children — the inlined schema must be treated as
  read-only downstream.

Output: `ctx.def`. With `debug` enabled, also writes `<def>.full.json`.

## Stage 2 — `guide`

Source: [`ts/src/guide/guide.ts`](../../ts/src/guide/guide.ts),
[`ts/src/guide/heuristic01.ts`](../../ts/src/guide/heuristic01.ts).

Classify `def.paths` into entities, operations, actions, and parameter
renames, recording `why_*` traces. This stage:

1. runs the heuristic and writes `<outprefix>base-guide.jsonic` (the raw
   classification), validating that every source path/method is accounted for
   (a mismatch is a `PATH MISMATCH` error);
2. reads the guide entry file `<folder>/guide/<outprefix>guide.jsonic` (which
   you author — it `@`-includes the base-guide plus the guide schema) and
   resolves it with `aontu`.

Because step 1 writes the base-guide before step 2 reads it, a cold start
works in one pass provided the guide entry file exists. Output: `ctx.guide`
(the resolved guide — see [the guide model](./guide.md)). See
[Configuration → The guide file](./configuration.md#the-guide-file).

## Stage 3 — `transformers`

Nine passes run in this fixed order; each is a file under
[`ts/src/transform/`](../../ts/src/transform/):

| # | pass | builds |
|---|------|--------|
| 1 | `top` | `kit.info` — title, version, and `servers[]` (URL schemes normalized to `https://` when missing) |
| 2 | `entity` | `kit.entity[name]` skeletons; ancestor relations; the source path list (`paths$`) |
| 3 | `operation` | each entity's `op` map (`load`/`list`/`create`/`update`/`remove`/`patch`) and its `points[]`, carrying the guide's `transform` |
| 4 | `args` | each point's `args.params[]` from path parameters (`name`, `orig`, `reqd`, `type`) |
| 5 | `select` | each point's `select` — `exist[]` identifiers and `$action` markers |
| 6 | `field` | each entity's `fields[]` from request/response schemas, with inferred types and per-op `req` overrides |
| 7 | `flow` | basic CRUD `flow` definitions per entity |
| 8 | `flowstep` | the ordered `step[]` of each flow |
| 9 | `clean` | prune inactive nodes and finalize the model |

Output: `ctx.apimodel` (see [the internal API model](./model.md)).

## Stage 4 — `builders`

Source: [`ts/src/builder/entity.ts`](../../ts/src/builder/entity.ts),
[`ts/src/builder/flow.ts`](../../ts/src/builder/flow.ts).

Render the apimodel to in-memory `jsonic` file descriptors: an **entity
builder** (entity files + an index barrel + `api-info`) and a **flow builder**.
Nothing is written yet.

## Stage 5 — `generate`

Hand the descriptors to `jostraca.generate`, which writes files under
`options.folder` using **merge-on-write** (`existing: { txt: { merge: true } }`)
so hand edits survive regeneration. Warnings collected during the run are
written to `apidef-warnings.txt`, and `result.reload` reports whether anything
changed on disk.

## Stopping early

Set the corresponding `ctrl.step.*` flag to `false` to stop after the previous
stage — see [Configuration](./configuration.md#control-flags-ctrlstep) and
[Run only part of the pipeline](../how-to/control-the-pipeline.md).
