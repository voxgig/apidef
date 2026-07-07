# How to use apidef as a library

> **Prerequisites.** Before any of these calls succeed, the project needs
> (1) a guide entry file at `<folder>/guide/<outprefix>guide.jsonic` and
> (2) a spec that declares `servers[0].url`. The guide file is two lines:
> `@"@voxgig/apidef/model/guide.aontu"` then
> `@"<outprefix>base-guide.jsonic"`. See
> [Configuration → The guide file](../reference/configuration.md#the-guide-file).
> Every example below assumes this is in place.

## Generate and write model files

The high-level entry point is `ApiDef.makeBuild`, which returns a build
function:

```js
const { ApiDef } = require('@voxgig/apidef')

const build = await ApiDef.makeBuild({
  folder: '/proj/model',     // output directory
  outprefix: 'petstore-',    // generated-file prefix
})

const result = await build(
  { name: 'petstore', def: 'petstore.yml' },          // model
  { spec: { base: '/proj/model' } },                   // build (def read from base/../def/)
  {},                                                  // ctx (reserved)
)

if (!result.ok) throw result.err
```

The spec file is read from `<base>/../def/<def>` — here `/proj/def/petstore.yml`
— and files are written under `folder`. See
[Configuration](../reference/configuration.md) for the path rule.

## Get the model without writing files

Disable the `generate` step to build the in-memory model and skip disk output:

```js
const result = await build(
  { name: 'petstore', def: 'petstore.yml' },
  { spec: {
      base: '/proj/model',
      buildargs: { apidef: { ctrl: { step: { generate: false } } } },
  } },
  {},
)

const entities = result.apimodel.main.kit.entity
const flows    = result.apimodel.main.kit.flow
```

## Use the lower-level `generate` directly

If you are not inside the Voxgig build pipeline, call `generate` yourself:

```js
const apidef = ApiDef({ folder: '/proj/model', outprefix: 'petstore-' })

const result = await apidef.generate({
  model: { name: 'petstore', def: 'petstore.yml' },
  build: { spec: { base: '/proj/model' } },
  ctrl:  { step: { parse: true, guide: true, transformers: true, builders: true, generate: true } },
})
```

## Just parse a spec

To parse and `$ref`-resolve a spec without the rest of the pipeline:

```js
const { parse } = require('@voxgig/apidef')

const def = await parse('OpenAPI', specText, { file: 'petstore.yml' })
// def.paths, def.components, … with every $ref inlined and x-ref recorded
```

## Use a virtual filesystem (tests)

Every disk touch goes through `options.fs`. Pass an in-memory implementation
(e.g. `memfs`) to run hermetically:

```js
const { fs: vol } = require('memfs')
const build = await ApiDef.makeBuild({ folder: '/v/model', fs: vol })
```

## Inspecting the result

`result.steps` tells you how far the pipeline ran; `result.apimodel`,
`result.guide`, and `result.jres` hold the model, classification, and the list
of written/merged files respectively. See the
[API reference](../reference/api.md#apidefresult).
