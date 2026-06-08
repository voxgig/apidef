# AGENTS.md — agent guide for `@voxgig/apidef`

Context for AI coding agents working **on** this repo or using apidef **as a
tool**. Human-readable docs are in [`docs/`](./docs/README.md); this file is
the orientation layer.

## What this tool does

apidef compiles an OpenAPI 3 / Swagger 2.0 spec into an internal **API model**
— entities, operations, fields, and flows — that downstream tooling (`sdkgen`)
turns into client SDKs. It *infers* structure OpenAPI leaves implicit: which
paths form a resource, which methods are CRUD, how params map to identifiers.

Pipeline: `parse → guide → transform×9 → builder → generate`. Entry point:
[`ts/src/apidef.ts`](./ts/src/apidef.ts).

## ⚠️ The one rule that matters most

**TypeScript (`ts/`) is the canonical implementation. Go (`go/`) is a parity
port that must reproduce it exactly.** When changing behavior:

1. Change `ts/src/...` first; add/extend a test.
2. Update shared fixtures `ts/test/*.tsv` if a pure function changed (run by
   both languages).
3. Mirror the change into `go/...`, guided by the `// Mirrors src/...`
   comments; keep those comments accurate.
4. Rebuild and commit `ts/dist` + `ts/dist-test` (committed artifacts).
5. `make all` must be green.

Never make Go diverge from TS. If Go looks more correct, fix TS first.

## Commands

```sh
npm run build      # tsc --build ts/src ts/test  ->  ts/dist, ts/dist-test
npm test           # node --test ts/dist-test/**/*.test.js   (canonical suite)
TEST_PATTERN=foo npm run test-some   # run a subset
cd go && go test ./...               # the Go parity suite
make all           # TS build+test AND Go build+test  (run before declaring done)
```

Node 24+ (the `shape` peer dep wants it). `go/validate_test.go` golden tests
read an external `../../apidef-validate` checkout and `t.Skip` without it.

## Repository map

```
ts/src/        canonical source
  apidef.ts      pipeline entry (ApiDef, makeBuild, generate)
  parse.ts       parse + $ref resolution
  guide/         heuristic path→entity/op classification
  transform/     9 ordered passes: top,entity,operation,args,select,field,flow,flowstep,clean
  builder/       render model -> jsonic files
  utility.ts     pure helpers (depluralize, canonize, validator, formatJSONIC, …)
  types|model|desc|def.ts   shapes & types
ts/test/       *.test.ts, shared *.tsv fixtures, solar/petstore/taxonomy specs, model-ref/ goldens
ts/dist*/      built JS (committed, published)
go/            Go parity port (flat package) + *_test.go
model/         jsonic model templates
bin/           voxgig-apidef CLI
docs/          full documentation (tutorial / how-to / reference / explanation)
```

## Using apidef as a tool

```js
const { ApiDef } = require('@voxgig/apidef')
const build = await ApiDef.makeBuild({ folder: '/proj/model', outprefix: 'petstore-' })
const result = await build(
  { name: 'petstore', def: 'petstore.yml' },   // model
  { spec: { base: '/proj/model' } },            // build
  {},
)
result.apimodel.main.kit.entity   // { pet: { op, fields, id, relations, … } }
```

- **Prerequisites:** the spec must declare `servers[0].url`, and a guide entry
  file must exist at `<folder>/guide/<outprefix>guide.jsonic` (two `@`-includes:
  `@voxgig/apidef/model/guide.jsonic` and `<outprefix>base-guide.jsonic`). See
  [Configuration → The guide file](./docs/reference/configuration.md#the-guide-file).
- **Spec file path rule:** the spec is read from `<build.spec.base>/../def/<model.def>`,
  **not** verbatim. Output goes to `options.folder`.
- **Stop early:** set `ctrl.step.{parse,guide,transformers,builders,generate}`
  to `false` to halt after the previous stage (e.g. `generate:false` builds the
  model in memory without writing files).
- **Override naming:** `model.main.custom.plurals = { axes: 'axe' }` fixes
  mis-singularized entity names.
- Reference: [API](./docs/reference/api.md), [Configuration](./docs/reference/configuration.md),
  [Model](./docs/reference/model.md).

## Conventions & gotchas

- **Commit `ts/dist` and `ts/dist-test`** whenever `ts/src` or `ts/test`
  changes (`npm run build` regenerates them).
- **Validator tokens, not OpenAPI types:** field/arg `type` is `` `$STRING` ``,
  `` `$NUMBER` ``, `` `$BOOLEAN` ``, `` `$ANY` ``, … not `"string"`.
- **`$ref` inlining shares structure:** resolved refs share nested children;
  treat inlined schemas as read-only (mutating one leaks to every reference).
- **Determinism in Go:** map iteration is sorted (`sortedKeys`) to match
  JS insertion order; preserve this when porting.
- **Fixtures are LF:** `*.tsv`/`*.jsonic` are forced to LF (`.gitattributes`).
- **Soft failure:** the pipeline records warnings (`apidef-warnings.txt`)
  rather than aborting; `result.ok`/`result.steps` report how far it got.
- Commit messages: clear and descriptive; do not include model/tool identifiers.

## Where to read more

- New to the tool? [docs/tutorial/getting-started.md](./docs/tutorial/getting-started.md)
- Changing the code? [docs/how-to/work-on-the-codebase.md](./docs/how-to/work-on-the-codebase.md)
- Why it's built this way? [docs/explanation/](./docs/explanation/architecture.md)
- Machine index: [llms.txt](./llms.txt)
