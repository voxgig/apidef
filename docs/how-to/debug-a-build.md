# How to debug a build

apidef is built to fail *soft*: instead of aborting on a surprising spec, it
records a warning and produces the best model it can. These are the levers for
seeing what happened.

## Check how far it got

`result.steps` lists the stages that ran. If it stops short of
`['parse','guide','transformers','builders','generate']`, the last entry tells
you where things ended.

```js
const result = await build(model, buildSpec, {})
console.log(result.ok, result.steps)
if (!result.ok) console.error(result.err)
```

## Read the warnings

Non-fatal issues are collected during the run and, if any occurred, written to
**`apidef-warnings.txt`** in the working directory. A build that produced
warnings is reported as a *partial* build in the logs. The same list is the
`warn.history` on `result.ctx`.

```js
const warnings = result.ctx?.warn?.history ?? []
```

## Turn on debug output

Pass `debug` (a level string, or `true`):

```js
const build = await ApiDef.makeBuild({ folder, debug: 'debug' })
```

With `debug` truthy, apidef also writes the fully-parsed, `$ref`-resolved spec
next to your source file as **`<def>.full.json`**. This is the single most
useful artifact when a `$ref` isn't resolving or a schema isn't what you
expect — diff it against your spec.

## See *why* a path was classified the way it was

Every classification carries a `why_*` trace. Inspect the guide directly:

```js
const result = await build(
  model,
  { spec: { ...spec, buildargs: { apidef: { ctrl: { step: { transformers: false } } } } } },
  {},
)
const planet = result.guide.entity.planet
console.dir(planet, { depth: null })   // why_path, op.*.why_op, rename, action
```

`result.guide` requires the guide entry file to be present (the guide stage
reads it). Even when that file is missing — so the guide stage errors and
`result.guide` is empty — apidef still writes the raw heuristic classification
to `<prefix>base-guide.jsonic` first, so you can always open that file to read
the `why_*` traces and the entity/op assignments directly.

## Common symptoms

| symptom | likely cause | where to look |
|---------|-------------|---------------|
| `Unsupported` thrown at parse | no `openapi`/`swagger` field | the spec's top-level keys |
| `ENOENT … <prefix>guide.jsonic` | missing guide entry file | create it — [the guide file](../reference/configuration.md#the-guide-file) |
| `no server URL found` | spec has no `servers[0].url` | add a `servers:` entry to the spec |
| `source not found: @voxgig/apidef/model/...` | package not resolvable from the guide file | install `@voxgig/apidef` in the project |
| `PATH MISMATCH` | a path/method wasn't classified | `<prefix>base-guide.jsonic`, the `why_*` traces |
| wrong entity name | irregular plural | [custom plurals](./customize-entity-naming.md) |
| `$ref` value missing | bad pointer | `<def>.full.json` |
| missing fields | schema shape not recognized | the response/request schema in `<def>.full.json` |

## Structured logs

apidef logs through `pino`. Pass your own logger via `options.pino` (or
`build.log`) to route or capture log events; otherwise a pretty logger prints
to stdout at the `debug` level you set.
