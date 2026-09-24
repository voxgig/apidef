# Reference: pipeline stages

The pipeline is driven from [`ts/src/apidef.ts`](../../ts/src/apidef.ts). It
has five gated stages; the third stage (`transformers`) is itself nine ordered
passes. Each stage reads and enriches the shared `ctx`.

## Stage 1 — `parse`

Source: [`ts/src/parse.ts`](../../ts/src/parse.ts).

- Load the spec text from `<base>/../def/<model.def>` as UTF-8. Each
  ill-formed byte sequence reads as one `U+FFFD` per maximal ill-formed
  subsequence (`ts/test/utf8-decode.tsv`).
- Reject empty/comment-only source.
- Parse YAML or JSON via `jsonic` / `@tabnas/yaml`.
- Replace each lone surrogate in a key or a string, such as an unpaired
  `\ud800` escape, with `U+FFFD`. Keys this makes equal merge as a repeated
  key does.
- Require `openapi` or `swagger` to be present, else throw `Unsupported`.
- Ensure `components` exists.
- Remove the quotes an explicit key keeps (`? "/a"`, `? '/a'`) from each
  `paths` key. A double-quoted key is decoded as a JSON string where it is
  one; a single-quoted key reads `''` as `'`. A key whose new spelling another
  key already has, or would also get, keeps its quotes
  (`ts/test/normalize-path-keys.tsv`).
- Walk the tree: resolve every `$ref` JSON pointer **in place**, recording the
  original pointer as `x-ref`. Repeated refs to one component share that
  component's nested children — the inlined schema must be treated as
  read-only downstream.
- Rewrite a colon path parameter to brace form, `/a/:id` to `/a/{id}`, where
  the path item or one of its operations declares `id` with `in: path`,
  directly or through a `$ref`. The rewrite runs after resolution, so a
  pointer names the path as the spec spells it. A rewrite onto a key another
  path already has, or would also get, is not made
  (`ts/test/colon-path-keys.tsv`).

A pointer resolves by these rules, pinned by `ts/test/parse-resolve.tsv`:

- A segment names an own key of an object, or an index of an array written as
  `0` or as digits with no leading zero, below the length. `~1` reads as `/`
  and `~0` as `~`.
- A node holding a `$ref` is followed wherever the pointer meets it: at its
  end, or on the way to a key below it. The node's other keywords win over
  its target's, so the answer does not depend on which references the walk
  has already replaced.
- A pointer that names no object leaves its `$ref` in place, with `x-ref`
  beside it. That covers a missing key, an index out of range, a string, a
  list, `null`, and a chain of references that leads back to itself.

Output: `ctx.def`. With `debug` enabled, also writes `<def>.full.json`.

## Stage 2 — `guide`

Source: [`ts/src/guide/guide.ts`](../../ts/src/guide/guide.ts),
[`ts/src/guide/heuristic01.ts`](../../ts/src/guide/heuristic01.ts).

Classify `def.paths` into entities, operations, actions, and parameter
renames, recording `why_*` traces. This stage:

1. runs the heuristic and writes `<outprefix>base-guide.aontu` (the raw
   classification, overwriting the previous one), validating that every source path/method is accounted for
   (a mismatch is a `PATH MISMATCH` error);
2. reads the guide entry file `<folder>/guide/<outprefix>guide.aontu` (which
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
| 3 | `operation` | each entity's `op` map (`load`/`list`/`create`/`update`/`remove`/`patch`) and its `points[]`, carrying the guide's transforms in `t` |
| 4 | `args` | each point's `g.params[]` from path parameters (`n`, `or`, `r`, `t`) |
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
`options.folder` and overwrites what an earlier run left there
(`existing: { txt: { write: true, merge: false } }`), so a hand edit to a
generated file does not survive the next run; corrections go in the guide
entry file. Warnings collected during the run are
written to `apidef-warnings.txt`, and `result.reload` reports whether anything
changed on disk.

`jostraca` also keeps its own record under `<folder>/.jostraca/`: a meta log of
the run and a baseline copy of each generated file. The Go port runs this stage
through the Go module of `jostraca` with the same options, and its result
carries `Reload` and `Jres`. Both ports lay out the same files and keep the
same `.jostraca/` record. What each file contains comes from the stages before
this one, so this stage alone does not make the two ports' files identical.

## Stopping early

Set the corresponding `ctrl.step.*` flag to `false` to stop after the previous
stage — see [Configuration](./configuration.md#control-flags-ctrlstep) and
[Run only part of the pipeline](../how-to/control-the-pipeline.md).
